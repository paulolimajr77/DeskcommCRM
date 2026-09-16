import { describe, expect, it } from "vitest";

import {
  casePromiseGate,
  type GateContext,
} from "@/lib/agent-engine/guardrails/before-send";

/**
 * CERCA C — nenhuma promessa ao cliente sai sem destino.
 *
 * ═══ O defeito, medido em produção (2026-09-16) ═════════════════════════════
 *
 * O agente enviou: *"Vou encaminhar as informações do site imobiliário para
 * análise e te retorno com a proposta."* O cliente saiu da conversa esperando um
 * orçamento.
 *
 * O sistema produziu: **zero** casos humanos, **zero** follow-ups, **zero**
 * avisos na Central. E o funil ainda moveu o negócio para "Proposta enviada" por
 * causa da promessa.
 *
 * Existe uma trava para exatamente isso (`casePromiseGate`, código
 * `case_promise_without_case`). Ela disparou **uma vez**. O desenho é: 1º veto
 * ensina, 2º veto o sistema abre um caso mínimo sozinho e libera. Houve **um**
 * veto e **zero** casos — a segunda formulação **passou**, e o fail-safe nunca
 * foi alcançado.
 *
 * Causa: `detectHumanPromise` é **léxico** — exige palavra de alvo humano
 * (equipe, time, setor, responsável, especialista, atendente, gerente…) colada
 * ao verbo. Um objeto no meio ("as informações") já quebra o padrão. **A trava
 * não é uma trava: é um filtro de formulação, e ela ensina o modelo a reformular
 * até passar.**
 *
 * ═══ 5 dos 19 casos falham hoje — as cinco frases que o detector léxico deixa
 * passar. ═══════════════════════════════════════════════════════════════════
 *
 * As sete frases abaixo já foram medidas antes de escrever este arquivo. Cinco
 * delas vazam pelo gate atual; duas são vetadas. Os casos de controle (fala
 * inocente, caso já aberto, ausência do campo semântico) são verdes — o defeito
 * não está neles. O vermelho proposital está exatamente onde a reformulação
 * consegue driblar a regra.
 */

/**
 * Contexto mínimo aceito pelo gate. `semanticPromise` fica de fora de propósito:
 * hoje ele é opcional e o gate não o consulta. O desenho futuro prevê um campo
 * `prometeuRetornoHumano` dentro dele, ausente = `false` — e este arquivo já
 * garante que nada aqui força o campo a existir.
 */
function comCtx(body: string, extra: Partial<GateContext> = {}) {
  return {
    body,
    casesEnabled: true,
    hasOpenCase: false,
    openedCaseThisTurn: false,
    ...extra,
  } as never;
}

const frasesQuePrometemRetorno = [
  "Vou encaminhar as informações do site imobiliário para análise e te retorno com a proposta.",
  "Vou encaminhar as informações para a equipe e te retorno com a proposta.",
  "Vou encaminhar para o responsável e te retorno.",
  "Vou analisar e te retorno com a proposta.",
  "Te retorno com a proposta em breve.",
  "Vou levar isso para avaliação interna e te dou um retorno.",
  "Vou passar para o setor comercial montar o orçamento.",
];

const falasInocentes = [
  "Bom dia! Como posso ajudar?",
  "Nosso horário é de segunda a sexta, das 8h às 18h.",
  "Qual prazo você julga ideal?",
  "Consigo te oferecer quinta às 14h ou sexta às 10h.",
];

describe("cerca prometer de ponta a ponta", () => {
  it.each(frasesQuePrometemRetorno)(
    "VETA sem caso aberto: %s",
    (frase) => {
      const verdict = casePromiseGate.evaluate(comCtx(frase));
      expect(verdict.pass).toBe(false);
      if (!verdict.pass) {
        expect(verdict.code).toBe("case_promise_without_case");
      }
    },
  );

  it.each(falasInocentes)(
    "CONTROLE — não veta fala inocente: %s",
    (frase) => {
      const verdict = casePromiseGate.evaluate(comCtx(frase));
      expect(verdict.pass).toBe(true);
    },
  );

  it.each(frasesQuePrometemRetorno)(
    "com caso já aberto, nenhuma é vetada: %s",
    (frase) => {
      const verdict = casePromiseGate.evaluate(comCtx(frase, { hasOpenCase: true }));
      expect(verdict.pass).toBe(true);
    },
  );

  it("o campo semântico é OPCIONAL — sem ele, o gate cai no léxico", () => {
    // Este caso existe para preservar a restrição congelada: se `semanticPromise`
    // virar obrigatório no `GateContext`, os 6 casos de
    // tests/invariants/case-guardrail.test.ts quebram — e o hook de git bloqueia
    // o commit que os consertaria. A ausência do campo precisa continuar
    // significando "não há sinal semântico", exatamente o comportamento atual.
    const fraseQueOLexicoPega = frasesQuePrometemRetorno[2]!;
    const fraseQueOLexicoNaoPega = frasesQuePrometemRetorno[0]!;

    const verdictVeta = casePromiseGate.evaluate(comCtx(fraseQueOLexicoPega));
    expect(verdictVeta.pass).toBe(false);

    const verdictPassa = casePromiseGate.evaluate(comCtx(fraseQueOLexicoNaoPega));
    expect(verdictPassa.pass).toBe(true);
  });
});
