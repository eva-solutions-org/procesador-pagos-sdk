import type { Resultado } from '../../../core/types/index.js';
import type { ListarPagosResponse, FiltrarPagoInput } from '../domain/index.js';
import { filtrarPagoSchema } from '../domain/index.js';
import type { PagosHttpAdapter } from '../infrastructure/index.js';

/**
 * Lista pagos paginados con filtros opcionales.
 *
 * Valida `filtrarPagoSchema` localmente (e.g., limit > 100 → 400 sin tocar red).
 * El cliente HTTP omite query params `undefined`.
 */
export const listarPagos =
  (adapter: PagosHttpAdapter) =>
  async (
    filtros?: Partial<FiltrarPagoInput>,
    options?: { signal?: AbortSignal },
  ): Promise<Resultado<ListarPagosResponse>> => {
    const parsed = filtrarPagoSchema.safeParse(filtros ?? {});
    if (!parsed.success) {
      return {
        success: false,
        error: `Filtros inválidos: ${parsed.error.message}`,
        codigo: 400,
      };
    }
    return adapter.getListarPagos(parsed.data, options);
  };

/** Tipo expuesto del operador `listarPagos` (curried). Útil para `iterarPagos`. */
export type ListarPagosFn = ReturnType<typeof listarPagos>;
