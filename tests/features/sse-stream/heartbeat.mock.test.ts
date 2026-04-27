/**
 * Tests `clampHeartbeatMs()` (T-7-06 — REQ-SSE-002).
 */

import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_DEFAULT_MS,
  HEARTBEAT_MAX_MS,
  HEARTBEAT_MIN_MS,
  clampHeartbeatMs,
} from "../../../src/features/sse-stream/index.js";

describe("clampHeartbeatMs — REQ-SSE-002", () => {
  it("undefined retorna default 30000", () => {
    expect(clampHeartbeatMs(undefined)).toBe(HEARTBEAT_DEFAULT_MS);
    expect(HEARTBEAT_DEFAULT_MS).toBe(30_000);
  });

  it("valor menor que MIN se clampa a 10000", () => {
    expect(clampHeartbeatMs(0)).toBe(HEARTBEAT_MIN_MS);
    expect(clampHeartbeatMs(5000)).toBe(HEARTBEAT_MIN_MS);
    expect(HEARTBEAT_MIN_MS).toBe(10_000);
  });

  it("valor mayor que MAX se clampa a 60000", () => {
    expect(clampHeartbeatMs(120_000)).toBe(HEARTBEAT_MAX_MS);
    expect(HEARTBEAT_MAX_MS).toBe(60_000);
  });

  it("valor dentro del rango se preserva", () => {
    expect(clampHeartbeatMs(15_000)).toBe(15_000);
    expect(clampHeartbeatMs(45_000)).toBe(45_000);
  });

  it("valor exactamente en los bordes se preserva", () => {
    expect(clampHeartbeatMs(HEARTBEAT_MIN_MS)).toBe(HEARTBEAT_MIN_MS);
    expect(clampHeartbeatMs(HEARTBEAT_MAX_MS)).toBe(HEARTBEAT_MAX_MS);
  });

  it("non-number retorna default", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(clampHeartbeatMs("30000" as any)).toBe(HEARTBEAT_DEFAULT_MS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(clampHeartbeatMs(null as any)).toBe(HEARTBEAT_DEFAULT_MS);
  });
});
