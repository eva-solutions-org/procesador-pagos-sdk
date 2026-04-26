import type { Resultado } from '../../../core/types/index.js';
import type { PagoCanceladoResponse } from '../domain/index.js';
import type { PagosHttpAdapter } from '../infrastructure/index.js';

/**
 * Cancela un pago. POST sin body.
 * Response: `{ pagoId, estado }` (2 campos).
 */
export const cancelarPago =
  (adapter: PagosHttpAdapter) =>
  async ({
    id,
    signal,
  }: {
    id: string;
    signal?: AbortSignal;
  }): Promise<Resultado<PagoCanceladoResponse>> => {
    if (typeof id !== 'string' || id.length === 0) {
      return {
        success: false,
        error: 'id es requerido y debe ser string no vacío',
        codigo: 400,
      };
    }
    return adapter.postCancelarPago(id, signal !== undefined ? { signal } : {});
  };
