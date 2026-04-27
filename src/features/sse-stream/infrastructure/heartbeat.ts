/**
 * Constantes y clamp para el intervalo de heartbeat SSE (REQ-SSE-002).
 *
 * Default 30s. Clamp [10s, 60s] para evitar misuse:
 * - Muy bajo (<10s) consume CPU/red sin beneficio.
 * - Muy alto (>60s) genera reconexión innecesaria en proxies.
 */

export const HEARTBEAT_DEFAULT_MS = 30_000;
export const HEARTBEAT_MIN_MS = 10_000;
export const HEARTBEAT_MAX_MS = 60_000;

export function clampHeartbeatMs(valor: number | undefined): number {
  if (typeof valor !== "number") return HEARTBEAT_DEFAULT_MS;
  return Math.max(HEARTBEAT_MIN_MS, Math.min(HEARTBEAT_MAX_MS, valor));
}
