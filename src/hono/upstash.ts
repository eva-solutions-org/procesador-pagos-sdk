/**
 * Entry point `@eva/procesador-pagos-sdk/hono/upstash` — adapter Upstash Redis.
 *
 * Requiere `@upstash/redis` como peer dependency (optional).
 * El consumidor llama `adapterUpstash({ url, token })` y lo pasa a `rutasPagos({ pubsub: ... })`.
 */

export { adapterUpstash } from '../features/pubsub/index.js';
export type { OpcionesUpstash } from '../features/pubsub/index.js';
