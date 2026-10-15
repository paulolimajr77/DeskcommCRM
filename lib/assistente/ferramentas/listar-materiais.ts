/**
 * Ferramenta `listar_materiais` — os materiais de conhecimento, sem conteúdo.
 *
 * Lê `GET /api/v1/ai/knowledge/sources` POR DENTRO, com a sessão da pessoa.
 * Projeção por LISTA POSITIVA: cada fonte sai SÓ com `id`, `nome`, `tipo` e
 * `estado` — nada de texto, metadados ou campo novo que a rota passe a devolver.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({});

let handlerSobreposto: HandlerDeRota | null = null;

/** Só para testes: troca o handler real (que exigiria sessão) por um dublê. */
export function sobreporHandlerDeMateriais(handler: HandlerDeRota | null): void {
  handlerSobreposto = handler;
}

async function handlerAtual(): Promise<HandlerDeRota> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/ai/knowledge/sources/route");
  return modulo.GET;
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object";
}

export function criarListarMateriais(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Lista os materiais de conhecimento da organização (id, nome, tipo e estado). " +
      "Use para saber o que o agente já pode ler, antes de sugerir criar material novo. " +
      "Nunca traz o conteúdo do material.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("listar_materiais", esquemaDeEntrada, async () => {
      void entrada;
      const resposta = await chamarRotaPorDentro(
        await handlerAtual(),
        "/api/v1/ai/knowledge/sources",
        {},
      );
      if (!("status" in resposta) || resposta.status !== 200) {
        return { ok: false as const, motivo: "indisponivel" as const };
      }
      const corpo = eObjeto(resposta.corpo) ? (resposta.corpo as { data?: unknown }).data : undefined;
      if (!Array.isArray(corpo)) return { ok: false as const, motivo: "indisponivel" as const };

      const materiais = (corpo as Record<string, unknown>[]).flatMap((linha) => {
        if (typeof linha.id !== "string" || typeof linha.name !== "string") return [];
        return [
          {
            id: linha.id,
            nome: linha.name,
            tipo: typeof linha.source_type === "string" ? linha.source_type : null,
            estado: typeof linha.status === "string" ? linha.status : null,
          },
        ];
      });

      return { ok: true as const, materiais };
    }),
  });
}
