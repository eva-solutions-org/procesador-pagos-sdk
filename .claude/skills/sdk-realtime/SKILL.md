---
name: sdk-realtime
description: Adapters de pub/sub y SSE del SDK procesador-pagos (full-stack-checkout v0.2). Cargar al modificar adapter-memoria, adapter-upstash, adapter-durable-objects, sse-hub, abrir-stream-sse, dedup-eventos, heartbeat, sanitizar-sse, handler-eventos-sse, calcular-event-id, marca DURABLE_OBJECTS, replay buffer, NDJSON, EventSource del cliente, polling-pago, sse-pago, cargar-prometeo.
---

Lee y aplica las reglas de la sección "Adapters de pub/sub" de `docs/configuration.md` y los flujos SSE de `docs/architecture.md` (sección 0). Para customizaciones de heartbeat, dedup TTL, o replay buffer, consultar el design v2.1 (`engram://sdd/full-stack-checkout/design`). Patrón crítico FIX I3: el handler/abrirStreamSSE NO debe resolver hasta que `stream.onAbort` dispare — sino el stream se cierra prematuramente (Hono issues #2050, #2993).
