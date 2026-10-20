/**
 * Métrica `conversoes_enviadas` — as tentativas de reportar vendas à plataforma de
 * anúncios, com situação (entregue / falha / aguardando / não enviado) e os códigos
 * de motivo que mais aparecem, cada um com o seu significado.
 *
 * Leitura DIRETA pelo cliente de SERVIÇO, com `organization_id` explícito em toda
 * consulta (RLS sem policy: o cliente da sessão enxerga vazio). O motivo completo
 * está no cabeçalho de `consultas/conversoes-enviadas.ts`.
 *
 * PERÍODO: janela [deInstante, ateInstanteExclusivo) sobre `attempted_at`.
 * NÃO sai: `lead_id`, `detail`, `event_id`, `remote_request_id`, título do negócio.
 * Moedas nunca são somadas entre si.
 */
import { z } from "zod";

import { lerEstadoDaConexao } from "@/lib/conversoes/estado-da-conexao";
import { logger } from "@/lib/logger";

import {
  clienteDeServicoDeConversoes,
  lerConversoesEnviadas,
  sobreporClienteAdminDeConversoes,
} from "../consultas/conversoes-enviadas";
import { PeriodoSolicitado, resolverPeriodo } from "../periodo";
import { chavesProibidasEm, projetar } from "../projecao";
import type { DefinicaoDeMetrica } from "../tipos";

const ID = "conversoes_enviadas";

const parametros = z.strictObject({
  periodo: PeriodoSolicitado.optional(),
  plataforma: z.enum(["meta_ads", "google_ads"]).optional(),
});
export type ParametrosDeConversoesEnviadas = z.infer<typeof parametros>;

const contagem = z.number().int().min(0);

const esquema = z.object({
  por_plataforma: z.array(
    z.object({
      plataforma: z.string().max(40),
      contagens: z.object({
        entregue: contagem,
        falha: contagem,
        aguardando: contagem,
        nao_enviado: contagem,
      }),
      motivos: z.array(
        z.object({
          codigo: z.string().max(60),
          quantidade: contagem,
          significado: z.string().max(120).nullable(),
        }),
      ),
      entregues_com_atraso_maior_que_7_dias: contagem,
      valor_entregue_cents_por_moeda: z.array(
        z.object({
          moeda: z.string().max(8),
          valor_cents: z.number().int().min(0),
          quantidade: contagem,
        }),
      ),
      total_de_tentativas: contagem,
    }),
  ),
  truncado: z.boolean(),
  conexao_meta: z.enum(["nao_conectada", "desligada", "ligada"]),
});

const REGUA =
  "Vendas reportadas à plataforma de anúncios, por tentativa de envio (uma venda pode ter mais de uma tentativa). " +
  "Entregue não é o mesmo que confirmado pela plataforma. Serve para explicar 'por que meu custo por compra não " +
  "aparece' (por exemplo: negócio fechado sem valor, envio desligado).";

const AVISO_TRUNCADO =
  "Havia mais tentativas do que a leitura alcança (limite de 5000); os números são das mais recentes.";
const AVISO_META_DESLIGADO =
  "O envio para o Meta está desligado: as vendas não são reportadas até ligar em Configurações › Conversões.";
const AVISO_SEM_DADOS = "Sem tentativas de envio de conversão no período.";

export const metricaConversoesEnviadas: DefinicaoDeMetrica<ParametrosDeConversoesEnviadas> = {
  id: ID,
  descricao: "Tentativas de reportar vendas à plataforma de anúncios, com situação e motivos.",
  papelMinimo: "admin",
  modulo: null,
  parametros,
  dimensoes: ["plataforma", "periodo"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);
    const servico = clienteDeServicoDeConversoes();

    const lido = await lerConversoesEnviadas(servico, ctx.orgId, periodo, params.plataforma);
    if (!lido.ok) {
      return {
        ok: false,
        metrica: ID,
        motivo: "indisponivel",
        detalhe: "não consegui ler as tentativas de envio de conversão",
      };
    }

    const estadoMeta = await lerEstadoDaConexao(servico, ctx.orgId, "meta_ads");
    const conexaoMeta = estadoMeta.conectada ? (estadoMeta.habilitada ? "ligada" : "desligada") : "nao_conectada";

    const projetado = projetar(esquema, { ...lido.dados, conexao_meta: conexaoMeta });
    if (!projetado.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a leitura veio num formato inesperado" };
    }
    const proibidas = chavesProibidasEm(projetado.dados);
    if (proibidas.length > 0) {
      logger.warn("assistente.metricas.chave_proibida_no_resultado", { metrica: ID, chaves: proibidas });
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a leitura trouxe campos que não podem sair" };
    }

    const avisos: string[] = [];
    if (projetado.dados.truncado) avisos.push(AVISO_TRUNCADO);
    if (projetado.dados.conexao_meta === "desligada" && params.plataforma !== "google_ads") {
      avisos.push(AVISO_META_DESLIGADO);
    }

    const total = projetado.dados.por_plataforma.reduce((soma, p) => soma + p.total_de_tentativas, 0);
    if (total === 0) {
      return {
        ok: true,
        metrica: ID,
        periodo,
        regua: REGUA,
        dados: null,
        avisos: avisos.concat([AVISO_SEM_DADOS]),
      };
    }
    return { ok: true, metrica: ID, periodo, regua: REGUA, dados: projetado.dados, avisos };
  },
};

export { sobreporClienteAdminDeConversoes };
