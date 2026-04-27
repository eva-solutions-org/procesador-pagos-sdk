/**
 * Tests `useBotonPago()` (T-7-14 — REQ-WIDGET-011 + FIX M1).
 *
 * - Estado inicial = 'inicial'.
 * - cleanup en unmount NO throwea.
 * - StrictMode tolerante: doble mount no crashea.
 */

import { render, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { useBotonPago } from "../../../src/react.js";

describe("useBotonPago — REQ-WIDGET-011 / FIX M1", () => {
  it("estado inicial es 'inicial'", () => {
    const { result } = renderHook(() =>
      useBotonPago({ monto: "10.00", moneda: "USD", referenciaExterna: "r1", widgetId: "w" }),
    );
    expect(result.current.estado.fase).toBe("inicial");
    expect(result.current.error).toBeNull();
    expect(result.current.pago).toBeNull();
    expect(result.current.intentId).toBeNull();
  });

  it("cleanup en unmount no throwea", () => {
    const { unmount } = renderHook(() =>
      useBotonPago({ monto: "10.00", moneda: "USD", referenciaExterna: "r2", widgetId: "w" }),
    );
    expect(() => unmount()).not.toThrow();
  });

  it("StrictMode tolerante (FIX M1) — montar dentro de StrictMode no crashea", () => {
    function App() {
      useBotonPago({ monto: "10.00", moneda: "USD", referenciaExterna: "r3", widgetId: "w" });
      return <div>ok</div>;
    }
    expect(() =>
      render(
        <StrictMode>
          <App />
        </StrictMode>,
      ),
    ).not.toThrow();
  });

  it("cerrar() resetea estado a 'inicial'", () => {
    const { result } = renderHook(() =>
      useBotonPago({ monto: "10.00", moneda: "USD", referenciaExterna: "r4", widgetId: "w" }),
    );
    result.current.cerrar();
    expect(result.current.estado.fase).toBe("inicial");
  });
});
