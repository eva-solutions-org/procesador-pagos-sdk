/**
 * Tipo `Variables` compartido del contexto Hono — habilita inferencia
 * correcta para `c.get('opcionesPagos')` y `c.get('cliente')` dentro de
 * los handlers (T-4-11 + T-4-12 — typing del context).
 */

import type { ClienteProcesadorPagos } from '../../../core/cliente/index.js';
import type { RutasPagosOpciones } from './opciones-rutas.js';

export interface VariablesRutasPagos {
  opcionesPagos: RutasPagosOpciones;
  cliente: ClienteProcesadorPagos;
}

/**
 * Env defaultea a `object` (no `unknown`) para satisfacer la constraint de
 * Hono v4 (`Bindings extends object`). El consumidor que use bindings tipados
 * de CF Workers / Bun / Node pasa su tipo como genérico.
 */
export type AmbienteRutasPagos<Env extends object = object> = {
  Bindings: Env;
  Variables: VariablesRutasPagos;
};
