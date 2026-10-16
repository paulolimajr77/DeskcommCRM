/**
 * O VOCABULÁRIO DAS PROPOSTAS DE CONFIGURAÇÃO DO ASSISTENTE (F2b, T18).
 *
 * As três listas falam o MESMO vocabulário dos CHECKs de `config_proposals`
 * (migration 0690): `TIPOS_DE_PROPOSTA` = `kind`, `RISCOS_DA_PROPOSTA` = `risk`,
 * `STATUS_DA_PROPOSTA` = `status`. Valor novo entra nos dois lados juntos —
 * `lib/assistente/propostas/tipos.test.ts` prova a paridade lendo a migration,
 * e `tests/invariants/vocabulario-banco-x-typescript.test.ts` prova contra o
 * banco de verdade no CI.
 *
 * Puro de propósito: sem importar nada de servidor, para a tela da T21, as
 * ferramentas da T19 e as rotas da T20 lerem daqui sem puxar dependência.
 */

/** O que a proposta mexe (1 proposta = 1 artefato). Sem `critico` de propósito. */
export const TIPOS_DE_PROPOSTA = [
  "roteador",
  "conhecimento",
  "memoria",
  "modelo_auxiliares",
  "funil",
] as const;
export type TipoDeProposta = (typeof TIPOS_DE_PROPOSTA)[number];

/** Crítico não tem ferramenta de proposta: vira "PRECISO CONFIRMAR". */
export const RISCOS_DA_PROPOSTA = ["seguro", "atencao"] as const;
export type RiscoDaProposta = (typeof RISCOS_DA_PROPOSTA)[number];

/** `pendente → aprovada → aplicada`, mais `rejeitada` e `expirada`. */
export const STATUS_DA_PROPOSTA = [
  "pendente",
  "aprovada",
  "aplicada",
  "rejeitada",
  "expirada",
] as const;
export type StatusDaProposta = (typeof STATUS_DA_PROPOSTA)[number];

/**
 * As 5 transições que existem — as mesmas do gatilho
 * `fn_config_proposals_transicao()` (migration 0690). Estado igual não é
 * transição (o gatilho só aceita como no-op sem mudança): aqui reprova.
 */
const TRANSICOES_PERMITIDAS: ReadonlyArray<
  readonly [StatusDaProposta, StatusDaProposta]
> = [
  ["pendente", "aprovada"],
  ["pendente", "rejeitada"],
  ["pendente", "expirada"],
  ["aprovada", "aplicada"],
  ["aprovada", "expirada"],
];

export function podeTransitar(
  de: StatusDaProposta,
  para: StatusDaProposta,
): boolean {
  return TRANSICOES_PERMITIDAS.some(([o, n]) => o === de && n === para);
}
