/**
 * Tests `calcularEventId()` (T-7-04 — REQ-SSE-005).
 *
 * - Determinismo: mismo input → mismo SHA-256 hex.
 * - Inputs distintos → hashes distintos.
 * - Formato: 64 chars hex lowercase.
 */

import { describe, expect, it } from "vitest";
import { calcularEventId } from "../../../src/features/pubsub/index.js";

describe("calcularEventId — REQ-SSE-005", () => {
  it("mismo input produce mismo hash (determinismo cross-call)", async () => {
    const a = await calcularEventId("p1", "completado", "pendiente", "2026-04-26T12:00:00Z");
    const b = await calcularEventId("p1", "completado", "pendiente", "2026-04-26T12:00:00Z");
    expect(a).toBe(b);
  });

  it("estadoAnterior null usa literal 'null' en el hash", async () => {
    const conNull = await calcularEventId("p1", "pendiente", null, "2026-04-26T12:00:00Z");
    const conString = await calcularEventId("p1", "pendiente", "null", "2026-04-26T12:00:00Z");
    // El helper normaliza null → 'null' antes de hashear, así que ambos resultan iguales.
    expect(conNull).toBe(conString);
  });

  it("inputs distintos producen hashes distintos", async () => {
    const a = await calcularEventId("p1", "completado", null, "2026-04-26T12:00:00Z");
    const b = await calcularEventId("p2", "completado", null, "2026-04-26T12:00:00Z");
    const c = await calcularEventId("p1", "fallido", null, "2026-04-26T12:00:00Z");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });

  it("formato hex 64 chars lowercase", async () => {
    const hash = await calcularEventId("p1", "completado", null, "2026-04-26T12:00:00Z");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
