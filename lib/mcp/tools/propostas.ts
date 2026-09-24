import { z } from "zod";
import { audit } from "@/lib/audit";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { buscarPadroesDaOrganizacao } from "@/lib/propostas/padroes-da-organizacao";
import { fusoDaOrganizacao, somarDiasNoFuso } from "@/lib/propostas/data-no-fuso";
import { resolverItensDaProposta } from "@/lib/propostas/itens";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import type { Actor } from "@/lib/api/handlers/types";
import type { McpContext, McpToolDefinition } from "@/lib/mcp/types";

const itemShape = {
  product_id: z.string().uuid().nullable().optional(),
  descricao: z.string().min(1).max(500),
  quantidade: z.number().positive().default(1),
  /**
   * Opcional e nullable: sem product_id E sem preço, o item nasce "a
   * definir" (§5.2). Com product_id, este valor é sempre ignorado — o preço
   * vem do catálogo no servidor (D5).
   */
  preco_unitario_cents: z.number().int().nonnegative().nullable().optional(),
};

const draftProposalInputShape = {
  lead_id: z
    .string()
    .uuid()
    .describe("O negócio (lead) desta conversa — vem do contexto do turno."),
  conversation_id: z
    .string()
    .uuid()
    .describe("A conversa deste turno — o envio da proposta vai usar exatamente esta conversa."),
  titulo: z
    .string()
    .min(1)
    .max(200)
    .describe("Título curto da proposta, ex.: 'Orçamento site institucional'."),
  itens: z
    .array(z.object(itemShape))
    .min(1)
    .describe(
      "Itens do que está sendo oferecido. Use product_id quando o item vier do catálogo — o " +
        "preço é resolvido pelo servidor e o que você mandar em preco_unitario_cents é ignorado. " +
        "Sem product_id e sem preco_unitario_cents, o item nasce 'a definir'.",
    ),
};

/** Ator do ctx → o que a auditoria grava. Mesmo padrão de retencao.ts/escalacao.ts. */
function actorAudit(actor: Actor): { actorUserId: string | null; metadataActor: Record<string, unknown> } {
  if (actor.type === "user") return { actorUserId: actor.id, metadataActor: { actor_type: "user" } };
  return { actorUserId: null, metadataActor: { actor_type: actor.type, actor_id: actor.id } };
}

export const crmDraftProposal: McpToolDefinition<typeof draftProposalInputShape> = {
  name: "crm_draft_proposal",
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  description:
    "Rascunha uma proposta comercial para o negócio desta conversa. NUNCA envia — só cria o " +
    "rascunho para uma pessoa revisar e enviar depois. Use quando o cliente pedir orçamento ou " +
    "proposta e você já souber o que oferecer. Um negócio só pode ter UM rascunho aberto por vez.",
  inputSchema: draftProposalInputShape,
  handler: async (input, ctx: McpContext) => {
    if (!(await capacidadesDaOrganizacao(ctx.supabase, ctx.organizationId)).includes("propostas")) {
      return { error: "Propostas estão desligadas nesta organização." };
    }
    const { data: lead, error: leadErr } = await ctx.supabase
      .from("crm_leads")
      .select("id, contact_id")
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.lead_id)
      .maybeSingle();
    if (leadErr) return { error: "Não foi possível verificar o negócio agora." };
    if (!lead) return { error: "Negócio não encontrado nesta organização." };

    // §5.3 — um rascunho aberto por negócio. O índice único (migration 0402)
    // é a trava de verdade sob corrida; esta pré-checagem só dá o retorno
    // ensinável (o id do rascunho, para o modelo mandar retomar).
    const { data: rascunhoExistente } = await ctx.supabase
      .from("crm_proposals")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("lead_id", input.lead_id)
      .eq("status", "rascunho")
      .maybeSingle();
    if (rascunhoExistente) {
      return {
        error: "Este negócio já tem um rascunho de proposta aberto — retome-o em vez de criar outro.",
        motivo: "rascunho_aberto_existe",
        rascunho_id: rascunhoExistente.id,
      };
    }

    // C3 (revisão) — `conversation_id` vem do argumento da ferramenta e é
    // gravado com o client service-role: sem confirmar que a conversa É do
    // contato deste negócio E desta organização, um id de outro contato (ou
    // de outra organização) gravava direto, e o envio mandava o PDF/preços
    // desta proposta no WhatsApp de um contato ERRADO — vazamento de dado
    // entre contatos, ou entre organizações.
    const { data: conversa } = await ctx.supabase
      .from("conversations")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.conversation_id)
      .eq("contact_id", lead.contact_id)
      .maybeSingle();
    if (!conversa) {
      return { error: "Esta conversa não pertence ao contato deste negócio." };
    }

    const itensNormalizados = input.itens.map((it, i) => ({
      product_id: it.product_id ?? null,
      descricao: it.descricao,
      quantidade: it.quantidade,
      preco_unitario_cents: it.preco_unitario_cents ?? null,
      desconto_cents: 0,
      position: (i + 1) * 1000,
    }));
    const resolvido = await resolverItensDaProposta(ctx.supabase, ctx.organizationId, itensNormalizados);
    if (!resolvido.ok) return { error: resolvido.motivo };

    const padroes = await buscarPadroesDaOrganizacao(ctx.supabase, ctx.organizationId);
    const fuso = await fusoDaOrganizacao(ctx.supabase, ctx.organizationId);
    const validUntil = somarDiasNoFuso(new Date(), padroes.defaultValidDays, fuso);

    const agentId = ctx.actor.type === "ai_agent" ? (ctx.actor.agent_id ?? null) : null;

    const { data: proposta, error } = await ctx.supabase
      .from("crm_proposals")
      .insert({
        organization_id: ctx.organizationId,
        lead_id: lead.id,
        contact_id: lead.contact_id,
        conversation_id: input.conversation_id,
        titulo: input.titulo,
        condicoes: padroes.defaultConditions,
        valid_until: validUntil,
        total_cents: resolvido.totalCents,
        pricing_status: resolvido.pricingStatus,
        status: "rascunho",
        drafted_by_agent_id: agentId,
      })
      .select("id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return { error: "Este negócio já tem um rascunho de proposta aberto.", motivo: "rascunho_aberto_existe" };
      }
      return { error: "Não foi possível criar o rascunho agora." };
    }
    if (!proposta) return { error: "Não foi possível criar o rascunho agora." };

    const { error: itensErr } = await ctx.supabase.from("crm_proposal_items").insert(
      resolvido.itens.map((it) => ({ organization_id: ctx.organizationId, proposal_id: proposta.id, ...it })),
    );
    if (itensErr) {
      // Sem isto, o rascunho ficava vazio e — depois da C3 — continuava
      // ocupando a trava de "um rascunho por negócio" (§5.3): a IA tentaria
      // de novo e receberia rascunho_aberto_existe apontando pra um rascunho
      // sem item nenhum, sem jeito óbvio de sair dali pela ferramenta.
      await ctx.supabase.from("crm_proposals").delete().eq("organization_id", ctx.organizationId).eq("id", proposta.id);
      return { error: "Não foi possível criar o rascunho agora." };
    }

    // D5 — a ferramenta hoje não emitia nada disso. Fire-and-forget: a
    // timeline/auditoria nunca derruba a criação do rascunho.
    await emitLeadActivity(ctx.supabase, {
      organizationId: ctx.organizationId,
      leadId: lead.id,
      contactId: lead.contact_id,
      type: "proposal_drafted",
      sourceModule: "proposals",
      sourceId: proposta.id,
      actor: ctx.actor,
      reason: `Rascunho de proposta criado pela IA: ${input.titulo}`,
    });

    const a = actorAudit(ctx.actor);
    void audit({
      action: "proposal.drafted",
      actorUserId: a.actorUserId,
      actorApiTokenId: ctx.apiTokenId,
      organizationId: ctx.organizationId,
      resourceType: "crm_proposals",
      resourceId: proposta.id,
      requestId: ctx.requestId,
      metadata: { ...a.metadataActor, via: "mcp" },
    });

    return { proposal_id: proposta.id, total_cents: resolvido.totalCents, pricing_status: resolvido.pricingStatus };
  },
};
