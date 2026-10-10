import { describe, expect, it } from "vitest";
import { crearCliente } from "../../src/index.js";
import { validarBaseUrl } from "../../src/core/cliente/validar-base-url.js";

const API_KEY_SECRETA = "SECRET-KEY-123";

describe("validarBaseUrl — REQ-PAG-01..09", () => {
  describe("acepta", () => {
    it.each([
      ["https://pagos.example.com", "https://pagos.example.com"],
      ["https://pagos.example.com/", "https://pagos.example.com"],
      ["https://pagos.example.com:8443", "https://pagos.example.com:8443"],
      ["HTTPS://Pagos.Example.COM", "https://pagos.example.com"],
      ["http://localhost:6000", "http://localhost:6000"],
      ["http://127.0.0.1:6000", "http://127.0.0.1:6000"],
      ["http://[::1]:6000", "http://[::1]:6000"],
    ])("Given %s Then retorna origin %s", (entrada, esperado) => {
      expect(validarBaseUrl(entrada)).toBe(esperado);
    });
  });

  describe("rechaza", () => {
    it.each([
      ["undefined", undefined, /baseUrl es requerido/],
      ["string vacío", "", /baseUrl es requerido/],
      ["número", 42, /baseUrl es requerido/],
      ["malformada", "esto no es una url", /URL malformada/],
      ["esquema ftp", "ftp://pagos.example.com", /https/],
      ["http remoto", "http://pagos.example.com", /https/],
      ["http IP privada no loopback", "http://10.0.0.5", /https/],
      ["host que empieza como loopback", "http://localhost.evil.com", /https/],
      ["IPv4 loopback como prefijo de dominio", "http://127.0.0.1.evil.com", /https/],
      ["IPv6 mapeada a IPv4 loopback", "http://[::ffff:127.0.0.1]", /https/],
      ["localhost con punto final", "http://localhost.", /https/],
      ["esquema javascript", "javascript:alert(1)", /https/],
      ["esquema data", "data:text/plain,x", /https/],
      ["path /v1", "https://pagos.example.com/v1", /path/],
      ["path profundo", "https://pagos.example.com/a/b", /path/],
      ["userinfo", "https://admin:s3cret@pagos.example.com", /credenciales/],
      ["solo usuario", "https://admin@pagos.example.com", /credenciales/],
      ["query", "https://pagos.example.com/?a=1", /query/],
      ["query sin path", "https://pagos.example.com?a=1", /query/],
      ["signo ? vacío", "https://pagos.example.com/?", /query/],
      ["hash", "https://pagos.example.com/#frag", /fragmento/],
      ["signo # vacío", "https://pagos.example.com/#", /fragmento/],
    ])("Given %s Then throw síncrono", (_nombre, entrada, patron) => {
      expect(() => validarBaseUrl(entrada)).toThrow(patron);
    });

    it("Given userinfo/query/hash Then el mensaje no repite ninguna parte del valor", () => {
      const entradas = [
        "https://admin:s3cret@pagos.example.com",
        "https://pagos.example.com/?token=abc123",
        "https://pagos.example.com/#frag-secreto",
        "http://remoto-secreto.example.com",
        "https://pagos.example.com/ruta-secreta",
      ];
      for (const entrada of entradas) {
        let mensaje = "";
        try {
          validarBaseUrl(entrada);
        } catch (err) {
          mensaje = (err as Error).message;
        }
        expect(mensaje).toMatch(/^\[procesador-pagos-sdk\] baseUrl /);
        for (const fragmento of [
          "admin",
          "s3cret",
          "abc123",
          "frag-secreto",
          "remoto-secreto",
          "ruta-secreta",
          "pagos.example.com",
        ]) {
          expect(mensaje).not.toContain(fragmento);
        }
      }
    });
  });
});

describe("crearCliente — baseUrl (REQ-PAG-01, REQ-PAG-10)", () => {
  it("Given baseUrl ausente Then throw síncrono", () => {
    expect(() => crearCliente({ apiKey: API_KEY_SECRETA } as never)).toThrow(
      /baseUrl es requerido/,
    );
  });

  it.each([
    ["ausente", undefined],
    ["malformada", "no-es-url"],
    ["http remoto", "http://pagos.example.com"],
    ["con path", "https://pagos.example.com/v1"],
    ["con userinfo", "https://u:p@pagos.example.com"],
    ["con query", "https://pagos.example.com/?a=1"],
    ["con hash", "https://pagos.example.com/#h"],
  ])("Given baseUrl %s Then el mensaje no contiene la apiKey", (_nombre, baseUrl) => {
    let mensaje = "";
    try {
      crearCliente({ apiKey: API_KEY_SECRETA, baseUrl } as never);
    } catch (err) {
      mensaje = (err as Error).message;
    }
    expect(mensaje).not.toBe("");
    expect(mensaje).not.toContain(API_KEY_SECRETA);
  });

  it("Given baseUrl https válida Then retorna cliente", () => {
    const cliente = crearCliente({ apiKey: API_KEY_SECRETA, baseUrl: "https://pagos.example.com" });
    expect(typeof cliente.pagos.crearPago).toBe("function");
  });

  it("Given baseUrl con path Then NO se llama a fetch (falla antes de construir el cliente)", () => {
    let llamadas = 0;
    const fetchEspia = (async () => {
      llamadas += 1;
      return new Response("{}");
    }) as typeof globalThis.fetch;
    expect(() =>
      crearCliente({
        apiKey: API_KEY_SECRETA,
        baseUrl: "https://pagos.example.com/v1",
        fetch: fetchEspia,
      }),
    ).toThrow(/path/);
    expect(llamadas).toBe(0);
  });
});
