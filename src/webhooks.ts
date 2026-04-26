/**
 * Subpath entry point: `@eva/procesador-pagos-sdk/webhooks`.
 *
 * Expone solo las primitivas de verificación HMAC-SHA256 + el wrapper
 * `verificarWebhookDesdeRequest`. Aislado del barrel principal para que
 * apps que no manejan webhooks no carguen WebCrypto innecesariamente.
 */

export {
  verificarFirmaWebhook,
  verificarWebhookDesdeRequest,
} from './features/webhooks/index.js';
