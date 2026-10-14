/**
 * Métrica `canais` — volume e tempo por canal de atendimento
 * (GET /api/v1/metrics/channels).
 *
 * ROTA: piso `agent` (confirma o código: `requireRole("agent")`). A definição
 * bate com a rota — a RLS faz o agente ver só as próprias conversas.
 * PERÍODO: `from`/`to` ISO, `to` EXCLUSIVO (a RPC recebe `p_to = to.toISOString()`
 * e corta com `<`), com teto de 90 dias. Mapeamos `to` →
 * `ateInstanteExclusivo`; acima de 90 dias a rota recusa com 422 e o adaptador
 * devolve `parametro_invalido`.
 *
 * O QUE ENTRA / NUNCA SAI: a rota traz `channel_session_id` (id da conexão —
 * opaco, como um `stage_id`) e `channel_name` (nome cadastrado do canal). No
 * WhatsApp, o nome cadastrado costuma ser o **número** da conta — dado de
 * contato — , e por isso `channel_name` é CORTADO pelo esquema, mesmo que a
 * rota não a chame de PII. Sobra: `channel` (tipo, neutro), `is_archived`, as
 * contagens, o tempo médio e as sem-resposta.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import { PeriodoSolicitado, resolverPeriodo } from "../periodo";
import type { ContextoDeConsulta, DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";

const ID = "canais";
const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type Parametros = z.infer<typeof parametros>;

const linhaCanal = z.object({
  channel_session_id: z.string().uuid(),
  channel: z.string().nullable(),
  is_archived: z.boolean(),
  conversations_handled: z.number().int().min(0),
  avg_first_response_seconds: z.number().min(0).nullable(),
  sem_resposta: z.number().int().min(0),
});

const esquema = z.object({
  window: z.object({ from: z.string(), to: z.string() }).optional(),
  owner_user_id: z.unknown().nullable(),
  channels: z.array(linhaCanal),
});

const REGUA =
  "Por canal de atendimento, no período [de, até) com fim exclusivo (teto de 90 dias). " +
  "`channel` é o tipo (whatsapp, instagram, facebook — neutro); o nome/Número do canal " +
  "NÃO aparece aqui (no WhatsApp ele é o telefone da conta). `sem_resposta` é a contagem " +
  "separada de quem entrou em silêncio. Quem é atendente vê só os canais das próprias " +
  "conversas (RLS).";

type Handler = (req: NextRequest) => Promise<Response>;
let sobreposicao: Handler | null = null;
export function sobreporHandlerDeCanais(handler: Handler | null): void {
  sobreposicao = handler;
}
async function handlerAtual(): Promise<Handler> {
  if (sobreposicao) return sobreposicao;
  const m = await import("@/app/api/v1/metrics/channels/route");
  return m.GET;
}

export const metricaCanais: DefinicaoDeMetrica<Parametros> = {
  id: ID,
  descricao: "Volume e tempo médio de primeira resposta por canal (whatsapp, instagram, facebook…).",
  papelMinimo: "agent",
  modulo: null,
  parametros,
  dimensoes: ["canal", "tempo_de_resposta", "sem_resposta"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);

    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/metrics/channels", {
      from: periodo.deInstante,
      to: periodo.ateInstanteExclusivo,
    });
    const veredito = traduzirResposta(resposta, "agent");
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
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados: projetado.dados, avisos: [] };
  },
};
