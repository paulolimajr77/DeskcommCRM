import { describe, expect, it } from "vitest";
import { calcularTotal } from "./total";
import type { ProposalItemInput } from "./tipos";

function item(over: Partial<ProposalItemInput> = {}): ProposalItemInput {
  return {
    product_id: null, descricao: "item", quantidade: 1,
    preco_unitario_cents: 1000, desconto_cents: 0, position: 1000, ...over,
  };
}

describe("calcularTotal", () => {
  it("soma quantidade x preco menos desconto, por item", () => {
    const total = calcularTotal([
      item({ quantidade: 2, preco_unitario_cents: 1000, desconto_cents: 0 }), // 2000
      item({ quantidade: 1, preco_unitario_cents: 5000, desconto_cents: 500 }), // 4500
    ]);
    expect(total).toBe(6500);
  });

  it("lista vazia soma zero", () => {
    expect(calcularTotal([])).toBe(0);
  });

  it("quantidade fracionária arredonda o item para baixo (centavos são inteiros)", () => {
    const total = calcularTotal([item({ quantidade: 1.5, preco_unitario_cents: 1000, desconto_cents: 0 })]);
    expect(total).toBe(1500);
    expect(Number.isInteger(total)).toBe(true);
  });

  it("nunca devolve negativo — desconto maior que o item trava em zero NO ITEM", () => {
    const total = calcularTotal([item({ quantidade: 1, preco_unitario_cents: 1000, desconto_cents: 5000 })]);
    expect(total).toBe(0);
  });
});
