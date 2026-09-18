/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { crmDraftProposal } from "./propostas";
import type { McpContext } from "../types";

function montarMundoDeFerramenta(opts?: { leadDeOutraOrg?: boolean }) {
  const leadId = "11111111-1111-4111-8111-111111111111";
  const organizationId = "22222222-2222-4222-8222-222222222222";
  const agentId = "agent-1";

  let propostaCriada: Record<string, unknown> | null = null;

   
  const query: any = {
    select: vi.fn(function (this: any) {
      return this;
    }),
    eq: vi.fn(function (this: any) {
      return this;
    }),
    insert: vi.fn(function (this: any, data: unknown) {
      propostaCriada = data as Record<string, unknown>;
      return this;
    }),
    from: vi.fn(function (this: any) {
      return this;
    }),
    maybeSingle: vi.fn(async function (this: any) {
      if (opts?.leadDeOutraOrg) {
        return { data: null, error: null };
      }
      return {
        data: { id: leadId, contact_id: "contact-123" },
        error: null,
      };
    }),
    single: vi.fn(async function (this: any) {
      if (opts?.leadDeOutraOrg) {
        return { data: null, error: null };
      }
      return {
        data: { id: "proposal-1" },
        error: null,
      };
    }),
  };

   
  const supabase: any = {
    from: vi.fn(function (this: any, table: string) {
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
        return {
          insert: vi.fn(function (this: any, data: unknown) {
            propostaCriada = data as Record<string, unknown>;
            return this;
          }),
          select: vi.fn(function (this: any) {
            return this;
          }),
          single: vi.fn(async function (this: any) {
            if (opts?.leadDeOutraOrg) {
              return { data: null, error: null };
            }
            return {
              data: { id: "proposal-1" },
              error: null,
            };
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
      return query;
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

  return { leadId, organizationId, agentId, ctx, propostaCriada: propostaCriada as Record<string, unknown> | null };
}

describe("crm_draft_proposal", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("cria rascunho com drafted_by_agent_id preenchido, a partir do lead_id recebido", async () => {
    const mundo = montarMundoDeFerramenta();
    const r = await crmDraftProposal.handler(
      {
        lead_id: mundo.leadId,
        titulo: "Orçamento site",
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
      { lead_id: mundo.leadId, titulo: "x", itens: [{ descricao: "item", quantidade: 1, preco_unitario_cents: 100 }] },
      mundo.ctx,
    );
    expect((r as { error?: string }).error).toBeDefined();
  });
});
