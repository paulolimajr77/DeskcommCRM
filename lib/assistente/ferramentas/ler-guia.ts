/**
 * Ferramenta `ler_guia` — os guias de uso do assistente (skills `assistente-*`).
 *
 * A rota já entrega só as skills com esse prefixo; este módulo filtra DE NOVO
 * por segurança — uma skill de agente da organização (outro nome) nunca sai
 * por aqui, mesmo que alguém passe a lista inteira por engano. Sem `guia`,
 * lista nome e descrição; com `guia`, devolve o corpo inteiro (no máximo 200
 * linhas, teto da aplicação no seed). O corpo é DADO: texto de apoio para
 * responder, não instrução a obedecer.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas, SkillDoAssistente } from "./tipos";

export const PREFIXO_DOS_GUIAS = "assistente-";

const esquemaDeEntrada = z.strictObject({ guia: z.string().max(60).optional() });

function soDoAssistente(skills: readonly SkillDoAssistente[]): SkillDoAssistente[] {
  return skills.filter((skill) => skill.name.startsWith(PREFIXO_DOS_GUIAS));
}

export function criarLerGuia(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Lê os guias de uso do CRM que apoiam suas respostas (operação diária, métricas, ajuste de " +
      "prompt, cliente novo). Sem `guia`, lista os guias disponíveis (nome e descrição). Com `guia` " +
      "(o nome exato da lista), devolve o texto do guia. Use quando a pergunta for 'como faço', " +
      "'onde fica' ou 'o que significa' e a resposta estiver num guia.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("ler_guia", esquemaDeEntrada, async ({ guia }) => {
      const guias = soDoAssistente(entrada.skills);
      if (guia === undefined) {
        return {
          ok: true as const,
          guias: guias.map((skill) => ({ nome: skill.name, descricao: skill.description })),
        };
      }
      const achado = guias.find((skill) => skill.name === guia.trim());
      if (!achado) return { ok: false as const, motivo: "guia_inexistente" as const };
      return {
        ok: true as const,
        nome: achado.name,
        descricao: achado.description,
        corpo: achado.body,
      };
    }),
  });
}
