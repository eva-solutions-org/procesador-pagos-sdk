/**
 * Fixtures compartidos por todos los tests.
 *
 * Mantienen los shapes EXACTOS del servicio (10 campos crear, 22 detalle,
 * 10 resumen, 2 cancelado, 3 reembolsado). Cualquier divergencia rompe
 * los tests de shape — eso es intencional.
 */

export const SECRET_KEY_TEST = 's3cr3t-fixture-only';
export const API_KEY_TEST = 'pk_test_fixture_abc123';

/** Response shape de `crearPago` — 10 campos. Verificado contra spec REQ-PAGOS-001. */
export const CREAR_PAGO_RESPONSE_FIXTURE = {
  pagoId: 'pago_test_1',
  intentId: 'intent_abc',
  paymentLink: 'https://pay.example.com/pago_test_1',
  qrCodeUrl: 'https://example.com/qr/pago_test_1.png',
  qrCodeEmv: '00020101...',
  estado: 'pendiente' as const,
  pasarela: 'prometeo',
  montoOriginal: '150.00',
  monedaOriginal: 'USD',
  expiresAt: '2026-04-26T12:00:00.000Z',
} as const;

/** Response shape de `consultarPago` — 22 campos. Verificado contra spec REQ-PAGOS-002. */
export const PAGO_DETALLE_FIXTURE = {
  id: 'pago_detalle_1',
  proyectoId: 'proy_1',
  pasarelaId: 'prometeo',
  referenciaExterna: 'order-123',
  tipo: 'pago_unico',
  montoOriginal: '150.00',
  monedaOriginal: 'USD',
  estado: 'pendiente' as const,
  pasarelaPaymentId: null,
  pasarelaStatus: null,
  paymentLink: 'https://pay.example.com/pago_detalle_1',
  qrCodeUrl: null,
  qrCodeEmv: null,
  intentId: 'intent_abc',
  metodoPago: 'transfer',
  errorMensaje: null,
  webhookRecibido: false,
  callbackEnviado: false,
  metadata: { tag: 'test' },
  expiresAt: '2026-04-26T12:00:00.000Z',
  createdAt: '2026-04-25T12:00:00.000Z',
  updatedAt: '2026-04-25T12:00:00.000Z',
} as const;

/** Item del listado — 10 campos del `pagoResumenSchema`. */
export const PAGO_RESUMEN_FIXTURE = {
  id: 'pago_resumen_1',
  proyectoId: 'proy_1',
  pasarelaId: 'prometeo',
  referenciaExterna: 'order-resumen',
  tipo: 'pago_unico',
  montoOriginal: '50.00',
  monedaOriginal: 'USD',
  estado: 'pendiente' as const,
  createdAt: '2026-04-25T12:00:00.000Z',
  updatedAt: '2026-04-25T12:00:00.000Z',
} as const;

/** Response de `cancelarPago` — 2 campos. */
export const CANCELADO_FIXTURE = {
  pagoId: 'pago_test_1',
  estado: 'cancelando' as const,
} as const;

/** Response de `reembolsarPago` — 3 campos. */
export const REEMBOLSADO_FIXTURE = {
  pagoId: 'pago_test_1',
  estado: 'reembolsando' as const,
  mensaje: 'Reembolso iniciado',
} as const;

/** Genera input válido de `crearPago`. */
export const inputCrearPagoValido = () =>
  ({
    monto: '150.00',
    moneda: 'USD',
    tipo: 'pago_unico' as const,
    referenciaExterna: 'order-1',
  }) as const;

/**
 * Helper de test para generar firma HMAC-SHA256 válida.
 * 
 * Implementación independiente usando WebCrypto (NO reutiliza calcularHmacSha256
 * del código productivo para evitar acoplamiento de tests a implementación).
 * 
 * Retorna firma en formato hex lowercase (64 chars).
 */
export const generarFirmaWebhookTest = async (
  body: string | Uint8Array,
  secretKey: string,
): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    (typeof body === "string" ? encoder.encode(body) : body) as BufferSource,
  );
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};
