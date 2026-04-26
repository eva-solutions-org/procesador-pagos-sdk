/**
 * Excepción CONTROLADA para wrapping interno de errores de programación.
 *
 * IMPORTANTE: el SDK sigue paradigma funcional con Result Pattern.
 * `AppError` extiende `Error` para preservar stack traces, pero
 * **NO debe usarse en operaciones públicas** que retornan `Resultado<T>`.
 *
 * Casos de uso permitidos:
 * - `apiKey` ausente en `crearCliente` (throw síncrono — error de programación).
 * - Wrapping interno de errores no recuperables (`Runtime no soporta timing-safe`).
 * - Async iterator `iterarPagos` (excepción C3 documentada).
 *
 * Casos PROHIBIDOS:
 * - Cualquier flujo de negocio (validación, HTTP, parseo). Usar Result Pattern.
 *
 * El `cause` opcional sigue la convención ECMA `Error.cause` (Node 18+).
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public override readonly cause?: unknown;

  constructor(statusCode: number, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
