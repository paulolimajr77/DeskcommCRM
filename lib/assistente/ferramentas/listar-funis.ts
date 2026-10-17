/**
 * Ferramenta `listar_funis` — os funis da organização, só id e nome.
 *
 * Lê `GET /api/v1/pipelines` POR DENTRO, com a sessão da pessoa. O
 * `listPipelinesHandler` devolve a linha do funil SEM etapas — então não há
 * etapa para projetar: cada funil sai SÓ com `id` e `nome`, copiados campo a
 * campo (lista positiva).
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({});

let handlerSobreposto: HandlerDeRota | null = null;

/** Só para testes: troca o handler real (que exigiria sessão) por um dublê. */
export function sobreporHandlerDeFunis(handler: HandlerDeRota | null): void {
  handlerSobreposto = handler;
}

async function handlerAtual(): Promise<HandlerDeRota> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/pipelines/route");
  return modulo.GET;
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object";
}

export function criarListarFunis(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Lista os funis de vendas da organização (id e nome). " +
      "Use para saber em qual funil um negócio novo entraria, antes de sugerir criar algo.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("listar_funis", esquemaDeEntrada, async () => {
      void entrada;
      const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/pipelines", {});
      if (!("status" in resposta) || resposta.status !== 200) {
        return { ok: false as const, motivo: "indisponivel" as const };
      }
      const corpo = eObjeto(resposta.corpo) ? (resposta.corpo as { data?: unknown }).data : undefined;
      if (!Array.isArray(corpo)) return { ok: false as const, motivo: "indisponivel" as const };

      const funis = (corpo as Record<string, unknown>[]).flatMap((linha) => {
        if (typeof linha.id !== "string" || typeof linha.name !== "string") return [];
        return [{ id: linha.id, nome: linha.name }];
      });

      return { ok: true as const, funis };
    }),
  });
}
