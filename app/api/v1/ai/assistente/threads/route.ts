/**
 * GET /api/v1/ai/assistente/threads — lista pelo cliente de SESSÃO (vale a RLS).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    limite: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "assistente" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return fail("validation_failed", t("Query inválida."), 422, { requestId });
  }

  const db = await createClient();
  const { data, error } = await db
    .from("config_threads")
    .select("id,kind,last_message_at,created_at")
    .eq("organization_id", authz.org.orgId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(parsed.data.limite);
  if (error !== null) {
    return fail("internal_error", t("Não foi possível listar."), 500, { requestId });
  }
  return ok({ threads: data }, { requestId });
}
