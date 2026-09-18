import { z } from "zod";
import { calcularTotal } from "@/lib/propostas/total";
import type { McpToolDefinition } from "@/lib/mcp/types";

const itemShape = {
  descricao: z.string().min(1).max(500),
  quantidade: z.number().positive().default(1),
  preco_unitario_cents: z.number().int().nonnegative(),
};

const draftProposalInputShape = {
  lead_id: z
    .string()
    .uuid()
    .describe("O negócio (lead) desta conversa — vem do contexto do turno."),
  titulo: z
    .string()
    .min(1)
    .max(200)
    .describe("Título curto da proposta, ex.: 'Orçamento site institucional'."),
  itens: z
    .array(z.object(itemShape))
    .min(1)
    .describe(
      "Itens do que está sendo oferecido, cada um com descrição, quantidade e preço em centavos.",
    ),
};

export const crmDraftProposal: McpToolDefinition<typeof draftProposalInputShape> = {
  name: "crm_draft_proposal",
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  description:
    "Rascunha uma proposta comercial para o negócio desta conversa. NUNCA envia — só cria o " +
    "rascunho para uma pessoa revisar e enviar depois. Use quando o cliente pedir orçamento ou " +
    "proposta e você já souber o que oferecer.",
  inputSchema: draftProposalInputShape,
  handler: async (input, ctx) => {
    const { data: lead, error: leadErr } = await ctx.supabase
      .from("crm_leads")
      .select("id, contact_id")
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.lead_id)
      .maybeSingle();
    if (leadErr) return { error: "Não foi possível verificar o negócio agora." };
    if (!lead) return { error: "Negócio não encontrado nesta organização." };

    const itens = input.itens.map((it, i) => ({
      ...it,
      desconto_cents: 0,
      position: (i + 1) * 1000,
      product_id: null,
    }));
    const totalCents = calcularTotal(itens);
    const agentId = ctx.actor.type === "ai_agent" ? (ctx.actor.agent_id ?? null) : null;

    const { data: proposta, error } = await ctx.supabase
      .from("crm_proposals")
      .insert({
        organization_id: ctx.organizationId,
        lead_id: lead.id,
        contact_id: lead.contact_id,
        titulo: input.titulo,
        total_cents: totalCents,
        status: "rascunho",
        drafted_by_agent_id: agentId,
      })
      .select("id")
      .single();
    if (error || !proposta) return { error: "Não foi possível criar o rascunho agora." };

    const { error: itensErr } = await ctx.supabase.from("crm_proposal_items").insert(
      itens.map((it) => ({ organization_id: ctx.organizationId, proposal_id: proposta.id, ...it })),
    );
    if (itensErr) return { error: "Rascunho criado, mas falhou ao gravar os itens." };

    return { proposal_id: proposta.id, total_cents: totalCents };
  },
};
