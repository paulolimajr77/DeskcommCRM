/**
 * A PROJEÇÃO DE UMA PROPOSTA para a leitura e as decisões (F2b, T20).
 *
 * Fonte ÚNICA da forma do item devolvido: o GET de `propostas` e as três
 * ações (`aprovar`/`rejeitar`/`aplicar`) devolvem o MESMO formato, montado
 * aqui. Duas regras que este arquivo sustenta:
 *
 *  1. `vencida` é CALCULADO, nunca coluna: é o estado do mundo no instante da
 *     leitura (`status in ('pendente','aprovada') and expires_at < now()`),
 *     não um dado gravado. GET não escreve nada — então nada marca
 *     expirada por efeito de uma leitura.
 *  2. O payload VIA INTEIRO na resposta: quem lê a fila é `admin` (a RLS da
 *     0690 limita o select), e a tela da T21 precisa do diff (antes/depois).
 *     PII de cliente não existe no payload por construção (o `payload.ts`
 *     curou os campos); prompt, FAQ e memória da EMPRESA podem.
 */

/** `type` (e não `interface`) de propósito: só type alias recebe index
 * signature implícita, e é o que `pool.query<LinhaDaProposta>` exige. */
export type LinhaDaProposta = {
  id: string;
  kind: string;
  payload: unknown;
  risk: string;
  status: string;
  resumo: string;
  motivo: string;
  antes: unknown;
  requested_by: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  applied_by: string | null;
  applied_at: string | null;
  apply_result: unknown;
  expires_at: string;
  created_at: string;
}

/** As colunas que a projeção lê — uma lista só, para select e retorno casarem. */
export const COLUNAS_DA_PROPOSTA =
  "id, kind, payload, risk, status, resumo, motivo, antes, requested_by, decided_by, decided_at, decision_reason, applied_by, applied_at, apply_result, expires_at, created_at";

/** `vencida` calculado — os dois estados que ainda podem virar `expirada`. */
export function propostaVencida(status: string, expiresAt: string): boolean {
  const venceu = new Date(expiresAt).getTime() < Date.now();
  return (status === "pendente" || status === "aprovada") && venceu;
}

/** A operação que o payload carrega — o único campo dele que sai para o audit. */
export function operacaoDaLinha(linha: { payload: unknown }): string | null {
  const payload =
    linha.payload !== null && typeof linha.payload === "object"
      ? (linha.payload as { operacao?: unknown })
      : null;
  return typeof payload?.operacao === "string" ? payload.operacao : null;
}

/** O item da resposta: os campos da linha, `operacao` extraída do payload e `vencida`. */
export function dadosDaProposta(linha: LinhaDaProposta) {
  return {
    id: linha.id,
    kind: linha.kind,
    operacao: operacaoDaLinha(linha),
    risk: linha.risk,
    status: linha.status,
    resumo: linha.resumo,
    motivo: linha.motivo,
    antes: linha.antes ?? null,
    payload: linha.payload ?? null,
    requested_by: linha.requested_by,
    decided_by: linha.decided_by,
    decided_at: linha.decided_at,
    decision_reason: linha.decision_reason,
    applied_by: linha.applied_by,
    applied_at: linha.applied_at,
    apply_result: linha.apply_result,
    expires_at: linha.expires_at,
    created_at: linha.created_at,
    vencida: propostaVencida(linha.status, linha.expires_at),
  };
}
