import type { CodigoErrorHttp, Resultado } from '../types/result.js';

/**
 * Status codes HTTP que el SDK mapea a `CodigoErrorHttp`.
 * El resto (418, 504, etc.) caen en el default → 502.
 */
const STATUS_VALIDOS = new Set<number>([400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503]);

/**
 * Mensajes default por status. Sobrescritos por `body.error` si está disponible.
 */
const MENSAJES_POR_STATUS: Record<number, string> = {
  400: 'Petición inválida',
  401: 'No autorizado',
  403: 'Acceso prohibido',
  404: 'Recurso no encontrado',
  409: 'Conflicto',
  413: 'Payload demasiado grande',
  422: 'Datos no procesables',
  429: 'Demasiadas solicitudes',
  500: 'Error interno del servicio',
  502: 'Bad gateway upstream',
  503: 'Servicio no disponible',
};

/**
 * Parsea el header `Retry-After` (I2 — ADR-002).
 *
 * Soporta:
 * - delta-seconds (numérico): `parseInt`, validado >= 0.
 * - HTTP-date: `(Date.parse(value) - Date.now()) / 1000` redondeado positivo.
 * - Header ausente o malformado: retorna `undefined` (NO lanza).
 *
 * @internal
 */
export const parsearRetryAfter = (headerValue: string | null): number | undefined => {
  if (headerValue === null || headerValue.trim().length === 0) {
    return undefined;
  }
  const trimmed = headerValue.trim();

  // Numerico: delta-seconds
  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    if (Number.isFinite(n) && n >= 0) {
      return n;
    }
    return undefined;
  }

  // HTTP-date
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const deltaSecs = Math.max(0, Math.round((parsed - Date.now()) / 1000));
  return deltaSecs;
};

/**
 * Extrae mensaje de error del body parseado, con fallback a default por status.
 *
 * NUNCA incluye apiKey ni headers crudos. NUNCA serializa el body completo.
 *
 * @internal
 */
const extraerMensaje = (body: unknown, status: number): string => {
  if (body !== null && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === 'string' && err.length > 0) {
      return err;
    }
  }
  return MENSAJES_POR_STATUS[status] ?? `Status HTTP inesperado: ${String(status)}`;
};

/**
 * Mapea `Response` HTTP no-OK → `Resultado<never>` con `codigo` + opcional `retryAfter` (I2).
 *
 * Casos:
 * - Status en `STATUS_VALIDOS` → ese código (con `retryAfter` solo si es 429).
 * - Status fuera del union (e.g., 418, 504) → `502 "Status HTTP inesperado: <real>"`.
 *
 * Política de seguridad: ningún mensaje incluye `apiKey`, headers crudos ni stack traces.
 */
export const mapearErrorHttp = (response: Response, body?: unknown): Resultado<never> => {
  const status = response.status;

  if (status === 429) {
    const retryAfter = parsearRetryAfter(response.headers.get('Retry-After'));
    const error = extraerMensaje(body, 429);
    if (retryAfter !== undefined) {
      return { success: false, error, codigo: 429, retryAfter };
    }
    return { success: false, error, codigo: 429 };
  }

  if (STATUS_VALIDOS.has(status) && status !== 429) {
    const codigo = status as Exclude<CodigoErrorHttp, 429>;
    const error = extraerMensaje(body, status);
    return { success: false, error, codigo };
  }

  // Status fuera del union
  return {
    success: false,
    error: `Status HTTP inesperado: ${String(status)}`,
    codigo: 502,
  };
};

/**
 * Mapea error de red / DNS / TLS / abort interno → `Resultado<never>` (503).
 *
 * Si el abort fue EXTERNO (clientSignal o opSignal del consumidor), el caller
 * debe re-throw el `AbortError` (NO Resultado). Este helper solo cubre timeout
 * interno y errores técnicos.
 *
 * @internal
 */
export const mapearErrorRed = (mensaje: string): Resultado<never> => ({
  success: false,
  error: mensaje,
  codigo: 503,
});

/**
 * Mapea error de parseo de body (JSON inválido) o `safeParse` Zod → 502.
 *
 * @internal
 */
export const mapearErrorParseo = (mensaje: string): Resultado<never> => ({
  success: false,
  error: mensaje,
  codigo: 502,
});
