/**
 * Tests `<BotonPago>` (T-7-15 — REQ-WIDGET-001..014).
 *
 * - Render default con inline styles.
 * - className desactiva inline styles base.
 * - render-prop `children` toma control total.
 * - smoke: getComputedStyle(boton).backgroundColor !== 'rgba(0,0,0,0)'.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BotonPago } from "../../../src/react.js";

describe("<BotonPago> — REQ-WIDGET-001..014", () => {
  it("render default — inline styles aplicados (backgroundColor distinto a transparente)", () => {
    render(
      <BotonPago monto="10.00" moneda="USD" referenciaExterna="ref-1" widgetId="w1" />,
    );
    const boton = screen.getByRole("button");
    const computed = getComputedStyle(boton);
    expect(computed.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(computed.backgroundColor).not.toBe("transparent");
  });

  it("className desactiva inline styles base — boton.style queda vacío", () => {
    const { container } = render(
      <BotonPago
        monto="10.00"
        moneda="USD"
        referenciaExterna="ref-2"
        widgetId="w1"
        className="mi-boton"
      />,
    );
    const boton = container.querySelector("button");
    expect(boton).not.toBeNull();
    expect(boton!.className).toBe("mi-boton");
    // style attribute debería ser falsy o vacío
    expect(boton!.getAttribute("style") ?? "").toBe("");
  });

  it("render-prop `children` toma control total — el botón default NO se monta", () => {
    const { container } = render(
      <BotonPago monto="10.00" moneda="USD" referenciaExterna="ref-3" widgetId="w1">
        {(api) => <span data-testid="custom">custom-{api.estado.fase}</span>}
      </BotonPago>,
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(0);
    expect(screen.getByTestId("custom")).not.toBeNull();
    expect(screen.getByTestId("custom").textContent).toBe("custom-inicial");
  });

  it("textoBoton override aparece como contenido del botón", () => {
    render(
      <BotonPago
        monto="10.00"
        moneda="USD"
        referenciaExterna="ref-4"
        widgetId="w1"
        textoBoton="Pagar ahora"
      />,
    );
    expect(screen.getByText("Pagar ahora")).not.toBeNull();
  });

  it("texto default 'Pagar {moneda} {monto}' cuando no hay override", () => {
    render(
      <BotonPago monto="42.00" moneda="USD" referenciaExterna="ref-5" widgetId="w1" />,
    );
    expect(screen.getByText("Pagar USD 42.00")).not.toBeNull();
  });
});
