/**
 * Testes unitários para sanitizeMessages e integridade de histórico de ferramentas.
 *
 * Garante que:
 * 1. Mensagens assistant vazias recebem fallback textual e evitam "model output must contain either output text or tool calls".
 * 2. Tool calls interrompidos (ex.: maxSteps no meio do loop) ganham tool-result sintético antes da próxima mensagem de usuário.
 * 3. Tool results órfãos são descartados.
 * 4. normalizarErro classifica "model output must contain" como "historico_invalido".
 * 5. pruneToolResults executa a poda preservando integridade das mensagens.
 */
import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";

import { sanitizeMessages } from "@/lib/agent-engine/edge/llm/sanitize-messages";
import { normalizarErro } from "@/lib/agent-engine/edge/llm/run-model-call";
import { pruneToolResults } from "@/lib/agent-engine/agent/prune-tool-results";

describe("sanitizeMessages — proteção de invariantes do chat com ferramentas", () => {
  it("preenche mensagens assistant com content vazio ou whitespace", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Olá" },
      { role: "assistant", content: "" },
      { role: "assistant", content: [] },
      { role: "user", content: "Tudo bem?" },
    ];

    const sanitizadas = sanitizeMessages(messages);
    expect(sanitizadas).toHaveLength(4);

    expect(sanitizadas[1]).toEqual({
      role: "assistant",
      content: "(sem resposta)",
    });

    expect(sanitizadas[2]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "(sem resposta)" }],
    });
  });

  it("injeta tool-result sintético quando assistant chama ferramenta e em seguida vem mensagem user (ex.: checkpoint após maxSteps)", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Crie uma proposta" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_abc_123",
            toolName: "criar_proposta",
            input: { lead_id: "lead_1" },
          },
        ],
      },
      // Simulando o checkpoint que vem logo a seguir sem o tool-result:
      { role: "user", content: "## CHECKPOINT: faça o resumo" },
    ];

    const sanitizadas = sanitizeMessages(messages);
    // Deve ter: user, assistant(tool-call), tool(tool-result sintético), user(checkpoint)
    expect(sanitizadas).toHaveLength(4);

    const toolMsg = sanitizadas[2];
    expect(toolMsg?.role).toBe("tool");
    if (toolMsg && toolMsg.role === "tool" && Array.isArray(toolMsg.content)) {
      expect(toolMsg.content[0]?.type).toBe("tool-result");
      expect(toolMsg.content[0]?.toolCallId).toBe("call_abc_123");
      expect(toolMsg.content[0]?.toolName).toBe("criar_proposta");
    }
  });

  it("injeta tool-result sintético se a última mensagem for um assistant com tool-call pendente", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Pesquise no CRM" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_last",
            toolName: "buscar_lead",
            input: {},
          },
        ],
      },
    ];

    const sanitizadas = sanitizeMessages(messages);
    expect(sanitizadas).toHaveLength(3);
    expect(sanitizadas[2]?.role).toBe("tool");
  });

  it("preserva par tool-call e tool-result já consistente", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Oi" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_ok",
            toolName: "ping",
            input: {},
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_ok",
            toolName: "ping",
            output: { type: "text", value: "pong" },
          },
        ],
      },
      { role: "assistant", content: "Pong recebido!" },
    ];

    const sanitizadas = sanitizeMessages(messages);
    expect(sanitizadas).toHaveLength(4);
    expect(sanitizadas[2]?.role).toBe("tool");
  });

  it("descarta tool-result órfão sem tool-call prévio", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Oi" },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_fantasma",
            toolName: "desconhecido",
            output: { type: "text", value: "dados" },
          },
        ],
      },
      { role: "assistant", content: "Tudo bem" },
    ];

    const sanitizadas = sanitizeMessages(messages);
    // O tool result órfão deve ter sido descartado
    expect(sanitizadas).toHaveLength(2);
    expect(sanitizadas.some((m) => m.role === "tool")).toBe(false);
  });
});

describe("normalizarErro — classificação de histórico inválido", () => {
  it("classifica o erro fatal do AI SDK v7 como historico_invalido", () => {
    const erro1 = new Error(
      "model output error: model output must contain either output text or tool calls",
    );
    expect(normalizarErro(erro1).error_code).toBe("historico_invalido");

    const erro2 = new Error(
      "Model output must contain either output text or tool calls.",
    );
    expect(normalizarErro(erro2).error_code).toBe("historico_invalido");
  });
});

describe("pruneToolResults — integração com poda e sanitização", () => {
  it("poda resultados antigos além da janela mantendo o histórico consistente", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Primeira pergunta" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "ler_contexto",
            input: { a: 1 },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "ler_contexto",
            output: { type: "text", value: "x".repeat(500) },
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_2",
            toolName: "enviar_msg",
            input: { b: 2 },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_2",
            toolName: "enviar_msg",
            output: { type: "text", value: "ok enviado" },
          },
        ],
      },
      { role: "assistant", content: "Tudo pronto" },
    ];

    const podado = pruneToolResults(messages, {
      windowTurns: 1, // mantém só a última rodada íntegra
      minResultTokens: 10,
    });

    expect(podado).toHaveLength(6);
    // A primeira mensagem tool (fora da janela) deve conter o stub de poda
    const toolMsg1 = podado[2];
    expect(toolMsg1?.role).toBe("tool");
    if (toolMsg1 && toolMsg1.role === "tool" && Array.isArray(toolMsg1.content)) {
      const output = toolMsg1.content[0]?.output;
      expect(output?.type).toBe("text");
      if (output?.type === "text") {
        expect(output.value).toContain("[resultado podado");
      }
    }
  });
});
