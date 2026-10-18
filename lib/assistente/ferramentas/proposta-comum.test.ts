/**
 * O QUE TODA `propor_*` TEM EM COMUM — e o que acontece quando quem pede não
 * administra (decisão do dono, 18/10/2026).
 *
 * ─── Por que este arquivo existe ────────────────────────────────────────────
 *
 * Com o chat único, a mudança de configuração aparece como CARTÃO na conversa.
 * Isso cria uma obrigação nova: se a proposta NÃO foi criada, NENHUM cartão pode
 * ser anotado — um cartão órfão seria a tela dizendo "tem uma mudança esperando
 * você" sobre uma mudança que não existe. O gate de papel mora no SERVIDOR (a
 * rota de propostas exige `admin`); aqui se prova o que a ferramenta faz com a
 * recusa: devolve "PRECISO CONFIRMAR" e não desenha nada.
 *
 * Dois níveis de trava, de propósito:
 *
 *   1. a ferramenta nem é oferecida a quem não administra (`montarParaTeste`);
 *   2. mesmo que fosse chamada, o 403 da rota vira recusa, sem cartão.
 *
 * O segundo é o que aguenta o caso real: o modelo erra, ou a sessão cai de
 * papel entre a montagem e o POST. Quem decide continua sendo o servidor.
 *
 * Sabotagens que este arquivo pega:
 *  - apagar o ramo `status === 403` de `enviarProposta` → "403 … sem cartão"
 *    fica vermelho (a ferramenta passaria a devolver `indisponivel`);
 *  - anotar o cartão ANTES de saber o resultado da rota → o mesmo caso vermelho;
 *  - pôr o `id` da proposta no texto do modelo em vez de usar o `id` da ROTA →
 *    o caso do cartão fica vermelho.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { desligarFontes, ID_DA_PROPOSTA, ligarFontes, THREAD, TURNO } from "./auxiliar-de-proposta";

const PEDIDO = {
  operacao: "criar",
  resumo: "Lembrar o horário de atendimento",
  motivo: "A pessoa pediu para a IA saber o horário.",
  title: "Horário",
  body: "Atendemos de segunda a sexta, das 8h às 18h.",
} as const;

let fontes: ReturnType<typeof ligarFontes>;

beforeEach(() => {
  fontes = ligarFontes();
});
afterEach(() => {
  desligarFontes();
});

describe("propor_* — quem pode mudar a configuração", () => {
  it("a ferramenta nem é oferecida a manager, agent e viewer", () => {
    for (const papel of ["manager", "agent", "viewer"] as const) {
      expect(montarParaTeste(papel).ferramentas, papel).not.toHaveProperty("propor_memoria");
    }
    expect(montarParaTeste("admin").ferramentas).toHaveProperty("propor_memoria");
  });

  it("403 da rota (não-admin de verdade): recusa na conversa e NENHUM cartão", async () => {
    fontes = ligarFontes({ propostas: { status: 403 } });
    const { ferramentas, coletor } = montarParaTeste("admin", {}, {
      turno: { threadId: THREAD, turnId: TURNO },
    });

    const saida = await chamar(ferramentas, "propor_memoria", PEDIDO);

    expect(saida).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(JSON.stringify(saida)).toContain("administrador");
    // Nada foi criado: o POST chegou (é ele quem recusa) e não há proposta.
    expect(fontes.envios()).toBe(1);
    // E, principalmente, a conversa NÃO ganha cartão nenhum.
    expect(coletor.acoes).toEqual([]);
  });

  it("201 da rota: o cartão aponta para o id que a ROTA gravou", async () => {
    const { ferramentas, coletor } = montarParaTeste("admin", {}, {
      turno: { threadId: THREAD, turnId: TURNO },
    });

    const saida = await chamar(ferramentas, "propor_memoria", PEDIDO);

    expect(saida).toMatchObject({ ok: true, proposta: { id: ID_DA_PROPOSTA } });
    expect(coletor.acoes).toEqual([{ tipo: "proposta", id: ID_DA_PROPOSTA }]);
  });

  it("a rota fora do ar: indisponivel, e ainda assim sem cartão", async () => {
    fontes = ligarFontes({ falhar: { propostas: "lancar" } });
    const { ferramentas, coletor } = montarParaTeste("admin", {}, {
      turno: { threadId: THREAD, turnId: TURNO },
    });

    expect(await chamar(ferramentas, "propor_memoria", PEDIDO)).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
    expect(coletor.acoes).toEqual([]);
  });
});
