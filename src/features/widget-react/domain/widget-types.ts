/**
 * Tipos del widget Prometeo (CDN externo) — describen el shape mínimo que
 * usa nuestro `BotonPago` para abrir el widget.
 *
 * El SDK Prometeo se carga dinámicamente desde un CDN; los tipos acá
 * documentan la API consumida y permiten typecheck en el wrapper.
 */

export interface PrometeoWidgetGlobal {
  init: (widgetId: string, intentId: string) => PrometeoWidgetInstance;
  Messaging: {
    PAYMENT_SUCCESS: string;
    ERROR: string;
    CLOSE: string;
    LOGIN: string;
  };
}

export interface PrometeoWidgetInstance {
  open: (opciones: {
    paymentIntentId: string;
    allowedFeatureLevel: number;
    dynamicAmount?: boolean;
    dynamicTimer?: number;
    customStyles?: Record<string, unknown>;
  }) => void;
  close: () => void;
  on: (evento: string, callback: (payload: unknown) => void) => void;
}

export interface PagoExitosoWidget {
  operationNumber: string;
  requestId: string;
}

declare global {
  interface Window {
    Prometeo?: PrometeoWidgetGlobal;
  }
}
