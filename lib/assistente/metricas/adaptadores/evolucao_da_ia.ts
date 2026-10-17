/**
 * Métrica `evolucao_da_ia` — papel manager, `GET /api/v1/ai/evolution`. Dias em UTC, `to`
 * INCLUSIVO; mais de 90 dias é recusado ANTES de chamar a rota. Não sai `learned.timeline`
 * (títulos de texto livre que podem citar cliente). `handoff_rate` vira null sem mensagens
 * recebidas; fonte interna fora do ar aparece zerada (aviso fixo em todo resultado).
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

const ID = "evolucao_da_ia";

const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type ParametrosDeEvolucaoDaIa = z.infer<typeof parametros>;

const esquema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  learned: z.object({
    memory_entries: z.number().int().min(0),
    proposals_applied: z.number().int().min(0),
    skills_installed: z.number().int().min(0),
  }),
  activity: z.object({
    series: z.object({
      skill_activations: z.array(z.object({ day: z.string(), value: z.number().int().min(0) })),
      router_decisions: z.array(z.object({ day: z.string(), value: z.number().int().min(0) })),
      knowledge_searches: z.array(z.object({ day: z.string(), value: z.number().int().min(0) })),
      knowledge_searches_equipe: z.array(z.object({ day: z.string(), value: z.number().int().min(0) })),
    }),
    by_skill: z.record(z.string().max(80), z.number().int().min(0)),
    by_intent: z.record(z.string().max(80), z.number().int().min(0)),
  }),
  outcome: z.object({
    stage_transitions: z.number().int().min(0),
    won: z.number().int().min(0),
    lost: z.number().int().min(0),
    handoff_rate: z.number().min(0).max(100).nullable(),
    cost_cents: z.number().min(0),
    messages_received: z.number().int().min(0),
  }),
  gaps: z.object({
    unmapped_agent_steps: z.array(z.object({ pipeline_name: z.string().max(120), steps: z.array(z.string().max(120)) })),
    pipelines_evaluated: z.number().int().min(0),
    knowledge_near_misses: z.number().int().min(0),
    knowledge_empty: z.number().int().min(0),
    router_no_match: z.number().int().min(0),
    router_failed: z.number().int().min(0),
  }),
});

const REGUA =
  "Fonte /api/v1/ai/evolution, papel manager; dias em UTC, final INCLUSIVO, teto 90. " +
  "cost_cents pode ser > 0 sem atendimento (rotinas internas). " +
  "handoff_rate é fração de 0 a 1. " +
  "Fonte fora do ar aparece zerada: confira a tela antes de concluir.";

type Handler = (req: NextRequest) => Promise<Response>;
let handlerSobreposto: Handler | null = null;
export function sobreporHandlerDeEvolucaoDaIa(handler: Handler | null): void { handlerSobreposto = handler; }
async function handlerAtual(): Promise<Handler> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/ai/evolution/route");
  return modulo.GET;
}

export const metricaEvolucaoDaIa: DefinicaoDeMetrica<ParametrosDeEvolucaoDaIa> = {
  id: ID,
  descricao: "Como a IA evoluiu no período: memória, atividade e resultados.",
  papelMinimo: "manager",
  modulo: null,
  parametros,
  dimensoes: ["periodo", "skill", "intencao", "serie"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);
    if (acimaDe90(diasInclusive(periodo.de, periodo.ateInclusivo), 90)) {
      return { ok: false, metrica: ID, motivo: "parametro_invalido", detalhe: "o período máximo desta fonte é 90 dias" };
    }
    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/ai/evolution", {
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

    const avisos: string[] = [AVISO_TZ_UTC_USO, "Se uma fonte interna estiver fora do ar, o bloco dela aparece zerado nesta rota; confira na tela Evolução da IA antes de concluir que não houve atividade."];
    const semMensagens = projetado.dados.outcome.messages_received === 0;
    const bySkillSaneado = semChavesPerigosas(projetado.dados.activity.by_skill);
    const byIntentSaneado = semChavesPerigosas(projetado.dados.activity.by_intent);
    const dados = {
      ...projetado.dados,
      outcome: { ...projetado.dados.outcome, handoff_rate: semMensagens ? null : projetado.dados.outcome.handoff_rate },
      activity: { ...projetado.dados.activity, by_skill: bySkillSaneado, by_intent: byIntentSaneado },
    };

    if (semMensagens) {
      avisos.push("Sem mensagens de clientes no período; a taxa de passagem para humano não se aplica.");
    }

    const somatorioSeries = (arr: { value: number }[]) => arr.reduce((s, x) => s + x.value, 0);
    const tudoZero =
      projetado.dados.outcome.messages_received === 0 &&
      projetado.dados.outcome.stage_transitions === 0 &&
      projetado.dados.outcome.cost_cents === 0 &&
      projetado.dados.outcome.won === 0 &&
      projetado.dados.outcome.lost === 0 &&
      projetado.dados.learned.memory_entries === 0 &&
      projetado.dados.learned.proposals_applied === 0 &&
      projetado.dados.learned.skills_installed === 0 &&
      Object.values(projetado.dados.activity.series).every((serie) => somatorioSeries(serie) === 0);
    if (tudoZero) {
      return { ok: true, metrica: ID, periodo, regua: REGUA, dados: null, avisos: avisos.concat(["Sem atividade de IA no período."]) };
    }
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados, avisos };
  },
};
