# Architecture Decision Records (ADRs) — `@eva/procesador-pagos-sdk`

8 decisiones de arquitectura que definen el SDK. Numeradas en orden de importancia/relevancia.

---

## ADR-001 — URL del servicio horneada en build-time

**Estado**: Accepted.
**Fecha**: 2026-04 (initial).

### Contexto

El SDK habla a un servicio HTTP. Hay tres entornos: `local` (workers dev local), `development` (staging Cloudflare), `production` (Cloudflare prod).

### Decisión

La URL del servicio se inyecta en build-time vía `tsdown define` (`__SDK_API_URL__`), NO se acepta como parámetro del constructor `crearCliente`.

```typescript
// build-time
__SDK_API_URL__ = "https://procesador-de-pagos.workers.dev"; // production

// runtime
crearCliente({ apiKey /* SIN url */ });
```

Tres versiones distintas del SDK son publicadas (una por entorno):

| Versión                           | URL inyectada                 |
| --------------------------------- | ----------------------------- |
| `@eva/procesador-pagos-sdk@local` | `http://localhost:6000`       |
| `@eva/procesador-pagos-sdk@dev`   | URL development (placeholder) |
| `@eva/procesador-pagos-sdk@prod`  | URL production (placeholder)  |

### Consecuencias

- (+) El consumidor no puede equivocarse de URL en runtime.
- (+) Imposibilita ataques MitM via env var manipulation (`process.env.PAGOS_URL = evil.com`).
- (+) Bundles minify-able sin `process.env.X` lookup.
- (−) Tres builds para mantener (resuelto con `EVA_PAGOS_BUILD_ENV` + scripts pnpm).
- (−) Tests necesitan mockear las constantes (`vitest.config.ts.define`).

### Defensa adicional

Ver ADR-007 (defensa runtime contra build mismatch).

---

## ADR-002 — Result Pattern como contrato público

**Estado**: Accepted.
**Fecha**: 2026-04 (initial).

### Contexto

Hay dos modelos para errores en SDKs:

1. **Throws estilo Stripe-node**: cada operación lanza si falla, consumidor envuelve en `try/catch`.
2. **Result Pattern estilo Rust/fp-ts**: cada operación retorna `Resultado<T> = Ok<T> | Err<E>`.

### Decisión

**Result Pattern**, con union cerrado para `codigo`:

```typescript
type Resultado<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      codigo: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 500 | 502 | 503;
    }
  | { success: false; error: string; codigo: 429; retryAfter?: number };
```

### Consecuencias

- (+) TS strict obliga al consumidor a discriminar antes de usar `.data`. Errores no pueden olvidarse.
- (+) `codigo` cerrado permite `switch` exhaustivo.
- (+) Retry layer en el consumidor es trivial: `if (r.codigo === 429) await sleep(r.retryAfter)`.
- (+) `retryAfter` solo accesible cuando `codigo === 429` (TS strict bloquea acceso en otras variantes).
- (−) Más verboso que `try/catch` para casos felices (mitigado con helpers `esExitoso` / `esFallido`).
- (−) No es el modelo estándar de la industria (Stripe, AWS lanzan). Documentado claramente en README.

### Excepción

`iterarPagos` lanza (ver ADR-005).

---

## ADR-003 — Namespace agrupado `cliente.pagos.X`

**Estado**: Accepted.
**Fecha**: 2026-04 (initial).

### Contexto

Dos shapes posibles para el cliente:

1. **Plano**: `cliente.crearPago(...)`, `cliente.consultarPago(...)`, `cliente.verificarFirma(...)`.
2. **Agrupado**: `cliente.pagos.crearPago(...)`, `cliente.pagos.consultarPago(...)`, `cliente.webhooks.verificar(...)`.

### Decisión

**Agrupado**. El cliente tiene un namespace por feature: `cliente.pagos`, futuro `cliente.tokens`, `cliente.subscripciones`.

### Consecuencias

- (+) Escala mejor: con 3+ features, el shape plano se vuelve un blob.
- (+) Auto-completion del IDE más útil (filtra por feature).
- (+) Refactor de un feature solo toca un namespace.
- (−) 1 nivel más de indirection (negligible).

### Nota de webhooks

Webhooks NO va al cliente — está en subpath `/webhooks` del SDK. Razón: webhooks no necesita apiKey, la apiKey la maneja el cliente. Acoplar webhooks al cliente forzaría tener un cliente solo para verificar webhooks, lo cual no tiene sentido.

---

## ADR-004 — `compararFirmasSeguro` con primitivas nativas (no custom byte-a-byte)

**Estado**: Accepted (revisado en auditoría — C4).
**Fecha**: 2026-04.

### Contexto

Verificación HMAC requiere comparación timing-safe (no `===`, ni loop early-return). Hay tres opciones:

1. **Loop XOR custom**: `result |= a[i] ^ b[i]` byte-a-byte. Frágil si el JIT optimiza.
2. **`crypto.subtle.timingSafeEqual`**: estándar Web. Disponible en Cloudflare Workers, Vercel Edge, browsers modernos.
3. **`node:crypto.timingSafeEqual`**: Node 18+ con `nodejs_compat`.

### Decisión

Solo opciones 2 y 3 (primitivas nativas). **NO hay fallback custom**.

Algoritmo:

1. Feature-detect `globalThis.crypto?.subtle?.timingSafeEqual`. Si existe → usar.
2. Fallback: `require('node:crypto').timingSafeEqual` (try/catch).
3. Si ninguna disponible → **throw fail-closed**: `'Runtime no soporta timing-safe comparison.'`.

### Consecuencias

- (+) Imposibilita timing attacks por JIT (la primitiva nativa está auditada por implementadores del runtime).
- (+) Fail-closed: en runtimes desconocidos, NO se compara con `===` ni custom — se rechaza el módulo completo. Mejor que un fallback inseguro.
- (+) Tests inspeccionan el fuente con regex para garantizar que NO hay loop XOR custom.
- (−) Excluye runtimes legacy sin `subtle.timingSafeEqual` ni `node:crypto`. Aceptable: el SDK declara `engines.node >= 18` y runtimes modernos.

---

## ADR-005 — `iterarPagos` yields `PagoResumen` directo + throws `Error(msg, { cause: Resultado })`

**Estado**: Accepted (revertido tras auditoría — C3).
**Fecha**: 2026-04.

### Contexto

`iterarPagos` es async generator que pagina automáticamente. Dos modelos posibles:

1. **`yield PagoResumen`**: yields el shape real del endpoint de listado. On I/O failure: `throw new Error(...)`. Idiomático **Stripe-node**, **AWS SDK v3**, **Octokit**, **Google Cloud Node**.
2. **`yield Resultado<PagoResumen>`**: cada elemento es un wrapped result. Consistente con el resto del SDK.

### Decisión

**Modelo 1**: yields `PagoResumen` directo. On I/O failure interno (network, 5xx, etc.) lanza:

```typescript
throw new Error(r.error, { cause: r }); // r es Resultado<never> con codigo + error
```

### Consecuencias

- (+) Idiomático: el desarrollador que conoce Stripe/AWS lee `for await (const pago of iter)` sin sorpresas.
- (+) Alinea la firma pública con el payload real emitido por el endpoint de listado paginado.
- (+) Permite `try/catch` con narrowing de `error.cause` para acceso al `Resultado` original.
- (+) Es la única forma de propagar errores en async iterators sin reinventar el protocolo.
- (−) Es la **única excepción** al Result Pattern del SDK. Documentado explícitamente en README + JSDoc + esta ADR.
- (−) El consumidor olvidadizo del `try/catch` recibe unhandled rejection (mitigado por TS lint reglas + JSDoc).

### Idiom recomendado

```typescript
import type { Resultado } from "@eva/procesador-pagos-sdk";

try {
  for await (const pago of cliente.pagos.iterarPagos({ estado: "pendiente" })) {
    await procesar(pago);
  }
} catch (err) {
  if (err instanceof Error && err.cause) {
    const causa = err.cause as Resultado<never> & { success: false };
    console.error(`Codigo ${causa.codigo}: ${causa.error}`);
  } else {
    throw err;
  }
}
```

---

## ADR-006 — Overrides `fetch` / `timeout` / `headers` / `signal`; URL nunca

**Estado**: Accepted.
**Fecha**: 2026-04 (initial).

### Contexto

¿Qué puede el consumidor sobre-escribir en `crearCliente`?

### Decisión

**Sobre-escribibles** (todos opt-in):

- `fetch?: typeof globalThis.fetch` — para tests, retry-layers, instrumentación.
- `timeout?: number` — default 10_000 ms.
- `headers?: Record<string, string>` — headers extra (los internos `x-api-key` y `Content-Type` ganan ante colisión).
- `signal?: AbortSignal` — signal global del cliente (cancela TODAS las ops en vuelo).
- `signal?: AbortSignal` por operación — cancela una sola op.

**No sobre-escribibles**:

- URL base (ADR-001).
- Header `x-api-key` (siempre apiKey del constructor).
- Mapeo de errores HTTP.
- Triple AbortSignal (siempre `AbortSignal.any` con timeout interno).

### Consecuencias

- (+) Custom retry layer: el consumidor wrapea `fetch` y reintenta antes de pasarlo al SDK.
- (+) Custom telemetry: `fetch` puede medir latencia.
- (+) URL imposible de cambiar en runtime (ataque MitM mitigado).
- (−) Si el servicio cambia headers obligatorios, hay que bumpear el SDK.

---

## ADR-007 — Defensa runtime contra build mismatch

**Estado**: Accepted (introducido en auditoría — C5).
**Fecha**: 2026-04.

### Contexto

`prepublishOnly` corre `typecheck && test:run && build:prod`. Pero `npm publish --ignore-scripts` bypassea esto. Un desarrollador podría publicar accidentalmente un build con URL `localhost` y `__SDK_BUILD_ENV__='production'`.

### Decisión

`src/core/config.ts` lanza síncronicamente al cargar el módulo si:

```typescript
if (__SDK_API_URL__.includes("localhost") && __SDK_BUILD_ENV__ !== "local") {
  throw new Error(
    `[procesador-pagos-sdk] Build mismatch: __SDK_API_URL__ apunta a localhost (${url}) ` +
      `pero __SDK_BUILD_ENV__ es "${env}". Reconstruir con build:dev o build:prod antes de publicar.`,
  );
}
```

### Consecuencias

- (+) Última línea de defensa. Detecta el mismatch al primer `import` del SDK en runtime.
- (+) Test específico (`tests/core/config-defensivo.mock.test.ts`) valida los 3 casos: OK local, mismatch production, OK production-real.
- (+) NO requiere acceso al sistema de archivos, network, ni nada externo.
- (−) Side effect en import (documentado y tested).
- (−) NO cubre URLs no-localhost incorrectas (e.g. SDK con URL dev pero env=production). Mitigado por convención y `prepublishOnly`.

---

## ADR-008 — Migración de `tsup` a `tsdown`

**Estado**: Accepted (introducido en auditoría — I1).
**Fecha**: 2026-04.

### Contexto

`tsup` (basado en esbuild) está en mantenimiento mínimo. Mantener un bundler activo es importante para soporte de TS features nuevos y bug fixes.

### Decisión

**`tsdown ^0.7`** (basado en Rolldown — el bundler oficial de Vite/Rollup successor) reemplaza `tsup ^8.5`.

API casi idéntica:

```typescript
// tsdown.config.ts
import { defineConfig } from 'tsdown';
export default defineConfig({
  entry: { index: 'src/index.ts', webhooks: 'src/webhooks.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  define: { __SDK_API_URL__: ..., __SDK_BUILD_ENV__: ... },
});
```

### Consecuencias

- (+) Mantenido activamente.
- (+) `define` funciona igual.
- (+) ESM + CJS dual output.
- (+) `dts: true` genera `.d.ts`.
- (−) Menos maduro que tsup (`^0.7` vs `^8.5`). Mitigación: smoke test `require('./dist/index.cjs')` en `tests/build/define-injection.mock.test.ts`. Si falla, fallback a tsup.
- (−) Documentación menos extensa. Aceptable: API es mínima.

### Plan B

Si `tsdown` rompe el CJS output o introduce regression, revertir a:

```json
"tsup": "^8.5.0"
```

y renombrar `tsdown.config.ts` → `tsup.config.ts` (las APIs son compatibles 1:1 al nivel que el SDK usa).

---

## Apéndice: UX final aprobada (referencia)

Ver `engram://sdd/bootstrap-mvp/ux-final` (#1372) para los 9 patrones UX aprobados con `dave`:

- **UX-1**: namespace agrupado `cliente.pagos.X`.
- **UX-2**: alias `createClienteProcesadorPagos`.
- **UX-3**: helpers `esExitoso` / `esFallido`.
- **UX-4**: signal global del cliente.
- **UX-5**: `options.signal` por operación.
- **UX-6**: webhook `verificarWebhookDesdeRequest` con `options.body?`.
- **UX-7**: alias `Pago = PagoDetalle`.
- **UX-8**: reembolso sin monto = total.
- **UX-9**: `iterarPagos` async iterator.

## Apéndice: ambigüedades cerradas (A1-A6)

- **A1**: aceptar cualquier 2xx con body parseable (lenient). El servicio retorna 201; el SDK no chequea status estricto.
- **A2**: body de reembolso siempre `{}` o `{ monto }`. NUNCA `{ monto: undefined }`.
- **A3**: revertida — ver C3/ADR-005.
- **A4**: schemas Zod 1:1 con servicio (verificado en T-0-06).
- **A5**: `apiKey` solo en constructor — nunca en operación individual.
- **A6**: `docs/security.md` SÍ va en MVP (no posterior).

## Apéndice: críticos C1-C6 (auditoría cerrada)

- **C1**: `verificarWebhookDesdeRequest` con `options.body?` (Hono+CF Workers).
- **C2**: `401` para fallas auth/firma/secretKey, `422` para body no-JSON post-firma-OK y body ya consumido.
- **C3**: `iterarPagos` yields `PagoResumen` directo + throws `Error(msg, { cause: Resultado })` (ADR-005).
- **C4**: `compararFirmasSeguro` con primitivas nativas, fail-closed (ADR-004).
- **C5**: defensa runtime contra build mismatch (ADR-007).
- **C6**: SDK NO valida tamaño metadata localmente (servicio responde 413).
