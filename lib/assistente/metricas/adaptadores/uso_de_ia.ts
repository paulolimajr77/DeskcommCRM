/**
 * Métrica `uso_de_ia` — papel manager, `GET /api/v1/ai/usage`. Dias em UTC, `to` INCLUSIVO;
 * mais de 90 dias é recusado ANTES de chamar a rota (a rota corta em silêncio). Não saem
 * `handoff_rate` (a rota devolve 0 quando não há dado) nem as séries de latência e de handoff;
 * `cache_hit_rate` é calculado aqui (null sem tokens de entrada). Custo é mínimo e pode ter fração.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";

import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import { diasInclusive, PeriodoSolicitado, resolverPeriodo } from "../periodo";
import { AVISO_TZ_UTC_USO, acimaDe90 } from "./datas-utc";
import { semChavesPerigosas } from "./saneamento";
import type { DefinicaoDeMetrica } from "../tipos";

const ID = "uso_de_ia";

const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type ParametrosDeUsoDeIa = z.infer<typeof parametros>;

const serieCusto = z.array(z.object({ day: z.string(), value: z.number().min(0) }));
const serieTokens = z.array(z.object({ day: z.string(), value: z.number().int().min(0) }));

const esquema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  totals: z.object({
    cost_cents: z.number().min(0),
    total_tokens: z.number().int().min(0),
    invocations: z.number().int().min(0),
    input_tokens: z.number().int().min(0),
    cache_read_tokens: z.number().int().min(0),
    agent_turns: z.number().int().min(0),
    avg_cost_per_turn_cents: z.number().min(0).nullable(),
    p50_latency_ms: z.number().min(0).nullable(),
    p95_latency_ms: z.number().min(0).nullable(),
  }),
  series: z.object({ cost_cents: serieCusto, total_tokens: serieTokens }),
  by_kind: z.record(z.string().max(64), z.number().int().min(0)),
});

const REGUA =
  "Fonte /api/v1/ai/usage, papel manager; dias em UTC, data final INCLUSIVA, teto 90 dias. " +
  "cost_cents é em centavos da moeda do provedor, PODE TER FRAÇÃO e é MÍNIMO (chamada sem preço não soma). " +
  "cache_hit_rate é fração 0–1 calculada aqui, null sem tokens de entrada. Taxa de passagem para humano não é desta fonte (evolucao_da_ia).";

type Handler = (req: NextRequest) => Promise<Response>;
let handlerSobreposto: Handler | null = null;
export function sobreporHandlerDeUsoDeIa(handler: Handler | null): void { handlerSobreposto = handler; }
async function handlerAtual(): Promise<Handler> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/ai/usage/route");
  return modulo.GET;
}

export const metricaUsoDeIa: DefinicaoDeMetrica<ParametrosDeUsoDeIa> = {
  id: ID,
  descricao: "Uso e custo de IA no período: tokens, chamadas, latência e custo por modo.",
  papelMinimo: "manager",
  modulo: null,
  parametros,
  dimensoes: ["periodo", "modo", "serie"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);
    if (acimaDe90(diasInclusive(periodo.de, periodo.ateInclusivo), 90)) {
      return { ok: false, metrica: ID, motivo: "parametro_invalido", detalhe: "o período máximo desta fonte é 90 dias" };
    }
    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/ai/usage", {
      from: periodo.de,
      to: periodo.ateInclusivo,
    });
    const veredito = traduzirResposta(resposta, "manager");
    if (!veredito.ok) return { metrica: ID, ...veredito };

    const projetado = projetar(esquema, veredito.dados);
    if (!projetado.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a rota respondeu num formato inesperado" };
    }
    const proibidas = chavesProibidasEm(projetado.dados);
    if (proibidas.length > 0) {
      logger.warn("assistente.metricas.chave_proibida_no_resultado", { metrica: ID, chaves: proibidas });
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a resposta trouxe campos que não podem sair" };
    }

    const avisos: string[] = [AVISO_TZ_UTC_USO];
    if (projetado.dados.totals.invocations === 0) {
      return { ok: true, metrica: ID, periodo, regua: REGUA, dados: null, avisos: avisos.concat(["Sem chamadas de IA no período."]) };
    }
    const cacheHitRate = projetado.dados.totals.input_tokens > 0
      ? Number((projetado.dados.totals.cache_read_tokens / projetado.dados.totals.input_tokens).toFixed(4))
      : null;
    const byKindSaneado = semChavesPerigosas(projetado.dados.by_kind);
    const dados = { ...projetado.dados, totals: { ...projetado.dados.totals, cache_hit_rate: cacheHitRate }, by_kind: byKindSaneado };
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados, avisos };
  },
};
