/**
 * Constantes y tipos del feature `pagos`.
 *
 * Verificadas 1:1 contra el servicio Procesador-de-pagos.
 * Commit hash del servicio testeado: `380874771a21b56bd42f1db23c60627c62209327`.
 *
 * Fuente:
 * - `D:\GitHub\Proyecto Global\Pagos Service\Procesador-de-pagos\src\core\constants\estados.ts`
 * - `D:\GitHub\Proyecto Global\Pagos Service\Procesador-de-pagos\src\features\pagos\domain\tipos-pago.ts`
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
