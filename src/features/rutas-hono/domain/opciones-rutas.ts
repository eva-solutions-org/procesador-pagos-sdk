/**
 * Opciones de configuración del factory `rutasPagos()` (REQ-RUTAS-001 +
 * REQ-RUTAS-008 + ADR-013 + ADR-017 + ADR-019 + ADR-020 — Security boundary).
 *
 * El consumidor pasa estas opciones (literal o lazy) al construir el sub-app
 * Hono que monta los 4 endpoints (`POST /crear`, `POST /webhook`, `GET /:id`,
 * `GET /:id/eventos`).
 */

import type { Context } from 'hono';
import type { CrearPagoInput, Pago } from '../../pagos/index.js';
import type { PubSubAdapter } from '../../pubsub/index.js';

export interface RutasPagosOpciones {
  /** API key del servicio Procesador-de-pagos. NUNCA logueada. */
  apiKey: string;

  /** Secret para verificación HMAC de webhooks entrantes. */
  webhookSecret: string;

  /**
   * OBLIGATORIO. Validá y recalculá el monto canónico desde tu BD.
   * Si no necesitás validación, pasá `(input) => input` (identity) explícitamente.
   *
   * Razón: el frontend puede manipular monto/moneda desde devtools.
   * Sin este hook, un atacante paga centavos por productos caros.
   *
   * Ver docs/security.md.
   *
   * @example
   * alCrearPago: async (input, c) => {
   *   const producto = await db.productos.findById(input.metadata.productoId);
   *   if (!producto) throw new Error('Producto no encontrado');
   *   return {
   *     ...input,
   *     monto: (producto.precio / 100).toFixed(2),
   *     moneda: producto.moneda,
   *   };
   * }
   */
  alCrearPago: (
    input: CrearPagoInput,
    contexto: Context,
  ) => CrearPagoInput | Promise<CrearPagoInput>;

  /**
   * Adapter pub/sub opcional. Si está presente, `GET /:id/eventos` se registra
   * con SSE. Si está ausente, el endpoint retorna 404 y el modo del front
   * será `polling` automáticamente.
   */
  pubsub?: PubSubAdapter;

  /**
   * Hook de autorización del endpoint SSE `GET /:id/eventos` (FIX I2 / ADR-019).
   *
   * Si `pubsub` está configurado y `verificarAcceso` no, el SDK emite un warning
   * porque el endpoint queda público. Implementá auth de cookie/JWT acá.
   */
  verificarAcceso?: (c: Context, pagoId: string) => boolean | Promise<boolean>;

  /** Hook awaitable invocado al recibir webhook con estado `completado`. */
  alConfirmar?: (pago: Pago) => void | Promise<void>;

  /** Hook awaitable invocado para estados `fallido | expirado | cancelado`. */
  alFallar?: (pago: Pago) => void | Promise<void>;

  /** Hook awaitable invocado al recibir webhook con estado `reembolsado`. */
  alReembolsar?: (pago: Pago) => void | Promise<void>;

  /** Hook awaitable invocado en TODO webhook recibido (antes de ack). */
  alWebhookRecibido?: (pago: Pago) => void | Promise<void>;

  /** Hook awaitable invocado en cada `GET /:id` antes de responder (polling). */
  alAntesDeResponderPolling?: (pago: Pago) => void | Promise<void>;

  /** Callback síncrono de error en publish al pubsub (fire-and-forget). */
  onPublishError?: (error: unknown) => void;

  /** Callback síncrono de error en subscribe al pubsub. */
  onSubscribeError?: (error: unknown) => void;

  /** Heartbeat custom — clamp [10s, 60s]. Default 30s. */
  heartbeatMs?: number;
}

/**
 * Permite que el consumidor pase opciones literales O una función lazy
 * `(env) => opciones` (típico en CF Workers donde los secrets viven en `env`).
 */
export type RutasPagosFactoryArgs<Env extends object = object> =
  | RutasPagosOpciones
  | ((env: Env) => RutasPagosOpciones | Promise<RutasPagosOpciones>);
