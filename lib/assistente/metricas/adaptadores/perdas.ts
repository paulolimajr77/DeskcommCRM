/**
 * Métrica `perdas` — relatório de perdas por motivo/categoria/etapa/moeda
 * (GET /api/v1/metrics/lost).
 *
 * ROTA: piso `manager` (confirma: `requireRole("manager")`). A definição bate.
 * PERÍODO: `from`/`to` ISO, `to` EXCLUSIVO — a rota corta com
 * `.lt("closed_at", to.toISOString())`, então `to` mapeia
 * `ateInstanteExclusivo`.
 *
 * CORTES DE PII: a agregação (`lib/metrics/perdas.ts`) tem `porMotivo` — e
 * `rotuloMotivo` é o `lost_reason` em TEXTO LIVRE. A ordem ordem corta texto
 * livre de perda: `porMotivo` NÃO sai (a frase do cliente não vira
 * informação ao modelo). Sobram `porCategoria` (motivo categorizado pela
 * configuração do funil), `porEtapa`, `porMoeda` (contagens + valor por
 * moeda, sem somar moedas) e `total`. Nada de id de contato —
 * `lost_from_stage_id` vira o nome da etapa no próprio SQL da RPC/agrupador.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import { PeriodoSolicitado, resolverPeriodo } from "../periodo";
import type { ContextoDeConsulta, DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";

const ID = "perdas";
const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type Parametros = z.infer<typeof parametros>;

const contagemPorChave = z.object({ chave: z.string(), quantidade: z.number().int().min(0) });
const totalPorMoeda = z.object({ moeda: z.string(), quantidade: z.number().int().min(0), valor_cents: z.number().int() });

const esquema = z.object({
  porMotivo: z.never().optional(),
  porCategoria: z.array(contagemPorChave),
  porEtapa: z.array(contagemPorChave),
  porMoeda: z.array(totalPorMoeda),
  total: z.number().int().min(0),
});

const REGUA =
  "De onde os negócios saíram, no período [de, até) com fim exclusivo. Agrupado " +
  "por categoria do motivo (categorizado pela configuração do funil — o " +
  "motivo em texto livre NÃO sai), por etapa de onde saiu, e por moeda (quantidade " +
  "e valor, sem somar moedas). Só manager vê o funil inteiro. Piso de rota: manager.";

type Handler = (req: NextRequest) => Promise<Response>;
let sobreposicao: Handler | null = null;
export function sobreporHandlerDePerdas(handler: Handler | null): void {
  sobreposicao = handler;
}
async function handlerAtual(): Promise<Handler> {
  if (sobreposicao) return sobreposicao;
  const m = await import("@/app/api/v1/metrics/lost/route");
  return m.GET;
}

export const metricaPerdas: DefinicaoDeMetrica<Parametros> = {
  id: ID,
  descricao: "Quantidade de negócios perdidos, por categoria do motivo, etapa e moeda.",
  papelMinimo: "manager",
  modulo: null,
  parametros,
  dimensoes: ["categoria", "etapa", "moeda"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);
    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/metrics/lost", {
      from: periodo.deInstante,
      to: periodo.ateInstanteExclusivo,
    });
    const veredito = traduzirResposta(resposta, "manager");
    if (!veredito.ok) return { metrica: ID, ...veredito };

    // `porMotivo` vem no payload mas NÃO passa do esquema (z.never). O fato de
    // existir na resposta e não no esquema é o corte ativo.
    const projetado = projetar(esquema, veredito.dados);
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
    const corpo = veredito.dados as { porMotivo?: unknown; truncado?: boolean };
    if (corpo.truncado) {
      avisos.push("O relatório foi paginado e pode estar incompleto.");
    }
    // `porMotivo` foi removido pela projeção — confirma que sumiu de verdade.
    if (corpo.porMotivo !== undefined && !("porMotivo" in (dados as Record<string, unknown>))) {
      avisos.push("Motivo livre de perda foi omitido (não sai para o modelo).");
    }

    return { ok: true, metrica: ID, periodo, regua: REGUA, dados, avisos };
  },
};
