import { describe, expect, it } from 'vitest';
import { SDK_API_URL, SDK_BUILD_ENV } from '../../src/core/config.js';

/**
 * Verifica que `__SDK_API_URL__` y `__SDK_BUILD_ENV__` fueron inyectados por
 * el `define` de vitest config.
 *
 * En build real (`tsdown`), el define produce string literals inlineados en
 * `dist/*`. En tests, vitest expone los mismos nombres globales via
 * `define` en `vitest.config.ts`.
 */
describe('define injection — build artifacts', () => {
  it('SDK_API_URL es string definido (no undefined)', () => {
    expect(typeof SDK_API_URL).toBe('string');
    expect(SDK_API_URL.length).toBeGreaterThan(0);
  });

  it('SDK_BUILD_ENV es string definido (no undefined)', () => {
    expect(typeof SDK_BUILD_ENV).toBe('string');
    expect(['local', 'development', 'production']).toContain(SDK_BUILD_ENV);
  });

  it('en test environment SDK_API_URL apunta a localhost', () => {
    // Vitest define inyecta http://localhost:8787 + local
    expect(SDK_API_URL).toContain('localhost');
    expect(SDK_BUILD_ENV).toBe('local');
  });
});
