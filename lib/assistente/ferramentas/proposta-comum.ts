/**
 * O que as cinco ferramentas `propor_*` (F2b, T19) têm em comum.
 *
 * PRINCÍPIO: propor NÃO muda nada no negócio. Estas ferramentas só LEEM (GET por
 * dentro, com a sessão da pessoa, para conferir que cada id citado é da
 * organização e para montar o "antes") e chamam UMA rota de escrita: o POST de
 * propostas, que grava uma linha `pendente`. Nenhuma chama rota de escrita de
 * roteador, conhecimento, memória, provedor ou funil — quem aplica é a T20,
 * depois do clique do administrador. `proposta-comum.test.ts` e o teste de cada
 * ferramenta provam isso pelo registro de chamadas.
 *
 * Texto de terceiros lido aqui (nome de funil, FAQ, memória) é DADO: vai para o
 * `antes` da proposta e para o resultado, nunca é obedecido.
 */
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import { riscoDoTipo } from "@/lib/assistente/propostas/operacoes";
import { esquemaDoCorpoDaProposta } from "@/lib/assistente/propostas/payload";
import type { TipoDeProposta } from "@/lib/assistente/propostas/tipos";

import type { EntradaDasFerramentas } from "./tipos";

/** O texto que toda proposta traz: o título para leigo e o porquê. */
export const camposDeTexto = {
  resumo: z.string().trim().min(3).max(300),
  motivo: z.string().trim().min(3).max(2000),
};

// ─── as fontes de LEITURA e a rota de propostas ─────────────────────────────

export interface FontesDeProposta {
  canais?: HandlerDeRota;
  roteadores?: HandlerDeRota;
  roteador?: HandlerDeRota;
  agentes?: HandlerDeRota;
  memoria?: HandlerDeRota;
  conhecimento?: HandlerDeRota;
  funis?: HandlerDeRota;
  etapas?: HandlerDeRota;
  provedores?: HandlerDeRota;
  propostas?: HandlerDeRota;
}

let sobrepostas: FontesDeProposta | null = null;

/** Só para testes: troca os handlers reais (que exigiriam sessão) por dublês. */
export function sobreporFontesDeProposta(fontes: FontesDeProposta | null): void {
  sobrepostas = fontes;
}

export const CAMINHOS = {
  canais: "/api/v1/channel-sessions",
  roteadores: "/api/v1/ai/routers",
  agentes: "/api/v1/ai/agents",
  memoria: "/api/v1/ai/memory",
  conhecimento: "/api/v1/ai/knowledge/sources",
  funis: "/api/v1/pipelines",
  provedores: "/api/v1/ai/providers",
  propostas: "/api/v1/ai/assistente/propostas",
} as const;

export const FONTES = {
  async canais(): Promise<HandlerDeRota> {
    if (sobrepostas?.canais) return sobrepostas.canais;
    return (await import("@/app/api/v1/channel-sessions/route")).GET;
  },
  async roteadores(): Promise<HandlerDeRota> {
    if (sobrepostas?.roteadores) return sobrepostas.roteadores;
    return (await import("@/app/api/v1/ai/routers/route")).GET;
  },
  async roteador(id: string): Promise<HandlerDeRota> {
    if (sobrepostas?.roteador) return sobrepostas.roteador;
    const modulo = await import("@/app/api/v1/ai/routers/[id]/route");
    return (req) => modulo.GET(req, { params: Promise.resolve({ id }) });
  },
  async agentes(): Promise<HandlerDeRota> {
    if (sobrepostas?.agentes) return sobrepostas.agentes;
    return (await import("@/app/api/v1/ai/agents/route")).GET;
  },
  async memoria(): Promise<HandlerDeRota> {
    if (sobrepostas?.memoria) return sobrepostas.memoria;
    return (await import("@/app/api/v1/ai/memory/route")).GET;
  },
  async conhecimento(): Promise<HandlerDeRota> {
    if (sobrepostas?.conhecimento) return sobrepostas.conhecimento;
    return (await import("@/app/api/v1/ai/knowledge/sources/route")).GET;
  },
  async funis(): Promise<HandlerDeRota> {
    if (sobrepostas?.funis) return sobrepostas.funis;
    return (await import("@/app/api/v1/pipelines/route")).GET;
  },
  async etapas(pipelineId: string): Promise<HandlerDeRota> {
    if (sobrepostas?.etapas) return sobrepostas.etapas;
    const modulo = await import("@/app/api/v1/pipelines/[id]/stages/route");
    return (req) => modulo.GET(req, { params: Promise.resolve({ id: pipelineId }) });
  },
  async provedores(): Promise<HandlerDeRota> {
    if (sobrepostas?.provedores) return sobrepostas.provedores;
    return (await import("@/app/api/v1/ai/providers/route")).GET;
  },
  async propostas(): Promise<HandlerDeRota> {
    if (sobrepostas?.propostas) return sobrepostas.propostas;
    return (await import("@/app/api/v1/ai/assistente/propostas/route")).POST;
  },
};

// ─── leitura ────────────────────────────────────────────────────────────────

export type Leitura = { ok: true; dados: unknown } | { ok: false; status: number | null };

/** GET por dentro. Nunca lança: falha vira `{ ok:false }` com o status (ou `null` se a chamada caiu). */
export async function ler(handler: HandlerDeRota, caminho: string): Promise<Leitura> {
  const resposta = await chamarRotaPorDentro(handler, caminho, {});
  if (!("status" in resposta)) return { ok: false, status: null };
  if (resposta.status !== 200) return { ok: false, status: resposta.status };
  const corpo = eObjeto(resposta.corpo) ? (resposta.corpo as { data?: unknown }).data : undefined;
  return corpo === undefined ? { ok: false, status: null } : { ok: true, dados: corpo };
}

export function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

/** Lista de objetos de uma leitura, ou `null` se o formato não é o esperado. */
export function comoLista(dados: unknown): Record<string, unknown>[] | null {
  return Array.isArray(dados) ? (dados.filter(eObjeto) as Record<string, unknown>[]) : null;
}

/** Os ids (string) de uma lista de linhas. */
export function idsDe(linhas: Record<string, unknown>[]): Set<string> {
  return new Set(linhas.flatMap((l) => (typeof l.id === "string" ? [l.id] : [])));
}

/** Corta texto lido de terceiros para caber no "antes" (limite de 32 KB da proposta). */
export function cortar(valor: unknown, maximo: number): string | null {
  return typeof valor === "string" ? (valor.length > maximo ? valor.slice(0, maximo) : valor) : null;
}

// ─── resultado ──────────────────────────────────────────────────────────────
// (as conferências que mais de uma ferramenta usa ficam logo depois dos tipos)

export type ResultadoDaProposta =
  | {
      ok: true;
      mensagem: string;
      proposta: { id: string; tipo: TipoDeProposta; operacao: string; risco: string; resumo: string; expira_em: string | null };
      avisos?: string[];
    }
  | { ok: false; motivo: "preciso_confirmar"; detalhe: string }
  | { ok: false; motivo: "parametro_invalido"; detalhe: string }
  | { ok: false; motivo: "indisponivel" };

export function precisoConfirmar(detalhe: string): ResultadoDaProposta {
  return { ok: false, motivo: "preciso_confirmar", detalhe: `PRECISO CONFIRMAR: ${detalhe}` };
}

export function parametroInvalido(detalhe: string): ResultadoDaProposta {
  return { ok: false, motivo: "parametro_invalido", detalhe };
}

export const INDISPONIVEL: ResultadoDaProposta = { ok: false, motivo: "indisponivel" };

/** Uma leitura que falhou: 404 não é "fora do ar" (o id não é desta organização), o resto é. */
export function falhaDeLeitura(leitura: Extract<Leitura, { ok: false }>, oQue: string): ResultadoDaProposta {
  if (leitura.status === 404) return precisoConfirmar(`${oQue} não foi encontrado(a) nesta organização.`);
  return INDISPONIVEL;
}

// ─── envio ──────────────────────────────────────────────────────────────────

export interface PedidoDeProposta {
  kind: TipoDeProposta;
  payload: unknown;
  resumo: string;
  motivo: string;
  /** O retrato do estado atual; `null` quando é criação. */
  antes: Record<string, unknown> | null;
  /** Avisos honestos para o modelo repassar (ex.: "ainda não há chave deste provedor"). */
  avisos?: string[];
}

/**
 * Valida com o MESMO esquema da rota, chama o POST de propostas por dentro e
 * devolve o texto honesto: "propôs", nunca "mudou".
 */
export async function enviarProposta(
  entrada: EntradaDasFerramentas,
  pedido: PedidoDeProposta,
): Promise<ResultadoDaProposta> {
  const corpo = {
    kind: pedido.kind,
    resumo: pedido.resumo,
    motivo: pedido.motivo,
    antes: pedido.antes,
    payload: pedido.payload,
    ...(entrada.turno ? { thread_id: entrada.turno.threadId, turn_id: entrada.turno.turnId } : {}),
  };
  const validacao = esquemaDoCorpoDaProposta.safeParse(corpo);
  if (!validacao.success) {
    const motivos = validacao.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "proposta"}: ${i.message}`)
      .join("; ");
    return parametroInvalido(motivos);
  }

  const resposta = await chamarRotaPorDentro(
    await FONTES.propostas(),
    CAMINHOS.propostas,
    {},
    { metodo: "POST", corpo: validacao.data },
  );
  if (!("status" in resposta)) return INDISPONIVEL;
  if (resposta.status === 403) {
    return precisoConfirmar("só o administrador pode registrar propostas de mudança.");
  }
  if (resposta.status === 404 || resposta.status === 422 || resposta.status === 400) {
    return parametroInvalido("a rota de propostas recusou o pedido.");
  }
  if (resposta.status !== 200 && resposta.status !== 201) return INDISPONIVEL;

  const dados = eObjeto(resposta.corpo) ? (resposta.corpo as { data?: unknown }).data : undefined;
  if (!eObjeto(dados) || typeof dados.id !== "string" || typeof dados.resumo !== "string") return INDISPONIVEL;
  const operacao = typeof dados.operacao === "string" ? dados.operacao : (validacao.data.payload.operacao as string);

  // Mesmo turno e mesmo tipo: a rota devolve a proposta que JÁ existia (idempotência).
  // Se não é a que acabamos de descrever, a nova NÃO foi criada — e dizer o contrário seria mentir.
  if (dados.resumo !== validacao.data.resumo) {
    return precisoConfirmar(
      `neste mesmo turno já existe uma proposta de ${pedido.kind} ("${dados.resumo}", id ${dados.id}); esta nova NÃO foi criada. ` +
        "Peça à pessoa para continuar na próxima mensagem.",
    );
  }

  return {
    ok: true,
    mensagem:
      "Proposta criada, aguardando a aprovação do administrador. NADA foi alterado ainda: " +
      "diga que você PROPÔS a mudança, nunca que ela foi feita.",
    proposta: {
      id: dados.id,
      tipo: pedido.kind,
      operacao,
      risco: riscoDoTipo(pedido.kind),
      resumo: dados.resumo,
      expira_em: typeof dados.expires_at === "string" ? dados.expires_at : null,
    },
    ...(pedido.avisos && pedido.avisos.length > 0 ? { avisos: pedido.avisos } : {}),
  };
}

// ─── conferências compartilhadas ────────────────────────────────────────────

/**
 * Todo agente citado tem de estar na lista de agentes DESTA organização (a rota
 * lista só os não arquivados). Devolve a falha pronta, ou `null` se está tudo certo.
 */
export async function conferirAgentes(ids: readonly string[]): Promise<ResultadoDaProposta | null> {
  if (ids.length === 0) return null;
  const leitura = await ler(await FONTES.agentes(), CAMINHOS.agentes);
  if (!leitura.ok) return INDISPONIVEL;
  const agentes = comoLista(leitura.dados);
  if (agentes === null) return INDISPONIVEL;
  const existentes = idsDe(agentes);
  const faltando = ids.filter((id) => !existentes.has(id));
  if (faltando.length > 0) {
    return precisoConfirmar(
      "um dos agentes citados não aparece na lista de agentes desta organização. Use `listar_agentes` e confirme com a pessoa qual é.",
    );
  }
  return null;
}

/** Campos que a pessoa preencheu e que NÃO valem para a operação pedida (campo solto vira proposta enganosa). */
export function camposForaDaOperacao(
  entrada: Record<string, unknown>,
  permitidos: readonly string[],
  candidatos: readonly string[],
): string[] {
  return candidatos.filter((campo) => entrada[campo] !== undefined && !permitidos.includes(campo));
}
