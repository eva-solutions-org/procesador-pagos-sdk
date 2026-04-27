import type { EventoPago, PubSubAdapter } from "../../pubsub/index.js";
import { esEventoDuplicado } from "../infrastructure/dedup-eventos.js";
import {
  HEARTBEAT_DEFAULT_MS,
  clampHeartbeatMs,
} from "../infrastructure/heartbeat.js";
import { sanitizarCampoSSE } from "../infrastructure/sanitizar-sse.js";

/**
 * Mensaje SSE estándar (compatible con Hono `SSEStreamingApi.writeSSE`).
 */
export interface MensajeSSE {
  data: string;
  event?: string;
  id?: string;
  retry?: number;
}

/**
 * Stream SSE abstracto — interface mínima que satisface tanto el
 * `SSEStreamingApi` de Hono como mocks de tests.
 */
export interface StreamSSE {
  writeSSE(mensaje: MensajeSSE): Promise<void>;
  /**
   * Registra una callback que se invoca cuando el cliente aborta la
   * conexión. Hono garantiza que se invoca exactamente UNA vez.
   */
  onAbort(cb: () => void | Promise<void>): void;
  /** Indica si el stream ya fue cerrado/abortado. */
  readonly aborted?: boolean;
}

export interface OpcionesAbrirStream {
  /** ID del pago — usado para el canal `pagos:${pagoId}`. */
  pagoId: string;
  /** Adapter pub/sub configurado en `rutasPagos()`. */
  pubsub: PubSubAdapter;
  /** Snapshot inicial del pago (REQ-SSE-001). Si null, NO se emite snapshot. */
  snapshot?: EventoPago | null;
  /** Heartbeat custom — clamp [10s, 60s]. Default 30s. */
  heartbeatMs?: number;
}

/**
 * Orquesta la apertura de un stream SSE para un pago (REQ-SSE-001..006).
 *
 * Responsabilidades absorbidas (las 5 trampas SSE):
 * 1. Snapshot inicial ANTES de subscribe (REQ-SSE-001).
 * 2. Heartbeat cada N ms con `: keepalive\n\n` (REQ-SSE-002).
 *    Implementado vía `writeSSE({ data: '', event: 'keepalive' })` —
 *    el backend que use formato bare `: keepalive\n\n` puede pasar un
 *    `StreamSSE` custom que lo escriba.
 * 3. Subscribe al pubsub con dedup por eventId (REQ-SSE-005).
 * 4. Cada `writeSSE` incluye `id: <eventId>` y sanitiza vía
 *    `sanitizarCampoSSE` (FIX C1).
 * 5. **CRÍTICO (FIX I3)**: la función NO resuelve hasta que el cliente
 *    aborta la conexión — necesario para que la callback de
 *    `streamSSE` de Hono no resuelva antes del primer evento (issues
 *    Hono #2050, #2993).
 *
 * @param stream stream SSE compatible (típicamente `c.stream` de Hono).
 * @param opciones configuración del stream.
 */
export async function abrirStreamSSE(
  stream: StreamSSE,
  opciones: OpcionesAbrirStream,
): Promise<void> {
  const heartbeatMs = clampHeartbeatMs(opciones.heartbeatMs ?? HEARTBEAT_DEFAULT_MS);
  const canal = `pagos:${opciones.pagoId}`;

  // Snapshot inicial (si presente).
  if (opciones.snapshot) {
    const snap = opciones.snapshot;
    if (!esEventoDuplicado(snap.eventId)) {
      await stream.writeSSE({
        data: JSON.stringify(snap),
        event: sanitizarCampoSSE("snapshot"),
        id: sanitizarCampoSSE(snap.eventId),
      });
    }
  }

  // Heartbeat periódico (FIX I3 — clearInterval en onAbort).
  const heartbeatTimer = setInterval(() => {
    void stream
      .writeSSE({ data: "", event: "keepalive" })
      .catch(() => {
        /* writer cerrado — no escalar */
      });
  }, heartbeatMs);

  // Subscribe al pubsub.
  const unsubscribe = await opciones.pubsub.suscribir<EventoPago>(
    canal,
    async (evento) => {
      if (esEventoDuplicado(evento.eventId)) return;
      try {
        await stream.writeSSE({
          data: JSON.stringify(evento),
          event: sanitizarCampoSSE("pago.actualizado"),
          id: sanitizarCampoSSE(evento.eventId),
        });
      } catch {
        // writer cerrado mid-write — no escalar.
      }
    },
  );

  // CRÍTICO (FIX I3): bloqueamos hasta que el cliente aborte la conexión.
  // Sin este `await`, la callback de `streamSSE` de Hono resuelve antes
  // del primer evento y el stream se cierra prematuramente.
  await new Promise<void>((resolve) => {
    stream.onAbort(() => {
      clearInterval(heartbeatTimer);
      // unsubscribe es idempotente — `void` swallow del resultado.
      void Promise.resolve(unsubscribe()).catch(() => {
        /* ya cerrado */
      });
      resolve();
    });
  });
}
