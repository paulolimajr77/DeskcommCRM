/**
 * Testes do ADAPTADOR `leads_por_origem` — reescritos de verdade.
 * Papel mínimo `agent`; `viewer` é recusado por `consultarMetrica` SEM tocar
 * o banco. O banco é o falso encadeável (`range`, `count: exact`, filtros).
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { metricaLeadsPorOrigem } from "@/lib/assistente/metricas/adaptadores/leads_por_origem";
import { criarBancoFalso, type LinhaDeTeste } from "@/lib/assistente/metricas/consultas/banco-falso";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import { resolverPeriodo } from "@/lib/assistente/metricas/periodo";
import type { ContextoDeConsulta, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";

const ORG = "00000000-0000-0000-0000-000000000099";
const AGORA = "2026-10-14T09:00:00-03:00";
const JANELA = resolverPeriodo({ tipo: "semana_passada" }, AGORA, "America/Sao_Paulo", "pt-BR");

interface DadosEsperados {
  total_criados: number;
  origens: {
    origem: string;
    criados: number;
    ganhos: number;
    perdidos: number;
    abertos: number;
    taxa_de_ganho: number | null;
  }[];
  outras_origens: { origens: number; criados: number };
  truncado: boolean;
}

function dadosDe(r: ResultadoDeMetrica): DadosEsperados {
  if (!r.ok || r.dados === null || r.dados === undefined) throw new Error("esperava dados");
  return r.dados as DadosEsperados;
}

function avisosDe(r: ResultadoDeMetrica): string[] {
  if (!r.ok) throw new Error("esperava ok");
  return r.avisos;
}

function ctxDe(papel: ContextoDeConsulta["papel"], client: ContextoDeConsulta["bancoDosModulos"]): ContextoDeConsulta {
  return { orgId: ORG, papel, idioma: "pt-BR", fuso: "America/Sao_Paulo", agoraIso: AGORA, bancoDosModulos: client };
}

function lead(parcial: LinhaDeTeste): LinhaDeTeste {
  return {
    organization_id: ORG,
    status: "open",
    source: "site",
    created_at: "2026-10-06T12:00:00.000Z",
    ...parcial,
  };
}

describe("leads_por_origem — adaptador", () => {
  it("agrupa por origem (trim + minúsculas) e conta a situação atual; taxa null sem fechados", async () => {
    const banco = criarBancoFalso({
      crm_leads: [
        lead({ source: "Site" }),
        lead({ source: " Site " }),
        lead({ source: "indicacao", status: "won" }),
        lead({ source: "indicacao", status: "lost" }),
        lead({ source: null }),
        lead({ source: "" }),
        lead({ source: "facebook", status: "won" }),
        lead({ source: "facebook", status: "won" }),
      ],
    });
    const r = await metricaLeadsPorOrigem.executar(ctxDe("agent", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.total_criados).toBe(8);
    const site = dados.origens.find((o) => o.origem === "site");
    expect(site).toMatchObject({ criados: 2, ganhos: 0, perdidos: 0, abertos: 2, taxa_de_ganho: null });
    const indicacao = dados.origens.find((o) => o.origem === "indicacao");
    expect(indicacao).toMatchObject({ criados: 2, ganhos: 1, perdidos: 1, abertos: 0, taxa_de_ganho: 0.5 });
    const facebook = dados.origens.find((o) => o.origem === "facebook");
    expect(facebook).toMatchObject({ criados: 2, ganhos: 2, perdidos: 0, abertos: 0, taxa_de_ganho: 1 });
    const semOrigem = dados.origens.find((o) => o.origem === "sem origem");
    expect(semOrigem).toMatchObject({ criados: 2 });
  });

  it("duas origens longas com o mesmo prefixo de 60 viram UMA linha (o corte é antes de agrupar)", async () => {
    const prefixo = `origem-${"x".repeat(60)}`;
    expect(prefixo.length).toBeGreaterThan(60);
    const a = `${prefixo}-A`;
    const b = `${prefixo}-B`;
    const banco = criarBancoFalso({
      crm_leads: [lead({ source: a }), lead({ source: b })],
    });
    const r = await metricaLeadsPorOrigem.executar(ctxDe("agent", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.origens.length).toBe(1);
    expect(dados.origens[0]?.criados).toBe(2);
    expect(dados.origens[0]?.origem).toBe(prefixo.slice(0, 60));
  });

  it("__proto__ como origem vira linha normal e Object.prototype fica intacto", async () => {
    const banco = criarBancoFalso({
      crm_leads: [lead({ source: "__proto__", status: "won" }), lead({ source: "obj", status: "open" })],
    });
    const r = await metricaLeadsPorOrigem.executar(ctxDe("agent", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.origens.find((o) => o.origem === "__proto__")?.criados).toBe(1);
    expect(dados.origens.length).toBe(2);
    expect(({} as Record<string, unknown>).criados).toBeUndefined();
  });

  it("1200 negócios no período: total 1200, truncado false (paginação junta)", async () => {
    const muitos: LinhaDeTeste[] = [];
    for (let i = 0; i < 1200; i += 1) muitos.push(lead({ source: "site" }));
    const banco = criarBancoFalso({ crm_leads: muitos });
    const r = await metricaLeadsPorOrigem.executar(ctxDe("agent", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.total_criados).toBe(1200);
    expect(dados.truncado).toBe(false);
  });

  it("5200 negócios: truncado true e o aviso exato", async () => {
    const muitos: LinhaDeTeste[] = [];
    for (let i = 0; i < 5200; i += 1) muitos.push(lead({ source: "site" }));
    const banco = criarBancoFalso({ crm_leads: muitos });
    const r = await metricaLeadsPorOrigem.executar(ctxDe("agent", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.truncado).toBe(true);
    expect(dados.total_criados).toBe(5200);
    expect(avisosDe(r)).toContain(
      "Havia mais negócios criados do que a leitura alcança (limite de 5000); a contagem por origem é dos mais recentes.",
    );
  });

  it("35 origens distintas: 30 linhas + outras_origens com a soma certa", async () => {
    const muitas: LinhaDeTeste[] = [];
    for (let i = 0; i < 35; i += 1) muitas.push(lead({ source: `origem-${i}` }));
    const banco = criarBancoFalso({ crm_leads: muitas });
    const r = await metricaLeadsPorOrigem.executar(ctxDe("agent", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.origens.length).toBe(30);
    expect(dados.outras_origens).toEqual({ origens: 5, criados: 5 });
  });

  it("a janela corta: lead antes de deInstante ou em ateInstanteExclusivo não entra (usando banco.consultas)", async () => {
    const banco = criarBancoFalso({ crm_leads: [] });
    await metricaLeadsPorOrigem.executar(ctxDe("agent", banco.client), {});
    const consultasDeLeads = banco.consultas.filter((c) => c.tabela === "crm_leads");
    const filtros = new Map(consultasDeLeads[0]?.filtros ?? []);
    expect(filtros.get("created_at >=")).toBe(JANELA.deInstante);
    expect(filtros.get("created_at <")).toBe(JANELA.ateInstanteExclusivo);
  });

  it("lead de outra organização não entra", async () => {
    const banco = criarBancoFalso({
      crm_leads: [lead({ organization_id: "una-organizacao-que-nao-e-a-minha", source: "site" })],
    });
    const r = await metricaLeadsPorOrigem.executar(ctxDe("agent", banco.client), {});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperava ok");
    expect(r.dados).toBeNull();
  });

  it("sem negócios: dados null e aviso exato", async () => {
    const banco = criarBancoFalso({ crm_leads: [] });
    const r = await metricaLeadsPorOrigem.executar(ctxDe("agent", banco.client), {});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperava ok");
    expect(r.dados).toBeNull();
    expect(r.avisos).toContain("Sem negócios criados no período.");
  });

  it("erro de leitura: indisponivel sem ecoar a mensagem do banco", async () => {
    const banco = criarBancoFalso({ crm_leads: [] }, "crm_leads");
    const r = await metricaLeadsPorOrigem.executar(ctxDe("agent", banco.client), {});
    expect(r).toMatchObject({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(r)).not.toContain("leitura recusada pelo banco");
  });

  it("aviso do atendente só para papel agent; viewer é recusado por consultarMetrica sem tocar o banco", async () => {
    const bancoAgent = criarBancoFalso({ crm_leads: [lead({})] });
    const deAgent = await metricaLeadsPorOrigem.executar(ctxDe("agent", bancoAgent.client), {});
    expect(deAgent.ok).toBe(true);
    if (!deAgent.ok) throw new Error("esperava ok");
    expect(deAgent.avisos.join(" ")).toContain("Como atendente, você vê só");

    const bancoViewer = criarBancoFalso({ crm_leads: [] });
    const r = await consultarMetrica(ctxDe("viewer", bancoViewer.client), "leads_por_origem", {});
    expect(r).toMatchObject({ ok: false, motivo: "sem_permissao", papel_minimo: "agent" });
    expect(bancoViewer.consultas.length).toBe(0);
  });

  it("período inválido de verdade (dias: 401) → parametro_invalido por consultarMetrica", async () => {
    const banco = criarBancoFalso({ crm_leads: [] });
    const r = await consultarMetrica(ctxDe("agent", banco.client), "leads_por_origem", { periodo: { tipo: "ultimos_dias", dias: 401 } });
    expect(r).toMatchObject({ ok: false, motivo: "parametro_invalido" });
  });
});
