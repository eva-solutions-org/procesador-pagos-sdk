---
name: sdk-security
description: Reglas de seguridad del SDK procesador-pagos. Cargar al modificar comparar-firmas-seguro, calcular-hmac-sha256, errores que podrían leakear apiKey, mapeo de errores HTTP, defensa runtime C5, runtime targets, alCrearPago obligatorio, throw factory rutasPagos, manipulación monto frontend, validación server-side OBLIGATORIA, monto canónico BD, ADR-020, Security boundary, identity alCrearPago, sanitización SSE CR/LF, CVE-2026-29085, verificarAcceso ausente.
---

Lee y aplica las reglas de `docs/security.md` (sección 2 "Validación server-side OBLIGATORIA" + sección 8 "Sanitización SSE") y `docs/decisions.md` (ADR-020 — Security boundary). Triggers nuevos v0.2: cualquier cambio que toque `alCrearPago`, `validarOpcionesRutas`, props `monto`/`moneda` del `<BotonPago>`, `sanitizarCampoSSE`, o cualquier mensaje de error que pueda exponer datos sensibles.
