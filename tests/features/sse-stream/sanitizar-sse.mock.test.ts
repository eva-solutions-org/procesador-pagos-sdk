/**
 * Tests `sanitizarCampoSSE()` (T-7-07 — FIX C1).
 *
 * Defensa contra CR/LF injection en campos de control SSE.
 *
 * Inspección estática: confirma regex contra `[\r\n]`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizarCampoSSE } from "../../../src/features/sse-stream/index.js";

describe("sanitizarCampoSSE — FIX C1", () => {
  it("rechaza valor con \\n (LF)", () => {
    expect(() => sanitizarCampoSSE("evil\nevent: malicious")).toThrow(/CR\/LF/);
  });

  it("rechaza valor con \\r (CR)", () => {
    expect(() => sanitizarCampoSSE("evil\revent")).toThrow(/CR\/LF/);
  });

  it("rechaza valor con \\r\\n (CRLF)", () => {
    expect(() => sanitizarCampoSSE("evil\r\nfoo")).toThrow(/CR\/LF/);
  });

  it("retorna el valor original si es válido", () => {
    expect(sanitizarCampoSSE("snapshot")).toBe("snapshot");
    expect(sanitizarCampoSSE("pago.actualizado")).toBe("pago.actualizado");
    expect(sanitizarCampoSSE("abc-123")).toBe("abc-123");
  });

  it("string vacío es válido", () => {
    expect(sanitizarCampoSSE("")).toBe("");
  });

  it("Inspección estática — el source contiene regex /[\\r\\n]/", () => {
    const ruta = resolve(
      __dirname,
      "../../../src/features/sse-stream/infrastructure/sanitizar-sse.ts",
    );
    const fuente = readFileSync(ruta, "utf-8");
    expect(fuente).toMatch(/\/\[\\r\\n\]\//);
  });
});
