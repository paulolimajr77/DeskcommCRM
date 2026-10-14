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
