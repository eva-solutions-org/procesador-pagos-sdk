/**
 * Handler `POST /webhook` (REQ-RUTAS-004 / REQ-SSE-005 / ADR-012 / ADR-014).
 *
 * Flujo:
 * 1. Verifica firma HMAC con `verificarWebhookDesdeRequest` → 401/422 si falla.
 * 2. Parsea payload con `webhookPayloadSchema` (9 campos).
 * 3. Calcula `eventId` con `calcularEventId(...)`.
 * 4. Si dedupado → devuelve 200 ack inmediato.
 * 5. Invoca hooks de negocio según estado (await — estrategia mixta).
 * 6. Si `opciones.pubsub`: publica evento al canal `pagos:${pagoId}` —
 *    fire-and-forget vía `c.executionCtx?.waitUntil(...)` o catch silencioso.
 * 7. Devuelve 200 ack.
 */

import type { Context } from 'hono';
import { verificarWebhookDesdeRequest } from '../../webhooks/index.js';
import {
  calcularEventId,
  type EventoPago,
} from '../../pubsub/index.js';
import { esEventoDuplicado } from '../../sse-stream/index.js';
import { webhookPayloadSchema } from '../domain/webhook-payload.js';
import type { AmbienteRutasPagos } from '../domain/contexto-rutas.js';
import type { Pago } from '../../pagos/domain/index.js';

const ESTADOS_FALLA: ReadonlyArray<string> = ['fallido', 'expirado', 'cancelado'];

/**
 * Convierte el payload del webhook (9 campos) a un objeto `Pago` parcial
 * para invocar hooks de negocio. NO es un Pago completo (22 campos) — es
 * el subset que el webhook entrega.
 *
 * Cast a `Pago` con asignaciones explícitas: el consumidor recibe los
 * campos disponibles del webhook + nullables defensivos en los faltantes.
 */
function payloadAPago(payload: import('../domain/webhook-payload.js').WebhookPayload): Pago {
  return {
    id: payload.pagoId,
    proyectoId: '',
    pasarelaId: '',
    referenciaExterna: payload.referenciaExterna,
    tipo: '',
    montoOriginal: payload.monto,
    monedaOriginal: payload.moneda,
    estado: payload.estado,
    pasarelaPaymentId: null,
    pasarelaStatus: null,
    paymentLink: null,
    qrCodeUrl: null,
    qrCodeEmv: null,
    intentId: null,
    metodoPago: null,
    errorMensaje: null,
    webhookRecibido: true,
    callbackEnviado: false,
    metadata: payload.metadata,
    expiresAt: null,
    createdAt: payload.timestamp,
    updatedAt: payload.timestamp,
  };
}

export async function handlerWebhook<Env extends object = object>(
  c: Context<AmbienteRutasPagos<Env>>,
): Promise<Response> {
  const opciones = c.get('opcionesPagos');

  // 1. Verificar firma HMAC
  const verif = await verificarWebhookDesdeRequest(c.req.raw, opciones.webhookSecret);
  if (!verif.success) {
    const status = verif.codigo === 401 ? 401 : 422;
    return c.json({ error: verif.error, codigo: verif.codigo }, status);
  }

  // 2. Parsear payload
  const parsed = webhookPayloadSchema.safeParse(verif.data.payload);
  if (!parsed.success) {
    return c.json(
      {
        error: `Payload inválido: ${parsed.error.message}`,
        codigo: 422,
      },
      422,
    );
  }
  const payload = parsed.data;

  // 3. Calcular eventId
  const eventId = await calcularEventId(
    payload.pagoId,
    payload.estado,
    payload.estadoAnterior,
    payload.timestamp,
  );

  // 4. Dedup
  if (esEventoDuplicado(eventId)) {
    return c.json({ ok: true, deduped: true }, 200);
  }

  // 5. Hooks de negocio (await — estrategia mixta hooks vs publish)
  const pago = payloadAPago(payload);
  if (opciones.alWebhookRecibido) {
    try {
      await opciones.alWebhookRecibido(pago);
    } catch (err) {
      console.error('[procesador-pagos-sdk] alWebhookRecibido lanzó:', err);
    }
  }
  try {
    if (payload.estado === 'completado' && opciones.alConfirmar) {
      await opciones.alConfirmar(pago);
    } else if (ESTADOS_FALLA.includes(payload.estado) && opciones.alFallar) {
      await opciones.alFallar(pago);
    } else if (payload.estado === 'reembolsado' && opciones.alReembolsar) {
      await opciones.alReembolsar(pago);
    }
  } catch (err) {
    console.error('[procesador-pagos-sdk] hook de webhook lanzó:', err);
  }

  // 6. Publish al pubsub (fire-and-forget)
  if (opciones.pubsub) {
    const evento: EventoPago = {
      eventId,
      pagoId: payload.pagoId,
      referenciaExterna: payload.referenciaExterna,
      estado: payload.estado,
      estadoAnterior: payload.estadoAnterior,
      monto: payload.monto,
      moneda: payload.moneda,
      pasarela: payload.pasarela,
      metadata: payload.metadata,
      timestamp: payload.timestamp,
    };
    const canal = `pagos:${payload.pagoId}`;
    const promesaPublish = opciones.pubsub
      .publicar(canal, evento)
      .catch((err: unknown) => {
        if (opciones.onPublishError) {
          try {
            opciones.onPublishError(err);
          } catch {
            /* swallow */
          }
        } else {
          console.error('[procesador-pagos-sdk] publish error:', err);
        }
      });
    // Fire-and-forget: usar waitUntil si está disponible (CF Workers).
    const ctx = c.executionCtx;
    if (
      ctx !== undefined &&
      typeof (ctx as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil === 'function'
    ) {
      (ctx as { waitUntil: (p: Promise<unknown>) => void }).waitUntil(promesaPublish);
    } else {
      void promesaPublish;
    }
  }

  // 7. Ack
  return c.json({ ok: true }, 200);
}
