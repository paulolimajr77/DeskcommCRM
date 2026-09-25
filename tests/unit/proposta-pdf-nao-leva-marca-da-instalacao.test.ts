import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * D6 — mesma régua do PDF de LGPD (que também nunca leva marca): o PDF de
 * propostas não pode importar `marcaDaSaida`/`lib/branding/saida` nem
 * `lib/branding/instalacao` — os dois encadeiam a camada da INSTALAÇÃO como
 * fallback, e isso nomearia o revendedor num documento entre a organização
 * (controladora do relacionamento comercial) e o cliente dela.
 */
describe("PDF de propostas não leva marca da instalação/revendedor", () => {
  it("pdf.tsx não importa branding/saida nem branding/instalacao", () => {
    const src = readFileSync("lib/propostas/pdf.tsx", "utf-8");
    expect(src).not.toMatch(/branding\/saida/);
    expect(src).not.toMatch(/branding\/instalacao/);
  });

  it("marca-da-organizacao-para-pdf.ts não importa branding/saida nem branding/instalacao", () => {
    const src = readFileSync("lib/propostas/marca-da-organizacao-para-pdf.ts", "utf-8");
    expect(src).not.toMatch(/branding\/saida/);
    expect(src).not.toMatch(/branding\/instalacao/);
  });

  it("send/route.ts monta a marca do PDF via marcaDaOrganizacaoParaPdf, não via marcaDaSaida", () => {
    const src = readFileSync("app/api/v1/proposals/[id]/send/route.ts", "utf-8");
    expect(src).toMatch(/marcaDaOrganizacaoParaPdf/);
    expect(src).not.toMatch(/marcaDaSaida/);
  });
});
