// lib/propostas/aviso-de-revisao.test.ts
import { describe, expect, it, vi } from "vitest";
import { avisarQuePropostaPrecisaDeRevisao, resolverAvisoDeRevisaoSeProntaOuEncerrada } from "./aviso-de-revisao";

function montarSupabaseMock(opts: {
  avisoAbertoExistente?: boolean;
  proposta?: { template_slug: string | null; pricing_status: string };
}) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.update = (patch: Record<string, unknown>) => {
      updates.push({ table, patch });
      return chain;
    };
    chain.insert = (row: Record<string, unknown>) => {
      inserts.push(row);
      return chain;
    };
    chain.maybeSingle = async () => {
      if (table === "agent_inbox_items") return { data: opts.avisoAbertoExistente ? { id: "aviso-1" } : null, error: null };
      if (table === "crm_proposals") return { data: opts.proposta ?? null, error: null };
      return { data: null, error: null };
    };
    return chain;
  };
  return { from, inserts, updates };
}

describe("avisarQuePropostaPrecisaDeRevisao", () => {
  it("insere um aviso quando não há um já aberto para esta proposta", async () => {
    const db = montarSupabaseMock({ avisoAbertoExistente: false });
    await avisarQuePropostaPrecisaDeRevisao(db as never, "org-1", "prop-1");
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({
      organization_id: "org-1",
      kind: "proposta_pronta_para_revisao",
      ref_kind: "proposal",
      ref_id: "prop-1",
      status: "open",
    });
  });

  it("não insere de novo quando já há um aviso aberto para esta proposta", async () => {
    const db = montarSupabaseMock({ avisoAbertoExistente: true });
    await avisarQuePropostaPrecisaDeRevisao(db as never, "org-1", "prop-1");
    expect(db.inserts).toHaveLength(0);
  });
});

describe("resolverAvisoDeRevisaoSeProntaOuEncerrada", () => {
  it("resolve quando modelo confirmado E preço não está 'missing'", async () => {
    const db = montarSupabaseMock({ proposta: { template_slug: "site_institucional", pricing_status: "catalog" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]!.patch).toMatchObject({ status: "resolved" });
  });

  it("NÃO resolve quando falta modelo, mesmo com preço ok", async () => {
    const db = montarSupabaseMock({ proposta: { template_slug: null, pricing_status: "catalog" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toHaveLength(0);
  });

  it("NÃO resolve quando falta preço, mesmo com modelo confirmado", async () => {
    const db = montarSupabaseMock({ proposta: { template_slug: "site_institucional", pricing_status: "missing" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toHaveLength(0);
  });

  it("com forcar: true, resolve mesmo faltando as duas pendências (envio/descarte)", async () => {
    const db = montarSupabaseMock({ proposta: { template_slug: null, pricing_status: "missing" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1", { forcar: true });
    expect(db.updates).toHaveLength(1);
  });

  it("preço 'manual' (digitado à mão, sem catálogo) conta como resolvido — só 'missing' é pendência", async () => {
    const db = montarSupabaseMock({ proposta: { template_slug: "site_institucional", pricing_status: "manual" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]!.patch).toMatchObject({ status: "resolved" });
  });
});
