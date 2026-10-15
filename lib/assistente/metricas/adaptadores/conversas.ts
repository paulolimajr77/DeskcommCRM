/**
 * Métrica `conversas_por_visao` — contagens do inbox
 * (GET /api/v1/conversations/counts).
 *
 * A rota NÃO tem `requireRole`: quem autentica é o proxy e quem isola é a RLS
 * de SELECT de `conversations` — um atendente recebe a contagem do PRÓPRIO
 * escopo, nunca o total da organização. Por isso `papelMinimo` é `viewer`, o
 * mesmo alcance que a rota dá a qualquer pessoa autenticada.
 *
 * `unassigned` fica DE FORA da projeção de propósito: é duplicata de `fila`
 * mantida na rota só por compatibilidade de versão — expor os dois convida o
 * modelo a contar a mesma coisa duas vezes.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";

import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import type { DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";

const ID = "conversas_por_visao";

const parametrosDeConversas = z.strictObject({});
export type ParametrosDeConversas = z.infer<typeof parametrosDeConversas>;

const esquemaDaResposta = z.object({
  fila: z.number().int().min(0),
  automatico: z.number().int().min(0),
  mine: z.number().int().min(0),
  all: z.number().int().min(0),
  closed: z.number().int().min(0),
  archived: z.number().int().min(0),
});

const REGUA =
  "Foto do inbox AGORA (não é um período): fila = conversas esperando alguém pegar; automatico = " +
  "sob o comando do agente automático; mine = abertas atribuídas a você; all = todas que você pode " +
  "ver, de qualquer status; closed = fechadas; archived = arquivadas. Quem é atendente vê só o " +
  "próprio escopo: o isolamento é da RLS do banco, a rota não tem guarda de papel.";

type Handler = (req: NextRequest) => Promise<Response>;

let handlerSobreposto: Handler | null = null;

/** Só para testes: troca o handler real (que exigiria sessão) por um dublê. */
export function sobreporHandlerDeContagens(handler: Handler | null): void {
  handlerSobreposto = handler;
}

async function handlerAtual(): Promise<Handler> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/conversations/counts/route");
  return modulo.GET;
}

export const metricaConversas: DefinicaoDeMetrica<ParametrosDeConversas> = {
  id: ID,
  descricao:
    "Contagem de conversas por visão do inbox (fila, automático, minhas, todas, fechadas, " +
    "arquivadas) — foto do momento atual, não de um período.",
  papelMinimo: "viewer",
  modulo: null,
  parametros: parametrosDeConversas,
  dimensoes: ["visao"],
  regua: REGUA,
  executar: async (): Promise<ResultadoDeMetrica> => {
    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/conversations/counts", {});
    const veredito = traduzirResposta(resposta, "viewer");
    if (!veredito.ok) return { metrica: ID, ...veredito };

    const projetado = projetar(esquemaDaResposta, veredito.dados);
    if (!projetado.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a rota respondeu num formato inesperado" };
    }
    const proibidas = chavesProibidasEm(projetado.dados);
    if (proibidas.length > 0) {
      logger.warn("assistente.metricas.chave_proibida_no_resultado", { metrica: ID, chaves: proibidas });
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a resposta trouxe campos que não podem sair" };
    }
    return { ok: true, metrica: ID, periodo: null, regua: REGUA, dados: projetado.dados, avisos: [] };
  },
};
