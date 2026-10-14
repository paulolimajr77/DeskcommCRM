/**
 * GET /api/v1/ai/assistente/threads/[id]/messages — histórico pelo cliente de
 * SESSÃO (vale a RLS). Thread de outra org = 404, nunca 403.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "assistente" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) {
    return fail("validation_failed", t("Conversa inválida."), 422, { requestId });
  }

  const db = await createClient();
  const { data: threads, error: erroThread } = await db
    .from("config_threads")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", parsed.data.id)
    .limit(1);
  if (erroThread !== null) {
    return fail("internal_error", t("Não foi possível ler."), 500, { requestId });
  }
  if (threads.length === 0) {
    return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  }

  const { data, error } = await db
    .from("config_messages")
    .select("id,author_kind,body,created_at")
    .eq("organization_id", authz.org.orgId)
    .eq("thread_id", parsed.data.id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error !== null) {
    return fail("internal_error", t("Não foi possível ler."), 500, { requestId });
  }
  return ok({ mensagens: data }, { requestId });
}
