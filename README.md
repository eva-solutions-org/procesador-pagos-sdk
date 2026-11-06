# 💳 @eva_solutions/procesador-pagos-sdk

SDK TypeScript para consumir el servicio Procesador-de-pagos. Diseñado para ser **simple por defecto** con control avanzado opcional.

### 🎯 Características

```
✓ Runtime targets   Node 20+, Cloudflare Workers, Vercel Edge
✓ Seguridad        apiKey nunca expuesta (backend only)
✓ Error Handling   Result Pattern — nunca lanza errores de negocio
✓ Config           baseUrl en runtime: un solo paquete para todos los entornos
✓ Webhooks         HMAC-SHA256 timing-safe
✓ Dependencies     Zod, nada más
```

**No browser** — la `apiKey` es secreta y debe estar en el servidor.

**Licencia:** MIT. **Versiones y cambios:** ver [CHANGELOG.md](./CHANGELOG.md).

### 🗺️ Mapa rápido

```mermaid
flowchart LR
  A[Tu backend o edge runtime] --> B[crearCliente]
  B --> C[cliente.pagos]
  B --> D[@eva_solutions/procesador-pagos-sdk/webhooks]
  C --> E[Servicio Procesador-de-pagos]
  D --> F[Verificación HMAC-SHA256]
```

El paquete expone dos entradas: `@eva_solutions/procesador-pagos-sdk` (cliente y tipos) y `@eva_solutions/procesador-pagos-sdk/webhooks` (verificación de firmas). Ambas existen en ESM y CJS.

---

## 📦 Instalación

```bash
pnpm add @eva_solutions/procesador-pagos-sdk
# o: npm install @eva_solutions/procesador-pagos-sdk
```

> Requiere Node 20+ o un runtime con `fetch`, `AbortSignal.any`, `AbortSignal.timeout` y `crypto.subtle`.

---

## ⚡ Quickstart

```typescript
import { crearCliente } from "@eva_solutions/procesador-pagos-sdk";

const cliente = crearCliente({
  apiKey: process.env.EVA_PAGOS_API_KEY!,
  baseUrl: process.env.EVA_PAGOS_BASE_URL!, // origin del servicio, ej. https://pagos.example.com
});

const resultado = await cliente.pagos.crearPago({
  monto: "150.00",
  moneda: "USD",
  tipo: "pago_unico",
  referenciaExterna: "orden-123",
});

if (!resultado.success) {
  console.error(`Error ${resultado.codigo}: ${resultado.error}`);
  return;
}

console.log("Pago creado:", resultado.data.pagoId);
```

`apiKey` y `baseUrl` son obligatorios. Si falta alguno o `baseUrl` no es válida, `crearCliente` lanza un `Error` síncrono al construirse (los mensajes nunca incluyen sus valores).

---

## 🔒 Seguridad del monto

El navegador no es de confianza: cualquier `monto` o `moneda` que llegue desde el frontend puede ser manipulado desde devtools. **Calcula el monto en tu servidor** desde tu base de datos (con un identificador confiable como `productoId`) antes de llamar a `crearPago`:

```typescript
const producto = await db.productos.findById(body.productoId);
if (!producto) return c.json({ error: "Producto no encontrado" }, 404);

const r = await cliente.pagos.crearPago({
  monto: (producto.precio / 100).toFixed(2),
  moneda: producto.moneda,
  tipo: "pago_unico",
  referenciaExterna: body.referenciaExterna,
});
```

Ver [docs/security.md](./docs/security.md) para el modelo de amenazas, el ejemplo INSEGURO vs SEGURO, la tabla de manipulaciones y el checklist pre-deploy.

---

## 🌐 `baseUrl`: qué se acepta

`baseUrl` es el **origin** del servicio y se valida una sola vez, al llamar a `crearCliente`. Se normaliza a `URL.origin` (por ejemplo, `https://pagos.example.com/` queda como `https://pagos.example.com`).

| Se acepta | Ejemplo |
| --- | --- |
| `https` con host y puerto opcional | `https://pagos.example.com`, `https://pagos.example.com:8443` |
| `http` solo en loopback | `http://localhost:6000`, `http://127.0.0.1:6000`, `http://[::1]:6000` |

| Se rechaza | Ejemplo |
| --- | --- |
| Ausente, vacía o no string | `undefined`, `""` |
| URL malformada | `not a url` |
| `http` fuera de loopback | `http://pagos.example.com` |
| Otros esquemas | `ftp://host` |
| Credenciales | `https://usuario:clave@host` |
| Path distinto de `/` | `https://host/v1` |
| Query (incluso `?` vacío) | `https://host?x=1` |
| Fragmento (incluso `#` vacío) | `https://host#f` |

Un path se rechaza en vez de ignorarse porque `new URL(path, base)` descarta en silencio el path de la base. Ningún mensaje de error repite el valor recibido. Detalle y razones en [ADR-022](./docs/decisions.md#adr-022--baseurl-en-runtime-solo-origin).

---

## 🔧 Configuración avanzada (opcional)

Además de `apiKey` y `baseUrl` (obligatorios), todo es opt-in. Si no especificas nada, el SDK usa defaults razonables.

```typescript
const ctrl = new AbortController();

const cliente = crearCliente({
  apiKey: process.env.EVA_PAGOS_API_KEY!,
  baseUrl: process.env.EVA_PAGOS_BASE_URL!,
  timeout: 15_000, // ms — default 10_000, rango 0..Number.MAX_SAFE_INTEGER
  headers: { "x-trace-id": "t-42" }, // headers extra (los internos ganan ante colisión)
  fetch: globalThis.fetch, // override para tests, custom retry layer, etc.
  signal: ctrl.signal, // signal global del cliente — cancela TODAS las ops en vuelo
});

// `ctrl.abort()` cancela cualquier request HTTP que el cliente esté ejecutando.
```

El prefijo del header `x-api-key` y el mapeo de errores HTTP **no son configurables** por diseño (ver ADR-006). La URL del servicio sí: se pasa como `baseUrl` (ver ADR-022).

---

## 🛠️ Operaciones disponibles

| Operación                                               | Descripción                                               |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `cliente.pagos.crearPago(input, options?)`              | Crea un nuevo pago. Retorna shape "creado" (10 campos).   |
| `cliente.pagos.consultarPago({ id, signal? })`          | Trae un pago por ID. Retorna shape "detalle" (22 campos). |
| `cliente.pagos.listarPagos(filtros?, options?)`         | Lista paginada (manual).                                  |
| `cliente.pagos.iterarPagos(filtros?, options?)`         | Async iterator que pagina automáticamente.                |
| `cliente.pagos.cancelarPago({ id, signal? })`           | Cancela pago en estado terminal-no.                       |
| `cliente.pagos.reembolsarPago({ id, monto?, signal? })` | Reembolso total (sin `monto`) o parcial.                  |

**Webhooks** (en subpath `/webhooks`):

| Función                                                      | Descripción                                 |
| ------------------------------------------------------------ | ------------------------------------------- |
| `verificarFirmaWebhook({ body, signature, secretKey })`      | Primitive síncrona de bajo nivel.           |
| `verificarWebhookDesdeRequest(request, secretKey, options?)` | Wrapper sobre `Request` con manejo de body. |

---

## 📚 Snippets validados (UX final)

### 1. Crear pago — caso simple

```typescript
const r = await cliente.pagos.crearPago({
  monto: "150.00",
  moneda: "USD",
  tipo: "pago_unico",
  referenciaExterna: "orden-42",
});

if (!r.success) {
  // r.codigo es number narrow: 400|401|403|404|409|413|422|429|500|502|503
  return res.status(r.codigo).json({ error: r.error });
}

console.log(r.data.pagoId, r.data.estado, r.data.paymentLink);
```

### 2. Crear pago — todos los campos

```typescript
const r = await cliente.pagos.crearPago({
  monto: "5000.00",
  moneda: "BOB",
  tipo: "suscripcion",
  referenciaExterna: "sub-2026-04-arturo",
  titular: { nombre: "Arturo Rodas", email: "arturo@daida.com" },
  descripcion: "Plan mensual",
  metadata: { plan: "pro", cycle: "monthly" },
  expiresAt: "2026-05-25T00:00:00Z",
});
```

### 3. Listar con paginación manual

```typescript
const r = await cliente.pagos.listarPagos({
  estado: "pendiente",
  page: 1,
  limit: 50,
});

if (!r.success) return;

for (const pago of r.data.data) {
  console.log(pago.id, pago.estado);
}
console.log(`Página ${r.data.pagination.page}/${r.data.pagination.totalPages}`);
```

### 4. Iterar todos los pagos pendientes (async iterator)

`iterarPagos` es la **única excepción** al Result Pattern: yields `PagoResumen` directo y lanza `Error` con `cause: Resultado` si la I/O falla. Patrón idiomático Stripe-node / AWS SDK v3 / Octokit (ver ADR-005).

```typescript
import type { Resultado } from "@eva_solutions/procesador-pagos-sdk";

try {
  for await (const pago of cliente.pagos.iterarPagos({ estado: "pendiente" })) {
    await procesar(pago);
  }
} catch (err) {
  if (err instanceof Error && err.cause && typeof err.cause === "object") {
    const causa = err.cause as Resultado<never> & { success: false };
    console.error(`Iter falló en página: ${causa.codigo} — ${causa.error}`);
  } else {
    throw err;
  }
}
```

### 5. Reembolso (total o parcial)

```typescript
// Total: omitir `monto` — el SDK envía body `{}` (NUNCA `{ monto: undefined }`).
await cliente.pagos.reembolsarPago({ id: "pago-123" });

// Parcial: monto formato `^(?:0|[1-9]\d{0,7})\.\d{2}$`.
await cliente.pagos.reembolsarPago({ id: "pago-123", monto: "50.00" });
```

### 6. Webhooks — Hono + Cloudflare Workers (idiomático C1)

En Hono `c.req.raw` ya pudo haber sido leído por middleware. Pasa el body explícito para evitar el `TypeError` de `request.text()` post-consumo.

```typescript
import { verificarWebhookDesdeRequest } from "@eva_solutions/procesador-pagos-sdk/webhooks";

app.post("/webhooks/pagos", async (c) => {
  const body = await c.req.text(); // primero leemos
  const r = await verificarWebhookDesdeRequest(
    c.req.raw,
    c.env.PAGOS_WEBHOOK_SECRET,
    { body }, // pasamos el body explícito (C1)
  );

  if (!r.success) {
    return c.json({ error: r.error }, r.codigo);
  }

  // r.data.payload es unknown — valida con tu propio Zod schema.
  await procesarPayload(r.data.payload);
  return c.json({ recibido: true });
});
```

### 7. Webhooks — framework-agnostic (request virgen)

Si tu framework NO consumió el body, omites `options.body` y el SDK llama `request.text()` por dentro:

```typescript
const r = await verificarWebhookDesdeRequest(request, process.env.SECRET!);

if (!r.success) {
  // 401 = firma/secret inválido. 422 = body ya consumido o no parseable JSON.
  return new Response(JSON.stringify({ error: r.error }), { status: r.codigo });
}
```

### 8. Webhooks — primitive de bajo nivel

```typescript
import { verificarFirmaWebhook } from "@eva_solutions/procesador-pagos-sdk/webhooks";

const r = await verificarFirmaWebhook({
  body: rawBody, // string | Uint8Array
  signature: "sha256=abcd...", // viene del header X-Signature
  secretKey: process.env.SECRET!,
});

// r.success === true | false. Sin throws.
```

---

## 📋 Result Pattern

Todas las operaciones (excepto `iterarPagos`) retornan `Resultado<T>`:

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

- `retryAfter` solo existe para `429` (si el header `Retry-After` viene como delta numérico en segundos o como `HTTP-date`; el SDK lo normaliza a segundos).

Helpers narrow:

```typescript
import { esExitoso, esFallido } from "@eva_solutions/procesador-pagos-sdk";

if (esExitoso(r)) {
  console.log(r.data);
} else if (esFallido(r) && r.codigo === 429) {
  await sleep((r.retryAfter ?? 5) * 1000);
}
```

---

## 🚫 Cancelación: triple AbortSignal

El SDK respeta tres niveles de cancelación combinados con `AbortSignal.any`:

1. **Cliente global** — `crearCliente({ signal })`.
2. **Por operación** — `cliente.pagos.crearPago(input, { signal })`.
3. **Timeout interno** — `AbortSignal.timeout(timeout)` (default 10_000 ms).

Cualquiera de los tres dispara abort. Si el aborto viene del consumidor (signals 1/2), el SDK retorna `Resultado.fallo(503)` con mensaje `Operación cancelada`. Si viene del timeout interno, retorna `Resultado.fallo(503)` con mensaje `Tiempo de espera agotado`.

```
Cliente global (signal en crearCliente)
    ↓
    └─→ AbortSignal.any([...])
    ├─→ Por operación (signal en crearPago, etc.)
    ├─→ Timeout interno (default 10s)
    ↓
  Resultado.fallo(503) — "Operación cancelada" o "Tiempo de espera agotado"
```

---

## 🔨 Desarrollo (contribuidores)

Requisitos: Node 20+ y pnpm `11.28.2` (declarado en `packageManager`).

```bash
pnpm install --frozen-lockfile
pnpm build         # tsdown: dist/ con ESM + CJS para "." y "./webhooks"
pnpm typecheck
pnpm lint
pnpm test:run
pnpm format        # oxfmt
pnpm changeset     # registra un cambio para el próximo release
```

El artefacto es el mismo para todos los entornos: no hay variables de entorno de build ni build por entorno.

> `pnpm-workspace.yaml` declara `allowBuilds: esbuild: true`. pnpm 11 no ejecuta los scripts de instalación de dependencias sin aprobación explícita y `pnpm install` falla con `ERR_PNPM_IGNORED_BUILDS`; esa entrada aprueba solo a `esbuild`.

> Si tu pnpm local no coincide con `packageManager`, usa `npx --yes pnpm@11.28.2 <comando> --config.pm-on-fail=ignore` (la bandera va después del subcomando).

---

## 🚀 Publicación (mantenedores)

Los releases salen de GitHub Actions con [Changesets](https://github.com/changesets/changesets): cada cambio publicable lleva un archivo en `.changeset/`; `development` publica un snapshot con el tag `dev` y, al llegar a `main`, el workflow `release.yml` abre un "Version PR" (sube versión y CHANGELOG, no publica) y la publicación estable sale al crear una GitHub Release `vX.Y.Z` desde `main`, con provenance.

`[AUTH]` marca una acción externa o irreversible (push, PR, merge, secretos, publicación en npm): requiere autorización explícita del mantenedor **para esa acción**; no se encadenan ni se automatizan.

### Tres entornos

El SDK sigue el modelo del ecosistema: local, development y production. Nada se commitea con `file:` ni con un tarball; los consumidores instalan desde npm.

| Entorno     | Rama          | Se publica como                                  | Instalación                                                                                                           |
| ----------- | ------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| local       | cualquiera    | no se publica (link)                             | `pnpm link`, abajo                                                                                                    |
| development | `development` | snapshot `X.Y.Z-dev-<timestamp>`, dist-tag `dev` | `npm i @eva_solutions/procesador-pagos-sdk@dev`, o fija la versión exacta del snapshot (`...@0.3.0-dev-<timestamp>`) |
| production  | `main`        | estable `X.Y.Z`, dist-tag `latest`               | `npm i @eva_solutions/procesador-pagos-sdk`                                                                           |

El `X.Y.Z` del snapshot es la versión que producirán los changesets pendientes (`snapshot.useCalculatedVersion` en `.changeset/config.json`). El tag `@dev` se mueve con cada snapshot; quien necesite instalaciones reproducibles fija la versión exacta. Un push a `development` sin changesets pendientes no publica nada (el snapshot solo sale si `changeset version --snapshot dev` cambia el `package.json`). Los changesets siguen en `development` hasta que el Version PR se mergea en `main` y `main` vuelve a `development` (back-merge, ver el flujo); mientras tanto cada push a `development` publica un snapshot nuevo con el mismo `X.Y.Z`.

Link en local:

```bash
pnpm build                          # raíz del repo
pnpm link --global
cd <consumidor> && pnpm link --global @eva_solutions/procesador-pagos-sdk
```

Vuelve a correr `pnpm build` tras cada cambio del SDK. Deshaz el link en el consumidor con `pnpm unlink @eva_solutions/procesador-pagos-sdk` y `pnpm install`. No commitees el link en el `package.json` del consumidor.

Flujo de ramas: crea tu rama desde `development` y abre el PR contra `development`; una vez validado el snapshot, `development` pasa a `main` con otro PR.

### Flujo normal

1. `pnpm changeset` y commitea el archivo generado junto con el cambio.
2. Merge del PR a `development` `[AUTH]`: en `release.yml`, el job `checks` (lint, typecheck, test, build) y luego el job `snapshot` publican `X.Y.Z-dev-<timestamp>` con el tag `dev` (sin tags de git ni commits; con los checks en rojo no se publica). Valida el snapshot y mergea `development` en `main` `[AUTH]`: el job `version-pr` abre (o actualiza) el Version PR.
3. Revisa el Version PR y mergéalo `[AUTH]`: sube la versión y el CHANGELOG en `main`, pero no publica.
4. Crea la GitHub Release `vX.Y.Z` desde `main` `[AUTH]` (no prerelease; `X.Y.Z` = versión de `package.json`): el job `publish` corre primero los `checks` sobre el commit del tag (no hace falta esperar al CI), valida que el tag sea `v<versión>` y que su commit esté en `main` (si no, falla sin publicar) y publica con dist-tag `latest`. Las prereleases se ignoran.
5. **Back-merge** `[AUTH]`: abre un PR `main` → `development` (Version PR y CHANGELOG incluidos). Sin él, `development` conserva los changesets ya liberados y publica snapshots de una versión que ya salió.
6. Verifica: `npm view @eva_solutions/procesador-pagos-sdk dist-tags`.

Casos a conocer:

- Una prerelease promovida a release no dispara `published`: crea una Release nueva (no prerelease).
- Una Release de una versión que ya existe en npm termina sin publicar (`changeset publish` omite lo ya publicado) y el job no falla.

> **Los Version PR no disparan CI.** Los PR abiertos con el `GITHUB_TOKEN` del workflow no inician otros workflows. Por eso `main` no debe exigir status checks obligatorios; si quieres CI sobre un Version PR, ciérralo y reábrelo.

### Environment `npm` (publicación protegida)

Los jobs `snapshot` y `publish` declaran `environment: npm`, que limita desde qué refs se puede publicar (segunda capa, además de las condiciones del workflow). Créalo una vez `[AUTH]`:

```bash
gh api -X PUT repos/eva-solutions-org/procesador-pagos-sdk/environments/npm   -F 'deployment_branch_policy[protected_branches]=false'   -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/eva-solutions-org/procesador-pagos-sdk/environments/npm/deployment-branch-policies -f name=development -f type=branch
gh api -X POST repos/eva-solutions-org/procesador-pagos-sdk/environments/npm/deployment-branch-policies -f name='v*' -f type=tag
```

Verifica con `gh api repos/eva-solutions-org/procesador-pagos-sdk/environments/npm/deployment-branch-policies`. La rama `development` cubre el snapshot y el tag `v*` cubre la Release. El trusted publisher de npm se configura con Environment `npm`, y `NPM_TOKEN`, mientras exista, va como secreto del Environment, no del repo.

**Los repos de SDK deben ser PÚBLICOS.** En GitHub Free, las reglas de rama y tag de un Environment (deployment branch policy) y los rulesets solo se aplican en repos públicos; en uno privado no restringen nada.

**Riesgo residual.** Aun con el Environment, quien tenga permiso de escritura puede crear un tag `v*` sobre otro commit y esa ref pasa la política del Environment. El cierre recomendado es un tag ruleset (gratuito en repos públicos) que restrinja la creación de `v*` a admins `[AUTH]`:

```bash
gh api -X POST repos/eva-solutions-org/procesador-pagos-sdk/rulesets --input - <<'JSON'
{
  "name": "protect-release-tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [{ "type": "creation" }],
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }]
}
JSON
```

`actor_id: 5` es el rol de repositorio Admin. Verifica con `gh api repos/eva-solutions-org/procesador-pagos-sdk/rulesets` (`target: tag`, `enforcement: active`).

### Primera publicación (una sola vez)

> **Primera publicación desde `development`.** El job `snapshot` también usa `NPM_TOKEN` si existe (si no, OIDC), así que la primera publicación puede salir de `development` una vez creado el secreto. El paquete nace entonces con una versión `X.Y.Z-dev-<timestamp>` y el tag `dev`. No está verificado si el registro asigna `latest` a esa primera versión: comprueba `npm view @eva_solutions/procesador-pagos-sdk dist-tags` tras el primer snapshot. Si `latest` apunta a un `-dev-`, el paso `Ensure latest is not a snapshot` intenta quitarlo con `npm dist-tag rm` (con el token si existe; con OIDC solo si npm >= 11.21.0 y el trusted publisher tiene "Allow npm dist-tag"). Si falla deja un warning sin poner el job en rojo, y lo quitas a mano con `npm dist-tag rm @eva_solutions/procesador-pagos-sdk latest`.

Condiciones previas, `[AUTH]` cada una:

1. Ser miembro/owner del scope npm `eva_solutions` (`npm org ls eva_solutions`).
2. Crear el repo público **vacío** `eva-solutions-org/procesador-pagos-sdk` (sin README, licencia ni `.gitignore`) y habilitar, en la organización y luego en el repo, "Allow GitHub Actions to create and approve pull requests" (la organización puede bloquear la casilla del repo).
3. No configurar status checks obligatorios sobre `main` (los Version PR no disparan CI). El único ruleset previsto es el de tags `v*` descrito en [Environment `npm`](#environment-npm-publicación-protegida); no restringe `main`.
4. Publicar `main` con un único commit raíz: `git push -u origin main`; comprueba que `git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"` devuelve `origin/main` y que `git rev-list --count origin/main` es `1`. Luego publica `development` con `git push -u origin development` (misma comprobación de upstream).
5. Antes de mergear el Version PR, el CI de `ci.yml` disparado por ese push debe estar en verde.

Publicación inicial con token (el paquete aún no existe, así que no se puede configurar trusted publishing):

1. Crea en npmjs.com un token granular: expiración 7 días, lectura y escritura sobre el scope `eva_solutions`, con "Bypass 2FA" `[AUTH]`.
2. Guárdalo como secreto `NPM_TOKEN` del Environment `npm` (no del repo) desde la UI de GitHub o con `gh secret set NPM_TOKEN --env npm --repo eva-solutions-org/procesador-pagos-sdk` y el valor escrito en el prompt interactivo `[AUTH]`. Nunca en argumentos, archivos, logs ni chats.
3. Mergea el Version PR (`0.3.0`) `[AUTH]`, crea la GitHub Release `v0.3.0` desde `main` `[AUTH]` y confirma `npm view @eva_solutions/procesador-pagos-sdk@0.3.0 version`.

### Cambio a trusted publishing (dentro de los 2 días siguientes)

1. En npmjs.com, configura el trusted publisher del paquete `[AUTH]`: organización `eva-solutions-org`, repo `procesador-pagos-sdk`, workflow `release.yml`, Environment `npm`.
2. Abre un PR `[AUTH]` que quita de `release.yml` el paso `Configure bootstrap token (only if the secret exists)` (en `snapshot` y en `publish`), las líneas `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}` de los pasos de publicación y de `Ensure latest is not a snapshot`, y sus comentarios `Bootstrap only`, con un changeset `patch`. Mergéalo `[AUTH]`, mergea el Version PR resultante (`0.3.1`) `[AUTH]` y crea la Release `v0.3.1` `[AUTH]`.
3. Comprueba que el paso de publicación del job `publish` no usa token (el log de `changeset publish` muestra la publicación sin errores de autenticación), que `npm view @eva_solutions/procesador-pagos-sdk@0.3.1 version` devuelve `0.3.1` y que npmjs.com muestra provenance en `0.3.1`. Si falla, **no** revoques el token todavía.
4. Solo tras esa verificación: revoca el token en npm y borra el secreto `NPM_TOKEN` `[AUTH]`.

Si la confianza caduca o falla: borra y vuelve a crear la configuración del trusted publisher `[AUTH]` y publica por OIDC con otro PR `patch`; no hace falta un token porque el paquete ya existe.

Referencias: `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `.changeset/config.json`.

---

## 📖 Documentación

| Documento               | Contenido                                                               |
| ----------------------- | ----------------------------------------------------------------------- |
| `docs/architecture.md`  | Capas, flujo HTTP, flujo webhook (mermaid).                             |
| `docs/api.md`           | Referencia completa de la API pública.                                  |
| `docs/configuration.md` | Setup consumidor (`baseUrl`) y contribuidor, runtimes.                  |
| `docs/conventions.md`   | Naming, paradigma funcional, Result Pattern, imports.                   |
| `docs/decisions.md`     | 23 ADRs (ADR-001 a ADR-023); ADR-022 y ADR-023 definen la forma actual. |
| `docs/security.md`      | Modelo de amenazas, política `apiKey nunca en error`, HMAC fail-closed. |
| `CHANGELOG.md`          | SemVer + Conventional Commits.                                          |

---

## 📄 Licencia

MIT © EVA Solutions. Ver [`LICENSE`](./LICENSE).
