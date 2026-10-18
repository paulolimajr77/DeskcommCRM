/**
 * Os COMANDOS do assistente (`/resumo`, `/checkup`, `/pendentes`, `/ajuda`) —
 * teste de unidade do lado que lê dado.
 *
 * O que estes testes prendem:
 *
 *  1. `/pendentes` é de ADMINISTRADOR, e a trava é do SERVIDOR: para quem não
 *     administra, o comando responde a explicação e NÃO lê a fila (nenhuma
 *     chamada à rota de propostas) — esconder botão na tela não é permissão.
 *  2. `/checkup` RODA a auditoria só para admin e LÊ a última para todos.
 *  3. `/resumo` conta da organização DA SESSÃO: a organização A não vê número
 *     nenhum da B, e a organização nunca viaja na URL das chamadas internas.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import {
  comandoDaPergunta,
  comandoSoDeAdmin,
  linhasDaAjuda,
} from "@/lib/assistente/comandos";
import {
  executarComando,
  montarResumo,
  sobreporFontesDosComandos,
} from "@/lib/assistente/comandos/executar";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta, Papel, ResultadoDeMetrica } from "@/lib/assistente/metricas";
import type { consultarMetrica } from "@/lib/assistente/metricas";
import { traduzir } from "@/lib/i18n/dicionario";

const t = (texto: string) => traduzir(texto, "pt-BR");

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

function ctxDe(orgId: string, papel: Papel): ContextoDeConsulta {
  return {
    orgId,
    papel,
    idioma: "pt-BR",
    fuso: "America/Sao_Paulo",
    agoraIso: "2026-10-18T15:00:00Z",
    bancoDosModulos: {} as ContextoDeConsulta["bancoDosModulos"],
  };
}

/** Um dublê de rota interna que devolve um corpo fixo, com o status pedido. */
function rota(corpo: unknown, status = 200): HandlerDeRota {
  return async () => Response.json(corpo, { status });
}

type Consultar = typeof consultarMetrica;

function consultarFalso(
  responder: (ctx: ContextoDeConsulta, id: string) => ResultadoDeMetrica,
): Consultar {
  return responder as unknown as Consultar;
}

const METRICA_OK = (dados: unknown): ResultadoDeMetrica => ({
  ok: true,
  metrica: "x",
  periodo: null,
  regua: "dublê de teste",
  dados,
  avisos: [],
});

afterEach(() => {
  sobreporFontesDosComandos(null);
});

describe("comandoDaPergunta — o texto que é comando", () => {
  it.each([
    ["/resumo", "resumo"],
    ["/checkup", "checkup"],
    ["/pendentes", "pendentes"],
    ["/ajuda", "ajuda"],
    ["/nova", "nova"],
    ["  /resumo  ", "resumo"],
    ["/RESUMO", "resumo"],
    ["/pendentes agora", "pendentes"],
  ])("%s → %s", (pergunta, esperado) => {
    expect(comandoDaPergunta(pergunta)).toBe(esperado);
  });

  it.each([
    ["quero um resumo de hoje", "pergunta em português"],
    ["ver /resumo", "a barra não está no começo"],
    ["/desconhecido", "comando que não existe"],
    ["resumo", "sem barra"],
    ["", "vazio"],
  ])("%s não é comando (%s)", (pergunta) => {
    expect(comandoDaPergunta(pergunta)).toBeNull();
  });

  it("só `/pendentes` é de administrador", () => {
    expect(comandoSoDeAdmin("pendentes")).toBe(true);
    for (const outro of ["resumo", "checkup", "ajuda", "nova"] as const) {
      expect(comandoSoDeAdmin(outro)).toBe(false);
    }
  });

  it("a lista da ajuda marca o comando de admin", () => {
    const linhas = linhasDaAjuda(t);
    expect(linhas.map((l) => l.comando)).toEqual(["resumo", "checkup", "pendentes", "ajuda", "nova"]);
    expect(linhas.filter((l) => l.soAdmin).map((l) => l.comando)).toEqual(["pendentes"]);
  });
});

describe("`/pendentes` — a trava de papel é do SERVIDOR", () => {
  it.each(["manager", "agent", "viewer"] as const)(
    "%s recebe a explicação e NADA da fila é lido",
    async (papel) => {
      let chamouAFila = false;
      sobreporFontesDosComandos({
        propostas: async () => {
          chamouAFila = true;
          return Response.json({ data: [{ id: "p1" }] });
        },
      });

      const saida = await executarComando("pendentes", ctxDe(ORG_A, papel), t);

      expect(saida.acoes).toEqual([]);
      expect(saida.resposta).toContain("administradores");
      expect(chamouAFila).toBe(false);
    },
  );

  it("admin recebe uma mudança por cartão", async () => {
    sobreporFontesDosComandos({
      propostas: async () => Response.json({ data: [{ id: "p1" }, { id: "p2" }] }),
    });

    const saida = await executarComando("pendentes", ctxDe(ORG_A, "admin"), t);

    expect(saida.resposta).toBe("Tem 2 mudanças esperando você.");
    expect(saida.acoes).toEqual([
      { tipo: "proposta", id: "p1" },
      { tipo: "proposta", id: "p2" },
    ]);
  });

  it("admin sem mudanças: uma frase, sem cartão", async () => {
    sobreporFontesDosComandos({ propostas: async () => Response.json({ data: [] }) });

    const saida = await executarComando("pendentes", ctxDe(ORG_A, "admin"), t);

    expect(saida.resposta).toBe("Nenhuma mudança esperando decisão.");
    expect(saida.acoes).toEqual([]);
  });
});

describe("`/ajuda` — o menu muda com o papel", () => {
  it("admin vê todos os comandos", async () => {
    const saida = await executarComando("ajuda", ctxDe(ORG_A, "admin"), t);
    for (const comando of ["/resumo", "/checkup", "/pendentes", "/ajuda", "/nova"]) {
      expect(saida.resposta).toContain(comando);
    }
  });

  it("quem não administra não vê `/pendentes`", async () => {
    const saida = await executarComando("ajuda", ctxDe(ORG_A, "manager"), t);
    expect(saida.resposta).not.toContain("/pendentes");
    expect(saida.resposta).toContain("/resumo");
  });
});

describe("`/checkup` — roda para admin, lê o último para todos", () => {
  const SNAPSHOT = {
    id: "snap-2",
    taken_at: "2026-10-18T14:00:00Z",
    pendencias: 1,
    itens: [{ id: "credencial_ia", estado: "preenchido" }],
  };

  it("admin RODA a auditoria (POST) e recebe o retrato no cartão", async () => {
    let rodou = 0;
    sobreporFontesDosComandos({
      auditoriaRodar: async () => {
        rodou += 1;
        return Response.json(
          {
            data: {
              snapshot: SNAPSHOT,
              anterior: { id: "snap-1", taken_at: "2026-10-17T14:00:00Z", pendencias: 3 },
            },
          },
          { status: 201 },
        );
      },
      auditoria: rota({ data: [] }),
    });

    const saida = await executarComando("checkup", ctxDe(ORG_A, "admin"), t);

    expect(rodou).toBe(1);
    expect(saida.resposta).toContain("Rodei a auditoria");
    expect(saida.acoes).toEqual([
      {
        tipo: "checkup",
        rodou: true,
        snapshot: SNAPSHOT,
        anterior: { id: "snap-1", taken_at: "2026-10-17T14:00:00Z", pendencias: 3 },
      },
    ]);
  });

  it("quem não administra NÃO roda: lê o último retrato", async () => {
    let rodou = 0;
    sobreporFontesDosComandos({
      auditoriaRodar: async () => {
        rodou += 1;
        return Response.json({ data: { snapshot: SNAPSHOT, anterior: null } }, { status: 201 });
      },
      auditoria: rota({ data: [SNAPSHOT] }),
    });

    const saida = await executarComando("checkup", ctxDe(ORG_A, "viewer"), t);

    expect(rodou).toBe(0);
    expect(saida.resposta).toContain("última auditoria");
    const cartao = saida.acoes[0];
    expect(cartao).toMatchObject({ tipo: "checkup", rodou: false });
  });

  it("admin na janela de 60 s (409): cai para o último retrato, sem erro", async () => {
    sobreporFontesDosComandos({
      auditoriaRodar: rota(
        { error: { code: "too_many_requests", message: "máximo 1 por minuto" } },
        409,
      ),
      auditoria: rota({ data: [SNAPSHOT] }),
    });

    const saida = await executarComando("checkup", ctxDe(ORG_A, "admin"), t);

    expect(saida.resposta).toContain("última auditoria");
    expect(saida.acoes[0]).toMatchObject({ tipo: "checkup", rodou: false });
  });

  it("sem retrato nenhum e sem poder rodar: explica e não inventa", async () => {
    sobreporFontesDosComandos({ auditoria: rota({ data: [] }) });

    const saida = await executarComando("checkup", ctxDe(ORG_A, "viewer"), t);

    expect(saida.acoes).toEqual([]);
    expect(saida.resposta).toContain("administrador");
  });
});

describe("`/resumo` — a conta é da organização da SESSÃO", () => {
  /** Dublês de rota que respondem conforme a organização "logada" no teste. */
  function fontesPorOrganizacao(org: { valor: string }) {
    const pedidos: string[] = [];
    const capturar = (corpo: unknown): HandlerDeRota => {
      return async (req: NextRequest) => {
        pedidos.push(req.url);
        return Response.json({ data: corpo });
      };
    };
    sobreporFontesDosComandos({
      contagens: capturar(
        org.valor === ORG_A
          ? { all: 10, closed: 2, archived: 1, fila: 3 }
          : { all: 100, closed: 50, archived: 0, fila: 77 },
      ),
      agendamentos: capturar(org.valor === ORG_A ? [{ id: "ag1" }, { id: "ag2" }] : new Array(40).fill({ id: "x" })),
      auditoria: capturar([{ id: "s1", taken_at: "2026-10-18T00:00:00Z", pendencias: org.valor === ORG_A ? 2 : 9, itens: [] }]),
    });
    return pedidos;
  }

  it("organização A mostra os números de A e nenhum de B", async () => {
    const org = { valor: ORG_A };
    const pedidos = fontesPorOrganizacao(org);
    const consultar = consultarFalso((ctx, id) =>
      METRICA_OK({ total_criados: ctx.orgId === ORG_A ? 4 : 55, origem: id }),
    );

    const { resposta, linhas } = await montarResumo(ctxDe(ORG_A, "admin"), t, { consultar });

    expect(linhas).toEqual([
      { chave: "conversas_abertas", rotulo: "Conversas abertas", valor: "7" },
      { chave: "negocios_novos", rotulo: "Negócios novos hoje", valor: "4" },
      { chave: "agendamentos_hoje", rotulo: "Agendamentos de hoje", valor: "2" },
      { chave: "sem_resposta", rotulo: "Mensagens sem resposta", valor: "3" },
      { chave: "pendencias", rotulo: "Pendências de configuração", valor: "2" },
    ]);
    expect(resposta).not.toContain("55");
    expect(resposta).not.toContain("100");

    // A organização NUNCA viaja na URL: as rotas internas a resolvem pela sessão.
    expect(pedidos.length).toBeGreaterThanOrEqual(3);
    expect(pedidos.every((url) => !/organi[sz]ation/i.test(url))).toBe(true);
    // Pontos de data âncora do período (fuso da organização, não UTC).
    expect(pedidos.some((url) => url.includes("dia=2026-10-18"))).toBe(true);

    // A troca de organização troca TODOS os números.
    org.valor = ORG_B;
    fontesPorOrganizacao(org);
    const consultarB = consultarFalso((ctx) => METRICA_OK({ total_criados: ctx.orgId === ORG_B ? 55 : 4 }));
    const doB = await montarResumo(ctxDe(ORG_B, "admin"), t, { consultar: consultarB });
    expect(doB.linhas.map((l) => l.valor)).toEqual(["50", "55", "40", "77", "9"]);
    expect(doB.resposta).not.toContain("Conversas abertas: 7");
  });

  it("papel sem acesso à métrica de negócios recebe 'peça a um gerente'", async () => {
    fontesPorOrganizacao({ valor: ORG_A });
    const consultar = consultarFalso(() => ({
      ok: false,
      metrica: "leads_por_origem",
      motivo: "sem_permissao",
      papel_minimo: "agent",
    }));

    const { linhas } = await montarResumo(ctxDe(ORG_A, "viewer"), t, { consultar });

    expect(linhas.find((l) => l.chave === "negocios_novos")?.valor).toBe("Peça a um gerente.");
  });

  it("fonte que não responde vira 'não consegui ler agora', nunca zero", async () => {
    sobreporFontesDosComandos({
      contagens: rota({ error: { code: "internal_error" } }, 500),
      agendamentos: rota({ error: { code: "internal_error" } }, 500),
      auditoria: rota({ error: { code: "internal_error" } }, 500),
    });
    const consultar = consultarFalso(() => ({ ok: false, metrica: "leads_por_origem", motivo: "indisponivel", detalhe: "x" }));

    const { linhas } = await montarResumo(ctxDe(ORG_A, "admin"), t, { consultar });

    expect(linhas.find((l) => l.chave === "conversas_abertas")?.valor).toBe("Não consegui ler agora.");
    expect(linhas.find((l) => l.chave === "negocios_novos")?.valor).toBe("Não consegui ler agora.");
    expect(linhas.find((l) => l.chave === "agendamentos_hoje")?.valor).toBe("Não consegui ler agora.");
  });

  it("sem auditoria rodada, a linha de pendências diz isso (não '0')", async () => {
    sobreporFontesDosComandos({
      contagens: rota({ data: [] }),
      agendamentos: rota({ data: [] }),
      auditoria: rota({ data: [] }),
    });
    const consultar = consultarFalso(() => METRICA_OK({ total_criados: 0 }));

    const { linhas } = await montarResumo(ctxDe(ORG_A, "admin"), t, { consultar });

    expect(linhas.find((l) => l.chave === "pendencias")?.valor).toBe("Nenhuma auditoria feita ainda.");
  });
});
