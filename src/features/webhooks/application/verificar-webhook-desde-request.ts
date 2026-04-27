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
 *   - Body mayor al límite configurado → 413.
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
  options?: { body?: string | Uint8Array; maxBodyBytes?: number },
): Promise<Resultado<{ payload: unknown }>> => {
  const maxBodyBytes = options?.maxBodyBytes ?? 32 * 1024;
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
    const size = typeof options.body === 'string'
      ? new TextEncoder().encode(options.body).byteLength
      : options.body.byteLength;
    if (size > maxBodyBytes) {
      return {
        success: false,
        error: 'Body demasiado grande',
        codigo: 413,
      };
    }
    body = options.body;
  } else {
    const contentLength = request.headers.get('Content-Length');
    if (contentLength !== null) {
      const size = Number.parseInt(contentLength, 10);
      if (Number.isFinite(size) && size > maxBodyBytes) {
        return {
          success: false,
          error: 'Body demasiado grande',
          codigo: 413,
        };
      }
    }

    if (request.body === null) {
      body = '';
    } else {
      let reader: ReadableStreamDefaultReader<Uint8Array>;
      try {
        reader = request.body.getReader();
      } catch (err) {
        if (err instanceof TypeError) {
          return {
            success: false,
            error: 'Body ya consumido o no legible. Pasá options.body explícitamente.',
            codigo: 422,
          };
        }
        throw err;
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value === undefined) continue;
          total += value.byteLength;
          if (total > maxBodyBytes) {
            await reader.cancel().catch(() => {
              /* stream ya cerrado */
            });
            return {
              success: false,
              error: 'Body demasiado grande',
              codigo: 413,
            };
          }
          chunks.push(value);
        }
      } catch (err) {
        if (err instanceof TypeError) {
          return {
            success: false,
            error: 'Body ya consumido o no legible. Pasá options.body explícitamente.',
            codigo: 422,
          };
        }
        throw err;
      }

      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      body = bytes;
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
