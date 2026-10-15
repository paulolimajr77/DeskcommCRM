/**
 * O registro do catálogo de métricas — a única porta de entrada do modelo.
 * `listarMetricas` diz o que existe (e o que a pessoa da sessão pode usar);
 * `consultarMetrica` valida parâmetro, papel e módulo ANTES de executar —
 * papel insuficiente nem chega a chamar a rota.
 */
import { ROLE_RANK } from "@/lib/auth/types";
import { logger } from "@/lib/logger";
import type { ModuloOpcional } from "@/lib/instalacao/modulos";
import type { ZodError } from "zod";

import { metricaConversas } from "./adaptadores/conversas";
import { metricaFaturamento } from "./adaptadores/faturamento";
import { metricaDesempenhoAtendentes } from "./adaptadores/desempenho_atendentes";
import { metricaAtrito } from "./adaptadores/atrito";
import { metricaCanais } from "./adaptadores/canais";
import { metricaPerdas } from "./adaptadores/perdas";
import { metricaAtividades } from "./adaptadores/atividades";
import { metricaEtiquetas } from "./adaptadores/etiquetas";
import { metricaUsoDeIa } from "./adaptadores/uso_de_ia";
import { metricaEvolucaoDaIa } from "./adaptadores/evolucao_da_ia";
import { metricaFunilConversao } from "./adaptadores/funil_conversao";
import { metricaTaxaDeGanhoPorEtapa } from "./adaptadores/taxa_de_ganho_por_etapa";
import { metricaFechamentosPorFunil } from "./adaptadores/fechamentos_por_funil";
import { metricaLeadsPorOrigem } from "./adaptadores/leads_por_origem";
import { metricaPropostasAceitasPorProduto } from "./adaptadores/propostas_aceitas_por_produto";
import { metricaAnunciosMeta } from "./adaptadores/anuncios_meta";
import { metricaConversoesEnviadas } from "./adaptadores/conversoes_enviadas";
import { estadoDoModulo, moduloLigado } from "./modulos";
import type { ContextoDeConsulta, DefinicaoDeMetrica, Papel, ResultadoDeMetrica } from "./tipos";

/** O catálogo — os ids são únicos e neutros (sem tela, sem provedor). */
export const METRICAS: readonly DefinicaoDeMetrica<unknown>[] = [
  metricaConversas,
  metricaFaturamento,
  metricaDesempenhoAtendentes,
  metricaAtrito,
  metricaCanais,
  metricaPerdas,
  metricaAtividades,
  metricaEtiquetas,
  metricaUsoDeIa,
  metricaEvolucaoDaIa,
  metricaFunilConversao,
  metricaTaxaDeGanhoPorEtapa,
  metricaFechamentosPorFunil,
  metricaLeadsPorOrigem,
  metricaPropostasAceitasPorProduto,
  metricaAnunciosMeta,
  metricaConversoesEnviadas,
];

const mapaDasMetricas = new Map(METRICAS.map((def) => [def.id, def]));

export function metricaPorId(id: string): DefinicaoDeMetrica<unknown> | undefined {
  return mapaDasMetricas.get(id);
}

/** A mesma régua do RBAC — comparação de rank SEMPRE por aqui, nunca na mão. */
export function papelSuficiente(papel: Papel, minimo: Papel): boolean {
  return ROLE_RANK[papel] >= ROLE_RANK[minimo];
}

/** A linha que vai ao modelo no `listar_metricas`. */
export interface MetricaParaOModelo {
  id: string;
  descricao: string;
  dimensoes: string[];
  regua: string;
  papel_minimo: Papel;
  modulo: ModuloOpcional | null;
  disponivel_para_voce: boolean;
}

/**
 * O modelo vê TUDO que existe — com `disponivel_para_voce` — para poder
 * dizer "peça a um gerente" em vez de fingir que a métrica não existe.
 */
export async function listarMetricas(
  ctx: ContextoDeConsulta,
  catalogo: readonly DefinicaoDeMetrica<unknown>[] = METRICAS,
): Promise<MetricaParaOModelo[]> {
  return Promise.all(
    catalogo.map(async (def) => ({
      id: def.id,
      descricao: def.descricao,
      dimensoes: [...def.dimensoes],
      regua: def.regua,
      papel_minimo: def.papelMinimo,
      modulo: def.modulo,
      disponivel_para_voce:
        papelSuficiente(ctx.papel, def.papelMinimo) &&
        (def.modulo === null ? true : await moduloLigado(ctx, def.modulo)),
    })),
  );
}

function resumirIssues(erro: ZodError): string {
  return erro.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "parâmetros"}: ${issue.message}`)
    .join("; ");
}

/**
 * A consulta, na ordem: id → parâmetros → PAPEL → módulo → executar. Papel
 * insuficiente devolve `sem_permissao` SEM chamar a rota; nada lança —
 * exceção inesperada vira `indisponivel` logado.
 */
export async function consultarMetrica(
  ctx: ContextoDeConsulta,
  id: string,
  paramsBrutos: unknown,
  catalogo: readonly DefinicaoDeMetrica<unknown>[] = METRICAS,
): Promise<ResultadoDeMetrica> {
  try {
    const def = catalogo.find((metrica) => metrica.id === id);
    if (!def) {
      return { ok: false, metrica: id, motivo: "parametro_invalido", detalhe: "métrica desconhecida" };
    }
    const validacao = def.parametros.safeParse(paramsBrutos ?? {});
    if (!validacao.success) {
      return { ok: false, metrica: id, motivo: "parametro_invalido", detalhe: resumirIssues(validacao.error) };
    }
    if (!papelSuficiente(ctx.papel, def.papelMinimo)) {
      return { ok: false, metrica: id, motivo: "sem_permissao", papel_minimo: def.papelMinimo };
    }
    if (def.modulo !== null) {
      const estado = await estadoDoModulo(ctx, def.modulo);
      if (!estado.ok) {
        return { ok: false, metrica: id, motivo: "indisponivel", detalhe: "não consegui verificar os módulos da instalação" };
      }
      if (!estado.ligado) {
        return { ok: false, metrica: id, motivo: "modulo_ausente", modulo: def.modulo };
      }
    }
    return await def.executar(ctx, validacao.data);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    logger.warn("assistente.metricas.consulta_falhou", { metrica: id, detalhe });
    return { ok: false, metrica: id, motivo: "indisponivel", detalhe: "erro inesperado na consulta da métrica" };
  }
}
