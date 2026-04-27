/**
 * Dedup-store de `eventId` con TTL 5 min (REQ-SSE-005).
 *
 * Map<eventId, expiraEn>. Cleanup oportunista en cada llamada (recorre
 * el Map y elimina expirados antes de chequear).
 *
 * Apto para single-instance. Multi-instance con CF Workers requiere DO
 * (Sub-batch B en handler-eventos-sse cuando aplique).
 */

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, number>();

/**
 * Devuelve `true` si el eventId ya fue procesado dentro del TTL.
 * Side-effect: registra el eventId con expiry `Date.now() + TTL_MS`.
 */
export function esEventoDuplicado(eventId: string): boolean {
  const ahora = Date.now();
  // Cleanup oportunista de expirados.
  for (const [id, expira] of cache) {
    if (expira < ahora) cache.delete(id);
  }
  if (cache.has(eventId)) return true;
  cache.set(eventId, ahora + TTL_MS);
  return false;
}

/**
 * Helper de tests — limpia el cache. NO usar en producción.
 */
export function _resetDedupCacheParaTests(): void {
  cache.clear();
}
