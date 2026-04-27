# Configuración — `@eva/procesador-pagos-sdk`

## 1. Setup como consumidor del SDK

### Instalación

```bash
pnpm add @eva/procesador-pagos-sdk
```

Tras la instalación, el SDK ya tiene la URL del servicio horneada en build-time según la versión que instalaste. **No hay configuración runtime de URL**.

### Variables de entorno requeridas

Ninguna obligatoria. La `apiKey` se pasa por constructor:

```typescript
const cliente = crearCliente({ apiKey: process.env.EVA_PAGOS_API_KEY! });
```

### Variables de entorno recomendadas

| Variable                   | Descripción                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `EVA_PAGOS_API_KEY`        | API key del proyecto. Convención del ecosistema `@eva/*`. NO tiene que llamarse así, es solo sugerencia. |
| `EVA_PAGOS_WEBHOOK_SECRET` | secretKey HMAC. Solo necesaria en handlers de webhooks.                                                  |

### Cómo elegir entre `dev` y `prod` builds

Tu pipeline de despliegue determina qué versión del SDK instalás:

| Entorno consumidor    | Versión del SDK                                                      |
| --------------------- | -------------------------------------------------------------------- |
| Desarrollo local      | `@eva/procesador-pagos-sdk@local` (apunta a `http://localhost:6000`) |
| Staging / development | Tag/version `dev` (apunta a la URL development)                      |
| Producción            | Tag/version `prod` (apunta a la URL production)                      |

Tu `package.json` o lockfile fija qué bundle usás. **No es runtime configurable** por diseño (ADR-001).

---

## 2. Setup como contribuidor del SDK

### Clonar e instalar

```bash
git clone <repo>
cd procesador-de-pagos-sdk
pnpm install
```

### Variables de build

| Variable              | Valores                              | Default                      | Acción                                            |
| --------------------- | ------------------------------------ | ---------------------------- | ------------------------------------------------- |
| `EVA_PAGOS_BUILD_ENV` | `local`, `development`, `production` | `local` (con `console.warn`) | Selecciona la URL inyectada en `__SDK_API_URL__`. |

`tsdown.config.ts` lee esta variable y resuelve la URL contra una tabla:

```typescript
const URLS_POR_ENTORNO: Record<BuildEnv, string> = {
  local: "http://localhost:6000",
  // TODO: confirmar con plataforma antes de publicar tag al registry interno.
  development: "https://procesador-de-pagos-dev.workers.dev",
  // TODO: confirmar con plataforma antes de publicar tag al registry interno.
  production: "https://procesador-de-pagos.workers.dev",
};
```

> **TODO**: las URLs de `development` y `production` son **placeholders** hasta que el equipo de plataforma confirme las definitivas. El `wrangler.jsonc` del servicio NO publica URLs por entorno — Cloudflare las maneja por route binding. Antes de publicar un tag definitivo al registry interno, confirmar.

### Scripts pnpm

```bash
pnpm build            # alias de `pnpm build:local` con tsdown (sin EVA_PAGOS_BUILD_ENV).
pnpm build:local      # __SDK_API_URL__ = http://localhost:6000, env=local.
pnpm build:dev        # __SDK_API_URL__ = URL development (placeholder), env=development.
pnpm build:prod       # __SDK_API_URL__ = URL production (placeholder), env=production.

pnpm typecheck        # tsc --noEmit.
pnpm test             # vitest watch mode.
pnpm test:run         # vitest run (CI).
pnpm lint             # oxlint.
pnpm format           # oxfmt.

pnpm pack:local       # build:local + pnpm pack → genera .tgz consumible.
pnpm prepublishOnly   # typecheck + test:run + build:prod (corre antes de `npm publish`).
```

### Ejecución de tests

```bash
pnpm test:run                                     # todos
pnpm test:run tests/features/pagos/crear-pago     # un archivo
pnpm test:run -t 'crear-pago > caso éxito'        # por nombre
```

### Defensa runtime contra build mismatch (ADR-007 / C5)

`src/core/config.ts` lanza síncronicamente al cargar si:

```typescript
__SDK_API_URL__.includes("localhost") && __SDK_BUILD_ENV__ !== "local";
```

Esto es **última línea de defensa** contra publicar un build con `--ignore-scripts` (que bypassea `prepublishOnly`). Detecta el mismatch al primer `import` del módulo en runtime.

---

## 3. Estimación realista de implementación (referencia I10)

El proyecto se estimó en **80-150 horas** desglosadas así:

| Fase                                                                          | Tareas | Horas       |
| ----------------------------------------------------------------------------- | -----: | ----------- |
| Fase 0 — Verificación pre-implementación                                      |      6 | 4-8h        |
| Fase 1 — Scaffolding                                                          |      7 | 5-10h       |
| Fase 2 — Core (triple AbortSignal + defensa runtime + 429 retryAfter)         |      6 | 15-25h      |
| Fase 3 — Pagos (iterator + 2 schemas response distintos)                      |     11 | 20-35h      |
| Fase 4 — Webhooks (overload body + primitivas nativas + regex case-sensitive) |      6 | 10-20h      |
| Fase 5 — Entry points                                                         |      2 | 1-2h        |
| Fase 6 — Tests (~85-113 scenarios)                                            |     16 | 15-30h      |
| Fase 7 — Docs                                                                 |      8 | 10-15h      |
| Fase 8 — Gobernanza interna                                                   |      6 | 5-10h       |
| Fase 9 — Verificación local                                                   |      7 | 1-2h        |
| **Total**                                                                     | **75** | **80-150h** |

### Sub-batches del apply

Para ejecutar de manera trackeable, el `sdd-apply` se dividió en 4 sub-batches:

| Sub-batch | Fases                    | Tareas | Estado   |
| --------- | ------------------------ | -----: | -------- |
| A         | Fase 0 + Fase 1          |     13 | Completo |
| B         | Fase 2 + Fase 3          |     17 | Completo |
| C         | Fase 4 + Fase 5 + Fase 6 |     24 | Completo |
| D         | Fase 7 + Fase 8 + Fase 9 |     21 | Completo |

Cada sub-batch persiste su progreso bajo el topic `sdd/bootstrap-mvp/apply-progress` en engram.

---

## 4. Configuración de runtime targets

| Runtime             | Versión mínima                                  | Notas                                            |
| ------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Node                | 18.0+                                           | `engines.node >= 18` en `package.json`.          |
| Cloudflare Workers  | Compatibility 2023-08+ con flag `nodejs_compat` | `subtle.timingSafeEqual` disponible nativamente. |
| Vercel Edge Runtime | Cualquier versión moderna                       | `subtle.timingSafeEqual` disponible.             |
| Browser             | NO soportado                                    | apiKey es secreta.                               |

### Cloudflare Workers — `wrangler.jsonc` mínimo

```jsonc
{
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"],
}
```

El flag `nodejs_compat` se usa solo si la primitiva `subtle.timingSafeEqual` no está disponible (raro en runtimes recientes). Aun sin ella, el SDK falla cerrado con error explícito (ver `docs/security.md`).

---

## Adapters de pub/sub (full-stack-checkout v0.2)

### Matriz de selección

| Adapter | Runtime | Multi-instance | Replay | Setup | Uso recomendado |
|---|---|---|---|---|---|
| `adapterMemoria()` | Node, Workers | NO | NO | zero | Dev, demos, single-process. |
| `adapterUpstash({ url, token })` | Node, Workers, Edge | SI | parcial | Upstash REST credentials | Multi-instance simple. Free tier OK. |
| `adapterDurableObjects({ binding })` | Cloudflare Workers | SI | SI FIFO 20 + TTL 5min | DO class binding en wrangler | Producción CF Workers. |

### Setup `adapterMemoria()`

```typescript
import { rutasPagos, adapterMemoria } from "@eva/procesador-pagos-sdk/hono";

app.route("/pagos", rutasPagos({
  apiKey: process.env.API_KEY!,
  webhookSecret: process.env.WEBHOOK_SECRET!,
  alCrearPago: async (input) => input,
  pubsub: adapterMemoria(),
}));
```

Limitaciones: si tenés N réplicas, cada una tiene su propio `Map`. Webhook llega a réplica A, cliente SSE conectado a réplica B → no recibe el evento.

### Setup `adapterUpstash()`

```typescript
import { rutasPagos } from "@eva/procesador-pagos-sdk/hono";
import { adapterUpstash } from "@eva/procesador-pagos-sdk/hono/upstash";

app.route("/pagos", rutasPagos({
  apiKey: process.env.API_KEY!,
  webhookSecret: process.env.WEBHOOK_SECRET!,
  alCrearPago: async (input) => input,
  pubsub: adapterUpstash({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
}));
```

Peer dep optional `@upstash/redis>=1.0.0` — instalar con `pnpm add @upstash/redis`.

### Setup `adapterDurableObjects()`

`wrangler.jsonc`:

```jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "SSE_HUB", "class_name": "SSEHub" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["SSEHub"] }
  ]
}
```

`src/worker.ts`:

```typescript
import { Hono } from "hono";
import { rutasPagos } from "@eva/procesador-pagos-sdk/hono";
import { adapterDurableObjects, SSEHub } from "@eva/procesador-pagos-sdk/hono/durable-objects";

export { SSEHub };

interface Env {
  API_KEY: string;
  WEBHOOK_SECRET: string;
  SSE_HUB: DurableObjectNamespace;
}

const app = new Hono<{ Bindings: Env }>();
app.route("/pagos", rutasPagos<Env>((env) => ({
  apiKey: env.API_KEY,
  webhookSecret: env.WEBHOOK_SECRET,
  alCrearPago: async (input) => input,
  pubsub: adapterDurableObjects({ binding: env.SSE_HUB }),
})));

export default app;
```

Ventajas: replay buffer FIFO 20 entradas + TTL 5 min por canal en `state.storage`. Si un cliente se reconecta con `Last-Event-ID`, recibe los eventos perdidos.
