/**
 * Sanitiza un valor que se inyecta en campos de control SSE (`event:`,
 * `id:`, `retry:`) — defensa CR/LF injection (FIX C1, mitigación
 * adicional al CVE-2026-29085 de Hono <4.12.4).
 *
 * Throw si el valor contiene `\r` (CR, 0x0D) o `\n` (LF, 0x0A) —
 * ambos terminadores de línea SSE permiten al atacante inyectar
 * líneas de control falsas.
 *
 * NO sanitiza el campo `data:` — los newlines dentro de un JSON-string
 * escapado son válidos y comunes.
 *
 * @param valor el valor a inyectar como `event:` / `id:` / `retry:`.
 * @returns el valor original si es válido.
 * @throws Error si contiene CR/LF.
 */
export function sanitizarCampoSSE(valor: string): string {
  if (/[\r\n]/.test(valor)) {
    throw new Error(
      `[procesador-pagos-sdk] Valor SSE contiene CR/LF inválido: ${JSON.stringify(
        valor.slice(0, 50),
      )}`,
    );
  }
  return valor;
}
