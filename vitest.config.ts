import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest config con `projects:` API (Vitest 3+, estándar v4).
 *
 * Pool `node` para tests Node default.
 * Pool `jsdom` para tests del widget React (`tests/features/widget-react/`).
 *
 * Reemplaza el patrón deprecated `environmentMatchGlobs` (removido en Vitest 4).
 */
export default defineConfig({
  resolve: {
    alias: {
      "#test-internals/webhooks": fileURLToPath(
        new URL("./src/features/webhooks/test-internals.ts", import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: [
            "tests/**/*.{mock,e2e}.test.ts",
            "tests/**/*.{mock,e2e}.test.tsx",
          ],
          exclude: ["tests/features/widget-react/**"],
          environment: "node",
          globals: false,
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          include: [
            "tests/features/widget-react/**/*.{mock,e2e}.test.ts",
            "tests/features/widget-react/**/*.{mock,e2e}.test.tsx",
          ],
          environment: "jsdom",
          globals: false,
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
  define: {
    __SDK_API_URL__: JSON.stringify("http://localhost:6000"),
    __SDK_BUILD_ENV__: JSON.stringify("local"),
  },
});
