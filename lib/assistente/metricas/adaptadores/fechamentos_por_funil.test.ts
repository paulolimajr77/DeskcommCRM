/**
 * Testes do ADAPTADOR `fechamentos_por_funil` — a métrica inteira contra o
 * banco falso. Papel mínimo `agent`; `viewer` é recusado por
 * `consultarMetrica` SEM tocar o banco.
 */
import { describe, expect, it } from "vitest";

import { metricaFechamentosPorFunil } from "@/lib/assistente/metricas/adaptadores/fechamentos_por_funil";
import { criarBancoFalso, type LinhaDeTeste } from "@/lib/assistente/metricas/consultas/banco-falso";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import { resolverPeriodo } from "@/lib/assistente/metricas/periodo";
import type { ContextoDeConsulta, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";

const ORG = "00000000-0000-0000-0000-000000000099";
const AGORA = "2026-10-14T09:00:00-03:00";
const JANELA = resolverPeriodo({ tipo: "semana_passada" }, AGORA, "America/Sao_Paulo", "pt-BR");

interface DadosEsperados {
  funis: { funil: string; ganhos: number; perdidos: number; fechados: number; taxa_de_ganho: number | null }[];
  total: { ganhos: number; perdidos: number; fechados: number; taxa_de_ganho: number | null };
  funis_nao_lidos: number;
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

const FUNIS: LinhaDeTeste[] = [
  { id: "funil-a", name: "Vendas", position: 1, is_archived: false },
  { id: "funil-b", name: "Arquivado", position: 2, is_archived: true },
];

function lead(parcial: LinhaDeTeste): LinhaDeTeste {
  return {
    organization_id: ORG,
    status: "won",
    closed_at: "2026-10-06T12:00:00.000Z",
    pipeline_id: "funil-a",
    ...parcial,
  };
}

describe("fechamentos_por_funil — adaptador", () => {
  it("taxa por funil e total; funil sem fechados sai com taxa_de_ganho null, nunca 0 (2.a, 2.d)", async () => {
    const banco = criarBancoFalso({
      crm_pipelines: FUNIS,
      crm_leads: [lead({}), lead({}), lead({ status: "lost" })],
    });
    const r = await metricaFechamentosPorFunil.executar(ctxDe("agent", banco.client), {});
    expect(r.ok).toBe(true);
    const dados = dadosDe(r);
    const vendas = dados.funis.find((f) => f.funil === "Vendas");
    expect(vendas).toMatchObject({ ganhos: 2, perdidos: 1, fechados: 3, taxa_de_ganho: 0.6667 });
    // Funil arquivado COM zero fechados não aparece (2.e); veja o caso seguinte.
    expect(dados.funis.find((f) => f.funil === "Arquivado")).toBeUndefined();
    expect(dados.total).toMatchObject({ ganhos: 2, perdidos: 1, fechados: 3, taxa_de_ganho: 0.6667 });
  });

  it("funil arquivado COM fechados aparece (2.e)", async () => {
    const banco = criarBancoFalso({
      crm_pipelines: FUNIS,
      crm_leads: [lead({ pipeline_id: "funil-b", status: "lost" })],
    });
    const r = await metricaFechamentosPorFunil.executar(ctxDe("agent", banco.client), {});
    const dados = dadosDe(r);
    const arquivado = dados.funis.find((f) => f.funil === "Arquivado");
    expect(arquivado).toMatchObject({ ganhos: 0, perdidos: 1, fechados: 1, taxa_de_ganho: 0 });
  });

  it("tudo zero → dados null com o aviso exato (2.f)", async () => {
    const banco = criarBancoFalso({ crm_pipelines: FUNIS, crm_leads: [] });
    const r = await metricaFechamentosPorFunil.executar(ctxDe("agent", banco.client), {});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperava ok");
    expect(r.dados).toBeNull();
    expect(r.avisos).toContain("Sem negócios fechados (ganhos ou perdidos) no período.");
  });

  it("erro de leitura → indisponivel, sem ecoar a mensagem do banco (2.g)", async () => {
    const banco = criarBancoFalso({ crm_pipelines: FUNIS }, "crm_leads");
    const r = await metricaFechamentosPorFunil.executar(ctxDe("agent", banco.client), {});
    expect(r).toMatchObject({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(r)).not.toContain("leitura recusada pelo banco");
  });

  it("aviso do atendente sai só para papel agent (2.h)", async () => {
    const banco = criarBancoFalso({ crm_pipelines: FUNIS, crm_leads: [lead({})] });
    const deAgent = await metricaFechamentosPorFunil.executar(ctxDe("agent", banco.client), {});
    expect(avisosDe(deAgent).join(" ")).toContain("Como atendente, você vê só os negócios que o seu acesso alcança");
    const deManager = await metricaFechamentosPorFunil.executar(ctxDe("manager", banco.client), {});
    expect(avisosDe(deManager).join(" ")).not.toContain("Como atendente");
  });

  it("viewer é recusado por consultarMetrica SEM nenhuma consulta ao banco (2.i)", async () => {
    const banco = criarBancoFalso({ crm_pipelines: FUNIS, crm_leads: [lead({})] });
    const r = await consultarMetrica(ctxDe("viewer", banco.client), "fechamentos_por_funil", {});
    expect(r).toMatchObject({ ok: false, motivo: "sem_permissao", papel_minimo: "agent" });
    expect(banco.consultas.length).toBe(0);
  });

  it("mais de 40 funis → funis_nao_lidos e o aviso exato (2.j)", async () => {
    const muitosFunis: LinhaDeTeste[] = [];
    for (let i = 0; i < 45; i += 1) {
      muitosFunis.push({ id: `funil-${i}`, name: `Funil ${i}`, position: i, is_archived: false });
    }
    const banco = criarBancoFalso({ crm_pipelines: muitosFunis, crm_leads: [lead({})] });
    const r = await metricaFechamentosPorFunil.executar(ctxDe("agent", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.funis_nao_lidos).toBe(5);
    expect(avisosDe(r)).toContain("Há mais funis do que a leitura alcança (limite de 40); os números são dos primeiros funis.");
  });

  it("a janela de banco é [deInstante, ateInstanteExclusivo) do período resolvido", async () => {
    const banco = criarBancoFalso({ crm_pipelines: FUNIS, crm_leads: [] });
    await metricaFechamentosPorFunil.executar(ctxDe("manager", banco.client), {});
    const contagens = banco.consultas.filter((c) => c.tabela === "crm_leads");
    const filtros = new Map(contagens[0]?.filtros ?? []);
    expect(filtros.get("closed_at >=")).toBe(JANELA.deInstante);
    expect(filtros.get("closed_at <")).toBe(JANELA.ateInstanteExclusivo);
  });
});
