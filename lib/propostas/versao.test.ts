import { describe, expect, it } from "vitest";
import { decidirVersao } from "./versao";
import type { ProposalRow } from "./tipos";

function proposta(over: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "p1", organization_id: "org-1", lead_id: "lead-1", status: "rascunho",
    numero: null, ano: null, versao: 1, substitui_id: null, revision: 1, total_cents: 1000,
    ...over,
  };
}

describe("decidirVersao", () => {
  it("editar um RASCUNHO: PATCH no mesmo registro, sem nova versão", () => {
    const r = decidirVersao(proposta({ status: "rascunho" }));
    expect(r).toEqual({ tipo: "patch_no_mesmo" });
  });

  it("revisar uma proposta ENVIADA: cria v2 herdando numero/ano, v1 vira substituida", () => {
    const r = decidirVersao(proposta({ status: "enviada", numero: 42, ano: 2026, versao: 1 }));
    expect(r).toEqual({
      tipo: "nova_versao",
      herdaNumero: 42, herdaAno: 2026, novaVersao: 2, substituiId: "p1",
    });
  });

  it("revisar uma proposta ACEITA ou RECUSADA: recusado — não é rascunho nem enviada", () => {
    expect(() => decidirVersao(proposta({ status: "aceita" }))).toThrow(/status_nao_editavel/);
    expect(() => decidirVersao(proposta({ status: "recusada" }))).toThrow(/status_nao_editavel/);
  });

  it("v3 a partir de v2: incrementa a partir da versão ATUAL, não sempre 2", () => {
    const r = decidirVersao(proposta({ status: "enviada", numero: 42, ano: 2026, versao: 2 }));
    expect(r).toMatchObject({ novaVersao: 3 });
  });
});
