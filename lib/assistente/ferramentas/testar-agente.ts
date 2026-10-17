/**
 * Ferramenta `testar_agente` — roda o botão "Testar" num agente em RASCUNHO.
 *
 * Manda as mensagens de exemplo POR DENTRO (`POST .../versions/:vid/test`,
 * com a sessão do administrador): o agente responde de verdade — chama o
 * modelo da empresa e consome crédito de IA — sem enviar nada ao WhatsApp e
 * sem tocar em contato real. Só testa versão em RASCUNHO (a de maior número);
 * publicada nunca, mesmo que o modelo peça.
 *
 * As mensagens rodam em SEQUÊNCIA, nunca em paralelo; a primeira falha de
 * infraestrutura para tudo e devolve o que já saiu. A projeção é por LISTA
 * POSITIVA, campo a campo — `run_id`, trace, prompt, ids e o `...result`
 * inteiro da rota NUNCA saem daqui. Escrita de verdade, só `admin`.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({
  agente_id: z.string().uuid(),
  mensagens: z.array(z.string().trim().min(1).max(500)).min(1).max(5),
});

/** A resposta é longa por natureza; a ferramenta entrega o começo, não tudo. */
const LIMITE_DA_RESPOSTA = 1200;
/** Nomes de ferramenta, nunca argumentos — e no máximo estes. */
const MAXIMO_DE_FERRAMENTAS = 10;

let versoesSobrepostas: HandlerDeRota | null = null;
let testeSobreposto: HandlerDeRota | null = null;

/** Só para testes: troca os handlers reais (que exigiriam sessão) por dublês. */
export function sobreporHandlerDeVersoes(handler: HandlerDeRota | null): void {
  versoesSobrepostas = handler;
}

/** Só para testes: troca o handler real (que exigiria sessão) por um dublê. */
export function sobreporHandlerDeTeste(handler: HandlerDeRota | null): void {
  testeSobreposto = handler;
}

async function handlerDeVersoes(agenteId: string): Promise<HandlerDeRota> {
  if (versoesSobrepostas) return versoesSobrepostas;
  const modulo = await import("@/app/api/v1/ai/agents/[id]/versions/route");
  return (req) => modulo.GET(req, { params: Promise.resolve({ id: agenteId }) });
}

async function handlerDeTeste(agenteId: string, versaoId: string): Promise<HandlerDeRota> {
  if (testeSobreposto) return testeSobreposto;
  const modulo = await import("@/app/api/v1/ai/agents/[id]/versions/[vid]/test/route");
  return (req) => modulo.POST(req, { params: Promise.resolve({ id: agenteId, vid: versaoId }) });
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object";
}

type MotivoDeFalhaAoTestar =
  | "sem_rascunho"
  | "sem_permissao_ou_nao_existe"
  | "pedido_invalido"
  | "indisponivel";

function motivoDoStatus(status: number): Exclude<MotivoDeFalhaAoTestar, "sem_rascunho"> {
  if (status === 403 || status === 404) return "sem_permissao_ou_nao_existe";
  if (status === 422) return "pedido_invalido";
  return "indisponivel";
}

export interface ResultadoDeTesteDoAgente {
  mensagem: string;
  estado: "ok" | "bloqueado";
  resposta: string;
  /** Só os NOMES das ferramentas chamadas, até 10 — nenhum argumento. */
  ferramentas: string[];
  passou: boolean;
  simulado: boolean;
  /** Só quando `simulado`: avisa que foi teste de mentira, sem modelo real. */
  aviso?: string;
}

/** A projeção por lista positiva — `null` quando o corpo não tem o formato. */
function projetarResultado(mensagem: string, corpo: unknown): ResultadoDeTesteDoAgente | null {
  if (!eObjeto(corpo)) return null;
  if (typeof corpo.status !== "string" || typeof corpo.final_text !== "string") return null;
  const ferramentas = Array.isArray(corpo.tool_calls)
    ? (corpo.tool_calls as unknown[]).flatMap((chamada) =>
        eObjeto(chamada) && typeof chamada.tool === "string" ? [chamada.tool] : [],
      ).slice(0, MAXIMO_DE_FERRAMENTAS)
    : [];
  const guardrails = eObjeto(corpo.guardrails) ? corpo.guardrails : null;
  const simulado = corpo.stub === true;
  return {
    mensagem,
    estado: corpo.status === "ok" ? "ok" : "bloqueado",
    resposta: corpo.final_text.slice(0, LIMITE_DA_RESPOSTA),
    ferramentas,
    passou: guardrails !== null && guardrails.passou === true,
    simulado,
    ...(simulado
      ? {
          aviso:
            "Isto foi um teste de mentira (simulado): não chamou o modelo de verdade, " +
            "então não prova nada sobre o atendimento.",
        }
      : {}),
  };
}

function resumir(resultados: ResultadoDeTesteDoAgente[]): { passaram: number; total: number } {
  return { passaram: resultados.filter((r) => r.passou).length, total: resultados.length };
}

function custoDe(resultados: ResultadoDeTesteDoAgente[]): string {
  return (
    `Este teste chamou o modelo de IA da empresa ${resultados.length} ` +
    `vez(es) e consome crédito.`
  );
}

export function criarTestarAgente(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Roda o botão Testar num agente em RASCUNHO: manda até 5 mensagens de exemplo e o " +
      "agente responde de verdade (chama o modelo da empresa e consome crédito), sem WhatsApp " +
      "e sem contato real. Só testa rascunho (o de maior número); versão publicada nunca é " +
      "testada. `agente_id` e `mensagens` (1 a 5 textos de até 500 caracteres).",
    inputSchema: esquemaDeEntrada,
    execute: protegida("testar_agente", esquemaDeEntrada, async ({ agente_id, mensagens }) => {
      void entrada;
      // 1. A versão em rascunho de MAIOR número — publicada nunca.
      const respostaVersoes = await chamarRotaPorDentro(
        await handlerDeVersoes(agente_id),
        `/api/v1/ai/agents/${agente_id}/versions`,
        {},
      );
      if (!("status" in respostaVersoes) || respostaVersoes.status !== 200) {
        const motivo =
          "status" in respostaVersoes ? motivoDoStatus(respostaVersoes.status) : "indisponivel";
        return { ok: false as const, motivo };
      }
      const corpoVersoes = eObjeto(respostaVersoes.corpo)
        ? (respostaVersoes.corpo as { data?: unknown }).data
        : undefined;
      if (!Array.isArray(corpoVersoes)) return { ok: false as const, motivo: "indisponivel" as const };
      const rascunhos = (corpoVersoes as Record<string, unknown>[]).flatMap((linha) =>
        typeof linha.id === "string" && typeof linha.version_number === "number"
          ? [{ id: linha.id, numero: linha.version_number, estado: linha.status }]
          : [],
      ).filter((v) => v.estado === "draft");
      if (rascunhos.length === 0) {
        return {
          ok: false as const,
          motivo: "sem_rascunho" as const,
          detalhe:
            "PRECISO CONFIRMAR: este agente não tem versão em rascunho. " +
            "O teste só roda em rascunho, nunca em versão publicada.",
        };
      }
      const alvo = rascunhos.reduce((maior, atual) => (atual.numero > maior.numero ? atual : maior));

      // 2. Uma mensagem por vez, em SEQUÊNCIA; a primeira falha para tudo.
      const resultados: ResultadoDeTesteDoAgente[] = [];
      for (const mensagem of mensagens) {
        const resposta = await chamarRotaPorDentro(
          await handlerDeTeste(agente_id, alvo.id),
          `/api/v1/ai/agents/${agente_id}/versions/${alvo.id}/test`,
          {},
          { metodo: "POST", corpo: { sample_message: mensagem } },
        );
        if (!("status" in resposta) || resposta.status !== 200) {
          const motivo =
            "status" in resposta ? motivoDoStatus(resposta.status) : "indisponivel";
          if (resultados.length === 0) return { ok: false as const, motivo };
          return {
            ok: false as const,
            motivo,
            versao: alvo.numero,
            resultados,
            resumo: resumir(resultados),
            custo: custoDe(resultados),
          };
        }
        const corpo = eObjeto(resposta.corpo)
          ? (resposta.corpo as { data?: unknown }).data
          : undefined;
        const projetado = projetarResultado(mensagem, corpo);
        if (!projetado) {
          if (resultados.length === 0) return { ok: false as const, motivo: "indisponivel" as const };
          return {
            ok: false as const,
            motivo: "indisponivel" as const,
            versao: alvo.numero,
            resultados,
            resumo: resumir(resultados),
            custo: custoDe(resultados),
          };
        }
        resultados.push(projetado);
      }

      return {
        ok: true as const,
        versao: alvo.numero,
        resultados,
        resumo: resumir(resultados),
        custo: custoDe(resultados),
      };
    }),
  });
}
