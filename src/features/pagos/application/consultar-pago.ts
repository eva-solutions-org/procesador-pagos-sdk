import type { Resultado } from '../../../core/types/index.js';
import type { PagoDetalle } from '../domain/index.js';
import type { PagosHttpAdapter } from '../infrastructure/index.js';

/**
 * Consulta detalle completo de un pago por id (22 campos — I9).
 */
export const consultarPago =
  (adapter: PagosHttpAdapter) =>
  async ({
    id,
    signal,
  }: {
    id: string;
    signal?: AbortSignal;
  }): Promise<Resultado<PagoDetalle>> => {
    if (typeof id !== 'string' || id.length === 0) {
      return {
        success: false,
        error: 'id es requerido y debe ser string no vacío',
        codigo: 400,
      };
    }
    return adapter.getConsultarPago(id, signal !== undefined ? { signal } : {});
  };
