// lib/propostas/aviso-de-revisao.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Abre o aviso "proposta pronta para revisão" na Central quando a IA rascunha
 * uma proposta — ela sempre nasce sem modelo confirmado (plano N1) e pode
 * nascer sem preço de catálogo. Fire-and-forget: erro aqui nunca derruba a
 * criação do rascunho, mesmo padrão de `emitLeadActivity`.
 */
export async function avisarQuePropostaPrecisaDeRevisao(
  supabase: SupabaseClient,
  organizationId: string,
  propostaId: string,
): Promise<void> {
  try {
    const { data: existente } = await supabase
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("kind", "proposta_pronta_para_revisao")
      .eq("ref_id", propostaId)
      .eq("status", "open")
      .maybeSingle();
    if (existente) return;

    const { error } = await supabase.from("agent_inbox_items").insert({
      organization_id: organizationId,
      kind: "proposta_pronta_para_revisao",
      severity: "info",
      title: "Uma proposta está pronta para revisão",
      body: "A IA rascunhou uma proposta. Confirme o modelo sugerido (ou escolha outro) e confira o preço antes de enviar.",
      ref_kind: "proposal",
      ref_id: propostaId,
      status: "open",
    });
    if (error) {
      logger.error("[aviso-de-revisao] falha ao abrir aviso na Central", { error: error.message, propostaId });
    }
  } catch (e) {
    logger.error("[aviso-de-revisao] falha inesperada ao abrir aviso", { error: String(e), propostaId });
  }
}

/**
 * Fecha o aviso quando a proposta deixa de precisar de revisão — modelo
 * confirmado E preço resolvido (`pricing_status !== 'missing'`) — ou,
 * com `forcar: true`, incondicionalmente (proposta enviada ou descartada:
 * não faz mais sentido revisar o que não está mais em rascunho).
 */
export async function resolverAvisoDeRevisaoSeProntaOuEncerrada(
  supabase: SupabaseClient,
  organizationId: string,
  propostaId: string,
  opts: { forcar?: boolean } = {},
): Promise<void> {
  try {
    if (!opts.forcar) {
      const { data: proposta } = await supabase
        .from("crm_proposals")
        .select("template_slug, pricing_status")
        .eq("organization_id", organizationId)
        .eq("id", propostaId)
        .maybeSingle();
      const p = proposta as { template_slug: string | null; pricing_status: string } | null;
      const pronta = p !== null && p.template_slug !== null && p.pricing_status !== "missing";
      if (!pronta) return;
    }

    const { error } = await supabase
      .from("agent_inbox_items")
      .update({ status: "resolved" })
      .eq("organization_id", organizationId)
      .eq("kind", "proposta_pronta_para_revisao")
      .eq("ref_id", propostaId)
      .eq("status", "open");
    if (error) {
      logger.error("[aviso-de-revisao] falha ao resolver aviso na Central", { error: error.message, propostaId });
    }
  } catch (e) {
    logger.error("[aviso-de-revisao] falha inesperada ao resolver aviso", { error: String(e), propostaId });
  }
}
