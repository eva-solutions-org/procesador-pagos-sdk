/**
 * State machine del `<BotonPago>` (REQ-WIDGET-005).
 *
 * Discriminated union por `fase` — cada fase tiene los campos que aplican
 * a su transición. TS strict prohíbe acceder a campos de otra fase.
 */

import type { Pago } from '../../pagos/index.js';

export type EstadoBoton =
  | { fase: 'inicial' }
  | { fase: 'creando' }
  | { fase: 'pagando'; intentId: string; pagoId: string }
  | { fase: 'procesando'; pagoId: string; modo: 'sse' | 'polling' }
  | { fase: 'completado'; pago: Pago }
  | { fase: 'fallido'; mensaje: string; pagoId?: string };
