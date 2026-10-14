/**
 * CONVERSAR COM O ASSISTENTE DA EMPRESA — o emissor do turno de leitura com IA.
 *
 * ⚠️ ESTE ARQUIVO TEM DE MORAR EM `lib/agent-engine/`. A varredura de herança
 * (`tests/unit/heranca-de-provider-nos-pontos-auxiliares.test.ts`) lê SÓ essa
 * pasta: `arquivosDoMotor(join(process.cwd(), "lib/agent-engine"))`. Se alguém
 * mover este módulo para `lib/ai/` numa refatoração, o painel de Provedores
 * volta a anunciar o padrão da organização errado — e nenhum gate reclama.
 *
 * ## O que este emissor NÃO faz, de propósito
 *
 * · **Nenhum streaming.** `runModelCall` só usa `generateText`. Contornar o seam
 *   para transmitir palavra a palavra tiraria binding, orçamento e `llm_calls`
 *   do caminho — os três motivos de o seam existir.
 * · **Nenhuma isenção de orçamento.** `assistente_chat` NÃO entra em
 *   `PURPOSES_ISENTOS`: isentar faria o chat gastar sem teto, e o teto é o que
 *   protege a organização da própria conta de API.
 * · **Nenhum `llmOverride`, nenhum `model`.** O ponto herda o padrão da
 *   organização (binding → env → padrão da org). A lição do PR #151
 *   (`aux-model-args.ts`): emprestar só a string do modelo e deixar
 *   provider/credencial no padrão da organização mandava `gpt-5-mini` para o
 *   endpoint da Anthropic e matava o turno inteiro. `undefined` nos três faz o
 *   seam seguir a cadeia normal — e é por isso que `assistente_chat` NÃO entra
 *   em `PONTOS_QUE_HERDAM_DO_AGENTE`: não há herança do agente aqui, e a tela
 *   anunciá-la seria a mesma mentira, do avesso.
 */
import type pg from "pg";
import type { ModelMessage, ToolSet } from "ai";

import {
  runModelCall,
  type LlmEdgeConfig,
  type ResultadoDoModeloDoSeam,
  type RunModelCallDeps,
} from "../edge/llm/run-model-call";

export interface TurnoDoAssistente {
  author_kind: "human" | "ai";
  body: string;
}

export interface AssistenteChatInput {
  tenantId: string;
  /** `system` já montado por `montarSystemDoAssistente` (prefixo estável do cache). */
  system: string;
  /** O histórico do chat (`human`→`user`, `ai`→`assistant`). */
  historico: TurnoDoAssistente[];
  pergunta: string;
  /** O catálogo de leitura da F1b (T2/T6 o montam; o emissor só repassa). */
  tools: ToolSet;
  /** Teto do loop de tool-calls — o knob do turno, nunca constante. */
  maxSteps: number;
}

export interface RespostaDoAssistente {
  texto: string;
  /** `llm_calls.id` — o vínculo da linha da resposta com a tela de Execuções. */
  callId: string | null;
  /** Ferramentas que o modelo chamou, sem repetição e na ordem. */
  ferramentasChamadas: string[];
}

/**
 * Os `messages` do chat: o histórico da conversa (`human`→`user`,
 * `ai`→`assistant`), depois a pergunta como `user` por último.
 */
export function montarMensagensDoAssistente(input: {
  historico: TurnoDoAssistente[];
  pergunta: string;
}): ModelMessage[] {
  return [
    ...input.historico.map(
      (m): ModelMessage => ({
        role: m.author_kind === "human" ? "user" : "assistant",
        content: m.body,
      }),
    ),
    { role: "user", content: input.pergunta },
  ];
}

/** Nomes únicos, na ordem, do que o modelo chamou — `steps` e `toolCalls`. */
export function ferramentasDoResultado(result: ResultadoDoModeloDoSeam): string[] {
  const chamadas = [
    ...(result.steps ?? []).flatMap((s) => s.toolCalls ?? []),
    ...(result.toolCalls ?? []),
  ];
  const nomes: string[] = [];
  for (const c of chamadas) {
    const nome = typeof c.toolName === "string" ? c.toolName : "";
    if (nome !== "" && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}

export async function responderComoAssistente(
  db: pg.Pool,
  llmCfg: LlmEdgeConfig,
  input: AssistenteChatInput,
  deps: RunModelCallDeps = {},
): Promise<RespostaDoAssistente> {
  // O objeto abaixo leva COM `tools` E `maxSteps` (sem eles, o SDK para no 1º
  // step e o modelo nunca veria o resultado das métricas) e NÃO leva os três
  // campos de provedor — ver o cabeçalho. O comentário mora AQUI, fora do
  // objeto, de propósito: a varredura de herança lê o texto do objeto literal,
  // e palavra de provedor dentro dele viraria herança declarada que não existe.
  const { result, callId } = await runModelCall(
    db,
    llmCfg,
    {
      tenantId: input.tenantId,
      leadId: null,
      jobId: null,
      // Este turno não pertence a nenhum agente publicado: é o assistente da
      // empresa falando com a equipe. `null` mantém a aba "Execuções" sem dono
      // e o `purpose` distingue as linhas.
      agentId: null,
      // É o literal que `pontos-de-ia-completude.test.ts` procura em `lib/**`
      // e o que liga esta chamada ao painel de Provedores e à tela de
      // Execuções.
      purpose: "assistente_chat",
      system: input.system,
      messages: montarMensagensDoAssistente(input),
      tools: input.tools,
      maxSteps: input.maxSteps,
    },
    deps,
  );

  return {
    texto: (result.text ?? "").trim(),
    callId: callId ?? null,
    ferramentasChamadas: ferramentasDoResultado(result),
  };
}
