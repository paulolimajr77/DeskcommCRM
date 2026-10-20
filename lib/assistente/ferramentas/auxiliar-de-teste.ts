/**
 * Peças compartilhadas pelos testes das ferramentas do assistente — nenhum
 * código de produção importa este arquivo.
 */
import type { ToolSet } from "ai";

import type { ContextoDeConsulta } from "@/lib/assistente/metricas";
import { criarBancoFalso, type BancoFalso, type LinhaDeTeste } from "@/lib/assistente/metricas/consultas/banco-falso";

import { criarColetorDoTurno, type ColetorDoTurno, type SkillDoAssistente, type TurnoDoChat } from "./tipos";
import { montarFerramentasDoAssistente } from "./index";

export const ORG = "11111111-2222-4333-8444-555555555555";
export const OUTRA_ORG = "22222222-3333-4444-8555-666666666666";
export const AGORA = "2026-10-14T09:00:00-03:00";

export function ctxDe(
  papel: ContextoDeConsulta["papel"],
  sessao: BancoFalso["client"],
  idioma: ContextoDeConsulta["idioma"] = "pt-BR",
): ContextoDeConsulta {
  return { orgId: ORG, papel, idioma, fuso: "America/Sao_Paulo", agoraIso: AGORA, bancoDosModulos: sessao };
}

/** Uma skill de teste com todos os campos que `loadSkills` devolve. */
export function skillDe(nome: string, corpo: string, descricao = `descrição de ${nome}`): SkillDoAssistente {
  return {
    versionId: "33333333-4444-4555-8666-777777777777",
    name: nome,
    description: descricao,
    body: corpo,
    matcher: { any_keywords: ["teste"] },
    manifest: [],
  };
}

export interface MontagemDeTeste {
  ferramentas: ToolSet;
  coletor: ColetorDoTurno;
  sessao: BancoFalso;
  ctx: ContextoDeConsulta;
}

/** O conjunto completo de ferramentas sobre um banco de sessão falso (tabelas opcionais). */
export function montarParaTeste(
  papel: ContextoDeConsulta["papel"],
  tabelas: Record<string, readonly LinhaDeTeste[]> = {},
  opcoes: {
    idioma?: ContextoDeConsulta["idioma"];
    skills?: SkillDoAssistente[];
    erroEm?: string;
    /** Tabelas do banco de SERVIÇO (`bancoDaInstalacao`): os interruptores de módulo. Omitido = o contexto não o tem. */
    instalacao?: Record<string, readonly LinhaDeTeste[]>;
    /** A conversa e o turno do chat (T19): as ferramentas `propor_*` os levam à rota de propostas. */
    turno?: TurnoDoChat;
  } = {},
): MontagemDeTeste {
  const sessao = criarBancoFalso(tabelas, opcoes.erroEm);
  const ctx: ContextoDeConsulta = {
    ...ctxDe(papel, sessao.client, opcoes.idioma),
    ...(opcoes.instalacao ? { bancoDaInstalacao: criarBancoFalso(opcoes.instalacao).client } : {}),
  };
  const coletor = criarColetorDoTurno();
  const ferramentas = montarFerramentasDoAssistente({
    ctx,
    skills: opcoes.skills ?? [],
    coletor,
    ...(opcoes.turno ? { turno: opcoes.turno } : {}),
  });
  return { ferramentas, coletor, sessao, ctx };
}

/** Chama o `execute` de uma ferramenta como o SDK chamaria, sem validar a entrada antes. */
export async function chamar<T = Record<string, unknown>>(
  ferramentas: ToolSet,
  nome: string,
  entrada: unknown,
): Promise<T> {
  const ferramenta = ferramentas[nome];
  if (!ferramenta?.execute) throw new Error(`ferramenta ${nome} sem execute`);
  const saida = await ferramenta.execute(entrada, { toolCallId: "teste", messages: [], context: undefined });
  return saida as T;
}
