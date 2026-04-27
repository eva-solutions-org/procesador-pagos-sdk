/**
 * Resuelve el `widgetId` del Prometeo widget desde:
 * 1. Prop explícita (passed argument).
 * 2. `import.meta.env.VITE_PROMETEO_WIDGET_ID` (Vite).
 * 3. `process.env.NEXT_PUBLIC_PROMETEO_WIDGET_ID` (Next.js).
 *
 * Throw síncrono con mensaje claro si ninguna fuente provee el id —
 * error de programación, no flujo de negocio.
 */

interface ImportMetaConEnv {
  env?: { VITE_PROMETEO_WIDGET_ID?: string };
}

export function resolverWidgetId(propExplicita?: string): string {
  if (propExplicita && propExplicita.trim()) {
    return propExplicita;
  }

  // Vite — `import.meta.env`
  try {
    const meta = (import.meta as unknown as ImportMetaConEnv) ?? {};
    const desdeVite = meta.env?.VITE_PROMETEO_WIDGET_ID;
    if (typeof desdeVite === 'string' && desdeVite.trim()) {
      return desdeVite;
    }
  } catch {
    /* import.meta no disponible — continuar */
  }

  // Next / Node — `process.env`
  if (typeof process !== 'undefined' && process.env) {
    const desdeNext = process.env.NEXT_PUBLIC_PROMETEO_WIDGET_ID;
    if (typeof desdeNext === 'string' && desdeNext.trim()) {
      return desdeNext;
    }
  }

  throw new Error(
    '[procesador-pagos-sdk] widgetId no resuelto. Pasalo como prop `widgetId` ' +
      'al `<BotonPago>` o configurá `VITE_PROMETEO_WIDGET_ID` (Vite) / ' +
      '`NEXT_PUBLIC_PROMETEO_WIDGET_ID` (Next.js).',
  );
}
