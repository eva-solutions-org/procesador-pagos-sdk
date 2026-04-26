import type { Resultado } from '../../../core/types/index.js';
import type { CrearPagoInput, CrearPagoResponse } from '../domain/index.js';
import { crearPagoInputSchema } from '../domain/index.js';
import type { PagosHttpAdapter } from '../infrastructure/index.js';

/**
 * Crea un pago. Valida input localmente con Zod (NO toca red si falla).
 *
 * Per C6: NO valida tamaño 8KB de metadata localmente. Si excede, el servicio
 * responde 413/422 y el SDK lo propaga.
 *
 * Per A1: el http-client acepta lenient 2xx (incluido 201).
 * Per I8: response es `crearPagoResponseSchema` (10 campos), distinto de pagoDetalleSchema.
 */
export const crearPago =
  (adapter: PagosHttpAdapter) =>
  async (
    input: CrearPagoInput,
    options?: { signal?: AbortSignal },
  ): Promise<Resultado<CrearPagoResponse>> => {
    const parsed = crearPagoInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Input inválido: ${parsed.error.message}`,
        codigo: 400,
      };
    }
    return adapter.postCrearPago(parsed.data, options);
  };
