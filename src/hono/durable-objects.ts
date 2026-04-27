/**
 * Entry point `@eva/procesador-pagos-sdk/hono/durable-objects` — adapter Cloudflare DO.
 *
 * Expone `adapterDurableObjects({ binding })` y la clase `SSEHub` para que
 * el consumidor declare un Durable Object class binding en su `wrangler.jsonc`.
 *
 * El consumidor:
 * 1. Importa `SSEHub` y la re-exporta desde su Worker.
 * 2. Configura el binding en wrangler con `class_name: "SSEHub"`.
 * 3. Pasa el binding al adapter: `adapterDurableObjects({ binding: env.SSE_HUB })`.
 */

export {
  adapterDurableObjects,
  SSEHub,
} from '../features/pubsub/index.js';
export type {
  OpcionesDurableObjects,
  PubSubAdapterDurableObjects,
  DurableObjectId,
  DurableObjectStub,
  DurableObjectNamespace,
} from '../features/pubsub/index.js';
