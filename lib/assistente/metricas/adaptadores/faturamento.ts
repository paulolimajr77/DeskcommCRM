/**
 * Métrica `faturamento` — relatório financeiro
 * (GET /api/v1/reports/financeiro, papel `viewer`).
 *
 * O que entra e o que NUNCA entra, campo a campo contra `fn_relatorio_financeiro`:
 * - ENTRA: caixa (`entradas_cents`/`saidas_cents`/`saldo_cents`, valem mesmo sem
 *   o módulo de comandas) e, com o módulo ligado, contagens de comandas,
 *   `faturado_cents`, `ticket_medio_cents` e os agrupamentos `por_servico` e
 *   `por_forma` (nome, quantidade e total — a descrição congelada no item).
 * - NUNCA ENTRA: `por_profissional` (id de pessoa + `comissao_cents` — dado de
 *   remuneração) e `por_cliente` (`contact_id` — identificação de cliente). Os
 *   dois aparecem NO TOPO e DENTRO de cada bloco de moeda; o esquema não os
 *   declara em lugar nenhum (a projeção remove) e a varredura de chaves
 *   proibidas é o cinto.
 *
 * DINHEIRO NUNCA É SOMADO ENTRE MOEDAS: os totais de topo do SQL somam
 * moedas diferentes (não agrupam). A regra:
 *  - `por_moeda` com blocos → o dinheiro sai SEMPRE por moeda;
 *  - mais de uma moeda → os totais de topo ficam de fora, com aviso;
 *  - `por_moeda` vazio → usa o topo, SEM declarar moeda: o SQL não garante
 *    uma moeda única, e o aviso diz isso.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";

import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { estadoDoModulo } from "../modulos";
import { chavesProibidasEm, projetar } from "../projecao";
import { diasInclusive, PeriodoSolicitado, resolverPeriodo } from "../periodo";
import type { ContextoDeConsulta, DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";

const ID = "faturamento";
const JANELA_MAXIMA_DIAS = 400;

const parametrosDeFaturamento = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type ParametrosDeFaturamento = z.infer<typeof parametrosDeFaturamento>;

const itemAgrupado = z.object({
  nome: z.string(),
  quantidade: z.number().int().min(0),
  // .min(0) NÃO vai aqui: total_cents é bigint sem trava de sinal no banco
  // (um item com desconto maior que o preço fica negativo) — e um valor
  // negativo é dado real, não formato quebrado. Apenas .int() garante.
  total_cents: z.number().int(),
});

const blocoPorMoeda = z.object({
  entradas_cents: z.number().int(),
  saidas_cents: z.number().int(),
  saldo_cents: z.number().int(),
  comandas_finalizadas: z.number().int().min(0),
  comandas_estornadas: z.number().int().min(0),
  faturado_cents: z.number().int(),
  ticket_medio_cents: z.number().int(),
  por_forma: z.array(itemAgrupado),
  por_servico: z.array(itemAgrupado),
});

/** `por_profissional` e `por_cliente` NÃO estão declarados — nem no topo, nem por moeda. */
const esquemaDoRelatorio = z.object({
  entradas_cents: z.number().int(),
  saidas_cents: z.number().int(),
  saldo_cents: z.number().int(),
  comandas_finalizadas: z.number().int().min(0),
  comandas_estornadas: z.number().int().min(0),
  faturado_cents: z.number().int(),
  ticket_medio_cents: z.number().int(),
  por_forma: z.array(itemAgrupado),
  por_servico: z.array(itemAgrupado),
  por_moeda: z.record(z.string(), blocoPorMoeda),
});

export interface BlocoDeMoeda {
  moeda: string;
  entradas_cents: number;
  saidas_cents: number;
  saldo_cents: number;
  comandas_finalizadas: number;
  comandas_estornadas: number;
  faturado_cents: number;
  ticket_medio_cents: number;
  por_servico: { nome: string; quantidade: number; total_cents: number }[];
  por_forma: { nome: string; quantidade: number; total_cents: number }[];
}

export interface DadosDoFaturamento {
  /** A moeda, quando o relatório garante uma só; `null` quando não garante. */
  moeda: string | null;
  /** Caixa do período; `null` com mais de uma moeda (topo somaria moedas). */
  caixa: { entradas_cents: number; saidas_cents: number; saldo_cents: number } | null;
  /** Bloco das comandas; `null` sem o módulo ou com mais de uma moeda. */
  comandas: null | {
    comandas_finalizadas: number;
    comandas_estornadas: number;
    faturado_cents: number;
    ticket_medio_cents: number;
    por_servico: { nome: string; quantidade: number; total_cents: number }[];
    por_forma: { nome: string; quantidade: number; total_cents: number }[];
  };
  dinheiro_por_moeda: BlocoDeMoeda[];
}

const REGUA =
  "Período fechado no fuso da organização com a data final INCLUSIVA; 'faturado' soma as comandas " +
  "FINALIZADAS no período (as estornadas são contadas à parte); o dinheiro é sempre apresentado por " +
  "moeda e nunca somado entre moedas; 'serviço' é a descrição congelada no item da comanda na hora " +
  "da venda; o caixa mostra o que de fato foi pago (entradas, saídas e saldo).";

type Handler = (req: NextRequest) => Promise<Response>;

let handlerSobreposto: Handler | null = null;

/** Só para testes: troca o handler real (que exigiria sessão) por um dublê. */
export function sobreporHandlerDoFinanceiro(handler: Handler | null): void {
  handlerSobreposto = handler;
}

async function handlerAtual(): Promise<Handler> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/reports/financeiro/route");
  return modulo.GET;
}

export const metricaFaturamento: DefinicaoDeMetrica<ParametrosDeFaturamento> = {
  id: ID,
  descricao:
    "Faturamento do período: caixa (entradas, saídas e saldo) e, quando a instalação usa comandas, " +
    "o faturado com o detalhe por serviço e por forma de pagamento.",
  papelMinimo: "viewer",
  modulo: null,
  parametros: parametrosDeFaturamento,
  dimensoes: ["periodo", "moeda", "servico", "forma_de_pagamento"],
  regua: REGUA,
  executar: async (ctx: ContextoDeConsulta, params: ParametrosDeFaturamento): Promise<ResultadoDeMetrica> => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);
    // Cinto: o Zod já limita os pedidos do modelo; quem chamar `executar` por
    // fora também não passa da janela.
    if (diasInclusive(periodo.de, periodo.ateInclusivo) > JANELA_MAXIMA_DIAS) {
      return { ok: false, metrica: ID, motivo: "parametro_invalido", detalhe: "o período não pode passar de 400 dias" };
    }

    const estado = await estadoDoModulo(ctx, "financeiro");
    if (!estado.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "não consegui verificar os módulos da instalação" };
    }
    const comandasLigadas = estado.ligado;

    // A rota usa `between`, então o fim vai INCLUSIVO (`ateInclusivo`), nunca
    // o corte exclusivo — senão o último dia do pedido some do relatório.
    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/reports/financeiro", {
      de: periodo.de,
      ate: periodo.ateInclusivo,
    });
    const veredito = traduzirResposta(resposta, "viewer");
    if (!veredito.ok) return { metrica: ID, ...veredito };

    const projetado = projetar(esquemaDoRelatorio, veredito.dados);
    if (!projetado.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "o relatório veio num formato inesperado" };
    }
    const proibidas = chavesProibidasEm(projetado.dados);
    if (proibidas.length > 0) {
      logger.warn("assistente.metricas.chave_proibida_no_resultado", { metrica: ID, chaves: proibidas });
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "o relatório trouxe campos que não podem sair" };
    }

    const rel = projetado.dados;
    const moedas = Object.keys(rel.por_moeda).sort();
    const avisos: string[] = [];

    // Módulo desligado NÃO é zero de comanda: o caixa segue e as comandas
    // nem aparecem — a frase é a mesma do prompt do assistente.
    if (!comandasLigadas) {
      avisos.push("Esta instalação não usa comandas; só o caixa está disponível.");
    }

    // Sem bloco de moeda (módulo desligado ou nenhum lançamento): cai no topo,
    // SEM declarar moeda — o SQL soma sem agrupar, não há moeda garantida.
    if (moedas.length === 0) {
      avisos.push("Não há como declarar a moeda destes totais: o relatório não garante uma moeda única para o período.");
      return {
        ok: true,
        metrica: ID,
        periodo,
        regua: REGUA,
        dados: {
          moeda: null,
          caixa: {
            entradas_cents: rel.entradas_cents,
            saidas_cents: rel.saidas_cents,
            saldo_cents: rel.saldo_cents,
          },
          comandas: comandasLigadas
            ? {
                comandas_finalizadas: rel.comandas_finalizadas,
                comandas_estornadas: rel.comandas_estornadas,
                faturado_cents: rel.faturado_cents,
                ticket_medio_cents: rel.ticket_medio_cents,
                por_servico: rel.por_servico,
                por_forma: rel.por_forma,
              }
            : null,
          dinheiro_por_moeda: [],
        },
        avisos,
      };
    }

    const dinheiroPorMoeda: BlocoDeMoeda[] = [];
    for (const moeda of moedas) {
      const bloco = rel.por_moeda[moeda];
      if (!bloco) continue;
      dinheiroPorMoeda.push({ moeda, ...bloco });
    }

    // Mais de uma moeda: NADA de topo — nem caixa, nem comandas. Só os blocos.
    if (moedas.length > 1) {
      avisos.push("Há mais de uma moeda no período: os totais gerais ficam de fora — use os valores por moeda.");
      return {
        ok: true,
        metrica: ID,
        periodo,
        regua: REGUA,
        dados: { moeda: null, caixa: null, comandas: null, dinheiro_por_moeda: dinheiroPorMoeda },
        avisos,
      };
    }

    // Uma moeda só: o bloco é a verdade (mesma conta do topo), e a moeda é declarada.
    const unica = dinheiroPorMoeda[0];
    if (!unica) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "o relatório veio num formato inesperado" };
    }
    return {
      ok: true,
      metrica: ID,
      periodo,
      regua: REGUA,
      dados: {
        moeda: unica.moeda,
        caixa: {
          entradas_cents: unica.entradas_cents,
          saidas_cents: unica.saidas_cents,
          saldo_cents: unica.saldo_cents,
        },
        comandas: comandasLigadas
          ? {
              comandas_finalizadas: unica.comandas_finalizadas,
              comandas_estornadas: unica.comandas_estornadas,
              faturado_cents: unica.faturado_cents,
              ticket_medio_cents: unica.ticket_medio_cents,
              por_servico: unica.por_servico,
              por_forma: unica.por_forma,
            }
          : null,
        dinheiro_por_moeda: dinheiroPorMoeda,
      },
      avisos,
    };
  },
};
