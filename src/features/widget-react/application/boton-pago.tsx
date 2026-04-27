/**
 * Componente `<BotonPago>` (REQ-WIDGET-001..014).
 *
 * Render por defecto: un botón con inline styles que muestra el flujo
 * (creando → pagando → procesando → completado/fallido).
 *
 * Override del consumidor:
 * - `style` / `styles` — merge sobre defaults.
 * - `className` — desactiva inline base, el consumidor controla CSS.
 * - `children` (render-prop) — control total, recibe `ApiRenderPropBoton`.
 *
 * El keyframe `sdk-pago-spin` para el spinner se inyecta una sola vez al
 * primer mount como `<style>` global.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { useBotonPago } from './use-boton-pago.js';
import {
  ESTILOS_DEFAULT_BOTON,
  ESTILOS_DISABLED,
  ESTILOS_HOVER,
  ESTILOS_SPINNER,
  KEYFRAME_SPINNER,
} from '../domain/estilos-defaults.js';
import type {
  EstadoBoton,
  PropsBotonPago,
} from '../domain/index.js';

const ID_KEYFRAME_TAG = 'sdk-pago-keyframe-style';

function inyectarKeyframe(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(ID_KEYFRAME_TAG)) return;
  const style = document.createElement('style');
  style.id = ID_KEYFRAME_TAG;
  style.textContent = KEYFRAME_SPINNER;
  document.head.appendChild(style);
}

function obtenerTextoSegunEstado(estado: EstadoBoton, props: PropsBotonPago): string {
  switch (estado.fase) {
    case 'inicial':
      return props.textoBoton ?? `Pagar ${props.moneda} ${props.monto}`;
    case 'creando':
      return props.textoCreando ?? 'Preparando...';
    case 'pagando':
      return props.textoProcesando ?? 'Esperando pago...';
    case 'procesando':
      return props.textoProcesando ?? 'Confirmando tu pago - no cierres esta ventana';
    case 'completado':
      return 'Pago completado';
    case 'fallido':
      return props.textoReintentar ?? 'Reintentar';
  }
}

export function BotonPago(props: PropsBotonPago): ReactElement {
  const api = useBotonPago(props);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    inyectarKeyframe();
  }, []);

  // Render-prop: control total al consumidor.
  if (props.children) {
    return <>{props.children(api)}</>;
  }

  // Render default: inline styles + className override.
  const fase = api.estado.fase;
  const deshabilitado = fase !== 'inicial' && fase !== 'fallido' && fase !== 'completado';

  const estiloFinal: CSSProperties | undefined = props.className
    ? undefined
    : {
        ...ESTILOS_DEFAULT_BOTON,
        ...(hover && !deshabilitado ? ESTILOS_HOVER : {}),
        ...(deshabilitado ? ESTILOS_DISABLED : {}),
        ...props.style,
        ...props.styles?.boton,
      };

  const textoEstado = obtenerTextoSegunEstado(api.estado, props);
  const mostrarSpinner = fase === 'creando' || fase === 'procesando';

  return (
    <button
      type="button"
      style={estiloFinal}
      className={props.className}
      disabled={deshabilitado}
      onClick={(): void => {
        void api.iniciar();
      }}
      onMouseEnter={(): void => setHover(true)}
      onMouseLeave={(): void => setHover(false)}
    >
      {mostrarSpinner ? (
        <span
          style={{ ...ESTILOS_SPINNER, ...props.styles?.spinner }}
          aria-hidden="true"
        />
      ) : null}
      <span style={props.styles?.mensaje}>{textoEstado}</span>
    </button>
  );
}
