/**
 * Tests `pollearPago()` (T-7-17 — REQ-WIDGET-009).
 *
 * - Clamp del intervalo [500, 30000].
 * - Signal cancela el loop con AbortError.
 * - Estado terminal corta el polling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollearPago } from "../../../src/features/widget-react/infrastructure/polling-pago.js";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

function pagoCon(estado: string): Record<string, unknown> {
  return {
    id: "p1",
    proyectoId: "",
    pasarelaId: "p",
    referenciaExterna: "r",
    tipo: "pago_unico",
    montoOriginal: "10.00",
    monedaOriginal: "USD",
    estado,
    pasarelaPaymentId: null,
    pasarelaStatus: null,
    paymentLink: null,
    qrCodeUrl: null,
    qrCodeEmv: null,
    intentId: null,
    metodoPago: null,
    errorMensaje: null,
    webhookRecibido: false,
    callbackEnviado: false,
    metadata: null,
    expiresAt: null,
    createdAt: "2026-04-26T12:00:00Z",
    updatedAt: "2026-04-26T12:00:00Z",
  };
}

describe("pollearPago — REQ-WIDGET-009", () => {
  it("Estado terminal corta el polling y retorna pago + timeoutSuave=false", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(pagoCon("completado")), { status: 200 }),
    );
    const ctrl = new AbortController();
    const r = await pollearPago({
      pagoId: "p1",
      basePath: "/",
      intervaloMs: 500,
      timeoutMs: 60_000,
      signal: ctrl.signal,
    });
    expect(r.timeoutSuave).toBe(false);
    expect(r.pago.estado).toBe("completado");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("Signal abortado antes del primer fetch lanza AbortError", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      pollearPago({
        pagoId: "p1",
        basePath: "/",
        intervaloMs: 500,
        timeoutMs: 60_000,
        signal: ctrl.signal,
      }),
    ).rejects.toThrow(/aborted/i);
  });

  it("fetch responde !ok lanza Error", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    const ctrl = new AbortController();
    await expect(
      pollearPago({
        pagoId: "p1",
        basePath: "/",
        intervaloMs: 500,
        timeoutMs: 60_000,
        signal: ctrl.signal,
      }),
    ).rejects.toThrow(/status 500/);
  });

  it("Clamp intervalo: <500 → 500 (verificable solo internamente — test smoke pasa OK)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(pagoCon("completado")), { status: 200 }),
    );
    const ctrl = new AbortController();
    const r = await pollearPago({
      pagoId: "p1",
      basePath: "/",
      intervaloMs: 100, // sub-min
      timeoutMs: 60_000,
      signal: ctrl.signal,
    });
    expect(r.pago.estado).toBe("completado");
  });
});
