/**
 * O TIPO do pacote de nicho — dado estático, não regra de negócio.
 *
 * Este módulo é a TRANSCRIÇÃO de `.agents/skills/deskcomm-cliente-novo/references/nichos.md`
 * para dado tipado. Nada aqui é comportamento: nenhuma função de rede, nenhum
 * import de Supabase/Next, nenhum texto inventado. Preço, prazo, política e
 * horário continuam vindo da triagem do cliente — o pacote só dá o ponto de
 * partida, exatamente como o `.md` diz.
 *
 * Quem CONSOME este dado é a ferramenta `montar_pacote_do_nicho` (F2 T14b).
 */

import type { ToolBundle } from "@/lib/mcp/tools/pacotes";

/** Os slugs estáveis dos 7 nichos, na ordem em que aparecem no `.md`. */
export const IDS_DE_NICHO = [
  "clinica",
  "imobiliaria",
  "servicos",
  "infoproduto",
  "loja",
  "advocacia",
  "generico",
] as const;

export type IdDeNicho = (typeof IDS_DE_NICHO)[number];

/**
 * Como o cliente é chamado no nicho. `null` onde o `.md` não traz a palavra —
 * nunca inventamos uma.
 */
export interface VocabularioDoNicho {
  cliente: string | null;
  negocio: string | null;
  ganhou: string | null;
  perdeu: string | null;
}

export interface FunilDoNicho {
  /** O nome entre aspas no `.md` (ex.: "Agendamentos"). */
  nome: string;
  /** Os nomes das etapas, na ordem do `.md`. */
  etapas: string[];
}

export interface FollowupsDoNicho {
  /** Ids REAIS de `@/lib/followup/modelos`, quando o `.md` manda instalar pronto. */
  modelos: string[];
  /** As frases do `.md` sobre follow-up deste nicho, uma por item. */
  observacoes: string[];
}

export interface NichoDoAssistente {
  id: IdDeNicho;
  /** O título `## ` da seção no `.md` (ex.: "Clínica, consultório ou salão"). */
  nome: string;
  /** As expressões do título, separadas (ex.: ["clínica", "consultório", "salão"]). */
  chamadas: string[];
  funil: FunilDoNicho;
  vocabulario: VocabularioDoNicho;
  /**
   * O bloco de prompt EXATO do `.md` (conteúdo da cerca ```markdown, sem as
   * cercas). `null` quando o `.md` traz só prosa — nesse caso NÃO se redige um.
   */
  esqueleto: string | null;
  /** As capacidades do nicho. `[]` quando o `.md` não declara. */
  pacotes: ToolBundle[];
  followups: FollowupsDoNicho;
  faq: string[];
  memoria: string[];
  promessas: string[];
  teste: string[];
}
