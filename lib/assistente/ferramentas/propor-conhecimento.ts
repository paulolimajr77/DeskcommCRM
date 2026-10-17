/**
 * Ferramenta `propor_conhecimento` — PROPÕE cadastrar uma fonte de conhecimento
 * ESCRITA NA CONVERSA: perguntas e respostas (`faq`) ou um texto (`documento`).
 * Upload, URL e site ficam de fora (moram em outras rotas e outros riscos).
 *
 * Risco `seguro` (por tipo, no código). Só LÊ (agentes e materiais, para conferir
 * o `agent_id` e o nome); a única escrita é o POST de propostas. O texto que a
 * pessoa quer guardar é DADO — vai para a proposta, nunca é obedecido.
 *
 * Limites da T19: texto ≤ 20.000 caracteres, até 50 perguntas.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import {
  LIMITE_DE_ITENS_DE_FAQ,
  LIMITE_DO_TEXTO_DE_CONHECIMENTO,
} from "@/lib/assistente/propostas/payload";

import {
  CAMINHOS,
  camposDeTexto,
  camposForaDaOperacao,
  comoLista,
  conferirAgentes,
  enviarProposta,
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
  source_type: z.enum(["faq", "documento"]),
  ...camposDeTexto,
  name: z.string().trim().min(2).max(120),
  items: z
    .array(
      z.strictObject({
        question: z.string().trim().min(1).max(500),
        answer: z.string().trim().min(1).max(4000),
        locale: z.enum(["pt-BR", "es"]).optional(),
      }),
    )
    .min(1)
    .max(LIMITE_DE_ITENS_DE_FAQ)
    .optional(),
  markdown_blob: z.string().trim().min(1).max(LIMITE_DO_TEXTO_DE_CONHECIMENTO).optional(),
  agent_id: z.string().uuid().optional(),
});
type EntradaDoConhecimento = z.infer<typeof esquemaDeEntrada>;

const CAMPOS_DE_CONTEUDO = ["items", "markdown_blob"] as const;

async function proporConhecimento(
  entrada: EntradaDasFerramentas,
  e: EntradaDoConhecimento,
): Promise<ResultadoDaProposta> {
  const certo = e.source_type === "faq" ? "items" : "markdown_blob";
  const fora = camposForaDaOperacao(e, [certo], CAMPOS_DE_CONTEUDO);
  if (fora.length > 0) {
    return parametroInvalido(`Para "${e.source_type}" não vale o campo: ${fora.join(", ")}. Use \`${certo}\`.`);
  }
  if (e[certo] === undefined) {
    return parametroInvalido(`Para "${e.source_type}" é obrigatório \`${certo}\`.`);
  }

  if (e.agent_id !== undefined) {
    const agentes = await conferirAgentes([e.agent_id]);
    if (agentes !== null) return agentes;
  }

  // Dois materiais ativos não podem ter o mesmo nome (a rota responderia 409 na aplicação).
  const materiais = await ler(await FONTES.conhecimento(), CAMINHOS.conhecimento);
  if (!materiais.ok) return INDISPONIVEL;
  const lista = comoLista(materiais.dados);
  if (lista === null) return INDISPONIVEL;
  const nome = e.name.toLowerCase();
  if (lista.some((m) => m.is_active !== false && typeof m.name === "string" && m.name.trim().toLowerCase() === nome)) {
    return precisoConfirmar(
      `já existe um material com o nome "${e.name}". Escolha outro nome ou confirme com a pessoa.`,
    );
  }

  const corpo =
    e.source_type === "faq"
      ? { source_type: "faq", name: e.name, items: e.items, ...(e.agent_id ? { agent_id: e.agent_id } : {}) }
      : {
          source_type: "documento",
          name: e.name,
          markdown_blob: e.markdown_blob,
          ...(e.agent_id ? { agent_id: e.agent_id } : {}),
        };
  return enviarProposta(entrada, {
    kind: "conhecimento",
    resumo: e.resumo,
    motivo: e.motivo,
    antes: null,
    payload: { operacao: "criar", corpo },
  });
}

export function criarProporConhecimento(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "PROPÕE cadastrar uma fonte de conhecimento escrita na conversa. Não muda nada: grava uma proposta que o " +
      "administrador aprova na tela. `source_type`: `faq` (`items`: até 50 pares question/answer) ou `documento` " +
      "(`markdown_blob`: texto de até 20.000 caracteres). `name` é o nome do material; `agent_id` é opcional " +
      "(só histórico). Upload, link e site NÃO são possíveis aqui. `resumo` é o título para a pessoa e `motivo` o " +
      "porquê. Diga sempre que PROPÔS, nunca que cadastrou.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("propor_conhecimento", esquemaDeEntrada, (e) => proporConhecimento(entrada, e)),
  });
}
