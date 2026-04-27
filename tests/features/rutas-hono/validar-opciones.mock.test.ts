/**
 * Tests unit aislados de `validarOpcionesRutas` (T-7-22 — S1.1).
 *
 * Cubre REQ-RUTAS-008: throw síncrono con mensaje exacto si falta `alCrearPago`,
 * si no es función, o si faltan `apiKey` / `webhookSecret`.
 *
 * Sin Hono — solo testea el helper aislado.
 */

import { describe, expect, it } from "vitest";
import {
  MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE,
  MENSAJE_ERROR_AL_CREAR_PAGO_NO_FUNCION,
  MENSAJE_ERROR_API_KEY,
  MENSAJE_ERROR_WEBHOOK_SECRET,
  validarOpcionesRutas,
} from "../../../src/features/rutas-hono/infrastructure/validar-opciones.js";

describe("validarOpcionesRutas — REQ-RUTAS-008 / S1.1", () => {
  it("Scenario 1 — sin alCrearPago (undefined) → throw mensaje exacto AUSENTE", () => {
    expect(() =>
      validarOpcionesRutas({
        apiKey: "k",
        webhookSecret: "s",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrowError(MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE);
  });

  it("Scenario 2 — alCrearPago null explícito → throw AUSENTE", () => {
    expect(() =>
      validarOpcionesRutas({
        apiKey: "k",
        webhookSecret: "s",
        alCrearPago: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrowError(MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE);
  });

  it("Scenario 3 — alCrearPago no es función (string) → throw NO_FUNCION", () => {
    expect(() =>
      validarOpcionesRutas({
        apiKey: "k",
        webhookSecret: "s",
        alCrearPago: "not a fn",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrowError(MENSAJE_ERROR_AL_CREAR_PAGO_NO_FUNCION("string"));
  });

  it("Scenario 4 — alCrearPago identity (i) => i → no throw", () => {
    expect(() =>
      validarOpcionesRutas({
        apiKey: "k",
        webhookSecret: "s",
        alCrearPago: (i: unknown) => i,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).not.toThrow();
  });

  it("Scenario 5 — alCrearPago async function → no throw", () => {
    expect(() =>
      validarOpcionesRutas({
        apiKey: "k",
        webhookSecret: "s",
        alCrearPago: async (i: unknown) => i,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).not.toThrow();
  });

  it("Scenario 6 — sin apiKey (string vacío con whitespace) → throw API_KEY", () => {
    expect(() =>
      validarOpcionesRutas({
        apiKey: "   ",
        webhookSecret: "s",
        alCrearPago: (i: unknown) => i,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrowError(MENSAJE_ERROR_API_KEY);
  });

  it("Scenario 7 — sin webhookSecret (vacío) → throw WEBHOOK_SECRET", () => {
    expect(() =>
      validarOpcionesRutas({
        apiKey: "k",
        webhookSecret: "",
        alCrearPago: (i: unknown) => i,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrowError(MENSAJE_ERROR_WEBHOOK_SECRET);
  });

  it("Mensaje AUSENTE contiene substrings críticos del SOT", () => {
    expect(MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE).toContain("alCrearPago");
    expect(MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE).toContain("OBLIGATORIO");
    expect(MENSAJE_ERROR_AL_CREAR_PAGO_AUSENTE).toContain("docs/security.md");
  });
});
