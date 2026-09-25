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
  // N2 — OPCIONAL de propósito (não obrigatório como o plano escrevia): a
  // tela de Configurações › Propostas manda só os 3 campos antigos, e ela não
  // está no escopo desta task. Obrigatório quebraria o salvar dela com 422.
  followup_dias: z.number().int().positive().max(365).optional(),
});

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", authz.org.orgId).single();
  const propostasGravadas = (data?.settings as Record<string, unknown> | null)?.proposals as Record<string, unknown> | null;
  // N2 — o default de `followup_dias` vale também para organização que gravou
  // o objeto ANTES do knob existir (o `??` abaixo só cobriria `proposals`
  // inteiramente ausente).
  const proposals = { followup_dias: 3, ...(propostasGravadas ?? { enabled: false, default_valid_days: 15, default_conditions: null }) };
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
  const settingsAtual = (atual?.settings as Record<string, unknown> | null) ?? {};
  // N2 — merge raso sobre o `proposals` já gravado (não substituição cega):
  // a tela antiga manda só os 3 campos de sempre; sem isto, cada salvar dela
  // apagaria o `followup_dias` de volta para o default.
  const proposalsAtual = (settingsAtual.proposals as Record<string, unknown> | null) ?? {};
  const settingsMesclado = { ...settingsAtual, proposals: { ...proposalsAtual, ...parsed.data } };

  const { error } = await supabase.from("organizations").update({ settings: settingsMesclado }).eq("id", authz.org.orgId);
  if (error) return fail("internal_error", t("Falha ao salvar."), 500, { requestId });

  void audit({
    action: "proposals.config_changed", actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "organization", resourceId: authz.org.orgId, requestId,
    metadata: { proposals: parsed.data },
  });

  return ok(parsed.data, { requestId });
}
