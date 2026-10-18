/**
 * Métrica `etiquetas` — papel viewer, `GET /api/v1/reports/tags`. Janela por fuso civil
 * (`de`/`ate` em AAAA-MM-DD, `ate` INCLUSIVO; mais de 90 dias é recusado ANTES de chamar a rota).
 * A etiqueta é texto livre da equipe (cortado em 60 caracteres). Não saem `motivo` nem
 * `sem_dados` (lidos do bruto só para escolher o aviso). Sem etiqueta/conversa → `dados: null`.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { textoAte } from "./saneamento";

import { logger } from "@/lib/logger";

import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import { diasInclusive, PeriodoSolicitado, resolverPeriodo } from "../periodo";
import type { DefinicaoDeMetrica } from "../tipos";

const ID = "etiquetas";

const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type ParametrosDeEtiquetas = z.infer<typeof parametros>;

const linhaProjeto = z.object({
  etiqueta: textoAte(60),
  conversas: z.number().int().min(0),
  abertas: z.number().int().min(0),
  resolvidas: z.number().int().min(0),
  espera_media_segundos: z.number().min(0).nullable(),
  fatia: z.number().int().min(0).max(100),
});

const esquema = z.object({
  janela: z.object({ de: z.string(), ate: z.string(), tz: z.string() }),
  linhas: z.array(linhaProjeto),
  total_etiquetagens: z.number().int().min(0),
  truncado: z.boolean(),
});

const brutoSchema = z.object({
  sem_dados: z.boolean().optional(),
  motivo: z.string().max(120).nullable().optional(),
  truncado: z.boolean(),
  total_etiquetagens: z.number().int().min(0),
  linhas: z.array(linhaProjeto),
});

const REGUA =
  "Janela por fuso civil, data final INCLUSIVA, teto de 90 dias. A etiqueta é o texto da equipe, " +
  "nunca da lista canônica: uma conversa com duas etiquetas conta nas duas e fatia tem como " +
  "denominador total_etiquetagens. Só quem começou atendimento no período (não a criação) " +
  "entra; a espera vai da última mensagem do cliente até a nossa resposta, null = não medido.";

type Handler = (req: NextRequest) => Promise<Response>;

let handlerSobreposto: Handler | null = null;
export function sobreporHandlerDeEtiquetas(handler: Handler | null): void {
  handlerSobreposto = handler;
}

async function handlerAtual(): Promise<Handler> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/reports/tags/route");
  return modulo.GET;
}

export const metricaEtiquetas: DefinicaoDeMetrica<ParametrosDeEtiquetas> = {
  id: ID,
  descricao: "Volume, desfecho e espera por etiqueta no período.",
  papelMinimo: "viewer",
  modulo: null,
  parametros,
  dimensoes: ["etiqueta", "periodo"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);
    if (diasInclusive(periodo.de, periodo.ateInclusivo) > 90) {
      return { ok: false, metrica: ID, motivo: "parametro_invalido", detalhe: "o relatório por etiqueta cobre no máximo 90 dias" };
    }
    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/reports/tags", {
      de: periodo.de,
      ate: periodo.ateInclusivo,
      tz: ctx.fuso,
    });
    const veredito = traduzirResposta(resposta, "viewer");
    if (!veredito.ok) return { metrica: ID, ...veredito };

    const bruto = brutoSchema.safeParse(veredito.dados);
    if (!bruto.success) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a rota respondeu num formato inesperado" };
    }
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
    if (bruto.data.sem_dados === true) {
      const motivo = bruto.data.motivo;
      let aviso = "Sem dados no período.";
      if (motivo === "nenhuma_etiqueta_em_uso") aviso = "Nenhuma etiqueta em uso nesta organização.";
      else if (motivo === "nenhuma_conversa_com_etiqueta_no_periodo") aviso = "Sem conversas com etiqueta no período.";
      return { ok: true, metrica: ID, periodo, regua: REGUA, dados: null, avisos: [aviso] };
    }
    if (bruto.data.truncado) avisos.push("Havia mais conversas do que a leitura alcança (limite de 10 mil); os números são do trecho mais recente.");
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados: projetado.dados, avisos };
  },
};
