/**
 * Interface canónica que abstrae pub/sub para SSE (REQ-PUBSUB-001).
 *
 * Implementaciones que ship-ea el SDK:
 * - `adapterMemoria()` — proceso único, sin deps externas.
 * - `adapterUpstash({ url, token })` — Upstash Redis con HTTP streaming.
 * - `adapterDurableObjects({ binding })` — Cloudflare Durable Objects.
 *
 * El consumidor puede implementar su propio adapter; debe pasar el contract
 * test compartido (publish→subscribe, multi-suscriptores, unsubscribe,
 * aislamiento por canal).
 */
export interface PubSubAdapter {
  /**
   * Publica `mensaje` en `canal`. Idempotente desde la perspectiva del
   * adapter (la dedup vive en `dedup-eventos.ts`).
   */
  publicar<T = unknown>(canal: string, mensaje: T): Promise<void>;

  /**
   * Suscribe `handler` a `canal`. Retorna `unsubscribe()` que libera
   * recursos (delete del Set, cierre de stream HTTP, abort, etc.).
   * `unsubscribe()` MUST ser idempotente.
   */
  suscribir<T = unknown>(
    canal: string,
    handler: (mensaje: T) => void | Promise<void>,
  ): Promise<() => void | Promise<void>>;
}
