/**
 * Contrato público del feature `rutas-hono`.
 *
 * Expone el factory `rutasPagos()` + tipos del contrato. NO re-exporta
 * `validarOpcionesRutas` ni constantes de mensaje (esas viven en
 * `infrastructure/` y son API interna — sólo accesibles para tests
 * importando con path explícito).
 */

export { rutasPagos, crearRutasPagos } from './application/index.js';
export type {
  RutasPagosOpciones,
  RutasPagosFactoryArgs,
  ModoPagos,
  CrearPagoResponseCliente,
  WebhookPayload,
  VariablesRutasPagos,
  AmbienteRutasPagos,
} from './domain/index.js';
export {
  crearPagoResponseClienteSchema,
  webhookPayloadSchema,
} from './domain/index.js';
