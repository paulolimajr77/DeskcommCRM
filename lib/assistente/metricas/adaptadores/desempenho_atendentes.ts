/**
 * Métrica `desempenho_atendentes` — desempenho por pessoa
 * (GET /api/v1/metrics/attendants).
 *
 * ROTA: piso `agent` (especificado na própria rota — `requireRole("agent")`).
 * O agente vê as próprias; manager+ vê a org. A definição usa `agent` porque
 * é o piso da rota e a RLS garante o escopo — **não** porque o modelo escolhe
 * o dono da métrica.
 *
 * PERÍODO: a rota pede `from`/`to` ISO com `to` EXCLUSIVO (`from < to` é a
 * validação dela, e o `to` viaja direto pra dentro da RPC). Então `from` mapeia
 * de `deInstante` e `to` de `ateInstanteExclusivo` — o dia seguinte — para não
 * perder o último dia do pedido.
 *
 * O QUE ENTRA / NUNCA SAI: a rota enriquece com `name` e `email` de cada
 * atendente — dado pessoal. A lista é POSITIVA: o esquema mantém contagens,
 * tempos e taxa (números), mais um `index` estável na ordem devolvida; o nome
 * e o e-mail e o `user_id` são removidos. Na resposta o atendente aparece como
 * "Atendente 1, 2…" — o modelo não precisa do nome para contar, e quem quiser
 * o nome vai à tela.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import { PeriodoSolicitado, resolverPeriodo } from "../periodo";
import type { ContextoDeConsulta, DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";

const ID = "desempenho_atendentes";
const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type Parametros = z.infer<typeof parametros>;

const linhaDeAtendente = z.object({
  index: z.number().int().min(1),
  won: z.number().int().min(0),
  lost: z.number().int().min(0),
  conversations_handled: z.number().int().min(0),
  avg_first_response_seconds: z.number().min(0).nullable(),
});

const esquema = z.object({
  window: z.object({ from: z.string(), to: z.string() }),
  owner_user_id: z.unknown().nullable(),
  funnel: z
    .array(z.object({ stage_name: z.string(), position: z.number().int().min(0), count: z.number().int().min(0) }))
    .optional(),
  attendants: z.array(linhaDeAtendente),
});

const REGUA =
  "Período [de, até) em fuso da organização, fim exclusivo; cada linha é um atendente " +
  "(identificado por 'Atendente 1, 2…' na ordem devolvida, SEM nome, e-mail ou id — isso sai da " +
  "tela para quem precisa), com suas conversas, vitórias, derrotas e tempo médio de primeira " +
  "resposta. Quem é agent vê só as próprias (RLS).";

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
  descricao: "Desempenho por atendente: conversas, vitórias, derrotas e tempo de primeira resposta num período.",
  papelMinimo: "agent",
  modulo: null,
  parametros,
  dimensoes: ["atendente", "tipo_de_resposta", "tempo_de_resposta"],
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

    // A rota devolve atendentes sem nome: recorta para a ordem e numera.
    const bruto = veredito.dados as { funnel?: unknown; attendants: { won: unknown; lost: unknown; conversations_handled: unknown; avg_first_response_seconds: unknown }[] };
    const projetado = projetar(esquema, {
      window: { from: periodo.deInstante, to: periodo.ateInstanteExclusivo },
      owner_user_id: null,
      funnel: bruto.funnel,
      attendants: bruto.attendants.map((a, i) => ({
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
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados: projetado.dados, avisos: [] };
  },
};
