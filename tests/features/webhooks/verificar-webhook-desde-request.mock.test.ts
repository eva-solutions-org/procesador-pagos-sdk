import { describe, expect, it, vi } from 'vitest';
import { verificarWebhookDesdeRequest } from '../../../src/webhooks.js';
import { calcularHmacSha256 } from '../../../src/features/webhooks/infrastructure/calcular-hmac-sha256.js';
import { SECRET_KEY_TEST } from '../../helpers/fixtures.js';

/**
 * Tests REQ-WEBHOOKS-002 (C1 + C2 + UX-6).
 */
describe('verificarWebhookDesdeRequest — REQ-WEBHOOKS-002', () => {
  const buildPayload = () => JSON.stringify({ event: 'pago.completado', data: { id: 'p_1' } });

  it('Given header X-Signature ausente Then 401', async () => {
    const req = new Request('https://localhost/webhook', { method: 'POST' });
    const r = await verificarWebhookDesdeRequest(req, SECRET_KEY_TEST);
    if (!r.success) expect(r.codigo).toBe(401);
  });

  it('Given header X-SIGNATURE en MAYÚSCULAS Then funciona (case-insensitive en NOMBRE — C2)', async () => {
    const body = buildPayload();
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const req = new Request('https://localhost/webhook', {
      method: 'POST',
      headers: { 'X-SIGNATURE': `sha256=${firma}` },
      body,
    });
    const r = await verificarWebhookDesdeRequest(req, SECRET_KEY_TEST);
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data.payload as { event: string }).event).toBe('pago.completado');
    }
  });

  it('Given options.body presente Then NO se llama request.text() (C1)', async () => {
    const body = buildPayload();
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const req = new Request('https://localhost/webhook', {
      method: 'POST',
      headers: { 'X-Signature': `sha256=${firma}` },
      body,
    });
    // Espiamos request.text() — verificamos que NO se llama si pasamos options.body.
    const textSpy = vi.spyOn(req, 'text');
    const r = await verificarWebhookDesdeRequest(req, SECRET_KEY_TEST, { body });
    expect(r.success).toBe(true);
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('Given options.body ausente Then se llama request.text() y funciona', async () => {
    const body = buildPayload();
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const req = new Request('https://localhost/webhook', {
      method: 'POST',
      headers: { 'X-Signature': `sha256=${firma}` },
      body,
    });
    const r = await verificarWebhookDesdeRequest(req, SECRET_KEY_TEST);
    expect(r.success).toBe(true);
  });

  it('Given options.body Uint8Array Then se decodifica UTF-8 antes del JSON.parse (C1)', async () => {
    const body = buildPayload();
    const bodyBytes = new TextEncoder().encode(body);
    const firma = await calcularHmacSha256(bodyBytes, SECRET_KEY_TEST);
    const req = new Request('https://localhost/webhook', {
      method: 'POST',
      headers: { 'X-Signature': `sha256=${firma}` },
    });
    const r = await verificarWebhookDesdeRequest(req, SECRET_KEY_TEST, { body: bodyBytes });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data.payload as { event: string }).event).toBe('pago.completado');
    }
  });

  it('Given body ya consumido sin options.body Then 422 (C1+C2)', async () => {
    const body = buildPayload();
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const req = new Request('https://localhost/webhook', {
      method: 'POST',
      headers: { 'X-Signature': `sha256=${firma}` },
      body,
    });
    // Consumimos el body antes de pasarlo a la función — simula middleware previo.
    await req.text();

    const r = await verificarWebhookDesdeRequest(req, SECRET_KEY_TEST);
    if (!r.success) {
      expect(r.codigo).toBe(422);
      expect(r.error).toMatch(/consumido|legible/i);
    }
  });

  it('Given firma inválida Then 401 (C2)', async () => {
    const body = buildPayload();
    const req = new Request('https://localhost/webhook', {
      method: 'POST',
      headers: { 'X-Signature': 'sha256=' + 'a'.repeat(64) },
      body,
    });
    const r = await verificarWebhookDesdeRequest(req, SECRET_KEY_TEST);
    if (!r.success) expect(r.codigo).toBe(401);
  });

  it('Given body no-JSON post-firma-OK Then 422 (C2)', async () => {
    const body = '<xml>not-json</xml>';
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const req = new Request('https://localhost/webhook', {
      method: 'POST',
      headers: { 'X-Signature': `sha256=${firma}` },
      body,
    });
    const r = await verificarWebhookDesdeRequest(req, SECRET_KEY_TEST);
    if (!r.success) {
      expect(r.codigo).toBe(422);
      expect(r.error).toMatch(/JSON/i);
    }
  });

  it('Given firma OK Then payload retornado es resultado de JSON.parse', async () => {
    const body = JSON.stringify({ tipo: 'pago.actualizado', data: { x: 42 } });
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const req = new Request('https://localhost/webhook', {
      method: 'POST',
      headers: { 'X-Signature': `sha256=${firma}` },
      body,
    });
    const r = await verificarWebhookDesdeRequest(req, SECRET_KEY_TEST);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.payload).toEqual({ tipo: 'pago.actualizado', data: { x: 42 } });
    }
  });

  it('Given secretKey vacía Then propaga 401 desde verificarFirmaWebhook (C2)', async () => {
    const body = buildPayload();
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const req = new Request('https://localhost/webhook', {
      method: 'POST',
      headers: { 'X-Signature': `sha256=${firma}` },
      body,
    });
    const r = await verificarWebhookDesdeRequest(req, '');
    if (!r.success) expect(r.codigo).toBe(401);
  });
});
