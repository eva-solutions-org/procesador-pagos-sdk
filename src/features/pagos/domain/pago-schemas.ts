/**
 * Schemas Zod del feature `pagos` — VERIFICADOS 1:1 CONTRA EL SERVICIO.
 *
 * Commit hash del servicio testeado: `380874771a21b56bd42f1db23c60627c62209327`.
 *
 * Fuentes literales (snapshot en `.atl/fase-0-verificacion.md`):
 * - `Procesador-de-pagos\src\features\pagos\domain\pago-schemas.ts` (input + filtros + reembolso).
 * - `Procesador-de-pagos\src\routes\pago-response-schemas.ts` (responses HTTP wrappers).
 *
 * IMPORTANTE — desviaciones intencionales del SDK respecto al servicio:
 * - **C6**: `crearPagoInputSchema.metadata` NO valida tamaño 8KB localmente.
 *   El servicio valida y responde 413/422 si excede. SDK propaga el request.
 * - El cliente HTTP del SDK desenvuelve `{ data }` antes de `safeParse` (A2),
 *   por lo que estos schemas describen el SHAPE INTERIOR (no el wrapper).
 *
 * Fase 0 confirmó:
 * - `pagoCreadoResponseSchema` (data) → 10 campos.
 * - `pagoDetalleResponseSchema` (data) → 22 campos.
 * - Status 201 en POST /api/v1/pagos (lenient 2xx en SDK).
 */

import { z } from 'zod';
import { ESTADOS_PAGO, METODOS_PAGO, TIPOS_PAGO } from './pago-types.js';

/** Hasta 8 dígitos enteros sin ceros iniciales + 2 decimales. */
const REGEX_MONTO = /^(?:0|[1-9]\d{0,7})\.\d{2}$/;

// ─── INPUT: POST /api/v1/pagos ────────────────────────────────────────────

/**
 * Input de `crearPago`. Mirror 1:1 del `crearPagoSchema` del servicio.
 *
 * NOTA C6: el campo `metadata` NO valida tamaño 8KB en SDK.
 * El servicio decide y responde 413/422 si excede.
 */
export const crearPagoInputSchema = z.object({
  monto: z
    .string()
    .regex(REGEX_MONTO, 'Formato: hasta 8 digitos sin ceros iniciales con 2 decimales'),
  moneda: z.string().length(3).toUpperCase(),
  tipo: z.enum(TIPOS_PAGO),
  referenciaExterna: z.string().min(1).max(255),
  pasarela: z.string().optional(),
  metodoPago: z.enum(METODOS_PAGO).optional(),
  incluirPaymentLink: z.boolean().default(true),
  expiracionHoras: z.number().int().positive().max(168).default(24),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ─── RESPONSE: POST /api/v1/pagos (10 campos — I8) ─────────────────────────

/**
 * Response de `crearPago` — 10 campos, distinto de `pagoDetalleSchema`.
 * Verificado contra `pagoCreadoResponseSchema.data` del servicio.
 */
export const crearPagoResponseSchema = z.object({
  pagoId: z.string(),
  intentId: z.string().optional(),
  paymentLink: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  qrCodeEmv: z.string().optional(),
  estado: z.enum(ESTADOS_PAGO),
  pasarela: z.string(),
  montoOriginal: z.string(),
  monedaOriginal: z.string(),
  expiresAt: z.string().nullable(),
});

// ─── RESPONSE: GET /api/v1/pagos/{id} (22 campos — I9) ─────────────────────

/**
 * Detalle completo de un pago — 22 campos verificados contra
 * `pagoDetalleResponseSchema.data` del servicio.
 *
 * `tipo` y `metodoPago` se exponen como `z.string()` (no enum) porque
 * el servicio los expone así en su schema OpenAPI (decisión del backend).
 */
export const pagoDetalleSchema = z.object({
  id: z.string(),
  proyectoId: z.string(),
  pasarelaId: z.string(),
  referenciaExterna: z.string(),
  tipo: z.string(),
  montoOriginal: z.string(),
  monedaOriginal: z.string(),
  estado: z.enum(ESTADOS_PAGO),
  pasarelaPaymentId: z.string().nullable(),
  pasarelaStatus: z.string().nullable(),
  paymentLink: z.string().nullable(),
  qrCodeUrl: z.string().nullable(),
  qrCodeEmv: z.string().nullable(),
  intentId: z.string().nullable(),
  metodoPago: z.string().nullable(),
  errorMensaje: z.string().nullable(),
  webhookRecibido: z.boolean(),
  callbackEnviado: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── RESPONSE: GET /api/v1/pagos (listar) ──────────────────────────────────

/**
 * Item del listar — 10 campos, subset de `pagoDetalleSchema`.
 * Verificado contra `pagoResumenSchema` del servicio.
 */
export const pagoResumenSchema = z.object({
  id: z.string(),
  proyectoId: z.string(),
  pasarelaId: z.string(),
  referenciaExterna: z.string(),
  tipo: z.string(),
  montoOriginal: z.string(),
  monedaOriginal: z.string(),
  estado: z.enum(ESTADOS_PAGO),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const paginacionMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

/** Response del listar — wrapper externo `{ data: [...], pagination }`. */
export const listarPagosResponseSchema = z.object({
  data: z.array(pagoResumenSchema),
  pagination: paginacionMetaSchema,
});

// ─── INPUT: query de listar ────────────────────────────────────────────────

/**
 * Filtros para `listarPagos`. Mirror del `filtrarPagoSchema` del servicio
 * (sin `z.coerce` porque serializamos a string al construir la URL).
 */
export const filtrarPagoSchema = z.object({
  referenciaExterna: z.string().optional(),
  estado: z.enum(ESTADOS_PAGO).optional(),
  tipo: z.enum(TIPOS_PAGO).optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

// ─── RESPONSE: POST /api/v1/pagos/{id}/cancelar ────────────────────────────

/** Response de `cancelarPago` — 2 campos. */
export const pagoCanceladoResponseSchema = z.object({
  pagoId: z.string(),
  estado: z.enum(ESTADOS_PAGO),
});

// ─── INPUT + RESPONSE: POST /api/v1/pagos/{id}/reembolsar ──────────────────

/** Body opcional de `reembolsarPago`. Sin monto → reembolso total. */
export const reembolsarPagoBodySchema = z.object({
  monto: z.string().regex(REGEX_MONTO, 'Formato de monto inválido').optional(),
});

/** Response de `reembolsarPago` — 3 campos (mensaje opcional). */
export const pagoReembolsadoResponseSchema = z.object({
  pagoId: z.string(),
  estado: z.enum(ESTADOS_PAGO),
  mensaje: z.string().optional(),
});
