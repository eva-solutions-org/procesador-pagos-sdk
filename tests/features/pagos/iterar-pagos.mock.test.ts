import { describe, expect, it, beforeEach, vi } from 'vitest';
import { crearCliente } from '../../../src/index.js';
import { BASE_URL_PRUEBA, crearMockFetch, respuestaError, respuestaListarPagos } from '../../helpers/mock-fetch.js';
import { API_KEY_TEST, PAGO_RESUMEN_FIXTURE } from '../../helpers/fixtures.js';

describe('iterarPagos — REQ-PAGOS-004 (C3 + I3 + I6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Given multi-page Then yields PagoResumen directo (NO Resultado<PagoResumen>) — C3', async () => {
    const p1 = { ...PAGO_RESUMEN_FIXTURE, id: 'p1' };
    const p2 = { ...PAGO_RESUMEN_FIXTURE, id: 'p2' };
    const p3 = { ...PAGO_RESUMEN_FIXTURE, id: 'p3' };
    let pageNum = 0;
    const fetchMock = crearMockFetch((url) => {
      pageNum++;
      if (url.includes('page=1')) {
        return respuestaListarPagos([p1, p2], { total: 3, page: 1, limit: 2, totalPages: 2 });
      }
      return respuestaListarPagos([p3], { total: 3, page: 2, limit: 2, totalPages: 2 });
    });

    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const ids: string[] = [];
    for await (const pago of cliente.pagos.iterarPagos({ estado: 'pendiente', limit: 2 })) {
      // pago.id accesible SIN narrowing por success — confirma que es Pago directo
      ids.push(pago.id);
    }
    expect(ids).toEqual(['p1', 'p2', 'p3']);
    expect(pageNum).toBe(2);
  });

  it('Given error en página intermedia Then throw Error con cause:Resultado — C3', async () => {
    const p1 = { ...PAGO_RESUMEN_FIXTURE, id: 'p1' };
    const fetchMock = crearMockFetch((url) => {
      if (url.includes('page=1')) {
        return respuestaListarPagos([p1], { total: 5, page: 1, limit: 1, totalPages: 5 });
      }
      return respuestaError(500, 'Internal Server Error');
    });

    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const ids: string[] = [];
    let caught: Error | undefined;
    try {
      for await (const pago of cliente.pagos.iterarPagos({ limit: 1 })) {
        ids.push(pago.id);
      }
    } catch (err) {
      caught = err as Error;
    }
    expect(ids).toEqual(['p1']);
    expect(caught).toBeInstanceOf(Error);
    const cause = caught?.cause as { success: false; codigo: number; error: string } | undefined;
    expect(cause?.codigo).toBe(500);
  });

  it('Given network down Then throw con cause.codigo === 503', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof globalThis.fetch;
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });

    let caught: Error | undefined;
    try {
      for await (const _pago of cliente.pagos.iterarPagos({})) {
        // never reaches
      }
    } catch (err) {
      caught = err as Error;
    }
    const cause = caught?.cause as { success: false; codigo: number } | undefined;
    expect(cause?.codigo).toBe(503);
  });

  it('Given options.signal Then se propaga al fetch interno (I3)', async () => {
    const ctrl = new AbortController();
    let signalRecibido: AbortSignal | undefined;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      signalRecibido = init?.signal ?? undefined;
      return respuestaListarPagos([], { total: 0, page: 1, limit: 100, totalPages: 0 });
    }) as unknown as typeof globalThis.fetch;

    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    for await (const _p of cliente.pagos.iterarPagos({}, { signal: ctrl.signal })) {
      // empty
    }
    expect(signalRecibido).toBeDefined();
    expect(signalRecibido).toBeInstanceOf(AbortSignal);
  });

  it('Given break del consumidor Then finally observable + no más requests (I3)', async () => {
    const p1 = { ...PAGO_RESUMEN_FIXTURE, id: 'p1' };
    const p2 = { ...PAGO_RESUMEN_FIXTURE, id: 'p2' };
    let pageRequests = 0;
    const fetchMock = crearMockFetch((url) => {
      pageRequests++;
      if (url.includes('page=1')) {
        return respuestaListarPagos([p1, p2], { total: 4, page: 1, limit: 2, totalPages: 2 });
      }
      return respuestaListarPagos([], { total: 4, page: 2, limit: 2, totalPages: 2 });
    });

    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    const ids: string[] = [];
    for await (const pago of cliente.pagos.iterarPagos({ limit: 2 })) {
      ids.push(pago.id);
      break;
    }
    expect(ids).toEqual(['p1']);
    // Solo 1 request (page 1) — el break NO dispara page 2
    expect(pageRequests).toBe(1);
  });

  it('Given filtros.limit > 100 Then throw síncrono (I6)', () => {
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: crearMockFetch(() => new Response()) });
    expect(() => cliente.pagos.iterarPagos({ limit: 200 }).next()).toThrow(/limit/);
  });

  it('Given filtros.limit < 1 Then throw síncrono (I6)', () => {
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: crearMockFetch(() => new Response()) });
    expect(() => cliente.pagos.iterarPagos({ limit: 0 }).next()).toThrow(/limit/);
  });

  it('Given filtros.limit válido respeta consumidor (I6)', async () => {
    let limitVisto = '';
    const fetchMock = crearMockFetch((url) => {
      const m = /limit=(\d+)/.exec(url);
      if (m) limitVisto = m[1] ?? '';
      return respuestaListarPagos([], { total: 0, page: 1, limit: 50, totalPages: 0 });
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    for await (const _p of cliente.pagos.iterarPagos({ limit: 50 })) {
      // empty
    }
    expect(limitVisto).toBe('50');
  });

  it('Given sin limit explícito Then default 100 del iterator (no 20 de listar)', async () => {
    let limitVisto = '';
    const fetchMock = crearMockFetch((url) => {
      const m = /limit=(\d+)/.exec(url);
      if (m) limitVisto = m[1] ?? '';
      return respuestaListarPagos([], { total: 0, page: 1, limit: 100, totalPages: 0 });
    });
    const cliente = crearCliente({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, fetch: fetchMock });
    for await (const _p of cliente.pagos.iterarPagos({})) {
      // empty
    }
    expect(limitVisto).toBe('100');
  });
});
