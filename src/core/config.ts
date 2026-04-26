/**
 * Constantes inyectadas en build-time vía `tsdown define`.
 *
 * `__SDK_API_URL__` y `__SDK_BUILD_ENV__` son reemplazadas por string literals
 * en `dist/*` durante el build. NUNCA son configurables en runtime.
 *
 * El check defensivo C5 (ADR-007) detecta build mismatch incluso si `prepublishOnly`
 * fue bypassed con `--ignore-scripts`. Es la última línea de defensa antes de que
 * un bundle "production-localhost" llegue al consumidor: el throw síncrono al import
 * impide que el módulo cargue.
 */

declare const __SDK_API_URL__: string;
declare const __SDK_BUILD_ENV__: 'local' | 'development' | 'production';

if (__SDK_API_URL__.includes('localhost') && __SDK_BUILD_ENV__ !== 'local') {
  throw new Error(
    `[procesador-pagos-sdk] Build mismatch: __SDK_API_URL__ apunta a localhost (${__SDK_API_URL__}) pero __SDK_BUILD_ENV__ es "${__SDK_BUILD_ENV__}". ` +
      'Reconstruir con build:dev o build:prod antes de publicar.',
  );
}

export const SDK_API_URL: string = __SDK_API_URL__;
export const SDK_BUILD_ENV: 'local' | 'development' | 'production' = __SDK_BUILD_ENV__;
