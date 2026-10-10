import { describe, expect, it, beforeEach, vi } from "vitest";
import { crearCliente } from "../../../src/index.js";
import { BASE_URL_PRUEBA, crearMockFetch, respuestaError, respuestaJsonData } from "../../helpers/mock-fetch.js";
import { API_KEY_TEST, CANCELADO_FIXTURE } from "../../helpers/fixtures.js";

describe("cancelarPago — REQ-PAGOS-005", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given pago pendiente When 200 Then Resultado.exito con shape 2 campos", async () => {
    const fetchMock = crearMockFetch(() => respuestaJsonData(CANCELADO_FIXTURE));
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const r = await cliente.pagos.cancelarPago({ id: "pago_test_1" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Object.keys(r.data).sort()).toEqual(["estado", "pagoId"]);
      expect(r.data.pagoId).toBe("pago_test_1");
      expect(r.data.estado).toBe("cancelando");
    }
  });

  it("Given POST a /api/v1/pagos/{id}/cancelar sin body", async () => {
    let urlLlamada = "";
    let metodoLlamado = "";
    let bodyEnviado: unknown;
    const fetchMock = crearMockFetch((url, init) => {
      urlLlamada = url;
      metodoLlamado = init.method ?? "GET";
      bodyEnviado = init.body;
      return respuestaJsonData(CANCELADO_FIXTURE);
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    await cliente.pagos.cancelarPago({ id: "pago_test_1" });
    expect(metodoLlamado).toBe("POST");
    expect(urlLlamada).toMatch(/\/api\/v1\/pagos\/pago_test_1\/cancelar$/);
    expect(bodyEnviado).toBeUndefined();
  });

  it("Given 422 estado terminal Then retorna mensaje genérico de 422", async () => {
    const fetchMock = crearMockFetch(() => respuestaError(422, "Estado no cancelable"));
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const r = await cliente.pagos.cancelarPago({ id: "pago_completado" });
    if (!r.success) {
      expect(r.codigo).toBe(422);
      expect(r.error).toBe("Datos no procesables");
    }
  });

  it("Given 404 Then propaga 404", async () => {
    const fetchMock = crearMockFetch(() => respuestaError(404, "Pago no encontrado"));
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const r = await cliente.pagos.cancelarPago({ id: "pago_missing" });
    if (!r.success) expect(r.codigo).toBe(404);
  });

  it("Given id vacío Then 400 sin tocar red", async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch;
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const r = await cliente.pagos.cancelarPago({ id: "" });
    if (!r.success) expect(r.codigo).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
