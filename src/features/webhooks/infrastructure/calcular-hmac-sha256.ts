/**
 * Calcula HMAC-SHA256 sobre `mensaje` con `secretKey`, retornando hex lowercase.
 *
 * Mirror del `firmarHmac` del servicio (`Procesador-de-pagos\src\core\crypto\hmac.ts`):
 *   - WebCrypto `crypto.subtle.sign('HMAC', key, data)`.
 *   - Output convertido a hex con `bytesToHex` (lowercase, 64 chars para SHA-256).
 *
 * Runtime-agnostic: corre en Cloudflare Workers, Vercel Edge, Node 18+ y browsers.
 * `globalThis.crypto.subtle` está estándar en todos esos targets.
 *
 * Política:
 * - `mensaje: string` se codifica con `TextEncoder` (UTF-8).
 * - `mensaje: Uint8Array` se pasa tal cual (caller controla el encoding).
 * - `secretKey` siempre se codifica UTF-8 (igual que el servicio).
 */
export const calcularHmacSha256 = async (
  mensaje: string | Uint8Array,
  secretKey: string,
): Promise<string> => {
  const encoder = new TextEncoder();
  const dataMensaje = typeof mensaje === 'string' ? encoder.encode(mensaje) : mensaje;
  const dataKey = encoder.encode(secretKey);

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    dataKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Cast a BufferSource — TS 5.7+ distingue ArrayBuffer vs ArrayBufferLike (incluye SharedArrayBuffer).
  // En este SDK siempre construimos Uint8Array sobre ArrayBuffer plano, así que el cast es seguro.
  const firma = await globalThis.crypto.subtle.sign('HMAC', key, dataMensaje as BufferSource);
  return uint8ArrayAHex(new Uint8Array(firma));
};

/**
 * Convierte un `Uint8Array` en hex lowercase (mismo formato que `bytesToHex` del servicio).
 *
 * @internal
 */
const uint8ArrayAHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
