// lib/propostas/documento/pdf-do-documento.test.ts
import { describe, expect, it } from "vitest";

import { renderDocumentoPdf } from "./pdf-do-documento";

describe("renderDocumentoPdf", () => {
  it("gera um PDF (buffer não vazio) com seções", async () => {
    const buf = await renderDocumentoPdf({
      titulo: "Proposta de Teste",
      secoes: [
        { id: "resumo", title: "Resumo", body: "Projeto: Site Catálogo", faltantes: [] },
        { id: "escopo", title: "Escopo", body: "Serão executados: item A, item B", faltantes: [] },
      ],
      marca: { app_name: "Acme", accent_hex: null, logoUrl: null },
    });
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("gera um PDF mesmo com ZERO seções, sem lançar (Review Focus)", async () => {
    const buf = await renderDocumentoPdf({
      titulo: "Proposta Vazia",
      secoes: [],
      marca: { app_name: "Acme", accent_hex: null, logoUrl: null },
    });
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});
