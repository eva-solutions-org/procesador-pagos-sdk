/**
 * Headers HTTP estándar para respuestas SSE (REQ-SSE-003).
 *
 * - `Content-Type: text/event-stream` — content negotiation.
 * - `Cache-Control: no-cache` — proxies no deben cachear el stream.
 * - `X-Accel-Buffering: no` — desactiva buffering en NGINX/proxy edge.
 * - `Connection: keep-alive` — mantiene la conexión TCP abierta.
 */
export const HEADERS_SSE = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
} as const;
