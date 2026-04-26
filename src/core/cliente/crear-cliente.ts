import { crearFacadePagos } from '../../features/pagos/index.js';
import type { FacadePagos } from '../../features/pagos/index.js';
import { crearHttpClient } from '../http-client/index.js';

/**
 * Opciones de `crearCliente` (UX-5 + I5).
 *
 * - `apiKey`: requerido, string no vacío. Valor NUNCA aparece en mensajes de error.
 * - `timeout`: ms para `AbortSignal.timeout()` interno (default 10_000).
 * - `headers`: headers extra del consumidor; mergean con internos en lowercase.
 * - `fetch`: override (OTel / Datadog / tracing). Default `globalThis.fetch`.
 * - `signal`: AbortSignal **global** del cliente (I5). Cancela todas las ops en vuelo.
 *
 * URL del servicio NUNCA es overridable en runtime — solo build-time vía `tsdown define`.
 */
export interface OpcionesCliente {
  apiKey: string;
  timeout?: number;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export interface ClienteProcesadorPagos {
  readonly pagos: FacadePagos;
}

const TIMEOUT_MAXIMO = Number.MAX_SAFE_INTEGER;

const esTimeoutValido = (timeout: number): boolean => {
  return Number.isFinite(timeout) && timeout >= 0 && timeout <= TIMEOUT_MAXIMO;
};

/**
 * Factory principal del SDK. Retorna cliente con namespace `pagos`.
 *
 * Throw síncrono si `apiKey` no es string no vacío. Es ÚNICA excepción
 * permitida fuera de async iterators — error de programación, no flujo
 * de negocio. El mensaje del throw NUNCA incluye el valor de `apiKey`.
 */
export const crearCliente = (opciones: OpcionesCliente): ClienteProcesadorPagos => {
  if (
    opciones === null ||
    opciones === undefined ||
    typeof opciones !== 'object' ||
    typeof opciones.apiKey !== 'string' ||
    opciones.apiKey.length === 0
  ) {
    throw new Error('[procesador-pagos-sdk] apiKey es requerido y debe ser string no vacío');
  }

  const timeout = opciones.timeout ?? 10_000;
  if (typeof timeout !== 'number' || !esTimeoutValido(timeout)) {
    throw new Error(
      '[procesador-pagos-sdk] timeout debe estar entre 0 y Number.MAX_SAFE_INTEGER (ms)',
    );
  }

  const httpClient = crearHttpClient({
    apiKey: opciones.apiKey,
    timeout,
    headersExtra: opciones.headers,
    fetchImpl: opciones.fetch ?? globalThis.fetch,
    clientSignal: opciones.signal,
  });

  return {
    pagos: crearFacadePagos(httpClient),
  };
};

/** Alias UX-2 — consistente con Auth-SDK. */
export const createClienteProcesadorPagos = crearCliente;
