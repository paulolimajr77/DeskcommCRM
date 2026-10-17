/**
 * POST /api/v1/ai/assistente/propostas/[id]/aprovar — o clique do administrador
 * (F2b, T20): `pendente → aprovada`, com carimbo de QUEM e QUANDO decidiu.
 * Aprovar NUNCA executa efeito no negócio — quem aplica é a rota `aplicar`,
 * com o guardrail 2 da spec (só proposta `aprovada` vira escrita).
 *
 * ## O que a ordem das linhas garante
 *
 *  1. `requireSupportWrite()` ANTES de qualquer efeito (guarda de efeito do
 *     acompanhamento, gate `suporte-cobertura-de-efeitos`).
 *  2. `[id]` validado como uuid (422 se não for).
 *  3. `requireRole("admin")` da SESSÃO — manager/agent/viewer recebem 403.
 *  4. Compare-and-swap pelo pool de serviço: o estado esperado (`pendente` e
 *     dentro do prazo) mora na PRÓPRIA condição do `update` — e a
 *     `organization_id` é SEMPRE a da sessão, nunca do corpo. Zero linhas →
 *     `recusaDaTransicao` explica (404 / expirada / estado inválido).
 *  5. O audit leva só `kind`, `operacao` e `risk` — nunca o texto do payload.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { recusaDaTransicao, UUID_DA_PROPOSTA } from "@/lib/assistente/propostas/decisao";
import {
  COLUNAS_DA_PROPOSTA,
  dadosDaProposta,
  operacaoDaLinha,
  type LinhaDaProposta,
} from "@/lib/assistente/propostas/projecao";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_DA_PROPOSTA.test(id)) {
    return fail("invalid_request", "Id inválido.", 422, { requestId });
  }

  const authz = await requireRole("admin", { requestId, resource: "assistente_propostas" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  try {
    const pool = getRequestPool();
    // CAS: só aprova quem está `pendente` e dentro do prazo, NA ORGANIZAÇÃO da sessão.
    const { rows } = await pool.query<LinhaDaProposta>(
      `update public.config_proposals
         set status = 'aprovada', decided_by = $3::uuid, decided_at = now()
         where id = $1::uuid and organization_id = $2::uuid
           and status = 'pendente' and expires_at > now()
         returning ${COLUNAS_DA_PROPOSTA}`,
      [id, orgId, userId],
    );
    const linha = rows[0];
    if (linha) {
      // SEM o texto do payload: `api_audit_log` é append-only e não sai pela cascata de LGPD.
      await audit({
        action: "assistente.proposta_aprovada",
        actorUserId: userId,
        organizationId: orgId,
        resourceType: "config_proposals",
        resourceId: id,
        metadata: {
          kind: linha.kind,
          operacao: operacaoDaLinha(linha),
          risk: linha.risk,
        },
        requestId,
      });
      return ok(dadosDaProposta(linha), { requestId });
    }
    return await recusaDaTransicao(
      (sql, params) => pool.query(sql, params),
      id,
      orgId,
      requestId,
      t,
      "aprovada",
    );
  } catch {
    return fail("internal_error", t("Não consegui aprovar a proposta."), 500, { requestId });
  }
}
