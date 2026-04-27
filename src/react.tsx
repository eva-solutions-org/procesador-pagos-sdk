/**
 * Entry point `@eva/procesador-pagos-sdk/react` — frontend React.
 *
 * Expone `<BotonPago>` y el hook `useBotonPago()` para construir un widget
 * custom con render-prop o composición.
 *
 * Requiere `react` y `react-dom` como peer dependencies (optional).
 *
 * Ver docs/security.md — el `monto` y `moneda` que recibe `<BotonPago>`
 * son DISPLAY ONLY. El backend del consumidor recalcula desde su BD.
 */

export { BotonPago, useBotonPago } from './features/widget-react/index.js';
export type {
  PropsBotonPago,
  OpcionesUseBotonPago,
  EstadoBoton,
  ApiRenderPropBoton,
} from './features/widget-react/index.js';
