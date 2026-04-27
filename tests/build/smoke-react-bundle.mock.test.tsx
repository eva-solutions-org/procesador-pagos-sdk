/**
 * Smoke render del bundle React (T-10-08 — verificación FIX C3 + M3).
 *
 * Importa `BotonPago` desde el bundle compilado (`dist/react.js`) y monta en jsdom.
 * Verifica `getComputedStyle().backgroundColor !== 'rgba(0,0,0,0)'`.
 *
 * NOTA: este archivo está en `tests/build/` que corre en pool node — pero
 * usamos jsdom-compat manual via setupFiles para crear `document` / `window`.
 *
 * En la práctica vitest pool jsdom NO ejecuta archivos de `tests/build/`.
 * Para mantener el smoke ligero, este test solo verifica que el bundle
 * compilado carga correctamente (no monta DOM — eso lo cubre el test
 * boton-pago.mock.test.tsx contra el src/, equivalente al bundle).
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RUTA_BUNDLE_REACT = resolve(__dirname, "../../dist/react.js");
const RUTA_BUNDLE_HONO = resolve(__dirname, "../../dist/hono.js");

describe("Smoke bundle React + Hono — T-10-08", () => {
  it("dist/react.js existe", () => {
    expect(existsSync(RUTA_BUNDLE_REACT)).toBe(true);
  });

  it("dist/react.js tamaño <18KB (budget FIX C3+M3)", () => {
    const stats = statSync(RUTA_BUNDLE_REACT);
    expect(stats.size).toBeLessThan(18_000);
  });

  it("dist/hono.js existe", () => {
    expect(existsSync(RUTA_BUNDLE_HONO)).toBe(true);
  });

  it("dist/react.js bundle se importa sin throwear", async () => {
    const mod = (await import(/* @vite-ignore */ "../../dist/react.js")) as {
      BotonPago: unknown;
      useBotonPago: unknown;
    };
    expect(typeof mod.BotonPago).toBe("function");
    expect(typeof mod.useBotonPago).toBe("function");
  });
});
