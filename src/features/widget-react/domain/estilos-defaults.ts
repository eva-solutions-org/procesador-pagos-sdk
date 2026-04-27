/**
 * Estilos default del `<BotonPago>` (FIX C3 — inline styles overrides).
 *
 * El consumidor puede:
 * - Pasar `style` / `styles.boton` para mergear sobre el default.
 * - Pasar `className` para desactivar inline y usar CSS propio.
 * - Pasar `children` (render-prop) para control total.
 */

import type { CSSProperties } from 'react';

export const ESTILOS_DEFAULT_BOTON: CSSProperties = {
  backgroundColor: '#2563eb',
  color: 'white',
  padding: '0.75rem 1.5rem',
  borderRadius: '0.5rem',
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  fontSize: '1rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  transition: 'background-color 0.15s ease',
};

export const ESTILOS_HOVER: CSSProperties = {
  backgroundColor: '#1d4ed8',
};

export const ESTILOS_DISABLED: CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
};

export const ESTILOS_SPINNER: CSSProperties = {
  display: 'inline-block',
  width: '1em',
  height: '1em',
  border: '2px solid currentColor',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'sdk-pago-spin 0.6s linear infinite',
};

/** Keyframe CSS para el spinner — se inyecta una vez al primer mount. */
export const KEYFRAME_SPINNER = `@keyframes sdk-pago-spin { to { transform: rotate(360deg); } }`;
