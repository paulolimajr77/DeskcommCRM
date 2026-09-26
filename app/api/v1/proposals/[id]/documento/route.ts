// app/api/v1/proposals/[id]/documento/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { montarDadosDoDocumento } from "@/lib/propostas/documento/montar-dados";
import { renderizarDocumento } from "@/lib/propostas/documento/renderer";
import { resolverModelo } from "@/lib/propostas/modelos/resolver";
import { montarEntradaDeProntidao } from "@/lib/propostas/prontidao-da-proposta";
import { sePropostasDesligadas } from "@/lib/propostas/porta";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ secaoId: z.string().min(1), texto: z.string() });

type Ctx = { params: Promise<{ id: string }> };

async function buscarProposta(admin: ReturnType<typeof createAdminClient>, orgId: string, id: string) {
  const { data } = await admin
    .from("crm_proposals")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data as
    | {
        id: string;
        organization_id: string;
        template_slug: string | null;
        template_slug_sugerido: string | null;
        briefing_json: unknown;
        secoes_editadas: Record<string, string> | null;
        pricing_status: "missing" | "catalog" | "manual" | "custom" | "approved";
        contact_id: string | null;
        titulo: string | null;
        prazo_dias_uteis: number | null;
        pagamento: string | null;
        valid_until: string | null;
        total_cents: number;
        moeda: string;
        created_at: string;
      }
    | null;
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const proposta = await buscarProposta(admin, authz.org.orgId, id);
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  if (!proposta.template_slug) {
    return ok(
      { modeloSlug: null, modeloSlugSugerido: proposta.template_slug_sugerido, secoes: [], variaveisFaltando: [] as string[], prontidao: null, resumoComercial: null },
      { requestId },
    );
  }

  const modelo = await resolverModelo(admin, authz.org.orgId, proposta.template_slug);
  if (!modelo) {
    return ok(
      { modeloSlug: proposta.template_slug, modeloSlugSugerido: proposta.template_slug_sugerido, secoes: [], variaveisFaltando: [] as string[], prontidao: null, resumoComercial: null },
      { requestId },
    );
  }

  const { data: contato } = proposta.contact_id
    ? await admin
        .from("contacts")
        .select("name, display_name")
        .eq("organization_id", authz.org.orgId)
        .eq("id", proposta.contact_id)
        .maybeSingle()
    : { data: null };

  const dados = montarDadosDoDocumento(proposta, contato);
  const documento = renderizarDocumento(modelo, dados);
  const overrides = proposta.secoes_editadas ?? {};

  const secoes = documento.secoes.map((s) =>
    overrides[s.id] !== undefined ? { ...s, body: overrides[s.id]!, faltantes: [] } : s,
  );
  const variaveisFaltando = secoes.flatMap((s) => s.faltantes);

  const { data: itens } = await admin
    .from("crm_proposal_items")
    .select("preco_unitario_cents")
    .eq("organization_id", authz.org.orgId)
    .eq("proposal_id", id);
  const temItensComPreco = (itens ?? []).length > 0 && (itens ?? []).every((it) => it.preco_unitario_cents !== null);

  const prontidao = montarEntradaDeProntidao(
    {
      contact_id: proposta.contact_id,
      titulo: proposta.titulo,
      pricing_status: proposta.pricing_status,
      prazo_dias_uteis: proposta.prazo_dias_uteis,
      pagamento: proposta.pagamento,
      valid_until: proposta.valid_until,
      briefing_json: proposta.briefing_json,
    },
    temItensComPreco,
  );

  return ok({ modeloSlug: modelo.slug, modeloSlugSugerido: proposta.template_slug_sugerido, secoes, variaveisFaltando, prontidao, resumoComercial: null }, { requestId });
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });

  const admin = createAdminClient();
  const proposta = await buscarProposta(admin, authz.org.orgId, id);
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  const secoesEditadas = { ...(proposta.secoes_editadas ?? {}), [parsed.data.secaoId]: parsed.data.texto };

  const { error } = await admin
    .from("crm_proposals")
    .update({ secoes_editadas: secoesEditadas })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (error) return fail("internal_error", t("Falha ao salvar a seção."), 500, { requestId });

  void audit({
    action: "proposal.documento_editado",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_proposals",
    resourceId: id,
    requestId,
    metadata: { secaoId: parsed.data.secaoId },
  });

  return ok({ secoesEditadas }, { requestId });
}
