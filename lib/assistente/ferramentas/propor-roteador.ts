/**
 * Ferramenta `propor_roteador` — PROPÕE criar um roteador, mudar o nome/agente
 * de reserva dele ou trocar a lista de intenções. Não aplica nada.
 *
 * O roteador mexe no número ativo (um por número de WhatsApp), então o risco é
 * `atencao` — decidido pelo código (`operacoes.ts`), nunca pelo modelo. Só LÊ
 * (canais, roteadores, agentes) para conferir que todo id citado é da
 * organização e para montar o "antes"; a única escrita é o POST de propostas.
 * Id que não aparece na leitura → `PRECISO CONFIRMAR`, sem propor.
 *
 * Recusas fechadas, com o porquê:
 *  - `membros` SUBSTITUI a lista inteira. Se um membro atual tem roteiro, funil
 *    ou etapa de destino, a proposta (que não leva esses campos) os apagaria em
 *    silêncio — então a ferramenta não propõe e manda a pessoa à tela.
 *  - `criar` num número que já tem roteador ativo seria um 409 na aplicação.
 *
 * Só para `admin` (a montagem barra os outros papéis; a rota barra de novo).
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import {
  CAMINHOS,
  camposDeTexto,
  camposForaDaOperacao,
  comoLista,
  conferirAgentes,
  cortar,
  enviarProposta,
  eObjeto,
  falhaDeLeitura,
  FONTES,
  idsDe,
  INDISPONIVEL,
  ler,
  parametroInvalido,
  precisoConfirmar,
  type ResultadoDaProposta,
} from "./proposta-comum";
import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const LINK_DA_TELA_DE_ROTEADORES = "/app/ai/routers";

const membroDeEntrada = z.strictObject({
  agent_id: z.string().uuid(),
  intent_name: z.string().trim().min(1).max(120),
  intent_description: z.string().trim().min(1).max(2000),
  examples: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
});

const esquemaDeEntrada = z.strictObject({
  operacao: z.enum(["criar", "alterar", "membros"]),
  ...camposDeTexto,
  router_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  channel_session_id: z.string().uuid().optional(),
  fallback_agent_id: z.string().uuid().nullable().optional(),
  members: z.array(membroDeEntrada).min(1).max(20).optional(),
});
type EntradaDoRoteador = z.infer<typeof esquemaDeEntrada>;

const CAMPOS_DA_OPERACAO = ["router_id", "name", "channel_session_id", "fallback_agent_id", "members"] as const;
const PERMITIDOS = {
  criar: ["name", "channel_session_id", "fallback_agent_id"],
  alterar: ["router_id", "name", "fallback_agent_id"],
  membros: ["router_id", "members"],
} as const;

async function proporRoteador(
  entrada: EntradaDasFerramentas,
  e: EntradaDoRoteador,
): Promise<ResultadoDaProposta> {
  const fora = camposForaDaOperacao(e, PERMITIDOS[e.operacao], CAMPOS_DA_OPERACAO);
  if (fora.length > 0) {
    return parametroInvalido(`Para "${e.operacao}" não valem os campos: ${fora.join(", ")}.`);
  }

  if (e.operacao === "criar") {
    if (e.name === undefined || e.channel_session_id === undefined) {
      return parametroInvalido('Para "criar" são obrigatórios `name` e `channel_session_id`.');
    }
    const canais = await ler(await FONTES.canais(), CAMINHOS.canais);
    if (!canais.ok) return INDISPONIVEL;
    const listaDeCanais = comoLista(canais.dados);
    if (listaDeCanais === null) return INDISPONIVEL;
    if (!idsDe(listaDeCanais).has(e.channel_session_id)) {
      return precisoConfirmar(
        `esse número de WhatsApp não aparece nos canais desta organização. Confirme qual número em ${LINK_DA_TELA_DE_ROTEADORES}.`,
      );
    }
    const roteadores = await ler(await FONTES.roteadores(), CAMINHOS.roteadores);
    if (!roteadores.ok) return INDISPONIVEL;
    const lista = eObjeto(roteadores.dados) ? comoLista(roteadores.dados.routers) : null;
    if (lista === null) return INDISPONIVEL;
    if (lista.some((r) => r.channel_session_id === e.channel_session_id && r.is_active === true)) {
      return precisoConfirmar(
        "esse número já tem um roteador ativo (cada número aceita um só). Para mudar o que existe, proponha `alterar` ou `membros` nele.",
      );
    }
    if (e.fallback_agent_id) {
      const agentes = await conferirAgentes([e.fallback_agent_id]);
      if (agentes !== null) return agentes;
    }
    return enviarProposta(entrada, {
      kind: "roteador",
      resumo: e.resumo,
      motivo: e.motivo,
      antes: null,
      payload: {
        operacao: "criar",
        corpo: {
          name: e.name,
          channel_session_id: e.channel_session_id,
          ...(e.fallback_agent_id === undefined ? {} : { fallback_agent_id: e.fallback_agent_id }),
        },
      },
    });
  }

  // alterar / membros: o roteador tem de existir DESTA organização (404 = não é daqui).
  if (e.router_id === undefined) return parametroInvalido(`Para "${e.operacao}" é obrigatório \`router_id\`.`);
  const detalhe = await ler(await FONTES.roteador(e.router_id), `${CAMINHOS.roteadores}/${e.router_id}`);
  if (!detalhe.ok) return falhaDeLeitura(detalhe, "o roteador");
  const roteador = eObjeto(detalhe.dados) && eObjeto(detalhe.dados.router) ? detalhe.dados.router : null;
  if (roteador === null) return INDISPONIVEL;
  const membrosAtuais = eObjeto(detalhe.dados) ? (comoLista(detalhe.dados.members) ?? []) : [];

  if (e.operacao === "alterar") {
    if (e.name === undefined && e.fallback_agent_id === undefined) {
      return parametroInvalido('Para "alterar" diga o que muda: `name` e/ou `fallback_agent_id`.');
    }
    if (e.fallback_agent_id) {
      const agentes = await conferirAgentes([e.fallback_agent_id]);
      if (agentes !== null) return agentes;
    }
    return enviarProposta(entrada, {
      kind: "roteador",
      resumo: e.resumo,
      motivo: e.motivo,
      antes: {
        nome: cortar(roteador.name, 120),
        agente_de_reserva_id: typeof roteador.fallback_agent_id === "string" ? roteador.fallback_agent_id : null,
        ativo: roteador.is_active === true,
      },
      payload: {
        operacao: "alterar",
        router_id: e.router_id,
        corpo: {
          ...(e.name === undefined ? {} : { name: e.name }),
          ...(e.fallback_agent_id === undefined ? {} : { fallback_agent_id: e.fallback_agent_id }),
        },
      },
    });
  }

  // membros
  if (e.members === undefined) return parametroInvalido('Para "membros" é obrigatório `members`.');
  const comDestino = membrosAtuais.some(
    (m) => m.flow_pointer_id != null || m.pipeline_id != null || m.stage_id != null,
  );
  if (comDestino) {
    return precisoConfirmar(
      "alguma intenção deste roteador tem roteiro, funil ou etapa de destino, e trocar a lista inteira por aqui apagaria esses vínculos. " +
        `Peça à pessoa para editar as intenções em ${LINK_DA_TELA_DE_ROTEADORES}.`,
    );
  }
  const agentes = await conferirAgentes([...new Set(e.members.map((m) => m.agent_id))]);
  if (agentes !== null) return agentes;
  return enviarProposta(entrada, {
    kind: "roteador",
    resumo: e.resumo,
    motivo: e.motivo,
    antes: {
      nome: cortar(roteador.name, 120),
      intencoes: membrosAtuais.slice(0, 20).map((m) => ({
        agente_id: typeof m.agent_id === "string" ? m.agent_id : null,
        nome: cortar(m.intent_name, 120),
        descricao: cortar(m.intent_description, 300),
        exemplos: Array.isArray(m.examples)
          ? m.examples.slice(0, 3).map((x) => cortar(x, 100))
          : [],
      })),
    },
    payload: { operacao: "membros", router_id: e.router_id, corpo: { members: e.members } },
  });
}

export function criarProporRoteador(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "PROPÕE uma mudança no roteador (quem atende cada intenção de um número de WhatsApp). Não muda nada: " +
      "grava uma proposta que o administrador aprova na tela. `operacao`: `criar` (name, channel_session_id do " +
      "canal, fallback_agent_id opcional), `alterar` (router_id + name e/ou fallback_agent_id) ou `membros` " +
      "(router_id + members: cada um com agent_id, intent_name, intent_description e examples — SUBSTITUI a lista " +
      "inteira). `resumo` é o título para a pessoa e `motivo` o porquê. Os ids vêm de `listar_agentes` e dos canais; " +
      "id que não é da organização vira PRECISO CONFIRMAR. Diga sempre que PROPÔS, nunca que mudou.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("propor_roteador", esquemaDeEntrada, (e) => proporRoteador(entrada, e)),
  });
}
