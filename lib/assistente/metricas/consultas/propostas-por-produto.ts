/**
 * Consulta de PROPOSTAS ACEITAS POR PRODUTO: itens de `crm_proposals` com
 * `status = "aceita"` e `decided_at` na janela [de, até), lidos em páginas de
 * 500 (no máximo 5 páginas) com o embed de `crm_proposal_items` já resolvido
 * pelo PostgREST.
 *
 * A conta do item é a do `calcularTotal` (`lib/propostas/total.ts`):
 * subtotal = quantidade × preço unitário, líquido = subtotal − desconto,
 * TRAVADO em zero — desconto maior não deixa o item negativo. `quantidade`
 * é `numeric` no banco: chega como string/número e é convertida com
 * `Number()` antes de multiplicar.
 *
 * Agrupamento em `Map` por (product_id, moeda) — moedas NUNCA são somadas
 * entre si. A `descricao` do item NUNCA é lida para a saída (texto livre).
 * `organization_id` é filtro explícito em toda leitura. Qualquer erro vira
 * `{ ok: false }` — a mensagem do banco NUNCA sobe ao modelo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { JanelaDeBanco } from "./fechamentos";

export const TAMANHO_DA_PAGINA_DE_PROPOSTAS = 500;
export const PAGINAS_MAXIMAS_DE_PROPOSTAS = 5;
export const LIMITE_DE_LINHAS_DE_PRODUTO = 30;
export const GRUPO_SEM_PRODUTO = "Itens sem produto do catálogo";
export const PRODUTO_REMOVIDO = "(produto removido)";

export interface LinhaPorProduto {
  produto: string;
  moeda: string;
  propostas: number;
  quantidade: number;
  valor_proposto_cents: number;
}

export interface DadosDePropostasPorProduto {
  propostas_aceitas: number;
  por_produto: LinhaPorProduto[];
  linhas_omitidas: number;
  truncado: boolean;
}

interface ItemDaProposta {
  product_id: string | null;
  quantidade: unknown;
  preco_unitario_cents: unknown;
  desconto_cents: unknown;
}

interface PropostaDoBanco {
  id: string;
  moeda: string;
  crm_proposal_items: ItemDaProposta[] | null;
}

interface AcumuladoDeProduto {
  productId: string | null;
  moeda: string;
  propostas: Set<string>;
  quantidade: number;
  valor: number;
}

function numero(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

/** O mesmo travamento de `calcularTotal`: item com preço nulo não entra; líquido nunca negativo. */
function valorDoItem(item: ItemDaProposta): number | null {
  const preco = item.preco_unitario_cents;
  if (preco === null || preco === undefined) return null;
  const subtotal = Math.round(numero(item.quantidade) * numero(preco));
  return Math.max(0, subtotal - Math.round(numero(item.desconto_cents)));
}

export async function lerPropostasAceitasPorProduto(
  db: SupabaseClient,
  orgId: string,
  janela: JanelaDeBanco,
): Promise<{ ok: true; dados: DadosDePropostasPorProduto } | { ok: false }> {
  const lidas: PropostaDoBanco[] = [];
  let totalExato: number | null = null;

  for (let pagina = 0; pagina < PAGINAS_MAXIMAS_DE_PROPOSTAS; pagina += 1) {
    const consulta = db
      .from("crm_proposals")
      .select(
        "id, moeda, crm_proposal_items(product_id, quantidade, preco_unitario_cents, desconto_cents)",
        pagina === 0 ? { count: "exact" } : undefined,
      )
      .eq("organization_id", orgId)
      .eq("status", "aceita")
      .gte("decided_at", janela.deInstante)
      .lt("decided_at", janela.ateInstanteExclusivo)
      .order("decided_at", { ascending: false })
      .order("id", { ascending: false });
    const { data, count, error } = await consulta.range(
      pagina * TAMANHO_DA_PAGINA_DE_PROPOSTAS,
      (pagina + 1) * TAMANHO_DA_PAGINA_DE_PROPOSTAS - 1,
    );
    if (error) return { ok: false };
    if (count !== null && count !== undefined) totalExato = count;
    lidas.push(...((data ?? []) as unknown as PropostaDoBanco[]));
    if ((data ?? []).length < TAMANHO_DA_PAGINA_DE_PROPOSTAS) break;
  }

  // Agrupa por (produto, moeda): o Map não aceita chave inventada perigosa.
  const grupos = new Map<string, AcumuladoDeProduto>();
  const idsDeProduto = new Set<string>();
  for (const proposta of lidas) {
    for (const item of proposta.crm_proposal_items ?? []) {
      const valor = valorDoItem(item);
      if (valor === null) continue;
      const chave = `${item.product_id ?? "sem-catalogo"}|${proposta.moeda}`;
      const atual =
        grupos.get(chave) ??
        {
          productId: item.product_id ?? null,
          moeda: proposta.moeda,
          propostas: new Set<string>(),
          quantidade: 0,
          valor: 0,
        };
      atual.propostas.add(proposta.id);
      atual.quantidade = Number((atual.quantidade + numero(item.quantidade)).toFixed(3));
      atual.valor += valor;
      grupos.set(chave, atual);
      if (item.product_id) idsDeProduto.add(item.product_id);
    }
  }

  // Uma leitura só dos nomes, em lotes de 100 ids.
  const nomes = new Map<string, string>();
  const ids = [...idsDeProduto];
  for (let inicio = 0; inicio < ids.length; inicio += 100) {
    const lote = ids.slice(inicio, inicio + 100);
    const { data, error } = await db
      .from("catalog_products")
      .select("id, nome")
      .eq("organization_id", orgId)
      .in("id", lote);
    if (error) return { ok: false };
    for (const produto of (data ?? []) as unknown as { id: string; nome: string }[]) {
      nomes.set(produto.id, produto.nome);
    }
  }

  const linhas: LinhaPorProduto[] = [...grupos.values()].map((g) => ({
    produto:
      g.productId === null ? GRUPO_SEM_PRODUTO : (nomes.get(g.productId) ?? PRODUTO_REMOVIDO),
    moeda: g.moeda,
    propostas: g.propostas.size,
    quantidade: g.quantidade,
    valor_proposto_cents: g.valor,
  }));
  linhas.sort((a, b) => b.valor_proposto_cents - a.valor_proposto_cents);

  const primeiras = linhas.slice(0, LIMITE_DE_LINHAS_DE_PRODUTO);
  const total = totalExato ?? lidas.length;
  return {
    ok: true,
    dados: {
      propostas_aceitas: total,
      por_produto: primeiras,
      linhas_omitidas: Math.max(0, linhas.length - primeiras.length),
      truncado: totalExato !== null ? totalExato > lidas.length : false,
    },
  };
}
