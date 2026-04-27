/**
 * Tests `adapterMemoria()` (T-7-01 — REQ-PUBSUB-002).
 *
 * - publicar emite a todos los suscriptores.
 * - suscribir retorna unsubscribe idempotente.
 * - canales aislados.
 * - errors en handler aislados (no propagan).
 */

import { describe, expect, it } from "vitest";
import { adapterMemoria } from "../../../src/features/pubsub/index.js";

describe("adapterMemoria — REQ-PUBSUB-002", () => {
  it("publicar emite a todos los suscriptores en orden de registro", async () => {
    const adapter = adapterMemoria();
    const recibidos: number[] = [];
    await adapter.suscribir<number>("c1", (m) => {
      recibidos.push(m);
    });
    await adapter.suscribir<number>("c1", (m) => {
      recibidos.push(m * 10);
    });
    await adapter.publicar("c1", 5);
    expect(recibidos).toEqual([5, 50]);
  });

  it("suscribir retorna unsubscribe que remueve el handler", async () => {
    const adapter = adapterMemoria();
    const recibidos: number[] = [];
    const unsub = await adapter.suscribir<number>("c1", (m) => {
      recibidos.push(m);
    });
    await adapter.publicar("c1", 1);
    await unsub();
    await adapter.publicar("c1", 2);
    expect(recibidos).toEqual([1]);
  });

  it("unsubscribe es idempotente — invocarlo 2 veces no throwea", async () => {
    const adapter = adapterMemoria();
    const unsub = await adapter.suscribir("c1", () => undefined);
    await unsub();
    // Segundo unsub no throw
    await expect(Promise.resolve(unsub())).resolves.not.toThrow();
  });

  it("canales aislados — publicar en c1 NO llega a suscriptores de c2", async () => {
    const adapter = adapterMemoria();
    const recibidosC1: string[] = [];
    const recibidosC2: string[] = [];
    await adapter.suscribir<string>("c1", (m) => {
      recibidosC1.push(m);
    });
    await adapter.suscribir<string>("c2", (m) => {
      recibidosC2.push(m);
    });
    await adapter.publicar("c1", "hola");
    expect(recibidosC1).toEqual(["hola"]);
    expect(recibidosC2).toEqual([]);
  });

  it("errors en un handler NO propagan a otros suscriptores", async () => {
    const adapter = adapterMemoria();
    const recibidos: string[] = [];
    await adapter.suscribir<string>("c1", () => {
      throw new Error("primer handler boom");
    });
    await adapter.suscribir<string>("c1", (m) => {
      recibidos.push(m);
    });
    // publicar NO debe rechazar
    await expect(adapter.publicar("c1", "hola")).resolves.toBeUndefined();
    expect(recibidos).toEqual(["hola"]);
  });

  it("publicar a canal sin suscriptores no throwea", async () => {
    const adapter = adapterMemoria();
    await expect(adapter.publicar("ghost", { x: 1 })).resolves.toBeUndefined();
  });
});
