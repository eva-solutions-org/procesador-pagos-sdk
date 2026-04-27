/**
 * Handler `GET /:id/eventos` (REQ-RUTAS-006 / REQ-SSE-001..006 / FIX I3 / ADR-019).
 *
 * Solo se invoca cuando `opciones.pubsub` está configurado (sino el factory
 * registra una función que devuelve 404).
 *
 * Detección DO especial:
 * - Si `pubsub` es `adapterDurableObjects`, NO usamos `pubsub.suscribir` (es
 *   placeholder). En su lugar abrimos `binding.idFromName(...).fetch(GET)` al
 *   stub del DO y pipeamos el stream NDJSON directamente al cliente como SSE.
 * - Para `adapterMemoria` y `adapterUpstash`, usamos `abrirStreamSSE` que
 *   hace subscribe via `pubsub.suscribir`.
 *
 * En ambos casos: setear HEADERS_SSE, enviar snapshot inicial via consultarPago,
 * y await onAbort para que el stream NO resuelva prematuramente (FIX I3).
 */

import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  HEADERS_SSE,
  abrirStreamSSE,
  esEventoDuplicado,
  sanitizarCampoSSE,
  HEARTBEAT_DEFAULT_MS,
  clampHeartbeatMs,
} from '../../sse-stream/index.js';
import {
  calcularEventId,
  esAdapterDurableObjects,
  type EventoPago,
  type PubSubAdapterDurableObjects,
} from '../../pubsub/index.js';
import type { AmbienteRutasPagos } from '../domain/contexto-rutas.js';
import type { Pago } from '../../pagos/index.js';

/**
 * Construye un `EventoPago` snapshot desde un `Pago` completo (22 campos).
 * Usado para emitir el evento inicial del stream (REQ-SSE-001).
 */
async function pagoASnapshot(pago: Pago): Promise<EventoPago> {
  const timestamp = pago.updatedAt;
  const eventId = await calcularEventId(pago.id, pago.estado, null, timestamp);
  return {
    eventId,
    pagoId: pago.id,
    referenciaExterna: pago.referenciaExterna,
    estado: pago.estado,
    estadoAnterior: null,
    monto: pago.montoOriginal,
    moneda: pago.monedaOriginal,
    pasarela: pago.pasarelaId,
    metadata: pago.metadata,
    timestamp,
  };
}

export async function handlerEventosSSE<Env extends object = object>(
  c: Context<AmbienteRutasPagos<Env>>,
): Promise<Response> {
  const opciones = c.get('opcionesPagos');
  const cliente = c.get('cliente');
  const pagoId = c.req.param('id');

  if (!pagoId) {
    return c.json({ error: 'pagoId requerido', codigo: 400 }, 400);
  }

  if (!opciones.pubsub) {
    return c.json({ error: 'SSE no habilitado', codigo: 404 }, 404);
  }

  // Auth
  if (opciones.verificarAcceso) {
    let permitido: boolean;
    try {
      permitido = await opciones.verificarAcceso(c, pagoId);
    } catch (err) {
      console.error('[procesador-pagos-sdk] verificarAcceso lanzó:', err);
      return c.json({ error: 'Error interno de autorización', codigo: 500 }, 500);
    }
    if (!permitido) {
      return c.json({ error: 'No autorizado', codigo: 401 }, 401);
    }
  }

  // Snapshot inicial (consultarPago — best-effort).
  let snapshot: EventoPago | null = null;
  const consultaInicial = await cliente.pagos.consultarPago({ id: pagoId });
  if (consultaInicial.success) {
    try {
      snapshot = await pagoASnapshot(consultaInicial.data);
    } catch (err) {
      console.error('[procesador-pagos-sdk] error al construir snapshot inicial:', err);
      snapshot = null;
    }
  }

  // Caso especial DO: pipe NDJSON del stub al stream SSE.
  if (esAdapterDurableObjects(opciones.pubsub)) {
    return manejarStreamDurableObjects(c, opciones.pubsub, pagoId, snapshot, opciones.heartbeatMs);
  }

  // Caso adapter memoria/upstash: usar abrirStreamSSE estándar.
  // Setear headers SSE en la response.
  for (const [key, value] of Object.entries(HEADERS_SSE)) {
    c.header(key, value);
  }

  return streamSSE(c, async (stream) => {
    await abrirStreamSSE(stream, {
      pagoId,
      pubsub: opciones.pubsub!,
      snapshot,
      ...(opciones.heartbeatMs !== undefined ? { heartbeatMs: opciones.heartbeatMs } : {}),
    });
  });
}

/**
 * Pipea el stream NDJSON del DO al cliente como SSE.
 *
 * 1. Snapshot inicial via writeSSE.
 * 2. Heartbeat cada N ms.
 * 3. Fetch GET al stub `/subscribe?canal=...`.
 * 4. Lee el body como ReadableStream NDJSON, parsea cada línea como EventoPago,
 *    dedupea por eventId, y escribe SSE al cliente.
 * 5. await onAbort para que el stream no resuelva (FIX I3).
 */
async function manejarStreamDurableObjects<Env extends object>(
  c: Context<AmbienteRutasPagos<Env>>,
  pubsub: PubSubAdapterDurableObjects,
  pagoId: string,
  snapshot: EventoPago | null,
  heartbeatMsRaw: number | undefined,
): Promise<Response> {
  const canal = `pagos:${pagoId}`;
  const heartbeatMs = clampHeartbeatMs(heartbeatMsRaw ?? HEARTBEAT_DEFAULT_MS);

  for (const [key, value] of Object.entries(HEADERS_SSE)) {
    c.header(key, value);
  }

  return streamSSE(c, async (stream) => {
    // Snapshot inicial.
    if (snapshot && !esEventoDuplicado(snapshot.eventId)) {
      await stream.writeSSE({
        data: JSON.stringify(snapshot),
        event: sanitizarCampoSSE('snapshot'),
        id: sanitizarCampoSSE(snapshot.eventId),
      });
    }

    // Heartbeat.
    const heartbeatTimer = setInterval(() => {
      void stream.writeSSE({ data: '', event: 'keepalive' }).catch(() => {
        /* writer cerrado */
      });
    }, heartbeatMs);

    // AbortController para cancelar el fetch al DO si el cliente se desconecta.
    const aborter = new AbortController();

    // Fetch GET al stub del DO.
    const id = pubsub.binding.idFromName(pubsub.nombreObjeto);
    const stub = pubsub.binding.get(id);
    const url = `https://sse-hub/subscribe?canal=${encodeURIComponent(canal)}`;

    let res: Response;
    try {
      res = await stub.fetch(url, { method: 'GET', signal: aborter.signal });
    } catch (err) {
      clearInterval(heartbeatTimer);
      console.error('[procesador-pagos-sdk] fetch al DO falló:', err);
      return;
    }

    if (!res.ok || !res.body) {
      clearInterval(heartbeatTimer);
      console.error('[procesador-pagos-sdk] DO respondió', res.status);
      return;
    }

    // Lectura NDJSON (líneas separadas por \n).
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const loopLectura = async (): Promise<void> => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          let idxNL = buffer.indexOf('\n');
          while (idxNL >= 0) {
            const linea = buffer.slice(0, idxNL).trim();
            buffer = buffer.slice(idxNL + 1);
            if (linea.length > 0) {
              try {
                const evento = JSON.parse(linea) as EventoPago;
                if (!esEventoDuplicado(evento.eventId)) {
                  await stream.writeSSE({
                    data: JSON.stringify(evento),
                    event: sanitizarCampoSSE('pago.actualizado'),
                    id: sanitizarCampoSSE(evento.eventId),
                  });
                }
              } catch (err) {
                console.error('[procesador-pagos-sdk] línea NDJSON inválida:', err);
              }
            }
            idxNL = buffer.indexOf('\n');
          }
        }
      } catch {
        // reader cerrado / abortado — esperado en cleanup.
      }
    };

    const promesaLectura = loopLectura();

    // FIX I3: bloquear hasta abort, luego cleanup.
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeatTimer);
        aborter.abort();
        reader
          .cancel()
          .catch(() => {
            /* ya cerrado */
          });
        void promesaLectura.finally(() => resolve());
      });
    });
  });
}
