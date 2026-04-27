/**
 * Polling loop para el modo `polling` (REQ-WIDGET-009).
 *
 * Llama `GET /:basePath/:pagoId` cada N ms hasta que:
 * - El estado es terminal (`completado | fallido | expirado | cancelado | reembolsado`).
 * - El `AbortSignal` se aborta.
 * - Se excede el `timeoutMs` suave → resuelve con `timeoutSuave: true`.
 *
 * Clamp del intervalo: [500, 30000] ms.
 */

import type { Pago } from '../../pagos/domain/index.js';

const ESTADOS_TERMINALES: ReadonlyArray<string> = [
  'completado',
  'fallido',
  'expirado',
  'cancelado',
  'reembolsado',
];

const INTERVALO_MIN = 500;
const INTERVALO_MAX = 30000;

export interface OpcionesPolling {
  pagoId: string;
  basePath: string;
  intervaloMs: number;
  timeoutMs: number;
  signal: AbortSignal;
}

export interface ResultadoPolling {
  pago: Pago;
  /** True si el polling cortó por timeout suave (estado todavía no-terminal). */
  timeoutSuave: boolean;
}

function clampIntervalo(ms: number): number {
  if (Number.isNaN(ms) || ms < INTERVALO_MIN) return INTERVALO_MIN;
  if (ms > INTERVALO_MAX) return INTERVALO_MAX;
  return ms;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function pollearPago(opciones: OpcionesPolling): Promise<ResultadoPolling> {
  const { pagoId, basePath, signal } = opciones;
  const intervalo = clampIntervalo(opciones.intervaloMs);
  const timeoutMs = opciones.timeoutMs > 0 ? opciones.timeoutMs : 60_000;
  const inicio = Date.now();

  const pathBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const url = `${pathBase}/${encodeURIComponent(pagoId)}`;

  for (;;) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`[procesador-pagos-sdk] polling pago: status ${res.status}`);
    }
    const pago = (await res.json()) as Pago;
    if (ESTADOS_TERMINALES.includes(pago.estado)) {
      return { pago, timeoutSuave: false };
    }
    if (Date.now() - inicio >= timeoutMs) {
      return { pago, timeoutSuave: true };
    }
    await delay(intervalo, signal);
  }
}
