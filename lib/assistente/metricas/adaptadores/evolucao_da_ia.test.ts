// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { metricaEvolucaoDaIa, sobreporHandlerDeEvolucaoDaIa } from "@/lib/assistente/metricas";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";
import { resolverPeriodo } from "../periodo";

function dadosDe<T>(r: ResultadoDeMetrica): T {
  if (!r.ok || r.dados === null || r.dados === undefined) throw new Error("esperava dados");
  return r.dados as T;
}

const CTX_MANAGER: ContextoDeConsulta = {
  orgId: "org-1",
  papel: "manager",
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

const payloadValido = () => ({
  range: { from: "2026-10-07", to: "2026-10-14" },
  learned: { memory_entries: 1, proposals_applied: 0, skills_installed: 0 },
  activity: {
    series: {
      skill_activations: [{ day: "2026-10-08", value: 1 }],
      router_decisions: [{ day: "2026-10-08", value: 2 }],
      knowledge_searches: [{ day: "2026-10-08", value: 1 }],
      knowledge_searches_equipe: [{ day: "2026-10-08", value: 0 }],
    },
    by_skill: { busca: 1, intencao: 2 },
    by_intent: { criar_lead: 1 },
  },
  outcome: { stage_transitions: 1, won: 1, lost: 0, handoff_rate: 0.1, cost_cents: 5, messages_received: 10 },
  gaps: {
    unmapped_agent_steps: [{ pipeline_name: "Funil", steps: ["step1"] }],
    pipelines_evaluated: 1,
    knowledge_near_misses: 0,
    knowledge_empty: 0,
    router_no_match: 0,
    router_failed: 0,
  },
});

describe("evolucao_da_ia — adapter", () => {
  it("URL capturada: from === de, to === ateInclusivo", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDeEvolucaoDaIa(handlerDe(200, { data: payloadValido() }, captura));
    await metricaEvolucaoDaIa.executar(CTX_MANAGER, {});
    const u = new URL(captura.url ?? "");
    const esperado = resolverPeriodo({ tipo: "semana_passada" }, CTX_MANAGER.agoraIso, CTX_MANAGER.fuso, CTX_MANAGER.idioma);
    expect(u.searchParams.get("from")).toBe(esperado.de);
    expect(u.searchParams.get("to")).toBe(esperado.ateInclusivo);
  });

  it("recusa >90 dias SEM chamar rota", async () => {
    const h = vi.fn(handlerDe(200, { data: payloadValido() }));
    sobreporHandlerDeEvolucaoDaIa(h);
    const r = await consultarMetrica(CTX_MANAGER, "evolucao_da_ia", {
      periodo: { tipo: "intervalo", de: "2020-01-01", ate: "2021-02-01" },
    });
    expect(r).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    expect(h).not.toHaveBeenCalled();
  });

  it("403 → sem_permissao", async () => {
    sobreporHandlerDeEvolucaoDaIa(handlerDe(403, {}));
    const r = await metricaEvolucaoDaIa.executar(CTX_MANAGER, {});
    expect(r).toMatchObject({ ok: false, motivo: "sem_permissao" });
  });

  it("learned.timeline com 'Cliente X' não sai em JSON.stringify(dados)", async () => {
    const payload = {
      ...payloadValido(),
      learned: { ...payloadValido().learned, timeline: [{ title: "Cliente X", created_at: "2026-10-10" }] },
    };
    sobreporHandlerDeEvolucaoDaIa(handlerDe(200, { data: payload }));
    const r = await metricaEvolucaoDaIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    if (r.ok && r.dados) {
      const s = JSON.stringify(r.dados);
      expect(s).not.toContain("Cliente X");
    }
  });

  it("handoff_rate null quando messages_received=0 + aviso exato", async () => {
    const payload = { ...payloadValido(), outcome: { ...payloadValido().outcome, messages_received: 0 } };
    sobreporHandlerDeEvolucaoDaIa(handlerDe(200, { data: payload }));
    const r = await metricaEvolucaoDaIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperava ok");
    const d = dadosDe<{ outcome: { handoff_rate: number | null }; activity: { by_skill: Record<string, number> } }>(r);
    expect(d.outcome.handoff_rate).toBeNull();
    expect(r.avisos).toContain("Sem mensagens de clientes no período; a taxa de passagem para humano não se aplica.");
  });

  it("tudo zero → dados null + aviso exato", async () => {
    const payload = {
      ...payloadValido(),
      learned: { memory_entries: 0, proposals_applied: 0, skills_installed: 0 },
      activity: { ...payloadValido().activity, series: { skill_activations: [], router_decisions: [], knowledge_searches: [], knowledge_searches_equipe: [] } },
      outcome: { stage_transitions: 0, won: 0, lost: 0, handoff_rate: null, cost_cents: 0, messages_received: 0 },
    };
    sobreporHandlerDeEvolucaoDaIa(handlerDe(200, { data: payload }));
    const r = await metricaEvolucaoDaIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados).toBeNull();
      expect(r.avisos).toContain("Sem atividade de IA no período.");
    }
  });

  it("by_skill com __proto__ em JSON.parse → só com busca", async () => {
    const bySkillBruto = '{"__proto__":3,"busca":1}';
    const payload = {
      ...payloadValido(),
      activity: { ...payloadValido().activity, by_skill: JSON.parse(bySkillBruto) },
    };
    sobreporHandlerDeEvolucaoDaIa(handlerDe(200, { data: payload }));
    const r = await metricaEvolucaoDaIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    const d = dadosDe<{ outcome: { handoff_rate: number | null }; activity: { by_skill: Record<string, number> } }>(r);
    expect(Object.keys(d.activity.by_skill)).toEqual(["busca"]);
    expect(Object.getPrototypeOf(d.activity.by_skill)).toBe(Object.prototype);
  });

  it("todo resultado ok traz aviso fixo sobre fonte fora do ar", async () => {
    sobreporHandlerDeEvolucaoDaIa(handlerDe(200, { data: payloadValido() }));
    const r = await metricaEvolucaoDaIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.avisos.join()).toContain("Se uma fonte interna estiver fora do ar");
    }
  });

  it("corpo inválido → indisponivel", async () => {
    sobreporHandlerDeEvolucaoDaIa(handlerDe(200, { data: { range: "invalido" } }));
    const r = await metricaEvolucaoDaIa.executar(CTX_MANAGER, {});
    expect(r).toMatchObject({ ok: false, motivo: "indisponivel" });
  });
});
