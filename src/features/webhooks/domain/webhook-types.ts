/**
 * Tipos y constantes del feature `webhooks`.
 *
 * El servicio firma con `firmarHmac`:
 *   - Algoritmo: HMAC-SHA256.
 *   - Output: `bytesToHex` lowercase (64 chars).
 *   - Header `X-Signature`: prefijo literal `sha256=` (lowercase).
 *
 * Verificado contra el servicio: función de firma `firmarHmac` y uso del
 * prefijo literal `sha256=` en el envío de callbacks.
 *
 * I4 — La regex es **case-sensitive** (sin flag `/i`). El servicio NO produce
 * mayúsculas en ningún tramo de la firma. Variantes como `SHA256=...` o `Sha256=...`
 * SON inválidas y deben rechazarse con `codigo: 401`.
 */

export const REGEX_FIRMA_WEBHOOK = /^sha256=[a-f0-9]{64}$/;

/**
 * Input de la primitive síncrona `verificarFirmaWebhook`.
 */
export interface VerificarFirmaInput {
  body: string | Uint8Array;
  signature: string;
  secretKey: string;
}
