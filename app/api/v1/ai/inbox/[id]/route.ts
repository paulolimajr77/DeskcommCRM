import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * Épico Operação Visível (F1) — transição de status de um aviso do agente.
 * PATCH { status: 'ack' | 'resolved' | 'open' } — org-scoped, auditado.
 * Reabrir (→'open') é permitido: resolver por engano não pode esconder alerta.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolver a promessa como tarefa: quem resolve o aviso decide se é uma
 * promessa de proposta, e escolhe o prazo — a máquina não classifica o texto
 * sozinha (mesmo princípio de P6 do plano do funil).
 */
const criarTarefaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  due_date: z.string().datetime(),
  assigned_to: z.string().uuid().nullable().optional(),
  is_proposal: z.boolean().default(false),
});
const bodySchema = z
  .object({
    status: z.enum(["open", "ack", "resolved"]),
    create_task: criarTarefaSchema.optional(),
  })
  .strict();

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) {
    return fail("invalid_request", "id inválido.", 400, { requestId });
  }

  const authz = await requireRole("agent", { requestId, resource: "agent_inbox_items" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user: authUser, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_inbox_items")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id, kind, severity, title, body, ref_kind, ref_id, status, created_at")
    .maybeSingle();
  if (error) {
    return fail("internal_error", t("Falha ao atualizar o aviso."), 500, { requestId });
  }
  if (!data) {
    return fail("not_found", t("Aviso não encontrado nesta organização."), 404, { requestId });
  }

  let tarefaCriada: { id: string } | null = null;
  if (parsed.data.create_task) {
    if (data.kind !== "promise_unfulfilled") {
      return fail(
        "validation_failed",
        t("Criar tarefa só é possível a partir de um aviso de promessa."),
        422,
        { requestId },
      );
    }
    const { title, due_date, assigned_to, is_proposal } = parsed.data.create_task;

    // `negocioDaConversa` (lib/agent-engine/edge/crm/negocio-da-conversa.ts) não
    // existe no repo — medido antes de codar (grep vazio em lib/app/workers).
    // Em vez de inventar essa função, replicamos só a checagem que o brief pede:
    // um contato tem no máximo um negócio "aberto"; 0 ou >1 candidatos = ambíguo,
    // a tarefa nasce sem `lead_id` em vez de adivinhar o negócio errado.
    let leadId: string | null = null;
    if (data.ref_kind === "conversation" && data.ref_id) {
      const { data: conv } = await admin
        .from("conversations")
        .select("contact_id")
        .eq("organization_id", org.orgId)
        .eq("id", data.ref_id)
        .maybeSingle();
      if (conv?.contact_id) {
        const { data: leadRows, error: leadErr } = await admin
          .from("crm_leads")
          .select("id")
          .eq("organization_id", org.orgId)
          .eq("contact_id", conv.contact_id)
          .eq("status", "open");
        if (!leadErr && leadRows && leadRows.length === 1) {
          leadId = leadRows[0]!.id as string;
        }
      }
    }

    const { data: tarefa, error: tarefaErr } = await admin
      .from("crm_tasks")
      .insert({
        organization_id: org.orgId,
        title,
        due_date,
        assigned_to: assigned_to ?? null,
        lead_id: leadId,
        created_by: authUser.id,
        source_kind: is_proposal ? "promised_proposal" : "promised_followup",
      })
      .select("id")
      .single();
    if (tarefaErr) {
      return fail("internal_error", t("Falha ao criar a tarefa."), 500, { requestId });
    }
    tarefaCriada = tarefa;
  }

  await audit({
    action: "ai.inbox_item_status_changed",
    actorUserId: authUser.id,
    organizationId: org.orgId,
    resourceType: "agent_inbox_items",
    resourceId: id,
    metadata: { status: parsed.data.status },
  });

  return ok({ item: data, task_id: tarefaCriada?.id ?? null }, { requestId });
}
