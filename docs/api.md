# Referencia de API — `@eva/procesador-pagos-sdk`

> **Versión del servicio testeada**: commit `380874771a21b56bd42f1db23c60627c62209327` del repo `Procesador-de-pagos`.
>
> Path canonical citado: `D:\GitHub\Proyecto Global\Pagos Service\Procesador-de-pagos\src\routes\v1-router.ts`.

Esta es la referencia completa de la API pública del SDK. Para el quickstart, ver `README.md`. Para la arquitectura interna, ver `docs/architecture.md`.

---

## 1. Cliente

### `crearCliente(opciones): ClienteProcesadorPagos`

Factory funcional que retorna un cliente con namespace agrupado.

```typescript
function crearCliente(opciones: OpcionesCliente): ClienteProcesadorPagos;

interface OpcionesCliente {
  apiKey: string;                                    // requerido, no vacío
  timeout?: number;                                  // ms — default 10_000
  headers?: Record<string, string>;                  // headers extra (los internos ganan ante colisión)
  fetch?: typeof globalThis.fetch;                   // override (para tests, retry-layer custom, etc.)
  signal?: AbortSignal;                              // signal global del cliente — cancela TODAS las ops
}

interface ClienteProcesadorPagos {
  pagos: PagosFacade;
}
```

**Errores síncronos** (lanzados al llamar):

- `apiKey` no string o vacío → `throw new Error('apiKey requerida (string no vacío)')`. NUNCA incluye el valor de la apiKey.

**Alias**: `createClienteProcesadorPagos` es exactamente `crearCliente` (mismo binding).

---

## 2. Pagos

### 2.1 `cliente.pagos.crearPago(input, options?): Promise<Resultado<CrearPagoResponse>>`

POST `/api/v1/pagos`. Crea un nuevo pago.

```typescript
interface CrearPagoInput {
  monto: string;                                     // regex /^(?:0|[1-9]\d{0,7})\.\d{2}$/
  moneda: string;                                    // length 3, será uppercase ('usd' → 'USD')
  tipo: 'pago_unico' | 'suscripcion' | 'recurrente';
  referenciaExterna: string;
  titular?: { nombre: string; email: string };
  descripcion?: string;
  metadata?: Record<string, unknown>;                // SDK NO valida tamaño 8KB (C6) — el servicio responde 413
  expiresAt?: string;                                // ISO 8601
}
```

**Response shape (10 campos — `crearPagoResponseSchema`)**:

```typescript
interface CrearPagoResponse {
  pagoId: string;
  intentId?: string;
  paymentLink?: string;
  qrCodeUrl?: string;
  qrCodeEmv?: string;
  estado: EstadoPago;
  pasarela: string;
  montoOriginal: string;
  monedaOriginal: string;
  expiresAt: string | null;
}
```

> **DISTINTO de `pagoDetalleSchema` (22 campos)**. Ver §6.

**Errores posibles**:

| `codigo` | Causa |
|---|---|
| `400` | Validación local Zod fail (monto/moneda/tipo). |
| `401` | apiKey inválida. |
| `409` | `referenciaExterna` duplicada (servicio). |
| `413` | `metadata` > 8KB (servicio — SDK no valida local, C6). |
| `422` | Servicio rechazó por reglas de negocio. |
| `429` | Rate limit. `retryAfter?: number` parseado del header. |
| `503` | Network down / timeout / aborted. |

### 2.2 `cliente.pagos.consultarPago({ id, signal? }): Promise<Resultado<PagoDetalle>>`

GET `/api/v1/pagos/{id}` (con `encodeURIComponent` del `id`).

**Response shape (22 campos — `pagoDetalleSchema`)**:

```typescript
interface PagoDetalle {
  id: string;
  proyectoId: string;
  pasarelaId: string;
  referenciaExterna: string;
  tipo: TipoPago;
  montoOriginal: string;
  monedaOriginal: string;
  estado: EstadoPago;
  pasarelaPaymentId: string | null;
  pasarelaStatus: string | null;
  paymentLink: string | null;
  qrCodeUrl: string | null;
  qrCodeEmv: string | null;
  intentId: string | null;
  metodoPago: MetodoPago | null;                     // 'transfer' | 'qr'
  errorMensaje: string | null;
  webhookRecibido: boolean;
  callbackEnviado: boolean;
  metadata: Record<string, unknown> | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Tipo alias**: `Pago = PagoDetalle` (UX-7).

**Errores**: `400` (id vacío local), `404`, `401`, `429`, `503`.

### 2.3 `cliente.pagos.listarPagos(filtros?, options?): Promise<Resultado<ListarPagosResponse>>`

GET `/api/v1/pagos` con query string.

```typescript
interface FiltrarPagoInput {
  estado?: EstadoPago;
  tipo?: TipoPago;
  referenciaExterna?: string;
  page?: number;       // default 1
  limit?: number;      // default 20, max 100
}

interface ListarPagosResponse {
  data: PagoResumen[];                               // 10 campos (NO 22)
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**Validación local**: `limit > 100` → `400` sin tocar red. `estado` fuera del enum → `400`.

### 2.4 `cliente.pagos.iterarPagos(filtros?, options?): AsyncGenerator<Pago, void, unknown>`

Async iterator que pagina automáticamente. **Única excepción al Result Pattern** (ADR-005).

```typescript
function iterarPagos(
  filtros?: FiltrarPagoInput,
  options?: { signal?: AbortSignal },
): AsyncGenerator<Pago, void, unknown>;
```

**Comportamiento**:

- Yields `Pago` directo (NO `Resultado<Pago>`).
- On I/O failure: `throw new Error(r.error, { cause: r })` donde `r` es `Resultado<never>` con `codigo + error`.
- Default `limit = 100` (NO 20 — I6).
- `limit > 100` o `< 1` → throw síncrono al primer `.next()`.
- Propaga `options.signal` al fetch interno (no chequeo manual de `signal.aborted` entre páginas).
- Loop interno envuelto en `try { ... } finally { ... }` para cleanup observable on `break`.

**Idiomático Stripe-node / AWS SDK v3 / Octokit**.

```typescript
import type { Resultado } from '@eva/procesador-pagos-sdk';

try {
  for await (const pago of cliente.pagos.iterarPagos({ estado: 'pendiente' })) {
    await procesar(pago);
  }
} catch (err) {
  if (err instanceof Error && err.cause) {
    const causa = err.cause as Resultado<never> & { success: false };
    console.error(`Iter falló: codigo=${causa.codigo} error=${causa.error}`);
  }
}
```

### 2.5 `cliente.pagos.cancelarPago({ id, signal? }): Promise<Resultado<PagoCanceladoResponse>>`

POST `/api/v1/pagos/{id}/cancelar` (sin body).

```typescript
interface PagoCanceladoResponse {
  pagoId: string;
  estado: EstadoPago;
}
```

**Errores**: `400` (id vacío), `404`, `422` (estado terminal — no se puede cancelar).

### 2.6 `cliente.pagos.reembolsarPago({ id, monto?, signal? }): Promise<Resultado<PagoReembolsadoResponse>>`

POST `/api/v1/pagos/{id}/reembolsar` con body **siempre** JSON.

```typescript
interface PagoReembolsadoResponse {
  pagoId: string;
  estado: EstadoPago;
  mensaje?: string;
}
```

**A2 (decisión cerrada)**: el body **siempre** es JSON parseable.

- Sin `monto` → body `{}` (NO `{ monto: undefined }`).
- Con `monto` → body `{ monto: '50.00' }`.
- Header `Content-Type: application/json` siempre.

**Errores**: `400` (id vacío o monto malformado local), `404`, `422` (saldo excedido).

---

## 3. Webhooks

> Subpath dedicado: `import … from '@eva/procesador-pagos-sdk/webhooks'`.

### 3.1 `verificarFirmaWebhook(input): Promise<Resultado<true>>`

Primitive síncrona (con `await` por `crypto.subtle.sign`).

```typescript
function verificarFirmaWebhook(input: {
  body: string | Uint8Array;
  signature: string;        // formato 'sha256=<hex64>'
  secretKey: string;
}): Promise<Resultado<true>>;
```

**Errores** (todos `codigo: 401`):

| Caso | `error` |
|---|---|
| `secretKey` vacía o no string | `'secretKey ausente o vacía'` |
| `signature` no matchea `/^sha256=[a-f0-9]{64}$/` (case-sensitive — I4) | `'Formato de firma inválido'` |
| HMAC computado distinto al recibido | `'Firma inválida'` |

> **I4 — Regex case-sensitive**: rechaza `Sha256=...`, `SHA256=...`, `sha256=ABCD...`. El servicio firma con prefijo lowercase + hex lowercase (verificado en `enviar-callback-service.ts:259` + `bytesToHex` → `hmac.ts`).

### 3.2 `verificarWebhookDesdeRequest(request, secretKey, options?): Promise<Resultado<{ payload: unknown }>>`

Wrapper sobre `Request` con manejo de body explícito (C1).

```typescript
function verificarWebhookDesdeRequest(
  request: Request,
  secretKey: string,
  options?: { body?: string | Uint8Array },
): Promise<Resultado<{ payload: unknown }>>;
```

**Comportamiento**:

1. `request.headers.get('X-Signature')` (case-insensitive en NOMBRE del header — `Headers.get` nativo).
2. Header ausente → `401 'Header X-Signature ausente'`.
3. **C1** — `options.body` PRESENTE → usar tal cual (string o Uint8Array). NO llamar `request.text()`.
4. **C1** — `options.body` AUSENTE → `await request.text()`. Si lanza `TypeError` (body ya consumido por middleware) → `422 'Body ya consumido o no legible'`.
5. Verifica firma con `verificarFirmaWebhook`. Falla → propaga `401`.
6. `JSON.parse(body)` post-firma-OK. Falla → `422 'Body no es JSON válido'`.
7. Éxito → `{ success: true, data: { payload } }` con `payload: unknown` (validá con tu propio Zod).

**Idiomático Hono+CF Workers**: pasá `options.body` después de leer `c.req.text()`.

---

## 4. Result Pattern

### 4.1 Tipo `Resultado<T>`

```typescript
type CodigoErrorHttp = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503;

type Resultado<T> =
  | { success: true; data: T }
  | { success: false; error: string; codigo: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 500 | 502 | 503 }
  | { success: false; error: string; codigo: 429; retryAfter?: number };
```

### 4.2 Helpers narrow

```typescript
function esExitoso<T>(r: Resultado<T>): r is { success: true; data: T };
function esFallido<T>(r: Resultado<T>): r is Extract<Resultado<T>, { success: false }>;
```

Patrón recomendado (TS strict):

```typescript
if (!r.success) {
  return res.status(r.codigo).json({ error: r.error });
}
// Acá r.data es T
```

---

## 5. Cuadro de errores HTTP del cliente

Mapeo del status code del servicio al `Resultado.fallo()` que retorna el SDK.

| Status servicio | `codigo` SDK | Causa típica | Notas |
|---:|---:|---|---|
| 400 | 400 | Validación Zod local (monto, moneda, limit > 100) | **Sin tocar red**. |
| 400 | 400 | id vacío en consultarPago/cancelar/reembolsar | Pre-check local. |
| 401 | 401 | apiKey inválida/expirada | |
| 403 | 403 | apiKey sin scope para la op | |
| 404 | 404 | Pago no existe | |
| 409 | 409 | `referenciaExterna` duplicada | crearPago. |
| 413 | 413 | Body request excede límite del servicio (e.g. metadata > 8KB) | C6: SDK NO valida local. |
| 422 | 422 | Reglas de negocio (estado terminal en cancel, saldo excedido en refund, etc.) | |
| 429 | 429 + `retryAfter?` | Rate limit | I2: parseado del header `Retry-After` (numérico). |
| 500 | 500 | Servicio crasheó | |
| 502 | 502 | JSON inválido del servicio | El SDK no pudo parsear. |
| 502 | 502 | Schema Zod fail al safeParse del response | El SDK no pudo validar. |
| 502 | 502 | Status fuera del union (e.g. 418) | "Status HTTP inesperado: 418". |
| 503 | 503 | Network error (TCP reset, DNS fail) | |
| 503 | 503 | Timeout interno (`AbortSignal.timeout`) | |
| 503 | 503 | Abort externo (cliente o op signal) | El `AbortError` se re-lanza al consumidor; NO retorna Resultado. |

Casos webhooks adicionales:

| Caso | `codigo` |
|---:|---:|
| Header `X-Signature` ausente | 401 |
| `secretKey` vacía o no string | 401 |
| Firma formato inválido (regex fail) | 401 |
| Firma no matchea HMAC computado | 401 |
| `request.text()` lanza `TypeError` (body consumido) | 422 |
| `JSON.parse(body)` post-firma-OK falla | 422 |

---

## 6. Schemas de pagos: 10 vs 22 campos

El servicio retorna **dos shapes distintos** según el endpoint:

| Schema | Endpoint | Campos | Uso |
|---|---|---:|---|
| `crearPagoResponseSchema` | POST `/api/v1/pagos` | 10 | `crearPago` retorna esto. |
| `pagoDetalleSchema` | GET `/api/v1/pagos/{id}` | 22 | `consultarPago` retorna esto. |
| `pagoResumenSchema` | GET `/api/v1/pagos` (lista) | 10 | `listarPagos` items. |

### Comparación side-by-side

```
crearPagoResponseSchema (10 — verificado en pago-response-schemas.ts)
├── pagoId
├── intentId?
├── paymentLink?
├── qrCodeUrl?
├── qrCodeEmv?
├── estado
├── pasarela
├── montoOriginal
├── monedaOriginal
└── expiresAt: nullable

pagoDetalleSchema (22 — verificado contra pagoDetalleResponseSchema)
├── id
├── proyectoId             # NO en crear
├── pasarelaId             # NO en crear
├── referenciaExterna      # NO en crear
├── tipo                   # NO en crear
├── montoOriginal
├── monedaOriginal
├── estado
├── pasarelaPaymentId      # nullable, NO en crear
├── pasarelaStatus         # nullable, NO en crear
├── paymentLink            # nullable
├── qrCodeUrl              # nullable
├── qrCodeEmv              # nullable
├── intentId               # nullable
├── metodoPago             # nullable, 'transfer' | 'qr'
├── errorMensaje           # nullable
├── webhookRecibido        # boolean
├── callbackEnviado        # boolean
├── metadata               # nullable
├── expiresAt              # nullable
├── createdAt              # ISO 8601
└── updatedAt              # ISO 8601
```

**Por qué dos shapes**: el response de `crearPago` no tiene timestamps ni metadata expandida (el pago recién se creó, no tiene historia). `consultarPago` retorna el snapshot completo.

---

## 7. Estados de pago

Constante `ESTADOS_PAGO` (9 valores, 1:1 con servicio):

```typescript
const ESTADOS_PAGO = [
  'pendiente',
  'procesando',
  'completado',
  'fallido',
  'cancelado',
  'reembolsado',
  'reembolso_parcial',
  'expirado',
  'requiere_accion',
] as const;

type EstadoPago = typeof ESTADOS_PAGO[number];
```

### Máquina de transiciones (canónica del servicio)

```
                    ┌───────────────────────┐
                    │      pendiente        │
                    └──────┬─────┬─────┬────┘
                           │     │     │
                    ┌──────▼──┐  │  ┌──▼─────────┐
                    │procesando│  │  │  expirado  │  (TTL automático)
                    └──┬───┬──┬┘  │  └────────────┘
                       │   │  │   │
            ┌──────────▼┐  │  │   │   ┌───────────┐
            │ completado │  │  │   └──▶│ cancelado │ (acción manual)
            └─────┬───┬─┘  │  │       └───────────┘
                  │   │    │  │
        ┌─────────▼┐ ┌▼────▼┐ │
        │reembolsado│ │fallido│ │
        └───────────┘ └───────┘ │
                                │
                    ┌───────────▼─────────┐
                    │  requiere_accion    │
                    └─────────────────────┘
```

Estados terminales (cancelar/reembolsar fallan con `422`): `completado`, `fallido`, `cancelado`, `reembolsado`, `expirado`.

## 8. Tipos de pago

```typescript
const TIPOS_PAGO = ['pago_unico', 'suscripcion', 'recurrente'] as const;
type TipoPago = typeof TIPOS_PAGO[number];
```

## 9. Métodos de pago

```typescript
const METODOS_PAGO = ['transfer', 'qr'] as const;  // verificado en tipos-pago.ts:21
type MetodoPago = typeof METODOS_PAGO[number];
```

> Si el servicio agrega un método (e.g. `'card'`), regenerar `pago-types.ts` y bumpear minor del SDK.
