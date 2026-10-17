/**
 * Métrica `funil_conversao` — papel agent, `GET /api/v1/metrics/funil`. Fim EXCLUSIVO
 * (`to` exclusivo). Não sai `vazio` (tem `motivo` proibido), não sai `etapa.id`/proxima.id;
 * `base` é texto; `contra_metrica` tem denominadores de texto; `posicao` é fracionado.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { textoAte } from "./saneamento";

import { logger } from "@/lib/logger";

import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import { PeriodoSolicitado, resolverPeriodo } from "../periodo";
import type { DefinicaoDeMetrica } from "../tipos";

const ID = "funil_conversao";

const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type ParametrosDeFunilConversao = z.infer<typeof parametros>;

const etapa = z.object({ nome: z.string().max(80), posicao: z.number() });
const porMoeda = z.object({ moeda: z.string().max(8), quantidade: z.number().int().min(0), valor_cents: z.number().int() });

const esquema = z.object({
  janela: z.object({ from: z.string().max(64), to: z.string().max(64) }),
  base: textoAte(300),
  conversao: z.object({
    etapas: z.array(z.object({
      pipeline_id: z.string().uuid(),
      funil: z.string().max(120),
      etapa,
      proxima: etapa.nullable(),
      entraram: z.number().int().min(0),
      passaram: z.number().int().min(0),
      taxa: z.number().min(0).max(1).nullable(),
      amostra: z.number().int().min(0),
      saidas_sem_entrada_na_janela: z.number().int().min(0),
      desvios: z.number().int().min(0),
    })),
    amostra: z.number().int().min(0),
    notas: z.array(z.string().max(500)),
  }),
  dias_ate_fechar: z.object({
    medida: z.string().max(40),
    mediana: z.number().min(0).nullable(),
    p25: z.number().min(0).nullable(),
    p75: z.number().min(0).nullable(),
    amostra: z.number().int().min(0),
    ignorados: z.number().int().min(0),
    exclui: z.string().max(200),
    por_funil: z.array(z.object({ pipeline_id: z.string().uuid(), funil: z.string().max(120), mediana: z.number().min(0).nullable(), p25: z.number().min(0).nullable(), p75: z.number().min(0).nullable(), amostra: z.number().int().min(0) })),
  }),
  origem: z.object({
    linhas: z.array(z.object({ origem: textoAte(60), status: z.enum(["won","lost","open"]), quantidade: z.number().int().min(0), por_moeda: z.array(porMoeda) })),
    valor_por_moeda: z.boolean(),
  }),
  contra_metrica: z.object({
    turnos: z.object({ p50: z.number().nullable(), p90: z.number().nullable(), denominador: textoAte(100) }).nullable(),
    opt_outs: z.object({ quantidade: z.number().nullable(), denominador: textoAte(100) }).nullable(),
    fonte: textoAte(200),
    nota: textoAte(500).transform((s) => s.startsWith("Contra-métrica não medida nesta resposta:") ? "Contra-métrica não medida nesta resposta." : s.slice(0, 500)),
  }),
  truncado: z.boolean(),
});

const brutoSchema = z.object({
  vazio: z.unknown().nullable().optional(),
  truncado: z.boolean(),
  conversao: z.object({ amostra: z.number().int().min(0) }),
  origem: z.object({ linhas: z.array(z.unknown()) }),
  dias_ate_fechar: z.object({ amostra: z.number().int().min(0) }),
});

const REGUA =
  "Fonte /api/v1/metrics/funil, papel agent, janela com to EXCLUSIVO. " +
  "Taxa é fração de 0 a 1 (0,4 = 40%) de quem entrou na etapa NA janela. " +
  "'dias até fechar' é MEDIANA. A contra-métrica (turnos e descadastros) vem junto por design: não apresente a taxa sem ela.";

type Handler = (req: NextRequest) => Promise<Response>;
let handlerSobreposto: Handler | null = null;
export function sobreporHandlerDeFunilConversao(handler: Handler | null): void { handlerSobreposto = handler; }
async function handlerAtual(): Promise<Handler> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/metrics/funil/route");
  return modulo.GET;
}

export const metricaFunilConversao: DefinicaoDeMetrica<ParametrosDeFunilConversao> = {
  id: ID,
  descricao: "Funil de conversão do CRM com contra-métrica de turnos e descadastros.",
  papelMinimo: "agent",
  modulo: null,
  parametros,
  dimensoes: ["periodo", "etapa", "origem", "moeda"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);
    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/metrics/funil", {
      from: periodo.deInstante,
      to: periodo.ateInstanteExclusivo,
    });
    const veredito = traduzirResposta(resposta, "agent");
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
    if (bruto.data.vazio !== null && bruto.data.vazio !== undefined) {
      return { ok: true, metrica: ID, periodo, regua: REGUA, dados: null, avisos: ["Sem negócios movimentados no funil neste período."] };
    }
    if (bruto.data.conversao.amostra === 0 && (bruto.data.origem.linhas as unknown[]).length === 0 && bruto.data.dias_ate_fechar.amostra === 0) {
      return { ok: true, metrica: ID, periodo, regua: REGUA, dados: null, avisos: ["Sem negócios movimentados no funil neste período."] };
    }
    if (projetado.dados.truncado) avisos.push("A leitura atingiu o limite e o trecho mais antigo do período pode estar fora.");
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados: projetado.dados, avisos };
  },
};
