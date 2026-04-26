# @eva/procesador-pagos-sdk

SDK TypeScript para consumir el servicio Procesador-de-pagos. Diseñado para ser **extremadamente simple por defecto** con control avanzado opcional.

- Runtime targets: Node 18+, Cloudflare Workers (con `nodejs_compat`), Vercel Edge Runtime.
- **No browser** (la `apiKey` es secreta).
- Result Pattern como contrato — nunca lanza para errores de negocio.
- URL del servicio horneada en build-time (no se configura en runtime).
- Verificación de webhooks salientes con HMAC-SHA256 timing-safe.
- Sin dependencias en runtime más allá de `zod`.

Versión actual: `0.1.0` (initial release).
Servicio testeado contra commit: `380874771a21b56bd42f1db23c60627c62209327`.

---

## Instalación

```bash
pnpm add @eva/procesador-pagos-sdk
```

> Requiere Node 18+ o un runtime con `fetch`, `AbortSignal.any`, `AbortSignal.timeout`, y `crypto.subtle`.

---

## Quickstart (zero-config)

```typescript
import { crearCliente } from '@eva/procesador-pagos-sdk';

const cliente = crearCliente({ apiKey: process.env.EVA_PAGOS_API_KEY! });

const resultado = await cliente.pagos.crearPago({
  monto: '150.00',
  moneda: 'USD',
  tipo: 'pago_unico',
  referenciaExterna: 'orden-123',
});

if (!resultado.success) {
  console.error(`Error ${resultado.codigo}: ${resultado.error}`);
  return;
}

console.log('Pago creado:', resultado.data.pagoId);
```

---

## Configuración avanzada (opcional)

Todo es opt-in. Si no especificás nada, el SDK usa defaults razonables.

```typescript
const ctrl = new AbortController();

const cliente = crearCliente({
  apiKey: process.env.EVA_PAGOS_API_KEY!,
  timeout: 15_000,                    // ms — default 10_000
  headers: { 'x-trace-id': 't-42' },  // headers extra (los internos ganan ante colisión)
  fetch: globalThis.fetch,            // override para tests, custom retry layer, etc.
  signal: ctrl.signal,                // signal global del cliente — cancela TODAS las ops en vuelo
});

// `ctrl.abort()` cancela cualquier request HTTP que el cliente esté ejecutando.
```

URL base, prefijo `x-api-key`, mapeo de errores HTTP — **no son configurables** por diseño (ver ADR-001 / ADR-006).

---

## Operaciones disponibles

| Operación | Descripción |
|---|---|
| `cliente.pagos.crearPago(input, options?)` | Crea un nuevo pago. Retorna shape "creado" (10 campos). |
| `cliente.pagos.consultarPago({ id, signal? })` | Trae un pago por ID. Retorna shape "detalle" (22 campos). |
| `cliente.pagos.listarPagos(filtros?, options?)` | Lista paginada (manual). |
| `cliente.pagos.iterarPagos(filtros?, options?)` | Async iterator que pagina automáticamente. |
| `cliente.pagos.cancelarPago({ id, signal? })` | Cancela pago en estado terminal-no. |
| `cliente.pagos.reembolsarPago({ id, monto?, signal? })` | Reembolso total (sin `monto`) o parcial. |

Helpers para webhooks (en subpath `/webhooks`):

| Función | Descripción |
|---|---|
| `verificarFirmaWebhook({ body, signature, secretKey })` | Primitive síncrona de bajo nivel. |
| `verificarWebhookDesdeRequest(request, secretKey, options?)` | Wrapper sobre `Request` con manejo de body. |

---

## Snippets validados (UX final)

### 1. Crear pago — caso simple

```typescript
const r = await cliente.pagos.crearPago({
  monto: '150.00',
  moneda: 'USD',
  tipo: 'pago_unico',
  referenciaExterna: 'orden-42',
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
  monto: '5000.00',
  moneda: 'BOB',
  tipo: 'suscripcion',
  referenciaExterna: 'sub-2026-04-arturo',
  titular: { nombre: 'Arturo Rodas', email: 'arturo@daida.com' },
  descripcion: 'Plan mensual',
  metadata: { plan: 'pro', cycle: 'monthly' },
  expiresAt: '2026-05-25T00:00:00Z',
});
```

### 3. Listar con paginación manual

```typescript
const r = await cliente.pagos.listarPagos({
  estado: 'pendiente',
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

`iterarPagos` es la **única excepción** al Result Pattern: yields `Pago` directo y lanza `Error` con `cause: Resultado` si la I/O falla. Patrón idiomático Stripe-node / AWS SDK v3 / Octokit (ver ADR-005).

```typescript
import type { Resultado } from '@eva/procesador-pagos-sdk';

try {
  for await (const pago of cliente.pagos.iterarPagos({ estado: 'pendiente' })) {
    await procesar(pago);
  }
} catch (err) {
  if (err instanceof Error && err.cause && typeof err.cause === 'object') {
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
await cliente.pagos.reembolsarPago({ id: 'pago-123' });

// Parcial: monto formato `^(?:0|[1-9]\d{0,7})\.\d{2}$`.
await cliente.pagos.reembolsarPago({ id: 'pago-123', monto: '50.00' });
```

### 6. Webhooks — Hono + Cloudflare Workers (idiomático C1)

En Hono `c.req.raw` ya pudo haber sido leído por middleware. Pasá el body explícito para evitar el `TypeError` de `request.text()` post-consumo.

```typescript
import { verificarWebhookDesdeRequest } from '@eva/procesador-pagos-sdk/webhooks';

app.post('/webhooks/pagos', async (c) => {
  const body = await c.req.text(); // primero leemos
  const r = await verificarWebhookDesdeRequest(
    c.req.raw,
    c.env.PAGOS_WEBHOOK_SECRET,
    { body },                       // pasamos el body explícito (C1)
  );

  if (!r.success) {
    return c.json({ error: r.error }, r.codigo);
  }

  // r.data.payload es unknown — validá con tu propio Zod schema.
  await procesarPayload(r.data.payload);
  return c.json({ recibido: true });
});
```

### 7. Webhooks — framework-agnostic (request virgen)

Si tu framework NO consumió el body, omitís `options.body` y el SDK llama `request.text()` por dentro:

```typescript
const r = await verificarWebhookDesdeRequest(request, process.env.SECRET!);

if (!r.success) {
  // 401 = firma/secret inválido. 422 = body ya consumido o no parseable JSON.
  return new Response(JSON.stringify({ error: r.error }), { status: r.codigo });
}
```

### 8. Webhooks — primitive de bajo nivel

```typescript
import { verificarFirmaWebhook } from '@eva/procesador-pagos-sdk/webhooks';

const r = await verificarFirmaWebhook({
  body: rawBody,                 // string | Uint8Array
  signature: 'sha256=abcd...',   // viene del header X-Signature
  secretKey: process.env.SECRET!,
});

// r.success === true | false. Sin throws.
```

---

## Result Pattern

Todas las operaciones (excepto `iterarPagos`) retornan `Resultado<T>`:

```typescript
type Resultado<T> =
  | { success: true; data: T }
  | { success: false; error: string; codigo: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 500 | 502 | 503 }
  | { success: false; error: string; codigo: 429; retryAfter?: number };
```

- `codigo` es un union cerrado: `400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503`.
- `retryAfter` solo existe para `429` (si el header `Retry-After` viene numérico — segundos).
- TypeScript strict prohíbe acceder a `r.data` antes de chequear `r.success`. Idiomático: `if (!r.success) return …`.

Helpers narrow:

```typescript
import { esExitoso, esFallido } from '@eva/procesador-pagos-sdk';

if (esExitoso(r)) {
  console.log(r.data);
} else if (esFallido(r) && r.codigo === 429) {
  await sleep((r.retryAfter ?? 5) * 1000);
}
```

---

## Cancelación: triple AbortSignal

El SDK respeta tres niveles de cancelación combinados con `AbortSignal.any`:

1. **Cliente global** — `crearCliente({ signal })`.
2. **Por operación** — `cliente.pagos.crearPago(input, { signal })`.
3. **Timeout interno** — `AbortSignal.timeout(timeout)` (default 10_000 ms).

Cualquiera de los tres dispara abort. Si el aborto viene del consumidor (signals 1/2), el `AbortError` se re-lanza al consumidor. Si viene del timeout interno, retorna `Resultado.fallo(503)`.

---

## Configuración de build (contribuidores)

Variables de entorno **al construir el SDK** (no al consumirlo):

| Variable | Valores | Default |
|---|---|---|
| `EVA_PAGOS_BUILD_ENV` | `local`, `development`, `production` | `local` (con warn) |

Scripts:

```bash
pnpm install
pnpm build:local      # __SDK_API_URL__ = http://localhost:8787
pnpm build:dev        # __SDK_API_URL__ = https://procesador-de-pagos-dev.workers.dev (placeholder)
pnpm build:prod       # __SDK_API_URL__ = https://procesador-de-pagos.workers.dev   (placeholder)
pnpm typecheck
pnpm test:run
pnpm lint
pnpm pack:local
```

> Las URLs de `dev` y `prod` son **placeholders** hasta que el equipo de plataforma confirme las definitivas. Ver `docs/configuration.md`.

Defensa runtime (ADR-007 / C5): si el bundle final apunta a `localhost` pero `__SDK_BUILD_ENV__` no es `'local'`, el módulo **lanza síncronicamente al cargar**. Es la última línea contra publicar un build mismatch.

---

## Documentación

| Documento | Contenido |
|---|---|
| `docs/architecture.md` | Capas, flujo HTTP, flujo webhook (mermaid). |
| `docs/api.md` | Referencia completa de la API pública. |
| `docs/configuration.md` | Setup consumidor + contribuidor, build-per-env. |
| `docs/conventions.md` | Naming, paradigma funcional, Result Pattern, imports. |
| `docs/decisions.md` | 8 ADRs (ADR-001 a ADR-008). |
| `docs/security.md` | Modelo de amenazas, política `apiKey nunca en error`, HMAC fail-closed. |
| `CHANGELOG.md` | SemVer + Conventional Commits. |

---

## Licencia

Ver [`LICENSE`](./LICENSE).
