/**
 * Regras de leitura e escrita do catálogo de portas do assistente interno.
 *
 * Estes testes devem ser escritos ANTES da implementação e mostrados vermelho.
 */

import { describe, expect, it } from "vitest";
import type { Metodo } from "./tipos";
import { CATALOGO_DE_PORTAS } from "./catalogo.gerado";
import { CARREGADORES } from "./catalogo.gerado";
import { CARREGADORES_DE_ESCRITA } from "./catalogo.gerado";
import {
  AREAS_SO_LEITURA,
  ESCRITA_PERMITIDA,
  PREFIXOS_PROIBIDOS,
  PORTAS_PROIBIDAS,
  SUFIXOS_PROIBIDOS,
  casaComPrefixo,
  escritaPermitida,
  portaDeLeituraPermitida,
  acaoPermitida,
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

  it("nenhuma porta do catalogo casa com PREFIXOS_PROIBIDOS", () => {
    for (const p of CATALOGO_DE_PORTAS) {
      const proibida = PREFIXOS_PROIBIDOS.some((pre) =>
        casaComPrefixo(p.id, pre),
      );
      expect(proibida).toBe(false);
    }
  });

  it("ids reais proibidos (fora do catalogo) sao false em leitura e escrita", () => {
    const proibidosReais = [
      "cron/agenda-expira-pendentes",
      "admin/audit",
      "admin/lgpd/requests",
      "webhooks/channel",
    ];
    for (const id of proibidosReais) {
      expect(portaDeLeituraPermitida(id)).toBe(false);
      expect(escritaPermitida(id, "POST")).toBe(false);
      expect(escritaPermitida(id, "PATCH")).toBe(false);
      expect(escritaPermitida(id, "PUT")).toBe(false);
      expect(escritaPermitida(id, "DELETE")).toBe(false);
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
    const rx = /(send|enviar|dispatch|disparar|invite|convite|role|members\/.*remove|revoke|unblock|credential|token)/i;
    const portasPublicacao = ["ai/agents/:id/publish", "ai/followup-flows/:id/publish"];
    for (const e of ESCRITA_PERMITIDA) {
      expect(e.porta).not.toMatch(rx);
      if (/publish/i.test(e.porta)) {
        expect(portasPublicacao).toContain(e.porta);
      }
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

describe("CARREGADORES_DE_ESCRITA", () => {
  it("para cada entrada de ESCRITA_PERMITIDA, o carregador devolve função no método", async () => {
    for (const e of ESCRITA_PERMITIDA) {
      const carregador = CARREGADORES_DE_ESCRITA[e.porta];
      expect(carregador).toBeDefined();
      if (!carregador) continue;
      const modulo = await carregador();
      expect(modulo[e.metodo as keyof typeof modulo]).toBeDefined();
    }
  });

  it("toda chave de CARREGADORES_DE_ESCRITA está em ESCRITA_PERMITIDA", () => {
    for (const porta of Object.keys(CARREGADORES_DE_ESCRITA)) {
      expect(ESCRITA_PERMITIDA.some((e) => e.porta === porta)).toBe(true);
    }
  });
});

describe("acaoPermitida", () => {
  it("porta sem acoes libera qualquer corpo", () => {
    expect(acaoPermitida("ai/agents", "POST", { qualquer: 1 })).toBe(true);
    expect(acaoPermitida("ai/agents", "POST", null)).toBe(true);
  });

  it("prospecting aceita as quatro acoes liberadas", () => {
    for (const action of ["adjust_pace", "pause", "select", "select_in_queue"]) {
      expect(acaoPermitida("prospecting", "POST", { action })).toBe(true);
    }
  });

  it("prospecting recusa start, resume, configure, discard_unselected, search, vazio e null", () => {
    for (const action of ["start", "resume", "configure", "discard_unselected", "search"]) {
      expect(acaoPermitida("prospecting", "POST", { action })).toBe(false);
    }
    expect(acaoPermitida("prospecting", "POST", {})).toBe(false);
    expect(acaoPermitida("prospecting", "POST", null)).toBe(false);
  });

  it("a porta de publicar agente aceita porque nao restringe acoes", () => {
    expect(acaoPermitida("ai/agents/:id/publish", "POST", { qualquer: 1 })).toBe(true);
    expect(acaoPermitida("ai/agents/:id/publish", "POST", null)).toBe(true);
  });

  it("a porta de publicar follow-up aceita porque nao restringe acoes", () => {
    expect(acaoPermitida("ai/followup-flows/:id/publish", "POST", { qualquer: 1 })).toBe(true);
    expect(acaoPermitida("ai/followup-flows/:id/publish", "POST", null)).toBe(true);
  });

  it("escritaPermitida aceita as duas portas de publicar", () => {
    expect(escritaPermitida("ai/agents/:id/publish", "POST")).toBe(true);
    expect(escritaPermitida("ai/followup-flows/:id/publish", "POST")).toBe(true);
  });

  it("campaigns/:id PATCH continua proibida", () => {
    expect(escritaPermitida("campaigns/:id", "PATCH")).toBe(false);
  });
});
