/**
 * Ferramenta `ler_configuracao_de_ia` — o que a organização tem de IA, sem segredo.
 *
 * Lê `GET /api/v1/ai/providers` (padrão da organização + credenciais) e
 * `GET /api/v1/ai/agents` (para dizer se há agente publicado) POR DENTRO, com
 * a sessão da pessoa — a mesma chamada da F1b. Projeção por LISTA POSITIVA:
 * de cada credencial saem SÓ `id`, `provider`, `label` e se está validada e
 * ativa; nunca `api_key_last4`, chave, URL base ou qualquer campo novo que a
 * rota passe a devolver. Do agente publicado saem SÓ `id` e `nome`.
 *
 * Leitura pura, só para `manager`/`admin` (a montagem barra os outros papéis).
 * Rota fora do 200 ou corpo fora do formato: `indisponivel`, sem detalhe.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({});

let handlerDeProvedoresSobreposto: HandlerDeRota | null = null;
let handlerDeAgentesSobreposto: HandlerDeRota | null = null;

/** Só para testes: troca os handlers reais (que exigiriam sessão) por dublês. */
export function sobreporFontesDeConfiguracao(
  provedores: HandlerDeRota | null,
  agentes: HandlerDeRota | null,
): void {
  handlerDeProvedoresSobreposto = provedores;
  handlerDeAgentesSobreposto = agentes;
}

async function handlerDeProvedoresAtual(): Promise<HandlerDeRota> {
  if (handlerDeProvedoresSobreposto) return handlerDeProvedoresSobreposto;
  const modulo = await import("@/app/api/v1/ai/providers/route");
  return modulo.GET;
}

async function handlerDeAgentesAtual(): Promise<HandlerDeRota> {
  if (handlerDeAgentesSobreposto) return handlerDeAgentesSobreposto;
  const modulo = await import("@/app/api/v1/ai/agents/route");
  return modulo.GET;
}

interface CredencialDaRota {
  id: unknown;
  provider: unknown;
  label: unknown;
  validated_at: unknown;
  is_active: unknown;
}

interface AgenteDaRota {
  id: unknown;
  name: unknown;
  published_version_id: unknown;
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object";
}

export function criarLerConfiguracaoDeIa(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Lê a configuração de IA da organização: o provedor e o modelo padrão, as chaves " +
      "cadastradas (só id, nome e se está validada e ativa) e se há um agente publicado " +
      "(id e nome). Use antes de sugerir qualquer criação, para saber o que já existe.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("ler_configuracao_de_ia", esquemaDeEntrada, async () => {
      void entrada;
      const respostaProvedores = await chamarRotaPorDentro(
        await handlerDeProvedoresAtual(),
        "/api/v1/ai/providers",
        {},
      );
      if (!("status" in respostaProvedores) || respostaProvedores.status !== 200) {
        return { ok: false as const, motivo: "indisponivel" as const };
      }
      const corpoProv = eObjeto(respostaProvedores.corpo)
        ? (respostaProvedores.corpo as { data?: unknown }).data
        : undefined;
      if (!eObjeto(corpoProv)) return { ok: false as const, motivo: "indisponivel" as const };
      const padrao = eObjeto(corpoProv.padrao)
        ? (corpoProv.padrao as { provider?: unknown; defaultModel?: unknown })
        : null;
      const credenciaisBrutas = Array.isArray(corpoProv.credenciais) ? corpoProv.credenciais : null;
      if (padrao === null || credenciaisBrutas === null) {
        return { ok: false as const, motivo: "indisponivel" as const };
      }

      const respostaAgentes = await chamarRotaPorDentro(
        await handlerDeAgentesAtual(),
        "/api/v1/ai/agents",
        {},
      );
      if (!("status" in respostaAgentes) || respostaAgentes.status !== 200) {
        return { ok: false as const, motivo: "indisponivel" as const };
      }
      const corpoAg = eObjeto(respostaAgentes.corpo)
        ? (respostaAgentes.corpo as { data?: unknown }).data
        : undefined;
      if (!Array.isArray(corpoAg)) return { ok: false as const, motivo: "indisponivel" as const };

      const credenciais = (credenciaisBrutas as unknown[]).flatMap((item) => {
        const cred = item as CredencialDaRota;
        if (typeof cred.id !== "string" || typeof cred.provider !== "string" || typeof cred.label !== "string") {
          return [];
        }
        return [
          {
            id: cred.id,
            provedor: cred.provider,
            nome: cred.label,
            validada: cred.validated_at !== null && cred.validated_at !== undefined,
            ativa: cred.is_active !== false,
          },
        ];
      });

      const publicado = (corpoAg as AgenteDaRota[]).find(
        (agente) => agente.published_version_id !== null && agente.published_version_id !== undefined,
      );
      const agente_publicado =
        publicado && typeof publicado.id === "string" && typeof publicado.name === "string"
          ? { id: publicado.id, nome: publicado.name }
          : null;

      return {
        ok: true as const,
        provedor_padrao: typeof padrao.provider === "string" ? padrao.provider : null,
        modelo_padrao: typeof padrao.defaultModel === "string" ? padrao.defaultModel : null,
        credenciais,
        agente_publicado,
      };
    }),
  });
}
