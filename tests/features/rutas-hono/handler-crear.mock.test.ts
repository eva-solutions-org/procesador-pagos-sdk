/**
 * Tests `POST /crear` (T-7-09 — REQ-RUTAS-003 / ADR-011 / S1.1).
 *
 * Mockea `crearCliente` para no tocar red. Usa `app.request(ruta, init)` de Hono.
 *
 * Cubre:
 * - 200 con body válido + alCrearPago invocado.
 * - 400 si body no JSON.
 * - 400 si Zod falla.
 * - modo 'sse' si pubsub presente; 'polling' sino.
 * - "Atacante manipula monto, alCrearPago recalcula desde BD".
 */

import { describe, expect, it, vi } from "vitest";

const crearPagoMock = vi.fn();

vi.mock("../../../src/core/cliente/index.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/core/cliente/index.js")
  >("../../../src/core/cliente/index.js");
  return {
    ...actual,
    crearCliente: vi.fn(() => ({
      pagos: { crearPago: crearPagoMock, consultarPago: vi.fn() },
    })),
  };
});

import { rutasPagos } from "../../../src/hono.js";
import { adapterMemoria } from "../../../src/features/pubsub/index.js";

describe("POST /crear — REQ-RUTAS-003 / S1.1", () => {
  it("200 con body válido + alCrearPago invocado + modo 'polling' sin pubsub", async () => {
    crearPagoMock.mockReset();
    crearPagoMock.mockResolvedValue({
      success: true,
      data: {
        pagoId: "p1",
        intentId: "intent-x",
        paymentLink: "https://pay/x",
        qrCodeUrl: null,
        qrCodeEmv: null,
        estado: "pendiente",
        pasarela: "prometeo",
        montoOriginal: "10.00",
        monedaOriginal: "USD",
        expiresAt: null,
      },
    });

    const alCrearPago = vi.fn(async (input) => input);
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago,
    });

    const res = await app.request("/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monto: "10.00",
        moneda: "USD",
        referenciaExterna: "ref-1",
        tipo: "pago_unico",
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { intentId: string; pagoId: string; modo: string; basePath: string };
    expect(data.pagoId).toBe("p1");
    expect(data.intentId).toBe("intent-x");
    expect(data.modo).toBe("polling");
    expect(alCrearPago).toHaveBeenCalledOnce();
  });

  it("modo 'sse' cuando pubsub está presente", async () => {
    crearPagoMock.mockReset();
    crearPagoMock.mockResolvedValue({
      success: true,
      data: {
        pagoId: "p2",
        intentId: "i2",
        paymentLink: "x",
        qrCodeUrl: null,
        qrCodeEmv: null,
        estado: "pendiente",
        pasarela: "prometeo",
        montoOriginal: "10.00",
        monedaOriginal: "USD",
        expiresAt: null,
      },
    });

    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
      pubsub: adapterMemoria(),
    });
    const res = await app.request("/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monto: "10.00",
        moneda: "USD",
        referenciaExterna: "ref-2",
        tipo: "pago_unico",
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { modo: string };
    expect(data.modo).toBe("sse");
  });

  it("400 si body no es JSON válido", async () => {
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
    });
    const res = await app.request("/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "<not json>",
    });
    expect(res.status).toBe(400);
  });

  it("400 si Zod falla (referenciaExterna ausente)", async () => {
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
    });
    const res = await app.request("/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto: "10.00", moneda: "USD", tipo: "pago_unico" }),
    });
    expect(res.status).toBe(400);
  });

  it("413 si body excede el límite configurado", async () => {
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: (i) => i,
    });
    const body = JSON.stringify({
      monto: "10.00",
      moneda: "USD",
      referenciaExterna: "ref-big",
      tipo: "pago_unico",
      metadata: { blob: "x".repeat(80 * 1024) },
    });
    const res = await app.request("/crear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(new TextEncoder().encode(body).byteLength),
      },
      body,
    });
    expect(res.status).toBe(413);
  });

  it("Atacante manipula monto, alCrearPago recalcula desde BD (S1.1)", async () => {
    crearPagoMock.mockReset();
    let inputRecibido: { monto: string; moneda: string } | null = null;
    crearPagoMock.mockImplementation(async (input: { monto: string; moneda: string }) => {
      inputRecibido = input;
      return {
        success: true,
        data: {
          pagoId: "p3",
          intentId: "i3",
          paymentLink: "x",
          qrCodeUrl: null,
          qrCodeEmv: null,
          estado: "pendiente",
          pasarela: "prometeo",
          montoOriginal: input.monto,
          monedaOriginal: input.moneda,
          expiresAt: null,
        },
      };
    });

    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      // Hook recalcula a 100.00 sin importar lo que mande el frontend.
      alCrearPago: async (input) => ({ ...input, monto: "100.00", moneda: "PEN" }),
    });
    const res = await app.request("/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monto: "0.01", // atacante
        moneda: "USD", // atacante
        referenciaExterna: "ref-attack",
        tipo: "pago_unico",
      }),
    });
    expect(res.status).toBe(200);
    expect(inputRecibido).not.toBeNull();
    expect(inputRecibido!.monto).toBe("100.00");
    expect(inputRecibido!.moneda).toBe("PEN");
  });

  it("500 si alCrearPago throwea", async () => {
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: "s",
      alCrearPago: () => {
        throw new Error("boom");
      },
    });
    const res = await app.request("/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monto: "10.00",
        moneda: "USD",
        referenciaExterna: "ref-x",
        tipo: "pago_unico",
      }),
    });
    expect(res.status).toBe(500);
  });
});
