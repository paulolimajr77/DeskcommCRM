/**
 * A TRANSIÇÃO DE ESTADO das propostas por SQL do pool de serviço (F2b, T20).
 *
 * A migration 0690 tirou `update` de `authenticated` — nenhuma sessão aprova,
 * rejeita ou aplica pelo PostgREST. Quem muda estado aqui usa `getRequestPool()`
 * com SQL parametrizado e COMPARE-AND-SWAP: o estado esperado mora na PRÓPRIA
 * condição do `update` (`status = 'pendente' and expires_at > now()`), nunca
 * num `select` seguido de `update` solto. E a organização entra SEMPRE como
 * parâmetro, vinda da sessão — o pool é de serviço (não vale RLS), então o
 * filtro é responsabilidade deste arquivo.
 *
 * O gatilho `fn_config_proposals_transicao()` da 0690 continua sendo a última
 * trava: se uma rota errar a condição, o banco recusa a transção com 23514.
 */
import type { NextResponse } from "next/server";

import { fail } from "@/lib/api/wrappers";

import { propostaVencida } from "./projecao";

/** O `[id]` de rota é validado como uuid (422 se não for). */
export const UUID_DA_PROPOSTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Forma mínima de uma consulta SQL parametrizada (pool.query). */
export type ConsultaSql = (
  sql: string,
  params: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

/**
 * Explica POR QUE o compare-and-swap não casou (zero linhas), lendo a linha
 * com a organização da sessão:
 *  - não existe / é de outra organização → 404;
 *  - ainda podia decidir, mas venceu → marca `expirada` (a marca é efeito da
 *    ação negada — não tem audit próprio) e devolve 409 `proposta_expirada`;
 *  - outro estado (aprovada/aplicada/rejeitada/expirada) → 409
 *    `proposta_em_estado_invalido` com o status atual.
 */
export async function recusaDaTransicao(
  consultar: ConsultaSql,
  id: string,
  organizationId: string,
  requestId: string,
  t: (texto: string) => string,
  verbo: "aprovada" | "rejeitada",
): Promise<NextResponse> {
  const leitura = await consultar(
    "select status, expires_at from public.config_proposals where id = $1::uuid and organization_id = $2::uuid",
    [id, organizationId],
  );
  const linha = leitura.rows[0];
  if (!linha) {
    return fail("not_found", t("Proposta não encontrada."), 404, { requestId });
  }
  const status = String(linha.status);
  const expiresAt = String(linha.expires_at);
  if (propostaVencida(status, expiresAt)) {
    await consultar(
      "update public.config_proposals set status = 'expirada' where id = $1::uuid and organization_id = $2::uuid and status in ('pendente','aprovada') and expires_at <= now()",
      [id, organizationId],
    );
    return fail(
      "proposta_expirada",
      verbo === "aprovada"
        ? t("A proposta venceu (7 dias) e não pode mais ser aprovada.")
        : t("A proposta venceu (7 dias) e não pode mais ser rejeitada."),
      409,
      { requestId },
    );
  }
  return fail(
    "proposta_em_estado_invalido",
    verbo === "aprovada"
      ? t('A proposta está em outro estado — só uma "pendente" pode ser aprovada.')
      : t('A proposta está em outro estado — só uma "pendente" pode ser rejeitada.'),
    409,
    { requestId, details: { status } },
  );
}
