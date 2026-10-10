/**
 * Result Pattern — contrato público del SDK.
 *
 * Toda operación pública de @eva_solutions/procesador-pagos-sdk retorna `Promise<Resultado<T>>`.
 * NUNCA throw para flujos de negocio.
 *
 * Excepciones documentadas:
 * - Errores de programación (apiKey ausente en `crearCliente`) — throw síncrono inmediato.
 * - Async iterators (`iterarPagos`) — única excepción C3, idiomático Stripe/AWS/Octokit.
 *
 * La variante `429` extiende el shape con `retryAfter?: number` (segundos relativos)
 * parseado del header HTTP `Retry-After`. Las demás variantes NO tienen este campo
 * (TS strict prohíbe acceder a `r.retryAfter` cuando `r.codigo !== 429`).
 */

export type CodigoErrorHttp = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503;

export type Resultado<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      codigo: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 500 | 502 | 503;
    }
  | { success: false; error: string; codigo: 429; retryAfter?: number };

export const esExitoso = <T>(r: Resultado<T>): r is { success: true; data: T } => r.success;

export const esFallido = <T>(
  r: Resultado<T>,
): r is Extract<Resultado<T>, { success: false }> => !r.success;
