import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { resolverItensDaProposta } from "@/lib/propostas/itens";
import { propostaItemSchema } from "@/lib/schemas/propostas";
import { createClient } from "@/lib/supabase/server";
import { sePropostasDesligadas } from "@/lib/propostas/porta";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });
const patchSchema = z.object({
  revision: z.number().int().positive(),
  titulo: z.string().trim().min(1).max(200).optional(),
  condicoes: z.string().max(4000).nullable().optional(),
  valid_until: z.string().date().nullable().optional(),
  itens: z.array(propostaItemSchema),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const params = paramsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: params.error.flatten() });
  }
  const { id } = params.data;
  const supabase = await createClient();
  const { data: proposta, error: propostaError } = await supabase
    .from("crm_proposals")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();

  if (propostaError) return fail("internal_error", t("Falha ao carregar a proposta."), 500, { requestId });
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  const { data: itens, error: itensError } = await supabase
    .from("crm_proposal_items")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("proposal_id", id)
    .order("position", { ascending: true });

  if (itensError) return fail("internal_error", t("Falha ao carregar os itens."), 500, { requestId });
  return ok({ ...proposta, itens: itens ?? [] }, { requestId });
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const params = paramsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: params.error.flatten() });
  }
  const { id } = params.data;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const input = parsed.data;
  const supabase = await createClient();
  const resolvido = await resolverItensDaProposta(supabase, authz.org.orgId, input.itens);
  if (!resolvido.ok) {
    return fail("validation_failed", t(resolvido.motivo), 422, { requestId });
  }
  const { data: proposta, error } = await supabase
    .from("crm_proposals")
    .update({
      ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
      ...(input.condicoes !== undefined ? { condicoes: input.condicoes } : {}),
      ...(input.valid_until !== undefined ? { valid_until: input.valid_until } : {}),
      total_cents: resolvido.totalCents,
      pricing_status: resolvido.pricingStatus,
      revision: input.revision + 1,
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("revision", input.revision)
    .eq("status", "rascunho")
    .select("id, revision")
    .maybeSingle();

  if (error) return fail("internal_error", t("Falha ao editar a proposta."), 500, { requestId });
  if (!proposta) {
    return fail(
      "proposal_context_stale",
      t("A proposta mudou (ou não está mais em rascunho). Recarregue antes de editar."),
      409,
      { requestId },
    );
  }

  const { error: deleteError } = await supabase
    .from("crm_proposal_items")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("proposal_id", id);
  if (deleteError) return fail("internal_error", t("Falha ao remover os itens anteriores."), 500, { requestId });

  if (input.itens.length > 0) {
    const { error: insertError } = await supabase.from("crm_proposal_items").insert(
      resolvido.itens.map((it) => ({
        organization_id: authz.org.orgId,
        proposal_id: id,
        product_id: it.product_id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unitario_cents: it.preco_unitario_cents,
        desconto_cents: it.desconto_cents,
        position: it.position,
      })),
    );
    if (insertError) return fail("internal_error", t("Falha ao gravar os itens."), 500, { requestId });
  }

  void audit({
    action: "proposal.edited",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_proposals",
    resourceId: id,
    requestId,
  });

  return ok({ id, revision: proposta.revision, total_cents: resolvido.totalCents }, { requestId });
}

/**
 * D4, item 3 da spec ("descartar a v2 em rascunho não toca na v1") — achado
 * Importante da revisão C4: não existia rota nenhuma para desistir de um
 * rascunho. Sem ela, "Revisar" por engano (ou desistência do gerente) criava
 * a v2 e ela ficava como "o" rascunho aberto do negócio para sempre (§5.3),
 * bloqueando qualquer proposta nova até alguém enviá-la — mesmo sem querer.
 * Nunca apaga: vira `cancelada` (a v1, se houver, não é tocada — ela só sai
 * de `enviada` quando uma v2 é EFETIVAMENTE enviada, send/route.ts).
 */
export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const params = paramsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: params.error.flatten() });
  }
  const { id } = params.data;
  const supabase = await createClient();
  const { data: proposta, error } = await supabase
    .from("crm_proposals")
    .update({ status: "cancelada" })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("status", "rascunho")
    .select("id")
    .maybeSingle();

  if (error) return fail("internal_error", t("Falha ao descartar a proposta."), 500, { requestId });
  if (!proposta) {
    return fail(
      "proposal_context_stale",
      t("Só é possível descartar uma proposta em rascunho."),
      409,
      { requestId },
    );
  }

  void audit({
    action: "proposal.discarded",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_proposals",
    resourceId: id,
    requestId,
  });

  return ok({ id, status: "cancelada" }, { requestId });
}
