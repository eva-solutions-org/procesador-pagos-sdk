/**
 * Modo de actualización del estado del pago en el cliente.
 *
 * - `sse`: el backend tiene `pubsub` configurado → cliente abre EventSource
 *   contra `GET /:id/eventos` para recibir push del estado.
 * - `polling`: el backend NO tiene `pubsub` → cliente llama `GET /:id`
 *   periódicamente.
 */
export type ModoPagos = 'sse' | 'polling';
