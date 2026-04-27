# Changelog

Todas las versiones siguen [SemVer](https://semver.org/) y los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/).

## [0.2.0] — 2026-04-25

### Added (full-stack-checkout)

- **Entry `@eva/procesador-pagos-sdk/hono`** — factory `rutasPagos()` (alias `crearRutasPagos`) que monta los 4 endpoints `POST /crear`, `POST /webhook`, `GET /:id`, `GET /:id/eventos`. Acepta opciones literales o función lazy `(env) => opciones`.
- **Entry `@eva/procesador-pagos-sdk/hono/upstash`** — adapter pub/sub Upstash Redis (peer dep optional `@upstash/redis>=1.0.0`).
- **Entry `@eva/procesador-pagos-sdk/hono/durable-objects`** — adapter Cloudflare Durable Objects + clase `SSEHub` con replay buffer FIFO 20 + TTL 5 min (REQ-PUBSUB-006).
- **Entry `@eva/procesador-pagos-sdk/react`** — componente `<BotonPago>` + hook `useBotonPago()` con state machine de 6 fases, AbortController StrictMode-tolerante (FIX M1), customización via `style`/`styles`/`className`/render-prop `children` (FIX C3).
- **Feature `pubsub`** — interface `PubSubAdapter` + 3 adapters (memoria, Upstash, DO) + `calcularEventId(...)` SHA-256.
- **Feature `sse-stream`** — `abrirStreamSSE(...)` con snapshot inicial + heartbeat clamp [10s, 60s] + dedup por eventId TTL 5 min + `sanitizarCampoSSE(...)` (defensa CR/LF — FIX C1) + `await onAbort` (FIX I3).
- **Hooks de negocio** — `alConfirmar`, `alFallar`, `alReembolsar`, `alWebhookRecibido`, `alAntesDeResponderPolling`. Estrategia mixta: hooks `await`, publish fire-and-forget con `c.executionCtx?.waitUntil(...)` (CF Workers) o fallback `void`.
- **`verificarAcceso?`** opcional con `console.warn` si SSE configurado sin auth (FIX I2 / ADR-019).
- **Hono `>=4.12.4`** como peer dep (mitigación CVE-2026-29085).

### Security (S1 — bloqueante)

- **`alCrearPago` ahora REQUIRED** en TypeScript (`alCrearPago: ...` sin `?:`). El factory `rutasPagos()` throwea **síncronamente** al construir si está ausente o no es función. Aplica SIEMPRE, en cualquier `EVA_PAGOS_BUILD_ENV`. Razón: prevenir manipulación de `monto`/`moneda` desde devtools del frontend (REQ-RUTAS-008 / ADR-020).
- **JSDoc destacado `**DISPLAY ONLY**`** en props `monto` y `moneda` de `<BotonPago>` (REQ-WIDGET-014 / S1.2).
- **`docs/security.md` §2** — sección obligatoria "Validación server-side OBLIGATORIA" con ejemplo INSEGURO/SEGURO + tabla de manipulaciones + checklist pre-deploy + cuándo NO usar identity (REQ-DOCS-001 / S1.3).
- **ADR-020** — Security boundary completo en `docs/decisions.md` con responsabilidades SDK vs consumidor + threat model (S1.4).
- **README sección "Seguridad obligatoria"** después del quickstart con throw + snippet seguro + link a `docs/security.md` (REQ-DOCS-002 / S1.5).
- **BREAKING en TypeScript strict**: consumidores que llamaban `rutasPagos({ apiKey, webhookSecret })` sin `alCrearPago` reciben TS error + runtime throw. Migración: `alCrearPago: (input) => input` (identity, declaración explícita) o implementar el lookup en BD (recomendado).

### Verified against

- Servicio Procesador-de-pagos commit `380874771a21b56bd42f1db23c60627c62209327`.
- Hono `^4.12.15` (>=4.12.4 requerido por security CVE).
- React `^19.2.5` (peer dep optional).
- Auditoría 1 abogado-del-diablo cerrada con 10 fixes (C1-C4 + I1-I3 + M1-M3) + Fix S1 (5 sub-fixes Security).

## [0.1.0] — 2026-04-25

### Added (initial release)

- **Cliente core** — `crearCliente` + alias `createClienteProcesadorPagos`. URL del servicio horneada en build-time vía `__SDK_API_URL__` (no configurable en runtime).
- **Operaciones de pagos** (6):
  - `crearPago` — POST `/api/v1/pagos`. Response shape de 10 campos (`crearPagoResponseSchema`).
  - `consultarPago` — GET `/api/v1/pagos/{id}`. Response shape de 22 campos (`pagoDetalleSchema`).
  - `listarPagos` — GET `/api/v1/pagos` con filtros + paginación manual.
  - `iterarPagos` — async generator que pagina automáticamente. Yields `Pago` directo y lanza `Error(msg, { cause: Resultado })` on I/O failure (idiomático Stripe-node / AWS SDK v3 / Octokit).
  - `cancelarPago` — POST `/api/v1/pagos/{id}/cancelar`.
  - `reembolsarPago` — POST `/api/v1/pagos/{id}/reembolsar` con body `{}` (total) o `{ monto }` (parcial). NUNCA `monto: undefined`.
- **Verificación de webhooks** (2 funciones públicas, en subpath `@eva/procesador-pagos-sdk/webhooks`):
  - `verificarFirmaWebhook` — primitive HMAC-SHA256 + comparación timing-safe.
  - `verificarWebhookDesdeRequest` — wrapper sobre `Request` con `options?: { body? }` para Hono+CF Workers (C1).
- **Result Pattern** como contrato público (`Resultado<T>`) con `CodigoErrorHttp` cerrado (`400|401|403|404|409|413|422|429|500|502|503`).
- Variante 429 con campo opcional `retryAfter?: number` parseado del header `Retry-After` (I2).
- **Triple AbortSignal**: cliente global + por operación + timeout interno, combinados con `AbortSignal.any` (I5).
- **Build-per-environment** con `tsdown` (Rolldown-based) y URL del servicio horneada en build-time. Reemplaza `tsup` (I1).
- **Defensa runtime** contra build mismatch (ADR-007 / C5): el módulo `core/config.ts` lanza síncronicamente al cargar si `__SDK_API_URL__` contiene `localhost` y `__SDK_BUILD_ENV__` ≠ `'local'`.
- **`compararFirmasSeguro`** delega a primitivas nativas (`crypto.subtle.timingSafeEqual` / `node:crypto.timingSafeEqual`) y fail-closed si el runtime no las expone (ADR-004 / C4).
- **Tests**: 14 archivos `.mock.test.ts`, **113 scenarios** cubriendo los 14 requirements del spec v2 + críticos C1-C6 + importantes I2-I9.
- **Documentación**:
  - `README.md` (quickstart + 8 snippets validados).
  - `docs/{architecture,api,configuration,conventions,decisions,security}.md`.
  - `CHANGELOG.md`.
- **Skills internas** (`.claude/skills/{gobernanza,arquitectura,sdk-dev,sdk-security,configuracion,decisiones}/SKILL.md`).

### Verified against

- Servicio Procesador-de-pagos commit `380874771a21b56bd42f1db23c60627c62209327`.
- Constantes `ESTADOS_PAGO` (9), `TIPOS_PAGO` (3), `METODOS_PAGO = ['transfer','qr']` (verificado en `src/features/pagos/domain/tipos-pago.ts:21`).
- Status 201 en POST `/api/v1/pagos` (verificado en `src/routes/v1-router.ts`).
- Prefijo `sha256=` lowercase + `bytesToHex` lowercase (verificado en `src/features/callbacks/application/enviar-callback-service.ts:259` + `src/core/crypto/hmac.ts`).

### Runtime targets

- Node 18+
- Cloudflare Workers (con flag `nodejs_compat`)
- Vercel Edge Runtime
- **NO browser** (la `apiKey` es secreta).
