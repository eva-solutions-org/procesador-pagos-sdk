# Security — `@eva/procesador-pagos-sdk`

> Documento de modelo de amenazas y políticas de seguridad del SDK. Decisión A6: SÍ va en MVP.

---

## 1. Modelo de amenazas

El SDK opera como **cliente backend-to-backend** que:

1. Maneja una `apiKey` secreta (autoriza requests al servicio Procesador-de-pagos).
2. Verifica firmas HMAC-SHA256 de webhooks salientes (autentica que el webhook viene del servicio, no de un atacante).

### Activos a proteger

| Activo | Naturaleza | Cómo protege el SDK |
|---|---|---|
| `apiKey` del consumidor | Secreto a largo plazo (rotable) | NUNCA en errors, headers privados, sin logging interno. |
| `secretKey` HMAC | Secreto compartido SDK ↔ servicio | Solo se usa dentro del handler de webhook del consumidor; NO se persiste. |
| Integridad de URLs del servicio | Build-time injection | `__SDK_API_URL__` horneada (ADR-001) + defensa runtime (ADR-007). |

### Amenazas consideradas

| Amenaza | Mitigación |
|---|---|
| **Leak de apiKey** vía logging accidental | `apiKey` NUNCA en `error.message` ni `cause`. Tests validan con regex. |
| **Timing attack** sobre comparación HMAC | `compararFirmasSeguro` delega a `crypto.subtle.timingSafeEqual` o `node:crypto.timingSafeEqual` (primitivas nativas auditadas). Fail-closed si no disponibles (ADR-004). |
| **MitM** vía URL manipulation runtime | URL no es runtime configurable (ADR-001). El servicio usa HTTPS (Cloudflare TLS). |
| **Build mismatch** (publicar bundle production con URL localhost) | Defensa runtime (ADR-007 / C5): `core/config.ts` lanza al cargar si detecta inconsistencia. |
| **Replay attack** sobre webhooks | Out-of-scope del SDK (responsabilidad del consumidor: timestamping del payload + idempotency). |
| **Webhook forgery** (atacante simula servicio) | `verificarFirmaWebhook` rechaza firmas no calculadas con la `secretKey` (HMAC-SHA256 + timing-safe). |
| **Body tampering** post-firma-válida | `JSON.parse` post-verificación: si el body fue modificado para no parsear, retorna `422`. |
| **Header injection** en consumer-supplied `headers` | Headers internos (`x-api-key`, `Content-Type`) ganan ante colisión (override defensivo en `crearHttpClient`). |
| **Leak de credenciales vía redirect automático** | `fetch` usa `redirect: 'error'`, así el SDK falla antes de reenviar `x-api-key` a otra ubicación. |
| **Resource exhaustion** vía requests infinitos | Triple `AbortSignal` con timeout interno SIEMPRE presente (default 10_000 ms). El consumidor puede subir el timeout pero NO puede desactivarlo. |
| **Memory leak** vía signals huérfanos | `AbortSignal.any` libera listeners cuando el primer signal aborta. Tests verifican cleanup en `iterarPagos.finally`. |

---

## 2. Política `apiKey` nunca en errors

**Regla dura**: la `apiKey` NO debe aparecer en NINGUNA superficie observable por el consumidor (excepto el header `x-api-key` que va al servicio).

### Implementación

- `crearCliente({ apiKey })` valida que sea string no-vacío y throws con mensaje **sin valor**: `'apiKey requerida (string no vacío)'`.
- `crearCliente({ timeout })` valida rango `0..Number.MAX_SAFE_INTEGER` antes de delegar a `AbortSignal.timeout()`.
- `crearHttpClient` añade `headers['x-api-key'] = apiKey` solo dentro del request. Headers consumidor NO pueden override.
- `crearHttpClient` fuerza `redirect: 'error'` para no seguir redirects con credenciales adjuntas.
- `mapearErrorHttp` retorna mensajes estables por status para toda respuesta no-OK. No refleja `body.error`, headers crudos ni detalles del upstream.
- Tests críticos en `tests/core/http-client.mock.test.ts`: regex check que `apiKey` (string conocida en el test) NO aparece en `r.error` ni en `JSON.stringify(r)`.

### Defensa en profundidad

| Capa | Defensa |
|---|---|
| Validation | `apiKey` requerida, no vacía. Mensaje sin valor. |
| Construction | Header `x-api-key` se setea en el adapter, no es accesible al consumidor. |
| Error mapping | `mapearErrorHttp` no toca `request.headers`. |
| Logging | El SDK NO loguea (delegado al consumidor). Sin `console.log`/`debug` en producción. |
| Tests | Regex `/apiKeyTestValue/` debe ser ausente en TODOS los `r.error` de los 113 scenarios. |

---

## 3. HMAC verification: timing-safe + fail-closed

### Algoritmo

```
1. Validar `secretKey` no vacía (else 401).
2. Validar `signature` matchea regex /^sha256=[a-f0-9]{64}$/ (case-sensitive — I4) (else 401).
3. Calcular HMAC-SHA256 del body con la secretKey (vía crypto.subtle).
4. Comparar timing-safe vía primitiva nativa (subtle.timingSafeEqual o node:crypto.timingSafeEqual).
5. Si no matchea → 401 'Firma inválida'.
6. Si matchea → JSON.parse(body) (404 → 422 si falla).
```

### Fail-closed

Si el runtime no expone NINGUNA de las dos primitivas nativas, `compararFirmasSeguro` lanza:

```
Runtime no soporta timing-safe comparison. Requiere Cloudflare Workers, Vercel Edge, o Node 18+ con nodejs_compat.
```

**No hay fallback custom byte-a-byte.** Razón: una implementación custom es vulnerable a optimizaciones del JIT que rompen la propiedad de timing-constant. Mejor rechazar el módulo completo que dar una falsa sensación de seguridad.

### `secretKey` solo dentro del handler del consumidor

El SDK NO persiste la `secretKey`. La recibe como parámetro de `verificarFirmaWebhook` o `verificarWebhookDesdeRequest` y se usa solo durante la llamada. El consumidor decide cómo aprovisionarla (env var, secret manager, KMS).

Recomendación al consumidor:

- **Cloudflare Workers**: usar `c.env.PAGOS_WEBHOOK_SECRET` (Cloudflare Secret).
- **Vercel**: usar `process.env.PAGOS_WEBHOOK_SECRET` (Vercel Environment Variables, encrypted).
- **Node**: usar un secret manager (AWS SSM, GCP Secret Manager, Vault).

Rotación: el consumidor debe rotar la `secretKey` periódicamente (cuatrimestral mínimo) en coordinación con el servicio.

---

## 4. Triple `AbortSignal` y prevención de leaks

### Combinación

`crearHttpClient` combina:

```typescript
const signals = [clientSignal, opSignal, AbortSignal.timeout(timeout)].filter(s => s !== undefined);
const combinedSignal = AbortSignal.any(signals);
```

- `clientSignal`: del constructor `crearCliente({ signal })`.
- `opSignal`: de la operación individual (`crearPago(input, { signal })`).
- `AbortSignal.timeout(timeout)`: SIEMPRE presente. Default 10_000 ms.

### Prevención de leaks de requests

Si el consumidor cancela (clientSignal o opSignal aborta), `AbortSignal.any` propaga al fetch interno → fetch aborta el request → recursos liberados.

Si el consumidor olvida cancelar, el timeout interno (siempre presente) actúa como red de seguridad.

### Tests

- `tests/core/http-client.mock.test.ts`: 5 scenarios cubren cada signal por separado y combinaciones.
- `tests/features/pagos/iterar-pagos.mock.test.ts`: `break` del consumidor ejecuta `finally` exactamente una vez (cleanup observable).

---

## 5. Build-per-env: imposibilidad de URL change runtime

### Atque mitigado: MitM via env manipulation

```typescript
// ❌ Esto NO funciona en este SDK:
process.env.PAGOS_URL = 'https://evil.com';
const cliente = crearCliente({ apiKey });
await cliente.pagos.crearPago(...); // sigue yendo a la URL horneada en build-time
```

El SDK NO lee `process.env.PAGOS_URL` ni similar. La URL es un string literal en `dist/index.js` (inlined por `tsdown define`).

### Atque mitigado: build mismatch publicado accidentalmente

`prepublishOnly` corre `typecheck && test:run && build:prod`. Pero `npm publish --ignore-scripts` lo bypassea.

**Defensa runtime (ADR-007 / C5)**:

```typescript
// src/core/config.ts (síncrono al cargar)
if (__SDK_API_URL__.includes('localhost') && __SDK_BUILD_ENV__ !== 'local') {
  throw new Error('[procesador-pagos-sdk] Build mismatch: ...');
}
```

El consumidor recibe el error al primer `import`. El bundle no carga.

Limitación: NO cubre URLs no-localhost incorrectas (e.g. SDK con URL dev pero env=production). Eso requiere disciplina de release: tag por entorno + lockfile fijado.

---

## 6. Recomendaciones para el consumidor

### Configuración mínima

```typescript
const cliente = crearCliente({
  apiKey: process.env.EVA_PAGOS_API_KEY!,    // de secret manager, no hardcoded
});
```

### NO usar en browser

La `apiKey` se transmite al servidor, lo cual está OK en backend-to-backend. En browser, la apiKey es visible en network panel y memory dump.

Si el caso de uso requiere browser, el flujo correcto es:

1. Browser → tu backend (con session token / OAuth).
2. Tu backend → SDK Procesador-de-pagos (con apiKey secreta).

### Rotar `secretKey` periódicamente

Mínimo cuatrimestral. Coordinar con el servicio: el rotation requiere overlap (servicio acepta old + new durante un grace period).

### Usar `signal` para timeouts custom

```typescript
const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), 5_000);  // timeout consumer-driven

const r = await cliente.pagos.crearPago(input, { signal: ctrl.signal });
```

### Validar `payload: unknown` con tu propio Zod

`verificarWebhookDesdeRequest` retorna `payload: unknown`. Validá ANTES de usar:

```typescript
import { z } from 'zod';

const payloadSchema = z.object({
  evento: z.enum(['pago.completado', 'pago.fallido']),
  pagoId: z.string(),
  // ...
});

const parsed = payloadSchema.safeParse(r.data.payload);
if (!parsed.success) return c.json({ error: 'Payload inválido' }, 422);
```

### Preferir builds prod en producción

NO instalar `@eva/procesador-pagos-sdk@local` en producción. La defensa runtime (ADR-007) ya cubre `localhost` mismatch, pero igual: instalar el tag correcto.

### Idempotency en webhook handlers

El servicio puede reenviar webhooks (network failures, etc.). Tu handler debe ser idempotente: deduplicar por `pagoId` + `evento` + `timestamp`. Esto NO es responsabilidad del SDK.

---

## 7. Reportar vulnerabilidades

(Política interna del ecosistema `@eva/*` — completar con canal de seguridad oficial cuando esté establecido).
