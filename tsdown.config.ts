import { defineConfig } from "tsdown";

/**
 * Build-per-environment con tsdown (I1 — reemplaza tsup).
 *
 * Define inyectado en build-time:
 * - `__SDK_API_URL__`: URL del servicio Procesador-de-pagos según `EVA_PAGOS_BUILD_ENV`.
 * - `__SDK_BUILD_ENV__`: 'local' | 'development' | 'production'.
 *
 * Defensa runtime adicional vive en `src/core/config.ts` (C5): si la URL
 * inyectada contiene `localhost` y el env NO es `local`, el módulo lanza
 * sincronicamente al cargar.
 *
 * Ver `.atl/fase-0-verificacion.md` § T-0-05 para el origen de las URLs
 * placeholder de `development` y `production`.
 *
 * Entries: `index` y `webhooks` (core). Sin peer deps.
 */

type BuildEnv = "local" | "development" | "production";

const envInput = process.env.EVA_PAGOS_BUILD_ENV;
const env: BuildEnv = (envInput as BuildEnv | undefined) ?? "local";

if (envInput === undefined) {
  // eslint-disable-next-line no-console
  console.warn(
    '[procesador-pagos-sdk] EVA_PAGOS_BUILD_ENV no seteado, usando "local" por defecto.',
  );
}

const URLS_POR_ENTORNO: Record<BuildEnv, string> = {
  local: "http://localhost:6000",
  // TODO: confirmar con plataforma antes de publicar tag al registry interno.
  development: "https://procesador-de-pagos-dev.workers.dev",
  // TODO: confirmar con plataforma antes de publicar tag al registry interno.
  production: "https://procesador-de-pagos.workers.dev",
};

const apiUrl = URLS_POR_ENTORNO[env];

if (env === "production" && apiUrl.includes("localhost")) {
  throw new Error(
    `[tsdown] Build de producción NO puede apuntar a localhost (recibido: ${apiUrl})`,
  );
}

const defineInjections = {
  __SDK_API_URL__: JSON.stringify(apiUrl),
  __SDK_BUILD_ENV__: JSON.stringify(env),
};

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      webhooks: "src/webhooks.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
    fixedExtension: false,
    define: defineInjections,
  },
]);
