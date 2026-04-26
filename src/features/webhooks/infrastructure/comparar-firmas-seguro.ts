/**
 * Comparación timing-safe de dos firmas en formato hex (64 chars c/u).
 *
 * C4 / ADR-004 — **NO se rola criptografía custom**. Delega a primitivas nativas:
 *   1. `globalThis.crypto.subtle.timingSafeEqual` — Cloudflare Workers, Vercel Edge.
 *   2. `node:crypto.timingSafeEqual` — Node 18+ o `nodejs_compat` en CF Workers.
 *   3. Si ninguno está disponible → throw fail-closed (NUNCA fallback custom).
 *
 * Política de seguridad:
 * - Ambas firmas DEBEN tener la misma longitud antes de comparar (early return false).
 * - La comparación NUNCA usa `===` ni un loop byte-a-byte custom.
 * - Si el runtime no expone una primitiva nativa, lanza un `Error` explícito
 *   antes que aceptar la comparación insegura (fail-closed).
 *
 * El throw es la ÚNICA situación en la que esta capa lanza. Es excepción
 * controlada (capacidad del runtime) — equivalente a `apiKey ausente` en
 * `crearCliente`. NO es flujo de negocio, así que NO viola Result Pattern.
 */

export const compararFirmasSeguro = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  const bytesA = hexAUint8Array(a);
  const bytesB = hexAUint8Array(b);

  // 1. Cloudflare Workers / Vercel Edge / browsers modernos
  const subtle = globalThis.crypto?.subtle as
    | { timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean }
    | undefined;

  if (typeof subtle?.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(bytesA.buffer as ArrayBuffer, bytesB.buffer as ArrayBuffer);
  }

  // 2. Node 18+ o nodejs_compat — import dinámico vía require (sólo si está disponible)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('node:crypto') as {
      timingSafeEqual?: (a: Uint8Array, b: Uint8Array) => boolean;
    };
    if (typeof nodeCrypto.timingSafeEqual === 'function') {
      return nodeCrypto.timingSafeEqual(bytesA, bytesB);
    }
  } catch {
    // require no disponible (Edge runtimes sin nodejs_compat) — cae al throw.
  }

  // 3. Fail-closed: NO fallback custom.
  throw new Error(
    '[procesador-pagos-sdk] Runtime no soporta timing-safe comparison. ' +
      'Habilitar nodejs_compat (Cloudflare Workers) o usar Node 18+.',
  );
};

/**
 * Convierte un string hex (lowercase) en `Uint8Array`.
 *
 * Asume que el input ya pasó por `REGEX_FIRMA_WEBHOOK` (longitud par, chars `[a-f0-9]`).
 *
 * @internal
 */
const hexAUint8Array = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};
