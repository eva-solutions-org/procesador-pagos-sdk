/**
 * Wrapper de `EventSource` para el modo `sse` (REQ-WIDGET-008).
 *
 * - Abre un stream contra `GET /:basePath/:pagoId/eventos`.
 * - Parsea cada `event` SSE como `{ data: JSON, event, id }`.
 * - Cleanup correcto on unmount (close + abort signal).
 * - Reconnect automático del browser nativo (si la red cae transitoriamente).
 * - Si EventSource falla con 404 al abrir → emite error de "no soportado"
 *   para que el caller haga fallback a polling.
 */

import type { EventoPago } from '../../pubsub/domain/index.js';
import type { Pago } from '../../pagos/domain/index.js';

export interface OpcionesSse {
  pagoId: string;
  basePath: string;
  signal: AbortSignal;
  onEvento: (evento: EventoPago) => void;
  onError: (err: Error) => void;
}

export interface HandleSse {
  cerrar: () => void;
}

const ESTADOS_TERMINALES: ReadonlyArray<string> = [
  'completado',
  'fallido',
  'expirado',
  'cancelado',
  'reembolsado',
];

export function abrirSSE(opciones: OpcionesSse): HandleSse {
  const { pagoId, basePath, signal, onEvento, onError } = opciones;

  if (typeof EventSource === 'undefined') {
    onError(new Error('[procesador-pagos-sdk] EventSource no disponible (entorno no-browser)'));
    return { cerrar: () => undefined };
  }

  const pathBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const url = `${pathBase}/${encodeURIComponent(pagoId)}/eventos`;

  const source = new EventSource(url);

  const cerrar = (): void => {
    try {
      source.close();
    } catch {
      /* idempotente */
    }
  };

  signal.addEventListener('abort', cerrar, { once: true });

  source.addEventListener('snapshot', (ev: MessageEvent) => {
    try {
      const evento = JSON.parse(ev.data) as EventoPago;
      onEvento(evento);
    } catch {
      /* ignore malformed */
    }
  });

  source.addEventListener('pago.actualizado', (ev: MessageEvent) => {
    try {
      const evento = JSON.parse(ev.data) as EventoPago;
      onEvento(evento);
    } catch {
      /* ignore malformed */
    }
  });

  source.addEventListener('keepalive', () => {
    /* heartbeat — no-op */
  });

  source.onerror = (): void => {
    if (source.readyState === EventSource.CLOSED) {
      onError(new Error('[procesador-pagos-sdk] SSE conexión cerrada'));
    }
  };

  return { cerrar };
}

/** Helper: indica si el evento corresponde a un estado terminal. */
export function esEstadoTerminal(estado: string): boolean {
  return ESTADOS_TERMINALES.includes(estado);
}

/**
 * Convierte un `EventoPago` (9-10 campos) a un `Pago` parcial — usado por el
 * hook para emitir el callback `onCompletado(pago)` con la mejor info
 * disponible vía SSE.
 */
export function eventoAPagoParcial(evento: EventoPago): Pago {
  return {
    id: evento.pagoId,
    proyectoId: '',
    pasarelaId: evento.pasarela,
    referenciaExterna: evento.referenciaExterna,
    tipo: '',
    montoOriginal: evento.monto,
    monedaOriginal: evento.moneda,
    estado: evento.estado as Pago['estado'],
    pasarelaPaymentId: null,
    pasarelaStatus: null,
    paymentLink: null,
    qrCodeUrl: null,
    qrCodeEmv: null,
    intentId: null,
    metodoPago: null,
    errorMensaje: null,
    webhookRecibido: true,
    callbackEnviado: false,
    metadata: evento.metadata,
    expiresAt: null,
    createdAt: evento.timestamp,
    updatedAt: evento.timestamp,
  };
}
