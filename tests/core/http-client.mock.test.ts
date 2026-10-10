import { describe, expect, it, beforeEach, vi } from 'vitest';
import { crearHttpClient } from '../../src/core/http-client/index.js';
import { parsearRetryAfter } from '../../src/core/http-client/index.js';
import { z } from 'zod';
import { BASE_URL_PRUEBA, crearMockFetch, respuestaError, respuestaJsonData } from '../helpers/mock-fetch.js';
import { API_KEY_TEST } from '../helpers/fixtures.js';

const schemaSimple = z.object({ ok: z.boolean() });

describe('http-client — REQ-HTTP-001 (x-api-key) + REQ-HTTP-002 (mapeo errores)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-PAG-11 — URL = origin de baseUrl + path', () => {
    it('builds_url_from_origin_and_path', async () => {
      let urlLlamada = '';
      const fetchMock = crearMockFetch((url) => {
        urlLlamada = url;
        return respuestaJsonData({ ok: true });
      });
      const http = crearHttpClient({
        apiKey: API_KEY_TEST,
        baseUrl: 'https://pagos.example.com',
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      await http.get('/pagos', { query: { page: 2, estado: undefined }, schemaRespuesta: schemaSimple });
      expect(urlLlamada).toBe('https://pagos.example.com/pagos?page=2');
    });
  });

  describe('REQ-HTTP-001 — header x-api-key y precedencia', () => {
    it('Given apiKey When request Then header x-api-key se envía con valor real', async () => {
      const fetchMock = crearMockFetch(() =>
        respuestaJsonData({ ok: true }),
      );
      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
      expect((init.headers as Headers).get('x-api-key')).toBe(API_KEY_TEST);
    });

    it('Given headersExtra con x-api-key tampering Then NO sobrescribe el real (interno gana)', async () => {
      const fetchMock = crearMockFetch(() => respuestaJsonData({ ok: true }));
      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        headersExtra: { 'x-api-key': 'TAMPER', 'x-trace-id': 'abc' },
        fetchImpl: fetchMock,
      });
      await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      const init = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Headers;
      expect(headers.get('x-api-key')).toBe(API_KEY_TEST);
      expect(headers.get('x-trace-id')).toBe('abc');
    });

    it('Given header MAYÚSCULAS X-API-KEY tampering Then lowercase-normalize y override interno', async () => {
      const fetchMock = crearMockFetch(() => respuestaJsonData({ ok: true }));
      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        headersExtra: { 'X-API-KEY': 'TAMPER-UPPER' },
        fetchImpl: fetchMock,
      });
      await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      const init = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
      expect((init.headers as Headers).get('x-api-key')).toBe(API_KEY_TEST);
    });

    it('Given GET sin body Then no envía Content-Type', async () => {
      const fetchMock = crearMockFetch(() => respuestaJsonData({ ok: true }));
      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      const init = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
      expect((init.headers as Headers).get('content-type')).toBeNull();
    });

    it('Given request HTTP Then fija redirect:error para bloquear redirects automáticos', async () => {
      const fetchMock = crearMockFetch(() => respuestaJsonData({ ok: true }));
      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      const init = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
      expect(init.redirect).toBe('error');
    });

    it('Given POST con body Then envía Content-Type: application/json', async () => {
      const fetchMock = crearMockFetch(() => respuestaJsonData({ ok: true }));
      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      await http.post('/api/v1/test', { foo: 'bar' }, { schemaRespuesta: schemaSimple });
      const init = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
      expect((init.headers as Headers).get('content-type')).toBe('application/json');
      expect(init.body).toBe(JSON.stringify({ foo: 'bar' }));
    });

    it('Given fallo 401 con apiKey en mensaje del servicio Then NO incluye apiKey en error', async () => {
      const fetchMock = crearMockFetch(() => respuestaError(401, 'Token invalid'));
      const http = crearHttpClient({
        apiKey: 'pk_secret_xyz',
        baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error).not.toContain('pk_secret_xyz');
      }
    });
  });

  describe('REQ-HTTP-002 — mapeo errores', () => {
    it('Given network error Then 503', async () => {
      const fetchMock = vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof globalThis.fetch;
      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.codigo).toBe(503);
        expect(r.error).toBe('Error de red al comunicarse con el servicio');
      }
    });

    it('Given redirect rejection del runtime Then 503 con mensaje saneado', async () => {
      const fetchMock = vi.fn(async () => {
        throw new TypeError('redirect mode is set to error: received redirect');
      }) as unknown as typeof globalThis.fetch;
      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.codigo).toBe(503);
        expect(r.error).toBe('Redirect inesperado rechazado por seguridad');
      }
    });

    it('Given timeout (signal interno disparó) Then 503', async () => {
      const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        // Simulamos timeout: esperamos al abort del signal interno
        await new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new DOMException('aborted', 'AbortError');
            reject(err);
          });
        });
        throw new Error('unreachable');
      }) as unknown as typeof globalThis.fetch;

      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 50,
        fetchImpl: fetchMock,
      });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.codigo).toBe(503);
        expect(r.error).toBe('Tiempo de espera agotado');
      }
    });

    it('Given abort externo Then 503 con mensaje estable', async () => {
      const ctrl = new AbortController();
      ctrl.abort();
      const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          throw new DOMException('aborted', 'AbortError');
        }
        return respuestaJsonData({ ok: true });
      }) as unknown as typeof globalThis.fetch;

      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple, signal: ctrl.signal });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.codigo).toBe(503);
        expect(r.error).toBe('Operación cancelada');
      }
    });

    it('Given JSON inválido Then 502', async () => {
      const fetchMock = crearMockFetch(
        () => new Response('<html>not-json</html>', { status: 200 }),
      );
      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.codigo).toBe(502);
    });

    it('Given safeParse fail Then 502 (Shape inesperado)', async () => {
      const fetchMock = crearMockFetch(() => respuestaJsonData({ ok: 'not-bool' }));
      const http = crearHttpClient({
        apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA,
        timeout: 1000,
        fetchImpl: fetchMock,
      });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.codigo).toBe(502);
    });

    it.each([
      [400, 'Petición inválida'],
      [401, 'No autorizado'],
      [403, 'Acceso prohibido'],
      [404, 'Recurso no encontrado'],
      [409, 'Conflicto'],
      [413, 'Payload demasiado grande'],
      [422, 'Datos no procesables'],
      [429, 'Demasiadas solicitudes'],
      [500, 'Error interno del servicio'],
      [502, 'Bad gateway upstream'],
      [503, 'Servicio no disponible'],
    ])('Given HTTP %i con body sensible Then usa mensaje genérico', async (status, defaultMsg) => {
      const fetchMock = crearMockFetch(() =>
        new Response(JSON.stringify({ error: 'apiKey pk_secret_xyz inválida; debug=stacktrace' }), {
          status,
          headers: {
            'content-type': 'application/json',
            ...(status === 429 ? { 'Retry-After': '30' } : {}),
          },
        }),
      );
      const http = crearHttpClient({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, timeout: 1000, fetchImpl: fetchMock });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.codigo).toBe(status);
        expect(r.error).toBe(defaultMsg);
        expect(r.error).not.toContain('pk_secret_xyz');
        expect(JSON.stringify(r)).not.toContain('pk_secret_xyz');
      }
    });

    it.each([
      [401, 'No autorizado'],
      [403, 'Acceso prohibido'],
      [404, 'Recurso no encontrado'],
      [409, 'Conflicto'],
      [413, 'Payload demasiado grande'],
      [422, 'Datos no procesables'],
      [500, 'Error interno del servicio'],
      [502, 'Bad gateway upstream'],
      [503, 'Servicio no disponible'],
    ])('Given HTTP %i Then codigo %i', async (status, defaultMsg) => {
      const fetchMock = crearMockFetch(() => respuestaError(status, defaultMsg));
      const http = crearHttpClient({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, timeout: 1000, fetchImpl: fetchMock });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      if (!r.success) expect(r.codigo).toBe(status);
    });

    it('Given HTTP 429 con Retry-After: 30 Then codigo 429 + retryAfter 30 (I2)', async () => {
      const fetchMock = crearMockFetch(() =>
        respuestaError(429, 'Rate limit', { 'Retry-After': '30' }),
      );
      const http = crearHttpClient({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, timeout: 1000, fetchImpl: fetchMock });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      if (!r.success && r.codigo === 429) {
        expect(r.retryAfter).toBe(30);
      } else {
        expect.fail('debería ser 429');
      }
    });

    it('Given HTTP 429 sin Retry-After Then retryAfter undefined', async () => {
      const fetchMock = crearMockFetch(() => respuestaError(429, 'Rate limit'));
      const http = crearHttpClient({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, timeout: 1000, fetchImpl: fetchMock });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      if (!r.success && r.codigo === 429) {
        expect(r.retryAfter).toBeUndefined();
      } else {
        expect.fail('debería ser 429');
      }
    });

    it('Given HTTP 429 con Retry-After malformado Then retryAfter undefined (no throw)', async () => {
      const fetchMock = crearMockFetch(() =>
        respuestaError(429, 'Rate limit', { 'Retry-After': 'not-a-number-and-not-date' }),
      );
      const http = crearHttpClient({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, timeout: 1000, fetchImpl: fetchMock });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      if (!r.success && r.codigo === 429) {
        expect(r.retryAfter).toBeUndefined();
      } else {
        expect.fail('debería ser 429');
      }
    });

    it('Given HTTP 418 (fuera union) Then codigo 502 con mensaje sobre status inesperado', async () => {
      const fetchMock = crearMockFetch(
        () => new Response('{}', { status: 418, headers: { 'content-type': 'application/json' } }),
      );
      const http = crearHttpClient({ apiKey: API_KEY_TEST, baseUrl: BASE_URL_PRUEBA, timeout: 1000, fetchImpl: fetchMock });
      const r = await http.get('/api/v1/test', { schemaRespuesta: schemaSimple });
      if (!r.success) {
        expect(r.codigo).toBe(502);
        expect(r.error).toContain('418');
      }
    });
  });

  describe('parsearRetryAfter — I2', () => {
    it('Given numérico válido Then retorna ese número', () => {
      expect(parsearRetryAfter('30')).toBe(30);
      expect(parsearRetryAfter('0')).toBe(0);
    });

    it('Given header null Then undefined', () => {
      expect(parsearRetryAfter(null)).toBeUndefined();
    });

    it('Given malformado no-numérico no-date Then undefined', () => {
      expect(parsearRetryAfter('foo-bar')).toBeUndefined();
    });

    it('Given HTTP-date futuro Then segundos relativos', () => {
      const futuro = new Date(Date.now() + 60_000).toUTCString();
      const r = parsearRetryAfter(futuro);
      expect(r).toBeGreaterThanOrEqual(58);
      expect(r).toBeLessThanOrEqual(62);
    });

    it('Given HTTP-date pasado Then 0 (max con 0)', () => {
      const pasado = new Date(Date.now() - 60_000).toUTCString();
      expect(parsearRetryAfter(pasado)).toBe(0);
    });
  });
});
