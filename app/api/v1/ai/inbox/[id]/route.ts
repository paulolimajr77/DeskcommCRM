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
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { registraAtividadeDaTarefa } from "@/lib/tarefas/atividade";

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

  let tarefaCriada: {
    id: string;
    title: string;
    due_date: string | null;
    priority: string;
    lead_id: string | null;
    contact_id: string | null;
  } | null = null;
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
    const sourceKind = is_proposal ? "promised_proposal" : "promised_followup";

    // `negocioDaConversa` (lib/agent-engine/edge/crm/negocio-da-conversa.ts) não
    // existe no repo — medido antes de codar (grep vazio em lib/app/workers).
    // Em vez de inventar essa função, replicamos só a checagem que o brief pede:
    // um contato tem no máximo um negócio "aberto"; 0 ou >1 candidatos = ambíguo,
    // a tarefa nasce sem `lead_id` em vez de adivinhar o negócio errado.
    let leadId: string | null = null;
    let contactId: string | null = null;
    if (data.ref_kind === "conversation" && data.ref_id) {
      const { data: conv } = await admin
        .from("conversations")
        .select("contact_id")
        .eq("organization_id", org.orgId)
        .eq("id", data.ref_id)
        .maybeSingle();
      contactId = conv?.contact_id ?? null;
      if (contactId) {
        const { data: leadRows, error: leadErr } = await admin
          .from("crm_leads")
          .select("id")
          .eq("organization_id", org.orgId)
          .eq("contact_id", contactId)
          .eq("status", "open");
        if (leadErr) {
          // Falha de rede/DB é causa diferente de "ambíguo de verdade" — não
          // pode virar `lead_id: null` em silêncio, senão a tarefa nasce solta
          // sem ninguém saber que a resolução do negócio nem chegou a rodar.
          logger.error("promessa-vira-tarefa: falha ao resolver negócio aberto do contato", {
            organizationId: org.orgId,
            contactId,
            error: leadErr.message,
          });
        } else if (leadRows && leadRows.length === 1) {
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
        contact_id: contactId,
        created_by: authUser.id,
        source_kind: sourceKind,
      })
      .select("id, title, due_date, priority, lead_id, contact_id")
      .single();
    if (tarefaErr) {
      // 23503 = assigned_to apontando para um usuário que não existe (mesmo
      // tratamento de POST /api/v1/tasks, app/api/v1/tasks/route.ts).
      if (tarefaErr.code === "23503") {
        return fail("validation_failed", t("O usuário vinculado não existe."), 422, { requestId });
      }
      return fail("internal_error", t("Falha ao criar a tarefa."), 500, { requestId });
    }
    tarefaCriada = tarefa;

    await audit({
      organizationId: org.orgId,
      actorUserId: authUser.id,
      action: "crm_task.created",
      resourceType: "crm_tasks",
      resourceId: tarefa.id,
      requestId,
      metadata: { due_date: tarefa.due_date, priority: tarefa.priority, source_kind: sourceKind },
    });

    // O laço de retorno (invariante 7 do Sistema Vivo): tarefa presa a um
    // negócio aparece na linha do tempo dele. Chamada incondicional — a própria
    // função trata `lead_id: null` como caso legítimo (tarefa solta) e não
    // escreve nada nesse caso.
    await registraAtividadeDaTarefa(admin, {
      organizationId: org.orgId,
      tarefa,
      tipo: "task_created",
      actorUserId: authUser.id,
    });
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
