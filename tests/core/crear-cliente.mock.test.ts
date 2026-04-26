import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  crearCliente,
  createClienteProcesadorPagos,
} from '../../src/index.js';
import { crearMockFetch, respuestaJsonData } from '../helpers/mock-fetch.js';
import { API_KEY_TEST, CREAR_PAGO_RESPONSE_FIXTURE } from '../helpers/fixtures.js';

describe('crearCliente — REQ-CLIENTE-001/002/003', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-CLIENTE-001 — apiKey requerido', () => {
    it('Given apiKey vacío Then throw síncrono sin filtrar valor', () => {
      expect(() => crearCliente({ apiKey: '' })).toThrow(/apiKey/);
    });

    it('Given apiKey ausente Then throw síncrono', () => {
      expect(() => crearCliente({} as { apiKey: string })).toThrow(/apiKey/);
    });

    it('Given apiKey null Then throw síncrono', () => {
      expect(() => crearCliente({ apiKey: null as unknown as string })).toThrow(/apiKey/);
    });

    it('Given opciones null Then throw', () => {
      expect(() => crearCliente(null as unknown as { apiKey: string })).toThrow();
    });

    it('Given apiKey válido Then retorna cliente con namespace pagos', () => {
      const cliente = crearCliente({ apiKey: API_KEY_TEST });
      expect(cliente.pagos).toBeDefined();
      expect(typeof cliente.pagos.crearPago).toBe('function');
      expect(typeof cliente.pagos.consultarPago).toBe('function');
      expect(typeof cliente.pagos.listarPagos).toBe('function');
      expect(typeof cliente.pagos.iterarPagos).toBe('function');
      expect(typeof cliente.pagos.cancelarPago).toBe('function');
      expect(typeof cliente.pagos.reembolsarPago).toBe('function');
    });
  });

  describe('REQ-CLIENTE-003 — alias UX-2', () => {
    it('Given alias Then es la misma referencia', () => {
      expect(crearCliente).toBe(createClienteProcesadorPagos);
    });
  });

  describe('REQ-CLIENTE-002 — opciones avanzadas + I5 triple AbortSignal', () => {
    it('Given fetch override Then se invoca en lugar del global', async () => {
      const fetchMock = crearMockFetch(() => respuestaJsonData(CREAR_PAGO_RESPONSE_FIXTURE, { status: 201 }));
      const cliente = crearCliente({
        apiKey: API_KEY_TEST,
        fetch: fetchMock,
      });
      await cliente.pagos.crearPago({
        monto: '100.00',
        moneda: 'USD',
        tipo: 'pago_unico',
        referenciaExterna: 'ref-1',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('Given headers extra Then mergean al request', async () => {
      const fetchMock = crearMockFetch(() => respuestaJsonData(CREAR_PAGO_RESPONSE_FIXTURE, { status: 201 }));
      const cliente = crearCliente({
        apiKey: API_KEY_TEST,
        headers: { 'x-trace-id': 't1' },
        fetch: fetchMock,
      });
      await cliente.pagos.crearPago({
        monto: '100.00',
        moneda: 'USD',
        tipo: 'pago_unico',
        referenciaExterna: 'ref-1',
      });
      const init = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
      expect((init.headers as Headers).get('x-trace-id')).toBe('t1');
      expect((init.headers as Headers).get('x-api-key')).toBe(API_KEY_TEST);
    });

    it('Given clientSignal aborted Then operación falla 503 (I5)', async () => {
      const ctrl = new AbortController();
      ctrl.abort();
      const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          throw new DOMException('aborted', 'AbortError');
        }
        return respuestaJsonData(CREAR_PAGO_RESPONSE_FIXTURE, { status: 201 });
      }) as unknown as typeof globalThis.fetch;

      const cliente = crearCliente({
        apiKey: API_KEY_TEST,
        signal: ctrl.signal,
        fetch: fetchMock,
      });
      // El abort externo retorna Resultado falla 503 — no re-throw.
      const r = await cliente.pagos.crearPago({
        monto: '100.00',
        moneda: 'USD',
        tipo: 'pago_unico',
        referenciaExterna: 'ref-1',
      });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.codigo).toBe(503);
    });

    it('Given opSignal aborted Then operación falla 503 — Resultado (no throw) (I5)', async () => {
      const ctrl = new AbortController();
      ctrl.abort();
      const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          throw new DOMException('aborted', 'AbortError');
        }
        return respuestaJsonData(CREAR_PAGO_RESPONSE_FIXTURE, { status: 201 });
      }) as unknown as typeof globalThis.fetch;

      const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock });
      // El abort externo retorna Resultado falla 503 — no re-throw.
      const r = await cliente.pagos.crearPago(
        { monto: '100.00', moneda: 'USD', tipo: 'pago_unico', referenciaExterna: 'ref-1' },
        { signal: ctrl.signal },
      );
      expect(r.success).toBe(false);
      if (!r.success) expect(r.codigo).toBe(503);
    });

    it('Given timeout corto Then dispara como interno → Resultado 503 (no throw)', async () => {
      const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        await new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
        throw new Error('unreachable');
      }) as unknown as typeof globalThis.fetch;

      const cliente = crearCliente({
        apiKey: API_KEY_TEST,
        fetch: fetchMock,
        timeout: 30,
      });
      const r = await cliente.pagos.crearPago({
        monto: '100.00',
        moneda: 'USD',
        tipo: 'pago_unico',
        referenciaExterna: 'ref-1',
      });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.codigo).toBe(503);
    });

    it('Given clientSignal omitido Then signal interno solo combina opSignal + timeout (I5)', async () => {
      // Comprueba que el signal pasado a fetch es un AbortSignal (no undefined).
      let signalRecibido: AbortSignal | undefined;
      const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        signalRecibido = init?.signal ?? undefined;
        return respuestaJsonData(CREAR_PAGO_RESPONSE_FIXTURE, { status: 201 });
      }) as unknown as typeof globalThis.fetch;

      const cliente = crearCliente({ apiKey: API_KEY_TEST, fetch: fetchMock, timeout: 5000 });
      const opCtrl = new AbortController();
      await cliente.pagos.crearPago(
        { monto: '100.00', moneda: 'USD', tipo: 'pago_unico', referenciaExterna: 'ref-1' },
        { signal: opCtrl.signal },
      );
      expect(signalRecibido).toBeDefined();
      expect(signalRecibido).toBeInstanceOf(AbortSignal);
    });
  });
});
