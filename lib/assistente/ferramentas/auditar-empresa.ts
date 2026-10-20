/**
 * Ferramenta `auditar_empresa` — o retrato da configuração da organização (F3).
 *
 * Lê o último retrato em `GET /api/v1/ai/assistente/auditoria` POR DENTRO, com
 * a sessão da pessoa. Se o papel for `admin` e o último retrato tiver mais de
 * 1 h (ou não existir), roda um novo retrato via `POST` da mesma rota.
 * Devolve os itens para o modelo explicar à pessoa.
 *
 * É leitura: entra no catálogo do turno para TODOS os papéis. A gravação do
 * retrato só acontece se o papel for admin — a trava real continua na rota.
 * Nunca leva texto livre de itens para o audit log: a rota já audita com SÓ
 * `pendencias` e contagem por estado.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({});

let handlerGetSobreposto: HandlerDeRota | null = null;
let handlerPostSobreposto: HandlerDeRota | null = null;

/** Só para testes: troca os handlers reais por dublês. */
export function sobreporHandlersDeAuditoria(
  get: HandlerDeRota | null,
  post: HandlerDeRota | null,
): void {
  handlerGetSobreposto = get;
  handlerPostSobreposto = post;
}

async function handlerGetAtual(): Promise<HandlerDeRota> {
  if (handlerGetSobreposto) return handlerGetSobreposto;
  const modulo = await import("@/app/api/v1/ai/assistente/auditoria/route");
  return modulo.GET;
}

async function handlerPostAtual(): Promise<HandlerDeRota> {
  if (handlerPostSobreposto) return handlerPostSobreposto;
  const modulo = await import("@/app/api/v1/ai/assistente/auditoria/route");
  return modulo.POST;
}

/** Há quanto tempo (ms) o último retrato pode estar antes de rodar um novo. */
const MAX_IDADE_DO_RETRATO_MS = 60 * 60 * 1000; // 1 h

interface ItemDoRetrato {
  id: string;
  estado: string;
  titulo: string;
  por_que: string;
  ferramenta: string | null;
  depende_de: string[];
}

interface ResumoDoRetrato {
  itens: ItemDoRetrato[];
  pendencias: number;
}

/** Chama uma rota interna e devolve `{ status, corpo }` ou `{ falhou }`. */
async function chamadaInterna(
  resolver: () => Promise<HandlerDeRota>,
  caminho: string,
  metodo: "GET" | "POST" = "GET",
  corpo?: unknown,
): Promise<{ status: number; corpo: unknown } | { falhou: string }> {
  const handler = await resolver();
  return chamarRotaPorDentro(handler, caminho, {}, { metodo, corpo });
}

/** Extrai `data` de `{ data, meta }` ou `undefined`. */
function extrairDados(corpo: unknown): unknown {
  if (corpo === null || typeof corpo !== "object") return undefined;
  return (corpo as { data?: unknown }).data;
}

/** Lê o último retrato; se não houver ou for muito velho e for admin, roda novo. */
async function obterRetrato(
  papel: "viewer" | "manager" | "admin",
): Promise<{ retrato: ResumoDoRetrato | null; rodouNovo: boolean }> {
  const respGet = await chamadaInterna(handlerGetAtual, "/api/v1/ai/assistente/auditoria");
  if ("falhou" in respGet) return { retrato: null, rodouNovo: false };
  if (respGet.status !== 200) return { retrato: null, rodouNovo: false };

  const dados = extrairDados(respGet.corpo);
  if (!dados || !Array.isArray(dados)) return { retrato: null, rodouNovo: false };

  const retratos = dados as Array<{
    id: string;
    taken_at: string;
    pendencias: number;
    itens: unknown;
  }>;
  const ultimo = retratos[0];
  const agora = Date.now();
  const muitoVelho =
    !ultimo ||
    !ultimo.taken_at ||
    agora - new Date(ultimo.taken_at).getTime() > MAX_IDADE_DO_RETRATO_MS;

  if (!muitoVelho) {
    return {
      retrato: {
        itens: ultimo.itens as ItemDoRetrato[],
        pendencias: ultimo.pendencias,
      },
      rodouNovo: false,
    };
  }

  // Só admin roda um novo retrato.
  if (papel !== "admin") {
    return { retrato: null, rodouNovo: false };
  }

  const respPost = await chamadaInterna(handlerPostAtual, "/api/v1/ai/assistente/auditoria", "POST", {});
  if ("falhou" in respPost || respPost.status !== 201) {
    return { retrato: null, rodouNovo: false };
  }

  const dadosPost = extrairDados(respPost.corpo);
  if (!dadosPost || typeof dadosPost !== "object") return { retrato: null, rodouNovo: false };

  const snapshot = (dadosPost as { snapshot?: unknown }).snapshot;
  if (!snapshot || typeof snapshot !== "object") return { retrato: null, rodouNovo: false };

  return {
    retrato: {
      itens: (snapshot as { itens?: ItemDoRetrato[] }).itens ?? [],
      pendencias: (snapshot as { pendencias?: number }).pendencias ?? 0,
    },
    rodouNovo: true,
  };
}

export function criarAuditarEmpresa(entrada: EntradaDasFerramentas): Tool {
  const { ctx, coletor } = entrada;
  return tool({
    description:
      "Audita a configuração da empresa: diz o que está pronto, o que pode ser completado, " +
      "o que precisa de uma pessoa e o que não se aplica, com as dependências explícitas. " +
      "Use antes de sugerir qualquer criação, para saber o que já existe e o que falta.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("auditar_empresa", esquemaDeEntrada, async () => {
      void coletor;
      const papel = ctx.papel as "viewer" | "manager" | "admin";
      const { retrato, rodouNovo } = await obterRetrato(papel);

      if (!retrato) {
        return { ok: false as const, motivo: "indisponivel" as const };
      }

      const linhas = retrato.itens.map((i) => {
        const estado = i.estado;
        let trecho: string;
        switch (estado) {
          case "preenchido":
            trecho = `✅ ${i.titulo} — ${i.por_que}`;
            break;
          case "posso_completar":
            trecho = `⏳ ${i.titulo} — ${i.por_que} (pode propor via assistente)`;
            break;
          case "preciso_confirmar":
            trecho = `❓ ${i.titulo} — ${i.por_que}`;
            break;
          case "nao_se_aplica":
            trecho = `ℹ️ ${i.titulo} — ${i.por_que}`;
            break;
          default:
            trecho = `⚪ ${i.titulo} — ${i.por_que}`;
        }
        return trecho;
      });

      const resumo = rodouNovo
        ? `Novo retrato rodado: ${retrato.pendencias} pendência(ões).`
        : `Último retrato: ${retrato.pendencias} pendência(ões).`;

      return {
        ok: true as const,
        resumo,
        linhas,
        total_pendencias: retrato.pendencias,
      };
    }),
  });
}
