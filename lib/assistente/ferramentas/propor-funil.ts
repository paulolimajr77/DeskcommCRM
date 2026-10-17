/**
 * Ferramenta `propor_funil` — PROPÕE criar um funil, criar uma etapa no fim de
 * um funil ou renomear/reposicionar uma etapa. Não aplica nada. Apagar e
 * arquivar não existem aqui.
 *
 * Risco `atencao` (por tipo, no código). Só LÊ (funis e etapas, para conferir
 * que os ids são da organização, evitar nome repetido e montar o "antes"); a
 * única escrita é o POST de propostas. Nome de funil/etapa lido é DADO.
 *
 * Fora do subconjunto, de propósito: ganho/perda (`is_won`/`is_lost`),
 * probabilidade, aviso na Central e janela de esfriamento — mexem no que o
 * funil significa e em automação.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import {
  CAMINHOS,
  camposDeTexto,
  camposForaDaOperacao,
  comoLista,
  cortar,
  enviarProposta,
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

const esquemaDeEntrada = z.strictObject({
  operacao: z.enum(["criar_funil", "criar_etapa", "alterar_etapa"]),
  ...camposDeTexto,
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  depois_de: z.string().uuid().nullable().optional(),
});
type EntradaDoFunil = z.infer<typeof esquemaDeEntrada>;

const CAMPOS = ["pipeline_id", "stage_id", "name", "description", "depois_de"] as const;
const PERMITIDOS = {
  criar_funil: ["name", "description"],
  criar_etapa: ["pipeline_id", "name"],
  alterar_etapa: ["pipeline_id", "stage_id", "name", "depois_de"],
} as const;

const mesmoNome = (a: unknown, b: string): boolean =>
  typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

async function proporFunil(entrada: EntradaDasFerramentas, e: EntradaDoFunil): Promise<ResultadoDaProposta> {
  const fora = camposForaDaOperacao(e, PERMITIDOS[e.operacao], CAMPOS);
  if (fora.length > 0) {
    return parametroInvalido(`Para "${e.operacao}" não valem os campos: ${fora.join(", ")}.`);
  }

  // Pedido incompleto não gasta leitura nenhuma.
  if (e.operacao === "criar_funil" && e.name === undefined) {
    return parametroInvalido('Para "criar_funil" é obrigatório `name`.');
  }
  if (e.operacao !== "criar_funil" && e.pipeline_id === undefined) {
    return parametroInvalido(`Para "${e.operacao}" é obrigatório \`pipeline_id\`.`);
  }
  if (e.operacao === "criar_etapa" && e.name === undefined) {
    return parametroInvalido('Para "criar_etapa" é obrigatório `name`.');
  }
  if (e.operacao === "alterar_etapa") {
    if (e.stage_id === undefined) return parametroInvalido('Para "alterar_etapa" é obrigatório `stage_id`.');
    if (e.name === undefined && e.depois_de === undefined) {
      return parametroInvalido('Para "alterar_etapa" diga o que muda: `name` e/ou `depois_de`.');
    }
  }

  const leituraDeFunis = await ler(await FONTES.funis(), CAMINHOS.funis);
  if (!leituraDeFunis.ok) return INDISPONIVEL;
  const todos = comoLista(leituraDeFunis.dados);
  if (todos === null) return INDISPONIVEL;
  const funis = todos.filter((f) => f.is_archived !== true);

  if (e.operacao === "criar_funil") {
    if (e.name === undefined) return parametroInvalido('Para "criar_funil" é obrigatório `name`.');
    // Funil arquivado não colide (`validarNomeDeFunil` só compara com os ativos).
    if (funis.some((f) => mesmoNome(f.name, e.name!))) {
      return precisoConfirmar(`já existe um funil chamado "${e.name}". Escolha outro nome ou confirme com a pessoa.`);
    }
    return enviarProposta(entrada, {
      kind: "funil",
      resumo: e.resumo,
      motivo: e.motivo,
      antes: null,
      payload: {
        operacao: "criar_funil",
        corpo: { name: e.name, ...(e.description === undefined ? {} : { description: e.description }) },
      },
    });
  }

  if (e.pipeline_id === undefined) return parametroInvalido(`Para "${e.operacao}" é obrigatório \`pipeline_id\`.`);
  const funil = funis.find((f) => f.id === e.pipeline_id);
  if (funil === undefined) {
    return precisoConfirmar("esse funil não aparece nos funis desta organização. Use `listar_funis`.");
  }
  const leituraDeEtapas = await ler(
    await FONTES.etapas(e.pipeline_id),
    `${CAMINHOS.funis}/${e.pipeline_id}/stages`,
  );
  if (!leituraDeEtapas.ok) return falhaDeLeitura(leituraDeEtapas, "o funil");
  const etapas = comoLista(leituraDeEtapas.dados);
  if (etapas === null) return INDISPONIVEL;

  if (e.operacao === "criar_etapa") {
    if (e.name === undefined) return parametroInvalido('Para "criar_etapa" é obrigatório `name`.');
    if (etapas.some((s) => mesmoNome(s.name, e.name!))) {
      return precisoConfirmar(`esse funil já tem uma etapa chamada "${e.name}".`);
    }
    return enviarProposta(entrada, {
      kind: "funil",
      resumo: e.resumo,
      motivo: e.motivo,
      antes: {
        funil: cortar(funil.name, 80),
        etapas: etapas.slice(0, 40).map((s) => cortar(s.name, 80)),
      },
      payload: { operacao: "criar_etapa", pipeline_id: e.pipeline_id, corpo: { name: e.name } },
    });
  }

  // alterar_etapa
  if (e.stage_id === undefined) return parametroInvalido('Para "alterar_etapa" é obrigatório `stage_id`.');
  if (e.name === undefined && e.depois_de === undefined) {
    return parametroInvalido('Para "alterar_etapa" diga o que muda: `name` e/ou `depois_de`.');
  }
  const etapa = etapas.find((s) => s.id === e.stage_id);
  if (etapa === undefined) {
    return precisoConfirmar("essa etapa não aparece nas etapas desse funil. Use `listar_etapas_do_funil`.");
  }
  if (e.depois_de !== undefined && e.depois_de !== null) {
    if (e.depois_de === e.stage_id || !idsDe(etapas).has(e.depois_de)) {
      return precisoConfirmar("a etapa de referência (`depois_de`) não está nesse funil, ou é a própria etapa.");
    }
  }
  if (e.name !== undefined && etapas.some((s) => s.id !== e.stage_id && mesmoNome(s.name, e.name!))) {
    return precisoConfirmar(`esse funil já tem outra etapa chamada "${e.name}".`);
  }
  return enviarProposta(entrada, {
    kind: "funil",
    resumo: e.resumo,
    motivo: e.motivo,
    antes: {
      funil: cortar(funil.name, 80),
      etapa: cortar(etapa.name, 80),
      posicao: typeof etapa.position === "number" ? etapa.position : null,
      ordem_das_etapas: etapas.slice(0, 40).map((s) => cortar(s.name, 80)),
    },
    payload: {
      operacao: "alterar_etapa",
      pipeline_id: e.pipeline_id,
      stage_id: e.stage_id,
      corpo: {
        ...(e.name === undefined ? {} : { name: e.name }),
        ...(e.depois_de === undefined ? {} : { depois_de: e.depois_de }),
      },
    },
  });
}

export function criarProporFunil(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "PROPÕE uma mudança nos funis. Não muda nada: grava uma proposta que o administrador aprova na tela. " +
      "`operacao`: `criar_funil` (name, description opcional), `criar_etapa` (pipeline_id + name — entra no fim " +
      "do funil) ou `alterar_etapa` (pipeline_id + stage_id + name e/ou depois_de = id da etapa que fica à " +
      "esquerda, ou null para a primeira). Apagar e arquivar não são possíveis aqui. Os ids vêm de `listar_funis` e " +
      "`listar_etapas_do_funil`; id que não é da organização vira PRECISO CONFIRMAR. `resumo` é o título para a " +
      "pessoa e `motivo` o porquê. Diga sempre que PROPÔS, nunca que mudou.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("propor_funil", esquemaDeEntrada, (e) => proporFunil(entrada, e)),
  });
}
