/**
 * Métrica `fechamentos_por_funil` — negócios FECHADOS no período por funil.
 * Não existe rota para essa conta: a leitura é DIRETA no banco, pelo client
 * autenticado da sessão (`ctx.bancoDosModulos`, RLS vale) — ver
 * `consultas/fechamentos.ts`.
 *
 * PERÍODO: janela [deInstante, ateInstanteExclusivo) — fim EXCLUSIVO, `closed_at`.
 * NÃO sai: título do negócio, dono, contato (nunca lidos). Só agregados por
 * funil (nome é texto da equipe, cortado em 80).
 */
import { z } from "zod";

import { logger } from "@/lib/logger";

import { lerFechamentos } from "../consultas/fechamentos";
import { chavesProibidasEm, projetar } from "../projecao";
import { PeriodoSolicitado, resolverPeriodo } from "../periodo";
import { textoAte } from "./saneamento";
import type { ContextoDeConsulta, DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";

const ID = "fechamentos_por_funil";

const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type ParametrosDeFechamentosPorFunil = z.infer<typeof parametros>;

const linha = z.object({
  funil: textoAte(80),
  ganhos: z.number().int().min(0),
  perdidos: z.number().int().min(0),
  fechados: z.number().int().min(0),
  taxa_de_ganho: z.number().min(0).max(1).nullable(),
});

const esquema = z.object({
  funis: z.array(linha),
  total: linha.omit({ funil: true }),
  funis_nao_lidos: z.number().int().min(0),
});

const REGUA =
  "Negócios FECHADOS no período (`closed_at` dentro de `[de, até)`), por funil: ganhos = status ganho, " +
  "perdidos = status perdido; taxa de ganho = ganhos ÷ (ganhos + perdidos), fração de 0 a 1, null sem " +
  "fechados. Mede quem FECHOU no período, não quem foi criado nele; negócios abertos ficam de fora. " +
  "Vale para todos os donos que o seu acesso alcança.";

const AVISO_DO_ATENDENTE =
  "Como atendente, você vê só os negócios que o seu acesso alcança (os seus e, conforme a configuração da empresa, os sem dono); o total da empresa aparece para visualizador, gerente e administrador.";

export const metricaFechamentosPorFunil: DefinicaoDeMetrica<ParametrosDeFechamentosPorFunil> = {
  id: ID,
  descricao: "Ganhos, perdidos e taxa de ganho por funil, dos negócios fechados no período.",
  papelMinimo: "agent",
  modulo: null,
  parametros,
  dimensoes: ["funil", "periodo"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);

    const lido = await lerFechamentos(ctx.bancoDosModulos, ctx.orgId, periodo);
    if (!lido.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "não consegui ler os fechamentos" };
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
    if (projetado.dados.funis_nao_lidos > 0) {
      avisos.push("Há mais funis do que a leitura alcança (limite de 40); os números são dos primeiros funis.");
    }
    if (ctx.papel === "agent") {
      avisos.push(AVISO_DO_ATENDENTE);
    }
    if (projetado.dados.total.fechados === 0) {
      return {
        ok: true,
        metrica: ID,
        periodo,
        regua: REGUA,
        dados: null,
        avisos: avisos.concat(["Sem negócios fechados (ganhos ou perdidos) no período."]),
      };
    }
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados: projetado.dados, avisos };
  },
};
