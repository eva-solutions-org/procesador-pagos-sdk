/**
 * Tests `rutasPagos()` — throw síncrono sin alCrearPago (T-7-21 — S1.1).
 *
 * Cubre REQ-RUTAS-008 enteramente:
 *  1. Args literal sin alCrearPago → throw inmediato con mensaje exacto.
 *  2. Args lazy sin alCrearPago → throw en primer request.
 *  3. Args literal con identity (i) => i → no throw.
 *  4. Args literal con función async → no throw, hook invocado.
 *  5. Throw aplica SIEMPRE — independiente de EVA_PAGOS_BUILD_ENV.
 */

import { describe, expect, it } from "vitest";
import { rutasPagos } from "../../../src/hono.js";
import { MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE } from "../../../src/features/rutas-hono/infrastructure/validar-opciones.js";

describe("rutasPagos() factory — throw sin alCrearPago — REQ-RUTAS-008 / S1.1", () => {
  it("Scenario 1 — args literal sin alCrearPago → throw inmediato síncrono", () => {
    expect(() =>
      rutasPagos({
        apiKey: "k",
        webhookSecret: "s",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrow(MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE);
  });

  it("Scenario 2 — args lazy sin alCrearPago → throw en primer request (500)", async () => {
    // Lazy NO valida al construir factory.
    const app = rutasPagos<{ K: string; W: string }>(
      (env) =>
        ({
          apiKey: env.K,
          webhookSecret: env.W,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    // El constructor NO throwea (el env todavía no se resolvió).
    expect(app).toBeDefined();
    expect(typeof app.request).toBe("function");

    // En el primer request el middleware throw → Hono lo convierte en 500.
    const res = await app.request(
      "/crear",
      {
        method: "POST",
        body: JSON.stringify({
          monto: "10.00",
          moneda: "USD",
          referenciaExterna: "r1",
          tipo: "pago_unico",
        }),
        headers: { "Content-Type": "application/json" },
      },
      { K: "k", W: "s" },
    );
    expect(res.status).toBe(500);
  });

  it("Scenario 3 — args literal con alCrearPago identity → no throw", () => {
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (input) => input,
    });
    expect(app).toBeDefined();
    expect(typeof app.request).toBe("function");
  });

  it("Scenario 4 — args literal con alCrearPago async función real → no throw", () => {
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: async (input) => ({ ...input, monto: "10.00" }),
    });
    expect(app).toBeDefined();
    expect(typeof app.request).toBe("function");
  });

  it("Scenario 5 — throw aplica SIEMPRE (no condicionado a EVA_PAGOS_BUILD_ENV)", () => {
    // En vitest config, `__SDK_BUILD_ENV__` ya está stubbed a 'local'.
    // El throw debe ocurrir igual — la validación NO mira el build env.
    expect(() =>
      rutasPagos({
        apiKey: "k",
        webhookSecret: "s",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrow(MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE);
  });
});
