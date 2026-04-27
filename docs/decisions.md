# Architecture Decision Records (ADRs) — `@eva/procesador-pagos-sdk`

20 decisiones de arquitectura que definen el SDK. Numeradas en orden cronológico (ADR-001..008 son del MVP v0.1; ADR-009..020 incorporadas en el change `full-stack-checkout` v0.2).

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

---

## ADR-009 — Vitest projects API + jsdom para widget React

**Estado**: Accepted (full-stack-checkout v0.2 — C2).
**Fecha**: 2026-04.

### Contexto

`vitest@4` removió `environmentMatchGlobs`. El SDK necesita correr tests Node (default) y tests React jsdom en la misma config.

### Decisión

Usar `projects: [...]` API de vitest con dos pools:

- `node`: tests del core, pubsub, sse-stream, rutas-hono, webhooks.
- `jsdom`: tests del widget React (`tests/features/widget-react/**`).

### Consecuencias

- (+) API estable de vitest 3+/4.
- (+) Pool jsdom solo se carga cuando hay tests del widget — overhead nulo en otros casos.
- (−) Setup file (`vitest.setup.ts`) con `@testing-library/jest-dom/vitest` solo aplica en jsdom.

---

## ADR-010 — Adapters pub/sub por interface (memoria + Upstash + DO)

**Estado**: Accepted (full-stack-checkout v0.2).
**Fecha**: 2026-04.

### Contexto

El backend Hono necesita pub/sub para SSE. No queremos casarnos a un proveedor.

### Decisión

Definir `interface PubSubAdapter { publicar; suscribir }` y proveer 3 implementaciones:

- `adapterMemoria()` — single-process, sin deps externas.
- `adapterUpstash({ url, token })` — Upstash Redis vía `@upstash/redis` peer dep.
- `adapterDurableObjects({ binding })` — Cloudflare DO + clase `SSEHub` que el consumidor declara como binding.

El consumidor puede implementar su propio adapter (debe pasar el contract test compartido).

### Consecuencias

- (+) SDK agnóstico de runtime.
- (+) Tests del feature `rutas-hono` no requieren Redis ni DO real.
- (−) Cada adapter requiere docs específicas (matriz en `docs/configuration.md`).

---

## ADR-011 — Handler `POST /crear` con safeParse + alCrearPago required

**Estado**: Accepted (full-stack-checkout v0.2 + S1.1).
**Fecha**: 2026-04.

### Contexto

El factory `rutasPagos()` expone 4 handlers Hono. El de `/crear` debe parsear body, validar Zod, invocar el hook obligatorio `alCrearPago` y delegar al cliente programático.

### Decisión

Flujo: body JSON → `crearPagoInputSchema.safeParse` → `alCrearPago(input, c)` → `cliente.pagos.crearPago(input)` → response `{ intentId, pagoId, modo, basePath }`.

`alCrearPago` se invoca SIN `?.` opcional — el factory garantiza presencia (ver ADR-020).

### Consecuencias

- (+) Validación temprana — request mal formado nunca llega al servicio.
- (+) Invocación directa sin `?.` reduce ramas y facilita razonar.
- (−) El handler depende del schema Zod compartido (acoplamiento aceptable — es contrato del servicio).

---

## ADR-012 — Verificación de webhooks reusa `verificarWebhookDesdeRequest`

**Estado**: Accepted (full-stack-checkout v0.2).
**Fecha**: 2026-04.

### Contexto

El handler `POST /webhook` debe verificar firma HMAC. El SDK ya expone `verificarWebhookDesdeRequest` (ADR-004 + UX-6).

### Decisión

El handler invoca `verificarWebhookDesdeRequest(c.req.raw, opciones.webhookSecret)` y retorna 401/422 según el `codigo` del Resultado fallido. Si OK, parsea `webhookPayloadSchema` (9 campos verificados 1:1 contra el servicio) y procede con dedup + hooks + publish.

### Consecuencias

- (+) Una sola implementación de la verificación HMAC para todo el SDK.
- (+) Tests del webhook handler reusan helpers `generarFirmaWebhookTest`.

---

## ADR-013 — Hooks de negocio en webhook (await mixto)

**Estado**: Accepted (full-stack-checkout v0.2).
**Fecha**: 2026-04.

### Contexto

El consumidor expone hooks (`alConfirmar`, `alFallar`, `alReembolsar`, `alWebhookRecibido`). ¿Await o fire-and-forget?

### Decisión

Estrategia mixta:

- **Hooks de negocio** (`alConfirmar`, `alFallar`, etc.): **await** — el consumidor necesita garantizar persistencia antes del ack del webhook.
- **Publish al pubsub**: **fire-and-forget** — usar `c.executionCtx?.waitUntil(...)` cuando esté disponible (CF Workers), sino `void promesa` con catch silencioso.

### Consecuencias

- (+) Hooks awaitables permiten transactions atómicas en el consumidor.
- (+) Publish no bloquea el ack del webhook — buena DX para SSE en frontend.
- (−) Si un hook lanza, el SDK loguea con `console.error` pero NO falla el ack. El consumidor decide si requiere ack-on-success (puede throwear con prefijo `[NO_ACK]` y custom error mapping).

---

## ADR-014 — Dedup eventos por `eventId` SHA-256 con TTL 5 min

**Estado**: Accepted (full-stack-checkout v0.2).
**Fecha**: 2026-04.

### Contexto

Webhooks pueden duplicarse (red, retry). El SDK debe deduplicar para evitar emitir el mismo evento 2 veces al stream SSE y para evitar que los hooks se invoquen 2 veces.

### Decisión

`calcularEventId(pagoId, estado, estadoAnterior, timestamp)` retorna SHA-256 hex de `v1:pagoId:estado:estadoAnterior:timestamp`. Se almacena en `Map<eventId, expiraEn>` con TTL 5 min. Cleanup oportunista en cada llamada.

### Consecuencias

- (+) Determinístico — mismo input produce mismo eventId cross-runtime.
- (+) TTL pequeño limita memoria — al hilo del business: la ventana de retry de webhook es minutos.
- (−) Single-instance only. Multi-instance requiere DO (replay buffer) o Upstash con SET/EXPIRE.

---

## ADR-015 — Componente `<BotonPago>` con render-prop + slots inline + className override

**Estado**: Accepted (full-stack-checkout v0.2 — FIX C3).
**Fecha**: 2026-04.

### Contexto

Cómo permitir customización del botón sin forzar Tailwind/CSS-in-JS al consumidor.

### Decisión

3 niveles de override (todos opt-in):

1. `style?` / `styles?` — merge sobre defaults inline.
2. `className?` — desactiva inline base; el consumidor controla CSS.
3. `children?` (render-prop) — control total; recibe `ApiRenderPropBoton`.

Render default usa inline styles más default keyframe `sdk-pago-spin` para el spinner (inyectado una vez al primer mount).

### Consecuencias

- (+) Consumidor minimalista usa lo default. Consumidor avanzado override total.
- (+) NO requiere setup de Tailwind ni postcss en el consumidor.

---

## ADR-016 — Hook `useBotonPago` con state machine + AbortController StrictMode tolerante

**Estado**: Accepted (full-stack-checkout v0.2 — FIX M1).
**Fecha**: 2026-04.

### Contexto

React 19 StrictMode monta dos veces componentes en dev. El hook debe ser idempotente al re-mount.

### Decisión

`useRef<AbortController>` interno: cada `iniciar()` aborta el in-flight previo y crea uno nuevo. Cleanup en unmount aborta el actual y libera widget + SSE handle. El primer `mount-unmount-mount` de StrictMode no duplica requests.

### Consecuencias

- (+) Tolerante a StrictMode sin warnings.
- (+) Cleanup determinístico libera EventSource, polling timers, widget Prometeo.

---

## ADR-017 — Factory acepta args literal o lazy `(env) => opciones`

**Estado**: Accepted (full-stack-checkout v0.2).
**Fecha**: 2026-04.

### Contexto

CF Workers expone secrets en `c.env`, no en `process.env`. El consumidor necesita resolver la apiKey en el primer request, no al construir el factory.

### Decisión

`type RutasPagosFactoryArgs<Env> = RutasPagosOpciones | ((env: Env) => RutasPagosOpciones | Promise<RutasPagosOpciones>)`.

Validación S1.1:

- Args literal → throw síncrono al construir el factory.
- Args lazy → throw diferido al middleware del primer request (Hono lo convierte a 500).

### Consecuencias

- (+) DX óptima en CF Workers (zero boilerplate).
- (+) Validación bloqueante en ambos modos.

---

## ADR-018 — Detección DO por marca `Symbol.for` (no `instanceof`)

**Estado**: Accepted (full-stack-checkout v0.2).
**Fecha**: 2026-04.

### Contexto

Los adapters pub/sub son objetos plain (factories, no clases). `instanceof` no aplica. ¿Cómo distingue el handler `/eventos` que el adapter es DO y debe pipear NDJSON directo al stub en vez de invocar `pubsub.suscribir`?

### Decisión

`adapterDurableObjects` agrega la marca `Symbol.for('@eva/procesador-pagos-sdk/adapter-durable-objects')` en el adapter retornado. `esAdapterDurableObjects(adapter)` es type-guard que checkea la marca. Cross-realm safe (gracias a `Symbol.for` global registry).

### Consecuencias

- (+) Type-guard sin `instanceof` ni inspección de funciones.
- (+) Otro consumidor podría implementar un adapter con la misma marca si quiere reusar el flujo NDJSON (poco probable, pero abierto).

---

## ADR-019 — `verificarAcceso?` opcional con warning si SSE sin auth

**Estado**: Accepted (full-stack-checkout v0.2 — FIX I2).
**Fecha**: 2026-04.

### Contexto

El endpoint `GET /:id/eventos` puede leakear el estado de un pago a cualquiera que conozca el `pagoId`. Forzar `verificarAcceso?` requerido rompe DX para casos legítimos sin auth (admin internal). Default opcional + warning balancea.

### Decisión

`verificarAcceso?: (c, pagoId) => boolean | Promise<boolean>` opcional. Si `pubsub && !verificarAcceso`, el SDK emite `console.warn` una sola vez (idempotente por proceso) advirtiendo que el endpoint queda público.

### Consecuencias

- (+) DX simple para casos sin auth pública.
- (+) Warning visible al boot — el dev consciente lo silencia con `verificarAcceso: () => true` explícito (declaración de intención).
- (−) Warning en logs no es enforce real. Mitigado con doc + checklist pre-deploy.

---

## ADR-020 — Security boundary: alCrearPago obligatorio + responsabilidades

**Estado**: Aceptado (v0.2.0).
**Fecha**: 2026-04-26.

### Contexto

El SDK expone props `monto`/`moneda` en el `<BotonPago>` que viajan desde el frontend al backend. Un atacante puede manipular esos campos desde devtools y pagar 1 centavo por un producto caro. Sin un mecanismo que obligue al consumidor a recalcular el monto canónico server-side, el flujo es inseguro por default.

### Decisión

1. Hacer `alCrearPago` **REQUIRED** en TypeScript (no `?:`).
2. **Throw síncrono** al construir `rutasPagos()` si `alCrearPago` ausente o no es `function`.
3. Throw aplica **SIEMPRE** — en cualquier `EVA_PAGOS_BUILD_ENV` (local/dev/prod). NO limitarlo a prod porque warnings se ignoran en code review pero throws no.
4. Caso "no necesito validación" (raro: monto fijo controlado por backend): el consumidor pasa explícitamente `alCrearPago: (input) => input` (identity) — declaración explícita.
5. **NO agregar helper auxiliar** (`validarMontoCanonico` rechazado). La lógica real es del consumidor (lookup BD, cupones, ownership).
6. Validación lazy también: si el consumidor usa `rutasPagos((env) => opciones)`, no podemos validar al construir el factory. La validación se difiere al **primer request middleware**.

### Responsabilidades del SDK

- Throw obligatorio si `alCrearPago` ausente (S1.1).
- Sanitización SSE (CR/LF strip helper) — defensa profundidad (C1).
- Dedup de eventos por `eventId` SHA-256 (REQ-SSE-005).
- Verificación HMAC de webhooks con timing-safe comparison (ADR-004).
- `verificarAcceso?` opcional con warning si SSE sin auth (ADR-019).
- JSDoc destacado en props `monto/moneda` indicando "display only" (S1.2).
- Documentación de seguridad (`docs/security.md`) y ADR (S1.3, S1.4, S1.5).

### Responsabilidades del consumidor

- Implementar `alCrearPago` con **lookup en su BD** para recalcular monto canónico desde `metadata.productoId` u otro identificador.
- Validación de cupones, descuentos, business rules específicas.
- Ownership checks (¿el `userId` puede pagar este `productoId`?).
- Rate limiting.
- Transacciones atómicas para descuentos de stock.
- Autenticación de cookies/JWT en `/eventos`.

### Threat model mitigado

| Amenaza | Vector | Mitigación |
|---|---|---|
| Manipulación `monto`/`moneda` | Devtools edita request | Throw obligatorio + `alCrearPago` recalcula desde BD |
| Replay `referenciaExterna` | Reenvío del mismo body | Servicio retorna 409 |
| Webhook spoofing | POST sin firma válida | HMAC SHA-256 + timing-safe comparison |
| SSE eavesdropping | GET `/eventos` sin auth | `verificarAcceso?` opcional + warning |
| CR/LF injection en SSE | metadata con newlines | `sanitizarValorSSE` + Hono >=4.12.4 |
| `alCrearPago` lanza | Bug en lookup | 500 + log; cliente recibe error genérico |

### Alternativas consideradas

- `alCrearPago` opcional con warning en logs: rechazado — warnings se ignoran.
- Throw solo en prod: rechazado — bug se descubre tarde.
- Helper público `validarMontoCanonico(input, productosDb)`: rechazado — lógica varía por consumidor.
- Auth obligatoria/middleware obligatorio: rechazado por kickoff K7 (DX prima si no rompe seguridad fundamental).

### Consecuencias

- Curva de aprendizaje +5 minutos para consumidores que olvidan el hook — el throw los obliga a leer `docs/security.md`.
- Caso "no validación" requiere identity explícita — fricción aceptable, documenta intención.
- TS compile-error + runtime throw = doble defensa.
- Bump menor de versión: BREAKING en TS strict — documentado en CHANGELOG.

### Riesgo residual: RD10

Consumidor que pasa `alCrearPago: (input) => input` (identity) está expuesto a manipulación monto. Mitigación: docs/security.md sección "Cuándo NO usar identity" + checklist pre-deploy + JSDoc destacado en props del componente.

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
