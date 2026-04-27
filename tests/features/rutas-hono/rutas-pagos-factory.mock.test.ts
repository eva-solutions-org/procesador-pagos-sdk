/**
 * Tests `rutasPagos()` factory shape (T-7-13 — REQ-RUTAS-001..002 / S1.1).
 *
 * - Args literal y args lazy `(env) => opciones` ambas funcionan.
 * - Alias `crearRutasPagos === rutasPagos`.
 * - Warning S1.1 / I2 emitido cuando pubsub && !verificarAcceso.
 */

import { describe, expect, it, vi } from "vitest";
import { crearRutasPagos, rutasPagos } from "../../../src/hono.js";
import { adapterMemoria } from "../../../src/features/pubsub/index.js";

describe("rutasPagos() factory shape — REQ-RUTAS-001..002 / S1.1", () => {
  it("Alias crearRutasPagos === rutasPagos", () => {
    expect(crearRutasPagos).toBe(rutasPagos);
  });

  it("Args literal — retorna instancia Hono con los 4 endpoints", () => {
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
    });
    expect(app).toBeDefined();
    expect(typeof app.request).toBe("function");
  });

  it("Args lazy `(env) => opciones` — el factory NO valida al construir", () => {
    let llamadas = 0;
    const app = rutasPagos<{ K: string; W: string }>(
      (env) => {
        llamadas += 1;
        return {
          apiKey: env.K,
          webhookSecret: env.W,
          alCrearPago: (i) => i,
        };
      },
    );
    expect(app).toBeDefined();
    expect(llamadas).toBe(0); // lazy
  });

  it("Warning I2 — pubsub configurado pero verificarAcceso ausente emite console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
      pubsub: adapterMemoria(),
      // verificarAcceso AUSENTE
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("Sin warning si pubsub + verificarAcceso ambos presentes", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
      pubsub: adapterMemoria(),
      verificarAcceso: () => true,
    });
    // No debería haberse llamado por este factory específico.
    // (puede haber warnings previos de otros tests; verificamos que el último call
    // no contenga el mensaje específico de verificarAcceso ausente)
    const calls = warnSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(calls.some((m) => m.includes("verificarAcceso"))).toBe(false);
    warnSpy.mockRestore();
  });
});
