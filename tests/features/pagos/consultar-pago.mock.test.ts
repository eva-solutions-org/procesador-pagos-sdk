import { describe, expect, it, beforeEach, vi } from 'vitest';
import { crearCliente } from '../../../src/index.js';
import { crearMockFetch, respuestaError, respuestaJsonData } from '../../helpers/mock-fetch.js';
import { API_KEY_TEST, PAGO_DETALLE_FIXTURE } from '../../helpers/fixtures.js';

describe('consultarPago — REQ-PAGOS-002 (I9 — 22 campos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Given id válido When 200 con shape 22 campos Then Resultado.exito con detalle completo', async () => {
    const fetchMock = crearMockFetch(() => respuestaJsonData(PAGO_DETALLE_FIXTURE));
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.consultarPago({ id: 'pago_detalle_1' });
    expect(r.success).toBe(true);
    if (r.success) {
      // I9 — 22 campos exactos
      expect(Object.keys(r.data).length).toBe(22);
      expect(r.data.id).toBe('pago_detalle_1');
      expect(r.data.proyectoId).toBe('proy_1');
      expect(r.data.metadata).toEqual({ tag: 'test' });
    }
  });

  it('Given GET con path correcto Then URL termina en /api/v1/pagos/{id}', async () => {
    let urlLlamada = '';
    const fetchMock = crearMockFetch((url) => {
      urlLlamada = url;
      return respuestaJsonData(PAGO_DETALLE_FIXTURE);
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    await cliente.pagos.consultarPago({ id: 'pago_detalle_1' });
    expect(urlLlamada).toMatch(/\/api\/v1\/pagos\/pago_detalle_1$/);
  });

  it('Given id con caracteres especiales Then se URL-encodea', async () => {
    let urlLlamada = '';
    const fetchMock = crearMockFetch((url) => {
      urlLlamada = url;
      return respuestaJsonData(PAGO_DETALLE_FIXTURE);
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    await cliente.pagos.consultarPago({ id: 'pago/with spaces' });
    expect(urlLlamada).toContain('pago%2Fwith%20spaces');
  });

  it('Given 404 Then propaga codigo 404', async () => {
    const fetchMock = crearMockFetch(() => respuestaError(404, 'Pago no encontrado'));
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.consultarPago({ id: 'pago_missing' });
    if (!r.success) {
      expect(r.codigo).toBe(404);
      expect(r.error).toBe('Pago no encontrado');
    }
  });

  it('Given id vacío Then 400 sin tocar red', async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch;
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.consultarPago({ id: '' });
    if (!r.success) expect(r.codigo).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Given GET no envía Content-Type ni body', async () => {
    const fetchMock = crearMockFetch(() => respuestaJsonData(PAGO_DETALLE_FIXTURE));
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    await cliente.pagos.consultarPago({ id: 'pago_1' });
    const init = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Headers).get('content-type')).toBeNull();
    expect(init.body).toBeUndefined();
  });
});
