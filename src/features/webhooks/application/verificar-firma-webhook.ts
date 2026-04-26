import type { Resultado } from '../../../core/types/index.js';
import { REGEX_FIRMA_WEBHOOK } from '../domain/index.js';
import type { VerificarFirmaInput } from '../domain/index.js';
import { calcularHmacSha256 } from '../infrastructure/calcular-hmac-sha256.js';
import { compararFirmasSeguro } from '../infrastructure/comparar-firmas-seguro.js';

/**
 * Primitive síncrona de verificación de firma HMAC-SHA256.
 *
 * Flow (C2 — todas las fallas son `codigo: 401`):
 *   1. `secretKey` vacío → 401 (auth no resoluble).
 *   2. `signature` no matchea `/^sha256=[a-f0-9]{64}$/` (case-sensitive — I4) → 401.
 *   3. Calcular HMAC-SHA256 sobre `body` con `secretKey` y comparar timing-safe.
 *      No matchea → 401.
 *   4. Match → `{ success: true, data: true }`.
 *
 * Async porque `crypto.subtle.sign` es async. Compatible con todos los runtimes
 * target (Cloudflare Workers, Vercel Edge, Node 18+, browsers).
 *
 * NUNCA lanza para flujos de negocio (Result Pattern). El único throw posible
 * es `compararFirmasSeguro` cuando el runtime no expone primitivas nativas
 * (capacidad del runtime, fail-closed).
 */
export const verificarFirmaWebhook = async (
  input: VerificarFirmaInput,
): Promise<Resultado<true>> => {
  if (typeof input.secretKey !== 'string' || input.secretKey.length === 0) {
    return {
      success: false,
      error: 'secretKey ausente o vacía',
      codigo: 401,
    };
  }

  if (!REGEX_FIRMA_WEBHOOK.test(input.signature)) {
    return {
      success: false,
      error: 'Formato de firma inválido (esperado: sha256=<hex64 lowercase>)',
      codigo: 401,
    };
  }

  const firmaRecibida = input.signature.slice('sha256='.length);
  const firmaCalculada = await calcularHmacSha256(input.body, input.secretKey);

  if (!compararFirmasSeguro(firmaRecibida, firmaCalculada)) {
    return {
      success: false,
      error: 'Firma inválida',
      codigo: 401,
    };
  }

  return { success: true, data: true };
};
