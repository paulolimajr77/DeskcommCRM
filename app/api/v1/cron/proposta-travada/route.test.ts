import { describe, expect, it } from "vitest";

import { recuperarPropostasTravadas } from "./route";

function mundo(propostas: Array<{ id: string; organization_id: string }>) {
  const updated = propostas.map((p) => ({ id: p.id }));
  const admin = {
    from: (tabela: string) => {
      if (tabela === "crm_proposals") {
        return {
          select: () => ({ eq: () => ({ lt: () => ({ limit: async () => ({ data: propostas, error: null }) }) }) }),
          update: () => ({ in: () => ({ eq: () => ({ select: async () => ({ data: updated, error: null }) }) }) }),
        };
      }
      if (tabela === "agent_inbox_items") return { insert: async () => ({ error: null }) };
      throw new Error(`tabela inesperada: ${tabela}`);
    },
  };
  return admin as never;
}

describe("recuperarPropostasTravadas", () => {
  it("volta a rascunho proposta presa em enviando ha mais de 5 minutos, sem reenviar nada", async () => {
    const admin = mundo([{ id: "prop-1", organization_id: "org-1" }]);
    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 1, revertidas: 1, organizations: 1 });
  });

  it("nao mexe em nada quando nao ha proposta presa", async () => {
    const admin = mundo([]);
    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 0, revertidas: 0, organizations: 0 });
  });

  it("agrupa por organizacao: duas propostas da mesma org geram UM aviso, nao dois", async () => {
    let avisos = 0;
    const propostas = [
      { id: "prop-1", organization_id: "org-1" },
      { id: "prop-2", organization_id: "org-1" },
    ];
    const updated = propostas.map((p) => ({ id: p.id }));
    const admin = {
      from: (tabela: string) => {
        if (tabela === "crm_proposals") {
          return {
            select: () => ({ eq: () => ({ lt: () => ({ limit: async () => ({ data: propostas, error: null }) }) }) }),
            update: () => ({ in: () => ({ eq: () => ({ select: async () => ({ data: updated, error: null }) }) }) }),
          };
        }
        if (tabela === "agent_inbox_items") return { insert: async () => { avisos++; return { error: null }; } };
        throw new Error(`tabela inesperada: ${tabela}`);
      },
    } as never;
    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 2, revertidas: 2, organizations: 1 });
    expect(avisos).toBe(1);
  });
});
