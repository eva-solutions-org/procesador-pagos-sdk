/**
 * Tests `GET /:id` (T-7-11 — REQ-RUTAS-005 / ADR-019).
 *
 * - Consulta válida.
 * - verificarAcceso=false → 401.
 * - alAntesDeResponderPolling invocado.
 * - 404 si el servicio responde 404.
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
import { PAGO_DETALLE_FIXTURE } from "../../helpers/fixtures.js";

describe("GET /:id — REQ-RUTAS-005", () => {
  it("Consulta válida retorna 200 con detalle del pago", async () => {
    consultarPagoMock.mockReset();
    consultarPagoMock.mockResolvedValue({ success: true, data: PAGO_DETALLE_FIXTURE });
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
    });
    const res = await app.request("/pago_detalle_1");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string };
    expect(data.id).toBe("pago_detalle_1");
  });

  it("verificarAcceso=false → 401", async () => {
    consultarPagoMock.mockReset();
    consultarPagoMock.mockResolvedValue({ success: true, data: PAGO_DETALLE_FIXTURE });
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
      verificarAcceso: () => false,
    });
    const res = await app.request("/pago_detalle_1");
    expect(res.status).toBe(401);
  });

  it("alAntesDeResponderPolling invocado con el pago antes de responder", async () => {
    consultarPagoMock.mockReset();
    consultarPagoMock.mockResolvedValue({ success: true, data: PAGO_DETALLE_FIXTURE });
    const hookSpy = vi.fn();
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
      alAntesDeResponderPolling: hookSpy,
    });
    const res = await app.request("/pago_detalle_1");
    expect(res.status).toBe(200);
    expect(hookSpy).toHaveBeenCalledOnce();
    expect(hookSpy).toHaveBeenCalledWith(PAGO_DETALLE_FIXTURE);
  });

  it("404 si el servicio responde 404", async () => {
    consultarPagoMock.mockReset();
    consultarPagoMock.mockResolvedValue({ success: false, codigo: 404, error: "no encontrado" });
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
    });
    const res = await app.request("/no-existe");
    expect(res.status).toBe(404);
  });

  it("verificarAcceso async retornando true permite el flujo", async () => {
    consultarPagoMock.mockReset();
    consultarPagoMock.mockResolvedValue({ success: true, data: PAGO_DETALLE_FIXTURE });
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
      verificarAcceso: async () => true,
    });
    const res = await app.request("/pago_detalle_1");
    expect(res.status).toBe(200);
  });
});
