/**
 * Métrica `taxa_de_ganho_por_etapa` — papel manager. Duas chamadas por dentro:
 * `GET /api/v1/pipelines/[id]/stages/win-rates` (taxas e tempo na etapa, por `etapa_id`) e
 * `GET /api/v1/pipelines/[id]/stages` (nome e posição). A junção troca o id pelo nome; linha
 * cuja etapa não está na lista é descartada e nenhum id de etapa sai. Janela `[agora - dias, agora]`
 * (`periodo: null`; a janela vai em `dados.janela`). Percentual e sugestão vão de 0 a 100.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";

import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import type { DefinicaoDeMetrica } from "../tipos";

const ID = "taxa_de_ganho_por_etapa";

const parametros = z.strictObject({
  pipeline_id: z.string().uuid(),
  dias: z.number().int().min(1).max(3650).optional(),
});
export type ParametrosDeTaxaDeGanhoPorEtapa = z.infer<typeof parametros>;

const schemaWin = z.object({
  minimo_de_casos: z.number().int().min(0),
  truncado: z.boolean(),
  taxas: z.array(z.object({
    etapa_id: z.string().uuid(),
    total: z.number().int().min(0),
    ganhos: z.number().int().min(0),
    percentual: z.number().int().min(0).max(100).nullable(),
    sugestao: z.number().nullable(),
  })),
  tempo_na_etapa: z.object({
    medida: z.string().max(80),
    ancora: z.string().max(80),
    base: z.string().max(80),
    amostra: z.number().int().min(0),
    limite: z.number().int().min(0),
    truncado: z.boolean(),
    etapas: z.array(z.object({
      etapa_id: z.string().uuid(),
      quantidade: z.number().int().min(0),
      horas_media: z.number().nullable(),
      horas_mediana: z.number().nullable(),
      com_carimbo: z.number().int().min(0),
      sem_carimbo: z.number().int().min(0),
    })),
  }),
});

const schemaStages = z.array(z.object({
  id: z.string().uuid(),
  name: z.string().max(120),
  position: z.number(),
  is_won: z.boolean(),
  is_lost: z.boolean(),
  expected_duration_hours: z.number().nullable(),
}));

const REGUA =
  "Fonte /api/v1/pipelines/[id]/stages/win-rates + /stages, papel manager. " +
  "Janela [agora - dias, agora]; percentual e sugestao vão de 0 a 100. " +
  "'tempo_na_etapa' é outra população (quem está na etapa AGORA, fora da janela); não some com as taxas. " +
  "null em percentual/sugestao = amostra pequena (menos de minimo_de_casos) ou zero. " +
  "Funil de outra organização aparece como não encontrado (mesma frase).";

interface Sobreposicao { taxas: Handler | null; etapas: Handler | null; }
type Handler = (req: NextRequest) => Promise<Response>;

let sobrep: Sobreposicao | null = null;
export function sobreporHandlersDeTaxaDeGanho(sobreposicao: Sobreposicao | null): void {
  sobrep = sobreposicao;
}

export function comParametros(rota: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>, id: string): Handler {
  return (req) => rota(req, { params: Promise.resolve({ id }) });
}

async function handlerTaxas(id: string): Promise<Handler> {
  if (sobrep?.taxas) return sobrep.taxas;
  const modulo = await import("@/app/api/v1/pipelines/[id]/stages/win-rates/route");
  return comParametros(modulo.GET, id);
}
async function handlerEtapas(id: string): Promise<Handler> {
  if (sobrep?.etapas) return sobrep.etapas;
  const modulo = await import("@/app/api/v1/pipelines/[id]/stages/route");
  return comParametros(modulo.GET, id);
}

export const metricaTaxaDeGanhoPorEtapa: DefinicaoDeMetrica<ParametrosDeTaxaDeGanhoPorEtapa> = {
  id: ID,
  descricao: "Taxa de ganho por etapa de um funil, com tempo na etapa.",
  papelMinimo: "manager",
  modulo: null,
  parametros,
  dimensoes: ["funil", "etapa", "periodo"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const dias = params.dias ?? 365;
    const id = params.pipeline_id;
    const urlWin = `/api/v1/pipelines/${id}/stages/win-rates`;
    const urlSt = `/api/v1/pipelines/${id}/stages`;

    const h1 = await handlerTaxas(id);
    const r1 = await chamarRotaPorDentro(h1, urlWin, { dias: String(dias) });
    const v1 = traduzirResposta(r1, "manager");
    if (!v1.ok) return { metrica: ID, ...v1 };

    const h2 = await handlerEtapas(id);
    const r2 = await chamarRotaPorDentro(h2, urlSt, {});
    const v2 = traduzirResposta(r2, "manager");
    if (!v2.ok) return { metrica: ID, ...v2 };

    const p1 = projetar(schemaWin, v1.dados);
    const p2 = projetar(schemaStages, v2.dados);
    if (!p1.ok || !p2.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a rota respondeu num formato inesperado" };
    }
    const proib1 = chavesProibidasEm(p1.dados);
    const proib2 = chavesProibidasEm(p2.dados);
    if (proib1.length > 0 || proib2.length > 0) {
      logger.warn("assistente.metricas.chave_proibida_no_resultado", { metrica: ID, chaves: proib1.concat(proib2) });
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a resposta trouxe campos que não podem sair" };
    }

    const mapStage = new Map(p2.dados.map((s) => [s.id, s]));
    const win = p1.dados;
    if (win.taxas.length === 0 && p2.dados.length === 0) {
      return { ok: true, metrica: ID, periodo: null, regua: REGUA, dados: null, avisos: ["Funil não encontrado ou sem etapas."] };
    }
    const totalTodos = win.taxas.reduce((s, t) => s + t.total, 0);
    if (totalTodos === 0) {
      return { ok: true, metrica: ID, periodo: null, regua: REGUA, dados: null, avisos: ["Nenhum negócio encerrado passou pelas etapas deste funil no período."] };
    }

    const taxas = win.taxas
      .map((t) => {
        const st = mapStage.get(t.etapa_id);
        return st ? { nome: st.name, posicao: st.position, total: t.total, ganhos: t.ganhos, percentual: t.percentual, sugestao: t.sugestao } : null;
      })
      .filter((x) => x !== null)
      .sort((a, b) => a!.posicao - b!.posicao);

    const tempoNaEtapa = {
      ...win.tempo_na_etapa,
      etapas: win.tempo_na_etapa.etapas
        .map((e) => {
          const st = mapStage.get(e.etapa_id);
          return st ? { nome: st.name, posicao: st.position, quantidade: e.quantidade, horas_media: e.horas_media, horas_mediana: e.horas_mediana, com_carimbo: e.com_carimbo, sem_carimbo: e.sem_carimbo } : null;
        })
        .filter((x) => x !== null),
    };

    const janela = { dias, ate: "agora" };
    const avisos: string[] = [];
    if (win.truncado) avisos.push("O histórico de etapas atingiu o limite de leitura; as taxas podem estar incompletas.");
    if (tempoNaEtapa.truncado) avisos.push("Há mais negócios nas etapas do que a leitura alcança (limite de 1000); o tempo na etapa é do trecho lido.");
    avisos.push(`Janela dos últimos ${dias} dias terminando agora.`);

    const dados = { janela, minimo_de_casos: win.minimo_de_casos, taxas, tempo_na_etapa: tempoNaEtapa };
    return { ok: true, metrica: ID, periodo: null, regua: REGUA, dados, avisos };
  },
};
