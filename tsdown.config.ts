import { defineConfig } from "tsdown";

/**
 * Build con tsdown (I1 — reemplaza tsup).
 *
 * El artefacto es único para todos los entornos: la URL del servicio la define el
 * consumidor en runtime con `crearCliente({ baseUrl })`.
 *
 * Entries: `index` y `webhooks` (core). Sin peer deps.
 */

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
  },
]);
