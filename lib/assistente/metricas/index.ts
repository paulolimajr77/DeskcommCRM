/**
 * Superfície pública do catálogo de métricas — o que o turno do assistente
 * (ferramentas do modelo e rota do chat) consome. Nada além daqui importa
 * caminhos internos da pasta.
 */
export * from "./tipos";
export * from "./periodo";
export {
  chamarRotaPorDentro,
  traduzirResposta,
  type HandlerDeRota,
  type RespostaDaRota,
  type VereditoDaRota,
} from "./chamar-rota";
export { projetar, chavesProibidasEm, CHAVES_PROIBIDAS } from "./projecao";
export { estadoDoModulo, moduloLigado } from "./modulos";
export {
  METRICAS,
  metricaPorId,
  papelSuficiente,
  listarMetricas,
  consultarMetrica,
  type MetricaParaOModelo,
} from "./registro";
export {
  metricaConversas,
  sobreporHandlerDeContagens,
  type ParametrosDeConversas,
} from "./adaptadores/conversas";
export {
  metricaFaturamento,
  sobreporHandlerDoFinanceiro,
  type ParametrosDeFaturamento,
  type BlocoDeMoeda,
  type DadosDoFaturamento,
} from "./adaptadores/faturamento";
export {
  metricaDesempenhoAtendentes,
  sobreporHandlerDeDesempenho,
  type Parametros as ParametrosDeDesempenho,
} from "./adaptadores/desempenho_atendentes";
export {
  metricaAtrito,
  sobreporHandlerDeAtrito,
  type Parametros as ParametrosDeAtrito,
} from "./adaptadores/atrito";
export {
  metricaCanais,
  sobreporHandlerDeCanais,
  type Parametros as ParametrosDeCanais,
} from "./adaptadores/canais";
export {
  metricaPerdas,
  sobreporHandlerDePerdas,
  type Parametros as ParametrosDePerdas,
} from "./adaptadores/perdas";
export {
  metricaAtividades,
  sobreporHandlerDeAtividades,
  type Parametros as ParametrosDeAtividades,
} from "./adaptadores/atividades";
export {
  metricaEtiquetas,
  sobreporHandlerDeEtiquetas,
  type ParametrosDeEtiquetas,
} from "./adaptadores/etiquetas";
export {
  metricaUsoDeIa,
  sobreporHandlerDeUsoDeIa,
  type ParametrosDeUsoDeIa,
} from "./adaptadores/uso_de_ia";
export {
  metricaEvolucaoDaIa,
  sobreporHandlerDeEvolucaoDaIa,
  type ParametrosDeEvolucaoDaIa,
} from "./adaptadores/evolucao_da_ia";
export {
  metricaFunilConversao,
  sobreporHandlerDeFunilConversao,
  type ParametrosDeFunilConversao,
} from "./adaptadores/funil_conversao";
export {
  metricaTaxaDeGanhoPorEtapa,
  sobreporHandlersDeTaxaDeGanho,
  type ParametrosDeTaxaDeGanhoPorEtapa,
} from "./adaptadores/taxa_de_ganho_por_etapa";
