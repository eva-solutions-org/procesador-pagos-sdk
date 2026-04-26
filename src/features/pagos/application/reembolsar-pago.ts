import type { Resultado } from '../../../core/types/index.js';
import type { PagoReembolsadoResponse, ReembolsarPagoBody } from '../domain/index.js';
import { reembolsarPagoBodySchema } from '../domain/index.js';
import type { PagosHttpAdapter } from '../infrastructure/index.js';

/**
 * Reembolsa un pago — total (sin monto) o parcial (con monto).
 *
 * Per A2: el body ES SIEMPRE JSON parseable.
 * - Sin monto → `{}` (NO ausente, NO `monto: undefined`).
 * - Con monto → `{ monto }`.
 * - Header `Content-Type: application/json` siempre (lo aplica el http-client).
 *
 * Si `monto` está presente, valida regex local antes de tocar red.
 */
export const reembolsarPago =
  (adapter: PagosHttpAdapter) =>
  async ({
    id,
    monto,
    signal,
  }: {
    id: string;
    monto?: string;
    signal?: AbortSignal;
  }): Promise<Resultado<PagoReembolsadoResponse>> => {
    if (typeof id !== 'string' || id.length === 0) {
      return {
        success: false,
        error: 'id es requerido y debe ser string no vacío',
        codigo: 400,
      };
    }

    if (monto !== undefined) {
      const parsed = reembolsarPagoBodySchema.safeParse({ monto });
      if (!parsed.success) {
        return {
          success: false,
          error: `Monto inválido: ${parsed.error.message}`,
          codigo: 400,
        };
      }
    }

    const body: ReembolsarPagoBody = monto !== undefined ? { monto } : {};
    return adapter.postReembolsarPago(id, body, signal !== undefined ? { signal } : {});
  };
