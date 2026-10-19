// @vitest-environment node
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro } from "@/lib/assistente/metricas/chamar-rota";
import { abrirPorta } from "@/lib/assistente/portas/abrir";
import { LIMITE_DA_LEITURA_EM_BYTES } from "./ler-porta-limite";
import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({
  porta: z.string().min(1).max(200),
  valores: z.record(z.string(), z.string().min(1).max(64)).optional(),
  filtros: z.record(z.string(), z.string().min(1).max(200)).optional(),
});
type EntradaDeLerPorta = z.infer<typeof esquemaDeEntrada>;

const CHAVE_DE_FILTRO = /^[a-z_]{1,40}$/;

function montarCaminhoComQuery(caminho: string, filtros?: Record<string, string>): string {
  if (!filtros || Object.keys(filtros).length === 0) return caminho;
  const url = new URL(caminho, "http://interno.invalid");
  for (const [chave, valor] of Object.entries(filtros)) {
    if (!CHAVE_DE_FILTRO.test(chave)) continue;
    url.searchParams.set(chave, valor);
  }
  return url.pathname + url.search;
}

async function lerPorta(
  entrada: EntradaDasFerramentas,
  e: EntradaDeLerPorta,
): Promise<{ dados: unknown; cortado: boolean } | { ok: false; motivo: "porta_proibida" }> {
  const aberto = await abrirPorta(e.porta, "GET", e.valores ?? {});
  if (!aberto) return { ok: false, motivo: "porta_proibida" };

  const caminhoComQuery = montarCaminhoComQuery(aberto.caminho, e.filtros);
  const resposta = await chamarRotaPorDentro(aberto.handler, caminhoComQuery, {});
  if (!("status" in resposta) || resposta.status !== 200) {
    return { ok: false, motivo: "porta_proibida" };
  }

  const corpo = resposta.corpo as { data?: unknown; meta?: unknown } | null | undefined;
  let dados: unknown = corpo?.data ?? null;
  let cortado = false;

  const serializado = JSON.stringify(dados ?? {});
  if (serializado.length > LIMITE_DA_LEITURA_EM_BYTES) {
    dados = serializado.slice(0, LIMITE_DA_LEITURA_EM_BYTES);
    cortado = true;
  }

  return { dados, cortado };
}

export function criarLerPorta(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Lê uma porta de leitura do catálogo (só GET). Passe o id da porta (ex.: `ai/agents`) " +
      "e, opcionalmente, `valores` para preencher parâmetros de caminho (ex.: `{id: \"abc\"}`) " +
      "e `filtros` para adicionar parâmetros de query. Devolve o campo `data` da resposta " +
      "e `cortado: true` se o conteúdo foi truncado ao limite de 24 KB. Recusa portas " +
      "proibidas, inexistentes ou sem GET.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("ler_porta", esquemaDeEntrada, (e) => lerPorta(entrada, e)),
  });
}
