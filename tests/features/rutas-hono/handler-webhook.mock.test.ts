/**
 * Tests `POST /webhook` (T-7-10 — REQ-RUTAS-004 / REQ-SSE-005 / ADR-012).
 *
 * - Firma válida → hooks invocados (`alWebhookRecibido`, `alConfirmar`/`alFallar`).
 * - Firma inválida → 401.
 * - Body no-JSON post-firma OK → 422.
 * - Dedup por eventId.
 */

import { describe, expect, it, vi } from "vitest";
import { rutasPagos } from "../../../src/hono.js";
import {
  SECRET_KEY_TEST,
  generarFirmaWebhookTest,
} from "../../helpers/fixtures.js";
import { _resetDedupCacheParaTests } from "../../../src/features/sse-stream/index.js";

function payloadWebhook(overrides: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    pagoId: "p-webhook-1",
    referenciaExterna: "ref-1",
    estado: "completado",
    estadoAnterior: "pendiente",
    monto: "100.00",
    moneda: "USD",
    pasarela: "prometeo",
    metadata: { tag: "test" },
    timestamp: "2026-04-26T12:00:00.000Z",
    ...overrides,
  });
}

async function reqFirmado(
  body: string,
  secret = SECRET_KEY_TEST,
): Promise<{ headers: Record<string, string>; body: string }> {
  const firma = await generarFirmaWebhookTest(body, secret);
  return {
    headers: {
      "Content-Type": "application/json",
      "X-Signature": `sha256=${firma}`,
    },
    body,
  };
}

describe("POST /webhook — REQ-RUTAS-004", () => {
  it("Firma válida → 200 + alWebhookRecibido + alConfirmar", async () => {
    _resetDedupCacheParaTests();
    const alWebhookRecibido = vi.fn();
    const alConfirmar = vi.fn();
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: SECRET_KEY_TEST,
      alCrearPago: (i) => i,
      alWebhookRecibido,
      alConfirmar,
    });
    const { headers, body } = await reqFirmado(payloadWebhook());
    const res = await app.request("/webhook", { method: "POST", headers, body });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(alWebhookRecibido).toHaveBeenCalledOnce();
    expect(alConfirmar).toHaveBeenCalledOnce();
  });

  it("Firma inválida → 401", async () => {
    _resetDedupCacheParaTests();
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: SECRET_KEY_TEST,
      alCrearPago: (i) => i,
    });
    const res = await app.request("/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": "sha256=" + "a".repeat(64),
      },
      body: payloadWebhook(),
    });
    expect(res.status).toBe(401);
  });

  it("Body no-JSON post-firma OK → 422", async () => {
    _resetDedupCacheParaTests();
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: SECRET_KEY_TEST,
      alCrearPago: (i) => i,
    });
    const cuerpoMalo = "not json at all";
    const { headers } = await reqFirmado(cuerpoMalo);
    const res = await app.request("/webhook", {
      method: "POST",
      headers,
      body: cuerpoMalo,
    });
    expect(res.status).toBe(422);
  });

  it("Dedup por eventId — segundo POST con mismo payload retorna deduped", async () => {
    _resetDedupCacheParaTests();
    const alWebhookRecibido = vi.fn();
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: SECRET_KEY_TEST,
      alCrearPago: (i) => i,
      alWebhookRecibido,
    });
    const { headers, body } = await reqFirmado(payloadWebhook());

    const res1 = await app.request("/webhook", { method: "POST", headers, body });
    expect(res1.status).toBe(200);
    const res2 = await app.request("/webhook", { method: "POST", headers, body });
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as { deduped?: boolean };
    expect(json2.deduped).toBe(true);
    expect(alWebhookRecibido).toHaveBeenCalledOnce(); // solo 1 vez
  });

  it("Estado fallido invoca alFallar", async () => {
    _resetDedupCacheParaTests();
    const alFallar = vi.fn();
    const app = rutasPagos({
      apiKey: "k",
      webhookSecret: SECRET_KEY_TEST,
      alCrearPago: (i) => i,
      alFallar,
    });
    const { headers, body } = await reqFirmado(
      payloadWebhook({ estado: "fallido", pagoId: "fail-1" }),
    );
    const res = await app.request("/webhook", { method: "POST", headers, body });
    expect(res.status).toBe(200);
    expect(alFallar).toHaveBeenCalledOnce();
  });
});
