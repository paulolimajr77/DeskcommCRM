/**
 * Consulta de LEADS POR ORIGEM: negócios CRIADOS na janela [de, até) com a
 * situação ATUAL de cada um. Lê `crm_leads` em páginas de 1000 (o teto de
 * `max_rows` do PostgREST), no máximo 5 páginas — `truncado` quando o
 * `count` exato é maior que o lido. A 1ª página pede `count: "exact"` para
 * o total ser verdadeiro mesmo cortado.
 *
 * Agrupamento em `Map`, NUNCA em objeto: a origem é texto de integração e
 * pode ser `__proto__`. `organization_id` é filtro explícito em toda
 * leitura. Qualquer erro vira `{ ok: false }` — a mensagem do banco NUNCA
 * sobe ao modelo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { JanelaDeBanco } from "./fechamentos";

export const TAMANHO_DA_PAGINA = 1000;
export const PAGINAS_MAXIMAS = 5;
export const LIMITE_DE_LINHAS = 30;
export const SEM_ORIGEM = "sem origem";

export interface OrigemDeLeads {
  origem: string;
  criados: number;
  ganhos: number;
  perdidos: number;
  abertos: number;
  taxa_de_ganho: number | null;
}

export interface DadosDeLeadsPorOrigem {
  total_criados: number;
  origens: OrigemDeLeads[];
  outras_origens: { origens: number; criados: number };
  truncado: boolean;
}

interface LeadDoBanco {
  source: string | null;
  status: string | null;
}

interface Acumulado {
  criados: number;
  ganhos: number;
  perdidos: number;
  abertos: number;
}

function chaveDaOrigem(source: string | null): string {
  const aparada = (source ?? "").trim().toLowerCase();
  const cortada = aparada.slice(0, 60);
  return cortada.length === 0 ? SEM_ORIGEM : cortada;
}

export async function lerLeadsPorOrigem(
  db: SupabaseClient,
  orgId: string,
  janela: JanelaDeBanco,
): Promise<{ ok: true; dados: DadosDeLeadsPorOrigem } | { ok: false }> {
  const lidos: LeadDoBanco[] = [];
  let totalExato: number | null = null;

  for (let pagina = 0; pagina < PAGINAS_MAXIMAS; pagina += 1) {
    const consulta = db
      .from("crm_leads")
      .select("source, status", pagina === 0 ? { count: "exact" } : undefined)
      .eq("organization_id", orgId)
      .gte("created_at", janela.deInstante)
      .lt("created_at", janela.ateInstanteExclusivo)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    const { data, count, error } = await consulta.range(
      pagina * TAMANHO_DA_PAGINA,
      (pagina + 1) * TAMANHO_DA_PAGINA - 1,
    );
    if (error) return { ok: false };
    if (count !== null && count !== undefined) totalExato = count;
    lidos.push(...((data ?? []) as unknown as LeadDoBanco[]));
    if ((data ?? []).length < TAMANHO_DA_PAGINA) break;
  }

  const mapa = new Map<string, Acumulado>();
  for (const lead of lidos) {
    const chave = chaveDaOrigem(lead.source);
    const atual = mapa.get(chave) ?? { criados: 0, ganhos: 0, perdidos: 0, abertos: 0 };
    atual.criados += 1;
    if (lead.status === "won") atual.ganhos += 1;
    else if (lead.status === "lost") atual.perdidos += 1;
    else atual.abertos += 1;
    mapa.set(chave, atual);
  }

  const ordenadas = [...mapa.entries()]
    .map(([origem, acc]): OrigemDeLeads => {
      const fechados = acc.ganhos + acc.perdidos;
      return {
        origem,
        criados: acc.criados,
        ganhos: acc.ganhos,
        perdidos: acc.perdidos,
        abertos: acc.abertos,
        taxa_de_ganho: fechados > 0 ? Number((acc.ganhos / fechados).toFixed(4)) : null,
      };
    })
    .sort((a, b) => b.criados - a.criados || a.origem.localeCompare(b.origem));

  const primeiras = ordenadas.slice(0, LIMITE_DE_LINHAS);
  const restantes = ordenadas.slice(LIMITE_DE_LINHAS);
  const outras = {
    origens: restantes.length,
    criados: restantes.reduce((s, o) => s + o.criados, 0),
  };

  const total = totalExato ?? lidos.length;
  return {
    ok: true,
    dados: {
      total_criados: total,
      origens: primeiras,
      outras_origens: outras,
      truncado: totalExato !== null ? totalExato > lidos.length : false,
    },
  };
}
