/**
 * Handler `GET /:id` (REQ-RUTAS-005 — polling fallback / ADR-019).
 *
 * Flujo:
 * 1. Si `verificarAcceso` está configurado: invocar; si false → 401, throw → 500.
 * 2. Llama `cliente.pagos.consultarPago({ id })`.
 * 3. Hook opcional `alAntesDeResponderPolling(pago)` (await).
 * 4. Devuelve estado del pago.
 */

import type { Context } from 'hono';
import type { AmbienteRutasPagos } from '../domain/contexto-rutas.js';

export async function handlerConsultar<Env extends object = object>(
  c: Context<AmbienteRutasPagos<Env>>,
): Promise<Response> {
  const opciones = c.get('opcionesPagos');
  const cliente = c.get('cliente');
  const pagoId = c.req.param('id');

  if (!pagoId) {
    return c.json({ error: 'pagoId requerido', codigo: 400 }, 400);
  }

  // 1. verificarAcceso (opcional)
  if (opciones.verificarAcceso) {
    let permitido: boolean;
    try {
      permitido = await opciones.verificarAcceso(c, pagoId);
    } catch (err) {
      console.error('[procesador-pagos-sdk] verificarAcceso lanzó:', err);
      return c.json({ error: 'Error interno de autorización', codigo: 500 }, 500);
    }
    if (!permitido) {
      return c.json({ error: 'No autorizado', codigo: 401 }, 401);
    }
  }

  // 2. consultarPago
  const resultado = await cliente.pagos.consultarPago({ id: pagoId });
  if (!resultado.success) {
    const status = (resultado.codigo >= 400 && resultado.codigo <= 599)
      ? (resultado.codigo as 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503)
      : 500;
    return c.json({ error: resultado.error, codigo: resultado.codigo }, status);
  }

  // 3. Hook alAntesDeResponderPolling
  if (opciones.alAntesDeResponderPolling) {
    try {
      await opciones.alAntesDeResponderPolling(resultado.data);
    } catch (err) {
      console.error('[procesador-pagos-sdk] alAntesDeResponderPolling lanzó:', err);
    }
  }

  return c.json(resultado.data, 200);
}
