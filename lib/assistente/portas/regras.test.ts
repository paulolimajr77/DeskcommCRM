/**
 * Regras de leitura e escrita do catálogo de portas.
 *
 * Estes testes devem ser escritos ANTES da implementação e mostrados vermelhos.
 * Hoje ESCRITA_PERMITIDA está vazia, então escritaPermitida é sempre false.
 */

import { describe, expect, it } from "vitest";
import type { Metodo } from "./tipos";
import { CATALOGO_DE_PORTAS } from "./catalogo.gerado";
import { CARREGADORES } from "./catalogo.gerado";
import {
  ESCRITA_PERMITIDA,
  PREFIXOS_PROIBIDOS,
  escritaPermitida,
  portaDeLeituraPermitida,
} from "./regras";

describe("portaDeLeituraPermitida", () => {
  it("toda porta com prefixo proibido e falsa", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      const proibida = PREFIXOS_PROIBIDOS.some((pre) =>
        p.id.startsWith(pre),
      );
      if (proibida) {
        expect(portaDeLeituraPermitida(p.id)).toBe(false);
      }
    }
  });

  it("nao existe nem para porta inventada", () => {
    expect(portaDeLeituraPermitida("x/nova")).toBe(false);
  });

  it("portas cron sao sempre proibidas de leitura (mesmo se sairem da lista)", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      if (p.id.startsWith("cron/")) {
        expect(portaDeLeituraPermitida(p.id)).toBe(false);
      }
    }
  });

  it("e falsa quando a porta nao tem GET", () => {
    const semGet = CATALOGO_DE_PORTAS.find((p) => !p.metodos.includes("GET"));
    if (semGet && !PREFIXOS_PROIBIDOS.some((pre) => semGet.id.startsWith(pre))) {
      expect(portaDeLeituraPermitida(semGet.id)).toBe(false);
    }
  });

  it("toda porta de leitura permitida existe no catalogo com GET", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      if (portaDeLeituraPermitida(p.id)) {
        expect(p.metodos.includes("GET")).toBe(true);
        expect(
          PREFIXOS_PROIBIDOS.some((pre) => p.id.startsWith(pre)),
        ).toBe(false);
      }
    }
  });
});

describe("escritaPermitida", () => {
  it("DELETE e sempre false para todas as portas do catalogo", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      expect(escritaPermitida(p.id, "DELETE")).toBe(false);
    }
  });

  it("porta invalida nao permite escrita", () => {
    expect(escritaPermitida("x/nova", "POST")).toBe(false);
    expect(escritaPermitida("x/nova", "PATCH")).toBe(false);
    expect(escritaPermitida("x/nova", "PUT")).toBe(false);
  });

  it("toda entrada de ESCRITA_PERMITIDA existe no catalogo com aquele metodo", () => {
    for (const e of ESCRITA_PERMITIDA) {
      const p = CATALOGO_DE_PORTAS.find((x) => x.id === e.porta);
      expect(p).toBeDefined();
      expect(p?.metodos.includes(e.metodo as Metodo)).toBe(true);
    }
  });

  it("nenhuma entrada de ESCRITA_PERMITIDA casa com proibidos de escrita", () => {
    const rx = /(send|enviar|dispatch|disparar|invite|convite|role|members\/.*remove|revoke)/i;
    for (const e of ESCRITA_PERMITIDA) {
      expect(e.porta).not.toMatch(rx);
    }
  });

  it("nao permite escrita em porta com prefixo proibido", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      const proibida = PREFIXOS_PROIBIDOS.some((pre) =>
        p.id.startsWith(pre),
      );
      if (proibida) {
        for (const m of ["POST", "PATCH", "PUT"] as const) {
          expect(escritaPermitida(p.id, m)).toBe(false);
        }
      }
    }
  });
});

describe("CARREGADORES", () => {
  it("todo CARREGADORES[id] corresponde a porta de leitura permitida", () => {
    for (const id of Object.keys(CARREGADORES)) {
      expect(portaDeLeituraPermitida(id)).toBe(true);
    }
  });

  it("toda porta de leitura permitida tem carregador", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      if (portaDeLeituraPermitida(p.id)) {
        expect(CARREGADORES).toHaveProperty(p.id);
      }
    }
  });
});
