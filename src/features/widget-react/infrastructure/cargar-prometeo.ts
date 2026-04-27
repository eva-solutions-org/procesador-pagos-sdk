/**
 * Carga el SDK Prometeo desde el CDN oficial (REQ-WIDGET-006).
 *
 * - Si `window.Prometeo` ya existe: resuelve inmediato.
 * - Si una carga está en vuelo (`promesaCarga`): retorna la misma promesa.
 * - Si falla: nullea la promesa para permitir retry posterior.
 * - SSR-safe: rechaza inmediato si `typeof window === 'undefined'`.
 */

const URL_CDN = 'https://cdn.prometeoapi.com/widget/2.0.0/init.js';
let promesaCarga: Promise<void> | null = null;

export function cargarPrometeo(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('[procesador-pagos-sdk] cargarPrometeo solo funciona en browser'));
  }
  if (window.Prometeo) {
    return Promise.resolve();
  }
  if (promesaCarga) {
    return promesaCarga;
  }

  promesaCarga = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${URL_CDN}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => {
        promesaCarga = null;
        reject(new Error('[procesador-pagos-sdk] Error cargando Prometeo desde CDN'));
      });
      return;
    }
    const script = document.createElement('script');
    script.src = URL_CDN;
    script.async = true;
    script.onload = (): void => resolve();
    script.onerror = (): void => {
      promesaCarga = null;
      reject(new Error('[procesador-pagos-sdk] Error cargando Prometeo desde CDN'));
    };
    document.head.appendChild(script);
  });

  return promesaCarga;
}
