/**
 * Entry point `@eva/procesador-pagos-sdk/hono` — backend Hono.
 *
 * Expone:
 * - `rutasPagos()` factory con los 4 endpoints (POST /crear, /webhook, GET /:id, /:id/eventos).
 * - `adapterMemoria()` — pubsub in-process (default sin deps externas).
 * - Tipos del contrato: `RutasPagosOpciones`, `PubSubAdapter`, `EventoPago`.
 *
 * Para adapters de pub/sub específicos, importar desde:
 * - `@eva/procesador-pagos-sdk/hono/upstash`
 * - `@eva/procesador-pagos-sdk/hono/durable-objects`
 */

export { rutasPagos, crearRutasPagos } from './features/rutas-hono/index.js';
export type {
  RutasPagosOpciones,
  RutasPagosFactoryArgs,
  ModoPagos,
  CrearPagoResponseCliente,
  WebhookPayload,
  VariablesRutasPagos,
  AmbienteRutasPagos,
} from './features/rutas-hono/index.js';

export { adapterMemoria } from './features/pubsub/index.js';
export type { PubSubAdapter, EventoPago } from './features/pubsub/index.js';
