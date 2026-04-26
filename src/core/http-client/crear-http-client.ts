import type { ZodType } from 'zod';
import { SDK_API_URL } from '../config.js';
import type { Resultado } from '../types/result.js';
import { mapearErrorHttp, mapearErrorParseo, mapearErrorRed } from './mapear-error.js';

/**
 * Opciones del factory `crearHttpClient`.
 *
 * - `apiKey`: string no vacío. Se envía como header `x-api-key` en cada request.
 * - `timeout`: ms para `AbortSignal.timeout()` interno (default 10_000).
 * - `headersExtra`: headers del consumidor; mergean con los internos. Internos GANAN
 *   ante colisión (lowercase-normalize antes de merge — R8 mitigation).
 * - `fetchImpl`: override para tracing / OTel. Default `globalThis.fetch`.
 * - `clientSignal`: signal a nivel cliente (I5 — shutdown global del proceso).
 */
export interface OpcionesHttpClient {
  apiKey: string;
  timeout: number;
  headersExtra?: Record<string, string> | undefined;
  fetchImpl: typeof globalThis.fetch;
  clientSignal?: AbortSignal | undefined;
}

/**
 * Opciones por operación HTTP.
 */
export interface OpcionesRequest<T> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined> | undefined;
  schemaRespuesta?: ZodType<T> | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Construye URL final aplicando query params (omitiendo `undefined`/`null`).
 * @internal
 */
const construirUrl = (
  path: string,
  query: Record<string, string | number | boolean | undefined> | undefined,
): string => {
  const url = new URL(path, SDK_API_URL);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

/**
 * Construye headers finales:
 * 1. Lowercase-normalize de keys del consumidor.
 * 2. Setea internos (`x-api-key`, `Content-Type` si body) ENCIMA — internos ganan.
 *
 * @internal
 */
const construirHeaders = (
  apiKey: string,
  headersExtra: Record<string, string> | undefined,
  tieneBody: boolean,
): Headers => {
  const headers = new Headers();

  if (headersExtra !== undefined) {
    for (const [key, value] of Object.entries(headersExtra)) {
      headers.set(key.toLowerCase(), value);
    }
  }

  // Internos GANAN ante colisión.
  headers.set('x-api-key', apiKey);
  if (tieneBody) {
    headers.set('content-type', 'application/json');
  }

  return headers;
};

/**
 * Combina hasta 3 AbortSignals (I5 — ADR-006):
 * - `clientSignal`: shutdown global del cliente.
 * - `opSignal`: cancelación operacional.
 * - `AbortSignal.timeout(timeout)`: timeout interno (siempre presente).
 *
 * `undefined` NO debe aparecer en el array final.
 *
 * @internal
 */
const combinarSignals = (
  clientSignal: AbortSignal | undefined,
  opSignal: AbortSignal | undefined,
  timeout: number,
): { combined: AbortSignal; timeoutSignal: AbortSignal } => {
  const timeoutSignal = AbortSignal.timeout(timeout);
  const signals: AbortSignal[] = [timeoutSignal];
  if (clientSignal !== undefined) {
    signals.push(clientSignal);
  }
  if (opSignal !== undefined) {
    signals.push(opSignal);
  }
  return { combined: AbortSignal.any(signals), timeoutSignal };
};

/**
 * Type guard para AbortError (DOMException con name 'AbortError').
 * @internal
 */
const esAbortError = (err: unknown): boolean => {
  return (
    err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
};

/**
 * Cliente HTTP del SDK. Retorna funciones `get`, `post` con firma uniforme.
 *
 * Política de seguridad:
 * - URL base = `SDK_API_URL` inyectado en build-time. NUNCA overridable en runtime.
 * - `apiKey` NUNCA aparece en `error.message` ni en `cause` serializado.
 *
 * Triple AbortSignal (I5):
 * - clientSignal del factory + opSignal del request + AbortSignal.timeout interno.
 *
 * Política de errores:
 * - response.ok: `safeParse(json.data)` (desenvuelve `{ data }` per A2).
 * - response NO ok: `mapearErrorHttp` (incluye 429 + retryAfter — I2).
 * - JSON inválido o safeParse fail: 502.
 * - AbortError interno (timeout) o network: 503.
 * - AbortError externo (clientSignal o opSignal): Resultado falla 503 (no throw — contrato Result Pattern).
 */
export const crearHttpClient = (opciones: OpcionesHttpClient) => {
  const { apiKey, timeout, headersExtra, fetchImpl, clientSignal } = opciones;

  const request = async <T>(opts: OpcionesRequest<T>): Promise<Resultado<T>> => {
    const { method, path, body, query, schemaRespuesta, signal: opSignal } = opts;

    const url = construirUrl(path, query);
    const tieneBody = body !== undefined;
    const headers = construirHeaders(apiKey, headersExtra, tieneBody);
    const { combined, timeoutSignal } = combinarSignals(clientSignal, opSignal, timeout);

    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers,
        signal: combined,
      };
      if (tieneBody) {
        init.body = JSON.stringify(body);
      }
      response = await fetchImpl(url, init);
    } catch (err) {
      // Clasificar AbortError: interno (timeout) vs externo (cliente / op)
      if (esAbortError(err)) {
        // timeoutSignal disparó → interno → 503
        if (timeoutSignal.aborted) {
          return mapearErrorRed(`Timeout (>${String(timeout)}ms)`);
        }
        // Externo: Result falla 503 — el SDK siempre retorna Resultado (no throw)
        return mapearErrorRed('Operación cancelada por signal externo');
      }
      // Network / DNS / TLS
      const msg = err instanceof Error ? err.message : 'Error de red';
      return mapearErrorRed(`Error de red: ${msg}`);
    }

    // Response.ok lenient (A1) — cualquier 2xx
    if (response.ok) {
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        return mapearErrorParseo('Respuesta no es JSON válido');
      }

      // Desenvuelve { data } per A2 — SOLO si el envelope es exclusivamente { data }.
      // Si el response trae otras keys top-level (e.g. `{ data, pagination }` del listar),
      // el unwrap rompería el shape esperado por el schema → pasamos el JSON completo.
      const esEnvelopeExclusivo =
        json !== null &&
        typeof json === 'object' &&
        'data' in json &&
        Object.keys(json as Record<string, unknown>).length === 1;
      const datos = esEnvelopeExclusivo ? (json as { data: unknown }).data : json;

      if (schemaRespuesta === undefined) {
        return { success: true, data: datos as T };
      }

      const parsed = schemaRespuesta.safeParse(datos);
      if (!parsed.success) {
        return mapearErrorParseo(`Shape inesperado: ${parsed.error.message}`);
      }
      return { success: true, data: parsed.data };
    }

    // Response NO ok
    let body502: unknown = undefined;
    try {
      body502 = await response.json();
    } catch {
      // body no parseable — mapear sin body
    }
    return mapearErrorHttp(response, body502);
  };

  return {
    request,
    get: <T>(
      path: string,
      options: Omit<OpcionesRequest<T>, 'method' | 'path' | 'body'> = {},
    ) => request<T>({ ...options, method: 'GET', path }),
    post: <T>(
      path: string,
      body: unknown,
      options: Omit<OpcionesRequest<T>, 'method' | 'path' | 'body'> = {},
    ) => request<T>({ ...options, method: 'POST', path, body }),
  };
};

export type HttpClient = ReturnType<typeof crearHttpClient>;
