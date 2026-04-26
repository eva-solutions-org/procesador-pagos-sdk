import type { HttpClient } from '../../../core/http-client/index.js';
import type { Resultado } from '../../../core/types/index.js';
import type {
  CrearPagoInput,
  CrearPagoResponse,
  FiltrarPagoInput,
  ListarPagosResponse,
  PagoCanceladoResponse,
  PagoDetalle,
  PagoReembolsadoResponse,
  ReembolsarPagoBody,
} from '../domain/index.js';
import {
  crearPagoResponseSchema,
  listarPagosResponseSchema,
  pagoCanceladoResponseSchema,
  pagoDetalleSchema,
  pagoReembolsadoResponseSchema,
} from '../domain/index.js';

/**
 * HTTP adapter del feature `pagos` — capa infrastructure.
 *
 * Encapsula:
 * - Paths exactos de la API REST del servicio.
 * - safeParse de cada response con su schema correspondiente.
 * - URL escape de path params (`encodeURIComponent` en `id`).
 *
 * El cliente HTTP ya desenvuelve `{ data }` (A2), así que los schemas que pasamos
 * describen el shape interior.
 */

export interface PagosHttpAdapter {
  postCrearPago: (
    input: CrearPagoInput,
    options?: { signal?: AbortSignal },
  ) => Promise<Resultado<CrearPagoResponse>>;

  getConsultarPago: (
    id: string,
    options?: { signal?: AbortSignal },
  ) => Promise<Resultado<PagoDetalle>>;

  getListarPagos: (
    filtros: FiltrarPagoInput,
    options?: { signal?: AbortSignal },
  ) => Promise<Resultado<ListarPagosResponse>>;

  postCancelarPago: (
    id: string,
    options?: { signal?: AbortSignal },
  ) => Promise<Resultado<PagoCanceladoResponse>>;

  postReembolsarPago: (
    id: string,
    body: ReembolsarPagoBody,
    options?: { signal?: AbortSignal },
  ) => Promise<Resultado<PagoReembolsadoResponse>>;
}

export const crearPagosHttpAdapter = (httpClient: HttpClient): PagosHttpAdapter => ({
  postCrearPago: (input, options) =>
    httpClient.post('/api/v1/pagos', input, {
      schemaRespuesta: crearPagoResponseSchema,
      signal: options?.signal,
    }),

  getConsultarPago: (id, options) =>
    httpClient.get(`/api/v1/pagos/${encodeURIComponent(id)}`, {
      schemaRespuesta: pagoDetalleSchema,
      signal: options?.signal,
    }),

  getListarPagos: (filtros, options) =>
    httpClient.get('/api/v1/pagos', {
      schemaRespuesta: listarPagosResponseSchema,
      query: filtros as Record<string, string | number | boolean | undefined>,
      signal: options?.signal,
    }),

  postCancelarPago: (id, options) =>
    httpClient.post(
      `/api/v1/pagos/${encodeURIComponent(id)}/cancelar`,
      undefined,
      {
        schemaRespuesta: pagoCanceladoResponseSchema,
        signal: options?.signal,
      },
    ),

  postReembolsarPago: (id, body, options) =>
    httpClient.post(`/api/v1/pagos/${encodeURIComponent(id)}/reembolsar`, body, {
      schemaRespuesta: pagoReembolsadoResponseSchema,
      signal: options?.signal,
    }),
});
