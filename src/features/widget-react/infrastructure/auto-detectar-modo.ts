/**
 * Detecta el modo (`sse` | `polling`) a partir de la response de `POST /crear`
 * y provee fallback automático a polling si SSE falla con 404.
 */

import type { ModoPagos } from '../../rutas-hono/domain/index.js';

export interface RespuestaCrearPago {
  intentId: string;
  pagoId: string;
  modo: ModoPagos;
  basePath: string;
}

export function modoDesdeResponse(respuesta: RespuestaCrearPago): ModoPagos {
  return respuesta.modo;
}
