import type { PubSubAdapter } from "../domain/index.js";

/**
 * Tipos minimalistas de Cloudflare Durable Objects para evitar la
 * dependencia dura sobre `@cloudflare/workers-types` desde el SDK.
 * El consumidor que usa este adapter ya tiene los tipos completos
 * en su proyecto Worker.
 */
export interface DurableObjectId {
  readonly name?: string;
  toString(): string;
  equals(other: DurableObjectId): boolean;
}

export interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespace {
  newUniqueId(): DurableObjectId;
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface OpcionesDurableObjects {
  binding: DurableObjectNamespace;
  /** Default `'default'`. Permite multi-tenant (un DO por tenant). */
  nombreObjeto?: string;
}

/**
 * Marca usada por `handler-eventos-sse` para detectar que el adapter es DO
 * y NO invocar `pubsub.suscribir` (que es placeholder en este adapter).
 * En su lugar, el handler abre fetch GET al stub directamente y consume
 * el sub-protocolo NDJSON.
 */
export const MARCA_ADAPTER_DURABLE_OBJECTS = Symbol.for(
  '@eva/procesador-pagos-sdk/adapter-durable-objects',
);

/**
 * Adapter pub/sub backed by DO + SSEHub. La forma extendida del adapter
 * incluye la `MARCA_ADAPTER_DURABLE_OBJECTS` y el `binding` + `nombreObjeto`
 * resueltos para que el handler pueda hacer fetch directo al stub.
 */
export interface PubSubAdapterDurableObjects extends PubSubAdapter {
  readonly [MARCA_ADAPTER_DURABLE_OBJECTS]: true;
  readonly binding: DurableObjectNamespace;
  readonly nombreObjeto: string;
}

/**
 * Adapter pub/sub backed por Cloudflare Durable Objects + clase `SSEHub`
 * (REQ-PUBSUB-004).
 *
 * `publicar` → POST /publish al DO stub con `{ canal, evento }`.
 * `suscribir` → throw placeholder; en Sub-batch A NO se implementa
 * porque la suscripción cross-instance requiere lógica del
 * `handler-eventos-sse` (Fase 4) que abre fetch GET al stub y consume
 * NDJSON. La interface se mantiene compatible para que tests de contrato
 * compartido sepan distinguir el caso DO.
 *
 * En Sub-batch B (Fase 4) el handler-eventos-sse usará directamente el
 * stub via `binding.idFromName(...).fetch(GET ...)` y consumirá el
 * sub-protocolo NDJSON expuesto por `SSEHub`.
 */
export function adapterDurableObjects(
  opciones: OpcionesDurableObjects,
): PubSubAdapterDurableObjects {
  const nombre = opciones.nombreObjeto ?? "default";

  return {
    [MARCA_ADAPTER_DURABLE_OBJECTS]: true,
    binding: opciones.binding,
    nombreObjeto: nombre,
    async publicar(canal, mensaje) {
      const id = opciones.binding.idFromName(nombre);
      const stub = opciones.binding.get(id);
      const res = await stub.fetch("https://sse-hub/publish", {
        method: "POST",
        body: JSON.stringify({ canal, evento: mensaje }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(
          `[procesador-pagos-sdk] adapterDurableObjects.publicar: DO respondió ${res.status}`,
        );
      }
    },
    async suscribir(_canal, _handler) {
      throw new Error(
        "[procesador-pagos-sdk] adapterDurableObjects.suscribir: " +
          "subscribe se hace vía handler-eventos-sse directamente al DO stub. " +
          "El handler detecta el adapter por MARCA_ADAPTER_DURABLE_OBJECTS y " +
          "pipea el stream NDJSON sin pasar por este método.",
      );
    },
  };
}

/** Type-guard para detectar adapter DO en `handler-eventos-sse`. */
export function esAdapterDurableObjects(
  adapter: PubSubAdapter,
): adapter is PubSubAdapterDurableObjects {
  return (
    (adapter as PubSubAdapterDurableObjects)[MARCA_ADAPTER_DURABLE_OBJECTS] === true
  );
}
