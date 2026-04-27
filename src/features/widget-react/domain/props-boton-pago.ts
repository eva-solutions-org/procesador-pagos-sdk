/**
 * Props del componente `<BotonPago>` y opciones del hook `useBotonPago`
 * (REQ-WIDGET-001..014 / S1.2 — JSDoc DISPLAY ONLY).
 *
 * Este archivo es DOMINIO público — el consumidor importa estos tipos.
 * El JSDoc destacado en `monto`/`moneda` advierte que el backend recalcula
 * el monto canónico (ADR-020 — Security boundary).
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Pago } from '../../pagos/index.js';
import type { EstadoBoton } from './estados-boton.js';

export interface ApiRenderPropBoton {
  iniciar: () => Promise<void>;
  cerrar: () => void;
  estado: EstadoBoton;
  error: string | null;
  pago: Pago | null;
  intentId: string | null;
}

export interface PropsBotonPago {
  /**
   * Monto a mostrar en el botón. **DISPLAY ONLY** — el backend del consumidor
   * recalcula el monto canónico desde su BD usando `metadata` para evitar
   * manipulación desde devtools del frontend.
   *
   * Ver docs/security.md para el patrón seguro.
   *
   * @example
   * // Frontend manda monto solo para mostrar:
   * <BotonPago monto="10.00" moneda="PEN" referenciaExterna="..."
   *   metadata={{ productoId: 1 }} />
   *
   * // Backend en alCrearPago recalcula desde la BD:
   * alCrearPago: async (input) => ({
   *   ...input,
   *   monto: (await db.productos.findById(input.metadata.productoId)).precio,
   * })
   */
  monto: string;

  /**
   * Moneda ISO 4217 a mostrar en el botón. **DISPLAY ONLY** — el backend
   * recalcula la moneda canónica desde su BD usando `metadata`. NO confiar
   * en este valor server-side.
   *
   * Ver docs/security.md.
   */
  moneda: string;

  /**
   * Identificador único de la transacción (debe ser único por proyecto).
   * El servicio Procesador-pagos retorna 409 si se reutiliza (anti-replay).
   */
  referenciaExterna: string;

  /**
   * Metadata arbitraria que viaja al backend. Usá esto para identificadores
   * (productoId, cantidad, cuponCodigo) que el backend usa para recalcular
   * monto canónico en `alCrearPago`.
   *
   * @example metadata={{ productoId: 42, cantidad: 2, cuponCodigo: 'SUMMER10' }}
   */
  metadata?: Record<string, unknown>;

  /** widgetId del CDN Prometeo. Si no se pasa, lee de env vars. */
  widgetId?: string;

  /** Base path del sub-app `rutasPagos()` (default `/`). */
  basePath?: string;

  /** Intervalo polling ms — clamp [500, 30000]. Default 2000. */
  intervaloMs?: number;

  /** Timeout suave ms (sin abortar) — default 60000. */
  timeoutMs?: number;

  /** Texto del botón en estado inicial. Default `Pagar {moneda} {monto}`. */
  textoBoton?: string;

  /** Texto durante creación. Default `Preparando...`. */
  textoCreando?: string;

  /** Texto durante procesamiento. */
  textoProcesando?: string;

  /** Texto cuando el polling/SSE excede `timeoutMs` sin terminar. */
  textoTimeoutSuave?: string;

  /** Texto del CTA cuando falla. Default `Reintentar`. */
  textoReintentar?: string;

  /** Estilos inline del botón (override base). */
  style?: CSSProperties;

  /** Estilos por slot (override fino). */
  styles?: {
    boton?: CSSProperties;
    spinner?: CSSProperties;
    mensaje?: CSSProperties;
  };

  /** className override total — desactiva inline styles base. */
  className?: string;

  /**
   * Render-prop opcional. Si está presente, el consumidor renderiza su
   * propio botón usando la API expuesta — no se monta el botón default.
   */
  children?: (api: ApiRenderPropBoton) => ReactNode;

  /** Callback al recibir webhook con estado `completado`. */
  onCompletado?: (pago: Pago) => void;

  /** Callback al fallar el flujo. */
  onFallido?: (error: { error: string; codigo: number; pago?: Pago }) => void;

  /** Callback cuando el polling/SSE excede `timeoutMs`. */
  onTimeoutSuave?: (pago: Pago) => void;

  /** Callback cuando el usuario cierra el widget Prometeo. */
  onCancelado?: () => void;
}

/**
 * Opciones del hook `useBotonPago` — subset de `PropsBotonPago` sin lo
 * relacionado al render del botón default (style/styles/className/children).
 *
 * El hook retorna la misma `ApiRenderPropBoton` que el render-prop expone.
 *
 * NOTA S1.2: el JSDoc destacado de `monto`/`moneda` se hereda por re-uso
 * del tipo (TS muestra el mismo JSDoc en el IDE del consumidor).
 */
export type OpcionesUseBotonPago = Omit<
  PropsBotonPago,
  'style' | 'styles' | 'className' | 'children'
>;
