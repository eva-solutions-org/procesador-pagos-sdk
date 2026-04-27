import type { EventoPago } from "../domain/index.js";

/**
 * Cloudflare Durable Object — `SSEHub` (REQ-PUBSUB-005, REQ-PUBSUB-006).
 *
 * Se exporta tal cual desde el SDK (`/hono/durable-objects`); el consumidor
 * lo re-exporta en su Worker y lo declara como binding en `wrangler.jsonc`.
 *
 * Funciones:
 * - `POST /publish` body `{ canal, mensaje }` → encola al buffer circular
 *   (FIFO capped 20 por canal, TTL 5 min) + reenvía a streams live.
 * - `GET /subscribe?canal=...&lastEventId=...` → stream NDJSON con replay
 *   opcional (si `lastEventId` está en buffer, replay; sino → directo a live).
 *
 * Buffer persiste en `state.storage` con keys `replay:{canal}:{eventId}`.
 * Cleanup oportunista por TTL al publicar.
 */

const BUFFER_MAX_POR_CANAL = 20;
const BUFFER_TTL_MS = 5 * 60 * 1000;

interface DurableObjectState {
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
    list<T = unknown>(options?: {
      prefix?: string;
    }): Promise<Map<string, T>>;
  };
}

interface EntradaBuffer {
  evento: EventoPago;
  insertadoEn: number;
}

interface SuscriptorLive {
  canal: string;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  encoder: TextEncoder;
}

/**
 * Serializa un evento al formato SSE estándar.
 *
 * Formato:
 *   id: <eventId>
 *   event: pago.actualizado
 *   data: <json del evento>
 *   <línea vacía>
 */
function serializarSSE(evento: EventoPago): string {
  return (
    `id: ${evento.eventId}\n` +
    `event: pago.actualizado\n` +
    `data: ${JSON.stringify(evento)}\n\n`
  );
}

/**
 * Serializa un evento al formato NDJSON (sub-protocolo interno entre
 * adapter-durable-objects y el DO). Cada evento ocupa una línea JSON.
 */
function serializarNDJSON(evento: EventoPago): string {
  return `${JSON.stringify(evento)}\n`;
}

export class SSEHub {
  private readonly state: DurableObjectState;
  // suscriptores live, agrupados por canal
  private readonly suscriptoresLive: Map<string, Set<SuscriptorLive>>;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.suscriptoresLive = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/publish")) {
      return this.handlePublish(request);
    }
    if (request.method === "GET" && url.pathname.endsWith("/subscribe")) {
      return this.handleSubscribe(request, url);
    }
    return new Response("Not Found", { status: 404 });
  }

  private async handlePublish(request: Request): Promise<Response> {
    let body: { canal?: string; evento?: EventoPago } | undefined;
    try {
      body = (await request.json()) as {
        canal?: string;
        evento?: EventoPago;
      };
    } catch {
      return new Response(JSON.stringify({ error: "JSON inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const canal = body?.canal;
    const evento = body?.evento;
    if (!canal || !evento) {
      return new Response(
        JSON.stringify({ error: "Falta canal o evento" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    await this.agregarABuffer(canal, evento);
    await this.broadcastLive(canal, evento);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleSubscribe(
    request: Request,
    url: URL,
  ): Promise<Response> {
    const canal = url.searchParams.get("canal");
    if (!canal) {
      return new Response(
        JSON.stringify({ error: "Falta query param canal", codigo: 400 }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const lastEventId =
      url.searchParams.get("lastEventId") ??
      request.headers.get("Last-Event-ID");

    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Replay si hay lastEventId con eventos posteriores en buffer.
    if (lastEventId) {
      const replay = await this.leerBufferDesde(canal, lastEventId);
      for (const e of replay) {
        try {
          await writer.write(encoder.encode(serializarNDJSON(e)));
        } catch {
          // writer cerrado mid-replay — abortar.
          return new Response(readable, {
            status: 200,
            headers: this.headersStream(),
          });
        }
      }
    }

    // Inscribir como suscriptor live.
    const sub: SuscriptorLive = { canal, writer, encoder };
    let set = this.suscriptoresLive.get(canal);
    if (!set) {
      set = new Set();
      this.suscriptoresLive.set(canal, set);
    }
    set.add(sub);

    // Cleanup en abort de la conexión cliente.
    request.signal.addEventListener("abort", () => {
      const actual = this.suscriptoresLive.get(canal);
      if (actual) {
        actual.delete(sub);
        if (actual.size === 0) this.suscriptoresLive.delete(canal);
      }
      writer.close().catch(() => {
        /* writer ya cerrado */
      });
    });

    return new Response(readable, {
      status: 200,
      headers: this.headersStream(),
    });
  }

  private headersStream(): Record<string, string> {
    return {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    };
  }

  private async agregarABuffer(
    canal: string,
    evento: EventoPago,
  ): Promise<void> {
    const ahora = Date.now();
    const prefix = `replay:${canal}:`;
    const entradas = await this.state.storage.list<EntradaBuffer>({
      prefix,
    });

    // Cleanup oportunista por TTL.
    const sobrevivientes: Array<[string, EntradaBuffer]> = [];
    for (const [key, valor] of entradas) {
      if (ahora - valor.insertadoEn > BUFFER_TTL_MS) {
        await this.state.storage.delete(key);
      } else {
        sobrevivientes.push([key, valor]);
      }
    }

    // Persistir nuevo evento.
    const nuevoKey = `${prefix}${evento.eventId}`;
    const nuevaEntrada: EntradaBuffer = { evento, insertadoEn: ahora };
    await this.state.storage.put(nuevoKey, nuevaEntrada);
    sobrevivientes.push([nuevoKey, nuevaEntrada]);

    // Aplicar cap FIFO (max 20). Evicta el más viejo.
    if (sobrevivientes.length > BUFFER_MAX_POR_CANAL) {
      sobrevivientes.sort((a, b) => a[1].insertadoEn - b[1].insertadoEn);
      const exceso = sobrevivientes.length - BUFFER_MAX_POR_CANAL;
      for (let i = 0; i < exceso; i += 1) {
        const par = sobrevivientes[i];
        if (par) {
          await this.state.storage.delete(par[0]);
        }
      }
    }
  }

  private async leerBufferDesde(
    canal: string,
    lastEventId: string,
  ): Promise<EventoPago[]> {
    const ahora = Date.now();
    const prefix = `replay:${canal}:`;
    const entradas = await this.state.storage.list<EntradaBuffer>({
      prefix,
    });

    const ordenadas: EntradaBuffer[] = [];
    for (const [, valor] of entradas) {
      if (ahora - valor.insertadoEn <= BUFFER_TTL_MS) {
        ordenadas.push(valor);
      }
    }
    ordenadas.sort((a, b) => a.insertadoEn - b.insertadoEn);

    // Caso "lastEventId encontrado": replay-ear posteriores (excluyendo el match).
    const idxMatch = ordenadas.findIndex(
      (e) => e.evento.eventId === lastEventId,
    );
    if (idxMatch >= 0) {
      return ordenadas.slice(idxMatch + 1).map((e) => e.evento);
    }

    // Caso "lastEventId NO encontrado" (evictado): replay TODO el buffer.
    return ordenadas.map((e) => e.evento);
  }

  private async broadcastLive(
    canal: string,
    evento: EventoPago,
  ): Promise<void> {
    const set = this.suscriptoresLive.get(canal);
    if (!set || set.size === 0) return;

    const payload = serializarNDJSON(evento);
    const muertos: SuscriptorLive[] = [];

    for (const sub of set) {
      try {
        await sub.writer.write(sub.encoder.encode(payload));
      } catch {
        muertos.push(sub);
      }
    }

    for (const m of muertos) {
      set.delete(m);
    }
    if (set.size === 0) this.suscriptoresLive.delete(canal);
  }
}

/**
 * Helper interno reutilizable para serializar al formato SSE estándar
 * (con `event:` y `id:`) — usado por handlers que envían directo al
 * cliente browser, no por el sub-protocolo NDJSON interno del DO.
 */
export { serializarSSE };
