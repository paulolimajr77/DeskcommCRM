/**
 * Limites de perguntas do assistente interno, definidos pelo administrador no
 * cartão Orçamento (colunas de `ai_budgets`, migration 9004).
 *
 * ═══ POR QUE O CLIENTE DE SERVIÇO ═══
 *
 * `config_messages` só é escrita pelo service role e sua leitura é por RLS de
 * organização + papel; a contagem aqui é de TODAS as pessoas da organização
 * (para o limite da organização), o que a sessão de uma pessoa comum não vê.
 * Por isso o cliente é o de serviço e TODA consulta carrega
 * `.eq("organization_id", orgId)`, com `orgId` e `userId` vindos da sessão —
 * quem chama é a rota do chat (T7), nunca o corpo da requisição.
 *
 * ═══ QUANDO A ROTA DO CHAT CHAMA ═══
 *
 * DEPOIS de detectar a repetição do mesmo `turn_id` (a repetição não conta nem
 * é cobrada) e ANTES de gravar a pergunta nova. Assim a contagem é das perguntas
 * anteriores e "no limite" significa "já fez todas as que podia".
 *
 * ═══ QUANDO A CONTAGEM FALHA ═══
 *
 * Erro ao contar: registra e DEIXA PASSAR. O limite de perguntas é uma proteção
 * a mais, e quem barra o gasto de verdade é o teto em dinheiro do mesmo cartão,
 * aplicado por `runModelCall`. Travar todo o chat por um soluço do banco seria
 * pior que deixar passar uma pergunta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";
import { logger } from "@/lib/logger";

import { JANELA_DO_LIMITE_HORAS, PERGUNTAS_POR_PESSOA_PADRAO } from "./limites-padrao";

export {
  JANELA_DO_LIMITE_HORAS,
  MAXIMO_POR_ORGANIZACAO,
  MAXIMO_POR_PESSOA,
  PERGUNTAS_POR_PESSOA_PADRAO,
} from "./limites-padrao";

export interface LimitesDoAssistente {
  por_pessoa: number;
  /** `null` = a organização não definiu limite próprio (vale só o teto em dinheiro). */
  por_organizacao: number | null;
}

const MENSAGEM_DA_PESSOA =
  "Você chegou ao limite de perguntas de hoje. Peça a um administrador para ajustar em Uso de IA › Orçamento.";
const MENSAGEM_DA_ORGANIZACAO =
  "A organização chegou ao limite de perguntas de hoje. Peça a um administrador para ajustar em Uso de IA › Orçamento.";

export type VereditoDeLimite =
  | { ok: true }
  | { ok: false; escopo: "pessoa" | "organizacao"; limite: number; mensagem: string };

const PADROES: LimitesDoAssistente = { por_pessoa: PERGUNTAS_POR_PESSOA_PADRAO, por_organizacao: null };

/** Sem linha em `ai_budgets`, ou erro de leitura: valem os padrões do código. */
export async function lerLimitesDoAssistente(admin: SupabaseClient, orgId: string): Promise<LimitesDoAssistente> {
  const { data, error } = await admin
    .from("ai_budgets")
    .select("assistant_questions_per_user_day, assistant_questions_per_org_day")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    logger.warn("assistente.limites.leitura_falhou", { organization_id: orgId, causa: error.message });
    return PADROES;
  }
  if (!data) return PADROES;

  const porPessoa = data.assistant_questions_per_user_day;
  const porOrganizacao = data.assistant_questions_per_org_day;
  return {
    por_pessoa: typeof porPessoa === "number" ? porPessoa : PERGUNTAS_POR_PESSOA_PADRAO,
    // `Number(null)` seria 0, que NÃO é "sem limite": só número de verdade conta.
    por_organizacao: typeof porOrganizacao === "number" ? porOrganizacao : null,
  };
}

/** Quantas perguntas humanas, desde `desde`, a organização (ou só a pessoa) fez. `null` = não deu para contar. */
async function contarPerguntas(
  admin: SupabaseClient,
  orgId: string,
  desde: string,
  userId: string | null,
): Promise<number | null> {
  let consulta = admin
    .from("config_messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("author_kind", "human");
  if (userId !== null) consulta = consulta.eq("author_user_id", userId);

  const { count, error } = await consulta.gte("created_at", desde);
  if (error) {
    logger.warn("assistente.limites.contagem_falhou", {
      organization_id: orgId,
      escopo: userId === null ? "organizacao" : "pessoa",
      causa: error.message,
    });
    return null;
  }
  return count ?? 0;
}

/**
 * A pessoa (e depois a organização) já fez todas as perguntas que podia nas
 * últimas 24 horas? Bloqueia quando a contagem ALCANÇA o limite. Pessoa primeiro;
 * se as duas estouraram, o escopo devolvido é `pessoa`.
 */
export async function verificarLimiteDePerguntas(
  admin: SupabaseClient,
  opcoes: { orgId: string; userId: string; idioma: Idioma; agora?: Date },
): Promise<VereditoDeLimite> {
  const agora = opcoes.agora ?? new Date();
  const desde = new Date(agora.getTime() - JANELA_DO_LIMITE_HORAS * 60 * 60 * 1000).toISOString();
  const limites = await lerLimitesDoAssistente(admin, opcoes.orgId);

  const daPessoa = await contarPerguntas(admin, opcoes.orgId, desde, opcoes.userId);
  if (daPessoa !== null && daPessoa >= limites.por_pessoa) {
    return {
      ok: false,
      escopo: "pessoa",
      limite: limites.por_pessoa,
      mensagem: traduzir(MENSAGEM_DA_PESSOA, opcoes.idioma),
    };
  }

  if (limites.por_organizacao !== null) {
    const daOrganizacao = await contarPerguntas(admin, opcoes.orgId, desde, null);
    if (daOrganizacao !== null && daOrganizacao >= limites.por_organizacao) {
      return {
        ok: false,
        escopo: "organizacao",
        limite: limites.por_organizacao,
        mensagem: traduzir(MENSAGEM_DA_ORGANIZACAO, opcoes.idioma),
      };
    }
  }

  return { ok: true };
}
