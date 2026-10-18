/**
 * Regras de leitura e escrita do catálogo de portas do assistente interno.
 *
 * Estes testes devem ser escritos ANTES da implementação e mostrados vermelho.
 */

import { describe, expect, it } from "vitest";
import type { Metodo } from "./tipos";
import { CATALOGO_DE_PORTAS } from "./catalogo.gerado";
import { CARREGADORES } from "./catalogo.gerado";
import {
  AREAS_SO_LEITURA,
  ESCRITA_PERMITIDA,
  PREFIXOS_PROIBIDOS,
  PORTAS_PROIBIDAS,
  SUFIXOS_PROIBIDOS,
  casaComPrefixo,
  escritaPermitida,
  portaDeLeituraPermitida,
} from "./regras";

describe("casaComPrefixo", () => {
  it("id igual ao prefixo sem barra é verdadeiro", () => {
    expect(casaComPrefixo("team", "team/")).toBe(true);
  });

  it("id que não começa com o prefixo é falso", () => {
    expect(casaComPrefixo("teamx", "team/")).toBe(false);
  });

  it("id dentro do prefixo é verdadeiro", () => {
    expect(casaComPrefixo("team/invites", "team/")).toBe(true);
  });
});

describe("portaDeLeituraPermitida", () => {
  it("campaigns/:id é legível", () => {
    expect(portaDeLeituraPermitida("campaigns/:id")).toBe(true);
  });

  it("team é legível", () => {
    expect(portaDeLeituraPermitida("team")).toBe(true);
  });

  it("team/assignable é legível", () => {
    expect(portaDeLeituraPermitida("team/assignable")).toBe(true);
  });

  it("team/invites não é legível (porta proibida exata)", () => {
    expect(portaDeLeituraPermitida("team/invites")).toBe(false);
  });

  it("messages/:id/media não é legível (porta proibida exata)", () => {
    expect(portaDeLeituraPermitida("messages/:id/media")).toBe(false);
  });

  it("settings/api-tokens não é legível (prefixo proibido)", () => {
    expect(portaDeLeituraPermitida("settings/api-tokens")).toBe(false);
  });

  it("as 8 portas com efeito colateral não são legíveis", () => {
    const proibidas = [
      "agenda/google/connect",
      "agenda/google/callback",
      "plataformas-de-anuncio/google/connect",
      "plataformas-de-anuncio/google/callback",
      "integrations/nuvemshop/callback",
      "contacts/export",
      "contacts/:id/avatar",
      "conversations/:id/notes/:noteId/media",
    ];
    for (const id of proibidas) {
      expect(portaDeLeituraPermitida(id)).toBe(false);
    }
  });

  it("CARREGADORES não tem nenhuma das 8 portas com efeito colateral", () => {
    const proibidas = [
      "agenda/google/connect",
      "agenda/google/callback",
      "plataformas-de-anuncio/google/connect",
      "plataformas-de-anuncio/google/callback",
      "integrations/nuvemshop/callback",
      "contacts/export",
      "contacts/:id/avatar",
      "conversations/:id/notes/:noteId/media",
    ];
    for (const id of proibidas) {
      expect(CARREGADORES).not.toHaveProperty(id);
    }
  });

  it("toda porta cujo id termina em /connect ou /callback não é lida nem escrita", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      const sufixo = SUFIXOS_PROIBIDOS.some((s) => p.id.endsWith(s));
      if (sufixo) {
        expect(portaDeLeituraPermitida(p.id)).toBe(false);
        for (const m of ["POST", "PATCH", "PUT"] as const) {
          expect(escritaPermitida(p.id, m)).toBe(false);
        }
      }
    }
  });

  it("pipelines/:id/board continua legível", () => {
    expect(portaDeLeituraPermitida("pipelines/:id/board")).toBe(true);
  });

  it("toda porta com prefixo proibido é falsa", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      const proibida = PREFIXOS_PROIBIDOS.some((pre) =>
        casaComPrefixo(p.id, pre),
      );
      if (proibida) {
        expect(portaDeLeituraPermitida(p.id)).toBe(false);
      }
    }
  });

  it("nao existe nem para porta inventada", () => {
    expect(portaDeLeituraPermitida("x/nova")).toBe(false);
  });

  it("e falsa quando a porta nao tem GET", () => {
    const semGet = CATALOGO_DE_PORTAS.find((p) => !p.metodos.includes("GET"));
    if (
      semGet &&
      !PREFIXOS_PROIBIDOS.some((pre) => casaComPrefixo(semGet.id, pre)) &&
      !PORTAS_PROIBIDAS.includes(semGet.id)
    ) {
      expect(portaDeLeituraPermitida(semGet.id)).toBe(false);
    }
  });

  it("toda porta de leitura permitida existe no catalogo com GET", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      if (portaDeLeituraPermitida(p.id)) {
        expect(p.metodos.includes("GET")).toBe(true);
        expect(
          PREFIXOS_PROIBIDOS.some((pre) => casaComPrefixo(p.id, pre)),
        ).toBe(false);
        expect(PORTAS_PROIBIDAS.includes(p.id)).toBe(false);
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

  it("AREAS_SO_LEITURA nunca permite escrita, incluindo raiz", () => {
    expect(escritaPermitida("messages", "POST")).toBe(false);
    expect(escritaPermitida("messages", "PATCH")).toBe(false);
    expect(escritaPermitida("campaigns", "POST")).toBe(false);
    expect(escritaPermitida("team", "POST")).toBe(false);
    for (const p of CATALOGO_DE_PORTAS) {
      const area = AREAS_SO_LEITURA.some((pre) =>
        casaComPrefixo(p.id, pre),
      );
      if (area) {
        for (const m of ["POST", "PATCH", "PUT"] as const) {
          if (p.metodos.includes(m)) {
            expect(escritaPermitida(p.id, m)).toBe(false);
          }
        }
      }
    }
  });

  it("toda entrada de ESCRITA_PERMITIDA existe no catalogo com aquele metodo", () => {
    for (const e of ESCRITA_PERMITIDA) {
      const p = CATALOGO_DE_PORTAS.find((x) => x.id === e.porta);
      expect(p).toBeDefined();
      expect(p?.metodos.includes(e.metodo as Metodo)).toBe(true);
    }
  });

  it("escritaPermitida e true para cada entrada de ESCRITA_PERMITIDA", () => {
    for (const e of ESCRITA_PERMITIDA) {
      expect(escritaPermitida(e.porta, e.metodo as Metodo)).toBe(true);
    }
  });

  it("nenhuma entrada de ESCRITA_PERMITIDA casa com proibidos", () => {
    for (const e of ESCRITA_PERMITIDA) {
      const proibidaPorPrefixo = PREFIXOS_PROIBIDOS.some((pre) =>
        casaComPrefixo(e.porta, pre),
      );
      const proibidaPorPorta = PORTAS_PROIBIDAS.includes(e.porta);
      const soLeitura = AREAS_SO_LEITURA.some((pre) =>
        casaComPrefixo(e.porta, pre),
      );
      expect(proibidaPorPrefixo).toBe(false);
      expect(proibidaPorPorta).toBe(false);
      expect(soLeitura).toBe(false);
    }
  });

  it("nenhuma entrada de ESCRITA_PERMITIDA casa com proibidos de escrita", () => {
    const rx = /(send|enviar|dispatch|disparar|invite|convite|role|members\/.*remove|revoke|unblock|publish|credential|token)/i;
    for (const e of ESCRITA_PERMITIDA) {
      expect(e.porta).not.toMatch(rx);
    }
  });

  it("nao permite escrita em porta com prefixo proibido", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      const proibida = PREFIXOS_PROIBIDOS.some((pre) =>
        casaComPrefixo(p.id, pre),
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
