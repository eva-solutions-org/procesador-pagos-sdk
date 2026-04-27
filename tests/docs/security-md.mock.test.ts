/**
 * Tests inspección estática `docs/security.md` (T-7-24 — S1.3 / REQ-DOCS-001).
 *
 * Verifica que el doc obligatorio "Validación server-side OBLIGATORIA"
 * existe con todos los componentes (INSEGURO/SEGURO/checklist/cuándo NO
 * usar identity).
 *
 * Regex sobre texto crudo — NO AST de markdown (recomendación spec).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RUTA_SECURITY = resolve(__dirname, "../../docs/security.md");

describe("docs/security.md — REQ-DOCS-001 / S1.3", () => {
  const md = readFileSync(RUTA_SECURITY, "utf-8");

  it("Existe sección 'Validación server-side OBLIGATORIA'", () => {
    expect(md).toMatch(/##\s+(?:\d+\.\s+)?Validación server-side OBLIGATORIA/);
  });

  it("Contiene ejemplos INSEGURO + SEGURO + alCrearPago", () => {
    expect(md).toMatch(/INSEGURO/);
    expect(md).toMatch(/SEGURO/);
    expect(md).toMatch(/alCrearPago/);
  });

  it("Contiene checklist pre-deploy", () => {
    expect(md).toMatch(/checklist/i);
    expect(md).toMatch(/pre-deploy/i);
  });

  it("Contiene tabla de manipulaciones (Amenaza + Vector)", () => {
    expect(md).toMatch(/\| Amenaza/);
    expect(md).toMatch(/\| Vector/);
  });

  it("Contiene 'Cuándo NO usar identity'", () => {
    expect(md).toMatch(/Cuándo NO usar identity/i);
  });
});
