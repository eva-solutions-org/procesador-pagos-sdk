/**
 * Schema Zod del payload que el servicio Procesador-de-pagos envía al webhook.
 *
 * Verificado 1:1 contra el `webhookPayloadSchema` del servicio
 * (commit `380874771a21b56bd42f1db23c60627c62209327`).
 *
 * El consumidor del SDK NO importa este schema — se usa internamente en
 * `handler-webhook.ts` para parsear el body JSON post-firma-OK.
 */

import { z } from 'zod';
import { ESTADOS_PAGO } from '../../pagos/domain/index.js';

/** 9 campos del payload del webhook. */
export const webhookPayloadSchema = z.object({
  pagoId: z.string(),
  referenciaExterna: z.string(),
  estado: z.enum(ESTADOS_PAGO),
  estadoAnterior: z.enum(ESTADOS_PAGO).nullable(),
  monto: z.string(),
  moneda: z.string(),
  pasarela: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  timestamp: z.string(),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
