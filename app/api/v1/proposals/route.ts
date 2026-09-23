/**
 * GET  /api/v1/proposals — lista as propostas da organização ativa.
 * POST /api/v1/proposals — cria um RASCUNHO. numero/ano nascem NULL (spec
 * §5.3): só são alocados no envio (Tarefa 14), para rascunho descartado não
 * queimar número.
 */
import { requireSupportWrite } from "@/lib/impersonate/support";
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { calcularTotal } from "@/lib/propostas/total";
import { propostaCreateSchema } from "@/lib/schemas/propostas";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { sePropostasDesligadas } from "@/lib/propostas/porta";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;

  const supabase = await createClient();
  const status = req.nextUrl.searchParams.get("status");
  let q = supabase
    .from("crm_proposals")
    .select("id, lead_id, titulo, status, total_cents, moeda, numero, ano, versao, valid_until, created_at")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return fail("internal_error", "Falha ao listar propostas.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  // Guarda de EFEITO: um acompanhamento de suporte só-leitura (ou já
  // encerrado) não pode criar rascunho na organização do cliente. Mesmo
  // padrão de toda rota de mutação do repo (`app/api/v1/products/route.ts`,
  // `app/api/v1/pipelines/route.ts` e outras 180+).
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = propostaCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const input = parsed.data;
  const supabase = await createClient();

  // O lead_id do body nunca é confiado sozinho: confirma que pertence à
  // organização ativa ANTES de gravar qualquer coisa vinculada a ele
  // (CLAUDE.md — multi-tenancy é inegociável).
  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, contact_id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", input.lead_id)
    .maybeSingle();
  if (!lead) return fail("not_found", t("Negócio não encontrado nesta organização."), 404, { requestId });

  // crm_proposals.contact_id é NOT NULL (baseline.sql), e crm_leads.contact_id
  // é opcional — um negócio sem contato vinculado quebraria o INSERT com um
  // 500 cru em vez de uma recusa legível.
  if (!lead.contact_id) {
    return fail(
      "validation_failed",
      t("Este negócio não tem um contato vinculado. Vincule um contato antes de criar a proposta."),
      422,
      { requestId },
    );
  }

  const totalCents = calcularTotal(input.itens);

  let validUntil = input.valid_until;
  if (validUntil === undefined) {
    const { data: org } = await supabase.from("organizations").select("settings").eq("id", authz.org.orgId).single();
    const dias = ((org?.settings as Record<string, unknown> | null)?.proposals as { default_valid_days?: number } | undefined)?.default_valid_days ?? 15;
    const data = new Date();
    data.setDate(data.getDate() + dias);
    validUntil = data.toISOString().slice(0, 10);
  }

  const { data: proposta, error: propErr } = await supabase
    .from("crm_proposals")
    .insert({
      organization_id: authz.org.orgId,
      lead_id: input.lead_id,
      contact_id: lead.contact_id,
      titulo: input.titulo,
      condicoes: input.condicoes ?? null,
      valid_until: validUntil ?? null,
      total_cents: totalCents,
      status: "rascunho",
    })
    .select("id")
    .single();
  if (propErr || !proposta) return fail("internal_error", t("Falha ao criar a proposta."), 500, { requestId });

  if (input.itens.length > 0) {
    const { error: itensErr } = await supabase.from("crm_proposal_items").insert(
      input.itens.map((it) => ({
        proposal_id: proposta.id,
        // crm_proposal_items.organization_id é NOT NULL e o trigger
        // `fn_verificar_org_do_item_da_proposta` recusa a linha se não bater
        // com a organização da proposta — nunca inferir por join (CLAUDE.md).
        organization_id: authz.org.orgId,
        product_id: it.product_id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unitario_cents: it.preco_unitario_cents,
        desconto_cents: it.desconto_cents,
        position: it.position,
      })),
    );
    if (itensErr) return fail("internal_error", t("Falha ao gravar os itens."), 500, { requestId });
  }

  // Vocabulário fechado da timeline (lib/leads/activity-vocabulary.ts) e
  // escritor canônico (lib/leads/activity-emitter.ts) — mesmo caminho que o
  // resto do CRM usa para gravar em crm_lead_activities, nunca um insert cru.
  await emitLeadActivity(supabase, {
    organizationId: authz.org.orgId,
    leadId: input.lead_id,
    contactId: lead.contact_id,
    type: "proposal_drafted",
    sourceModule: "proposals",
    sourceId: proposta.id,
    actor: { type: "user", id: authz.user.id },
    reason: `Rascunho de proposta criado: ${input.titulo}`,
  });

  void audit({
    action: "proposal.drafted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_proposals",
    resourceId: proposta.id,
    requestId,
  });

  return ok({ id: proposta.id }, { requestId, status: 201 });
}
