import { describe, expect, it } from 'vitest';
import { esExitoso, esFallido } from '../../src/index.js';
import type { Resultado } from '../../src/index.js';

describe('Result Pattern — REQ-RESULT-001', () => {
  it('Given éxito When esExitoso Then retorna true y narrow a data', () => {
    const r: Resultado<{ x: number }> = { success: true, data: { x: 10 } };
    expect(esExitoso(r)).toBe(true);
    if (esExitoso(r)) {
      expect(r.data.x).toBe(10);
    }
  });

  it('Given fallo When esExitoso Then retorna false', () => {
    const r: Resultado<number> = { success: false, error: 'oops', codigo: 500 };
    expect(esExitoso(r)).toBe(false);
  });

  it('Given fallo When esFallido Then retorna true y narrow a codigo+error', () => {
    const r: Resultado<number> = { success: false, error: 'oops', codigo: 404 };
    expect(esFallido(r)).toBe(true);
    if (esFallido(r)) {
      expect(r.codigo).toBe(404);
      expect(r.error).toBe('oops');
    }
  });

  it('Given variante 429 con retryAfter When narrow Then accede a retryAfter (I2)', () => {
    const r: Resultado<unknown> = {
      success: false,
      error: 'rate limit',
      codigo: 429,
      retryAfter: 30,
    };
    if (esFallido(r) && r.codigo === 429) {
      expect(r.retryAfter).toBe(30);
    } else {
      expect.fail('debería matchear 429');
    }
  });

  it('Given variante 429 sin retryAfter When narrow Then retryAfter es undefined', () => {
    const r: Resultado<unknown> = { success: false, error: 'rate', codigo: 429 };
    if (esFallido(r) && r.codigo === 429) {
      expect(r.retryAfter).toBeUndefined();
    } else {
      expect.fail('debería matchear 429');
    }
  });

  it('Given variante non-429 When narrow Then no expone retryAfter (TS strict)', () => {
    const r: Resultado<unknown> = { success: false, error: 'srv', codigo: 503 };
    // En TS strict, r.retryAfter no existe en la variante 503.
    // Validamos a runtime que el shape NO trae retryAfter accidental.
    if (esFallido(r) && r.codigo === 503) {
      expect('retryAfter' in r).toBe(false);
    }
  });
});
