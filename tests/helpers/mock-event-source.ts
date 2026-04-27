/**
 * Mock global de `EventSource` para tests de widget-react (T-7-h1).
 *
 * jsdom NO implementa EventSource. Este helper instala un mock global
 * con API mínima compatible con `lib.dom`.
 *
 * Uso:
 *   import { instalarMockEventSource } from '../../helpers/mock-event-source.js';
 *   const { trigger, instancias } = instalarMockEventSource();
 *   // ... arrancar test ...
 *   trigger('snapshot', { eventId: 'x' });
 */

import { vi } from "vitest";

export interface MockEventSource {
  url: string;
  readyState: number;
  close: () => void;
  addEventListener: (type: string, listener: (ev: MessageEvent) => void) => void;
  removeEventListener: (type: string, listener: (ev: MessageEvent) => void) => void;
  onerror: ((ev: Event) => void) | null;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  // Helpers de test
  __listeners: Map<string, Array<(ev: MessageEvent) => void>>;
  __triggerEvent: (type: string, data: unknown) => void;
  __triggerError: () => void;
}

export interface ApiMockEventSource {
  /** Última instancia creada. */
  ultima: () => MockEventSource | null;
  /** Todas las instancias creadas durante el test. */
  instancias: MockEventSource[];
  /** Restaura el global anterior. */
  restaurar: () => void;
}

const ESTADOS = { CONNECTING: 0, OPEN: 1, CLOSED: 2 };

export function instalarMockEventSource(): ApiMockEventSource {
  const instancias: MockEventSource[] = [];
  const previo = (globalThis as { EventSource?: unknown }).EventSource;

  class MockES implements MockEventSource {
    static readonly CONNECTING = ESTADOS.CONNECTING;
    static readonly OPEN = ESTADOS.OPEN;
    static readonly CLOSED = ESTADOS.CLOSED;

    public url: string;
    public readyState = ESTADOS.OPEN;
    public __listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
    public onerror: ((ev: Event) => void) | null = null;
    public onopen: ((ev: Event) => void) | null = null;
    public onmessage: ((ev: MessageEvent) => void) | null = null;

    constructor(url: string) {
      this.url = url;
      instancias.push(this);
    }

    close = vi.fn(() => {
      this.readyState = ESTADOS.CLOSED;
    });

    addEventListener = (type: string, listener: (ev: MessageEvent) => void): void => {
      const arr = this.__listeners.get(type) ?? [];
      arr.push(listener);
      this.__listeners.set(type, arr);
    };

    removeEventListener = (type: string, listener: (ev: MessageEvent) => void): void => {
      const arr = this.__listeners.get(type);
      if (arr) this.__listeners.set(type, arr.filter((l) => l !== listener));
    };

    __triggerEvent = (type: string, data: unknown): void => {
      const ev = new MessageEvent(type, {
        data: typeof data === "string" ? data : JSON.stringify(data),
      });
      const listeners = this.__listeners.get(type) ?? [];
      for (const l of listeners) l(ev);
    };

    __triggerError = (): void => {
      this.readyState = ESTADOS.CLOSED;
      if (this.onerror) this.onerror(new Event("error"));
    };
  }

  (globalThis as unknown as { EventSource: typeof MockES }).EventSource = MockES;

  return {
    ultima: () => instancias[instancias.length - 1] ?? null,
    instancias,
    restaurar: () => {
      if (previo === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).EventSource;
      } else {
        (globalThis as { EventSource?: unknown }).EventSource = previo;
      }
    },
  };
}
