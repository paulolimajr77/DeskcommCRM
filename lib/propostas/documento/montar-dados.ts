// lib/propostas/documento/montar-dados.ts
/**
 * Monta o objeto de dados que `renderizarDocumento` (M2) consome, a partir
 * do `briefing_json` da proposta. Não inventa estrutura própria — o
 * briefing É o insumo (spec de 21/09, M1). `numero` é sempre `null`: o
 * renderer reafirma a regra "número nunca aparece em rascunho" (M2 Global
 * Constraints) — quem chama decide, e este é o único chamador hoje.
 */
export function montarDadosDoDocumento(proposta: { briefing_json: unknown }): Record<string, unknown> {
  const briefing =
    proposta.briefing_json && typeof proposta.briefing_json === "object" && !Array.isArray(proposta.briefing_json)
      ? (proposta.briefing_json as Record<string, unknown>)
      : {};
  return { ...briefing, numero: null };
}
