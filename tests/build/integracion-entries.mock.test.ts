/**
 * Smoke test — los 4 nuevos entries exportan los símbolos esperados (T-7-NN).
 *
 * - `src/hono.ts`: rutasPagos, crearRutasPagos, adapterMemoria.
 * - `src/hono/upstash.ts`: adapterUpstash.
 * - `src/hono/durable-objects.ts`: adapterDurableObjects, SSEHub.
 * - `src/react.tsx`: BotonPago, useBotonPago.
 *
 * NO ejecuta los símbolos — solo valida que están presentes.
 */

import { describe, expect, it } from "vitest";

describe("Entry barrels — exports presentes", () => {
  it("src/hono.ts exporta rutasPagos + crearRutasPagos + adapterMemoria", async () => {
    const mod = await import("../../src/hono.js");
    expect(typeof mod.rutasPagos).toBe("function");
    expect(typeof mod.crearRutasPagos).toBe("function");
    expect(mod.crearRutasPagos).toBe(mod.rutasPagos);
    expect(typeof mod.adapterMemoria).toBe("function");
  });

  it("src/hono/upstash.ts exporta adapterUpstash", async () => {
    const mod = await import("../../src/hono/upstash.js");
    expect(typeof mod.adapterUpstash).toBe("function");
  });

  it("src/hono/durable-objects.ts exporta adapterDurableObjects + SSEHub", async () => {
    const mod = await import("../../src/hono/durable-objects.js");
    expect(typeof mod.adapterDurableObjects).toBe("function");
    expect(typeof mod.SSEHub).toBe("function"); // class
  });

  it("src/react.tsx exporta BotonPago + useBotonPago", async () => {
    const mod = await import("../../src/react.js");
    expect(typeof mod.BotonPago).toBe("function");
    expect(typeof mod.useBotonPago).toBe("function");
  });
});
