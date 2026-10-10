import { describe, expect, it, beforeEach, vi } from "vitest";
import { crearCliente } from "../../../src/index.js";
import { BASE_URL_PRUEBA, crearMockFetch, respuestaError, respuestaJsonData } from "../../helpers/mock-fetch.js";
import {
  API_KEY_TEST,
  CREAR_PAGO_RESPONSE_FIXTURE,
  inputCrearPagoValido,
} from "../../helpers/fixtures.js";

describe("crearPago — REQ-PAGOS-001 (C6 + I8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given input válido When servicio responde 201 Then Resultado.exito con shape de 10 campos", async () => {
    const fetchMock = crearMockFetch(() =>
      respuestaJsonData(CREAR_PAGO_RESPONSE_FIXTURE, { status: 201 }),
    );
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });

    const r = await cliente.pagos.crearPago(inputCrearPagoValido());
    expect(r.success).toBe(true);
    if (r.success) {
      // I8 — exactamente 10 campos
      expect(Object.keys(r.data).sort()).toEqual(
        [
          "estado",
          "expiresAt",
          "intentId",
          "monedaOriginal",
          "montoOriginal",
          "pagoId",
          "pasarela",
          "paymentLink",
          "qrCodeEmv",
          "qrCodeUrl",
        ].sort(),
      );
      expect(r.data.pagoId).toBe("pago_test_1");
      expect(r.data.estado).toBe("pendiente");
    }
  });

  it("Given monto formato inválido Then 400 sin tocar red", async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch;
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const r = await cliente.pagos.crearPago({
      monto: "150.5",
      moneda: "USD",
      tipo: "pago_unico",
      referenciaExterna: "ref-1",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.codigo).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given moneda no-3-chars Then 400 sin tocar red", async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch;
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const r = await cliente.pagos.crearPago({
      monto: "150.00",
      moneda: "US",
      tipo: "pago_unico",
      referenciaExterna: "ref-1",
    });
    if (!r.success) expect(r.codigo).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given tipo fuera enum Then 400 sin tocar red", async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch;
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const r = await cliente.pagos.crearPago({
      monto: "150.00",
      moneda: "USD",
      tipo: "transferencia" as unknown as "pago_unico",
      referenciaExterna: "ref-1",
    });
    if (!r.success) expect(r.codigo).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given 409 por conflicto de negocio Then retorna mensaje genérico de 409", async () => {
    const fetchMock = crearMockFetch(() => respuestaError(409, "ReferenciaExterna duplicada"));
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const r = await cliente.pagos.crearPago(inputCrearPagoValido());
    if (!r.success) {
      expect(r.codigo).toBe(409);
      expect(r.error).toBe("Conflicto");
    }
  });

  it("Given metadata grande (C6) Then SDK NO valida local — emite request", async () => {
    let urlLlamada = "";
    const fetchMock = crearMockFetch((url) => {
      urlLlamada = url;
      return respuestaError(413, "Payload too large");
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const metadata: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) {
      metadata[`key${String(i)}`] = "a".repeat(50);
    }
    const r = await cliente.pagos.crearPago({
      ...inputCrearPagoValido(),
      metadata,
    });
    // Request fue emitido aunque metadata excede 8KB
    expect(urlLlamada).toContain("/api/v1/pagos");
    if (!r.success) expect(r.codigo).toBe(413);
  });

  it("Given signal abort externo Then Resultado falla 503 (no throw)", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return respuestaJsonData(CREAR_PAGO_RESPONSE_FIXTURE, { status: 201 });
    }) as unknown as typeof globalThis.fetch;

    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const r = await cliente.pagos.crearPago(inputCrearPagoValido(), { signal: ctrl.signal });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.codigo).toBe(503);
  });

  it("Given moneda lowercase Then se normaliza a uppercase en request", async () => {
    let bodyEnviado: unknown = null;
    const fetchMock = crearMockFetch((_url, init) => {
      bodyEnviado = JSON.parse(init.body as string) as unknown;
      return respuestaJsonData(CREAR_PAGO_RESPONSE_FIXTURE, { status: 201 });
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    await cliente.pagos.crearPago({
      monto: "150.00",
      moneda: "usd",
      tipo: "pago_unico",
      referenciaExterna: "ref-1",
    });
    expect((bodyEnviado as { moneda: string }).moneda).toBe("USD");
  });
});
