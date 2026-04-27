import { Redis } from "@upstash/redis";
import type { PubSubAdapter } from "../domain/index.js";

/**
 * Adapter pub/sub backed por Upstash Redis (REQ-PUBSUB-003).
 *
 * Usa `@upstash/redis` como peer dep opcional importada via static import
 * (decisión M2 — sin try/catch dynamic; si la peer dep no está instalada,
 * el bundler falla con error claro al consumidor).
 *
 * Garantías:
 * - at-least-once entrega (Upstash Redis pub/sub puro, sin Streams).
 * - Sin persistencia: pérdida cubierta por snapshot inicial (REQ-SSE-001)
 *   + dedup eventId (REQ-SSE-005) + replay del DO (REQ-PUBSUB-006).
 *
 * **Desviación documentada del design v2.1**: el design original suponía
 * `redis.subscribe(channel, handler, { signal })` con HTTP streaming +
 * AbortSignal. La API real del SDK oficial `@upstash/redis@1.37+` es:
 *
 *   const subscriber = redis.subscribe(channel)  // retorna `Subscriber`
 *   subscriber.on('message', ({ channel, message }) => { ... })
 *   subscriber.unsubscribe()
 *
 * Mantenemos el contrato externo `PubSubAdapter` exacto (publicar +
 * suscribir → unsubscribe). La integración interna usa la API real.
 * Errores de red/parse se silencian (best-effort) — el consumidor que
 * necesite observabilidad pasa `onSubscribeError`/`onPublishError` a las
 * opciones del factory `rutasPagos()` (Sub-batch B).
 */

export interface OpcionesUpstash {
  url: string;
  token: string;
}

interface UpstashSubscriber {
  on(
    event: "message",
    listener: (data: { channel: string; message: unknown }) => void,
  ): UpstashSubscriber;
  unsubscribe(): Promise<unknown>;
}

export function adapterUpstash(opciones: OpcionesUpstash): PubSubAdapter {
  const redis = new Redis(opciones);

  return {
    async publicar(canal, mensaje) {
      await redis.publish(canal, JSON.stringify(mensaje));
    },
    async suscribir(canal, handler) {
      // El SDK acepta string | string[] — pasamos string single-channel.
      const subscriber = redis.subscribe(canal) as unknown as UpstashSubscriber;

      subscriber.on("message", ({ message }) => {
        try {
          const parsed =
            typeof message === "string" ? JSON.parse(message) : message;
          // handler typed via interface PubSubAdapter — runtime el tipo es unknown.
          void (handler as (msg: unknown) => void | Promise<void>)(parsed);
        } catch {
          // JSON inválido o handler que throwea — silenciado.
        }
      });

      let cerrado = false;
      return async () => {
        if (cerrado) return;
        cerrado = true;
        try {
          await subscriber.unsubscribe();
        } catch {
          // unsubscribe ya cerrado o stream caído — idempotente.
        }
      };
    },
  };
}
