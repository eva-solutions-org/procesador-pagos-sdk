/**
 * Mock de `window.Prometeo` para tests del widget-react (T-7-h2).
 */

import { vi } from "vitest";

export interface MockPrometeoInstance {
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on: (event: string, cb: (payload?: unknown) => void) => void;
  __trigger: (event: string, payload?: unknown) => void;
  __listeners: Map<string, Array<(payload?: unknown) => void>>;
}

export interface ApiMockPrometeo {
  instancia: () => MockPrometeoInstance | null;
  /** Restaura el `window.Prometeo` previo. */
  restaurar: () => void;
}

export function instalarMockPrometeo(): ApiMockPrometeo {
  const previo = (window as unknown as { Prometeo?: unknown }).Prometeo;
  let instancia: MockPrometeoInstance | null = null;

  const Messaging = {
    PAYMENT_SUCCESS: "PAYMENT_SUCCESS",
    ERROR: "ERROR",
    CLOSE: "CLOSE",
  };

  function init(_widgetId: string, _intentId: string): MockPrometeoInstance {
    const listeners = new Map<string, Array<(payload?: unknown) => void>>();
    instancia = {
      open: vi.fn(),
      close: vi.fn(),
      on: (event, cb): void => {
        const arr = listeners.get(event) ?? [];
        arr.push(cb);
        listeners.set(event, arr);
      },
      __trigger: (event, payload): void => {
        const arr = listeners.get(event) ?? [];
        for (const cb of arr) cb(payload);
      },
      __listeners: listeners,
    };
    return instancia;
  }

  (window as unknown as { Prometeo: unknown }).Prometeo = {
    init,
    Messaging,
  };

  return {
    instancia: () => instancia,
    restaurar: () => {
      if (previo === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).Prometeo;
      } else {
        (window as unknown as { Prometeo: unknown }).Prometeo = previo;
      }
    },
  };
}
