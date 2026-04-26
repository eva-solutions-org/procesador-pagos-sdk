import type { FiltrarPagoInput, PagoDetalle, PagoResumen } from '../domain/index.js';
import type { ListarPagosFn } from './listar-pagos.js';

/**
 * Async iterator que auto-pagina el listado de pagos.
 *
 * UX-9 / ADR-005 / C3 — **ÚNICA EXCEPCIÓN AL RESULT PATTERN DEL SDK**.
 *
 * Idiomático estilo Stripe-node, AWS SDK v3, Octokit:
 * - `yield` `Pago` directo (NO `Resultado<Pago>`).
 * - En error de I/O → `throw new Error(msg, { cause: <Resultado falla> })`.
 *   El consumidor narrowea `cause` en el `catch` para acceder a `codigo`.
 *
 * I3 — Cleanup observable: el bucle vive en `try { ... } finally { ... }`. Si
 * el consumidor hace `break`, el generador ejecuta `finally` antes de cerrar.
 *
 * I6 — Respeta `filtros.limit` del consumidor (default 100, max 100, min 1).
 * Validación síncrona inmediata: limit fuera de rango → throw antes de fetch.
 *
 * Uso típico:
 * ```typescript
 * try {
 *   for await (const pago of cliente.pagos.iterarPagos({ estado: 'pendiente' })) {
 *     procesar(pago);
 *   }
 * } catch (err) {
 *   // err.cause es Resultado<never> con { success: false, codigo, error }
 * }
 * ```
 */
export const iterarPagos =
  (listarPagosFn: ListarPagosFn) =>
  (
    filtros: Partial<FiltrarPagoInput> = {},
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<PagoResumen | PagoDetalle, void, unknown> => {
    // I6 — Validación síncrona (NO dentro del async generator). De este modo el throw
    // se dispara al invocar `iterarPagos(...)` (incluso antes del primer `.next()`).
    // El consumidor obtiene un error sync inmediato si pasó un limit fuera de rango.
    const limit = filtros.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error(`[iterarPagos] limit debe estar entre 1 y 100 (recibido: ${String(limit)})`);
    }

    return iterarPagosImpl(listarPagosFn, filtros, options, limit);
  };

async function* iterarPagosImpl(
  listarPagosFn: ListarPagosFn,
  filtros: Partial<FiltrarPagoInput>,
  options: { signal?: AbortSignal } | undefined,
  limit: number,
): AsyncGenerator<PagoResumen | PagoDetalle, void, unknown> {
  let page = 1;

  try {
    while (true) {
      const resultado = await listarPagosFn({ ...filtros, page, limit }, options);

      if (!resultado.success) {
        // C3 — única excepción: throw con cause = Resultado de falla.
        throw new Error(resultado.error, { cause: resultado });
      }

      for (const pago of resultado.data.data) {
        yield pago;
      }

      if (page >= resultado.data.pagination.totalPages) {
        return;
      }
      page++;
    }
  } finally {
    // I3 — cleanup observable. MVP: sin recursos externos, pero el bloque es
    // contractual para que `break` del consumidor sea detectable y futura
    // limpieza (e.g., métricas, cache invalidation) tenga punto de inserción.
  }
}
