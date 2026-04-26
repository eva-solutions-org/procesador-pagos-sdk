import { describe, expect, it, beforeEach, vi } from 'vitest';
import { crearCliente } from '../../../src/index.js';
import { crearMockFetch, respuestaError, respuestaJsonData } from '../../helpers/mock-fetch.js';
import { API_KEY_TEST, REEMBOLSADO_FIXTURE } from '../../helpers/fixtures.js';

describe('reembolsarPago — REQ-PAGOS-006', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Given sin monto Then body POST = {} (NUNCA monto:undefined)', async () => {
    let bodyEnviado = '';
    const fetchMock = crearMockFetch((_url, init) => {
      bodyEnviado = init.body as string;
      return respuestaJsonData(REEMBOLSADO_FIXTURE);
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    await cliente.pagos.reembolsarPago({ id: 'pago_test_1' });
    expect(bodyEnviado).toBe('{}');
    // Verificación adicional: NO contiene "monto"
    expect(bodyEnviado).not.toContain('monto');
  });

  it('Given monto válido Then body = { monto: "..." }', async () => {
    let bodyEnviado = '';
    const fetchMock = crearMockFetch((_url, init) => {
      bodyEnviado = init.body as string;
      return respuestaJsonData(REEMBOLSADO_FIXTURE);
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    await cliente.pagos.reembolsarPago({ id: 'pago_test_1', monto: '50.00' });
    expect(bodyEnviado).toBe(JSON.stringify({ monto: '50.00' }));
  });

  it('Given monto formato inválido Then 400 sin tocar red', async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch;
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.reembolsarPago({ id: 'pago_test_1', monto: '50' });
    if (!r.success) expect(r.codigo).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Given monto excede saldo Then 422', async () => {
    const fetchMock = crearMockFetch(() => respuestaError(422, 'Monto excede saldo reembolsable'));
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.reembolsarPago({ id: 'pago_test_1', monto: '200.00' });
    if (!r.success) {
      expect(r.codigo).toBe(422);
      expect(r.error).toBe('Monto excede saldo reembolsable');
    }
  });

  it('Given pago inexistente Then 404', async () => {
    const fetchMock = crearMockFetch(() => respuestaError(404, 'Pago no encontrado'));
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.reembolsarPago({ id: 'pago_missing' });
    if (!r.success) expect(r.codigo).toBe(404);
  });

  it('Given id vacío Then 400 sin tocar red', async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch;
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.reembolsarPago({ id: '', monto: '10.00' });
    if (!r.success) expect(r.codigo).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Given path correcto Then URL termina en /reembolsar', async () => {
    let urlLlamada = '';
    const fetchMock = crearMockFetch((url) => {
      urlLlamada = url;
      return respuestaJsonData(REEMBOLSADO_FIXTURE);
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    await cliente.pagos.reembolsarPago({ id: 'pago_test_1' });
    expect(urlLlamada).toMatch(/\/api\/v1\/pagos\/pago_test_1\/reembolsar$/);
  });
});
