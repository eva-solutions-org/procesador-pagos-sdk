# Configuración — `@eva_solutions/procesador-pagos-sdk`

## 1. Setup como consumidor del SDK

### Instalación

```bash
pnpm add @eva_solutions/procesador-pagos-sdk
```

El paquete es el mismo para todos los entornos. La URL del servicio la defines tú, en runtime, con `baseUrl`.

### Opciones obligatorias

```typescript
import { crearCliente } from "@eva_solutions/procesador-pagos-sdk";

const cliente = crearCliente({
  apiKey: process.env.EVA_PAGOS_API_KEY!,
  baseUrl: process.env.EVA_PAGOS_BASE_URL!,
});
```

Si falta `apiKey` o `baseUrl`, o esta última no es válida, `crearCliente` lanza un `Error` síncrono. Los mensajes llevan el prefijo `[procesador-pagos-sdk]` y **nunca** incluyen el valor recibido.

### `baseUrl`: formas aceptadas y rechazadas

`baseUrl` es el **origin** del servicio. El SDK lo valida al crear el cliente y lo normaliza a `URL.origin`.

| Forma | Resultado |
|---|---|
| `https://pagos.example.com` | Aceptada. |
| `https://pagos.example.com:8443` | Aceptada (puerto explícito). |
| `https://pagos.example.com/` | Aceptada; se normaliza a `https://pagos.example.com`. |
| `http://localhost:6000`, `http://127.0.0.1:6000`, `http://[::1]:6000` | Aceptada (http solo en loopback). |
| `http://pagos.example.com` | Rechazada: http fuera de loopback. |
| `ftp://host`, otros esquemas | Rechazada: solo `https` (o `http` en loopback). |
| `https://usuario:clave@host` | Rechazada: credenciales. |
| `https://host/v1` | Rechazada: path distinto de `/`. |
| `https://host?x=1`, `https://host/?` | Rechazada: query (incluso vacía). |
| `https://host#f`, `https://host/#` | Rechazada: fragmento (incluso vacío). |
| `not a url`, `""`, `undefined`, no string | Rechazada: malformada o ausente. |

Por qué no se permite un path: el SDK arma cada URL con `new URL(path, baseUrl)`, que descarta en silencio el path de la base. Rechazarlo evita que un `baseUrl` con prefijo apunte a otro lado sin avisar. Ver [ADR-022](decisions.md#adr-022--baseurl-en-runtime-solo-origin).

### Variables de entorno sugeridas

El SDK no lee ninguna variable de entorno: todo entra por `crearCliente`. Los nombres son una convención, no una obligación.

| Variable                   | Descripción                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `EVA_PAGOS_API_KEY`        | API key del proyecto. Secreta: solo en el servidor.                                   |
| `EVA_PAGOS_BASE_URL`       | Origin del servicio Procesador-de-pagos para ese entorno (ver tabla de `baseUrl`).    |
| `EVA_PAGOS_WEBHOOK_SECRET` | secretKey HMAC. Solo necesaria en handlers de webhooks.                               |

### Un entorno, una `baseUrl`

El entorno lo decide la configuración de tu despliegue, no la versión del paquete instalada:

| Entorno consumidor    | `baseUrl`                                           |
| --------------------- | --------------------------------------------------- |
| Desarrollo local      | `http://localhost:6000` (o el puerto de tu servicio local) |
| Staging / development | `https://` + el host del servicio en ese entorno    |
| Producción            | `https://` + el host del servicio en producción     |

---

## 2. Setup como contribuidor del SDK

### Clonar e instalar

Requisitos: Node 20+ y pnpm `11.28.2` (campo `packageManager`).

```bash
git clone https://github.com/eva-solutions-org/procesador-pagos-sdk.git
cd procesador-pagos-sdk
pnpm install --frozen-lockfile
```

`pnpm-workspace.yaml` contiene `allowBuilds: esbuild: true`. pnpm 11 bloquea los scripts de instalación de dependencias no aprobadas y falla con `ERR_PNPM_IGNORED_BUILDS`; esa entrada aprueba solo `esbuild`.

### Scripts pnpm

```bash
pnpm build            # tsdown → dist/ (ESM + CJS + .d.ts) para "." y "./webhooks".
pnpm typecheck        # tsc --noEmit.
pnpm test             # vitest watch mode.
pnpm test:run         # vitest run (CI).
pnpm lint             # oxlint.
pnpm format           # oxfmt.
pnpm changeset        # registra un cambio para el próximo release.
pnpm prepublishOnly   # lint + typecheck + test:run + build (corre antes de publicar).
```

No hay variables de entorno de build ni builds por entorno: `pnpm build` produce el único artefacto que se publica.

### Ejecución de tests

```bash
pnpm test:run                                     # todos
pnpm test:run tests/features/pagos/crear-pago     # un archivo
pnpm test:run -t 'crear-pago > caso éxito'        # por nombre
```

> Si tu pnpm local no coincide con `packageManager`, usa `npx --yes pnpm@11.28.2 <subcomando> --config.pm-on-fail=ignore` (la bandera va después del subcomando).

### Publicación

El flujo de release (Changesets, Version PR, token inicial y trusted publishing) está en la sección "Publicación (mantenedores)" del [README](../README.md#-publicación-mantenedores).

---

## 3. Configuración de runtime targets

| Runtime             | Versión mínima                                  | Notas                                            |
| ------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Node                | 20.0+                                           | `engines.node >= 20` en `package.json`.          |
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
