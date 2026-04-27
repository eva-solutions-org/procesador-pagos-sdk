import { z } from 'zod';

/**
 * Schema de la response que `POST /crear` envía al cliente del SDK
 * (NO la response del servicio Procesador-de-pagos — esa la consume el
 * SDK internamente).
 *
 * El front usa este shape para decidir el modo (`sse` | `polling`).
 */
export const crearPagoResponseClienteSchema = z.object({
  intentId: z.string(),
  pagoId: z.string(),
  modo: z.enum(['sse', 'polling']),
  basePath: z.string(),
});

export type CrearPagoResponseCliente = z.infer<typeof crearPagoResponseClienteSchema>;
