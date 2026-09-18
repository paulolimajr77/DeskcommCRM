import { describe, expect, it } from "vitest";
import { renderPropostaPdf } from "./pdf";

describe("renderPropostaPdf", () => {
  it("devolve um Buffer que começa com o header de PDF (%PDF)", async () => {
    const buf = await renderPropostaPdf({
      titulo: "Site institucional", numero: 42, ano: 2026, versao: 1,
      condicoes: "50% na entrada", validUntil: "2026-10-01",
      itens: [{ descricao: "Site", quantidade: 1, precoUnitarioCents: 800000, descontoCents: 0 }],
      totalCents: 800000, moeda: "BRL",
      marca: { app_name: "Acme", accent_hex: "#0EA5E9", logo_path: null },
      destinatario: { nome: "Cliente Teste", email: null, telefone: null },
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("sem imagem_url no item, não quebra (layout fecha sem buraco)", async () => {
    const buf = await renderPropostaPdf({
      titulo: "x", numero: null, ano: null, versao: 1, condicoes: null, validUntil: null,
      itens: [{ descricao: "Serviço", quantidade: 1, precoUnitarioCents: 100, descontoCents: 0 }],
      totalCents: 100, moeda: "BRL",
      marca: { app_name: null, accent_hex: null, logo_path: null },
      destinatario: { nome: "Cliente", email: null, telefone: null },
    });
    expect(buf.length).toBeGreaterThan(0);
  });
});
