/**
 * Tests inspección estática JSDoc DISPLAY ONLY en `props-boton-pago.ts`
 * (T-7-23 — S1.2 / REQ-WIDGET-014).
 *
 * Defensa contra regresión: alguien borra el JSDoc por accidente.
 *
 * NOTA: este archivo NO tiene componentes React — corre en pool node
 * leyendo el source con `fs.readFileSync`. Está bajo `tests/features/widget-react/`
 * pero como es .mock.test.ts el matcher de jsdom lo selecciona; aún así
 * funciona perfecto en jsdom porque sólo usa `node:fs` y `node:path` (que
 * jsdom no toca).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RUTA_PROPS = resolve(
  __dirname,
  "../../../src/features/widget-react/domain/props-boton-pago.ts",
);

describe("props-boton-pago.ts — JSDoc DISPLAY ONLY — REQ-WIDGET-014 / S1.2", () => {
  const fuente = readFileSync(RUTA_PROPS, "utf-8");

  it("JSDoc en `monto` contiene 'DISPLAY ONLY' y 'docs/security.md'", () => {
    const match = fuente.match(/\/\*\*[\s\S]*?\*\/\s*monto\s*:/);
    expect(match).not.toBeNull();
    expect(match![0]).toContain("DISPLAY ONLY");
    expect(match![0]).toContain("docs/security.md");
  });

  it("JSDoc en `moneda` contiene 'DISPLAY ONLY' y 'docs/security.md'", () => {
    const match = fuente.match(/\/\*\*[\s\S]*?\*\/\s*moneda\s*:/);
    expect(match).not.toBeNull();
    expect(match![0]).toContain("DISPLAY ONLY");
    expect(match![0]).toContain("docs/security.md");
  });

  it("JSDoc en `metadata` contiene 'productoId' (referencia al patrón seguro)", () => {
    const match = fuente.match(/\/\*\*[\s\S]*?\*\/\s*metadata\s*\?\s*:/);
    expect(match).not.toBeNull();
    expect(match![0]).toContain("productoId");
  });

  it("Regresión: archivo contiene >= 2 ocurrencias literales de 'DISPLAY ONLY'", () => {
    const ocurrencias = (fuente.match(/DISPLAY ONLY/g) ?? []).length;
    expect(ocurrencias).toBeGreaterThanOrEqual(2);
  });
});
