/**
 * O ÚNICO leitor de `config_proposals` para o Painel de Evolução (F4 do assistente
 * interno — o laço de retorno).
 *
 * A rota de evolução busca, `aggregate.ts` raciocina. Este arquivo é a parte de
 * "buscar" desta fonte e mora fora da rota de propósito: assim a cerca
 * `tests/unit/laco-de-retorno-config-tem-um-leitor-so.test.ts` consegue dizer que
 * a rota NÃO lê a tabela por conta própria, e que quem lê filtra a organização.
 *
 * Só as colunas que contam estado — nunca `payload`, `antes`, `motivo` nem
 * `decision_reason`, que podem carregar prompt, texto de conhecimento e memória
 * (é por isso que a RLS da tabela só deixa o `admin` ler).
 *
 * Roda com o client de SESSÃO: a RLS vale por baixo do filtro explícito de
 * `organization_id`, que é defesa em profundidade e a convenção do repo.
 */
import type { createClient } from "@/lib/supabase/server";
import type { PropostaDeConfigLinha } from "@/lib/ai/evolution/aggregate";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Propostas são poucas (nascem de pedido humano ao chat); o teto só protege. */
export const TETO_DE_PROPOSTAS = 5_000;

export type LeituraDePropostas =
  | { ok: true; rows: PropostaDeConfigLinha[]; truncado: boolean }
  | { ok: false; erro: string };

/**
 * Propostas CRIADAS na janela da organização. A janela é por `created_at` (coorte):
 * "das propostas que o assistente fez neste período, quantas foram aprovadas,
 * aplicadas, rejeitadas". Contar por data de decisão misturaria propostas de
 * períodos diferentes no mesmo percentual.
 */
export async function lerPropostasDeConfig(
  supabase: Supabase,
  orgId: string,
  fromIso: string,
  toIso: string,
): Promise<LeituraDePropostas> {
  const { data, error } = await supabase
    .from("config_proposals")
    .select("kind, status, decided_at, applied_at")
    .eq("organization_id", orgId)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: true })
    .limit(TETO_DE_PROPOSTAS);
  if (error) return { ok: false, erro: error.message };
  const rows = (data ?? []) as PropostaDeConfigLinha[];
  return { ok: true, rows, truncado: rows.length === TETO_DE_PROPOSTAS };
}
