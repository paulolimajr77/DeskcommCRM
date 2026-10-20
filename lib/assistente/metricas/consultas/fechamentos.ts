/**
 * Consulta de FECHAMENTOS por funil: negócios com `closed_at` dentro da
 * janela [de, até). Não existe rota para essa conta (a `metrics/funil`
 * mistura "criados OU encerrados"), então lê-se o banco com o client
 * autenticado da sessão.
 *
 * POR QUE CONTAGEM EXATA (`head: true`): o PostgREST corta a resposta em
 * `max_rows` (1000), calado. Somar a página lida sairia errado com cara de
 * certo; a contagem exata não retorna linhas e não é cortada.
 *
 * `organization_id` é filtrado EXPLICITAMENTE em toda leitura: a RLS é o
 * cinto, não o único filtro (doutrina do repositório). Qualquer erro de
 * leitura vira `{ ok: false }` — a mensagem do banco NUNCA sobe ao modelo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const LIMITE_DE_FUNIS = 40;

export interface JanelaDeBanco {
  deInstante: string;
  ateInstanteExclusivo: string;
}

export interface FechamentoPorFunil {
  funil: string;
  ganhos: number;
  perdidos: number;
  fechados: number;
  taxa_de_ganho: number | null;
}

export interface DadosDeFechamentos {
  funis: FechamentoPorFunil[];
  total: { ganhos: number; perdidos: number; fechados: number; taxa_de_ganho: number | null };
  funis_nao_lidos: number;
}

interface FunilDoBanco {
  id: string;
  name: string;
  position: number;
  is_archived: boolean;
}

function taxa(ganhos: number, fechados: number): number | null {
  return fechados > 0 ? Number((ganhos / fechados).toFixed(4)) : null;
}

async function contarFechamentos(
  db: SupabaseClient,
  orgId: string,
  funilId: string,
  status: "won" | "lost",
  janela: JanelaDeBanco,
): Promise<{ ok: true; quantidade: number } | { ok: false }> {
  const { count, error } = await db
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("pipeline_id", funilId)
    .eq("status", status)
    .gte("closed_at", janela.deInstante)
    .lt("closed_at", janela.ateInstanteExclusivo);
  if (error) return { ok: false };
  return { ok: true, quantidade: count ?? 0 };
}

export async function lerFechamentos(
  db: SupabaseClient,
  orgId: string,
  janela: JanelaDeBanco,
): Promise<{ ok: true; dados: DadosDeFechamentos } | { ok: false }> {
  const resposta = await db
    .from("crm_pipelines")
    .select("id, name, position, is_archived")
    .eq("organization_id", orgId)
    .order("position");
  if (resposta.error) return { ok: false };

  const todos = (resposta.data ?? []) as unknown as FunilDoBanco[];
  const lidos = todos.slice(0, LIMITE_DE_FUNIS);
  const funisNaoLidos = Math.max(0, todos.length - lidos.length);

  const funis: FechamentoPorFunil[] = [];
  for (const funil of lidos) {
    const [ganhos, perdidos] = await Promise.all([
      contarFechamentos(db, orgId, funil.id, "won", janela),
      contarFechamentos(db, orgId, funil.id, "lost", janela),
    ]);
    if (!ganhos.ok || !perdidos.ok) return { ok: false };
    const fechados = ganhos.quantidade + perdidos.quantidade;
    // Funil arquivado só aparece se teve fechamento no período.
    if (funil.is_archived && fechados === 0) continue;
    funis.push({
      funil: funil.name,
      ganhos: ganhos.quantidade,
      perdidos: perdidos.quantidade,
      fechados,
      taxa_de_ganho: taxa(ganhos.quantidade, fechados),
    });
  }
  // A ordem de `lidos` já é a da posição do funil (a consulta ordena); mantida.

  const ganhos = funis.reduce((s, f) => s + f.ganhos, 0);
  const perdidos = funis.reduce((s, f) => s + f.perdidos, 0);
  const fechados = ganhos + perdidos;
  return {
    ok: true,
    dados: {
      funis,
      total: { ganhos, perdidos, fechados, taxa_de_ganho: taxa(ganhos, fechados) },
      funis_nao_lidos: funisNaoLidos,
    },
  };
}
