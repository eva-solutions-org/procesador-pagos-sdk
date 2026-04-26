# Convenciones — `@eva/procesador-pagos-sdk`

## 1. Naming

| Tipo                          | Convención                               | Ejemplo                                                                                |
| ----------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Archivos                      | `kebab-case`                             | `crear-pago.ts`, `comparar-firmas-seguro.ts`                                           |
| Tipos / Interfaces            | `PascalCase`                             | `Resultado`, `ClienteProcesadorPagos`, `CrearPagoInput`                                |
| Funciones / variables         | `camelCase` en español                   | `crearPago`, `pagosFacade`, `verificarFirmaWebhook`                                    |
| Términos técnicos             | `camelCase` en inglés cuando es estándar | `apiKey`, `signal`, `fetch`, `timeout`, `headers`, `signature`, `secretKey`, `payload` |
| Constantes top-level          | `UPPER_SNAKE_CASE`                       | `ESTADOS_PAGO`, `REGEX_FIRMA_WEBHOOK`, `SDK_API_URL`                                   |
| Tipos derivados de constantes | `(typeof X)[number]`                     | `type EstadoPago = (typeof ESTADOS_PAGO)[number]`                                      |

### Reglas mixtas español/inglés

El SDK habla a un consumidor latino pero respeta términos técnicos universales:

- **Español**: `crearPago`, `consultarPago`, `iterarPagos`, `firma`, `pasarela`, `monto`, `moneda`, `referenciaExterna`.
- **Inglés** (cuando es estándar industria): `apiKey`, `headers`, `timeout`, `signal`, `fetch`, `payload`, `metadata`, `webhook`, `HMAC`, `signature`.
- **Términos del servicio se mantienen 1:1**: si el servicio expone `pagoId`, el SDK expone `pagoId` (no `idPago`). Idem `proyectoId`, `intentId`, `qrCodeEmv`.

### Anti-patterns

- Mezcla random: NO `crearPayment` ni `createPago`.
- Hungarian notation: NO `strApiKey`, `iLimit`.
- Acrónimos en mayúsculas en medio de identificador: NO `parsearURL`, sí `parsearUrl`.

---

## 2. Paradigma: funcional puro

**Cero clases.** Único `Error` para excepciones (estándar JS). El SDK es 100% funciones + objetos.

### Cliente como factory funcional

```typescript
// ✅ Correcto: factory que retorna objeto con métodos.
export function crearCliente(opciones: OpcionesCliente): ClienteProcesadorPagos {
  validarOpciones(opciones);
  const http = crearHttpClient({ ... });
  return { pagos: pagosFacade(http) };
}

// ❌ Incorrecto: clase.
class ClienteProcesadorPagos {
  constructor(private opciones: OpcionesCliente) { ... }
  crearPago(input) { ... }
}
```

### Closures sobre `this`

`pagosFacade(http)` retorna un objeto donde `http` está bindeado por closure. NO se usa `this`:

```typescript
export function pagosFacade(http: HttpClient): PagosFacade {
  return {
    crearPago: (input, options) => crearPago({ http }, input, options),
    consultarPago: (params) => consultarPago({ http }, params),
    // ...
  };
}
```

### Async iterator es una function generator (no clase)

```typescript
export async function* iterarPagos(filtros, options) {
  let page = 1;
  try {
    while (true) {
      const r = await listarPagos({ http }, { ...filtros, page });
      if (!r.success) throw new Error(r.error, { cause: r });
      yield* r.data.data;
      if (page >= r.data.pagination.totalPages) break;
      page++;
    }
  } finally {
    // cleanup observable
  }
}
```

En este SDK, `iterarPagos` emite `PagoResumen` (shape del endpoint de listado), no `PagoDetalle`.

---

## 3. Result Pattern

### Contrato

Todas las operaciones de aplicación retornan `Promise<Resultado<T>>`.

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

### Patrón de uso

```typescript
const r = await cliente.pagos.crearPago(input);

if (!r.success) {
  // r es la variante false. r.error, r.codigo accesibles.
  // r.data NO accesible (TS error).
  return manejarError(r);
}

// Acá r.success === true, r.data es T.
console.log(r.data.pagoId);
```

### Anti-patterns

- ❌ `if ('success' in r)` — siempre es `true`. Usá `r.success` directo.
- ❌ `try/catch` para errores de negocio. Usá `if (!r.success)`.
- ❌ Devolver `null`/`undefined` para errores. Usá `Resultado.fallo(...)`.
- ❌ Lanzar para errores HTTP esperados (401/422/etc). El SDK los mapea a `Resultado`.

### Excepción justificada: `iterarPagos`

`iterarPagos` yields `PagoResumen` directo y lanza `Error(msg, { cause: Resultado })` on I/O failure. Idiomático Stripe-node / AWS SDK v3 / Octokit. Es la **única** excepción al Result Pattern. Documentado en ADR-005.

---

## 4. Imports SOLO desde barrels

### Regla

Cada feature expone un **único punto de entrada público** vía `index.ts` (barrel). Cualquier módulo externo al feature debe importar SOLO desde el barrel:

```typescript
// ✅ Correcto: import desde barrel del feature.
import { pagosFacade } from "./features/pagos/index.js";

// ❌ Incorrecto: import de archivo interno del feature.
import { crearPago } from "./features/pagos/application/crear-pago.js";
```

Esto:

1. Encapsula detalles de implementación (mover archivos no rompe nada externo).
2. Permite refactor del interior del feature sin auditar el resto del SDK.
3. Hace explícito el contrato público.

### Excepción única

Dentro de un mismo feature, los archivos pueden importarse entre sí sin pasar por el barrel (eso desbloquea el barrel mismo). Ejemplo: `application/iterar-pagos.ts` puede importar `application/listar-pagos.ts` directamente.

### Excepción de testing: entrypoint privado para internals

Los tests de módulos internos (infrastructure, domain helpers) pueden necesitar importar implementaciones que NO están en el barrel público. Para estos casos:

1. **Usar alias privado del workspace** (`tsconfig.json` + `vitest.config.ts`) — NO paths concretos.
2. El alias apunta a un archivo `test-internals.ts` dentro del feature que reexporta SOLO lo necesario para tests.
3. **NUNCA** agregar esos exports al barrel público, a `package.json#exports` ni a metadata publicada del paquete.

**Ejemplo:**

```typescript
// tsconfig.json / vitest.config.ts
// alias privado: '#test-internals/webhooks' -> './src/features/webhooks/test-internals.ts'

// src/features/webhooks/test-internals.ts
export { compararFirmasSeguro } from "./infrastructure/comparar-firmas-seguro.js";

// tests/features/webhooks/comparar-firmas-seguro.mock.test.ts
import { compararFirmasSeguro } from "#test-internals/webhooks";
```

**Restricción:** los tests NO deben reutilizar funciones productivas como fixtures. Si un test necesita generar datos (ej: firma HMAC), debe tener su propio helper en `tests/helpers/` con implementación independiente.

### Imports `.js` con TypeScript

`tsconfig.json` usa `"moduleResolution": "Bundler"` y los imports incluyen extensión `.js` (ESM nativo):

```typescript
import { crearHttpClient } from "../../core/http-client/index.js";
```

TS resuelve el `.js` al `.ts` correspondiente. Compatible con tsdown ESM output.

---

## 5. `safeParse` en boundaries

Validación de datos externos (consumidor → SDK, servicio → SDK) usa `Zod.safeParse`, **nunca** `parse` (que lanza).

### Boundary consumidor → SDK

```typescript
const parsed = crearPagoInputSchema.safeParse(input);
if (!parsed.success) {
  return errorValidacion("Input inválido: " + parsed.error.message);
}
// usar parsed.data
```

### Boundary servicio → SDK (HTTP response)

El `crearHttpClient` desenvuelve `{ data }` y llama `schemaRespuesta.safeParse(json.data)`. Si falla → `502 'Respuesta inesperada del servicio'`.

### Anti-patterns

- ❌ `schema.parse(...)` — lanza. Usar `safeParse`.
- ❌ Validar en el medio (e.g. después de mapear) — validar al borde, una sola vez.
- ❌ Validar en boundary y NO confiar en el tipo después (perdiste la garantía de TS).

---

## 6. Tests con sufijo `.mock.test.ts`

Todos los tests del SDK son tests con `vi.fn` o stubs de `globalThis.fetch`. Convención de nombre:

```
tests/<area>/<archivo-bajo-test>.mock.test.ts
```

Ejemplo: `tests/features/pagos/crear-pago.mock.test.ts` testea `src/features/pagos/application/crear-pago.ts`.

### Por qué `.mock.test.ts` (no solo `.test.ts`)

Reserva el sufijo `.e2e.test.ts` para tests futuros que vayan contra un servicio real (CI con worker corriendo). El `vitest.config.ts` ya filtra por `tests/**/*.{mock,e2e}.test.ts` para ambas categorías.

### Helpers

- `tests/helpers/fixtures.ts` — datos canónicos (pagos de ejemplo, secret/apiKey de test, payloads webhook con firmas precalculadas).
- `tests/helpers/mock-fetch.ts` — `crearMockFetch(handler)` que retorna un `vi.fn` instalable con `vi.stubGlobal('fetch', ...)`.

---

## 7. JSDoc de cita al servicio

Cada archivo que mirror-ea algo del servicio cita el path canonical:

```typescript
/**
 * Schema 1:1 con servicio.
 * Source: D:\...\Procesador-de-pagos\src\features\pagos\domain\pago-schemas.ts
 * Verified against commit: 380874771a21b56bd42f1db23c60627c62209327
 */
```

Esto facilita re-verificar manualmente si hubo drift entre SDK y servicio.

---

## 8. `apiKey` nunca en errors

**Política dura**: la `apiKey` NO debe aparecer en `error.message`, `error.cause` serializado, ni JSDocs de errores.

- Validación `apiKey` vacía → `throw new Error('apiKey requerida (string no vacío)')`. Sin valor.
- Mapeo de errores HTTP → mensajes estables saneados por status. Sin `body.error`, `statusText` ni headers crudos.
- Tests verifican con regex que `apiKey` (string conocida) NO aparece en `r.error`.

---

## 9. Anti-patterns globales

- ❌ Single-letter vars (excepto loops idiomáticos `i`, `j`, `k` en `for` con índice).
- ❌ Comentarios sobre "lo obvio" — preferir nombres claros que código documentado.
- ❌ `any` o `unknown` sin narrowing posterior. Si entra `unknown`, validar antes de usar.
- ❌ `console.log` en código de producción. Logging es responsabilidad del consumidor.
- ❌ Side effects en imports (excepto el check defensivo C5 documentado en ADR-007).
- ❌ Default exports — todo es named export.
- ❌ Usar `Date.now()` o `Math.random()` directo — siempre inyectable para tests (cuando aplique).
