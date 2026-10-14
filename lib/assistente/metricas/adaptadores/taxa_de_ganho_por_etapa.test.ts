// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { metricaTaxaDeGanhoPorEtapa, sobreporHandlersDeTaxaDeGanho } from "@/lib/assistente/metricas";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import { comParametros } from "@/lib/assistente/metricas/adaptadores/taxa_de_ganho_por_etapa";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";
import { NextRequest } from "next/server";

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

const stageId = "11111111-2222-4333-8444-555555555555";
const pipelineId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function handlerDe(status: number, corpo: unknown): HandlerDeRota {
  return async () => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const payloadTaxas = () => ({
  minimo_de_casos: 5,
  truncado: false,
  taxas: [{ etapa_id: stageId, total: 8, ganhos: 3, percentual: 38, sugestao: 38 }],
  tempo_na_etapa: {
    medida: "etapa atual",
    ancora: "x",
    base: "y",
    amostra: 12,
    limite: 1000,
    truncado: false,
    etapas: [{ etapa_id: stageId, quantidade: 4, horas_media: 30.5, horas_mediana: 26, com_carimbo: 4, sem_carimbo: 0 }],
  },
});

const payloadStages = () => [{ id: stageId, name: "Novo", position: 1.5, is_won: false, is_lost: false, expected_duration_hours: null }];

describe("taxa_de_ganho_por_etapa — adapter", () => {
  it("payload completo com posicao 1.5 → ok, sem UUIDs de etapa em dados, nome presente", async () => {
    sobreporHandlersDeTaxaDeGanho({ taxas: handlerDe(200, { data: payloadTaxas() }), etapas: handlerDe(200, { data: payloadStages() }) });
    const r = await metricaTaxaDeGanhoPorEtapa.executar(CTX_MANAGER, { pipeline_id: pipelineId, dias: 30 });
    expect(r.ok).toBe(true);
    const d = dadosDe<{ taxas: { nome: string }[]; tempo_na_etapa: { etapas: { nome: string }[] } }>(r);
    const s = JSON.stringify(d);
    expect(s).not.toContain(stageId);
    expect(s).toContain("Novo");
    expect(d.taxas[0]?.nome).toBe("Novo");
  });

  it("etapa_id fora do mapa → a linha some", async () => {
    const payload = {
      ...payloadTaxas(),
      taxas: [{ etapa_id: "99999999-9999-4999-8999-999999999999", total: 8, ganhos: 3, percentual: 38, sugestao: 38 }],
      tempo_na_etapa: {
        ...payloadTaxas().tempo_na_etapa,
        etapas: [
          ...payloadTaxas().tempo_na_etapa.etapas,
          { etapa_id: "99999999-9999-4999-8999-999999999999", quantidade: 4, horas_media: 30.5, horas_mediana: 26, com_carimbo: 4, sem_carimbo: 0 },
        ],
      },
    };
    sobreporHandlersDeTaxaDeGanho({ taxas: handlerDe(200, { data: payload }), etapas: handlerDe(200, { data: payloadStages() }) });
    const r = await metricaTaxaDeGanhoPorEtapa.executar(CTX_MANAGER, { pipeline_id: pipelineId, dias: 30 });
    expect(r.ok).toBe(true);
    const d = dadosDe<{ taxas: { nome: string }[]; tempo_na_etapa: { etapas: { nome: string }[] } }>(r);
    expect(d.taxas.length).toBe(0);
    expect(d.tempo_na_etapa.etapas.length).toBe(0);
    expect(JSON.stringify(d)).not.toContain("99999999-9999-4999-8999-999999999999");
  });

  it("truncado: true (ambos) → avisos exatos", async () => {
    const payload = {
      ...payloadTaxas(),
      truncado: true,
      tempo_na_etapa: { ...payloadTaxas().tempo_na_etapa, truncado: true },
    };
    sobreporHandlersDeTaxaDeGanho({ taxas: handlerDe(200, { data: payload }), etapas: handlerDe(200, { data: payloadStages() }) });
    const r = await metricaTaxaDeGanhoPorEtapa.executar(CTX_MANAGER, { pipeline_id: pipelineId, dias: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.avisos).toContain("O histórico de etapas atingiu o limite de leitura; as taxas podem estar incompletas.");
      expect(r.avisos).toContain("Há mais negócios nas etapas do que a leitura alcança (limite de 1000); o tempo na etapa é do trecho lido.");
    }
  });

  it("comParametros: rota chamada com id correto", async () => {
    const rota = async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
      const params = await ctx.params;
      return Response.json({ data: params });
    };
    const handler = comParametros(rota, "abc");
    const resposta = await handler(new NextRequest("http://test/x"));
    expect(await resposta.json()).toEqual({ data: { id: "abc" } });
  });

  it("dias e pipeline_id válidos → chamadas corretas", async () => {
    const hTaxas = vi.fn(handlerDe(200, { data: payloadTaxas() }));
    const hEtapas = vi.fn(handlerDe(200, { data: payloadStages() }));
    sobreporHandlersDeTaxaDeGanho({ taxas: hTaxas, etapas: hEtapas });
    await metricaTaxaDeGanhoPorEtapa.executar(CTX_MANAGER, { pipeline_id: pipelineId, dias: 30 });
    expect(hTaxas).toHaveBeenCalledTimes(1);
    expect(hEtapas).toHaveBeenCalledTimes(1);
    const reqTaxas = hTaxas.mock.calls[0]?.[0];
    expect(reqTaxas?.url).toContain("/stages/win-rates");
    expect(reqTaxas?.url).toContain("dias=30");
  });

  it("dias inválido > 3650 → parametro_invalido SEM chamar handlers", async () => {
    const hTaxas = vi.fn(handlerDe(200, { data: payloadTaxas() }));
    const hEtapas = vi.fn(handlerDe(200, { data: payloadStages() }));
    sobreporHandlersDeTaxaDeGanho({ taxas: hTaxas, etapas: hEtapas });
    const r = await consultarMetrica(CTX_MANAGER, "taxa_de_ganho_por_etapa", { pipeline_id: pipelineId, dias: 3651 });
    expect(r).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    expect(hTaxas).not.toHaveBeenCalled();
    expect(hEtapas).not.toHaveBeenCalled();
  });

  it("pipeline_id inválido → parametro_invalido SEM chamar handlers", async () => {
    const hTaxas = vi.fn(handlerDe(200, { data: payloadTaxas() }));
    const hEtapas = vi.fn(handlerDe(200, { data: payloadStages() }));
    sobreporHandlersDeTaxaDeGanho({ taxas: hTaxas, etapas: hEtapas });
    const r = await consultarMetrica(CTX_MANAGER, "taxa_de_ganho_por_etapa", { pipeline_id: "nao-e-uuid", dias: 30 });
    expect(r).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    expect(hTaxas).not.toHaveBeenCalled();
    expect(hEtapas).not.toHaveBeenCalled();
  });

  it("403 em taxas → sem_permissao", async () => {
    sobreporHandlersDeTaxaDeGanho({ taxas: handlerDe(403, {}), etapas: handlerDe(200, { data: payloadStages() }) });
    const r = await metricaTaxaDeGanhoPorEtapa.executar(CTX_MANAGER, { pipeline_id: pipelineId, dias: 30 });
    expect(r).toMatchObject({ ok: false, motivo: "sem_permissao" });
  });

  it("403 em etapas → sem_permissao", async () => {
    sobreporHandlersDeTaxaDeGanho({ taxas: handlerDe(200, { data: payloadTaxas() }), etapas: handlerDe(403, {}) });
    const r = await metricaTaxaDeGanhoPorEtapa.executar(CTX_MANAGER, { pipeline_id: pipelineId, dias: 30 });
    expect(r).toMatchObject({ ok: false, motivo: "sem_permissao" });
  });

  it("amostra zero → dados null + aviso exato", async () => {
    const payload = { ...payloadTaxas(), taxas: [] };
    sobreporHandlersDeTaxaDeGanho({ taxas: handlerDe(200, { data: payload }), etapas: handlerDe(200, { data: payloadStages() }) });
    const r = await metricaTaxaDeGanhoPorEtapa.executar(CTX_MANAGER, { pipeline_id: pipelineId, dias: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados).toBeNull();
      expect(r.avisos).toContain("Nenhum negócio encerrado passou pelas etapas deste funil no período.");
    }
  });

  it("funil vazio → dados null + aviso exato", async () => {
    const payload = { ...payloadTaxas(), taxas: [] };
    sobreporHandlersDeTaxaDeGanho({ taxas: handlerDe(200, { data: payload }), etapas: handlerDe(200, { data: [] }) });
    const r = await metricaTaxaDeGanhoPorEtapa.executar(CTX_MANAGER, { pipeline_id: pipelineId, dias: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados).toBeNull();
      expect(r.avisos).toContain("Funil não encontrado ou sem etapas.");
    }
  });
});
