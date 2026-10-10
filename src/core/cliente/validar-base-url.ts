const PREFIJO = "[procesador-pagos-sdk] baseUrl";

const HOSTS_LOOPBACK = new Set(["localhost", "[::1]"]);
const IPV4_LOOPBACK = /^127(?:\.\d{1,3}){3}$/;

const esLoopback = (hostname: string): boolean =>
  HOSTS_LOOPBACK.has(hostname) || IPV4_LOOPBACK.test(hostname);

/**
 * Valida `baseUrl` y retorna su `URL.origin`.
 *
 * Solo se acepta un origin: `https:` (o `http:` en loopback), sin credenciales,
 * path, query ni fragmento. `new URL(path, base)` descarta en silencio el path
 * de la base, por eso un path se rechaza en vez de ignorarse.
 *
 * Ningún mensaje repite el valor recibido (puede traer credenciales o tokens).
 *
 * @internal
 */
export const validarBaseUrl = (baseUrl: unknown): string => {
  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    throw new Error(
      `${PREFIJO} es requerido y debe ser string no vacío (origin, ej. https://host)`,
    );
  }

  // `?` y `#` vacíos no sobreviven en `search`/`hash`: se detectan en el string crudo.
  if (baseUrl.includes("?")) {
    throw new Error(`${PREFIJO} inválida: no puede contener query (?)`);
  }
  if (baseUrl.includes("#")) {
    throw new Error(`${PREFIJO} inválida: no puede contener fragmento (#)`);
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`${PREFIJO} inválida: URL malformada`);
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error(`${PREFIJO} inválida: no puede incluir credenciales (usuario/contraseña)`);
  }

  const esHttpsValido = parsed.protocol === "https:";
  const esHttpLoopback = parsed.protocol === "http:" && esLoopback(parsed.hostname);
  if (!esHttpsValido && !esHttpLoopback) {
    throw new Error(`${PREFIJO} inválida: debe usar https (http solo en loopback)`);
  }

  if (parsed.pathname !== "/") {
    throw new Error(`${PREFIJO} inválida: debe ser un origin sin path`);
  }

  return parsed.origin;
};
