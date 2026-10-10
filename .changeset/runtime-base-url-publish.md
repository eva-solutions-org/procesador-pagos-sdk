---
'@eva_solutions/procesador-pagos-sdk': minor
---

Runtime `baseUrl`, npm distribution under the `@eva_solutions` scope, and a slimmed package.

- `crearCliente({ apiKey, baseUrl })` now requires `baseUrl` at runtime (origin only: https, or http on loopback; no path, userinfo, query or fragment). One published artifact serves every environment; the build-time URL injection is gone.
- The package is published to npm as `@eva_solutions/procesador-pagos-sdk` under the MIT license.
- Removed the `hono`, `react`, pub/sub, SSE and widget entries. Only `.` and `./webhooks` remain.

**Migration**: rename the dependency to `@eva_solutions/procesador-pagos-sdk`, pass `baseUrl` to `crearCliente`, and drop any import from the removed entries.
