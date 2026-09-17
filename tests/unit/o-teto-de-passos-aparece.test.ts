/**
 * O TETO DE PASSOS DEIXA DE SER UM `return` MUDO.
 *
 * ─── O DEFEITO, MEDIDO ─────────────────────────────────────────────────────
 *
 * `inbound-turn.ts` chamava o modelo com `stopWhen: stepCountIs(maxSteps)` e
 * NUNCA verificava `steps.length` / `finishReason` — zero ocorrência no
 * arquivo inteiro antes desta peça. Quando o modelo batia no teto NO MEIO de
 * uma tarefa (ainda queria chamar ferramenta, não terminou naturalmente), o AI
 * SDK simplesmente parava de gerar passos: era um `return` mudo. O cliente via
 * a conversa terminar sem resposta útil, e ninguém no sistema sabia que a
 * causa foi o teto.
 *
 * ─── O QUE SE PROVA AQUI ───────────────────────────────────────────────────
 *
 * A régua `stepsCount >= maxSteps && finishReason !== 'stop'` é a MESMA que o
 * motor irmão (`lib/ai/runtime/agent.ts`) já usa — não inventa uma segunda. Os
 * dois casos de CONTROLE guardam as bordas: turno que cabe no teto não deve
 * gravar nada, e turno que termina naturalmente NO último passo permitido
 * também não é estouro (é o caso mais comum, não o raro — e uma implementação
 * que só checasse `stepsCount >= maxSteps` marcaria este como estouro).
 */
import { describe, expect, it, vi } from "vitest";

import { avisarTetoDePassos } from "@/lib/agent-engine/agent/inbound-turn";

const ORG = "11111111-1111-4111-8111-111111111111";
const AGENTE = "22222222-2222-4222-8222-222222222222";
const VERSAO = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "44444444-4444-4444-8444-444444444444";

function poolFalso() {
  const chamadas: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    chamadas.push({ sql, params });
    return { rows: [], rowCount: 0 };
  });
  return { pool: { query } as never, chamadas };
}

function logFalso() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;
}

const ids = { tenantId: ORG, agentId: AGENTE, versionId: VERSAO, conversationId: CONVERSA };

describe("o teto de passos deixa de ser um return mudo", () => {
  it("turno que bate no teto grava a execução com os passos gastos e o motivo de parada", async () => {
    const { pool, chamadas } = poolFalso();
    await avisarTetoDePassos(
      pool as never,
      ids,
      { stepsCount: 3, maxSteps: 3, finishReason: "tool-calls" },
      logFalso(),
    );
    const insertRun = chamadas.find((c) => c.sql.includes("insert into ai_agent_runs"));
    expect(insertRun, "não gravou a execução").toBeDefined();
    expect(insertRun!.params).toEqual([ORG, AGENTE, VERSAO, CONVERSA, 3]);
  });

  it("⭐ o mesmo turno abre aviso na Central, com a organização certa", async () => {
    const { pool, chamadas } = poolFalso();
    await avisarTetoDePassos(
      pool as never,
      ids,
      { stepsCount: 3, maxSteps: 3, finishReason: "tool-calls" },
      logFalso(),
    );
    const insertAviso = chamadas.find((c) => c.sql.includes("insert into agent_inbox_items"));
    expect(insertAviso, "não abriu aviso na Central").toBeDefined();
    expect(insertAviso!.sql).toContain("passos_esgotados");
    expect(insertAviso!.params[0]).toBe(ORG);
  });

  it("CONTROLE — turno que cabe no teto não grava nem avisa nada", async () => {
    const { pool, chamadas } = poolFalso();
    await avisarTetoDePassos(
      pool as never,
      ids,
      { stepsCount: 4, maxSteps: 10, finishReason: "stop" },
      logFalso(),
    );
    expect(chamadas).toEqual([]);
  });

  it("CONTROLE — steps no limite mas terminou naturalmente não conta como teto estourado", async () => {
    // Sem este caso, uma implementação que checasse só `stepsCount >= maxSteps`
    // (sem olhar finishReason) marcaria como estouro todo turno que terminasse
    // exatamente no último passo permitido — o caso mais comum, não o raro.
    const { pool, chamadas } = poolFalso();
    await avisarTetoDePassos(
      pool as never,
      ids,
      { stepsCount: 3, maxSteps: 3, finishReason: "stop" },
      logFalso(),
    );
    expect(chamadas).toEqual([]);
  });
});
