/**
 * Ferramenta `propor_memoria` — PROPÕE criar uma entrada na memória da empresa
 * ou arquivar uma que já existe. Não aplica nada.
 *
 * Risco `seguro` (por tipo, no código). Só LÊ a memória (para conferir que a
 * entrada a arquivar é DESTA organização e está ativa, e para o "antes"); a
 * única escrita é o POST de propostas. O texto da memória é DADO, não instrução.
 * Reativar uma entrada arquivada não é proposta (a rota aceita, a ferramenta não).
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import {
  CAMINHOS,
  camposDeTexto,
  camposForaDaOperacao,
  comoLista,
  cortar,
  enviarProposta,
  eObjeto,
  FONTES,
  INDISPONIVEL,
  ler,
  parametroInvalido,
  precisoConfirmar,
  type ResultadoDaProposta,
} from "./proposta-comum";
import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({
  operacao: z.enum(["criar", "arquivar"]),
  ...camposDeTexto,
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(10_000).optional(),
  entry_id: z.string().uuid().optional(),
});
type EntradaDaMemoria = z.infer<typeof esquemaDeEntrada>;

const CAMPOS = ["title", "body", "entry_id"] as const;
const PERMITIDOS = { criar: ["title", "body"], arquivar: ["entry_id"] } as const;

async function proporMemoria(
  entrada: EntradaDasFerramentas,
  e: EntradaDaMemoria,
): Promise<ResultadoDaProposta> {
  const fora = camposForaDaOperacao(e, PERMITIDOS[e.operacao], CAMPOS);
  if (fora.length > 0) {
    return parametroInvalido(`Para "${e.operacao}" não valem os campos: ${fora.join(", ")}.`);
  }

  if (e.operacao === "criar") {
    if (e.title === undefined || e.body === undefined) {
      return parametroInvalido('Para "criar" são obrigatórios `title` e `body`.');
    }
    return enviarProposta(entrada, {
      kind: "memoria",
      resumo: e.resumo,
      motivo: e.motivo,
      antes: null,
      payload: { operacao: "criar", corpo: { title: e.title, body: e.body } },
    });
  }

  if (e.entry_id === undefined) return parametroInvalido('Para "arquivar" é obrigatório `entry_id`.');
  const leitura = await ler(await FONTES.memoria(), CAMINHOS.memoria);
  if (!leitura.ok) return INDISPONIVEL;
  const entradas = eObjeto(leitura.dados) ? comoLista(leitura.dados.entries) : null;
  if (entradas === null) return INDISPONIVEL;
  const alvo = entradas.find((linha) => linha.id === e.entry_id);
  if (alvo === undefined) {
    return precisoConfirmar("essa entrada de memória não aparece na memória desta organização.");
  }
  if (alvo.status !== "active") {
    return precisoConfirmar("essa entrada de memória já não está ativa — não há o que arquivar.");
  }
  return enviarProposta(entrada, {
    kind: "memoria",
    resumo: e.resumo,
    motivo: e.motivo,
    antes: { titulo: cortar(alvo.title, 200), texto: cortar(alvo.body, 2000), estado: "ativa" },
    payload: { operacao: "arquivar", entry_id: e.entry_id, corpo: { status: "archived" } },
  });
}

export function criarProporMemoria(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "PROPÕE uma mudança na memória da empresa. Não muda nada: grava uma proposta que o administrador aprova " +
      "na tela. `operacao`: `criar` (title + body — um fato curto que o atendimento deve lembrar) ou `arquivar` " +
      "(entry_id de uma entrada ativa). `resumo` é o título para a pessoa e `motivo` o porquê. " +
      "Diga sempre que PROPÔS, nunca que gravou.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("propor_memoria", esquemaDeEntrada, (e) => proporMemoria(entrada, e)),
  });
}
