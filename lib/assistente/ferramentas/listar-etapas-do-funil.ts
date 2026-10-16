/**
 * Ferramenta `listar_etapas_do_funil` — as etapas vivas de um funil.
 *
 * Lê `GET /api/v1/pipelines/{id}/stages` POR DENTRO, com a sessão da pessoa.
 * A rota é DINÂMICA: o handler recebe `(req, ctx)` e `ctx.params` é uma
 * Promise, então o embrulho resolve o `id` antes de chamar. Projeção por LISTA
 * POSITIVA: `id`, `nome`, `posicao`, `ganha` (is_won) e `perdida` (is_lost). A
 * janela de esfriamento (`expected_duration_hours`) e qualquer campo novo da
 * rota NÃO saem daqui.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({ funil_id: z.string().uuid() });

let handlerSobreposto: HandlerDeRota | null = null;

/** Só para testes: troca o handler real (que exigiria sessão) por um dublê. */
export function sobreporHandlerDeEtapas(handler: HandlerDeRota | null): void {
  handlerSobreposto = handler;
}

async function handlerAtual(funilId: string): Promise<HandlerDeRota> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/pipelines/[id]/stages/route");
  return (req) => modulo.GET(req, { params: Promise.resolve({ id: funilId }) });
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object";
}

export function criarListarEtapasDoFunil(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Lista as etapas vivas de um funil (id, nome, posição, se é ganho e se é perda). " +
      "Use com o `funil_id` que veio de `listar_funis`, para escolher a etapa que dispara um follow-up.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("listar_etapas_do_funil", esquemaDeEntrada, async ({ funil_id }) => {
      void entrada;
      const resposta = await chamarRotaPorDentro(
        await handlerAtual(funil_id),
        `/api/v1/pipelines/${funil_id}/stages`,
        {},
      );
      if (!("status" in resposta) || resposta.status !== 200) {
        return { ok: false as const, motivo: "indisponivel" as const };
      }
      const corpo = eObjeto(resposta.corpo) ? (resposta.corpo as { data?: unknown }).data : undefined;
      if (!Array.isArray(corpo)) return { ok: false as const, motivo: "indisponivel" as const };

      const etapas = (corpo as Record<string, unknown>[]).flatMap((linha) => {
        if (typeof linha.id !== "string" || typeof linha.name !== "string") return [];
        return [
          {
            id: linha.id,
            nome: linha.name,
            posicao: typeof linha.position === "number" ? linha.position : null,
            ganha: linha.is_won === true,
            perdida: linha.is_lost === true,
          },
        ];
      });

      return { ok: true as const, etapas };
    }),
  });
}
