/**
 * Ferramenta `propor_modelo_dos_auxiliares` — PROPÕE trocar o modelo de IA de um
 * ponto da empresa (`definir_ponto`) ou o modelo padrão (`definir_padrao`). Não
 * aplica nada.
 *
 * Risco `atencao` (por tipo, no código): o modelo decide para onde vão o custo e
 * os dados do cliente. Duas travas:
 *
 *  - CREDENCIAL NUNCA É PREENCHIDA PELA IA. Não existe `credential_id` nesta
 *    ferramenta, no esquema da proposta nem no `base_url`/`is_enabled` do PUT.
 *    O PUT de provedores, sem `credential_id`, grava `credential_id = null` no
 *    ponto (e o upsert sobrescreve a credencial que o ponto já tinha); a
 *    ferramenta avisa quando o provedor não tem chave validada.
 *  - NADA DE STRING INVENTADA. O provedor tem de estar entre os que a instalação
 *    oferece, o modelo tem de estar no catálogo desse provedor e o ponto tem de
 *    ser um ponto da empresa que aceita escolha — tudo lido do `GET
 *    /api/v1/ai/providers`, a MESMA fonte da tela Provedores. Catálogo vazio
 *    (instalação sem sincronização) → `PRECISO CONFIRMAR`, nunca palpite.
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
  eObjeto,
  FONTES,
  INDISPONIVEL,
  ler,
  parametroInvalido,
  precisoConfirmar,
  type ResultadoDaProposta,
} from "./proposta-comum";
import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const LINK_DA_TELA_DE_PROVEDORES = "/app/ai/providers";
const LINK_DA_TELA_DE_CREDENCIAIS = "/app/ai/credentials";

const esquemaDeEntrada = z.strictObject({
  operacao: z.enum(["definir_ponto", "definir_padrao"]),
  ...camposDeTexto,
  purpose: z.string().trim().min(1).max(60).optional(),
  provider: z.string().trim().min(1).max(60),
  model_id: z.string().trim().min(1).max(200).optional(),
  default_model: z.string().trim().min(1).max(200).optional(),
});
type EntradaDoModelo = z.infer<typeof esquemaDeEntrada>;

const CAMPOS = ["purpose", "model_id", "default_model"] as const;
const PERMITIDOS = { definir_ponto: ["purpose", "model_id"], definir_padrao: ["default_model"] } as const;

async function proporModelo(
  entrada: EntradaDasFerramentas,
  e: EntradaDoModelo,
): Promise<ResultadoDaProposta> {
  const fora = camposForaDaOperacao(e, PERMITIDOS[e.operacao], CAMPOS);
  if (fora.length > 0) {
    return parametroInvalido(`Para "${e.operacao}" não valem os campos: ${fora.join(", ")}.`);
  }
  const modelo = e.operacao === "definir_ponto" ? e.model_id : e.default_model;
  if (modelo === undefined) {
    return parametroInvalido(
      `Para "${e.operacao}" é obrigatório \`${e.operacao === "definir_ponto" ? "model_id" : "default_model"}\`.`,
    );
  }
  if (e.operacao === "definir_ponto" && e.purpose === undefined) {
    return parametroInvalido('Para "definir_ponto" é obrigatório `purpose` (o ponto de IA).');
  }

  const leitura = await ler(await FONTES.provedores(), CAMINHOS.provedores);
  if (!leitura.ok) return INDISPONIVEL;
  const dados = leitura.dados;
  if (!eObjeto(dados)) return INDISPONIVEL;
  const pontos = comoLista(dados.pontos);
  const provedores = comoLista(dados.provedores);
  const modelos = comoLista(dados.modelos);
  const credenciais = comoLista(dados.credenciais);
  if (pontos === null || provedores === null || modelos === null || credenciais === null) return INDISPONIVEL;

  // O provedor tem de ser um dos que ESTA instalação oferece.
  if (!provedores.some((p) => p.id === e.provider)) {
    return precisoConfirmar(
      `o provedor "${e.provider}" não está entre os oferecidos nesta instalação. Veja a lista em ${LINK_DA_TELA_DE_PROVEDORES}.`,
    );
  }
  // O modelo tem de estar no catálogo DAQUELE provedor (a mesma lista da tela).
  if (!modelos.some((m) => m.provider === e.provider && m.model_id === modelo)) {
    return precisoConfirmar(
      `não achei o modelo "${modelo}" no catálogo do provedor "${e.provider}" desta organização. ` +
        `Confirme o nome exato em ${LINK_DA_TELA_DE_PROVEDORES}.`,
    );
  }

  let antes: Record<string, unknown>;
  let payload: Record<string, unknown>;
  if (e.operacao === "definir_ponto") {
    const ponto = pontos.find((p) => p.id === e.purpose);
    if (ponto === undefined) {
      return precisoConfirmar(`o ponto de IA "${e.purpose}" não existe nesta organização.`);
    }
    if (ponto.fixo !== null && ponto.fixo !== undefined) {
      return precisoConfirmar(`o ponto "${e.purpose}" é fixo no produto e não aceita troca de modelo.`);
    }
    const efetivo = eObjeto(ponto.efetivo) ? ponto.efetivo : {};
    antes = {
      ponto: e.purpose,
      provedor: cortar(efetivo.provider, 60),
      modelo: cortar(efetivo.modelId, 200),
      origem: cortar(efetivo.origem, 40),
    };
    payload = {
      operacao: "definir_ponto",
      corpo: { purpose: e.purpose, provider: e.provider, model_id: modelo },
    };
  } else {
    const padrao = eObjeto(dados.padrao) ? dados.padrao : {};
    antes = { provedor: cortar(padrao.provider, 60), modelo: cortar(padrao.defaultModel, 200) };
    payload = { operacao: "definir_padrao", corpo: { provider: e.provider, default_model: modelo } };
  }

  const avisos: string[] = [];
  const temChave = credenciais.some(
    (c) => c.provider === e.provider && c.validated_at != null && c.is_active !== false,
  );
  if (!temChave) {
    avisos.push(
      `Ainda não há chave validada do provedor "${e.provider}": o modelo só funciona depois que alguém cadastrar a chave em ${LINK_DA_TELA_DE_CREDENCIAIS}. A IA nunca preenche chave.`,
    );
  }

  return enviarProposta(entrada, {
    kind: "modelo_auxiliares",
    resumo: e.resumo,
    motivo: e.motivo,
    antes,
    payload,
    avisos,
  });
}

export function criarProporModeloDosAuxiliares(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "PROPÕE trocar o modelo de IA da empresa. Não muda nada: grava uma proposta que o administrador aprova na " +
      "tela. `operacao`: `definir_ponto` (purpose = o ponto de IA, provider, model_id) ou `definir_padrao` " +
      "(provider, default_model — vale para todo ponto sem escolha própria). Provedor e modelo só valem se " +
      "estiverem no catálogo da empresa (a mesma lista da tela Provedores); chave NUNCA é preenchida pela IA. " +
      "`resumo` é o título para a pessoa e `motivo` o porquê. Diga sempre que PROPÔS, nunca que trocou.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("propor_modelo_dos_auxiliares", esquemaDeEntrada, (e) => proporModelo(entrada, e)),
  });
}
