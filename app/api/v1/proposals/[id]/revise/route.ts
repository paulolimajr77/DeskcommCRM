/**
 * POST /api/v1/proposals/[id]/revise — D4. Cria a v2 em RASCUNHO a partir de
 * uma proposta ENVIADA: copia titulo/condicoes/valid_until/itens, herda
 * numero/ano, aponta substitui_id para a v1. A v1 CONTINUA `enviada` — só
 * vira `substituida` quando a v2 for efetivamente enviada
 * (app/api/v1/proposals/[id]/send/route.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { decidirRevisao } from "@/lib/propostas/versao";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { sePropostasDesligadas } from "@/lib/propostas/porta";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: proposta } = await admin
    .from("crm_proposals")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  let decisao;
  try {
    decisao = decidirRevisao(proposta as never);
  } catch {
    return fail("proposal_context_stale", t("Esta proposta não pode ser revisada neste estado."), 409, { requestId });
  }

  const { data: itens } = await admin
    .from("crm_proposal_items")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("proposal_id", id)
    .order("position");

  // §5.3 — a v2 conta como "o" rascunho aberto do negócio. Se por algum
  // motivo já houver outro rascunho aberto (de uma cadeia diferente), o
  // índice único do banco recusa — capturado abaixo como 23505.
  const { data: nova, error: novaErr } = await admin
    .from("crm_proposals")
    .insert({
      organization_id: authz.org.orgId,
      lead_id: proposta.lead_id,
      contact_id: proposta.contact_id,
      conversation_id: proposta.conversation_id,
      titulo: proposta.titulo,
      condicoes: proposta.condicoes,
      valid_until: proposta.valid_until,
      total_cents: proposta.total_cents,
      pricing_status: proposta.pricing_status,
      moeda: proposta.moeda,
      status: "rascunho",
      numero: decisao.herdaNumero,
      ano: decisao.herdaAno,
      versao: decisao.novaVersao,
      substitui_id: decisao.substituiId,
    })
    .select("id")
    .single();
  if (novaErr) {
    if ((novaErr as { code?: string }).code === "23505") {
      return fail("validation_failed", t("Este negócio já tem um rascunho de proposta aberto."), 409, { requestId });
    }
    return fail("internal_error", t("Falha ao criar a revisão."), 500, { requestId });
  }
  if (!nova) return fail("internal_error", t("Falha ao criar a revisão."), 500, { requestId });

  if (itens && itens.length > 0) {
    const { error: itensErr } = await admin.from("crm_proposal_items").insert(
      itens.map((it) => ({
        proposal_id: nova.id,
        organization_id: authz.org.orgId,
        product_id: it.product_id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unitario_cents: it.preco_unitario_cents,
        desconto_cents: it.desconto_cents,
        position: it.position,
      })),
    );
    if (itensErr) {
      // A v2 nasceu mas sem itens — descarta-a; a v1 continua `enviada` (D3,
      // mesmo raciocínio de "não substitui uma cadeia por uma v2 vazia").
      await admin.from("crm_proposals").delete().eq("organization_id", authz.org.orgId).eq("id", nova.id);
      return fail("internal_error", t("Falha ao copiar os itens da revisão."), 500, { requestId });
    }
  }

  void audit({
    action: "proposal.revised",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_proposals",
    resourceId: nova.id,
    requestId,
    metadata: { substitui_id: decisao.substituiId },
  });

  return ok({ id: nova.id }, { requestId, status: 201 });
}
