/**
 * Sanitização e normalização defensiva de mensagens antes do envio ao provedor LLM.
 *
 * Garante as invariantes de integridade do protocolo de chat do AI SDK v7 e dos provedores
 * canônicos (Anthropic, OpenAI, Google):
 * 1. Nenhuma mensagem `assistant` possui `content` vazio (string vazia ou array vazio),
 *    o que evita o erro fatal: "model output error: model output must contain either output text or tool calls".
 * 2. Todo `tool-call` emitido por um `assistant` tem um `tool-result` correspondente
 *    na mensagem `tool` subsequente. Quando o turno do agente é interrompido prematuramente
 *    (ex.: ao atingir o teto de passos `maxSteps` ou por erro transitório), um `tool-result`
 *    sintético de encerramento é injetado, fechando o par antes da próxima mensagem de usuário
 *    (como a instrução de fechamento/checkpoint).
 * 3. Nenhum `tool-result` órfão (sem `tool-call` correspondente) é repassado ao modelo.
 * 4. Mensagens `tool` vazias ou com partes sem resultado válido são descartadas.
 */
import type { ModelMessage } from 'ai';

export function sanitizeMessages(messages: ModelMessage[]): ModelMessage[] {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const result: ModelMessage[] = [];
  // Tool calls do último assistant aguardando tool-result
  let pendingToolCalls = new Map<string, { toolCallId: string; toolName: string }>();

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;

    if (msg.role === 'assistant') {
      // Se havia tool-calls do assistant anterior que não foram respondidos,
      // injeta a mensagem tool sintética de fechamento antes deste novo assistant.
      if (pendingToolCalls.size > 0) {
        result.push(criarToolResultSintetico(pendingToolCalls));
        pendingToolCalls.clear();
      }

      if (typeof msg.content === 'string') {
        const texto = msg.content.trim();
        result.push({
          ...msg,
          content: texto.length > 0 ? msg.content : '(sem resposta)',
        });
      } else if (Array.isArray(msg.content)) {
        if (msg.content.length === 0) {
          // Array vazio aciona o erro fatal do SDK
          result.push({
            ...msg,
            content: [{ type: 'text', text: '(sem resposta)' }],
          });
        } else {
          // Filtra partes com integridade mínima
          const partesValidas = msg.content.filter((p) => {
            if (!p || typeof p !== 'object') return false;
            if (p.type === 'tool-call') {
              return typeof p.toolCallId === 'string' && p.toolCallId.length > 0;
            }
            return true;
          });

          if (partesValidas.length === 0) {
            result.push({
              ...msg,
              content: [{ type: 'text', text: '(sem resposta)' }],
            });
          } else {
            // Registra tool calls para cobrar tool-result na mensagem seguinte
            for (const part of partesValidas) {
              if (part.type === 'tool-call') {
                pendingToolCalls.set(part.toolCallId, {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName || 'ferramenta',
                });
              }
            }
            result.push({
              ...msg,
              content: partesValidas,
            });
          }
        }
      } else {
        result.push(msg);
      }
    } else if (msg.role === 'tool') {
      if (!Array.isArray(msg.content) || msg.content.length === 0) {
        continue;
      }

      // Só repassa tool-results que correspondem a tool calls conhecidos
      const toolResultsValidos = msg.content.filter((part) => {
        if (!part || typeof part !== 'object') return false;
        if (part.type !== 'tool-result') return false;
        if (typeof part.toolCallId !== 'string' || part.toolCallId.length === 0) return false;

        if (pendingToolCalls.has(part.toolCallId)) {
          pendingToolCalls.delete(part.toolCallId);
          return true;
        }

        // Checa se foi chamado em algum assistant anterior já registrado
        const jaChamadoAntes = result.some(
          (r) =>
            r.role === 'assistant' &&
            Array.isArray(r.content) &&
            r.content.some((p) => p.type === 'tool-call' && p.toolCallId === part.toolCallId),
        );
        return jaChamadoAntes;
      });

      if (toolResultsValidos.length > 0) {
        result.push({
          ...msg,
          content: toolResultsValidos,
        });
      }
    } else if (msg.role === 'user' || msg.role === 'system') {
      // Se havia tool-calls pendentes do assistant anterior, o provedor proíbe
      // mensagem de usuário/sistema imediata sem a mensagem tool intermediária.
      if (pendingToolCalls.size > 0) {
        result.push(criarToolResultSintetico(pendingToolCalls));
        pendingToolCalls.clear();
      }

      if (typeof msg.content === 'string') {
        const texto = msg.content.trim();
        result.push({
          ...msg,
          content: texto.length > 0 ? msg.content : '(vazio)',
        });
      } else if (Array.isArray(msg.content)) {
        if (msg.content.length === 0) {
          result.push({
            ...msg,
            content: [{ type: 'text', text: '(vazio)' }],
          });
        } else {
          result.push(msg);
        }
      } else {
        result.push(msg);
      }
    } else {
      result.push(msg);
    }
  }

  // Se a última mensagem for um assistant com tool-calls pendentes (ex.: teto de passos atingido),
  // fecha o ciclo injetando o tool-result sintético no final.
  if (pendingToolCalls.size > 0) {
    result.push(criarToolResultSintetico(pendingToolCalls));
    pendingToolCalls.clear();
  }

  return result;
}

function criarToolResultSintetico(
  pendingCalls: Map<string, { toolCallId: string; toolName: string }>,
): ModelMessage {
  return {
    role: 'tool',
    content: Array.from(pendingCalls.values()).map(({ toolCallId, toolName }) => ({
      type: 'tool-result' as const,
      toolCallId,
      toolName,
      output: {
        type: 'text' as const,
        value: '[execução de ferramenta cancelada ou interrompida por limite de passos]',
      },
    })),
  };
}
