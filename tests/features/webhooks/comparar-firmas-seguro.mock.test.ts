import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { compararFirmasSeguro } from '#test-internals/webhooks';

/**
 * Tests C4 / ADR-004:
 *   - Delegación a `crypto.subtle.timingSafeEqual` cuando existe.
 *   - Fallback a `node:crypto.timingSafeEqual` cuando subtle.timingSafeEqual no existe.
 *   - Throw fail-closed si ninguna primitiva está disponible.
 *   - INSPECCIÓN del código fuente: NO contiene comparación byte-a-byte custom.
 */
describe('compararFirmasSeguro — C4', () => {
  const FIRMA_A = 'a'.repeat(64);
  const FIRMA_B_DISTINTA = 'b'.repeat(64);

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Given firmas iguales y subtle.timingSafeEqual disponible Then retorna true', () => {
    expect(compararFirmasSeguro(FIRMA_A, FIRMA_A)).toBe(true);
  });

  it('Given firmas distintas con misma longitud Then retorna false', () => {
    expect(compararFirmasSeguro(FIRMA_A, FIRMA_B_DISTINTA)).toBe(false);
  });

  it('Given longitudes distintas Then retorna false (early return)', () => {
    expect(compararFirmasSeguro('abc', 'abcd')).toBe(false);
  });

  it('Given subtle.timingSafeEqual mockeado Then se invoca con ArrayBuffers', () => {
    const subtleSpy = vi.fn((a: ArrayBuffer, b: ArrayBuffer) => a.byteLength === b.byteLength);
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      subtle: {
        ...globalThis.crypto.subtle,
        timingSafeEqual: subtleSpy,
      },
    });

    const r = compararFirmasSeguro(FIRMA_A, FIRMA_A);
    expect(subtleSpy).toHaveBeenCalledTimes(1);
    expect(r).toBe(true);
  });

  it('Given subtle.timingSafeEqual ausente Then cae a node:crypto.timingSafeEqual', () => {
    // Stub de crypto sin timingSafeEqual en subtle
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      subtle: {
        // Quitamos timingSafeEqual del subtle
        importKey: globalThis.crypto.subtle.importKey.bind(globalThis.crypto.subtle),
        sign: globalThis.crypto.subtle.sign.bind(globalThis.crypto.subtle),
      },
    });

    // node:crypto.timingSafeEqual debería estar disponible en Node (vitest environment: node).
    expect(compararFirmasSeguro(FIRMA_A, FIRMA_A)).toBe(true);
    expect(compararFirmasSeguro(FIRMA_A, FIRMA_B_DISTINTA)).toBe(false);
  });

  it('INSPECCIÓN — el código fuente NO contiene loop byte-a-byte custom (C4)', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const sourcePath = resolve(
      __dirname,
      '../../../src/features/webhooks/infrastructure/comparar-firmas-seguro.ts',
    );
    const source = readFileSync(sourcePath, 'utf-8');

    // Comprueba que delega a primitivas nativas
    expect(source).toContain('timingSafeEqual');
    expect(source).toContain('subtle');
    expect(source).toContain('node:crypto');

    // Heurística defensiva: verificamos que NO hay un loop XOR clásico de comparación
    // byte-a-byte que reduzca con OR a un acumulador (patrón típico de cripto custom).
    // Buscamos patrones como `result |= a[i] ^ b[i]` que indicarían una implementación
    // custom rolada en lugar de delegar a primitivas nativas.
    const tieneLoopXorCustom = /\|\s*=\s*\w+\s*\[\s*\w+\s*\]\s*\^\s*\w+\s*\[\s*\w+\s*\]/.test(source);
    expect(tieneLoopXorCustom).toBe(false);

    // Confirmar fail-closed
    expect(source).toMatch(/Runtime no soporta timing-safe/i);
  });
});
