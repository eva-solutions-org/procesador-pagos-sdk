/**
 * Handler `POST /crear` (REQ-RUTAS-003 / ADR-011 / S1.1).
 *
 * Flujo:
 * 1. Lee body JSON del request.
 * 2. Valida con `crearPagoInputSchema.safeParse` → si falla devuelve 400/422.
 * 3. Invoca `opciones.alCrearPago(input, c)` — REQUIRED por contrato.
 * 4. Llama al cliente programático `cliente.pagos.crearPago(inputModificado)`.
 * 5. Si éxito → devuelve `{ intentId, pagoId, modo, basePath }`.
 * 6. Si falla → propaga código del Resultado al cliente.
 */

import type { Context } from 'hono';
import { crearPagoInputSchema } from '../../pagos/index.js';
import type { CrearPagoResponseCliente } from '../domain/crear-response.js';
import type { AmbienteRutasPagos } from '../domain/contexto-rutas.js';

export async function handlerCrear<Env extends object = object>(
  c: Context<AmbienteRutasPagos<Env>>,
): Promise<Response> {
  const opciones = c.get('opcionesPagos');
  const cliente = c.get('cliente');

  // 1. Body JSON
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Body no es JSON válido', codigo: 400 }, 400);
  }

  // 2. Zod safeParse
  const parsed = crearPagoInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: `Input inválido: ${parsed.error.message}`,
        codigo: 400,
      },
      400,
    );
  }

  // 3. Hook alCrearPago (REQUIRED — el factory garantiza que existe)
  let inputModificado;
  try {
    inputModificado = await opciones.alCrearPago(parsed.data, c);
  } catch (err) {
    console.error('[procesador-pagos-sdk] alCrearPago lanzó:', err);
    return c.json(
      { error: 'Error interno al crear pago', codigo: 500 },
      500,
    );
  }

  // 4. Cliente programático
  const resultado = await cliente.pagos.crearPago(inputModificado);
  if (!resultado.success) {
    const status = (resultado.codigo >= 400 && resultado.codigo <= 599)
      ? (resultado.codigo as 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503)
      : 500;
    return c.json({ error: resultado.error, codigo: resultado.codigo }, status);
  }

  // 5. Response
  const intentId = resultado.data.intentId ?? resultado.data.pagoId;
  const response: CrearPagoResponseCliente = {
    intentId,
    pagoId: resultado.data.pagoId,
    modo: opciones.pubsub ? 'sse' : 'polling',
    basePath: '/',
  };
  return c.json(response, 200);
}
