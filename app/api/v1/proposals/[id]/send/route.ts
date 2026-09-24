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
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { sePropostasDesligadas } from "@/lib/propostas/porta";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
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

  // A chamada vale pelo efeito de validação: lança para qualquer status que
  // não seja `rascunho`, e o catch abaixo vira o 409 (o valor de retorno não
  // é mais usado — só rascunho chega até aqui).
  try {
    decidirVersao(proposta as never);
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

  // §5.2 — enviar com qualquer item sem preço é recusado, com a lista.
  if (proposta.pricing_status === "missing") {
    const semPreco = itens
      .filter((it) => (it as { preco_unitario_cents: number | null }).preco_unitario_cents === null)
      .map((it) => (it as { descricao: string }).descricao);
    return fail(
      "validation_failed",
      t(`Item sem preço definido: ${semPreco.join(", ")}. Defina o preço antes de enviar.`),
      422,
      { requestId },
    );
  }

  // D5, último item da tabela: a proposta grava a conversa do turno que a
  // originou (Task 7) — o envio prefere ESSA conversa, e só cai no fallback
  // "mais recente do contato" para propostas manuais antigas sem o campo.
  // `contact_id` entra no filtro (revisão C3): sem ele, uma referência
  // gravada errada (outro contato) seria usada do mesmo jeito, mandando o
  // PDF/preços desta proposta no WhatsApp de um contato que não é o dela.
  const { data: conversa } = proposta.conversation_id
    ? await admin
        .from("conversations")
        .select("id, channel_session_id")
        .eq("organization_id", authz.org.orgId)
        .eq("id", proposta.conversation_id)
        .eq("contact_id", proposta.contact_id)
        .maybeSingle()
    : await admin
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

  // `maybeSingle` — D10: proposta órfã (lead_id/contact_id nulos) não pode
  // derrubar o envio de uma v2 com um erro de "linha não encontrada".
  const { data: lead } = proposta.lead_id
    ? await admin
        .from("crm_leads")
        .select("id, contact_id, value_cents")
        .eq("organization_id", authz.org.orgId)
        .eq("id", proposta.lead_id)
        .maybeSingle()
    : { data: null };
  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name, email, phone_number")
    .eq("organization_id", authz.org.orgId)
    .eq("id", proposta.contact_id)
    .maybeSingle();
  const marca = await marcaDaSaida(authz.org.orgId);

  // C4/D4: só chega até aqui quem está em `rascunho` (decidirVersao lança
  // para qualquer outro status, virando 409 acima). Criar a v2 é
  // responsabilidade exclusiva da rota de revisão — o envio nunca mais cria
  // versão: `propostaAlvo` é sempre a própria proposta.
  const propostaAlvo = proposta;

  // ─── Entra em `enviando` e aloca numero (D3+D9) — número reservado ao
  // entrar em `enviando`, não ao confirmar entrega ───
  let numeroEAno: { numero: number; ano: number };
  if (propostaAlvo.numero != null && propostaAlvo.ano != null) {
    // Reenvio depois de uma falha anterior (D3): o número já foi reservado e
    // RETIDO na volta a rascunho — chamar o contador de novo gastaria outro
    // número a cada tentativa e o UPDATE de alocarNumero (que exige
    // `numero is null`) nunca casaria, sempre lançando.
    numeroEAno = { numero: propostaAlvo.numero, ano: propostaAlvo.ano };
    await admin.from("crm_proposals")
      .update({ status: "enviando", ultima_falha_envio: null })
      .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id);
  } else {
    numeroEAno = await alocarNumero(admin, { orgId: authz.org.orgId, propostaId: propostaAlvo.id });
    await admin.from("crm_proposals")
      .update({ status: "enviando", ultima_falha_envio: null })
      .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id);
  }

  const destinatarioNome = rotuloDoContato(contato, t);

  // ─── PDF, upload e envio: qualquer EXCEÇÃO aqui (não só um desfecho de
  // mensagem) também é "falha em qualquer passo" (D3, ponto 3) — sem este
  // try/catch a proposta ficava presa em `enviando` até o cron
  // `proposta-travada` agir, 5 minutos depois, por um erro que já era
  // conhecido no mesmo request. ───
  let pdfPath: string;
  let signedUrl: string;
  let mensagem: Awaited<ReturnType<typeof sendMessageHandler>>;
  try {
    const pdfBuffer = await renderPropostaPdf({
      titulo: propostaAlvo.titulo, numero: numeroEAno.numero, ano: numeroEAno.ano,
      versao: propostaAlvo.versao,
      condicoes: propostaAlvo.condicoes, validUntil: propostaAlvo.valid_until,
      itens: itens.map((it) => ({ descricao: it.descricao, quantidade: it.quantidade, precoUnitarioCents: it.preco_unitario_cents, descontoCents: it.desconto_cents })),
      totalCents: propostaAlvo.total_cents, moeda: propostaAlvo.moeda,
      marca: { app_name: marca.nome, accent_hex: marca.accent, logo_path: marca.logoUrl },
      destinatario: { nome: destinatarioNome, email: contato?.email ?? null, telefone: contato?.phone_number ?? null },
    });
    const salvo = await salvarPdfDaProposta(admin, {
      orgId: authz.org.orgId, propostaId: propostaAlvo.id, buffer: pdfBuffer,
    });
    pdfPath = salvo.path;
    signedUrl = salvo.signedUrl;

    await espacarEnvio(conversa.channel_session_id);

    mensagem = await sendMessageHandler(
      admin,
      { organization_id: authz.org.orgId, actor: { type: "user", id: authz.user.id }, requestId, idioma: authz.user.idioma },
      { conversation_id: conversa.id, type: "document", media_url: signedUrl, media_mime: "application/pdf" },
    );
  } catch (erro) {
    const { data: revertida } = await admin
      .from("crm_proposals")
      .update({
        status: "rascunho",
        ultima_falha_envio: erro instanceof Error ? erro.message : "Falha desconhecida ao enviar.",
      })
      .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id)
      .select("*").single();
    return ok(revertida, { requestId });
  }

  // ─── Desfecho decidido pelo status DEVOLVIDO pela mensagem, nunca pela
  // ausência de exceção (D3 — "pior do que parece") ───
  if (mensagem.status === "failed") {
    const { data: revertida } = await admin
      .from("crm_proposals")
      .update({
        status: "rascunho",
        pdf_path: pdfPath,
        message_id: mensagem.id,
        ultima_falha_envio: mensagem.error_message ?? "Falha desconhecida ao enviar.",
      })
      .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id)
      .select("*").single();
    return ok(revertida, { requestId });
  }

  if (mensagem.status === "queued") {
    const { data: emFila } = await admin
      .from("crm_proposals")
      .update({ pdf_path: pdfPath, message_id: mensagem.id })
      .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id)
      .select("*").single();
    return ok(emFila, { requestId });
  }

  // sent | delivered | read → enviada de verdade.
  const { data: enviada } = await admin
    .from("crm_proposals")
    .update({
      status: "enviada", pdf_path: pdfPath, sent_at: new Date().toISOString(),
      sent_by_user_id: authz.user.id, message_id: mensagem.id, destinatario_nome: destinatarioNome,
    })
    .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id)
    .select("*").single();

  const totalDoLead = propostaAlvo.total_cents;
  const valorAntes = lead?.value_cents ?? null;
  if (proposta.lead_id) {
    await admin.from("crm_leads").update({ value_cents: totalDoLead }).eq("organization_id", authz.org.orgId).eq("id", proposta.lead_id);
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
  }
  // Proposta órfã (lead_id nulo — D10): não há negócio para atualizar nem
  // atividade para gravar; a proposta ainda vira `enviada` normalmente.

  void audit({
    action: "proposal.sent", actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "crm_proposals", resourceId: propostaAlvo.id, requestId,
    metadata: { numero: numeroEAno.numero, ano: numeroEAno.ano },
  });

  return ok(enviada, { requestId });
}
