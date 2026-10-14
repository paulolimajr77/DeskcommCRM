// @vitest-environment node
import { describe, expect, it } from "vitest";

import { metricaFunilConversao, sobreporHandlerDeFunilConversao } from "@/lib/assistente/metricas";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";
import { resolverPeriodo } from "../periodo";

function dadosDe<T>(r: ResultadoDeMetrica): T {
  if (!r.ok || r.dados === null || r.dados === undefined) throw new Error("esperava dados");
  return r.dados as T;
}

const CTX_AGENT: ContextoDeConsulta = {
  orgId: "org-1",
  papel: "agent",
  idioma: "pt-BR",
  fuso: "America/Sao_Paulo",
  agoraIso: "2026-10-14T09:00:00-03:00",
  bancoDosModulos: {} as ContextoDeConsulta["bancoDosModulos"],
};

function handlerDe(status: number, corpo: unknown, captura?: { url?: string }): HandlerDeRota {
  return async (req) => {
    if (captura) captura.url = req.url;
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  };
}

const payloadCompleto = () => ({
  janela: { from: "2026-10-05T03:00:00.000Z", to: "2026-10-12T03:00:00.000Z" },
  base: "Negócios criados OU encerrados na janela; passagens de etapa registradas na janela.",
  conversao: {
    etapas: [
      {
        pipeline_id: "11111111-2222-4333-8444-555555555555",
        funil: "Vendas",
        etapa: { id: "aaaaaaaa-0000-4000-8000-000000000001", nome: "Novo", posicao: 1.5 },
        proxima: { id: "aaaaaaaa-0000-4000-8000-000000000002", nome: "Proposta", posicao: 2 },
        entraram: 10,
        passaram: 4,
        taxa: 0.4,
        amostra: 10,
        saidas_sem_entrada_na_janela: 1,
        desvios: 0,
      },
    ],
    amostra: 10,
    notas: ["Nota do período"],
  },
  dias_ate_fechar: {
    medida: "mediana",
    mediana: 3,
    p25: 1,
    p75: 6,
    amostra: 4,
    ignorados: 0,
    exclui: "Só ganhos com fechamento na janela: abertos e perdidos ficam de fora.",
    por_funil: [{ pipeline_id: "11111111-2222-4333-8444-555555555555", funil: "Vendas", mediana: 3, p25: 1, p75: 6, amostra: 4 }],
  },
  origem: {
    linhas: [
      {
        origem: "whatsapp",
        status: "won",
        quantidade: 2,
        por_moeda: [{ moeda: "BRL", valor_cents: 150000, quantidade: 2 }],
      },
    ],
    valor_por_moeda: true,
  },
  contra_metrica: {
    turnos: { p50: 3, p90: 8, denominador: "demandas encerradas na janela" },
    opt_outs: { quantidade: 2, denominador: "contatos bloqueados na janela" },
    fonte: "fn_atrito_metrics (mesma janela; ...)",
    nota: "Doutrina §3.3: ...",
  },
  truncado: false,
});

describe("funil_conversao — adapter", () => {
  it("payload completo com posicao 1.5 → ok, taxa 0.4, sem UUIDs de etapa em dados, pipeline_id presente", async () => {
    sobreporHandlerDeFunilConversao(handlerDe(200, { data: payloadCompleto() }));
    const r = await metricaFunilConversao.executar(CTX_AGENT, {});
    expect(r.ok).toBe(true);
    const d = dadosDe<{ conversao: { etapas: { taxa: number }[] } }>(r);
    expect(d.conversao.etapas[0]?.taxa).toBe(0.4);
    const s = JSON.stringify(d);
    expect(s).not.toContain("aaaaaaaa-0000-4000-8000-000000000001");
    expect(s).not.toContain("aaaaaaaa-0000-4000-8000-000000000002");
    expect(s).toContain("11111111-2222-4333-8444-555555555555");
    expect(s).toContain("Vendas");
    expect(s).toContain("pipeline_id");
  });

  it("contra_metrica.nota com mensagem de erro do banco → texto do erro não sai", async () => {
    const payload = {
      ...payloadCompleto(),
      contra_metrica: {
        ...payloadCompleto().contra_metrica,
        nota: "Contra-métrica não medida nesta resposta: erro no banco",
      },
    };
    sobreporHandlerDeFunilConversao(handlerDe(200, { data: payload }));
    const r = await metricaFunilConversao.executar(CTX_AGENT, {});
    expect(r.ok).toBe(true);
    if (r.ok && r.dados) {
      const s = JSON.stringify(r.dados);
      expect(s).not.toContain("erro no banco");
    }
  });

  it("URL capturada com `from` e `to` (exclusivo) → from=deInstante, to=ateInstanteExclusivo", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDeFunilConversao(handlerDe(200, { data: payloadCompleto() }, captura));
    await metricaFunilConversao.executar(CTX_AGENT, {});
    const u = new URL(captura.url ?? "");
    const esperado = resolverPeriodo({ tipo: "semana_passada" }, CTX_AGENT.agoraIso, CTX_AGENT.fuso, CTX_AGENT.idioma);
    expect(u.searchParams.get("from")).toBe(esperado.deInstante);
    expect(u.searchParams.get("to")).toBe(esperado.ateInstanteExclusivo);
  });

  it("vazio: { motivo } → dados null + aviso exato", async () => {
    const payload = {
      ...payloadCompleto(),
      conversao: { ...payloadCompleto().conversao, etapas: [], amostra: 0, notas: [] },
      vazio: { motivo: "motivo_qualquer" },
    };
    sobreporHandlerDeFunilConversao(handlerDe(200, { data: payload }));
    const r = await metricaFunilConversao.executar(CTX_AGENT, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados).toBeNull();
      expect(r.avisos).toContain("Sem negócios movimentados no funil neste período.");
    }
  });

  it("amostra zero (conversao.amostra=0) sem vazio → dados null + aviso exato", async () => {
    const payload = {
      ...payloadCompleto(),
      conversao: { etapas: [], amostra: 0, notas: [] },
      origem: { linhas: [], valor_por_moeda: true },
      dias_ate_fechar: { ...payloadCompleto().dias_ate_fechar, mediana: null, p25: null, p75: null, amostra: 0, por_funil: [] },
    };
    sobreporHandlerDeFunilConversao(handlerDe(200, { data: payload }));
    const r = await metricaFunilConversao.executar(CTX_AGENT, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados).toBeNull();
      expect(r.avisos).toContain("Sem negócios movimentados no funil neste período.");
    }
  });

  it("truncado: true → aviso exato", async () => {
    sobreporHandlerDeFunilConversao(handlerDe(200, { data: { ...payloadCompleto(), truncado: true } }));
    const r = await metricaFunilConversao.executar(CTX_AGENT, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.avisos).toContain("A leitura atingiu o limite e o trecho mais antigo do período pode estar fora.");
    }
  });

  it("contra_metrica com p50/p90/quantidade nulos → ainda ok (sem demanda encerrada)", async () => {
    const payload = {
      ...payloadCompleto(),
      contra_metrica: {
        ...payloadCompleto().contra_metrica,
        turnos: { p50: null, p90: null, denominador: "demandas encerradas na janela" },
        opt_outs: { quantidade: null, denominador: "contatos bloqueados na janela" },
      },
    };
    sobreporHandlerDeFunilConversao(handlerDe(200, { data: payload }));
    const r = await metricaFunilConversao.executar(CTX_AGENT, {});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperava ok");
    const d = dadosDe<{ contra_metrica: { turnos: { p50: number | null } } }>(r);
    expect(d.contra_metrica.turnos.p50).toBeNull();
  });

  it("origem com mais de 60 caracteres é cortada, não derruba o relatório", async () => {
    const payload = {
      ...payloadCompleto(),
      origem: {
        linhas: [{ origem: "x".repeat(80), status: "won", quantidade: 1, por_moeda: [] }],
        valor_por_moeda: true,
      },
    };
    sobreporHandlerDeFunilConversao(handlerDe(200, { data: payload }));
    const r = await metricaFunilConversao.executar(CTX_AGENT, {});
    expect(r.ok).toBe(true);
    const d = dadosDe<{ origem: { linhas: { origem: string }[] } }>(r);
    expect(d.origem.linhas[0]?.origem).toBe("x".repeat(60));
  });

  it("403 → sem_permissao", async () => {
    sobreporHandlerDeFunilConversao(handlerDe(403, {}));
    const r = await metricaFunilConversao.executar(CTX_AGENT, {});
    expect(r).toMatchObject({ ok: false, motivo: "sem_permissao" });
  });

  it("corpo com conversao inválido → indisponivel sem ecoar conteúdo", async () => {
    sobreporHandlerDeFunilConversao(handlerDe(200, { data: { ...payloadCompleto(), conversao: "x" } }));
    const r = await metricaFunilConversao.executar(CTX_AGENT, {});
    expect(r).toMatchObject({ ok: false, motivo: "indisponivel" });
    if (!r.ok && r.motivo === "indisponivel") {
      expect(r.detalhe).not.toContain("conversao");
    }
  });
});
