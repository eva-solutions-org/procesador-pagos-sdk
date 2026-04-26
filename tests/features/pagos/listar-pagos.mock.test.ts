import { describe, expect, it, beforeEach, vi } from 'vitest';
import { crearCliente } from '../../../src/index.js';
import { crearMockFetch, respuestaError, respuestaListarPagos } from '../../helpers/mock-fetch.js';
import { API_KEY_TEST, PAGO_RESUMEN_FIXTURE } from '../../helpers/fixtures.js';

describe('listarPagos — REQ-PAGOS-003', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Given filtros + paginación Then URL incluye query params', async () => {
    let urlLlamada = '';
    const fetchMock = crearMockFetch((url) => {
      urlLlamada = url;
      return respuestaListarPagos([PAGO_RESUMEN_FIXTURE], {
        total: 1,
        page: 2,
        limit: 50,
        totalPages: 1,
      });
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    await cliente.pagos.listarPagos({ estado: 'completado', page: 2, limit: 50 });
    expect(urlLlamada).toContain('estado=completado');
    expect(urlLlamada).toContain('page=2');
    expect(urlLlamada).toContain('limit=50');
  });

  it('Given sin filtros Then defaults page=1 limit=20 (del schema)', async () => {
    let urlLlamada = '';
    const fetchMock = crearMockFetch((url) => {
      urlLlamada = url;
      return respuestaListarPagos([], { total: 0, page: 1, limit: 20, totalPages: 0 });
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    await cliente.pagos.listarPagos({});
    // El schema tiene .default(1) y .default(20), Zod los aplica.
    expect(urlLlamada).toContain('page=1');
    expect(urlLlamada).toContain('limit=20');
  });

  it('Given limit > 100 Then 400 sin tocar red', async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch;
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.listarPagos({ limit: 200 });
    if (!r.success) expect(r.codigo).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Given estado fuera del enum Then 400 sin tocar red', async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch;
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.listarPagos({
      estado: 'inexistente' as unknown as 'pendiente',
    });
    if (!r.success) expect(r.codigo).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Given 401 apiKey expirada Then propaga codigo 401', async () => {
    const fetchMock = crearMockFetch(() => respuestaError(401, 'API key invalida'));
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.listarPagos({});
    if (!r.success) {
      expect(r.codigo).toBe(401);
      expect(r.error).toBe('API key invalida');
    }
  });

  it('Given response 200 Then Resultado.exito con shape pagination', async () => {
    const fetchMock = crearMockFetch(() =>
      respuestaListarPagos([PAGO_RESUMEN_FIXTURE], {
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    );
    const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
    const r = await cliente.pagos.listarPagos({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.data).toHaveLength(1);
      expect(r.data.pagination.total).toBe(1);
      expect(r.data.pagination.totalPages).toBe(1);
    }
  });
});
