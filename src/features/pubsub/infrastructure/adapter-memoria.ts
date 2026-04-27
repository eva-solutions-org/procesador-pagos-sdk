import type { PubSubAdapter } from "../domain/index.js";

/**
 * Adapter pub/sub en memoria del proceso (REQ-PUBSUB-002).
 *
 * `Map<canal, Set<handler>>` aislado por canal, sin persistencia.
 * Apto para entornos sin pubsub externo (ej. Node single-process,
 * tests, demos). NO sobrevive crashes ni multi-instance.
 *
 * Garantías:
 * - publicar→suscribir entrega al handler en orden de registro.
 * - Errores en un handler NO propagan a otros (aislamiento).
 * - unsubscribe idempotente: llamarlo 2 veces no throwea.
 */
export function adapterMemoria(): PubSubAdapter {
  const canales = new Map<
    string,
    Set<(msg: unknown) => void | Promise<void>>
  >();

  return {
    async publicar(canal, mensaje) {
      const handlers = canales.get(canal);
      if (!handlers) return;
      for (const h of handlers) {
        try {
          await h(mensaje);
        } catch {
          // Aislar errores entre handlers — un handler que throwea
          // NO debe afectar al resto.
        }
      }
    },
    async suscribir(canal, handler) {
      let set = canales.get(canal);
      if (!set) {
        set = new Set();
        canales.set(canal, set);
      }
      const wrapped = handler as (msg: unknown) => void | Promise<void>;
      set.add(wrapped);
      return () => {
        const actual = canales.get(canal);
        if (!actual) return;
        actual.delete(wrapped);
        if (actual.size === 0) canales.delete(canal);
      };
    },
  };
}
