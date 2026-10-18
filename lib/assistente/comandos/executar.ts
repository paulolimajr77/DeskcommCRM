/**
 * A EXECUÇÃO DOS COMANDOS — o lado que lê dado.
 *
 * Tudo aqui lê com a SESSÃO da pessoa, pelas rotas `/api/v1` por dentro
 * (`chamarRotaPorDentro`) ou pelo catálogo de métricas. Nenhuma chamada de
 * serviço, nenhum SQL direto, nenhuma organização vinda de parâmetro: as
 * rotas resolvem a organização pelo contexto da requisição, e é por isso que o
 * comando de uma empresa não consegue contar nada de outra.
 *
 * Falha de uma fonte NUNCA derruba o comando: a linha vira "não consegui ler
 * agora", e o resto continua. Quem chama é a rota do chat, que já passou pelo
 * `requireRole("viewer")` e pelo limite por minuto.
 */
import type { NextRequest } from "next/server";

import {
  chamarRotaPorDentro,
  type HandlerDeRota,
  type RespostaDaRota,
} from "@/lib/assistente/metricas/chamar-rota";
import { consultarMetrica, type ContextoDeConsulta } from "@/lib/assistente/metricas";
import type { AcaoDoChat } from "@/lib/assistente/ferramentas/tipos";

import { comandoSoDeAdmin, linhasDaAjuda, type ComandoDoAssistente } from "./index";

/** O que todo comando devolve para a rota do chat. */
export interface SaidaDoComando {
  resposta: string;
  acoes: AcaoDoChat[];
}

type Tradutor = (texto: string) => string;

// ─── as fontes internas (dubláveis em teste) ────────────────────────────────

export interface FontesDosComandos {
  contagens?: HandlerDeRota;
  agendamentos?: HandlerDeRota;
  auditoria?: HandlerDeRota;
  auditoriaRodar?: HandlerDeRota;
  propostas?: HandlerDeRota;
}

let sobrepostas: FontesDosComandos | null = null;

/** Só para testes: troca os handlers reais (que exigiriam sessão) por dublês. */
export function sobreporFontesDosComandos(fontes: FontesDosComandos | null): void {
  sobrepostas = fontes;
}

async function hContagens(): Promise<HandlerDeRota> {
  if (sobrepostas?.contagens) return sobrepostas.contagens;
  return (await import("@/app/api/v1/conversations/counts/route")).GET;
}
async function hAgendamentos(): Promise<HandlerDeRota> {
  if (sobrepostas?.agendamentos) return sobrepostas.agendamentos;
  return (await import("@/app/api/v1/agenda/agendamentos/route")).GET;
}
async function hAuditoria(): Promise<HandlerDeRota> {
  if (sobrepostas?.auditoria) return sobrepostas.auditoria;
  return (await import("@/app/api/v1/ai/assistente/auditoria/route")).GET;
}
async function hAuditoriaRodar(): Promise<HandlerDeRota> {
  if (sobrepostas?.auditoriaRodar) return sobrepostas.auditoriaRodar;
  return (await import("@/app/api/v1/ai/assistente/auditoria/route")).POST;
}
async function hPropostas(): Promise<HandlerDeRota> {
  if (sobrepostas?.propostas) return sobrepostas.propostas;
  return (await import("@/app/api/v1/ai/assistente/propostas/route")).GET;
}

async function chamar(
  resolver: () => Promise<HandlerDeRota>,
  caminho: string,
  query: Record<string, string> = {},
  metodo?: "GET" | "POST",
): Promise<RespostaDaRota> {
  return chamarRotaPorDentro(
    await resolver(),
    caminho,
    query,
    metodo === undefined ? undefined : { metodo },
  );
}

/** O `data` de uma resposta `{ data, meta }`, quando o status é de sucesso. */
function dadosDe(resposta: RespostaDaRota): { ok: true; dados: unknown } | { ok: false } {
  if ("falhou" in resposta) return { ok: false };
  if (resposta.status < 200 || resposta.status >= 300) return { ok: false };
  const dados =
    resposta.corpo !== null && typeof resposta.corpo === "object" && "data" in resposta.corpo
      ? (resposta.corpo as { data: unknown }).data
      : undefined;
  return dados === undefined ? { ok: false } : { ok: true, dados };
}

function numeroOuNulo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/**
 * O dia civil de hoje NO FUSO da organização. Mesma régua do `periodo.ts` (que
 * ancora a aritmética de calendário e lê as partes pelo `Intl`): o resumo de
 * quem fala de `America/Sao_Paulo` não pode virar o de amanhã em UTC.
 */
function diaCivil(ctx: ContextoDeConsulta): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ctx.fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ctx.agoraIso));
  const mapa: Record<string, string> = {};
  for (const parte of partes) if (parte.type !== "literal") mapa[parte.type] = parte.value;
  return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

// ─── /resumo ────────────────────────────────────────────────────────────────

export interface LinhaDoResumo {
  chave: string;
  rotulo: string;
  valor: string;
}

export interface DependenciasDoResumo {
  /** O catálogo de métricas; trocado por dublê nos testes. */
  consultar?: typeof consultarMetrica;
}

/**
 * O resumo de HOJE. Uma linha por item, na ordem em que a pessoa lê:
 * conversas abertas, negócios novos, agendamentos, sem resposta, pendências.
 * Cada linha que não pôde ser lida diz por quê — nunca mostra zero no lugar de
 * "não sei".
 */
export async function montarResumo(
  ctx: ContextoDeConsulta,
  t: Tradutor,
  deps: DependenciasDoResumo = {},
): Promise<{ resposta: string; linhas: LinhaDoResumo[] }> {
  const consultar = deps.consultar ?? consultarMetrica;
  const hoje = diaCivil(ctx);
  const periodoDeHoje = { tipo: "intervalo" as const, de: hoje, ate: hoje };
  const linhas: LinhaDoResumo[] = [];
  const semLer = t("Não consegui ler agora.");

  // 1 e 4 saem da MESMA foto do inbox (uma leitura só).
  const contagens = await chamar(hContagens, "/api/v1/conversations/counts");
  const dadosDasContagens = dadosDe(contagens);
  if (dadosDasContagens.ok) {
    const foto = dadosDasContagens.dados as Record<string, unknown>;
    const tudo = numeroOuNulo(foto.all);
    const fechadas = numeroOuNulo(foto.closed);
    const arquivadas = numeroOuNulo(foto.archived);
    const abertas = tudo === null ? null : Math.max(0, tudo - (fechadas ?? 0) - (arquivadas ?? 0));
    linhas.push({
      chave: "conversas_abertas",
      rotulo: t("Conversas abertas"),
      valor: abertas === null ? semLer : String(abertas),
    });
  } else {
    linhas.push({ chave: "conversas_abertas", rotulo: t("Conversas abertas"), valor: semLer });
  }

  // 2. Negócios criados hoje — a métrica oficial; papel insuficiente é dito.
  const criados = await consultar(ctx, "leads_por_origem", { periodo: periodoDeHoje });
  const rotuloCriados = t("Negócios novos hoje");
  if (criados.ok) {
    const dados = criados.dados as { total_criados?: unknown } | null;
    const total = dados === null ? 0 : numeroOuNulo(dados.total_criados);
    linhas.push({
      chave: "negocios_novos",
      rotulo: rotuloCriados,
      valor: total === null ? "0" : String(total),
    });
  } else if (criados.motivo === "sem_permissao") {
    linhas.push({ chave: "negocios_novos", rotulo: rotuloCriados, valor: t("Peça a um gerente.") });
  } else {
    linhas.push({ chave: "negocios_novos", rotulo: rotuloCriados, valor: semLer });
  }

  // 3. Agendamentos de hoje, lidos pela rota da agenda com o dia no fuso da org.
  const agendamentos = await chamar(hAgendamentos, "/api/v1/agenda/agendamentos", { dia: hoje });
  const dadosDaAgenda = dadosDe(agendamentos);
  const listaDaAgenda =
    dadosDaAgenda.ok && Array.isArray(dadosDaAgenda.dados) ? dadosDaAgenda.dados : null;
  linhas.push({
    chave: "agendamentos_hoje",
    rotulo: t("Agendamentos de hoje"),
    valor: listaDaAgenda === null ? semLer : String(listaDaAgenda.length),
  });

  // 4. Mensagens sem resposta = a fila do inbox (conversa esperando alguém pegar).
  const fila = dadosDasContagens.ok
    ? numeroOuNulo((dadosDasContagens.dados as Record<string, unknown>).fila)
    : null;
  linhas.push({
    chave: "sem_resposta",
    rotulo: t("Mensagens sem resposta"),
    valor: fila === null ? semLer : String(fila),
  });

  // 5. Pendências de configuração = as do último retrato da auditoria.
  const retratos = await chamar(hAuditoria, "/api/v1/ai/assistente/auditoria", { limit: "1" });
  const dadosDosRetratos = dadosDe(retratos);
  const primeiro =
    dadosDosRetratos.ok && Array.isArray(dadosDosRetratos.dados)
      ? dadosDosRetratos.dados[0]
      : undefined;
  const pendencias = numeroOuNulo((primeiro as { pendencias?: unknown } | undefined)?.pendencias);
  linhas.push({
    chave: "pendencias",
    rotulo: t("Pendências de configuração"),
    valor:
      primeiro === undefined
        ? t("Nenhuma auditoria feita ainda.")
        : pendencias === null
          ? semLer
          : String(pendencias),
  });

  const resposta = [
    `**${t("Resumo de hoje")}**`,
    ...linhas.map((l) => `${l.rotulo}: ${l.valor}`),
  ].join("\n");
  return { resposta, linhas };
}

// ─── /checkup ───────────────────────────────────────────────────────────────

interface RetratoDoCheckup {
  id: string;
  taken_at: string;
  pendencias: number;
  itens: unknown[];
}

function retratoDe(bruto: unknown): RetratoDoCheckup | null {
  if (bruto === null || typeof bruto !== "object") return null;
  const x = bruto as { id?: unknown; taken_at?: unknown; pendencias?: unknown; itens?: unknown };
  if (typeof x.id !== "string" || typeof x.taken_at !== "string") return null;
  return {
    id: x.id,
    taken_at: x.taken_at,
    pendencias: numeroOuNulo(x.pendencias) ?? 0,
    itens: Array.isArray(x.itens) ? x.itens : [],
  };
}

/**
 * `/checkup`: mostra a auditoria da configuração. Administrador RODA uma rodada
 * nova (é a única escrita deste comando); todo mundo vê a última que existe.
 */
export async function executarCheckup(ehAdmin: boolean, t: Tradutor): Promise<SaidaDoComando> {
  let rodou = false;
  let snapshot: RetratoDoCheckup | null = null;
  let anterior: RetratoDoCheckup | null = null;

  if (ehAdmin) {
    const rodada = await chamar(hAuditoriaRodar, "/api/v1/ai/assistente/auditoria", {}, "POST");
    const dadosDaRodada = dadosDe(rodada);
    if (dadosDaRodada.ok) {
      const corpo = dadosDaRodada.dados as { snapshot?: unknown; anterior?: unknown };
      snapshot = retratoDe(corpo.snapshot);
      anterior = retratoDe(corpo.anterior);
      rodou = snapshot !== null;
    }
  }

  if (snapshot === null) {
    const retratos = await chamar(hAuditoria, "/api/v1/ai/assistente/auditoria", { limit: "2" });
    const dadosDosRetratos = dadosDe(retratos);
    const lista =
      dadosDosRetratos.ok && Array.isArray(dadosDosRetratos.dados) ? dadosDosRetratos.dados : [];
    snapshot = retratoDe(lista[0]);
    anterior = retratoDe(lista[1]);
  }

  if (snapshot === null) {
    return {
      resposta: ehAdmin
        ? t("Ainda não há retrato da configuração e não consegui rodar um agora.")
        : t("Ainda não há retrato da configuração. Peça a um administrador para rodar o checkup."),
      acoes: [],
    };
  }

  const evolucao =
    anterior === null
      ? t("Primeira rodada de auditoria.")
      : t("Da última vez: {antes} pendência(s); agora: {agora}.")
          .replace("{antes}", String(anterior.pendencias))
          .replace("{agora}", String(snapshot.pendencias));

  const resposta = [
    rodou
      ? t("Rodei a auditoria da configuração.")
      : t("Esta é a última auditoria da configuração."),
    `${t("Pendências agora")}: ${snapshot.pendencias}.`,
    evolucao,
  ].join(" ");

  return {
    resposta,
    acoes: [
      {
        tipo: "checkup",
        rodou,
        snapshot,
        anterior:
          anterior === null
            ? null
            : { id: anterior.id, taken_at: anterior.taken_at, pendencias: anterior.pendencias },
      },
    ],
  };
}

// ─── /pendentes ─────────────────────────────────────────────────────────────

/** As mudanças esperando decisão, como cartões. SÓ administrador. */
export async function executarPendentes(ehAdmin: boolean, t: Tradutor): Promise<SaidaDoComando> {
  if (!ehAdmin) {
    return {
      resposta: t(
        "Este comando é só para administradores: as mudanças de configuração são decididas por quem administra a empresa.",
      ),
      acoes: [],
    };
  }

  const resposta = await chamar(hPropostas, "/api/v1/ai/assistente/propostas", {
    status: "pendente",
    limit: "50",
  });
  const dados = dadosDe(resposta);
  const lista = dados.ok && Array.isArray(dados.dados) ? dados.dados : null;
  if (lista === null) {
    return { resposta: t("Não consegui ler as mudanças esperando decisão agora."), acoes: [] };
  }

  const ids = lista.flatMap((p) => {
    const id = (p as { id?: unknown }).id;
    return typeof id === "string" ? [id] : [];
  });
  if (ids.length === 0) {
    return { resposta: t("Nenhuma mudança esperando decisão."), acoes: [] };
  }
  return {
    resposta:
      ids.length === 1
        ? t("Tem 1 mudança esperando você.")
        : t("Tem {n} mudanças esperando você.").replace("{n}", String(ids.length)),
    acoes: ids.map((id) => ({ tipo: "proposta", id })),
  };
}

// ─── /ajuda e o despacho ────────────────────────────────────────────────────

export function executarAjuda(ehAdmin: boolean, t: Tradutor): SaidaDoComando {
  const linhas = linhasDaAjuda(t).filter((l) => ehAdmin || !l.soAdmin);
  const resposta = [
    t("Comandos disponíveis:"),
    ...linhas.map((l) => `/${l.comando} — ${l.explicacao}`),
    "",
    t(
      'Você também pode pedir em português: "quantas conversas estão sem resposta?" ou "pode criar um follow-up de recompra?".',
    ),
  ].join("\n");
  return { resposta, acoes: [] };
}

/**
 * O despacho. Devolve `null` quando o texto NÃO é comando — aí quem responde é
 * o modelo, como sempre.
 */
export async function executarComando(
  comando: ComandoDoAssistente,
  ctx: ContextoDeConsulta,
  t: Tradutor,
  deps: DependenciasDoResumo = {},
): Promise<SaidaDoComando> {
  // A trava de papel mora aqui, NO SERVIDOR, com o papel da sessão: a tela só
  // deixa de oferecer o comando — esconder botão não é permissão.
  const ehAdmin = ctx.papel === "admin";
  if (comandoSoDeAdmin(comando)) return executarPendentes(ehAdmin, t);

  switch (comando) {
    case "resumo": {
      const { resposta } = await montarResumo(ctx, t, deps);
      return { resposta, acoes: [] };
    }
    case "checkup":
      return executarCheckup(ehAdmin, t);
    case "pendentes":
      return executarPendentes(ehAdmin, t);
    case "ajuda":
      return executarAjuda(ehAdmin, t);
    case "nova":
      return { resposta: t("Conversa nova."), acoes: [] };
  }
}
