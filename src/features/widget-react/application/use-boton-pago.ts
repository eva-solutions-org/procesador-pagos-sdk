/**
 * Hook `useBotonPago()` (REQ-WIDGET-011).
 *
 * Encapsula el flujo end-to-end del checkout:
 *
 * 1. POST `/crear` con monto/moneda/referenciaExterna/metadata.
 * 2. Cargar Prometeo widget desde CDN.
 * 3. Abrir widget con `intentId` recibido.
 * 4. Escuchar `PAYMENT_SUCCESS` / `ERROR` / `CLOSE` del widget.
 * 5. Tras `PAYMENT_SUCCESS`, levantar SSE o polling según `modo`.
 * 6. Si llega estado terminal `completado` → `onCompletado(pago)`.
 * 7. Si timeout suave → `onTimeoutSuave(pago)`.
 *
 * StrictMode tolerante (FIX M1): el primer mount-unmount-mount de StrictMode
 * NO debe duplicar requests. AbortController dentro del closure de `iniciar`
 * + `useRef` aseguran que un re-mount aborta el flujo en vuelo y arranca uno
 * nuevo limpio.
 *
 * Cleanup en unmount: aborta in-flight, cierra widget, cierra SSE.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Pago } from '../../pagos/domain/index.js';
import type {
  ApiRenderPropBoton,
  EstadoBoton,
  OpcionesUseBotonPago,
  PrometeoWidgetInstance,
} from '../domain/index.js';
import { cargarPrometeo } from '../infrastructure/cargar-prometeo.js';
import { resolverWidgetId } from '../infrastructure/resolver-widget-id.js';
import type { RespuestaCrearPago } from '../infrastructure/auto-detectar-modo.js';
import { pollearPago } from '../infrastructure/polling-pago.js';
import {
  abrirSSE,
  esEstadoTerminal,
  eventoAPagoParcial,
} from '../infrastructure/sse-pago.js';

export function useBotonPago(opciones: OpcionesUseBotonPago): ApiRenderPropBoton {
  const [estado, setEstado] = useState<EstadoBoton>({ fase: 'inicial' });
  const [error, setError] = useState<string | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const widgetRef = useRef<PrometeoWidgetInstance | null>(null);
  const sseHandleRef = useRef<{ cerrar: () => void } | null>(null);

  const limpiarRecursos = useCallback((): void => {
    if (sseHandleRef.current) {
      sseHandleRef.current.cerrar();
      sseHandleRef.current = null;
    }
    if (widgetRef.current) {
      try {
        widgetRef.current.close();
      } catch {
        /* idempotente */
      }
      widgetRef.current = null;
    }
  }, []);

  const cerrar = useCallback((): void => {
    abortRef.current?.abort();
    limpiarRecursos();
    setEstado({ fase: 'inicial' });
    setError(null);
    setPago(null);
    setIntentId(null);
  }, [limpiarRecursos]);

  // Cleanup en unmount.
  useEffect(() => {
    return (): void => {
      abortRef.current?.abort();
      limpiarRecursos();
    };
  }, [limpiarRecursos]);

  const iniciar = useCallback(async (): Promise<void> => {
    // FIX M1 — StrictMode tolerante: abortar in-flight si hay.
    abortRef.current?.abort();
    limpiarRecursos();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setError(null);
    setPago(null);
    setIntentId(null);
    setEstado({ fase: 'creando' });

    const basePath = opciones.basePath ?? '/';
    const pathBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

    try {
      // 1. POST /crear
      const res = await fetch(`${pathBase}/crear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto: opciones.monto,
          moneda: opciones.moneda,
          referenciaExterna: opciones.referenciaExterna,
          tipo: 'pago_unico',
          ...(opciones.metadata !== undefined ? { metadata: opciones.metadata } : {}),
        }),
        signal,
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`Error al crear pago: ${res.status} ${err}`);
      }
      const respCrear = (await res.json()) as RespuestaCrearPago;

      if (signal.aborted) return;

      const widgetId = resolverWidgetId(opciones.widgetId);
      setIntentId(respCrear.intentId);
      setEstado({ fase: 'pagando', intentId: respCrear.intentId, pagoId: respCrear.pagoId });

      // 2. Cargar Prometeo
      await cargarPrometeo();
      if (signal.aborted) return;

      // 3. Abrir widget
      const Prometeo = window.Prometeo;
      if (!Prometeo) {
        throw new Error('[procesador-pagos-sdk] window.Prometeo no disponible tras carga');
      }
      const instance = Prometeo.init(widgetId, respCrear.intentId);
      widgetRef.current = instance;
      instance.open({
        paymentIntentId: respCrear.intentId,
        allowedFeatureLevel: 1,
      });

      // 4. Escuchar eventos del widget
      let pagoActivo = true;

      instance.on(Prometeo.Messaging.CLOSE, () => {
        if (!pagoActivo) return;
        pagoActivo = false;
        controller.abort();
        if (opciones.onCancelado) opciones.onCancelado();
        setEstado({ fase: 'inicial' });
      });

      instance.on(Prometeo.Messaging.ERROR, (payload: unknown) => {
        if (!pagoActivo) return;
        pagoActivo = false;
        const mensaje =
          typeof payload === 'object' && payload !== null && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : 'Error en widget Prometeo';
        setError(mensaje);
        setEstado({ fase: 'fallido', mensaje, pagoId: respCrear.pagoId });
        if (opciones.onFallido) {
          opciones.onFallido({ error: mensaje, codigo: 500 });
        }
      });

      instance.on(Prometeo.Messaging.PAYMENT_SUCCESS, () => {
        if (!pagoActivo) return;
        // 5. Levantar SSE o polling.
        setEstado({ fase: 'procesando', pagoId: respCrear.pagoId, modo: respCrear.modo });
        if (respCrear.modo === 'sse') {
          arrancarSSE(respCrear, signal);
        } else {
          arrancarPolling(respCrear, signal);
        }
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      setError(mensaje);
      setEstado({ fase: 'fallido', mensaje });
      if (opciones.onFallido) {
        opciones.onFallido({ error: mensaje, codigo: 500 });
      }
    }

    function arrancarSSE(resp: RespuestaCrearPago, sig: AbortSignal): void {
      const handle = abrirSSE({
        pagoId: resp.pagoId,
        basePath: pathBase,
        signal: sig,
        onEvento: (evento) => {
          if (esEstadoTerminal(evento.estado)) {
            const pagoFinal = eventoAPagoParcial(evento);
            setPago(pagoFinal);
            if (evento.estado === 'completado') {
              setEstado({ fase: 'completado', pago: pagoFinal });
              if (opciones.onCompletado) opciones.onCompletado(pagoFinal);
            } else {
              setEstado({ fase: 'fallido', mensaje: evento.estado, pagoId: resp.pagoId });
              if (opciones.onFallido) {
                opciones.onFallido({ error: evento.estado, codigo: 500, pago: pagoFinal });
              }
            }
            handle.cerrar();
            limpiarRecursos();
          }
        },
        onError: () => {
          // Fallback a polling si SSE falla.
          if (!sig.aborted) {
            handle.cerrar();
            arrancarPolling(resp, sig);
          }
        },
      });
      sseHandleRef.current = handle;
    }

    function arrancarPolling(resp: RespuestaCrearPago, sig: AbortSignal): void {
      void (async (): Promise<void> => {
        try {
          const resultado = await pollearPago({
            pagoId: resp.pagoId,
            basePath: pathBase,
            intervaloMs: opciones.intervaloMs ?? 2000,
            timeoutMs: opciones.timeoutMs ?? 60000,
            signal: sig,
          });
          setPago(resultado.pago);
          if (resultado.timeoutSuave) {
            if (opciones.onTimeoutSuave) opciones.onTimeoutSuave(resultado.pago);
            setEstado({ fase: 'fallido', mensaje: 'Timeout suave', pagoId: resp.pagoId });
          } else if (resultado.pago.estado === 'completado') {
            setEstado({ fase: 'completado', pago: resultado.pago });
            if (opciones.onCompletado) opciones.onCompletado(resultado.pago);
          } else {
            setEstado({
              fase: 'fallido',
              mensaje: resultado.pago.estado,
              pagoId: resp.pagoId,
            });
            if (opciones.onFallido) {
              opciones.onFallido({
                error: resultado.pago.estado,
                codigo: 500,
                pago: resultado.pago,
              });
            }
          }
          limpiarRecursos();
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          const mensaje = err instanceof Error ? err.message : 'Error en polling';
          setError(mensaje);
          setEstado({ fase: 'fallido', mensaje, pagoId: resp.pagoId });
          if (opciones.onFallido) {
            opciones.onFallido({ error: mensaje, codigo: 500 });
          }
        }
      })();
    }
  }, [opciones, limpiarRecursos]);

  return { iniciar, cerrar, estado, error, pago, intentId };
}
