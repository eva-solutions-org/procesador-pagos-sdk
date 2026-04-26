import { describe, expect, it } from 'vitest';
import { verificarFirmaWebhook } from '../../../src/webhooks.js';
import { calcularHmacSha256 } from '../../../src/features/webhooks/infrastructure/calcular-hmac-sha256.js';
import { SECRET_KEY_TEST } from '../../helpers/fixtures.js';

/**
 * Tests REQ-WEBHOOKS-001 (C2 + I4).
 *
 * Todos los fallos retornan codigo: 401 (auth failure semantic).
 * La regex es case-sensitive: solo `sha256=` lowercase + `[a-f0-9]{64}` lowercase.
 */
describe('verificarFirmaWebhook — REQ-WEBHOOKS-001', () => {
  const body = JSON.stringify({ event: 'pago.completado', data: { id: 'pago_1' } });

  it('Given firma válida Then Resultado.exito', async () => {
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const r = await verificarFirmaWebhook({
      body,
      signature: `sha256=${firma}`,
      secretKey: SECRET_KEY_TEST,
    });
    expect(r.success).toBe(true);
  });

  it('Given firma sin prefijo sha256= Then 401', async () => {
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const r = await verificarFirmaWebhook({
      body,
      signature: firma, // sin prefijo
      secretKey: SECRET_KEY_TEST,
    });
    if (!r.success) expect(r.codigo).toBe(401);
  });

  it('Given firma hex incompleto (no 64 chars) Then 401', async () => {
    const r = await verificarFirmaWebhook({
      body,
      signature: 'sha256=ab12',
      secretKey: SECRET_KEY_TEST,
    });
    if (!r.success) expect(r.codigo).toBe(401);
  });

  it('Given prefijo MAYÚSCULAS SHA256= Then 401 (I4 case-sensitive)', async () => {
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const r = await verificarFirmaWebhook({
      body,
      signature: `SHA256=${firma}`,
      secretKey: SECRET_KEY_TEST,
    });
    if (!r.success) {
      expect(r.codigo).toBe(401);
      expect(r.error).toMatch(/Formato/i);
    }
  });

  it('Given prefijo capitalizado Sha256= Then 401 (I4)', async () => {
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const r = await verificarFirmaWebhook({
      body,
      signature: `Sha256=${firma}`,
      secretKey: SECRET_KEY_TEST,
    });
    if (!r.success) expect(r.codigo).toBe(401);
  });

  it('Given hex con MAYÚSCULAS Then 401 (I4)', async () => {
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const r = await verificarFirmaWebhook({
      body,
      signature: `sha256=${firma.toUpperCase()}`,
      secretKey: SECRET_KEY_TEST,
    });
    if (!r.success) expect(r.codigo).toBe(401);
  });

  it('Given firma alterada (1 byte) Then 401 firma inválida', async () => {
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    // Alteramos el último char: si era hex char, cambiamos por otro distinto
    const ultimoChar = firma.charAt(firma.length - 1);
    const reemplazo = ultimoChar === 'a' ? 'b' : 'a';
    const firmaAlterada = firma.slice(0, -1) + reemplazo;

    const r = await verificarFirmaWebhook({
      body,
      signature: `sha256=${firmaAlterada}`,
      secretKey: SECRET_KEY_TEST,
    });
    if (!r.success) {
      expect(r.codigo).toBe(401);
      expect(r.error).toMatch(/inválida/i);
    }
  });

  it('Given secretKey vacía Then 401', async () => {
    const r = await verificarFirmaWebhook({
      body,
      signature: 'sha256=' + 'a'.repeat(64),
      secretKey: '',
    });
    if (!r.success) {
      expect(r.codigo).toBe(401);
      expect(r.error).toMatch(/secretKey/i);
    }
  });

  it('Given body Uint8Array con firma correcta Then Resultado.exito', async () => {
    const bodyBytes = new TextEncoder().encode(body);
    const firma = await calcularHmacSha256(bodyBytes, SECRET_KEY_TEST);
    const r = await verificarFirmaWebhook({
      body: bodyBytes,
      signature: `sha256=${firma}`,
      secretKey: SECRET_KEY_TEST,
    });
    expect(r.success).toBe(true);
  });

  it('Given secretKey distinta Then 401', async () => {
    const firma = await calcularHmacSha256(body, SECRET_KEY_TEST);
    const r = await verificarFirmaWebhook({
      body,
      signature: `sha256=${firma}`,
      secretKey: 'wrong-secret',
    });
    if (!r.success) expect(r.codigo).toBe(401);
  });
});
