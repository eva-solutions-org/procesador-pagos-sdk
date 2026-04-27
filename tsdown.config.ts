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
 * Entries v0.2 (full-stack-checkout):
 * - `index`, `webhooks`: existentes (core).
 * - `hono`, `hono/upstash`, `hono/durable-objects`, `react`: nuevos opt-in.
 *   `hono*` usan platform `neutral` (compatibles Node + CF Workers).
 *   `react` usa platform `browser` con jsx automatic.
 *   `react`, `react-dom`, `hono`, `@upstash/redis` siempre external (peer deps).
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

const EXTERNAL_PEER_DEPS = [
  "hono",
  "hono/streaming",
  "react",
  "react-dom",
  "react/jsx-runtime",
  "@upstash/redis",
];

const defineInjections = {
  __SDK_API_URL__: JSON.stringify(apiUrl),
  __SDK_BUILD_ENV__: JSON.stringify(env),
};

export default defineConfig([
  // Core entries (index + webhooks) — sin cambios respecto a v0.1.
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
    external: EXTERNAL_PEER_DEPS,
  },
  // Hono entries (neutral platform — Node + CF Workers).
  {
    entry: {
      hono: "src/hono.ts",
      "hono/upstash": "src/hono/upstash.ts",
      "hono/durable-objects": "src/hono/durable-objects.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    sourcemap: true,
    target: "es2022",
    platform: "neutral",
    fixedExtension: false,
    define: defineInjections,
    external: EXTERNAL_PEER_DEPS,
  },
  // React entry (browser platform, jsx automatic).
  {
    entry: {
      react: "src/react.tsx",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    sourcemap: true,
    target: "es2022",
    platform: "browser",
    fixedExtension: false,
    define: defineInjections,
    external: EXTERNAL_PEER_DEPS,
  },
]);
