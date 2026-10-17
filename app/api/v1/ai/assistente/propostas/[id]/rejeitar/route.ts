/**
 * POST /api/v1/ai/assistente/propostas/[id]/rejeitar — o "não" do administrador
 * (F2b, T20): `pendente → rejeitada`, com carimbo de decisão e o motivo
 * opcional (≤1000 caracteres) gravado em `decision_reason` — insumo
 * estruturado do laço de retorno (F4), não texto de trilha.
 *
 * Mesmo contrato da `aprovar`: guarda de suporte antes de qualquer efeito,
 * `[id]` uuid, `requireRole("admin")` da sessão, compare-and-swap pelo pool
 * (estado esperado na própria condição, organização da sessão) e o mesmo
 * "por quê" no zero linhas. O audit NUNCA carrega o motivo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

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

const corpoDaRejeicao = z.strictObject({
  motivo: z.string().trim().min(1).max(1000).optional(),
});

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
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

  // Corpo opcional: sem corpo (ou vazio) é rejeitar sem motivo. JSON
  // malformado é 400; chave estranha (incluindo organization_id) é 422.
  let bruto: unknown = {};
  try {
    bruto = await req.json();
  } catch {
    bruto = {};
  }
  const parsed = corpoDaRejeicao.safeParse(bruto);
  if (!parsed.success) {
    return fail("validation_failed", t("Motivo inválido."), 422, {
      requestId,
      details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const motivo = parsed.data.motivo ?? null;

  try {
    const pool = getRequestPool();
    const { rows } = await pool.query<LinhaDaProposta>(
      `update public.config_proposals
         set status = 'rejeitada', decided_by = $3::uuid, decided_at = now(), decision_reason = $4::text
         where id = $1::uuid and organization_id = $2::uuid
           and status = 'pendente' and expires_at > now()
         returning ${COLUNAS_DA_PROPOSTA}`,
      [id, orgId, userId, motivo],
    );
    const linha = rows[0];
    if (linha) {
      // O MOTIVO NUNCA entra no metadata: `api_audit_log` é append-only e não
      // sai pela cascata de LGPD — o motivo fica na linha da proposta, que a
      // RLS limita a admin.
      await audit({
        action: "assistente.proposta_rejeitada",
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
      "rejeitada",
    );
  } catch {
    return fail("internal_error", t("Não consegui rejeitar a proposta."), 500, { requestId });
  }
}
