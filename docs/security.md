# Security — `@eva_solutions/procesador-pagos-sdk`

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
| Destino de las requests (adónde viaja la `apiKey`) | `baseUrl` que fija el consumidor | `validarBaseUrl` exige un origin `https` (o `http` en loopback), sin credenciales, path, query ni fragmento (ADR-022). |

### Amenazas consideradas

| Amenaza | Mitigación |
|---|---|
| **Leak de apiKey** vía logging accidental | `apiKey` NUNCA en `error.message` ni `cause`. Tests validan con regex. |
| **Timing attack** sobre comparación HMAC | `compararFirmasSeguro` delega a `crypto.subtle.timingSafeEqual` o `node:crypto.timingSafeEqual` (primitivas nativas auditadas). Fail-closed si no disponibles (ADR-004). |
| **Desvío del destino** (la `apiKey` viaja a otro host) | El SDK no lee variables de entorno: el destino es únicamente el `baseUrl` que pasa el consumidor. Se valida al crear el cliente: solo `https` (o `http` en loopback), sin credenciales ni path. Proteger la config de despliegue que alimenta `baseUrl` es responsabilidad del consumidor. |
| **`baseUrl` insegura o ambigua** (http remoto, path que se descartaría, credenciales en la URL) | `validarBaseUrl` lanza síncronamente al llamar a `crearCliente`; ningún mensaje repite el valor recibido. |
| **Replay attack** sobre webhooks | Out-of-scope del SDK (responsabilidad del consumidor: timestamping del payload + idempotency). |
| **Webhook forgery** (atacante simula servicio) | `verificarFirmaWebhook` rechaza firmas no calculadas con la `secretKey` (HMAC-SHA256 + timing-safe). |
| **Body tampering** post-firma-válida | `JSON.parse` post-verificación: si el body fue modificado para no parsear, retorna `422`. |
| **Header injection** en consumer-supplied `headers` | Headers internos (`x-api-key`, `Content-Type`) ganan ante colisión (override defensivo en `crearHttpClient`). |
| **Leak de credenciales vía redirect automático** | `fetch` usa `redirect: 'error'`, así el SDK falla antes de reenviar `x-api-key` a otra ubicación. |
| **Resource exhaustion** vía requests infinitos | Triple `AbortSignal` con timeout interno SIEMPRE presente (default 10_000 ms). El consumidor puede subir el timeout pero NO puede desactivarlo. |
| **Memory leak** vía signals huérfanos | `AbortSignal.any` libera listeners cuando el primer signal aborta. Tests verifican cleanup en `iterarPagos.finally`. |

---

## 2. Validación server-side OBLIGATORIA del monto

> **Responsabilidad del consumidor.** El SDK no incluye rutas HTTP ni hooks que fuercen esta validación (esas superficies se eliminaron, ver ADR-023): quien llama a `crearPago` es responsable de que `monto` y `moneda` salgan de una fuente confiable.

### 2.1 Por qué es obligatorio

El frontend NO es trusted. Cualquier valor que viaje desde el navegador (`monto`, `moneda`, `referenciaExterna`, `metadata`) puede ser manipulado por un atacante con devtools. Tu servidor MUST recalcular el monto canónico desde su BD usando un identificador confiable (típicamente `productoId`).

```
Browser (UNTRUSTED) ──► Backend del consumidor ──► SDK (crearPago) ──► Procesador-de-pagos
   $ devtools edit         recalcula desde BD        cliente.pagos       crear-pago service
   monto = 0.01            monto canónico            envía el monto que recibe
```

El SDK envía el `monto` que le pasas: no puede saber si es el correcto.

### 2.2 Ejemplo INSEGURO

```typescript
// Manipulación del atacante:
// 1. Abre devtools en el browser.
// 2. Edita el request a tu endpoint y cambia monto: '0.01'.
// 3. Tu backend lo pasa a crearPago sin recalcular.
// 4. El atacante paga 1 centavo por un producto de 10 soles.

// ❌ INSEGURO — el monto viene tal cual del request del browser:
app.post('/pagos/crear', async (c) => {
  const body = await c.req.json();
  return c.json(await cliente.pagos.crearPago(body)); // monto/moneda del atacante
});
```

### 2.3 Ejemplo SEGURO

```typescript
// ✅ SEGURO — el monto se recalcula desde la BD del consumidor:
app.post('/pagos/crear', async (c) => {
  const body = await c.req.json();

  // 1. El frontend manda productoId — confiable solo como identificador.
  const producto = await db.productos.findById(body.productoId);
  if (!producto) return c.json({ error: 'Producto no encontrado' }, 404);

  // 2. Verificar ownership (¿el usuario puede comprar este producto?).
  const userId = c.get('userId');
  await verificarOwnership(userId, producto);

  // 3. Calcular el monto canónico desde la BD.
  let montoCentavos = producto.precio;
  if (body.cuponCodigo) {
    const cupon = await db.cupones.findValid(body.cuponCodigo);
    if (cupon) montoCentavos = aplicarCupon(montoCentavos, cupon);
  }
  if (body.cantidad) montoCentavos *= Number(body.cantidad);

  const r = await cliente.pagos.crearPago({
    monto: (montoCentavos / 100).toFixed(2),
    moneda: producto.moneda,
    tipo: 'pago_unico',
    referenciaExterna: body.referenciaExterna,
  });
  return c.json(r);
});
```

### 2.4 Tabla de manipulaciones del atacante

| Amenaza | Vector | Mitigación |
|---|---|---|
| Cambia `monto` a `0.01` | Devtools edita request | Recalcular desde `productoId` en el backend |
| Cambia `moneda` a `USD` (era `PEN`) | Devtools edita request | Recalcular desde el producto |
| Cambia `productoId` a uno más caro | Devtools edita request | Ownership check + auth de sesión |
| Cambia `cantidad` a `0` | Devtools edita request | Validar `cantidad >= 1` y `<= maxStock` |
| Aplica cupón inválido | Devtools edita el body | Validar el cupón contra BD antes de aplicar |
| Reusa `referenciaExterna` | Reenvío del mismo body | Servicio retorna 409 (anti-replay del Procesador) |
| Spoofea webhook con monto falso | POST sin firma válida | HMAC SHA-256 + timing-safe comparison |

### 2.5 Cuándo NO copiar el monto del request

**Nunca en producción real con montos no controlados por backend.** El único caso razonable es un monto fijo definido por el backend antes del frontend (por ejemplo, una suscripción mensual de USD 9.99 con `planId` y precio hardcoded server-side). **Aun así: valida `planId` y deriva el monto de una tabla server-side, NO copies el del request.**

Si por alguna razón envías el monto tal cual, documenta la decisión en code review: quien lo vea debe preguntar el porqué.

### 2.6 Checklist pre-deploy

- [ ] ¿Recalculo `monto` y `moneda` desde mi BD, no los copio del request?
- [ ] ¿Valido `productoId` (existe + ownership)?
- [ ] ¿Valido cupones contra BD antes de aplicar?
- [ ] ¿Valido `cantidad >= 1` y `<= maxStock`?
- [ ] ¿Valido la identidad del usuario (auth de cookie/JWT) antes de crear el pago?
- [ ] ¿Tengo tests de integración con monto manipulado en un frontend mock?
- [ ] ¿El secret del webhook y la `apiKey` están en un secret manager (no en código)?

Ver `ADR-020 — Security boundary` en `docs/decisions.md` para el razonamiento histórico de este boundary (hoy obsoleto como API, vigente como principio).

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
| Logging | El SDK NUNCA loguea datos sensibles (apiKey, secretKey, body completo de webhooks, contenido de metadata del consumidor). Sí emite mensajes a `console.error`/`console.warn` para errores no recuperables y warnings de configuración explícitamente autorizados — ver [ADR-021 — Política de Logging](decisions.md#adr-021--política-de-logging-del-sdk). |
| Tests | Regex `/apiKeyTestValue/` debe ser ausente en los `r.error` de los tests de errores. |

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
Runtime no soporta timing-safe comparison. Requiere Cloudflare Workers, Vercel Edge, o Node 20+ con nodejs_compat.
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

## 6. `baseUrl` validada en runtime

### Amenaza mitigada: `apiKey` enviada a un destino inseguro o ambiguo

El SDK no lee `process.env` ni ninguna variable de entorno: el único destino es el `baseUrl` que el consumidor pasa a `crearCliente`. Antes de crear el cliente, `validarBaseUrl` exige:

- esquema `https`, o `http` solo si el host es loopback (`localhost`, `127.x.x.x`, `[::1]`);
- sin credenciales (`usuario:clave@`), sin query, sin fragmento (también se rechazan `?` y `#` vacíos);
- path igual a `/`: `new URL(path, base)` descarta en silencio el path de la base, así que un path se rechaza en vez de ignorarse.

Cualquier incumplimiento lanza un `Error` síncrono con prefijo `[procesador-pagos-sdk] baseUrl` que **no incluye el valor recibido** (podría traer credenciales o tokens). La URL se normaliza a `URL.origin`.

### Qué NO cubre

El SDK no puede saber si un `https://...` válido es el servicio correcto: si la configuración de despliegue que alimenta `baseUrl` está comprometida o es incorrecta, la `apiKey` viaja a ese host. Protege esa configuración como protegerías la propia `apiKey`, y usa una `baseUrl` distinta por entorno. Ver [ADR-022](decisions.md#adr-022--baseurl-en-runtime-solo-origin).

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

`verificarWebhookDesdeRequest` retorna `payload: unknown`. Valida ANTES de usar:

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

### Una `baseUrl` por entorno

No uses `http://localhost:...` ni la URL de otro entorno en producción: el SDK acepta cualquier origin `https` válido y no puede detectar que apuntas al servicio equivocado. Mantén `baseUrl` en la configuración propia de cada despliegue.

### Idempotency en webhook handlers

El servicio puede reenviar webhooks (network failures, etc.). Tu handler debe ser idempotente: deduplicar por `pagoId` + `evento` + `timestamp`. Esto NO es responsabilidad del SDK.

---

## 8. Reportar vulnerabilidades

(Pendiente: publicar el canal oficial de reporte de vulnerabilidades.)
