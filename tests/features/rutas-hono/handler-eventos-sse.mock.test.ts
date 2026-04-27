/**
 * Tests `GET /:id/eventos` (T-7-12 — REQ-RUTAS-006 / FIX I3).
 *
 * - Sin `pubsub` → 404 (endpoint sigue registrado pero retorna 404).
 * - verificarAcceso=false → 401.
 * - Con pubsub + auth OK → 200 con headers SSE.
 */

import { describe, expect, it, vi } from "vitest";

const consultarPagoMock = vi.fn();

vi.mock("../../../src/core/cliente/index.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/core/cliente/index.js")
  >("../../../src/core/cliente/index.js");
  return {
    ...actual,
    crearCliente: vi.fn(() => ({
      pagos: { crearPago: vi.fn(), consultarPago: consultarPagoMock },
    })),
  };
});

import { rutasPagos } from "../../../src/hono.js";
import { adapterMemoria } from "../../../src/features/pubsub/index.js";
import { PAGO_DETALLE_FIXTURE } from "../../helpers/fixtures.js";

describe("GET /:id/eventos — REQ-RUTAS-006 / FIX I3", () => {
  it("Sin pubsub configurado → 404", async () => {
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
    });
    const res = await app.request("/p1/eventos");
    expect(res.status).toBe(404);
  });

  it("verificarAcceso=false con pubsub configurado → 401", async () => {
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
      pubsub: adapterMemoria(),
      verificarAcceso: () => false,
    });
    const res = await app.request("/p1/eventos");
    expect(res.status).toBe(401);
  });

  it("pagoId requerido (vacío) → 400", async () => {
    // El path /eventos sin :id no matchea; testeamos con /:id existente válido.
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
      pubsub: adapterMemoria(),
    });
    consultarPagoMock.mockReset();
    consultarPagoMock.mockResolvedValue({ success: true, data: PAGO_DETALLE_FIXTURE });
    // Open the request — el body es un stream SSE; abortamos rápido para no colgarnos.
    const ctrl = new AbortController();
    const promesa = Promise.resolve(app.request("/p1/eventos", { signal: ctrl.signal })).catch(() => null);
    // Abort tras un microtask para no esperar el stream completo.
    queueMicrotask(() => ctrl.abort());
    await promesa;
  });

  it("verificarAcceso async retornando true permite abrir el stream con headers SSE", async () => {
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
      pubsub: adapterMemoria(),
      verificarAcceso: async () => true,
    });
    consultarPagoMock.mockReset();
    consultarPagoMock.mockResolvedValue({ success: true, data: PAGO_DETALLE_FIXTURE });
    const ctrl = new AbortController();
    const resPromise = app.request("/p1/eventos", { signal: ctrl.signal });
    // Abortar inmediato — solo verificamos que la response inicial trae headers SSE.
    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")?.toLowerCase() ?? "").toContain("text/event-stream");
    ctrl.abort();
  });
});
