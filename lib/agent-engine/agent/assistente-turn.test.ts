import { describe, expect, it, vi, beforeEach } from "vitest";

const runModelCall = vi.fn();
vi.mock("../edge/llm/run-model-call", () => ({
  runModelCall: (...args: unknown[]) => runModelCall(...args),
}));

const { montarMensagensDoAssistente, responderComoAssistente } = await import("./assistente-turn");

const FERRAMENTAS = { listar_metricas: {} } as never;

const ENTRADA = {
  tenantId: "org-1",
  system: "system montado",
  historico: [],
  pergunta: "Qual a taxa de ganho da semana?",
  tools: FERRAMENTAS,
  maxSteps: 8,
};

beforeEach(() => {
  runModelCall.mockReset();
  runModelCall.mockResolvedValue({ result: { text: "  A taxa foi X.  " }, callId: "call-1" });
});

/** O terceiro argumento de `runModelCall` — o objeto que vai ao seam. */
function objetoDoSeam(): Record<string, unknown> {
  expect(runModelCall, "o emissor não chamou o seam").toHaveBeenCalledTimes(1);
  return runModelCall.mock.calls[0]![2] as Record<string, unknown>;
}

describe("responderComoAssistente — o que chega ao seam de modelo", () => {
  it("o `purpose` é `assistente_chat`", async () => {
    // É o literal que `pontos-de-ia-completude.test.ts` procura em `lib/**` e o
    // que liga esta chamada ao painel de Provedores e à tela de Execuções.
    await responderComoAssistente({} as never, {} as never, { ...ENTRADA });
    expect(objetoDoSeam().purpose).toBe("assistente_chat");
  });

  it("`tools` e `maxSteps` chegam ao seam — é a ligação com o catálogo", async () => {
    // Sem eles, o SDK para no 1º step e o modelo nunca vê o resultado das
    // métricas. Teste que só vê o helper ficaria verde com esta ligação
    // cortada — por isso a asserção é no objeto que vai ao seam.
    await responderComoAssistente({} as never, {} as never, { ...ENTRADA });
    const o = objetoDoSeam();
    expect(o.tools).toBe(FERRAMENTAS);
    expect(o.maxSteps).toBe(8);
    expect(Object.keys(o)).toContain("tools");
    expect(Object.keys(o)).toContain("maxSteps");
  });

  it("`model` e `llmOverride` saem `undefined` — o ponto herda o padrão da org", async () => {
    // A recíproca do PR #151: `undefined` faz o seam seguir a cadeia normal
    // (binding → env → padrão da organização). Um `llmOverride` aqui faria a
    // varredura de herança exigir o ponto em `PONTOS_QUE_HERDAM_DO_AGENTE` —
    // e a tela anunciaria herança do agente que não acontece.
    await responderComoAssistente({} as never, {} as never, { ...ENTRADA });
    const o = objetoDoSeam();
    expect(o.model).toBeUndefined();
    expect(o.llmOverride).toBeUndefined();
    expect(Object.keys(o)).not.toContain("model");
    expect(Object.keys(o)).not.toContain("llmOverride");
  });

  it("`agentId`, `leadId` e `jobId` são nulos — o turno não é de nenhum agente", async () => {
    await responderComoAssistente({} as never, {} as never, { ...ENTRADA });
    const o = objetoDoSeam();
    expect(o.agentId).toBeNull();
    expect(o.leadId).toBeNull();
    expect(o.jobId).toBeNull();
  });

  it("o `system` vai como veio, já montado", async () => {
    await responderComoAssistente({} as never, {} as never, { ...ENTRADA });
    expect(objetoDoSeam().system).toBe("system montado");
  });

  it("o texto volta aparado, com o `callId` e sem ferramenta chamada", async () => {
    const r = await responderComoAssistente({} as never, {} as never, { ...ENTRADA });
    expect(r).toEqual({ texto: "A taxa foi X.", callId: "call-1", ferramentasChamadas: [] });
  });

  it("resposta sem texto vira string vazia — e não `undefined` no banco", async () => {
    runModelCall.mockResolvedValue({ result: {}, callId: null });
    const r = await responderComoAssistente({} as never, {} as never, { ...ENTRADA });
    expect(r.texto).toBe("");
    expect(r.callId).toBeNull();
    expect(r.ferramentasChamadas).toEqual([]);
  });

  it("`ferramentasChamadas` sai sem repetição e na ordem, de `steps` e `toolCalls`", async () => {
    runModelCall.mockResolvedValue({
      result: {
        text: "ok",
        steps: [
          { toolCalls: [{ toolName: "listar_metricas" }, { toolName: "consultar_metrica" }] },
          { toolCalls: [{ toolName: "listar_metricas" }] },
        ],
        toolCalls: [{ toolName: "ler_guia" }],
      },
      callId: "call-2",
    });
    const r = await responderComoAssistente({} as never, {} as never, { ...ENTRADA });
    expect(r.ferramentasChamadas).toEqual(["listar_metricas", "consultar_metrica", "ler_guia"]);
  });
});

describe("montarMensagensDoAssistente — a ordem das vozes", () => {
  it("o histórico mapeia `human`→user e `ai`→assistant", async () => {
    const m = montarMensagensDoAssistente({
      historico: [
        { author_kind: "human", body: "quantas conversas na fila?" },
        { author_kind: "ai", body: "12 na fila" },
      ],
      pergunta: "e as perdidas?",
    });
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
  });

  it("a pergunta é sempre a ÚLTIMA — o modelo responde a ela, não ao histórico", async () => {
    const m = montarMensagensDoAssistente({
      historico: [{ author_kind: "ai", body: "resposta anterior" }],
      pergunta: "a pergunta de agora",
    });
    expect(m.at(-1)).toEqual({ role: "user", content: "a pergunta de agora" });
  });
});
