import { describe, expect, it } from "vitest";

import { podeTrocarOCliente } from "@/lib/agenda/trocar-o-cliente";

/**
 * A linha que separa o seguro do perigoso é a ENTREGA, não o horário.
 *
 * Enquanto nada saiu, o vínculo é anotação interna. Depois que saiu, o endereço
 * da reunião está no aparelho de alguém, e o produto não tem como recolhê-lo.
 */
describe("trocar o cliente de um compromisso já marcado", () => {
  it("pode: nada foi pedido ainda", () => {
    expect(podeTrocarOCliente("none")).toBe(true);
  });

  it("pode: compromisso que nunca teve entrega (campo ausente)", () => {
    // É o caso mais comum de correção: marcaram sem vincular ninguém, ou
    // vincularam errado antes de qualquer envio.
    expect(podeTrocarOCliente(undefined)).toBe(true);
    expect(podeTrocarOCliente(null)).toBe(true);
    expect(podeTrocarOCliente("")).toBe(true);
  });

  it("⛔ NÃO pode: já enviado", () => {
    expect(podeTrocarOCliente("sent")).toBe(false);
  });

  it("⛔ NÃO pode: autorizado e a caminho", () => {
    // `waiting_for_link` e `queued` ainda não chegaram ao cliente, mas a
    // autorização já foi dada e o trabalhador pode entregar a qualquer
    // instante. Tratar "a caminho" como "não saiu" é uma corrida perdida.
    expect(podeTrocarOCliente("waiting_for_link")).toBe(false);
    expect(podeTrocarOCliente("queued")).toBe(false);
  });

  it("⛔ CONTROLE: estado desconhecido RECUSA, não libera", () => {
    // O conjunto de estados cresce (a 0242 acrescentou `motivo`, a 0243 o
    // `resend`). Uma regra escrita como lista de proibidos libera sozinha o
    // estado que nascer amanhã; escrita como lista de PERMITIDOS, não.
    expect(podeTrocarOCliente("estado_que_ainda_nao_existe")).toBe(false);
    expect(podeTrocarOCliente("failed")).toBe(false);
  });
});
