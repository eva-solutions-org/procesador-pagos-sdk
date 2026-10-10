import { vi } from 'vitest';

/**
 * Construye un mock de `fetch` que retorna una `Response` ad-hoc por llamada.
 *
 * Útil para los tests `.mock.test.ts` donde queremos verificar:
 *   - URL llamada (origin `BASE_URL_PRUEBA` + path).
 *   - Headers (`x-api-key`, `Content-Type`, headers extra).
 *   - Body (JSON serializado del input).
 *   - Signal propagado (instancia AbortSignal final pasada a `init`).
 *
 * El handler recibe `(url, init)` y retorna la `Response` deseada.
 */
/** Origin de pruebas pasado como `baseUrl` (loopback http permitido por la validación). */
export const BASE_URL_PRUEBA = 'http://localhost:6000';

export interface MockFetchHandler {
  (url: string, init: RequestInit): Promise<Response> | Response;
}

export const crearMockFetch = (handler: MockFetchHandler) => {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    return handler(urlStr, init ?? {});
  }) as unknown as typeof globalThis.fetch;
};

/** Crea una `Response` JSON con status configurable. */
export const respuestaJson = (
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response => {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
};

/** Crea una `Response` JSON con shape `{ data }` (envoltorio del servicio). */
export const respuestaJsonData = (
  data: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response => respuestaJson({ data }, init);

/** Crea una `Response` con shape `{ data, pagination }` (listar pagos). */
export const respuestaListarPagos = (
  data: unknown[],
  pagination: { total: number; page: number; limit: number; totalPages: number },
  init: { status?: number; headers?: Record<string, string> } = {},
): Response => respuestaJson({ data, pagination }, init);

/** Crea una `Response` de error JSON. */
export const respuestaError = (
  status: number,
  errorMsg: string,
  headers: Record<string, string> = {},
): Response => respuestaJson({ error: errorMsg }, { status, headers });
