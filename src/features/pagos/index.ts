/**
 * Contrato público del feature `pagos`.
 *
 * NO exporta schemas Zod ni el adapter HTTP — son detalle interno.
 */

export { crearFacadePagos } from './application/index.js';
export type { FacadePagos } from './application/index.js';

// Contrato interno cross-feature del repo. No se re-exporta desde `src/index.ts`.
export {
  crearPagoInputSchema,
  ESTADOS_PAGO,
} from './domain/index.js';

export type {
  CrearPagoInput,
  CrearPagoResponse,
  EstadoPago,
  FiltrarPagoInput,
  ListarPagosResponse,
  MetodoPago,
  Pago,
  PagoCanceladoResponse,
  PagoDetalle,
  PagoReembolsadoResponse,
  PagoResumen,
  ReembolsarPagoBody,
  TipoPago,
} from './domain/index.js';
