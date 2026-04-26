/**
 * Entry point principal de `@eva/procesador-pagos-sdk`.
 *
 * Subpath separado para webhooks: `@eva/procesador-pagos-sdk/webhooks`
 * (ver `src/webhooks.ts`). Esto permite que apps que sólo consumen
 * la API REST no carguen las primitivas WebCrypto del feature webhooks.
 */

// Cliente
export { crearCliente, createClienteProcesadorPagos } from './core/cliente/index.js';
export type { ClienteProcesadorPagos, OpcionesCliente } from './core/cliente/index.js';

// Result Pattern (UX-3)
export { esExitoso, esFallido } from './core/types/index.js';
export type { CodigoErrorHttp, Resultado } from './core/types/index.js';

// Tipos públicos del feature pagos
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
} from './features/pagos/index.js';
