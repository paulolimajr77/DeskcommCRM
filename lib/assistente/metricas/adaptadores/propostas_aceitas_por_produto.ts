/**
 * Métrica `propostas_aceitas_por_produto` — valor PROPOSTO em propostas
 * aceitas no período, por produto do catálogo. Não existe rota para essa
 * conta: a leitura é DIRETA no banco, pelo client autenticado da sessão
 * (`ctx.bancoDosModulos`, RLS vale) — ver `consultas/propostas-por-produto.ts`.
 *
 * DUAS CHAVES: a da INSTALAÇÃO (`modulo: "propostas"` na definição — quem
 * responde `modulo_ausente` é `consultarMetrica`) e a da EMPRESA
 * (`organizations.settings.proposals.enabled`, checada aqui dentro com
 * `capacidadesLigadas`, nunca reimplementada à mão).
 *
 * PERÍODO: janela [deInstante, ateInstanteExclusivo) — fim EXCLUSIVO, `decided_at`.
 * NÃO sai: a `descricao` dos itens (texto livre), cliente, contato. Uma linha
 * por (produto, moeda) — moedas NUNCA somadas entre si. Nomes de produto são
 * texto da equipe, cortados em 80.
 */
import { z } from "zod";

import { logger } from "@/lib/logger";
import { capacidadesLigadas } from "@/lib/organizacao/capacidades";

import { lerPropostasAceitasPorProduto } from "../consultas/propostas-por-produto";
import { chavesProibidasEm, projetar } from "../projecao";
import { PeriodoSolicitado, resolverPeriodo } from "../periodo";
import { textoAte } from "./saneamento";
import type { ContextoDeConsulta, DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";

const ID = "propostas_aceitas_por_produto";

const parametros = z.strictObject({ periodo: PeriodoSolicitado.optional() });
export type ParametrosDePropostasAceitasPorProduto = z.infer<typeof parametros>;

const esquema = z.object({
  propostas_aceitas: z.number().int().min(0),
  por_produto: z.array(
    z.object({
      produto: textoAte(80),
      moeda: z.string().max(8),
      propostas: z.number().int().min(0),
      quantidade: z.number().min(0),
      valor_proposto_cents: z.number().int().min(0),
    }),
  ),
  linhas_omitidas: z.number().int().min(0),
  truncado: z.boolean(),
});

const REGUA =
  "VALOR PROPOSTO nas propostas ACEITAS no período (`decided_at` dentro de `[de, até)`), por produto do " +
  "catálogo, uma linha por produto e moeda. Não é faturamento nem dinheiro recebido: proposta aceita não " +
  "vira venda sozinha, e as vendas realizadas (comandas, pedidos) NÃO apontam para o catálogo de produtos, " +
  "então 'faturamento realizado por produto' não existe nesta instalação. Valor do item = quantidade × " +
  "preço unitário − desconto (nunca abaixo de zero).";

const AVISO_FIXO = "Valor PROPOSTO em propostas aceitas; não é faturamento.";

export const metricaPropostasAceitasPorProduto: DefinicaoDeMetrica<ParametrosDePropostasAceitasPorProduto> = {
  id: ID,
  descricao: "Valor proposto em propostas aceitas no período, por produto do catálogo (uma linha por produto e moeda).",
  papelMinimo: "viewer",
  modulo: "propostas",
  parametros,
  dimensoes: ["produto", "moeda", "periodo"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);

    // A chave da EMPRESA (a chave da instalação já foi checada pelo registro).
    const { data: organizacao, error: erroDaOrg } = await ctx.bancoDosModulos
      .from("organizations")
      .select("settings")
      .eq("id", ctx.orgId)
      .maybeSingle();
    if (erroDaOrg) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "não consegui ler a configuração da empresa" };
    }
    const settings = (organizacao as { settings?: unknown } | null)?.settings;
    if (!capacidadesLigadas(settings, ["propostas"]).includes("propostas")) {
      return { ok: false, metrica: ID, motivo: "modulo_ausente", modulo: "propostas" };
    }

    const lido = await lerPropostasAceitasPorProduto(ctx.bancoDosModulos, ctx.orgId, periodo);
    if (!lido.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "não consegui ler as propostas aceitas" };
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

    const avisos: string[] = [AVISO_FIXO];
    if (projetado.dados.truncado) {
      avisos.push("Havia mais propostas aceitas do que a leitura alcança (limite de 2500); os números são das mais recentes.");
    }
    if (projetado.dados.linhas_omitidas > 0) {
      avisos.push("Só as 30 maiores linhas foram incluídas.");
    }
    if (projetado.dados.propostas_aceitas === 0) {
      return {
        ok: true,
        metrica: ID,
        periodo,
        regua: REGUA,
        dados: null,
        avisos: avisos.concat(["Sem propostas aceitas no período."]),
      };
    }
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados: projetado.dados, avisos };
  },
};
