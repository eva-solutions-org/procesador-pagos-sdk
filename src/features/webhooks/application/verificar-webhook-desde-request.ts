import type { Resultado } from '../../../core/types/index.js';
import { verificarFirmaWebhook } from './verificar-firma-webhook.js';

/**
 * Wrapper de `verificarFirmaWebhook` que extrae header + body desde un `Request` estándar.
 *
 * UX-6 / C1 / C2.
 *
 * **C1 — Overload de `options.body` (Hono+CF Workers safety):**
 *   - Si `options.body` está PRESENTE → usar tal cual; NO llamar `request.text()`.
 *     Evita `TypeError: Body has already been used` cuando el framework
 *     consumió el stream en middleware previo.
 *   - Si `options.body` está AUSENTE → `await request.text()`. Si lanza
 *     `TypeError` (body ya consumido), atrapa y retorna 422.
 *
 * **C2 — Códigos HTTP semánticos:**
 *   - Header `X-Signature` ausente → 401 (auth missing).
 *   - Body ya consumido (sin `options.body`) → 422 (no procesable).
 *   - Firma inválida → propaga 401 desde `verificarFirmaWebhook`.
 *   - Body no es JSON post-firma-OK → 422 (no procesable, NO 401 — la auth pasó).
 *
 * Header lookup case-insensitive: `Headers.get('X-Signature')` ya es
 * case-insensitive en el nombre (estándar Web). La case-sensitivity APLICA
 * SÓLO al CONTENIDO del header (`sha256=...` minúscula — I4), NO al nombre.
 */
export const verificarWebhookDesdeRequest = async (
  request: Request,
  secretKey: string,
  options?: { body?: string | Uint8Array },
): Promise<Resultado<{ payload: unknown }>> => {
  const signature = request.headers.get('X-Signature');
  if (signature === null) {
    return {
      success: false,
      error: 'Header X-Signature ausente',
      codigo: 401,
    };
  }

  // C1 — body resolution
  let body: string | Uint8Array;
  if (options?.body !== undefined) {
    body = options.body;
  } else {
    try {
      body = await request.text();
    } catch (err) {
      // Body ya consumido por middleware previo (Hono+CF Workers).
      if (err instanceof TypeError) {
        return {
          success: false,
          error: 'Body ya consumido o no legible. Pasá options.body explícitamente.',
          codigo: 422,
        };
      }
      // Error inesperado (no TypeError) — re-throw, no lo enmascaramos.
      throw err;
    }
  }

  const verif = await verificarFirmaWebhook({ body, signature, secretKey });
  if (!verif.success) {
    return verif;
  }

  // Firma OK → parsear body como JSON.
  let payload: unknown;
  try {
    const bodyStr =
      typeof body === 'string'
        ? body
        : new TextDecoder('utf-8', { fatal: true }).decode(body);
    payload = JSON.parse(bodyStr);
  } catch {
    return {
      success: false,
      error: 'Body no es JSON válido',
      codigo: 422,
    };
  }

  return { success: true, data: { payload } };
};
