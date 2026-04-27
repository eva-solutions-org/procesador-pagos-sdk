/**
 * Validación bloqueante de opciones del factory `rutasPagos()` (FIX S1.1).
 *
 * Esta función es el "gate" defensivo que impide construir un sub-app sin
 * `alCrearPago` (ADR-020 — Security boundary). Throw síncrono — corre tanto
 * en construcción literal como en middleware lazy del primer request.
 *
 * Aplica SIEMPRE — independiente de `EVA_PAGOS_BUILD_ENV`. NO solo en prod.
 *
 * Mensajes constantes exportados para SOT (single source of truth) compartido
 * con tests de inspección estática (T-7-21..T-7-22) y docs (T-8-01, T-8-08).
 */

import type { RutasPagosOpciones } from '../domain/opciones-rutas.js';

export const MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE =
  '[procesador-pagos-sdk] alCrearPago es OBLIGATORIO para evitar que un atacante manipule ' +
  'monto/moneda desde el frontend. Implementá el hook con lookup en tu BD para recalcular ' +
  'monto canónico. Ver docs/security.md.';

export const MENSAJE_ERROR_AL_CREAR_PAGO_NO_FUNCION = (tipoRecibido: string): string =>
  `[procesador-pagos-sdk] alCrearPago debe ser una función. Recibido: ${tipoRecibido}. Ver docs/security.md.`;

export const MENSAJE_ERROR_API_KEY = '[procesador-pagos-sdk] apiKey requerida';

export const MENSAJE_ERROR_WEBHOOK_SECRET = '[procesador-pagos-sdk] webhookSecret requerido';

/**
 * Valida que las opciones contengan `alCrearPago` (función), `apiKey` (string
 * no vacío), y `webhookSecret` (string no vacío). Throw síncrono al primer
 * error con mensaje constante.
 *
 * Función pura, sin side effects (no `console.warn`, no I/O).
 *
 * Orden de checks: `alCrearPago` PRIMERO (más crítico para el threat model),
 * `apiKey` y `webhookSecret` después.
 */
export function validarOpcionesRutas(opciones: RutasPagosOpciones): void {
  // S1.1 — alCrearPago obligatorio (PRIMERO)
  if (opciones.alCrearPago === undefined || opciones.alCrearPago === null) {
    throw new Error(MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE);
  }
  if (typeof opciones.alCrearPago !== 'function') {
    throw new Error(MENSAJE_ERROR_AL_CREAR_PAGO_NO_FUNCION(typeof opciones.alCrearPago));
  }

  // apiKey requerida
  if (
    !opciones.apiKey ||
    typeof opciones.apiKey !== 'string' ||
    !opciones.apiKey.trim()
  ) {
    throw new Error(MENSAJE_ERROR_API_KEY);
  }

  // webhookSecret requerido
  if (
    !opciones.webhookSecret ||
    typeof opciones.webhookSecret !== 'string' ||
    !opciones.webhookSecret.trim()
  ) {
    throw new Error(MENSAJE_ERROR_WEBHOOK_SECRET);
  }
}
