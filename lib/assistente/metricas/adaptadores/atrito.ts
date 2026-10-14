/**
 * Métrica `atrito` — Índice de Atrito (GET /api/v1/metrics/atrito).
 *
 * ROTA: piso `agent` (ver roteiro: atrito é propriedade do sistema, mas o
 * piso `agent` garante que quem opera veja o custo do que opera — o código da
 * rota confirma: `requireRole("agent")`). A definição bate com a rota.
 * PERÍODO: `from`/`to` ISO, `to` EXCLUSIVO (`.lt` na irmã; a atrito a rota
 * dele apenas passa `to` pra dentro da RPC) — então `to` =
 * `ateInstanteExclusivo`.
 *
 * A resposta traz `pares` (o índice estruturado como eficiência × dano, todos
 * números/razões com `valor: number | null`) e `componentes` (`cliente` e
 * `empresa`, contagens e tempos — nada de contato/identificador de pessoa).
 * `escopo` traz `de`/`ate` e a régua do abandono. Nenhum campo do payload é
 * dado pessoal — o corte é só de higiene: declara a lista positiva.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import { PeriodoSolicitado, resolverPeriodo } from "../periodo";
import type { ContextoDeConsulta, DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";

const ID = "atrito";
const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type Parametros = z.infer<typeof parametros>;

const medida = z.object({
  chave: z.string(),
  rotulo: z.string(),
  valor: z.number().nullable(),
  unidade: z.enum(["contagem", "segundos", "razao", "media"]),
  nota: z.string().optional(),
});

const esquema = z.object({
  window: z.object({ from: z.string(), to: z.string() }).optional(),
  escopo: z.object({
    demandas: z.number().int().min(0),
    de: z.string(),
    ate: z.string(),
    abandono_horas: z.number().int().min(0),
    repeticao_min: z.number(),
    espera_horas: z.number(),
    demandas_com_caso: z.number().int().min(0),
    demandas_abertas: z.number().int().min(0),
    denominador: z.string(),
  }),
  regua: z.object({ abandono_horas: z.number().int().min(0), default: z.number().int().min(0) }),
  pares: z.array(
    z.object({
      chave: z.string(),
      titulo: z.string(),
      eficiencia: medida,
      danos: z.array(medida),
    }),
  ),
  componentes: z.object({
    cliente: z.record(z.string(), z.unknown()),
    empresa: z.record(z.string(), z.unknown()),
  }),
});

const REGUA =
  "Período [de, até) em fuso da organização, fim exclusivo. O índice de atrito " +
  "emparelha cada ganho com o seu custo (ex.: conversões × abandono no silêncio, " +
  "automação × passagens para humano e contorno). Ausência de dado é mostrada como " +
  "nula, nunca como zero — 0% de atrito numa semana sem atendimento é mentira de " +
  "negócio. A régua do abandono (quantas horas de silêncio antes de contar como " +
  "perda) vem no `escopo` e na `regra`, e pode ser redefinida numa PATCH por um " +
  "manager.";

type Handler = (req: NextRequest) => Promise<Response>;
let sobreposicao: Handler | null = null;
export function sobreporHandlerDeAtrito(handler: Handler | null): void {
  sobreposicao = handler;
}
async function handlerAtual(): Promise<Handler> {
  if (sobreposicao) return sobreposicao;
  const m = await import("@/app/api/v1/metrics/atrito/route");
  return m.GET;
}

export const metricaAtrito: DefinicaoDeMetrica<Parametros> = {
  id: ID,
  descricao: "Índice de Atrito: cada ganho da operação acompanhado do seu custo (abandono, contorno, retrabalho…).",
  papelMinimo: "agent",
  modulo: null,
  parametros,
  dimensoes: ["indice", "tipo_de_dano", "tempo_de_espera"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);
    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/metrics/atrito", {
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
