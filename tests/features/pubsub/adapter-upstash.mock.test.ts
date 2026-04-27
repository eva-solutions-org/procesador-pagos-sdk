/**
 * Tests `adapterUpstash()` (T-7-02 — REQ-PUBSUB-003).
 *
 * Mockea la clase `Redis` de `@upstash/redis`. Verifica que `publicar` invoca
 * `redis.publish(canal, JSON.stringify(mensaje))` y que `suscribir` invoca
 * `redis.subscribe(canal)` con el shape Subscriber esperado (FIX C4).
 *
 * Inspección estática: confirma import static (M2 — sin dynamic import).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Mock de @upstash/redis ANTES de cualquier import del adapter
const publishMock = vi.fn(async () => 1);
const subscribeMock = vi.fn();

vi.mock("@upstash/redis", () => {
  return {
    Redis: vi.fn().mockImplementation(() => ({
      publish: publishMock,
      subscribe: subscribeMock,
    })),
  };
});

// Import después del vi.mock
import { adapterUpstash } from "../../../src/features/pubsub/index.js";

describe("adapterUpstash — REQ-PUBSUB-003 / C4", () => {
  it("publicar invoca redis.publish con JSON.stringify(mensaje)", async () => {
    publishMock.mockClear();
    const adapter = adapterUpstash({ url: "https://x", token: "t" });
    await adapter.publicar("c1", { foo: "bar", n: 1 });
    expect(publishMock).toHaveBeenCalledOnce();
    expect(publishMock).toHaveBeenCalledWith(
      "c1",
      JSON.stringify({ foo: "bar", n: 1 }),
    );
  });

  it("suscribir invoca redis.subscribe(canal) y retorna unsubscribe", async () => {
    const onMock = vi.fn().mockReturnThis();
    const unsubMock = vi.fn(async () => undefined);
    subscribeMock.mockImplementation(() => ({
      on: onMock,
      unsubscribe: unsubMock,
    }));

    const adapter = adapterUpstash({ url: "https://x", token: "t" });
    const unsub = await adapter.suscribir("c1", () => undefined);

    expect(subscribeMock).toHaveBeenCalledWith("c1");
    expect(onMock).toHaveBeenCalledWith("message", expect.any(Function));
    await unsub();
    expect(unsubMock).toHaveBeenCalledOnce();
  });

  it("suscribir parsea el message JSON y lo pasa al handler", async () => {
    const onMock = vi.fn().mockReturnThis();
    let listenerCapturado: ((data: { channel: string; message: unknown }) => void) | null = null;
    onMock.mockImplementation((event: string, listener: typeof listenerCapturado) => {
      if (event === "message") listenerCapturado = listener;
      return { on: onMock, unsubscribe: vi.fn(async () => undefined) };
    });
    subscribeMock.mockImplementation(() => ({
      on: onMock,
      unsubscribe: vi.fn(async () => undefined),
    }));

    const adapter = adapterUpstash({ url: "https://x", token: "t" });
    const recibidos: unknown[] = [];
    await adapter.suscribir<{ x: number }>("c1", (m) => {
      recibidos.push(m);
    });
    expect(listenerCapturado).not.toBeNull();
    listenerCapturado!({ channel: "c1", message: JSON.stringify({ x: 7 }) });
    // microtask flush
    await Promise.resolve();
    await Promise.resolve();
    expect(recibidos).toEqual([{ x: 7 }]);
  });

  it("suscribir tolera message no-string (objeto ya parseado)", async () => {
    const onMock = vi.fn().mockReturnThis();
    let listenerCapturado: ((data: { channel: string; message: unknown }) => void) | null = null;
    onMock.mockImplementation((event: string, listener: typeof listenerCapturado) => {
      if (event === "message") listenerCapturado = listener;
      return { on: onMock, unsubscribe: vi.fn(async () => undefined) };
    });
    subscribeMock.mockImplementation(() => ({
      on: onMock,
      unsubscribe: vi.fn(async () => undefined),
    }));

    const adapter = adapterUpstash({ url: "https://x", token: "t" });
    const recibidos: unknown[] = [];
    await adapter.suscribir<{ y: number }>("c1", (m) => {
      recibidos.push(m);
    });
    listenerCapturado!({ channel: "c1", message: { y: 9 } });
    await Promise.resolve();
    await Promise.resolve();
    expect(recibidos).toEqual([{ y: 9 }]);
  });

  it("unsubscribe idempotente — invocar 2 veces no throwea", async () => {
    const unsubMock = vi.fn(async () => undefined);
    subscribeMock.mockImplementation(() => ({
      on: vi.fn().mockReturnThis(),
      unsubscribe: unsubMock,
    }));
    const adapter = adapterUpstash({ url: "https://x", token: "t" });
    const unsub = await adapter.suscribir("c1", () => undefined);
    await unsub();
    await expect(Promise.resolve(unsub())).resolves.not.toThrow();
    expect(unsubMock).toHaveBeenCalledOnce(); // segunda llamada es no-op
  });

  it("FIX M2 — import estático de @upstash/redis (no dynamic) en el source", () => {
    const ruta = resolve(
      __dirname,
      "../../../src/features/pubsub/infrastructure/adapter-upstash.ts",
    );
    const fuente = readFileSync(ruta, "utf-8");
    // Debe contener exactamente UN import top-level de @upstash/redis.
    expect(fuente).toMatch(/^\s*import\s+\{\s*Redis\s*\}\s+from\s+["']@upstash\/redis["']/m);
    // No debe contener dynamic import del package.
    expect(fuente).not.toMatch(/import\s*\(\s*["']@upstash\/redis["']\s*\)/);
  });
});
