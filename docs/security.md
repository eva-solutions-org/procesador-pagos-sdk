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

## 2. Validación server-side OBLIGATORIA (alCrearPago)

> **Esta sección es de cumplimiento obligatorio si usás `rutasPagos()` (entry `@eva/procesador-pagos-sdk/hono`).** El SDK fuerza la presencia del hook `alCrearPago` con un `throw` síncrono al construir el factory — si lo olvidás, tu servicio no arranca.

### 2.1 Por qué es obligatorio

El frontend NO es trusted. Cualquier valor que viaja desde `<BotonPago>` (`monto`, `moneda`, `referenciaExterna`, `metadata`) puede ser manipulado por un atacante con devtools del browser. El servidor del consumidor MUST recalcular el monto canónico desde su BD usando un identificador confiable (típicamente `metadata.productoId`).

```
Browser (UNTRUSTED) ──► Backend del consumidor ──► SDK (rutasPagos) ──► Procesador-de-pagos
   $ devtools edit         alCrearPago hook         crearPago client       crear-pago service
   monto = 0.01            recalcula desde BD       envía monto canónico
```

### 2.2 Ejemplo INSEGURO

```typescript
// Manipulación del atacante:
// 1. Abre devtools en el browser.
// 2. Edita el request POST /pagos/crear y cambia monto: '0.01'.
// 3. Backend lo pasa al servicio Procesador-de-pagos sin recalcular.
// 4. Atacante paga 1 centavo por un producto de 10 soles.
//
// El SDK previene esto con throw obligatorio — esta sección documenta el por qué.

// ❌ INSEGURO — sin alCrearPago, el SDK throwea al construir el factory:
app.route('/pagos', rutasPagos({
  apiKey: process.env.PROCESADOR_API_KEY!,
  webhookSecret: process.env.PROCESADOR_WEBHOOK_SECRET!,
  // ⚠️ falta alCrearPago → throw síncrono al boot:
  //   "[procesador-pagos-sdk] alCrearPago es OBLIGATORIO ..."
}));
```

### 2.3 Ejemplo SEGURO

```typescript
// ✅ SEGURO — alCrearPago recalcula desde la BD del consumidor:
app.route('/pagos', rutasPagos({
  apiKey: process.env.PROCESADOR_API_KEY!,
  webhookSecret: process.env.PROCESADOR_WEBHOOK_SECRET!,
  alCrearPago: async (input, c) => {
    // 1. Frontend manda metadata.productoId — confiable como identificador.
    const producto = await db.productos.findById(input.metadata.productoId);
    if (!producto) throw new Error('Producto no encontrado');

    // 2. Calcular monto canónico desde la BD.
    let montoCentavos = producto.precio;

    // 3. Aplicar cupón si viene (validar primero).
    if (input.metadata.cuponCodigo) {
      const cupon = await db.cupones.findValid(input.metadata.cuponCodigo);
      if (cupon) montoCentavos = aplicarCupon(montoCentavos, cupon);
    }

    // 4. Aplicar cantidad si viene.
    if (input.metadata.cantidad) {
      montoCentavos *= Number(input.metadata.cantidad);
    }

    // 5. Verificar ownership (¿el usuario puede comprar este producto?).
    const userId = c.get('userId');
    await verificarOwnership(userId, producto);

    return {
      ...input,
      monto: (montoCentavos / 100).toFixed(2),
      moneda: producto.moneda,
    };
  },
}));
```

### 2.4 Tabla de manipulaciones del atacante

| Amenaza | Vector | Mitigación |
|---|---|---|
| Cambia `monto` a `0.01` | Devtools edita request | `alCrearPago` recalcula desde `metadata.productoId` |
| Cambia `moneda` a `USD` (era `PEN`) | Devtools edita request | `alCrearPago` recalcula desde producto |
| Cambia `metadata.productoId` a uno más caro | Devtools edita request | Ownership check + auth de session |
| Cambia `metadata.cantidad` a `0` | Devtools edita request | Validar `cantidad >= 1` y `<= maxStock` en el hook |
| Aplica cupón inválido | Devtools edita metadata | Validar cupón contra BD antes de aplicar |
| Reusa `referenciaExterna` | Reenvío del mismo body | Servicio retorna 409 (anti-replay del Procesador) |
| Spoofea webhook con monto falso | POST sin firma válida | HMAC SHA-256 + timing-safe comparison + dedup eventId |

### 2.5 Cuándo NO usar identity `(input) => input`

**Nunca en producción real con montos no controlados por backend.** Casos donde podría aceptarse identity:

- Monto fijo definido por el backend antes del frontend (ej: suscripción mensual de USD 9.99 con `metadata.planId` y precio hardcoded server-side). **Aún así: validar `metadata.planId` y derivar el monto de una tabla server-side, NO copiar el del request.**

Si pasás identity, marcá el código con un `TODO` o documentá la decisión en code review. El SDK NO bloquea la identity — es declaración explícita de intención. Code reviewers que vean `alCrearPago: (input) => input` deben preguntar el porqué.

### 2.6 Checklist pre-deploy

- [ ] ¿Implementé `alCrearPago` con lookup real (no identity)?
- [ ] ¿Valido `metadata.productoId` (existe + ownership)?
- [ ] ¿Valido cupones contra BD antes de aplicar?
- [ ] ¿Valido `metadata.cantidad >= 1` y `<= maxStock`?
- [ ] ¿Recalculo `moneda` desde producto, NO copio del request?
- [ ] ¿Hago validación de `userId` ownership (auth de cookie/JWT)?
- [ ] ¿Tengo tests de integración con monto manipulado en frontend mock?
- [ ] ¿Configuré `verificarAcceso` para `/eventos` SSE? (si SSE habilitado)
- [ ] ¿El `webhookSecret` está en secret manager (no en código)?
- [ ] ¿Verifiqué el throw del SDK localmente al olvidar `alCrearPago`?

### 2.7 Mensaje exacto del throw

```
Error: [procesador-pagos-sdk] alCrearPago es OBLIGATORIO para evitar que un atacante manipule monto/moneda desde el frontend. Implementá el hook con lookup en tu BD para recalcular monto canónico. Ver docs/security.md.
```

Ver `ADR-020 — Security boundary` en `docs/decisions.md` para el threat model completo y las responsabilidades del SDK vs el consumidor.

---

## 3. Política `apiKey` nunca en errors

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

## 4. HMAC verification: timing-safe + fail-closed

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

## 5. Triple `AbortSignal` y prevención de leaks

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

## 6. Build-per-env: imposibilidad de URL change runtime

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

## 7. Recomendaciones para el consumidor

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

## 8. Sanitización SSE (CR/LF) y endpoint `/eventos`

El endpoint `GET /:id/eventos` (SSE) emite campos de control (`event:`, `id:`, `retry:`) cuyos valores podrían venir contaminados con CR/LF. El SDK aplica `sanitizarCampoSSE(valor)` que rechaza con throw si detecta `\r` o `\n` (defensa adicional al fix del CVE-2026-29085 de Hono <4.12.4 — el peer dep ya está bumpeado a `>=4.12.4`).

Auth del endpoint: pasar `verificarAcceso?: (c, pagoId) => boolean | Promise<boolean>` al factory. Si `pubsub` está configurado y `verificarAcceso` no lo está, el SDK emite un `console.warn` advirtiendo que el endpoint queda público (FIX I2 / ADR-019).

---

## 9. Reportar vulnerabilidades

(Política interna del ecosistema `@eva/*` — completar con canal de seguridad oficial cuando esté establecido).
