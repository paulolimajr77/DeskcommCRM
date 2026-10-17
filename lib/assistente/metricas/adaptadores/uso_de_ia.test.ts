// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { metricaUsoDeIa, sobreporHandlerDeUsoDeIa } from "@/lib/assistente/metricas";
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
  totals: {
    cost_cents: 0.25,
    total_tokens: 120,
    invocations: 2,
    input_tokens: 200,
    cache_read_tokens: 100,
    agent_turns: 1,
    avg_cost_per_turn_cents: 0.125,
    p50_latency_ms: 10,
    p95_latency_ms: 20,
  },
  series: {
    cost_cents: [{ day: "2026-10-08", value: 0.25 }],
    total_tokens: [{ day: "2026-10-08", value: 120 }],
  },
  by_kind: { turns: 1, search: 1 },
});

describe("uso_de_ia — adapter", () => {
  it("payload real: cost_cents com fração, cache_hit_rate calculado = 0.5", async () => {
    sobreporHandlerDeUsoDeIa(handlerDe(200, { data: payloadValido() }));
    const r = await metricaUsoDeIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    const d = dadosDe<{ totals: { cache_hit_rate: number | null }; series: Record<string, unknown>; by_kind: Record<string, number> }>(r);
    expect(d.totals.cache_hit_rate).toBe(0.5);
  });

  it("input_tokens: 0 → cache_hit_rate null", async () => {
    const payload = { ...payloadValido(), totals: { ...payloadValido().totals, input_tokens: 0 } };
    sobreporHandlerDeUsoDeIa(handlerDe(200, { data: payload }));
    const r = await metricaUsoDeIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    const d = dadosDe<{ totals: { cache_hit_rate: number | null }; series: Record<string, unknown>; by_kind: Record<string, number> }>(r);
    expect(d.totals.cache_hit_rate).toBeNull();
  });

  it("handoff_rate em totals não sai em JSON.stringify(dados)", async () => {
    const payload = {
      ...payloadValido(),
      totals: { ...payloadValido().totals, handoff_rate: 0.1 },
    };
    sobreporHandlerDeUsoDeIa(handlerDe(200, { data: payload }));
    const r = await metricaUsoDeIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    if (r.ok && r.dados) {
      const s = JSON.stringify(r.dados);
      expect(s).not.toContain("handoff_rate");
    }
  });

  it("series.p50_latency_ms não sai; só cost_cents e total_tokens", async () => {
    const payload = {
      ...payloadValido(),
      series: {
        cost_cents: [{ day: "2026-10-08", value: 0.25 }],
        total_tokens: [{ day: "2026-10-08", value: 120 }],
        p50_latency_ms: [{ day: "2026-10-08", value: 10 }],
      },
    };
    sobreporHandlerDeUsoDeIa(handlerDe(200, { data: payload }));
    const r = await metricaUsoDeIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    const d = dadosDe<{ totals: { cache_hit_rate: number | null }; series: Record<string, unknown>; by_kind: Record<string, number> }>(r);
    expect(Object.keys(d.series)).toEqual(["cost_cents", "total_tokens"]);
  });

  it("URL capturada: from === de, to === ateInclusivo", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDeUsoDeIa(handlerDe(200, { data: payloadValido() }, captura));
    await metricaUsoDeIa.executar(CTX_MANAGER, {});
    const u = new URL(captura.url ?? "");
    const esperado = resolverPeriodo({ tipo: "semana_passada" }, CTX_MANAGER.agoraIso, CTX_MANAGER.fuso, CTX_MANAGER.idioma);
    expect(u.searchParams.get("from")).toBe(esperado.de);
    expect(u.searchParams.get("to")).toBe(esperado.ateInclusivo);
  });

  it("amostra zero (invocations=0) → dados null + aviso exato", async () => {
    const payload = { ...payloadValido(), totals: { ...payloadValido().totals, invocations: 0 } };
    sobreporHandlerDeUsoDeIa(handlerDe(200, { data: payload }));
    const r = await metricaUsoDeIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados).toBeNull();
      expect(r.avisos).toContain("Sem chamadas de IA no período.");
    }
  });

  it("by_kind com __proto__ → resultado só com turns", async () => {
    const byKindBruto = '{"__proto__":2,"turns":1}';
    const payload = { ...payloadValido(), by_kind: JSON.parse(byKindBruto) };
    sobreporHandlerDeUsoDeIa(handlerDe(200, { data: payload }));
    const r = await metricaUsoDeIa.executar(CTX_MANAGER, {});
    expect(r.ok).toBe(true);
    const d = dadosDe<{ totals: { cache_hit_rate: number | null }; series: Record<string, unknown>; by_kind: Record<string, number> }>(r);
    expect(Object.keys(d.by_kind)).toEqual(["turns"]);
  });

  it("recusa >90 dias SEM chamar rota", async () => {
    const h = vi.fn(handlerDe(200, { data: payloadValido() }));
    sobreporHandlerDeUsoDeIa(h);
    const r = await consultarMetrica(CTX_MANAGER, "uso_de_ia", {
      periodo: { tipo: "intervalo", de: "2020-01-01", ate: "2021-02-01" },
    });
    expect(r).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    expect(h).not.toHaveBeenCalled();
  });

  it("403 → sem_permissao", async () => {
    sobreporHandlerDeUsoDeIa(handlerDe(403, {}));
    const r = await metricaUsoDeIa.executar(CTX_MANAGER, {});
    expect(r).toMatchObject({ ok: false, motivo: "sem_permissao" });
  });

  it("corpo inválido → indisponivel", async () => {
    sobreporHandlerDeUsoDeIa(handlerDe(200, { data: { range: "invalido" } }));
    const r = await metricaUsoDeIa.executar(CTX_MANAGER, {});
    expect(r).toMatchObject({ ok: false, motivo: "indisponivel" });
  });
});
