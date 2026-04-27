/**
 * Tests `cargarPrometeo()` (T-7-16 — REQ-WIDGET-006).
 *
 * - Resuelve inmediato si window.Prometeo ya existe.
 * - SSR-safe: rechaza si no hay window (cubierto en pool node con un test separado).
 * - Carga dispara appendChild de un <script>.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cargarPrometeo } from "../../../src/features/widget-react/infrastructure/cargar-prometeo.js";

afterEach(() => {
  // Cleanup window.Prometeo y scripts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).Prometeo;
  document
    .querySelectorAll('script[src*="cdn.prometeoapi.com"]')
    .forEach((s) => s.parentNode?.removeChild(s));
});

describe("cargarPrometeo — REQ-WIDGET-006", () => {
  it("resuelve inmediato si window.Prometeo ya existe", async () => {
    (window as unknown as { Prometeo: unknown }).Prometeo = { Messaging: {}, init: () => undefined };
    await expect(cargarPrometeo()).resolves.toBeUndefined();
  });

  it("inyecta <script> con src del CDN si no estaba cargado", async () => {
    // No await — la promesa queda pendiente porque jsdom no dispara onload.
    void cargarPrometeo();
    // microtask flush
    await Promise.resolve();
    const script = document.querySelector('script[src*="cdn.prometeoapi.com"]');
    expect(script).not.toBeNull();
    expect((script as HTMLScriptElement).async).toBe(true);
  });

  it("retorna la misma promesa si una carga está en vuelo (singleton)", () => {
    const p1 = cargarPrometeo();
    const p2 = cargarPrometeo();
    expect(p1).toBe(p2);
  });
});
