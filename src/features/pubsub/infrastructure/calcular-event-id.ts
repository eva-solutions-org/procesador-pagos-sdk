/**
 * Deriva un eventId determinístico SHA-256 para dedup cross-runtime
 * (REQ-SSE-005).
 *
 * Fórmula: `v1:pagoId:estado:estadoAnterior:timestamp` → SHA-256 hex lowercase.
 * `null` literal cuando `estadoAnterior` es `null`.
 *
 * Cross-runtime: Node 18.19+, CF Workers, Bun, Deno, browser. Usa
 * `globalThis.crypto.subtle.digest` (Web Crypto API).
 */
export async function calcularEventId(
  pagoId: string,
  estado: string,
  estadoAnterior: string | null,
  timestamp: string,
): Promise<string> {
  const input = `v1:${pagoId}:${estado}:${estadoAnterior ?? "null"}:${timestamp}`;
  const data = new TextEncoder().encode(input);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
