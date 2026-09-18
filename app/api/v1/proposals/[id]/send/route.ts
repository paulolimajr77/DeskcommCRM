import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { adiarAteAJanelaAbrir } from "@/lib/automation/janela-do-canal";
import { checkDailyLimit, espacarEnvio } from "@/lib/automation/throttle";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { alocarNumero } from "@/lib/propostas/numeracao";
import { decidirVersao } from "@/lib/propostas/versao";
import { renderPropostaPdf } from "@/lib/propostas/pdf";
import { salvarPdfDaProposta } from "@/lib/propostas/storage";
import { marcaDaSaida } from "@/lib/branding/saida";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: proposta } = await admin
    .from("crm_proposals")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  let decisao;
  try {
    decisao = decidirVersao(proposta as never);
  } catch {
    return fail("proposal_context_stale", t("Esta proposta não pode ser enviada neste estado."), 409, { requestId });
  }

  const { data: itens } = await admin
    .from("crm_proposal_items")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("proposal_id", id)
    .order("position");
  if (!itens || itens.length === 0) {
    return fail("validation_failed", t("A proposta não tem itens."), 422, { requestId });
  }

  const { data: conversa } = await admin
    .from("conversations")
    .select("id, channel_session_id")
    .eq("organization_id", authz.org.orgId)
    .eq("contact_id", proposta.contact_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conversa) return fail("validation_failed", t("Nenhuma conversa com este contato para enviar."), 422, { requestId });

  // ─── THROTTLE PRIMEIRO — antes de gastar numero ou gerar PDF (correção 1/2) ───
  const foraDaJanela = await adiarAteAJanelaAbrir(admin, authz.org.orgId, conversa.channel_session_id);
  if (foraDaJanela) {
    return fail("validation_failed", t("Fora do horário de envio configurado. Tente novamente mais tarde."), 422, { requestId });
  }
  const limiteDiario = await checkDailyLimit(admin, authz.org.orgId, conversa.channel_session_id);
  if (!limiteDiario.allowed) {
    return fail("validation_failed", t("Limite diário de mensagens desta conexão foi atingido."), 422, { requestId });
  }

  const { data: lead } = await admin
    .from("crm_leads")
    .select("id, contact_id, value_cents")
    .eq("organization_id", authz.org.orgId)
    .eq("id", proposta.lead_id)
    .single();
  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name, email, phone_number")
    .eq("organization_id", authz.org.orgId)
    .eq("id", proposta.contact_id)
    .single();
  const marca = await marcaDaSaida(authz.org.orgId);

  let propostaAlvo = proposta;
  if (decisao.tipo === "nova_versao") {
    const { data: nova, error: novaErr } = await admin
      .from("crm_proposals")
      .insert({
        organization_id: authz.org.orgId, lead_id: proposta.lead_id, contact_id: proposta.contact_id,
        conversation_id: proposta.conversation_id, titulo: proposta.titulo, condicoes: proposta.condicoes,
        valid_until: proposta.valid_until, total_cents: proposta.total_cents, moeda: proposta.moeda,
        status: "rascunho", versao: decisao.novaVersao, substitui_id: decisao.substituiId,
      })
      .select("*")
      .single();
    if (novaErr || !nova) return fail("internal_error", t("Falha ao criar a nova versão."), 500, { requestId });

    await admin.from("crm_proposal_items").insert(
      itens.map((it) => ({
        organization_id: authz.org.orgId, proposal_id: nova.id, product_id: it.product_id, descricao: it.descricao,
        quantidade: it.quantidade, preco_unitario_cents: it.preco_unitario_cents,
        desconto_cents: it.desconto_cents, position: it.position,
      })),
    );
    await admin.from("crm_proposals").update({ status: "substituida" }).eq("id", decisao.substituiId);
    propostaAlvo = nova;
  }

  // ─── AGORA aloca numero — já marca status='enviada' atomicamente ───
  const numeroEAno = decisao.tipo === "nova_versao"
    ? { numero: decisao.herdaNumero, ano: decisao.herdaAno }
    : await alocarNumero(admin, { orgId: authz.org.orgId, propostaId: propostaAlvo.id });

  // Se herdou número (nova versão), marca status='enviada' e numero/ano
  if (decisao.tipo === "nova_versao") {
    await admin.from("crm_proposals").update({ numero: numeroEAno.numero, ano: numeroEAno.ano, status: "enviada" }).eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id);
  }

  const pdfBuffer = await renderPropostaPdf({
    titulo: propostaAlvo.titulo, numero: numeroEAno.numero, ano: numeroEAno.ano,
    versao: decisao.tipo === "nova_versao" ? decisao.novaVersao : propostaAlvo.versao,
    condicoes: propostaAlvo.condicoes, validUntil: propostaAlvo.valid_until,
    itens: itens.map((it) => ({ descricao: it.descricao, quantidade: it.quantidade, precoUnitarioCents: it.preco_unitario_cents, descontoCents: it.desconto_cents })),
    totalCents: propostaAlvo.total_cents, moeda: propostaAlvo.moeda,
    marca: { app_name: marca.nome, accent_hex: marca.accent, logo_path: marca.logoUrl },
    destinatario: { nome: contato?.display_name ?? contato?.name ?? "Cliente", email: contato?.email ?? null, telefone: contato?.phone_number ?? null },
  });
  const { path: pdfPath, signedUrl } = await salvarPdfDaProposta(admin, {
    orgId: authz.org.orgId, propostaId: propostaAlvo.id, buffer: pdfBuffer,
  });

  await espacarEnvio(conversa.channel_session_id);

  const mensagem = await sendMessageHandler(
    admin,
    { organization_id: authz.org.orgId, actor: { type: "user", id: authz.user.id }, requestId, idioma: authz.user.idioma },
    { conversation_id: conversa.id, type: "document", media_url: signedUrl, media_mime: "application/pdf" },
  );

  // Só grava o que alocarNumero NÃO gravou (correção 3) — sem repetir status/numero/ano.
  await admin
    .from("crm_proposals")
    .update({ pdf_path: pdfPath, sent_at: new Date().toISOString(), sent_by_user_id: authz.user.id })
    .eq("organization_id", authz.org.orgId)
    .eq("id", propostaAlvo.id);

  const totalDoLead = propostaAlvo.total_cents;
  const valorAntes = lead?.value_cents ?? null;
  await admin.from("crm_leads").update({ value_cents: totalDoLead }).eq("organization_id", authz.org.orgId).eq("id", proposta.lead_id);

  // emitLeadActivity so aceita 1 linha por chamada (confirmado) — 2 chamadas, nao insert cru.
  await emitLeadActivity(admin, {
    organizationId: authz.org.orgId, leadId: proposta.lead_id, contactId: proposta.contact_id,
    type: "proposal_sent", sourceModule: "proposals", sourceId: propostaAlvo.id,
    actor: { type: "user", id: authz.user.id },
    reason: `Proposta ${numeroEAno.numero}/${numeroEAno.ano} enviada ao cliente`,
  });
  await emitLeadActivity(admin, {
    organizationId: authz.org.orgId, leadId: proposta.lead_id, contactId: proposta.contact_id,
    type: "proposal_value_changed", sourceModule: "proposals", sourceId: propostaAlvo.id,
    actor: { type: "user", id: authz.user.id },
    reason: `Valor do negócio atualizado de ${valorAntes ?? "—"} para ${totalDoLead} centavos (proposta enviada)`,
  });

  void audit({
    action: "proposal.sent", actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "crm_proposals", resourceId: propostaAlvo.id, requestId,
    metadata: { numero: numeroEAno.numero, ano: numeroEAno.ano },
  });

  return ok({ id: propostaAlvo.id, numero: numeroEAno.numero, ano: numeroEAno.ano, message_id: mensagem.id }, { requestId });
}
