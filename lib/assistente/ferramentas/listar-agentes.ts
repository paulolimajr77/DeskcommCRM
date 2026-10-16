/**
 * Ferramenta `listar_agentes` — os agentes da organização, sem segredo.
 *
 * Lê `GET /api/v1/ai/agents` POR DENTRO, com a sessão da pessoa. Projeção por
 * LISTA POSITIVA, campo a campo: `id`, `nome`, `descricao` (cortada em 200),
 * `tipo`, `ativo`, `publicado`, `pausado`, `modo_de_operacao` e o
 * provedor/modelo da versão publicada. NUNCA `system_prompt`, `config`,
 * `guardrails`, `tool_ids` brutos, `credential_id` ou qualquer campo novo que
 * a rota passe a devolver. Sem `incluir_arquivados`, o arquivado nem sai —
 * a rota já filtra e a ferramenta filtra de novo.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

export const LIMITE_DA_DESCRICAO_DO_AGENTE = 200;

const esquemaDeEntrada = z.strictObject({ incluir_arquivados: z.boolean().optional() });

let handlerSobreposto: HandlerDeRota | null = null;

/** Só para testes: troca o handler real (que exigiria sessão) por um dublê. */
export function sobreporHandlerDeAgentes(handler: HandlerDeRota | null): void {
  handlerSobreposto = handler;
}

async function handlerAtual(): Promise<HandlerDeRota> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/ai/agents/route");
  return modulo.GET;
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object";
}

export function criarListarAgentes(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Lista os agentes de IA da organização (id, nome, descrição, tipo, se está ativo, " +
      "publicado ou pausado, modo de operação e provedor/modelo da versão publicada). " +
      "Use para saber o que já existe antes de sugerir criar outro. " +
      "`incluir_arquivados` traz também os arquivados.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("listar_agentes", esquemaDeEntrada, async ({ incluir_arquivados }) => {
      void entrada;
      const comArquivados = incluir_arquivados === true;
      const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/ai/agents", comArquivados ? { include_archived: "true" } : {});
      if (!("status" in resposta) || resposta.status !== 200) {
        return { ok: false as const, motivo: "indisponivel" as const };
      }
      const corpo = eObjeto(resposta.corpo) ? (resposta.corpo as { data?: unknown }).data : undefined;
      if (!Array.isArray(corpo)) return { ok: false as const, motivo: "indisponivel" as const };

      const agentes = (corpo as Record<string, unknown>[]).flatMap((linha) => {
        if (typeof linha.id !== "string" || typeof linha.name !== "string") return [];
        // Defesa em profundidade: a rota já filtra, e a ferramenta filtra de novo.
        if (!comArquivados && linha.archived_at !== null && linha.archived_at !== undefined) return [];
        const versao = eObjeto(linha.versao_publicada)
          ? (linha.versao_publicada as { provider?: unknown; model?: unknown })
          : null;
        const descricao = typeof linha.description === "string" ? linha.description : "";
        return [
          {
            id: linha.id,
            nome: linha.name,
            descricao:
              descricao.length > LIMITE_DA_DESCRICAO_DO_AGENTE
                ? descricao.slice(0, LIMITE_DA_DESCRICAO_DO_AGENTE)
                : descricao,
            tipo: typeof linha.kind === "string" ? linha.kind : null,
            ativo: linha.is_active === true,
            publicado:
              linha.published_version_id !== null && linha.published_version_id !== undefined,
            pausado: linha.paused_at !== null && linha.paused_at !== undefined,
            modo_de_operacao:
              typeof linha.operation_mode === "string" ? linha.operation_mode : null,
            provedor_publicado:
              versao !== null && typeof versao.provider === "string" ? versao.provider : null,
            modelo_publicado:
              versao !== null && typeof versao.model === "string" ? versao.model : null,
          },
        ];
      });

      return { ok: true as const, agentes };
    }),
  });
}
