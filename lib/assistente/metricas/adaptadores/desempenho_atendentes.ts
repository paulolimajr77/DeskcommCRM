/**
 * Métrica `desempenho_atendentes` — desempenho por pessoa
 * (GET /api/v1/metrics/attendants).
 *
 * ROTA: piso `agent` (o código: `requireRole("agent")`). O agente vê as próprias
 * (own-scope via RLS); manager+ vê a org. A definição usa `agent` porque é o
 * piso da rota e a RLS garante o escopo — não porque o modelo escolhe dono.
 *
 * PERÍODO: a rota pega `from`/`to` ISO. O fim é EXCLUSIVO — a validação da rota
 * exige `from < to`, e a RPC corta com `<`; então `from` ← `deInstante`,
 * `to` ← `ateInstanteExclusivo` (dia seguinte).
 *
 * O QUE ENTRA / NUNCA SAI: a rota enriquece cada atendente com `name` e `email`
 * (e carrega `user_id`). São dados pessoais → a lista positiva do esquema NÃO
 * declara. No resultado o atendente aparece como "Atendente 1, 2…" na ordem da
 * rota, com só contagens/tempo. `owner_user_id` e `stage_id` também não saem.
 *
 * AMOSTRA ZERO: sem atendentes para o escopo da pessoa, `dados` vira `null` com
 * aviso — não uma lista vazia fingindo "nenhum atendente", que o modelo leria
 * como ausência de pessoas em vez de "nada neste período para você".
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import { PeriodoSolicitado, resolverPeriodo } from "../periodo";
import type { DefinicaoDeMetrica } from "../tipos";

const ID = "desempenho_atendentes";
const paramsSchema = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type Parametros = z.infer<typeof paramsSchema>;

const linhaBruta = z.object({
  won: z.number().int().min(0),
  lost: z.number().int().min(0),
  conversations_handled: z.number().int().min(0),
  avg_first_response_seconds: z.number().min(0).nullable(),
});

const brutoSchema = z.object({
  funnel: z
    .array(z.object({ stage_name: z.string(), position: z.number().int().min(0), count: z.number().int().min(0) }))
    .optional(),
  attendants: z.array(linhaBruta),
});

const linhaProjetada = z.object({
  index: z.number().int().min(1),
  won: z.number().int().min(0),
  lost: z.number().int().min(0),
  conversations_handled: z.number().int().min(0),
  avg_first_response_seconds: z.number().min(0).nullable(),
});

const esquema = z.object({
  window: z.object({ from: z.string(), to: z.string() }).optional(),
  funnel: z.array(z.object({ stage_name: z.string(), position: z.number().int().min(0), count: z.number().int().min(0) })).optional(),
  attendants: z.array(linhaProjetada),
});

const REGUA =
  "Período [de, até) em fuso da organização, fim exclusivo. Cada linha é um atendente, " +
  "identificado por 'Atendente N' na ordem devolvida pela rota (SEM nome, e-mail ou id — " +
  "isso é dado pessoal e não sai aqui; o nome vivo na tela do CRM). Métricas: conversas, " +
  "vitórias, derrotas e tempo médio da primeira resposta. Quem é agente vê só as próprias (RLS).";

type Handler = (req: NextRequest) => Promise<Response>;
let sobreposicao: Handler | null = null;
export function sobreporHandlerDeDesempenho(handler: Handler | null): void {
  sobreposicao = handler;
}
async function handlerAtual(): Promise<Handler> {
  if (sobreposicao) return sobreposicao;
  const m = await import("@/app/api/v1/metrics/attendants/route");
  return m.GET;
}

export const metricaDesempenhoAtendentes: DefinicaoDeMetrica<Parametros> = {
  id: ID,
  descricao:
    "Desempenho por atendente: conversas atendidas, vitórias e derrotas, e tempo médio da primeira resposta num período.",
  papelMinimo: "agent",
  modulo: null,
  parametros: paramsSchema,
  dimensoes: ["atendente", "resultado", "tempo_de_resposta"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);

    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/metrics/attendants", {
      from: periodo.deInstante,
      to: periodo.ateInstanteExclusivo,
    });
    const veredito = traduzirResposta(resposta, "agent");
    if (!veredito.ok) return { metrica: ID, ...veredito };

    const bruto = projetar(brutoSchema, veredito.dados);
    if (!bruto.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a rota respondeu num formato inesperado" };
    }

    const projetado = projetar(esquema, {
      window: { from: periodo.deInstante, to: periodo.ateInstanteExclusivo },
      funnel: bruto.dados.funnel,
      attendants: bruto.dados.attendants.map((a, i) => ({
        index: i + 1,
        won: a.won,
        lost: a.lost,
        conversations_handled: a.conversations_handled,
        avg_first_response_seconds: a.avg_first_response_seconds,
      })),
    });
    if (!projetado.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a rota respondeu num formato inesperado" };
    }
    const proibidas = chavesProibidasEm(projetado.dados);
    if (proibidas.length > 0) {
      logger.warn("assistente.metricas.chave_proibida_no_resultado", { metrica: ID, chaves: proibidas });
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a resposta trouxe campos que não podem sair" };
    }

    const avisos: string[] = [];
    let dados: unknown = projetado.dados;
    if (projetado.dados.attendants.length === 0) {
      dados = null;
      avisos.push("Sem atendimento no período.");
    }
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados, avisos };
  },
};
