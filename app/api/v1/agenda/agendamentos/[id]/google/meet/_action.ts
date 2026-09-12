import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { googleRpc } from "@/lib/agenda/google/sync-store";
import { ok, fail } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";
import { motivoDoMeet } from "@/lib/agenda/motivo-do-meet";
import { traduzir } from "@/lib/i18n/dicionario";
import { audit } from "@/lib/audit";

export async function meetingAction(
  req: Request,
  context: { params: Promise<{ id: string }> },
  action: "retry" | "deliver",
) {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const auth = await requireRole("agent", { requestId, resource: "agenda" });
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = z
    .object({
      revision: z.string().regex(/^\d+$/),
      request_id: z.uuid().nullable(),
      conversation_id: z.uuid().optional(),
    })
    .strict()
    .safeParse(await req.json().catch(() => null));
  if (
    !z.uuid().safeParse(id).success ||
    !parsed.success ||
    (action === "deliver" && !parsed.data.conversation_id)
  )
    return fail(
      "validation_failed",
      "Atualize o compromisso e escolha a conversa de destino.",
      422,
      { requestId },
    );
  try {
    const changed = await googleRpc(await createClient(), "fn_meet_action", {
      p_org: auth.org.orgId,
      p_id: id,
      p_revision: parsed.data.revision,
      p_request: parsed.data.request_id,
      p_action: action,
      p_conversation: parsed.data.conversation_id ?? null,
    });
    if (changed)
      await audit({
        action: "agenda.meet_action_requested",
        organizationId: auth.org.orgId,
        actorUserId: auth.user.id,
        resourceType: "calendar_appointment",
        resourceId: id,
        requestId,
        metadata: { action },
      });
    return ok({ pending: true, changed: Boolean(changed) }, { requestId });
  } catch (error) {
    // O motivo REAL, não um literal. A versão anterior gravava
    // `code: "internal_error"` fixo — o servidor sabia por que tinha recusado e
    // apagava a informação ao registrá-la. Foi o que fez uma investigação de um
    // dia inteiro não achar nada nos logs.
    const motivo = motivoDoMeet(error);
    // ⛔ A MENSAGEM CRUA DO ERRO NUNCA ENTRA AQUI.
    //
    // Ela pode carregar o LINK DA REUNIÃO — `tests/unit/agenda-meet-routes.test.ts`
    // injeta `https://meet.google.com/secret?token=private` como mensagem e exige
    // que o registro não contenha "secret". O `code: "internal_error"` fixo da
    // versão anterior não era descuido: era sanitização.
    //
    // O que este commit conserta é outra coisa — aquele campo era fixo para TODO
    // erro, então o motivo se perdia junto com o segredo. Agora vai o `codigo`
    // derivado, que é identificador nosso (`meet_conversation_stale`,
    // `forbidden`, …) e não carrega dado de ninguém. Diagnóstico sem vazamento.
    logger.error("agenda.meet_action_failed", {
      requestId,
      action,
      code: motivo.codigo,
      sqlstate: error && typeof error === "object" && "code" in error ? String(error.code) : null,
    });
    // ⛔ RECUSA DE REGRA NUNCA VAI COMO 5xx.
    //
    // O cliente HTTP repete automaticamente em 5xx. Devolver 500 para uma
    // recusa conhecida virava três tentativas idênticas, três recusas
    // idênticas, e ~20 segundos de espera antes de uma frase que não dizia
    // nada — medido com cronômetro por quem operava.
    return fail(motivo.codigo, traduzir(motivo.texto, auth.user.idioma), motivo.status, { requestId });
  }
}
