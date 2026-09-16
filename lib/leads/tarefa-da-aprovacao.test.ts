import { describe, expect, it } from "vitest";

import {
  LIMITE_DO_TITULO,
  PRAZO_DA_APROVACAO_MS,
  tarefaDaAprovacao,
  type AprovacaoQueViraTarefa,
} from "./tarefa-da-aprovacao";

/**
 * A TAREFA DA APROVAÇÃO — o que o clique do dono deixa como rastro de verdade.
 *
 * Estes casos cobrem o módulo PURO, não a rota: o que se mede aqui é o formato
 * da linha que o `INSERT` fará. O caso 1 fixa o relógio e mede o prazo; o caso
 * 3 mede o corte longo; o caso 5 é o controle de pureza — uma implementação que
 * mutasse a entrada passaria nos quatro primeiros e só este acusaria.
 */

const ORG = "org-1";
const LEAD = "lead-1";
const CONTATO = "contato-1";
const QUEM_APROVOU = "user-1";

function entrada(over: Partial<AprovacaoQueViraTarefa> = {}): AprovacaoQueViraTarefa {
  return {
    organizationId: ORG,
    leadId: LEAD,
    contactId: CONTATO,
    textoAprovado: "Enviar orçamento personalizado",
    quemAprovou: QUEM_APROVOU,
    agora: new Date("2026-09-16T12:00:00Z"),
    ...over,
  };
}

describe("tarefaDaAprovacao", () => {
  it("o prazo nasce 24 h à frente do instante informado", () => {
    const agora = new Date("2026-09-16T12:00:00Z");
    const r = tarefaDaAprovacao(entrada({ agora }));
    expect(Date.parse(r.due_date) - agora.getTime()).toBe(PRAZO_DA_APROVACAO_MS);
  });

  it("texto curto vira título inteiro e descrição nula", () => {
    const r = tarefaDaAprovacao(entrada({ textoAprovado: "Enviar orçamento" }));
    expect(r.title).toBe("Enviar orçamento");
    expect(r.description).toBeNull();
  });

  it("texto longo: o título cabe no limite, termina em `…`, e a descrição guarda o texto inteiro", () => {
    const textoLongo = "x".repeat(400);
    const r = tarefaDaAprovacao(entrada({ textoAprovado: textoLongo }));

    expect(r.title.length).toBeLessThanOrEqual(LIMITE_DO_TITULO);
    expect(r.title.endsWith("…")).toBe(true);
    // Sem a terceira asserção, um corte que jogasse o fim fora passaria verde:
    // o `title` caberia, o `…` estaria lá, e o briefing real estaria perdido.
    expect(r.description).toBe(textoLongo);
  });

  it("dono e autor são quem aprovou — e os vínculos são os que entraram", () => {
    const r = tarefaDaAprovacao(entrada());
    expect(r.assigned_to).toBe(QUEM_APROVOU);
    expect(r.created_by).toBe(QUEM_APROVOU);
    expect(r.lead_id).toBe(LEAD);
    expect(r.contact_id).toBe(CONTATO);
    expect(r.organization_id).toBe(ORG);
  });

  it("CONTROLE DE PUREZA — duas chamadas iguais, e a entrada congelada não muda", () => {
    const e = Object.freeze(entrada());
    const primeiro = tarefaDaAprovacao(e);
    const segundo = tarefaDaAprovacao(e);
    expect(primeiro).toEqual(segundo);
    expect(e).toEqual(
      Object.freeze(entrada()),
    );
  });
});
