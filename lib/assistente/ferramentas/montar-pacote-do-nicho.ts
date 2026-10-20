/**
 * Ferramenta `montar_pacote_do_nicho` — agente + follow-ups de modelo em
 * RASCUNHO, numa pedida, a partir do pacote do nicho (T14a).
 *
 * Passos, nesta ordem — parar no primeiro que falhar, e nada é criado antes
 * de TODAS as checagens 1–4 passarem:
 *   1. nicho sem `esqueleto` → `nicho_sem_prompt` (defesa: hoje os 7 têm prompt);
 *   2. preencher o esqueleto pelos `campos` do nicho → `falta_dado`;
 *   3. nome do agente já existe (inclui arquivados) → `ja_existe`;
 *   4. follow-up pedido fora do nicho → `followup_de_outro_nicho`;
 *   5. criar o agente com `criarAgenteRascunho` (T12); falha devolve o MESMO
 *      motivo, sem tentar follow-up;
 *   6. para cada follow-up: pede etapa → vai para `falta` sem instalar;
 *      senão instala com `instalarModeloDeFollowup` (T13), e a falha vai para
 *      `falta` sem desfazer o agente nem os outros;
 *   7. sucesso devolve o que foi criado e a lista do que falta — só com o que
 *      existe nos dados do nicho, mais frases curtas de ligação.
 *
 * Nenhum texto de atendimento novo: o prompt vem SÓ do `esqueleto`, e o
 * "falta" vem SÓ dos campos do nicho. Escrita de verdade, só `admin`.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import {
  IDS_DE_NICHO,
  NICHOS_DO_ASSISTENTE,
  nichoPorId,
  preencherEsqueleto,
  type IdDeNicho,
  type NichoDoAssistente,
  type OrigemDeCampoDoNicho,
} from "@/lib/assistente/nichos";
import { modeloPorId } from "@/lib/followup/modelos";

import { criarAgenteRascunho, type MotivoDeFalhaAoAlcancarAgente } from "./criar-rascunho-de-agente";
import { instalarModeloDeFollowup } from "./instalar-modelo-de-followup";
import { protegida } from "./protegida";
import { anotarCartaoDeArtefato, type EntradaDasFerramentas } from "./tipos";

const NICHOS = IDS_DE_NICHO as unknown as [IdDeNicho, ...IdDeNicho[]];

/** Enum montado dos `followups.modelos` de TODOS os nichos (hoje só clínica). */
const TODOS_OS_MODELOS_DOS_NICHOS = NICHOS_DO_ASSISTENTE.flatMap((n) => n.followups.modelos) as unknown as [
  string,
  ...string[],
];

const esquemaDeEntrada = z.strictObject({
  nicho: z.enum(NICHOS),
  negocio: z.string().trim().min(1).max(120),
  descricao: z.string().trim().min(1).max(300),
  nome_do_agente: z.string().trim().min(1).max(60),
  followups: z.array(z.enum(TODOS_OS_MODELOS_DOS_NICHOS)).optional(),
});

let listaSobreposta: HandlerDeRota | null = null;

/** Só para testes: troca o handler real (que exigiria sessão) por um dublê. */
export function sobreporHandlerDeListaDeAgentes(handler: HandlerDeRota | null): void {
  listaSobreposta = handler;
}

async function handlerDeLista(): Promise<HandlerDeRota> {
  if (listaSobreposta) return listaSobreposta;
  const modulo = await import("@/app/api/v1/ai/agents/route");
  return modulo.GET;
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object";
}

/** O que a ferramenta passa para o miolo (o nicho já resolvido, dados puros). */
export interface PedidoDePacoteDoNicho {
  nicho: NichoDoAssistente;
  negocio: string;
  descricao: string;
  nomeDoAgente: string;
  followups: string[];
}

export type MotivoDeFalhaAoMontarPacote =
  | "nicho_sem_prompt"
  | "falta_dado"
  | "ja_existe"
  | "followup_de_outro_nicho"
  | MotivoDeFalhaAoAlcancarAgente;

export interface FollowupCriadoDoPacote {
  id: string;
  nome: string;
  estado: "rascunho";
}

export type ResultadoDePacoteDoNicho =
  | {
      ok: true;
      criado: { agente: { id: string; nome: string; estado: "rascunho" }; followups: FollowupCriadoDoPacote[] };
      falta: string[];
    }
  | { ok: false; motivo: MotivoDeFalhaAoMontarPacote; faltam?: string[]; detalhe?: string };

/** Os nomes de agentes da org (inclui arquivados), ou `null` se a rota falhou. */
async function nomesDeAgentesDaOrganizacao(): Promise<Set<string> | null> {
  const resposta = await chamarRotaPorDentro(await handlerDeLista(), "/api/v1/ai/agents", {
    include_archived: "true",
  });
  if (!("status" in resposta) || resposta.status !== 200) return null;
  const corpo = eObjeto(resposta.corpo) ? (resposta.corpo as { data?: unknown }).data : undefined;
  if (!Array.isArray(corpo)) return null;
  const nomes = new Set<string>();
  for (const linha of corpo as Record<string, unknown>[]) {
    if (typeof linha.name === "string") nomes.add(linha.name);
  }
  return nomes;
}

/** O "falta" — só com o que existe nos dados do nicho, mais ligação curta. */
function montarFalta(
  nicho: NichoDoAssistente,
  instalados: Set<string>,
  falhasDeFollowup: { id: string; motivo: string }[],
  comEtapa: string[],
): string[] {
  const falta: string[] = [];
  falta.push(
    `Falta: criar o funil "${nicho.funil.nome}" em Funis com as etapas: ${nicho.funil.etapas.join(", ")}`,
  );
  for (const id of nicho.followups.modelos) {
    if (!instalados.has(id)) {
      falta.push(`Falta: instalar o follow-up de modelo "${id}"`);
    }
  }
  for (const id of comEtapa) {
    falta.push(
      `Falta: o follow-up "${id}" dispara por etapa do funil; diga qual etapa para instalar`,
    );
  }
  for (const { id, motivo } of falhasDeFollowup) {
    falta.push(`Falta: o follow-up "${id}" não foi instalado (${motivo})`);
  }
  for (const observacao of nicho.followups.observacoes) {
    falta.push(`Falta: ${observacao}`);
  }
  falta.push("Falta: publicar o agente (proposta do assistente; o administrador aprova no chat)");
  falta.push("Falta: ligar cada follow-up publicado ao agente em Agente › Follow-up");
  falta.push("Falta: conectar canal e conferir a chave de IA: PRECISO CONFIRMAR");
  for (const pergunta of nicho.faq) {
    falta.push(`Falta: perguntar ao dono — ${pergunta}`);
  }
  for (const item of nicho.memoria) {
    falta.push(`Falta: anotar na memória — ${item}`);
  }
  for (const mensagem of nicho.teste) {
    falta.push(`Falta: testar no botão Testar — "${mensagem}"`);
  }
  return falta;
}

/**
 * O miolo de `montar_pacote_do_nicho`, com o nicho já resolvido — exportado
 * para os testes passarem dublê de dados (nicho com marcador fora do mapa).
 */
export async function montarPacoteDoNicho(
  pedido: PedidoDePacoteDoNicho,
): Promise<ResultadoDePacoteDoNicho> {
  const { nicho, negocio, descricao, nomeDoAgente, followups } = pedido;

  // 1. Sem esqueleto não há prompt para preencher — nada criado.
  if (nicho.esqueleto === null) {
    return {
      ok: false,
      motivo: "nicho_sem_prompt",
      detalhe:
        "PRECISO CONFIRMAR: o prompt deste nicho ainda não foi escrito. " +
        "Use criar_rascunho_de_agente com o texto que combinarmos.",
    };
  }

  // 2. Preencher pelos `campos` do nicho; marcador sem entrada NÃO é chutado.
  const porOrigem: Record<OrigemDeCampoDoNicho, string> = {
    negocio,
    descricao,
    nome_do_agente: nomeDoAgente,
  };
  const valores: Record<string, string> = {};
  for (const campo of nicho.campos) {
    valores[campo.marcador] = porOrigem[campo.de];
  }
  const preenchido = preencherEsqueleto(nicho.esqueleto, valores);
  if (!preenchido.ok) {
    return {
      ok: false,
      motivo: "falta_dado",
      faltam: preenchido.faltam,
      detalhe:
        "PRECISO CONFIRMAR: falta dado para preencher o prompt do nicho " +
        `(${preenchido.faltam.join(", ")}). Diga os valores para continuar.`,
    };
  }

  // 3. Nome duplicado (o banco é unique por org, inclui arquivados) — nada criado.
  const nomes = await nomesDeAgentesDaOrganizacao();
  if (nomes === null) return { ok: false, motivo: "indisponivel" };
  if (nomes.has(nomeDoAgente)) return { ok: false, motivo: "ja_existe" };

  // 4. Follow-up pedido fora do nicho — nada criado.
  const doNicho = new Set(nicho.followups.modelos);
  if (!followups.every((id) => doNicho.has(id))) {
    return { ok: false, motivo: "followup_de_outro_nicho" };
  }

  // 5. Criar o agente; falha devolve o MESMO motivo, sem tentar follow-up.
  const agente = await criarAgenteRascunho({
    nome: nomeDoAgente,
    descricao,
    prompt: preenchido.texto,
    pacotes: [...nicho.pacotes],
    funis: [],
    materiais: [],
  });
  if (!agente.ok) {
    return agente.detalhe === undefined
      ? { ok: false, motivo: agente.motivo }
      : { ok: false, motivo: agente.motivo, detalhe: agente.detalhe };
  }

  // 6. Follow-ups: pede etapa → falta sem instalar; falha → falta sem desfazer.
  const instalados: FollowupCriadoDoPacote[] = [];
  const instaladosIds = new Set<string>();
  const falhasDeFollowup: { id: string; motivo: string }[] = [];
  const comEtapa: string[] = [];
  for (const id of followups) {
    const modelo = modeloPorId(id);
    if (!modelo) {
      falhasDeFollowup.push({ id, motivo: "pedido_invalido" });
      continue;
    }
    if (modelo.pedeEtapa) {
      comEtapa.push(id);
      continue;
    }
    const instalado = await instalarModeloDeFollowup({ model_id: id });
    if (instalado.ok) {
      instalados.push(instalado.followup);
      instaladosIds.add(id);
    } else {
      falhasDeFollowup.push({ id, motivo: instalado.motivo });
    }
  }

  // 7. O que foi criado e o que falta.
  return {
    ok: true,
    criado: { agente: agente.agente, followups: instalados },
    falta: montarFalta(nicho, instaladosIds, falhasDeFollowup, comEtapa),
  };
}

export function criarMontarPacoteDoNicho(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Monta o atendimento de um nicho numa pedida: cria o agente como RASCUNHO (prompt do " +
      "nicho preenchido) e instala os follow-ups de modelo escolhidos, também como rascunho. " +
      "`nicho` (os 7 têm prompt: clínica, imobiliária, serviços, infoproduto, loja, advocacia e genérico), `negocio` (nome do " +
      "negócio), `descricao` (o que faz, em uma frase), `nome_do_agente` e `followups` (ids de " +
      "modelo DESTE nicho, opcionais). Nada publica, nada liga follow-up a agente, nada cria funil.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("montar_pacote_do_nicho", esquemaDeEntrada, async ({ nicho, negocio, descricao, nome_do_agente, followups }) => {
      const dados = nichoPorId(nicho);
      if (!dados) return { ok: false as const, motivo: "pedido_invalido" as const };
      const resultado = await montarPacoteDoNicho({
        nicho: dados,
        negocio,
        descricao,
        nomeDoAgente: nome_do_agente,
        followups: followups ?? [],
      });
      if (resultado.ok) {
        anotarCartaoDeArtefato(entrada.coletor, entrada.ctx.idioma, {
          artefato: "agente",
          nome: resultado.criado.agente.nome,
          href: `/app/ai/agents/${resultado.criado.agente.id}`,
        });
        for (const followup of resultado.criado.followups) {
          anotarCartaoDeArtefato(entrada.coletor, entrada.ctx.idioma, {
            artefato: "followup",
            nome: followup.nome,
            href: `/app/ai/followups/${followup.id}`,
          });
        }
      }
      return resultado;
    }),
  });
}
