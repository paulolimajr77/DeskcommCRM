/**
 * Consulta de CONVERSÕES ENVIADAS: tentativas de reportar vendas à plataforma de
 * anúncios, com situação (entregue/falha/aguardando/não enviado) e os códigos de motivo.
 *
 * ⚠️ POR QUE O CLIENTE DE SERVIÇO, AQUI E SÓ AQUI: `ad_conversion_dispatches` e
 * `ad_platform_connections` têm RLS ligada com ZERO policies — o cliente da sessão
 * (`ctx.bancoDosModulos`) enxerga VAZIO. A leitura só funciona com `createAdminClient`,
 * que ignora RLS. Por isso TODA consulta carrega `.eq("organization_id", orgId)` e o
 * `orgId` vem de `ctx.orgId` (nunca de parâmetro). Sem RLS e sem esse filtro = vazamento
 * entre clientes pagantes.
 *
 * Leitura em páginas de 1000, no máximo 5 (a primeira com `count: "exact"`).
 * Agregação em `Map` por plataforma. NUNCA lê nem devolve: `lead_id`, `detail`,
 * `event_id`, `remote_request_id`, título do negócio, nem texto livre.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { MOTIVO_LEGIVEL } from "@/lib/conversoes/estado-da-conexao";
import { situacaoDaLinha } from "@/lib/conversoes/historico";
import { createAdminClient } from "@/lib/supabase/admin";

import type { JanelaDeBanco } from "./fechamentos";

export const TAMANHO_DA_PAGINA = 1000;
export const PAGINAS_MAXIMAS = 5;
export const MOTIVOS_MAXIMOS = 12;
export const DIAS_DE_ATRASO_LIMITE = 7;

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const SITUACOES_DA_METRICA = ["entregue", "falha", "aguardando", "nao_enviado"] as const;
type SituacaoDaMetrica = (typeof SITUACOES_DA_METRICA)[number];

export type PorSituacao = Record<SituacaoDaMetrica, number>;

export interface MotivoComSignificado {
  codigo: string;
  quantidade: number;
  significado: string | null;
}

export interface ValorPorMoeda {
  moeda: string;
  valor_cents: number;
  /** Quantas vendas entregues, com valor e moeda, formam esse total. */
  quantidade: number;
}

export interface DadosDeConversoesPorPlataforma {
  plataforma: string;
  contagens: PorSituacao;
  motivos: MotivoComSignificado[];
  entregues_com_atraso_maior_que_7_dias: number;
  valor_entregue_cents_por_moeda: ValorPorMoeda[];
  total_de_tentativas: number;
}

export interface DadosLidosDeConversoes {
  por_plataforma: DadosDeConversoesPorPlataforma[];
  truncado: boolean;
}

interface LinhaDoDispatch {
  platform: string | null;
  event_name: string | null;
  status: string;
  reason: string | null;
  value_cents: number | null;
  currency: string | null;
  event_occurred_at: string | null;
  attempted_at: string;
}

interface Acumulado {
  contagens: PorSituacao;
  motivos: Map<string, number>;
  com_atraso: number;
  valor_por_moeda: Map<string, { valor_cents: number; quantidade: number }>;
}

let clienteSobreposto: SupabaseClient | null = null;

/** Só para teste: troca o cliente de serviço por um falso. `null` volta ao real. */
export function sobreporClienteAdminDeConversoes(fake: SupabaseClient | null): void {
  clienteSobreposto = fake;
}

/** O único ponto onde este módulo cria o cliente de serviço. */
export function clienteDeServicoDeConversoes(): SupabaseClient {
  return clienteSobreposto ?? createAdminClient();
}

function primeiraFrase(texto: string, max: number): string {
  const ponto = texto.indexOf(".");
  const frase = ponto >= 0 ? texto.slice(0, ponto + 1) : texto;
  return frase.length > max ? frase.slice(0, max).trimEnd() : frase;
}

function significadoDoMotivo(codigo: string): string | null {
  const texto = Object.prototype.hasOwnProperty.call(MOTIVO_LEGIVEL, codigo) ? MOTIVO_LEGIVEL[codigo] : undefined;
  return texto ? primeiraFrase(texto, 120) : null;
}

function passouDoLimiteDeAtraso(ocorridoEm: string | null, tentadoEm: string): boolean {
  if (!ocorridoEm) return false;
  const ocorreu = Date.parse(ocorridoEm);
  const tentou = Date.parse(tentadoEm);
  if (Number.isNaN(ocorreu) || Number.isNaN(tentou)) return false;
  return (tentou - ocorreu) / MS_POR_DIA > DIAS_DE_ATRASO_LIMITE;
}

function acumuladoVazio(): Acumulado {
  return {
    contagens: { entregue: 0, falha: 0, aguardando: 0, nao_enviado: 0 },
    motivos: new Map<string, number>(),
    com_atraso: 0,
    valor_por_moeda: new Map<string, { valor_cents: number; quantidade: number }>(),
  };
}

export async function lerConversoesEnviadas(
  client: SupabaseClient,
  orgId: string,
  janela: JanelaDeBanco,
  filtroPlataforma?: "meta_ads" | "google_ads",
): Promise<{ ok: true; dados: DadosLidosDeConversoes } | { ok: false }> {
  const lidos: LinhaDoDispatch[] = [];
  let totalExato: number | null = null;

  for (let pagina = 0; pagina < PAGINAS_MAXIMAS; pagina += 1) {
    let consulta = client
      .from("ad_conversion_dispatches")
      .select(
        "platform, event_name, status, reason, value_cents, currency, event_occurred_at, attempted_at",
        pagina === 0 ? { count: "exact" } : undefined,
      )
      .eq("organization_id", orgId)
      .gte("attempted_at", janela.deInstante)
      .lt("attempted_at", janela.ateInstanteExclusivo);
    if (filtroPlataforma) consulta = consulta.eq("platform", filtroPlataforma);

    const { data, count, error } = await consulta
      .order("attempted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(pagina * TAMANHO_DA_PAGINA, (pagina + 1) * TAMANHO_DA_PAGINA - 1);
    if (error) return { ok: false };
    if (typeof count === "number") totalExato = count;
    const linhas = (data ?? []) as unknown as LinhaDoDispatch[];
    lidos.push(...linhas);
    if (linhas.length < TAMANHO_DA_PAGINA) break;
  }

  const porPlataforma = new Map<string, Acumulado>();
  for (const linha of lidos) {
    const plataforma = (linha.platform ?? "").trim().slice(0, 40) || "desconhecida";
    const acc = porPlataforma.get(plataforma) ?? acumuladoVazio();
    const situacao = situacaoDaLinha(linha.status, linha.reason) as SituacaoDaMetrica;
    acc.contagens[situacao] += 1;

    if (linha.reason) {
      const codigo = linha.reason.trim().slice(0, 60);
      if (codigo) acc.motivos.set(codigo, (acc.motivos.get(codigo) ?? 0) + 1);
    }

    if (situacao === "entregue") {
      if (passouDoLimiteDeAtraso(linha.event_occurred_at, linha.attempted_at)) acc.com_atraso += 1;
      const moeda = (linha.currency ?? "").trim().toUpperCase().slice(0, 8);
      if (linha.value_cents !== null && Number.isFinite(linha.value_cents) && moeda) {
        const atual = acc.valor_por_moeda.get(moeda) ?? { valor_cents: 0, quantidade: 0 };
        atual.valor_cents += linha.value_cents;
        atual.quantidade += 1;
        acc.valor_por_moeda.set(moeda, atual);
      }
    }
    porPlataforma.set(plataforma, acc);
  }

  const saida: DadosDeConversoesPorPlataforma[] = [];
  for (const [plataforma, acc] of porPlataforma) {
    const motivos = [...acc.motivos.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MOTIVOS_MAXIMOS)
      .map(([codigo, quantidade]) => ({ codigo, quantidade, significado: significadoDoMotivo(codigo) }));
    const valores = [...acc.valor_por_moeda.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([moeda, v]) => ({ moeda, valor_cents: v.valor_cents, quantidade: v.quantidade }));
    saida.push({
      plataforma,
      contagens: acc.contagens,
      motivos,
      entregues_com_atraso_maior_que_7_dias: acc.com_atraso,
      valor_entregue_cents_por_moeda: valores,
      total_de_tentativas:
        acc.contagens.entregue + acc.contagens.falha + acc.contagens.aguardando + acc.contagens.nao_enviado,
    });
  }
  saida.sort((a, b) => a.plataforma.localeCompare(b.plataforma));

  return {
    ok: true,
    dados: {
      por_plataforma: saida,
      truncado: totalExato !== null && totalExato > lidos.length,
    },
  };
}
