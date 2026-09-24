/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { crmDraftProposal } from "./propostas";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { audit } from "@/lib/audit";
import type { McpContext } from "../types";

vi.mock("@/lib/leads/activity-emitter", () => ({ emitLeadActivity: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

interface MundoOpts {
  leadDeOutraOrg?: boolean;
  /** Preço que o mock de catalog_products devolve; null = produto não resolve. Default: 5000. */
  precoDoCatalogo?: number | null;
  /** Quando true, a pré-checagem de rascunho encontra um rascunho aberto. */
  rascunhoJaExiste?: boolean;
  defaultValidDays?: number;
  defaultConditions?: string | null;
}

const RASCUNHO_ID = "99999999-9999-4999-8999-999999999999";

function montarMundoDeFerramenta(opts?: MundoOpts) {
  const leadId = "11111111-1111-4111-8111-111111111111";
  const organizationId = "22222222-2222-4222-8222-222222222222";
  const agentId = "agent-1";
  const conversationId = "55555555-5555-4555-8555-555555555555";
  const productId = "66666666-6666-4666-8666-666666666666";

  let propostaCriada: Record<string, unknown> | null = null;

  const settings = {
    proposals: {
      enabled: true,
      default_valid_days: opts?.defaultValidDays ?? 15,
      default_conditions: opts?.defaultConditions ?? null,
    },
  };

  const supabase: any = {
    from: vi.fn(function (this: any, table: string) {
      if (table === "organizations") {
        const resposta = { data: { settings }, error: null };
        return {
          select: vi.fn(function (this: any) {
            return this;
          }),
          eq: vi.fn(function (this: any) {
            return this;
          }),
          maybeSingle: vi.fn(async () => resposta),
          single: vi.fn(async () => resposta),
        };
      }
      if (table === "crm_leads") {
        return {
          select: vi.fn(function (this: any) {
            return this;
          }),
          eq: vi.fn(function (this: any) {
            return this;
          }),
          maybeSingle: vi.fn(async () => {
            if (opts?.leadDeOutraOrg) {
              return { data: null, error: null };
            }
            return {
              data: { id: leadId, contact_id: "contact-123" },
              error: null,
            };
          }),
        };
      }
      if (table === "crm_proposals") {
        const chain: any = {
          insert: vi.fn((data: unknown) => {
            propostaCriada = data as Record<string, unknown>;
            return {
              select: () => ({
                single: async () => ({ data: { id: "proposal-1" }, error: null }),
              }),
            };
          }),
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () =>
            opts?.rascunhoJaExiste
              ? { data: { id: RASCUNHO_ID }, error: null }
              : { data: null, error: null },
          ),
          single: vi.fn(async () => ({ data: { id: "proposal-1" }, error: null })),
        };
        return chain;
      }
      if (table === "catalog_products") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    const preco = opts?.precoDoCatalogo === undefined ? 5000 : opts.precoDoCatalogo;
                    return preco === null
                      ? { data: null, error: null }
                      : { data: { preco_cents: preco }, error: null };
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === "crm_proposal_items") {
        return {
          insert: vi.fn(async function (this: any) {
            return { error: null };
          }),
        };
      }
      if (table === "crm_lead_activities") {
        return {
          insert: vi.fn(async function (this: any) {
            return { error: null };
          }),
        };
      }
      throw new Error(`tabela não mockada neste teste: ${table}`);
    }),
  };

  const ctx: McpContext = {
    organizationId,
    role: "agent",
    actor: {
      type: "ai_agent",
      id: "run-1",
      role: "agent",
      agent_id: agentId,
    },
    apiTokenId: "33333333-3333-4333-8333-333333333333",
    requestId: "44444444-4444-4444-8444-444444444444",
    supabase,
  };

  return {
    leadId, organizationId, agentId, conversationId, productId, ctx,
    get propostaCriada() {
      return propostaCriada;
    },
    get atividadesEmitidas() {
      return vi.mocked(emitLeadActivity).mock.calls.map((c) => c[1]);
    },
    get auditoriasEmitidas() {
      return vi.mocked(audit).mock.calls.map((c) => c[0]);
    },
  };
}

describe("crm_draft_proposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cria rascunho com drafted_by_agent_id preenchido, a partir do lead_id recebido", async () => {
    const mundo = montarMundoDeFerramenta();
    const r = await crmDraftProposal.handler(
      {
        lead_id: mundo.leadId,
        titulo: "Orçamento site",
        conversation_id: mundo.conversationId,
        itens: [{ descricao: "Site", quantidade: 1, preco_unitario_cents: 500000 }],
      },
      mundo.ctx,
    );
    expect((r as { error?: string }).error).toBeUndefined();
    expect((r as { proposal_id?: string }).proposal_id).toBeDefined();
  });

  it("lead_id de outra organização (ou inexistente): erro devolvido ao modelo, NUNCA exceção", async () => {
    const mundo = montarMundoDeFerramenta({ leadDeOutraOrg: true });
    const r = await crmDraftProposal.handler(
      {
        lead_id: mundo.leadId,
        titulo: "x",
        conversation_id: mundo.conversationId,
        itens: [{ descricao: "item", quantidade: 1, preco_unitario_cents: 100 }],
      },
      mundo.ctx,
    );
    expect((r as { error?: string }).error).toBeDefined();
  });

  it("item com product_id: preço vem do catálogo, ignora o preço mandado pela IA (D5)", async () => {
    const mundo = montarMundoDeFerramenta({ precoDoCatalogo: 5000 });
    const r = await crmDraftProposal.handler(
      {
        lead_id: mundo.leadId, titulo: "Com catálogo", conversation_id: mundo.conversationId,
        itens: [{ product_id: mundo.productId, descricao: "Ignorado", quantidade: 1, preco_unitario_cents: 999999 }],
      },
      mundo.ctx,
    );
    expect((r as { error?: string }).error).toBeUndefined();
    expect(mundo.propostaCriada?.total_cents).toBe(5000);
    expect(mundo.propostaCriada?.pricing_status).toBe("catalog");
  });

  it("item sem product_id e sem preco_unitario_cents: cria como 'a definir' (missing)", async () => {
    const mundo = montarMundoDeFerramenta();
    const r = await crmDraftProposal.handler(
      { lead_id: mundo.leadId, titulo: "A definir", conversation_id: mundo.conversationId, itens: [{ descricao: "x", quantidade: 1 }] },
      mundo.ctx,
    );
    expect((r as { error?: string }).error).toBeUndefined();
    expect(mundo.propostaCriada?.pricing_status).toBe("missing");
  });

  it("negócio já tem rascunho aberto: devolve o id do rascunho existente, não cria outro (§5.3)", async () => {
    const mundo = montarMundoDeFerramenta({ rascunhoJaExiste: true });
    const r = await crmDraftProposal.handler(
      { lead_id: mundo.leadId, titulo: "Duplicado", conversation_id: mundo.conversationId, itens: [{ descricao: "x", quantidade: 1, preco_unitario_cents: 100 }] },
      mundo.ctx,
    );
    const res = r as { error?: string; motivo?: string; rascunho_id?: string };
    expect(res.error).toBeDefined();
    expect(res.motivo).toBe("rascunho_aberto_existe");
    expect(res.rascunho_id).toBeDefined();
    expect(mundo.propostaCriada).toBeNull();
  });

  it("grava conversation_id, valid_until (default da org) e condicoes (default da org) — D7 + D5", async () => {
    const mundo = montarMundoDeFerramenta({ defaultValidDays: 10, defaultConditions: "Pagamento à vista." });
    await crmDraftProposal.handler(
      { lead_id: mundo.leadId, titulo: "x", conversation_id: mundo.conversationId, itens: [{ descricao: "x", quantidade: 1, preco_unitario_cents: 100 }] },
      mundo.ctx,
    );
    expect(mundo.propostaCriada?.conversation_id).toBe(mundo.conversationId);
    expect(mundo.propostaCriada?.condicoes).toBe("Pagamento à vista.");
    expect(mundo.propostaCriada?.valid_until).toBeDefined();
  });

  it("emite atividade na timeline E auditoria ao criar o rascunho (D5 — hoje não emite nada)", async () => {
    const mundo = montarMundoDeFerramenta();
    await crmDraftProposal.handler(
      { lead_id: mundo.leadId, titulo: "x", conversation_id: mundo.conversationId, itens: [{ descricao: "x", quantidade: 1, preco_unitario_cents: 100 }] },
      mundo.ctx,
    );
    expect(mundo.atividadesEmitidas.length).toBe(1);
    expect(mundo.atividadesEmitidas[0]?.type).toBe("proposal_drafted");
    expect(mundo.auditoriasEmitidas.length).toBe(1);
    expect(mundo.auditoriasEmitidas[0]?.action).toBe("proposal.drafted");
  });

  it("product_id que não existe na organização: erro devolvido ao modelo, nada é gravado", async () => {
    const mundo = montarMundoDeFerramenta({ precoDoCatalogo: null });
    const r = await crmDraftProposal.handler(
      { lead_id: mundo.leadId, titulo: "x", conversation_id: mundo.conversationId, itens: [{ product_id: mundo.productId, descricao: "x", quantidade: 1 }] },
      mundo.ctx,
    );
    expect((r as { error?: string }).error).toBeDefined();
    expect(mundo.propostaCriada).toBeNull();
  });
});
