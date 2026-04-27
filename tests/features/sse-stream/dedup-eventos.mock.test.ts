/**
 * Tests `esEventoDuplicado()` (T-7-05 — REQ-SSE-005).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetDedupCacheParaTests } from '#test-internals/sse-stream';
import {
  esEventoDuplicado,
} from "../../../src/features/sse-stream/index.js";

describe("esEventoDuplicado — REQ-SSE-005", () => {
  beforeEach(() => {
    _resetDedupCacheParaTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("primer ID retorna false; segundo retorna true (dedup)", () => {
    expect(esEventoDuplicado("ev-1")).toBe(false);
    expect(esEventoDuplicado("ev-1")).toBe(true);
  });

  it("IDs distintos no se consideran duplicados", () => {
    expect(esEventoDuplicado("a")).toBe(false);
    expect(esEventoDuplicado("b")).toBe(false);
    expect(esEventoDuplicado("a")).toBe(true);
    expect(esEventoDuplicado("b")).toBe(true);
  });

  it("TTL 5 min — pasado el TTL, se considera nuevo (cleanup oportunista)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00Z"));
    expect(esEventoDuplicado("ev-x")).toBe(false);
    expect(esEventoDuplicado("ev-x")).toBe(true);
    // Avanzar 5 minutos + 1 segundo
    vi.setSystemTime(new Date("2026-04-26T12:05:01Z"));
    expect(esEventoDuplicado("ev-x")).toBe(false);
  });

  it("cleanup oportunista elimina entradas expiradas en cada call", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00Z"));
    esEventoDuplicado("expira-1");
    esEventoDuplicado("expira-2");
    vi.setSystemTime(new Date("2026-04-26T12:05:01Z"));
    // Llamar con un ID nuevo dispara cleanup; los ID viejos vuelven a registrarse.
    esEventoDuplicado("nuevo");
    expect(esEventoDuplicado("expira-1")).toBe(false); // limpio + nuevo
  });
});
