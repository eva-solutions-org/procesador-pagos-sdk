/**
 * Tests inspección estática `docs/decisions.md` (T-7-25 — S1.4 / ADR-020).
 *
 * Verifica que ADR-020 "Security boundary" existe con secciones canónicas
 * (Contexto, Decisión, Consecuencias, Threat model, Responsabilidades).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RUTA_DECISIONS = resolve(__dirname, "../../docs/decisions.md");

describe("docs/decisions.md — ADR-020 — S1.4", () => {
  const md = readFileSync(RUTA_DECISIONS, "utf-8");

  it("Contiene 'ADR-020'", () => {
    expect(md).toMatch(/ADR-020/);
  });

  it("Contiene 'Security boundary' (título de ADR-020)", () => {
    expect(md).toMatch(/Security boundary/i);
  });

  it("Contiene secciones canónicas de ADR (Contexto, Decisión, Consecuencias)", () => {
    expect(md).toMatch(/Contexto/);
    expect(md).toMatch(/Decisión/);
    expect(md).toMatch(/Consecuencias/);
  });

  it("Contiene 'Threat model'", () => {
    expect(md).toMatch(/Threat model/i);
  });

  it("Contiene 'Responsabilidades del SDK' y 'Responsabilidades del consumidor'", () => {
    expect(md).toMatch(/Responsabilidades del SDK/i);
    expect(md).toMatch(/Responsabilidades del consumidor/i);
  });
});
