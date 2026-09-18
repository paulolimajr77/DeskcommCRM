import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
const patchSchema = z.object({
  enabled: z.boolean(),
  default_valid_days: z.number().int().positive().max(365),
  default_conditions: z.string().max(4000).nullable(),
});

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", authz.org.orgId).single();
  const proposals = (data?.settings as Record<string, unknown> | null)?.proposals ?? {
    enabled: false, default_valid_days: 15, default_conditions: null,
  };
  return ok(proposals, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });

  // ADMIN CLIENT, nao createClient() — RLS de organizations so permite
  // UPDATE a platform_admin; um manager comum casaria 0 linhas em silencio
  // (issue #144, ver settings/routing/route.ts). O gate de papel acima
  // continua sendo a protecao real.
  const supabase = createAdminClient();
  const { data: atual } = await supabase.from("organizations").select("settings").eq("id", authz.org.orgId).single();
  const settingsMesclado = { ...(atual?.settings as Record<string, unknown> | null ?? {}), proposals: parsed.data };

  const { error } = await supabase.from("organizations").update({ settings: settingsMesclado }).eq("id", authz.org.orgId);
  if (error) return fail("internal_error", t("Falha ao salvar."), 500, { requestId });

  void audit({
    action: "proposals.config_changed", actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "organization", resourceId: authz.org.orgId, requestId,
    metadata: { proposals: parsed.data },
  });

  return ok(parsed.data, { requestId });
}
