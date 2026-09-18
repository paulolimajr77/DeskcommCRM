import type { ProposalItemInput } from "./tipos";

/**
 * Total em centavos. Cada item trava em ZERO se o desconto exceder o
 * subtotal dele — nunca deixa um item negativo puxar o total pra baixo do
 * que os outros itens somam sozinhos.
 */
export function calcularTotal(itens: readonly ProposalItemInput[]): number {
  return itens.reduce((acc, it) => {
    const subtotal = Math.round(it.quantidade * it.preco_unitario_cents);
    const liquido = Math.max(0, subtotal - it.desconto_cents);
    return acc + liquido;
  }, 0);
}
