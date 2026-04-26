/**
 * Entrypoint privado para tests del feature webhooks.
 *
 * Expone SOLO `compararFirmasSeguro` para que tests puedan verificar
 * el comportamiento timing-safe sin romper la convención de imports.
 *
 * **NO es API pública del SDK.** Accesible únicamente desde tests vía
 * alias privado de tooling del workspace (`tsconfig.json` + `vitest.config.ts`).
 *
 * Convención: cualquier internal que necesite ser testeado directamente
 * puede reexportarse aquí, pero NUNCA debe agregarse al barrel público
 * ni exponerse en package.json#exports.
 */

export { compararFirmasSeguro } from "./infrastructure/comparar-firmas-seguro.js";
