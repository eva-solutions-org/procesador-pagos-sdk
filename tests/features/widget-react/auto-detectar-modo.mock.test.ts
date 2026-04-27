/**
 * Tests `modoDesdeResponse()` (T-7-18 — auto-detect modo).
 */

import { describe, expect, it } from "vitest";
import { modoDesdeResponse } from "../../../src/features/widget-react/infrastructure/auto-detectar-modo.js";

describe("modoDesdeResponse", () => {
  it("Lee modo='sse' del response", () => {
    expect(
      modoDesdeResponse({ intentId: "i", pagoId: "p", modo: "sse", basePath: "/" }),
    ).toBe("sse");
  });

  it("Lee modo='polling' del response", () => {
    expect(
      modoDesdeResponse({ intentId: "i", pagoId: "p", modo: "polling", basePath: "/" }),
    ).toBe("polling");
  });
});
