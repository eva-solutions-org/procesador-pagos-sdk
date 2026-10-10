/**
 * Constantes y tipos del feature `pagos`.
 *
 * Verificadas 1:1 contra el servicio de pagos (constantes de estados y tipos de pago).
 *
 * NO redefinir aquí valores derivados de Zod (`PagoDetalle`, `Pago`, etc.) —
 * esos viven en este archivo importando schemas desde `pago-schemas.ts`.
 */

export const ESTADOS_PAGO = [
  'pendiente',
  'procesando',
  'completado',
  'fallido',
  'expirado',
  'reembolsado',
  'reembolsando',
  'cancelado',
  'cancelando',
] as const;

export const TIPOS_PAGO = ['pago_unico', 'suscripcion', 'recarga'] as const;

export const METODOS_PAGO = ['transfer', 'qr'] as const;

export type EstadoPago = (typeof ESTADOS_PAGO)[number];
export type TipoPago = (typeof TIPOS_PAGO)[number];
export type MetodoPago = (typeof METODOS_PAGO)[number];
