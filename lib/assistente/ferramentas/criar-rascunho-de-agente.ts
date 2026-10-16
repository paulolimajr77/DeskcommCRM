/**
 * Ferramenta `criar_rascunho_de_agente` — cria o agente como RASCUNHO (v1
 * draft, nada publicado, ninguém atende).
 *
 * O modelo escolhe SÓ o pedido: `nome`, `descricao`, `prompt` (o
 * `system_prompt`), `pacotes` (nomes de `lib/mcp/tools/pacotes.ts`), `funis`
 * e `materiais` (ids). Provedor, modelo e credencial vêm da configuração da
 * organização lida por dentro (`GET ai/providers`, padrão T11) — nunca do que
 * o modelo digita. Sem credencial validada, devolve PRECISO CONFIRMAR com o
 * link da tela, sem chamar o POST.
 *
 * Os `tool_ids` saem dos pacotes por `ligarPacote` sobre o catálogo com
 * handler (`capacidades-padrao.ts`) — a mesma derivação do onboarding, nunca
 * lista digitada. União acima do teto: recusa fechada com a contagem, nunca
 * corta sozinho. Funil/material que não está na org (ou inativo) nem chega ao
 * POST — a rota confere de novo (defesa em profundidade).
 *
 * Escrita de verdade, só para `admin` (a montagem barra os outros papéis).
 * Canal: `null` (nulo rascunha, não atende). Rota fora do 201 ou corpo fora
 * do formato: `indisponivel`, sem detalhe.
 *
 * O miolo vive em `criarAgenteRascunho` — extraído para a montagem do pacote
 * do nicho (T14b) reusar SEM mudar comportamento. `execute` só repassa.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { catalogoComHandler } from "@/lib/ai/agents/capacidades-padrao";
import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import { PACOTES, type ToolBundle } from "@/lib/mcp/tools/pacotes";
import { excedeuTeto, ligarPacote } from "@/lib/mcp/tools/selecao-por-pacote";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const NOMES_DOS_PACOTES = PACOTES.map((p) => p.id) as unknown as [ToolBundle, ...ToolBundle[]];

const esquemaDeEntrada = z.strictObject({
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(2000).optional(),
  prompt: z.string().trim().min(1).max(20000),
  pacotes: z.array(z.enum(NOMES_DOS_PACOTES)).optional(),
  funis: z.array(z.string().uuid()).optional(),
  materiais: z.array(z.string().uuid()).optional(),
});

const PACOTES_PADRAO: ToolBundle[] = ["vender"];
const LINK_DA_TELA_DE_CREDENCIAIS = "/app/ai/credentials";
const LINK_DA_TELA_DE_PROVEDORES = "/app/ai/providers";

interface FontesDeCriacao {
  provedores: HandlerDeRota | null;
  funis: HandlerDeRota | null;
  materiais: HandlerDeRota | null;
  agentesPost: HandlerDeRota | null;
}

let fontesSobrepostas: FontesDeCriacao | null = null;

/** Só para testes: troca os handlers reais (que exigiriam sessão) por dublês. */
export function sobreporHandlersDeCriacao(fontes: FontesDeCriacao | null): void {
  fontesSobrepostas = fontes;
}

async function handlerDeProvedores(): Promise<HandlerDeRota> {
  if (fontesSobrepostas?.provedores) return fontesSobrepostas.provedores;
  const modulo = await import("@/app/api/v1/ai/providers/route");
  return modulo.GET;
}

async function handlerDeFunis(): Promise<HandlerDeRota> {
  if (fontesSobrepostas?.funis) return fontesSobrepostas.funis;
  const modulo = await import("@/app/api/v1/pipelines/route");
  return modulo.GET;
}

async function handlerDeMateriais(): Promise<HandlerDeRota> {
  if (fontesSobrepostas?.materiais) return fontesSobrepostas.materiais;
  const modulo = await import("@/app/api/v1/ai/knowledge/sources/route");
  return modulo.GET;
}

async function handlerDeCriacao(): Promise<HandlerDeRota> {
  if (fontesSobrepostas?.agentesPost) return fontesSobrepostas.agentesPost;
  const modulo = await import("@/app/api/v1/ai/agents/route");
  return modulo.POST;
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object";
}

async function lerLista(
  handler: HandlerDeRota,
  caminho: string,
  query: Record<string, string> = {},
): Promise<Record<string, unknown>[] | null> {
  const resposta = await chamarRotaPorDentro(handler, caminho, query);
  if (!("status" in resposta) || resposta.status !== 200) return null;
  const corpo = eObjeto(resposta.corpo) ? (resposta.corpo as { data?: unknown }).data : undefined;
  return Array.isArray(corpo) ? (corpo as Record<string, unknown>[]) : null;
}

/** O que a montagem do pacote do nicho (T14b) passa para criar o agente. */
export interface PedidoDeAgenteRascunho {
  nome: string;
  descricao?: string;
  prompt: string;
  pacotes?: ToolBundle[];
  funis?: string[];
  materiais?: string[];
}

export type MotivoDeFalhaAoAlcancarAgente =
  | "prompt_curto"
  | "indisponivel"
  | "sem_modelo_padrao"
  | "sem_credencial"
  | "teto_de_ferramentas"
  | "escopo_invalido";

export type ResultadoDeAgenteRascunho =
  | { ok: true; agente: { id: string; nome: string; estado: "rascunho" } }
  | { ok: false; motivo: MotivoDeFalhaAoAlcancarAgente; detalhe?: string };

/**
 * O miolo de `criar_rascunho_de_agente`, extraído sem mudar comportamento:
 * mesmas checagens, na mesma ordem, com os mesmos motivos.
 */
export async function criarAgenteRascunho(
  pedido: PedidoDeAgenteRascunho,
): Promise<ResultadoDeAgenteRascunho> {
  const { nome, descricao, prompt, pacotes, funis, materiais } = pedido;
  // Decisão do dono (delegada): prompt curto nem chama a rota.
  if (prompt.trim().length < 10) {
    return { ok: false, motivo: "prompt_curto" };
  }
  const pacotesPedidos = pacotes ?? PACOTES_PADRAO;
  const funisPedidos = funis ?? [];
  const materiaisPedidos = materiais ?? [];

  // Provedor, modelo e credencial: da configuração, nunca do modelo.
  const respostaProvedores = await chamarRotaPorDentro(
    await handlerDeProvedores(),
    "/api/v1/ai/providers",
    {},
  );
  if (!("status" in respostaProvedores) || respostaProvedores.status !== 200) {
    return { ok: false, motivo: "indisponivel" };
  }
  const corpoProv = eObjeto(respostaProvedores.corpo)
    ? (respostaProvedores.corpo as { data?: unknown }).data
    : undefined;
  if (!eObjeto(corpoProv)) return { ok: false, motivo: "indisponivel" };
  const padrao = eObjeto(corpoProv.padrao)
    ? (corpoProv.padrao as { provider?: unknown; defaultModel?: unknown })
    : null;
  const credenciais = Array.isArray(corpoProv.credenciais) ? corpoProv.credenciais : null;
  if (padrao === null || credenciais === null) {
    return { ok: false, motivo: "indisponivel" };
  }
  if (typeof padrao.provider !== "string") return { ok: false, motivo: "indisponivel" };
  if (typeof padrao.defaultModel !== "string") {
    return {
      ok: false,
      motivo: "sem_modelo_padrao",
      detalhe: `PRECISO CONFIRMAR: falta definir o modelo padrão da empresa. Defina em ${LINK_DA_TELA_DE_PROVEDORES}.`,
    };
  }
  // A credencial tem de ser do MESMO provedor do padrão: uma chave de outro
  // provedor nasceria no rascunho e quebraria na hora de publicar.
  const credencial = (credenciais as Record<string, unknown>[]).find(
    (c) =>
      c.provider === padrao.provider &&
      c.validated_at !== null &&
      c.validated_at !== undefined &&
      c.is_active !== false &&
      typeof c.id === "string",
  );
  if (credencial === undefined || typeof credencial.id !== "string") {
    return {
      ok: false,
      motivo: "sem_credencial",
      detalhe: `PRECISO CONFIRMAR: falta a chave do provedor. Cadastre em ${LINK_DA_TELA_DE_CREDENCIAIS}.`,
    };
  }

  // tool_ids: união dos pacotes pelo catálogo com handler. Sem teto no
  // assistente — ele passa tudo; se a união estoura o teto da rota,
  // recusa fechada com a contagem, nunca corta sozinho.
  const catalogo = catalogoComHandler();
  let toolIds: string[] = [];
  for (const pacote of pacotesPedidos) {
    toolIds = ligarPacote(toolIds, catalogo, pacote);
  }
  if (excedeuTeto(toolIds)) {
    return {
      ok: false,
      motivo: "teto_de_ferramentas",
      detalhe: `${pacotesPedidos.join("+")}: ${toolIds.length} capacidades, teto 27. Peça menos pacotes.`,
    };
  }

  // Escopo: funil/material de fora da org (ou inativo) nem chega ao POST.
  if (funisPedidos.length > 0) {
    const funis = await lerLista(await handlerDeFunis(), "/api/v1/pipelines");
    if (funis === null) return { ok: false, motivo: "indisponivel" };
    const ids = new Set(funis.map((f) => f.id));
    if (!funisPedidos.every((id) => ids.has(id))) {
      return { ok: false, motivo: "escopo_invalido" };
    }
  }
  if (materiaisPedidos.length > 0) {
    const materiais = await lerLista(await handlerDeMateriais(), "/api/v1/ai/knowledge/sources");
    if (materiais === null) return { ok: false, motivo: "indisponivel" };
    const ids = new Set(materiais.map((m) => m.id));
    if (!materiaisPedidos.every((id) => ids.has(id))) {
      return { ok: false, motivo: "escopo_invalido" };
    }
  }

  const resposta = await chamarRotaPorDentro(await handlerDeCriacao(), "/api/v1/ai/agents", {}, {
    metodo: "POST",
    corpo: {
      name: nome,
      ...(descricao === undefined ? {} : { description: descricao }),
      priority: 0,
      version: {
        system_prompt: prompt,
        provider: padrao.provider,
        model: padrao.defaultModel,
        credential_id: credencial.id,
        channel_session_id: null,
        tool_ids: toolIds,
        pipeline_ids: funisPedidos,
        knowledge_source_ids: materiaisPedidos,
      },
    },
  });
  if (!("status" in resposta) || resposta.status !== 201) {
    return { ok: false, motivo: "indisponivel" };
  }
  const corpo = eObjeto(resposta.corpo) ? (resposta.corpo as { data?: unknown }).data : undefined;
  const agente = eObjeto(corpo) ? (corpo.agent as Record<string, unknown> | undefined) : undefined;
  const versao = eObjeto(corpo) ? (corpo.version as Record<string, unknown> | undefined) : undefined;
  if (!eObjeto(agente) || typeof agente.id !== "string" || typeof agente.name !== "string") {
    return { ok: false, motivo: "indisponivel" };
  }
  if (!eObjeto(versao) || versao.status !== "draft") {
    return { ok: false, motivo: "indisponivel" };
  }
  return {
    ok: true,
    agente: { id: agente.id, nome: agente.name, estado: "rascunho" },
  };
}

export function criarRascunhoDeAgente(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Cria um agente de IA como RASCUNHO (versão 1 draft, nada publicado, ninguém atende). " +
      "`nome` (obrigatório), `descricao` (opcional), `prompt` (o texto do atendente, obrigatório), " +
      "`pacotes` (quais jornadas ligar: atender, vender, reter, escalar, organizar, evoluir — " +
      "padrão só vender), `funis` e `materiais` (ids da organização, opcionais). " +
      "Provedor, modelo e chave vêm da configuração da empresa, e o resultado traz o botão " +
      "para abrir o agente. Publicar é sempre clique do administrador.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("criar_rascunho_de_agente", esquemaDeEntrada, async ({ nome, descricao, prompt, pacotes, funis, materiais }) => {
      void entrada;
      return criarAgenteRascunho({ nome, descricao, prompt, pacotes, funis, materiais });
    }),
  });
}
