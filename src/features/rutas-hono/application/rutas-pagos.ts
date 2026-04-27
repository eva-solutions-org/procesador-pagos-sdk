/**
 * Factory `rutasPagos()` — entry point principal del feature `rutas-hono`
 * (REQ-RUTAS-001..008 / ADR-019 / ADR-020 — Security boundary / FIX S1.1 / I2).
 *
 * Acepta opciones literales O función lazy `(env) => opciones`.
 *
 * Validación bloqueante S1.1 (alCrearPago obligatorio):
 * - Args literal → validación SÍNCRONA al construir factory.
 * - Args función → validación diferida al middleware del primer request.
 *
 * Aplica SIEMPRE — independiente de `EVA_PAGOS_BUILD_ENV`.
 */

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { crearCliente } from '../../../core/cliente/index.js';
import {
  validarOpcionesRutas,
  emitirWarningVerificarAccesoFaltante,
} from '../infrastructure/index.js';
import type {
  RutasPagosOpciones,
  RutasPagosFactoryArgs,
  AmbienteRutasPagos,
} from '../domain/index.js';
import { handlerCrear } from './handler-crear.js';
import { handlerWebhook } from './handler-webhook.js';
import { handlerConsultar } from './handler-consultar.js';
import { handlerEventosSSE } from './handler-eventos-sse.js';

const CREAR_BODY_MAX_BYTES = 64 * 1024;
const WEBHOOK_BODY_MAX_BYTES = 32 * 1024;

export function rutasPagos<Env extends object = object>(
  args: RutasPagosFactoryArgs<Env>,
): Hono<AmbienteRutasPagos<Env>> {
  // S1.1 — validación literal síncrona al construir el factory
  if (typeof args === 'object' && args !== null) {
    validarOpcionesRutas(args);
    emitirWarningVerificarAccesoFaltante(args);
  }

  const app = new Hono<AmbienteRutasPagos<Env>>();

  // Middleware: resuelve opciones (literal o lazy) y las cachea por request.
  app.use('*', async (c, next) => {
    let opciones: RutasPagosOpciones;
    if (typeof args === 'function') {
      opciones = await args(c.env as Env);
      // S1.1 — validación lazy en primer request
      validarOpcionesRutas(opciones);
      emitirWarningVerificarAccesoFaltante(opciones);
    } else {
      opciones = args;
    }
    const cliente = crearCliente({ apiKey: opciones.apiKey });
    c.set('opcionesPagos', opciones);
    c.set('cliente', cliente);
    await next();
  });

  // Registrar handlers
  app.post(
    '/crear',
    bodyLimit({
      maxSize: CREAR_BODY_MAX_BYTES,
      onError: (c) => c.json({ error: 'Body demasiado grande', codigo: 413 }, 413),
    }),
    handlerCrear,
  );
  app.post(
    '/webhook',
    bodyLimit({
      maxSize: WEBHOOK_BODY_MAX_BYTES,
      onError: (c) => c.json({ error: 'Body demasiado grande', codigo: 413 }, 413),
    }),
    handlerWebhook,
  );
  app.get('/:id', handlerConsultar);
  app.get('/:id/eventos', handlerEventosSSE);

  return app;
}

/** Alias dual UX-2 — compatible con la convención de naming en español. */
export const crearRutasPagos = rutasPagos;
