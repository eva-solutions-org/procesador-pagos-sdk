import type { HttpClient } from '../../../core/http-client/index.js';
import { crearPagosHttpAdapter } from '../infrastructure/index.js';
import { cancelarPago } from './cancelar-pago.js';
import { consultarPago } from './consultar-pago.js';
import { crearPago } from './crear-pago.js';
import { iterarPagos } from './iterar-pagos.js';
import { listarPagos } from './listar-pagos.js';
import { reembolsarPago } from './reembolsar-pago.js';

/**
 * Facade del feature `pagos` — namespace agrupado UX-1.
 *
 * Ensambla las 6 operaciones públicas y expone el namespace `cliente.pagos.{op}`.
 * Currying con `httpClient` mantiene cada op stateless y testeable en aislación.
 */
export const crearFacadePagos = (httpClient: HttpClient) => {
  const adapter = crearPagosHttpAdapter(httpClient);
  const listarPagosOp = listarPagos(adapter);

  return {
    crearPago: crearPago(adapter),
    consultarPago: consultarPago(adapter),
    listarPagos: listarPagosOp,
    iterarPagos: iterarPagos(listarPagosOp),
    cancelarPago: cancelarPago(adapter),
    reembolsarPago: reembolsarPago(adapter),
  };
};

export type FacadePagos = ReturnType<typeof crearFacadePagos>;
