/**
 * Emite un warning a console si `pubsub` está configurado pero `verificarAcceso`
 * no — el endpoint `GET /:id/eventos` queda público (FIX I2 / ADR-019).
 *
 * Idempotente — en el factory se invoca una vez al construir (literal) o una
 * vez por request en middleware lazy. La política de noise está delegada al
 * consumidor (puede silenciarlo configurando `verificarAcceso`).
 */

import type { RutasPagosOpciones } from '../domain/opciones-rutas.js';

export function emitirWarningVerificarAccesoFaltante(opciones: RutasPagosOpciones): void {
  if (opciones.pubsub && !opciones.verificarAcceso) {
    console.warn(
      '[procesador-pagos-sdk] WARN: rutasPagos sin verificarAcceso — el endpoint GET /:id/eventos queda público. ' +
        'Configurar middleware de auth o pasar opciones.verificarAcceso(c, pagoId) => boolean.',
    );
  }
}
