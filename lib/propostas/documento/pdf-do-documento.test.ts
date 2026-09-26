// lib/propostas/documento/pdf-do-documento.test.ts
import { describe, expect, it } from "vitest";

import { blocosDoDocumento, renderDocumentoPdf, type DocumentoPdfInput } from "./pdf-do-documento";

const secao = (id: string) => ({ id, title: id, body: `corpo ${id}`, faltantes: [] });

const BASE: DocumentoPdfInput = {
  titulo: "Proposta de Teste",
  numero: 12,
  ano: 2026,
  versao: 1,
  destinatario: { nome: "Maria" },
  secoes: [secao("summary"), secao("investment"), secao("terms")],
  itens: [{ descricao: "Site", quantidade: 1, precoUnitarioCents: 350000, descontoCents: 0, imagemUrl: null }],
  totalCents: 350000,
  moeda: "BRL",
  validUntil: "2026-10-16",
  condicoes: "50% no aceite",
  marca: { app_name: "Acme", accent_hex: null, logoUrl: null },
};

describe("blocosDoDocumento", () => {
  it("os itens entram logo depois da seção de investimento (§6.2 da spec de 21/09)", () => {
    expect(blocosDoDocumento(BASE.secoes).map((b) => (b.tipo === "itens" ? "itens" : b.secao.id))).toEqual([
      "summary",
      "investment",
      "itens",
      "terms",
    ]);
  });

  it("modelo sem seção de investimento: itens no fim", () => {
    expect(blocosDoDocumento([secao("a"), secao("b")]).map((b) => (b.tipo === "itens" ? "itens" : b.secao.id))).toEqual([
      "a",
      "b",
      "itens",
    ]);
  });

  it("zero seções: só os itens", () => {
    expect(blocosDoDocumento([])).toEqual([{ tipo: "itens" }]);
  });
});

describe("renderDocumentoPdf", () => {
  it("gera um PDF (buffer não vazio) com cabeçalho, seções e itens", async () => {
    const buf = await renderDocumentoPdf(BASE);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("gera mesmo com ZERO seções e sem número (rascunho), sem lançar", async () => {
    const buf = await renderDocumentoPdf({ ...BASE, secoes: [], numero: null, ano: null, condicoes: null, validUntil: null });
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});
