/**
 * Factory de PubSubAdapter mockeable (T-7-h3).
 *
 * Útil para tests que verifican que un handler invoca `publicar` o `suscribir`
 * sin depender del adapter de memoria real.
 */

import { vi } from "vitest";
import type { PubSubAdapter } from "../../src/features/pubsub/index.js";

export interface MockPubSub {
  adapter: PubSubAdapter;
  publicarMock: ReturnType<typeof vi.fn>;
  suscribirMock: ReturnType<typeof vi.fn>;
  unsubscribeMock: ReturnType<typeof vi.fn>;
  /** Dispara el handler suscrito (último registrado) con un mensaje. */
  emitir: (mensaje: unknown) => Promise<void>;
}

export function crearMockPubSub(): MockPubSub {
  const handlers: Array<(m: unknown) => void | Promise<void>> = [];
  const unsubscribeMock = vi.fn();
  const suscribirMock = vi.fn(
    async (_canal: string, handler: (m: unknown) => void | Promise<void>) => {
      handlers.push(handler);
      return unsubscribeMock;
    },
  );
  const publicarMock = vi.fn(async () => undefined);

  const adapter: PubSubAdapter = {
    publicar: publicarMock,
    suscribir: suscribirMock as PubSubAdapter["suscribir"],
  };

  return {
    adapter,
    publicarMock,
    suscribirMock,
    unsubscribeMock,
    emitir: async (mensaje) => {
      const ult = handlers[handlers.length - 1];
      if (ult) await ult(mensaje);
    },
  };
}
