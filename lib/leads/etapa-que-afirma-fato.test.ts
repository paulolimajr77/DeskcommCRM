import { describe, expect, it } from "vitest";

import {
  podeEntrarNaEtapa,
  type EtapaDeDestino,
  type QuemAge,
} from "./etapa-que-afirma-fato";

/**
 * A MÁQUINA NÃO AFIRMA UM FATO — A PESSOA SIM.
 *
 * ─── O DEFEITO QUE ESTES CASOS GUARDAM ───
 *
 * Em 2026-09-16 o classificador leu INTENÇÃO como FATO e o agente moveu o card
 * para "Proposta enviada" a partir de uma PROMESSA. A trava que existia cobria
 * UM caminho; o agente usava OUTRO. Esta regra não se pendura num caminho — ela
 * é o ponto único de decisão, e estes casos provam o comportamento por ator.
 *
 * O caso 1 impede a regra de recusar tudo (etapa comum libera TODOS os atores).
 * O caso 6 prova que clone com baseline antigo não quebra. O caso 7 é o que
 * impede uma implementação de lista negra: um tipo novo de ator tem de nascer
 * recusado em etapa que afirma fato, e só o `=== "user"` garante isso.
 */

const ATORES: QuemAge[] = [
  { type: "user" },
  { type: "ai_agent" },
  { type: "api_token" },
  { type: "webhook_source" },
];

function etapa(afirma: boolean | null | undefined): EtapaDeDestino {
  return { afirma_fato: afirma };
}

describe("podeEntrarNaEtapa", () => {
  it("etapa comum (`afirma_fato: false`) passa para TODOS os quatro tipos de ator", () => {
    // Sem este caso, uma implementação que recusasse sempre passaria nos casos
    // de recusa — e a etapa comum (o padrão de 100% das etapas existentes)
    // viraria uma parede. O comportamento que o dono já conhece não muda até
    // ele marcar a caixa.
    for (const ator of ATORES) {
      expect(podeEntrarNaEtapa(etapa(false), ator)).toEqual({ permitido: true });
    }
  });

  it("etapa que afirma fato + `user` → permitido", () => {
    // A pessoa que move É a evidência. Nenhuma pergunta.
    expect(podeEntrarNaEtapa(etapa(true), { type: "user" })).toEqual({
      permitido: true,
    });
  });

  it("⭐ etapa que afirma fato + `ai_agent` → recusado, com motivo `maquina_nao_afirma_fato`", () => {
    // É o defeito medido em produção, em forma de teste: o classificador
    // (que age como `ai_agent`) leu intenção como fato e adiantou o card.
    expect(podeEntrarNaEtapa(etapa(true), { type: "ai_agent" })).toEqual({
      permitido: false,
      motivo: "maquina_nao_afirma_fato",
    });
  });

  it("etapa que afirma fato + `webhook_source` → recusado", () => {
    // É o ator que `agent-stage-sync`, `appointment-stage-move`,
    // `handoff-stage-move`, a automação e o webhook de entrada usam — cinco dos
    // seis escritores de `crm_leads.stage_id`.
    expect(podeEntrarNaEtapa(etapa(true), { type: "webhook_source" })).toEqual({
      permitido: false,
      motivo: "maquina_nao_afirma_fato",
    });
  });

  it("etapa que afirma fato + `api_token` → recusado", () => {
    expect(podeEntrarNaEtapa(etapa(true), { type: "api_token" })).toEqual({
      permitido: false,
      motivo: "maquina_nao_afirma_fato",
    });
  });

  it("CONTROLE DE CLONE ANTIGO — etapa SEM a chave, e etapa com `afirma_fato: null`, passam para todos", () => {
    // O clone com o baseline antigo devolve a linha sem `afirma_fato`. Um campo
    // ausente ou nulo é a MESMA coisa que `false`: a caixa não foi marcada, e
    // nenhum ator deve ser recusado por isso.
    const etapasAntigas: EtapaDeDestino[] = [etapa(undefined), etapa(null)];

    for (const e of etapasAntigas) {
      for (const ator of ATORES) {
        expect(podeEntrarNaEtapa(e, ator)).toEqual({ permitido: true });
      }
    }
  });

  it("⭐ CONTROLE DE LISTA FECHADA — um tipo de ator INVENTADO é RECUSADO em etapa que afirma fato", () => {
    // Este caso é o que reprova uma implementação escrita como lista negra.
    // Sem ele, o ator novo de amanhã entraria liberado — porque ninguém
    // lembrou de acrescentá-lo à lista de recusados. `=== "user"` é a prova.
    expect(podeEntrarNaEtapa(etapa(true), { type: "coisa_nova" })).toEqual({
      permitido: false,
      motivo: "maquina_nao_afirma_fato",
    });
  });
});
