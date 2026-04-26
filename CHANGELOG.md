# Changelog

Todas las versiones siguen [SemVer](https://semver.org/) y los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/).

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
