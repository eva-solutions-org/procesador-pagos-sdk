import { z } from 'zod';
import {
  crearPagoInputSchema,
  crearPagoResponseSchema,
  filtrarPagoSchema,
  listarPagosResponseSchema,
  pagoCanceladoResponseSchema,
  pagoDetalleSchema,
  pagoReembolsadoResponseSchema,
  pagoResumenSchema,
  reembolsarPagoBodySchema,
} from './pago-schemas.js';

export type {
  EstadoPago,
  MetodoPago,
  TipoPago,
} from './pago-types.js';

export { ESTADOS_PAGO, METODOS_PAGO, TIPOS_PAGO } from './pago-types.js';

export {
  crearPagoInputSchema,
  crearPagoResponseSchema,
  filtrarPagoSchema,
  listarPagosResponseSchema,
  pagoCanceladoResponseSchema,
  pagoDetalleSchema,
  pagoReembolsadoResponseSchema,
  pagoResumenSchema,
  reembolsarPagoBodySchema,
} from './pago-schemas.js';

// Tipos derivados — evita duplicación en pago-types.ts.
//
// Para inputs (`CrearPagoInput`, `FiltrarPagoInput`) usamos `z.input` (no `z.infer`):
// los campos con `.default(...)` son OPCIONALES desde la perspectiva del consumidor.
// `z.infer` (alias de `z.output`) los marcaría como required (post-defaults), rompiendo
// la UX. `z.input` refleja correctamente que el consumidor PUEDE omitirlos.
//
// Para responses usamos `z.infer` (output): describen lo que el consumidor RECIBE.
export type CrearPagoInput = z.input<typeof crearPagoInputSchema>;
export type CrearPagoResponse = z.infer<typeof crearPagoResponseSchema>;
export type PagoDetalle = z.infer<typeof pagoDetalleSchema>;
export type Pago = PagoDetalle;
export type PagoResumen = z.infer<typeof pagoResumenSchema>;
export type ListarPagosResponse = z.infer<typeof listarPagosResponseSchema>;
export type FiltrarPagoInput = z.input<typeof filtrarPagoSchema>;
export type PagoCanceladoResponse = z.infer<typeof pagoCanceladoResponseSchema>;
export type ReembolsarPagoBody = z.infer<typeof reembolsarPagoBodySchema>;
export type PagoReembolsadoResponse = z.infer<typeof pagoReembolsadoResponseSchema>;
