/**
 * Tests `adapterDurableObjects()` (T-7-03 — REQ-PUBSUB-004).
 *
 * Mockea `DurableObjectNamespace`. Verifica que:
 * - publicar invoca POST /publish al stub con shape `{ canal, evento }`.
 * - suscribir throwea (placeholder) — el flujo real va por `handler-eventos-sse`.
 * - El adapter retornado tiene la marca `MARCA_ADAPTER_DURABLE_OBJECTS`
 *   y `esAdapterDurableObjects()` devuelve true.
 */

import { describe, expect, it, vi } from "vitest";
import {
  MARCA_ADAPTER_DURABLE_OBJECTS,
  adapterDurableObjects,
  esAdapterDurableObjects,
  adapterMemoria,
  type DurableObjectNamespace,
} from "../../../src/features/pubsub/index.js";

function crearBindingMock(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  const stub = { fetch: vi.fn(fetchImpl) };
  const id = { toString: () => "id-mock", equals: () => false, name: "default" };
  const binding: DurableObjectNamespace = {
    newUniqueId: vi.fn(() => id),
    idFromName: vi.fn(() => id),
    idFromString: vi.fn(() => id),
    get: vi.fn(() => stub),
  };
  return { binding, stub };
}

describe("adapterDurableObjects — REQ-PUBSUB-004", () => {
  it("publicar invoca POST /publish con body { canal, evento } y headers JSON", async () => {
    const { binding, stub } = crearBindingMock(async () => new Response("{}", { status: 200 }));
    const adapter = adapterDurableObjects({ binding });
    const evento = { eventId: "abc", pagoId: "p1" };

    await adapter.publicar("pagos:p1", evento);

    expect(binding.idFromName).toHaveBeenCalledWith("default");
    expect(stub.fetch).toHaveBeenCalledOnce();
    const [url, init] = stub.fetch.mock.calls[0]!;
    expect(url).toBe("https://sse-hub/publish");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string) as unknown;
    expect(body).toEqual({ canal: "pagos:p1", evento });
    expect((init!.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("publicar lanza si DO responde !ok", async () => {
    const { binding } = crearBindingMock(async () => new Response("nope", { status: 500 }));
    const adapter = adapterDurableObjects({ binding });
    await expect(adapter.publicar("c1", { x: 1 })).rejects.toThrow(/DO respondió 500/);
  });

  it("nombreObjeto custom se usa en idFromName", async () => {
    const { binding } = crearBindingMock(async () => new Response("{}"));
    const adapter = adapterDurableObjects({ binding, nombreObjeto: "tenant-A" });
    await adapter.publicar("c1", {});
    expect(binding.idFromName).toHaveBeenCalledWith("tenant-A");
  });

  it("suscribir es placeholder y throwea con mensaje claro", async () => {
    const { binding } = crearBindingMock(async () => new Response("{}"));
    const adapter = adapterDurableObjects({ binding });
    await expect(adapter.suscribir("c1", () => undefined)).rejects.toThrow(
      /handler-eventos-sse/,
    );
  });

  it("MARCA_ADAPTER_DURABLE_OBJECTS presente y esAdapterDurableObjects() devuelve true", () => {
    const { binding } = crearBindingMock(async () => new Response("{}"));
    const adapter = adapterDurableObjects({ binding });
    expect(adapter[MARCA_ADAPTER_DURABLE_OBJECTS]).toBe(true);
    expect(esAdapterDurableObjects(adapter)).toBe(true);
    // El adapter de memoria NO tiene la marca.
    expect(esAdapterDurableObjects(adapterMemoria())).toBe(false);
  });
});
