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
import { traduzir } from "@/lib/i18n/dicionario";

/** Um botão "abrir tela" que o chat mostra; a pessoa decide clicar. `href` SEMPRE sai do catálogo de navegação. */
export interface AcaoDeTela {
  tipo: "abrir_tela";
  rotulo: string;
  href: string;
}

/**
 * Um cartão "criado como rascunho" que o chat mostra abaixo da resposta.
 * `href` é montado NO SERVIDOR a partir do id que a rota devolveu (nunca de
 * texto do modelo) e aponta para a tela de edição do recurso.
 */
export interface CartaoDeArtefato {
  tipo: "artefato";
  artefato: "agente" | "followup";
  nome: string;
  rotulo: string;
  href: string;
}

/** O botão existente continua exatamente como é; o cartão é o segundo tipo. */
export type AcaoDoChat = AcaoDeTela | CartaoDeArtefato;

/** Onde as ferramentas anotam o que aconteceu no turno (a rota lê no fim). */
export interface ColetorDoTurno {
  metricas: string[];
  acoes: AcaoDoChat[];
}

export function criarColetorDoTurno(): ColetorDoTurno {
  return { metricas: [], acoes: [] };
}

/** No máximo estes cartões por turno — junto do `MAXIMO_DE_ACOES_POR_TURNO` de `telas.ts`. */
export const MAXIMO_DE_CARTOES_POR_TURNO = 8;

/** O nome vem da rota; o rótulo do botão é fixo por tipo, no idioma da sessão. */
const ROTULO_DO_CARTAO = { agente: "Abrir o agente", followup: "Abrir o follow-up" } as const;

/**
 * Anota um cartão "criado como rascunho" no coletor. Só para o caminho de
 * sucesso (quem chama decide): mesmo `href` não entra duas vezes e, com 8
 * cartões, o 9º não entra — sempre em silêncio, sem lançar.
 */
export function anotarCartaoDeArtefato(
  coletor: ColetorDoTurno,
  idioma: ContextoDeConsulta["idioma"],
  cartao: { artefato: "agente" | "followup"; nome: string; href: string },
): void {
  if (coletor.acoes.some((acao) => acao.href === cartao.href)) return;
  const cartoes = coletor.acoes.filter((acao) => acao.tipo === "artefato").length;
  if (cartoes >= MAXIMO_DE_CARTOES_POR_TURNO) return;
  coletor.acoes.push({
    tipo: "artefato",
    artefato: cartao.artefato,
    nome: cartao.nome.slice(0, 120),
    rotulo: traduzir(ROTULO_DO_CARTAO[cartao.artefato], idioma),
    href: cartao.href,
  });
}

/** O que `loadSkills` devolve, já filtrado por quem chama (`name` começa com "assistente-"). */
export type SkillDoAssistente = Awaited<ReturnType<typeof loadSkills>>[number];

/** A conversa e o turno em andamento — só a rota do chat os conhece (ids dela, nunca do modelo). */
export interface TurnoDoChat {
  threadId: string;
  turnId: string;
}

export interface EntradaDasFerramentas {
  ctx: ContextoDeConsulta;
  skills: SkillDoAssistente[];
  coletor: ColetorDoTurno;
  /**
   * Opcional: a conversa e o turno do chat. As ferramentas `propor_*` os levam à
   * rota de propostas, que por eles não duplica a proposta num reenvio do mesmo
   * turno. Ausente (teste, outro chamador), a proposta nasce sem vínculo.
   */
  turno?: TurnoDoChat;
}

/** O que uma ferramenta devolve quando não pôde trabalhar — sem a mensagem do erro. */
export type FalhaDeFerramenta =
  | { ok: false; motivo: "indisponivel" }
  | { ok: false; motivo: "parametro_invalido" };
