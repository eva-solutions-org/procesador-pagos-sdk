/**
 * Contrato público del feature `webhooks`.
 *
 * NO exporta primitivas internas (`calcularHmacSha256`, `compararFirmasSeguro`)
 * ni la regex (`REGEX_FIRMA_WEBHOOK`) — son detalle interno.
 */

export {
  verificarFirmaWebhook,
  verificarWebhookDesdeRequest,
} from './application/index.js';
