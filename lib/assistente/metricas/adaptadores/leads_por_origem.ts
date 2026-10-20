/**
 * Métrica `leads_por_origem` — negócios CRIADOS no período, por origem.
 * Não existe rota para essa conta: a leitura é DIRETA no banco, pelo client
 * autenticado da sessão (`ctx.bancoDosModulos`, RLS vale) — ver
 * `consultas/leads-por-origem.ts`.
 *
 * PERÍODO: janela [deInstante, ateInstanteExclusivo) — fim EXCLUSIVO, `created_at`.
 * NÃO sai: valor, título, dono e contato dos negócios. A origem é texto da
 * integração, cortado em 60; a agregação usa Map (origem `__proto__` vira
 * linha normal, sem tocar o protótipo).
 */
import { z } from "zod";

import { logger } from "@/lib/logger";

import { lerLeadsPorOrigem } from "../consultas/leads-por-origem";
import { chavesProibidasEm, projetar } from "../projecao";
import { PeriodoSolicitado, resolverPeriodo } from "../periodo";
import { textoAte } from "./saneamento";
import type { ContextoDeConsulta, DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";

const ID = "leads_por_origem";

const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type ParametrosDeLeadsPorOrigem = z.infer<typeof parametros>;

const esquema = z.object({
  total_criados: z.number().int().min(0),
  origens: z.array(
    z.object({
      origem: textoAte(60),
      criados: z.number().int().min(0),
      ganhos: z.number().int().min(0),
      perdidos: z.number().int().min(0),
      abertos: z.number().int().min(0),
      taxa_de_ganho: z.number().min(0).max(1).nullable(),
    }),
  ),
  outras_origens: z.object({
    origens: z.number().int().min(0),
    criados: z.number().int().min(0),
  }),
  truncado: z.boolean(),
});

const REGUA =
  "Negócios CRIADOS no período (`created_at` dentro de `[de, até)`), por origem (`crm_leads.source`, " +
  "texto da integração), com a situação ATUAL de cada um (aberto, ganho, perdido). Negócio ainda " +
  "aberto pode virar ganho depois: a taxa de ganho por origem é parcial e NÃO é a taxa de " +
  "`fechamentos_por_funil` (aquela mede quem fechou no período). Não traz valor.";

const AVISO_DO_ATENDENTE =
  "Como atendente, você vê só os negócios que o seu acesso alcança (os seus e, conforme a configuração da empresa, os sem dono); o total da empresa aparece para visualizador, gerente e administrador.";

export const metricaLeadsPorOrigem: DefinicaoDeMetrica<ParametrosDeLeadsPorOrigem> = {
  id: ID,
  descricao: "Negócios criados no período por origem, com a situação atual de cada um.",
  papelMinimo: "agent",
  modulo: null,
  parametros,
  dimensoes: ["origem", "periodo"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);

    const lido = await lerLeadsPorOrigem(ctx.bancoDosModulos, ctx.orgId, periodo);
    if (!lido.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "não consegui ler os negócios por origem" };
    }
    const projetado = projetar(esquema, lido.dados);
    if (!projetado.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a leitura veio num formato inesperado" };
    }
    const proibidas = chavesProibidasEm(projetado.dados);
    if (proibidas.length > 0) {
      logger.warn("assistente.metricas.chave_proibida_no_resultado", { metrica: ID, chaves: proibidas });
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a leitura trouxe campos que não podem sair" };
    }

    const avisos: string[] = [];
    if (projetado.dados.truncado) {
      avisos.push("Havia mais negócios criados do que a leitura alcança (limite de 5000); a contagem por origem é dos mais recentes.");
    }
    if (ctx.papel === "agent") {
      avisos.push(AVISO_DO_ATENDENTE);
    }
    if (projetado.dados.total_criados === 0) {
      return {
        ok: true,
        metrica: ID,
        periodo,
        regua: REGUA,
        dados: null,
        avisos: avisos.concat(["Sem negócios criados no período."]),
      };
    }
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados: projetado.dados, avisos };
  },
};
