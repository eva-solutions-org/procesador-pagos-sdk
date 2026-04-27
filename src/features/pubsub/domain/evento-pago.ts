/**
 * Shape canónico del evento publicado al pub/sub cuando llega un webhook
 * del servicio Procesador-de-pagos.
 *
 * `eventId` es derivado SHA-256 (`v1:pagoId:estado:estadoAnterior:timestamp`)
 * para dedup cross-instance (REQ-SSE-005).
 */
export interface EventoPago {
  eventId: string;
  pagoId: string;
  referenciaExterna: string;
  estado: string;
  estadoAnterior: string | null;
  monto: string;
  moneda: string;
  pasarela: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}
