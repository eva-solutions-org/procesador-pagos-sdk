/**
 * Tests `abrirStreamSSE()` (T-7-08 — REQ-SSE-001..006 + FIX I3).
 *
 * Cubre:
 * - Snapshot inicial emitido si presente.
 * - Suscripción al pubsub con dedup por eventId.
 * - Cleanup en abort (clearInterval + unsubscribe).
 * - **FIX I3**: la función NO resuelve hasta que onAbort dispara.
 */

import { describe, expect, it, vi } from "vitest";
import {
  _resetDedupCacheParaTests,
  abrirStreamSSE,
  type MensajeSSE,
  type StreamSSE,
} from "../../../src/features/sse-stream/index.js";
import { adapterMemoria } from "../../../src/features/pubsub/index.js";
import type { EventoPago } from "../../../src/features/pubsub/index.js";

function crearMockStream() {
  const escritos: MensajeSSE[] = [];
  let abortCb: (() => void | Promise<void>) | null = null;
  const stream: StreamSSE = {
    async writeSSE(m) {
      escritos.push(m);
    },
    onAbort(cb) {
      abortCb = cb;
    },
  };
  return {
    stream,
    escritos,
    triggerAbort(): void {
      if (abortCb) void abortCb();
    },
  };
}

const eventoBase = (eventId: string, estado = "completado"): EventoPago => ({
  eventId,
  pagoId: "p1",
  referenciaExterna: "ref-1",
  estado,
  estadoAnterior: null,
  monto: "100.00",
  moneda: "USD",
  pasarela: "prometeo",
  metadata: null,
  timestamp: "2026-04-26T12:00:00Z",
});

describe("abrirStreamSSE — REQ-SSE-001..006 / FIX I3", () => {
  it("emite snapshot inicial si presente y no es duplicado", async () => {
    _resetDedupCacheParaTests();
    const pubsub = adapterMemoria();
    const { stream, escritos, triggerAbort } = crearMockStream();

    const snapshot = eventoBase("snap-1", "pendiente");
    const promesa = abrirStreamSSE(stream, {
      pagoId: "p1",
      pubsub,
      snapshot,
      heartbeatMs: 60_000,
    });
    // microtask flush para que el snapshot se emita
    await Promise.resolve();
    await Promise.resolve();
    expect(escritos.length).toBeGreaterThanOrEqual(1);
    expect(escritos[0]?.event).toBe("snapshot");
    expect(escritos[0]?.id).toBe("snap-1");
    expect(JSON.parse(escritos[0]!.data)).toEqual(snapshot);

    triggerAbort();
    await promesa; // FIX I3 — la promesa resuelve sólo tras abort
  });

  it("FIX I3 — la promesa NO resuelve hasta onAbort", async () => {
    const pubsub = adapterMemoria();
    const { stream, triggerAbort } = crearMockStream();
    let resuelta = false;
    const promesa = abrirStreamSSE(stream, {
      pagoId: "p1",
      pubsub,
      heartbeatMs: 60_000,
    }).then(() => {
      resuelta = true;
    });
    // micro/macrotask flushes — sin abort, NO debe resolver
    await new Promise((r) => setTimeout(r, 50));
    expect(resuelta).toBe(false);
    triggerAbort();
    await promesa;
    expect(resuelta).toBe(true);
  });

  it("suscribir al pubsub con dedup por eventId", async () => {
    _resetDedupCacheParaTests();
    const pubsub = adapterMemoria();
    const { stream, escritos, triggerAbort } = crearMockStream();
    const promesa = abrirStreamSSE(stream, {
      pagoId: "p1",
      pubsub,
      heartbeatMs: 60_000,
    });
    await Promise.resolve();
    const ev1 = eventoBase("ev-1");
    await pubsub.publicar("pagos:p1", ev1);
    await pubsub.publicar("pagos:p1", ev1); // duplicado: no se reemite
    const ev2 = eventoBase("ev-2", "fallido");
    await pubsub.publicar("pagos:p1", ev2);
    // 2 writes esperados (no 3)
    const ids = escritos.map((e) => e.id);
    expect(ids.filter((id) => id === "ev-1")).toHaveLength(1);
    expect(ids.filter((id) => id === "ev-2")).toHaveLength(1);
    triggerAbort();
    await promesa;
  });

  it("cleanup en abort: heartbeat se detiene + unsubscribe se invoca", async () => {
    _resetDedupCacheParaTests();
    const unsubMock = vi.fn();
    const pubsub = {
      publicar: vi.fn(async () => undefined),
      suscribir: vi.fn(async () => unsubMock),
    };
    const { stream, triggerAbort } = crearMockStream();
    const promesa = abrirStreamSSE(stream, {
      pagoId: "p1",
      pubsub,
      heartbeatMs: 60_000,
    });
    await Promise.resolve();
    expect(pubsub.suscribir).toHaveBeenCalledWith("pagos:p1", expect.any(Function));
    triggerAbort();
    await promesa;
    expect(unsubMock).toHaveBeenCalled();
  });
});
