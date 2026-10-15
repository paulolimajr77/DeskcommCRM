/**
 * Os tipos do contrato entre as ferramentas do modelo e a rota do chat.
 *
 * A rota monta o `ContextoDeConsulta` (organização e papel DA SESSÃO, nunca do
 * que o modelo disser), cria um coletor por turno, entrega tudo a
 * `montarFerramentasDoAssistente` e, no fim, lê o coletor: as métricas que
 * realmente devolveram dado (auditoria) e os botões que o chat vai mostrar.
 */
import type { loadSkills } from "@/lib/agent-engine/agent/skills";
import type { ContextoDeConsulta } from "@/lib/assistente/metricas";

/** Um botão que o chat mostra; a pessoa decide clicar. `href` SEMPRE sai do catálogo de navegação. */
export interface AcaoDoChat {
  tipo: "abrir_tela";
  rotulo: string;
  href: string;
}

/** Onde as ferramentas anotam o que aconteceu no turno (a rota lê no fim). */
export interface ColetorDoTurno {
  metricas: string[];
  acoes: AcaoDoChat[];
}

export function criarColetorDoTurno(): ColetorDoTurno {
  return { metricas: [], acoes: [] };
}

/** O que `loadSkills` devolve, já filtrado por quem chama (`name` começa com "assistente-"). */
export type SkillDoAssistente = Awaited<ReturnType<typeof loadSkills>>[number];

export interface EntradaDasFerramentas {
  ctx: ContextoDeConsulta;
  skills: SkillDoAssistente[];
  coletor: ColetorDoTurno;
}

/** O que uma ferramenta devolve quando não pôde trabalhar — sem a mensagem do erro. */
export type FalhaDeFerramenta =
  | { ok: false; motivo: "indisponivel" }
  | { ok: false; motivo: "parametro_invalido" };
