// lib/propostas/modelos/importar.ts
import { tool, type ModelMessage } from "ai";
import type pg from "pg";
import { z } from "zod";

import type { LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/credentials";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";
import { ROTULO_DA_VARIAVEL } from "../documento/rotulos-das-variaveis";
import type { SecaoDoModelo } from "./tipos";

const TEXTO_MAXIMO = 30_000;

const respostaShape = {
  nome: z.string().min(1).max(200),
  secoes: z
    .array(
      z.object({
        id: z.string().max(60),
        title: z.string().max(200),
        body: z.string().max(20000),
        required: z.boolean(),
        conditional: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
};

function idNormalizado(bruto: string, usados: Set<string>): string {
  const base =
    bruto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([0-9])/, "s_$1")
      .slice(0, 36) || "secao";
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}_${n}`;
  usados.add(id);
  return id;
}

function sistema(): string {
  const vocabulario = Object.entries(ROTULO_DA_VARIAVEL)
    .map(([caminho, rotulo]) => `{{${caminho}}} = ${rotulo}`)
    .join("; ");
  return (
    "Você transforma a proposta comercial que uma empresa já usa num MODELO reutilizável, " +
    "chamando a ferramenta propor_modelo. Divida o texto em seções na ordem em que aparecem, " +
    "mantendo a redação da empresa. Troque todo dado de UM cliente específico (nome de pessoa ou " +
    "empresa, valores, datas, prazos, endereços, quantidades) por variáveis {{caminho}}. Use primeiro " +
    `este vocabulário: ${vocabulario}. ` +
    "Valor total → {{investment.total_formatted}}; prazo → {{schedule.estimated_days}}; validade → " +
    "{{commercial_terms.validity_days}}. Se precisar de uma variável fora do vocabulário, use " +
    "{{scope.nome_em_snake_case}}. Nunca invente conteúdo que não está no texto. Seções que só " +
    "valem para alguns clientes: conditional=true e required=false. O nome do modelo descreve o tipo " +
    "de proposta (ex.: 'Portal imobiliário'), nunca o nome do cliente."
  );
}

export async function gerarModeloDoTexto(input: {
  texto: string;
  pool: pg.Pool;
  cfg: LlmEdgeConfig;
  tenantId: string;
}): Promise<{ nome: string; sections: SecaoDoModelo[]; sectionOrder: string[] } | null> {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content:
        `Texto da proposta da empresa:\n\n${input.texto.slice(0, TEXTO_MAXIMO)}\n\n` +
        "Chame a ferramenta propor_modelo SEMPRE, com o modelo inteiro.",
    },
  ];
  const { result } = await runModelCall(input.pool, input.cfg, {
    tenantId: input.tenantId,
    purpose: "proposal_template_import",
    system: sistema(),
    messages,
    tools: {
      propor_modelo: tool({ inputSchema: z.object(respostaShape), execute: async (args) => args }),
    },
  });

  const chamada = result.toolCalls?.find((c: { toolName: string }) => c.toolName === "propor_modelo");
  if (!chamada) return null;
  const parsed = z.object(respostaShape).safeParse((chamada as { input: unknown }).input);
  if (!parsed.success) return null;

  const usados = new Set<string>();
  const sections: SecaoDoModelo[] = parsed.data.secoes.map((s) => ({
    id: idNormalizado(s.id || s.title, usados),
    title: s.title.trim() || "Seção",
    titleEs: null,
    body: s.body,
    bodyEs: null,
    required: s.required,
    conditional: s.conditional,
  }));
  return { nome: parsed.data.nome.trim(), sections, sectionOrder: sections.map((s) => s.id) };
}
