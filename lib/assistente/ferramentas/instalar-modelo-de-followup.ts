/**
 * Ferramenta `instalar_modelo_de_followup` — instala um modelo do catálogo
 * como RASCUNHO da organização (nada publicado, ninguém atende).
 *
 * Chama `POST /api/v1/ai/followup-flows/from-model` POR DENTRO, com a sessão do
 * administrador. O corpo traduz o vocabulário da ferramenta para o da rota
 * (`etapa_id`→`stage_id`, `nome`→`name`) e OMITE o que não veio. Nunca leva
 * organização: ela vem da sessão, nunca do modelo.
 *
 * Modelo que `pedeEtapa` sem `etapa_id` nem chega ao POST — devolve
 * `falta_etapa` com o pedido de confirmação. `201` com `status` diferente de
 * `draft` é tratado como indisponível (a rota instala rascunho por definição).
 * Escrita de verdade, só `admin` (a montagem barra os outros papéis).
 *
 * O miolo vive em `instalarModeloDeFollowup` — extraído para a montagem do
 * pacote do nicho (T14b) reusar SEM mudar comportamento. `execute` só repassa.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import { MODELOS_DE_FOLLOWUP, modeloPorId } from "@/lib/followup/modelos";

import { protegida } from "./protegida";
import { anotarCartaoDeArtefato, type EntradaDasFerramentas } from "./tipos";

const IDS_DOS_MODELOS = MODELOS_DE_FOLLOWUP.map((m) => m.id) as unknown as [string, ...string[]];

const esquemaDeEntrada = z.strictObject({
  model_id: z.enum(IDS_DOS_MODELOS),
  etapa_id: z.string().uuid().optional(),
  nome: z.string().trim().min(1).max(80).optional(),
});

let handlerSobreposto: HandlerDeRota | null = null;

/** Só para testes: troca o handler real (que exigiria sessão) por um dublê. */
export function sobreporHandlerDeInstalacao(handler: HandlerDeRota | null): void {
  handlerSobreposto = handler;
}

async function handlerAtual(): Promise<HandlerDeRota> {
  if (handlerSobreposto) return handlerSobreposto;
  const modulo = await import("@/app/api/v1/ai/followup-flows/from-model/route");
  return modulo.POST;
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object";
}

/** O que a montagem do pacote do nicho (T14b) passa para instalar um modelo. */
export interface PedidoDeFollowupDeModelo {
  model_id: string;
  etapa_id?: string;
  nome?: string;
}

export type MotivoDeFalhaAoInstalarFollowup =
  | "pedido_invalido"
  | "falta_etapa"
  | "ja_existe"
  | "indisponivel";

export type ResultadoDeFollowupDeModelo =
  | { ok: true; followup: { id: string; nome: string; estado: "rascunho" }; aviso: string }
  | { ok: false; motivo: MotivoDeFalhaAoInstalarFollowup; detalhe?: string };

/**
 * O miolo de `instalar_modelo_de_followup`, extraído sem mudar comportamento:
 * mesmas checagens, na mesma ordem, com os mesmos motivos.
 */
export async function instalarModeloDeFollowup(
  pedido: PedidoDeFollowupDeModelo,
): Promise<ResultadoDeFollowupDeModelo> {
  const { model_id, etapa_id, nome } = pedido;
  const modelo = modeloPorId(model_id);
  if (!modelo) return { ok: false, motivo: "pedido_invalido" };
  if (modelo.pedeEtapa && etapa_id === undefined) {
    return {
      ok: false,
      motivo: "falta_etapa",
      detalhe:
        "PRECISO CONFIRMAR: este modelo dispara quando um negócio entra numa etapa do funil. " +
        "Diga qual etapa (use listar_funis e listar_etapas_do_funil).",
    };
  }

  const resposta = await chamarRotaPorDentro(
    await handlerAtual(),
    "/api/v1/ai/followup-flows/from-model",
    {},
    {
      metodo: "POST",
      corpo: {
        model_id,
        ...(etapa_id === undefined ? {} : { stage_id: etapa_id }),
        ...(nome === undefined ? {} : { name: nome }),
      },
    },
  );
  if ("falhou" in resposta) return { ok: false, motivo: "indisponivel" };
  if (resposta.status === 409) return { ok: false, motivo: "ja_existe" };
  if (resposta.status === 404 || resposta.status === 422) {
    return { ok: false, motivo: "pedido_invalido" };
  }
  if (resposta.status !== 201) return { ok: false, motivo: "indisponivel" };

  const corpo = eObjeto(resposta.corpo)
    ? (resposta.corpo as { data?: unknown }).data
    : undefined;
  if (!eObjeto(corpo) || typeof corpo.id !== "string" || typeof corpo.name !== "string") {
    return { ok: false, motivo: "indisponivel" };
  }
  if (corpo.status !== "draft") return { ok: false, motivo: "indisponivel" };

  return {
    ok: true,
    followup: { id: corpo.id, nome: corpo.name, estado: "rascunho" },
    aviso:
      "Rascunho criado. Para disparar sozinho, um agente PUBLICADO precisa ter este follow-up " +
      "ligado em Agente › Follow-up, e publicar o follow-up é clique do administrador.",
  };
}

export function criarInstalarModeloDeFollowup(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Instala um modelo de follow-up como RASCUNHO (nada publicado, ninguém atende). " +
      "`model_id` do catálogo, `etapa_id` (obrigatório só para modelo que dispara por etapa) e " +
      "`nome` (opcional, para renomear). Publicar o follow-up e ligá-lo a um agente são passos da tela.",
    inputSchema: esquemaDeEntrada,
    execute: protegida(
      "instalar_modelo_de_followup",
      esquemaDeEntrada,
      async ({ model_id, etapa_id, nome }) => {
        const resultado = await instalarModeloDeFollowup({ model_id, etapa_id, nome });
        if (resultado.ok) {
          anotarCartaoDeArtefato(entrada.coletor, entrada.ctx.idioma, {
            artefato: "followup",
            nome: resultado.followup.nome,
            href: `/app/ai/followups/${resultado.followup.id}`,
          });
        }
        return resultado;
      },
    ),
  });
}
