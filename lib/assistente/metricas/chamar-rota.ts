/**
 * Chama o handler de uma rota `/api/v1` POR DENTRO, sem rede e sem cookies.
 *
 * POR QUE FUNCIONA: os handlers deste repositório resolvem login, organização
 * e papel com `requireRole`/`loadAuthUser`/`createClient`, que leem o contexto
 * da requisição CORRENTE pelos helpers do Next (`cookies()`/`headers()` de
 * `next/headers`) — nenhum deles lê `req.cookies`/`req.headers` do argumento.
 * O `NextRequest` sintético, então, só precisa carregar a URL com a query.
 * Quem chama roda DENTRO de um turno autenticado (a rota do chat), e o
 * contexto herdado é o da pessoa que perguntou: a organização nunca vem do
 * modelo e nunca viaja na URL.
 *
 * Também ESCREVE: com `opcoes.metodo` POST/PATCH/PUT, o pedido leva o corpo em
 * JSON. (`PUT` entrou na T20 — as rotas `roteador/membros` e
 * `modelo_auxiliares/definir_ponto` são PUT — e `DELETE` NÃO existe de
 * propósito: nenhuma proposta apaga nada.) A permissão continua sendo a do
 * handler (`requireRole`, `requireSupportWrite`, `audit()`, RLS) — esta função
 * não autoriza nada.
 *
 * NUNCA LANÇA: qualquer exceção do handler vira `{ falhou }` — logado só com
 * `caminho` e `detalhe`, nunca com o corpo do pedido ou da resposta, que pode
 * carregar dado de cliente.
 */
import { NextRequest } from "next/server";

import { logger } from "@/lib/logger";

import type { Papel } from "./tipos";

export type HandlerDeRota = (req: NextRequest) => Promise<Response>;

export type RespostaDaRota = { status: number; corpo: unknown } | { falhou: string };

export type OpcoesDeChamadaInterna = {
  metodo?: "GET" | "POST" | "PATCH" | "PUT";
  corpo?: unknown;
};

export async function chamarRotaPorDentro(
  handler: HandlerDeRota,
  caminho: string,
  query: Record<string, string>,
  opcoes?: OpcoesDeChamadaInterna,
): Promise<RespostaDaRota> {
  try {
    const url = new URL(caminho, "http://interno.invalid");
    for (const [chave, valor] of Object.entries(query)) url.searchParams.set(chave, valor);
    const metodo = opcoes?.metodo ?? "GET";
    const ehEscrita = metodo === "POST" || metodo === "PATCH" || metodo === "PUT";
    const requisicao = new NextRequest(url, {
      method: metodo,
      ...(ehEscrita && opcoes?.corpo !== undefined
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(opcoes.corpo) }
        : {}),
    });
    const resposta = await handler(requisicao);
    let corpo: unknown = null;
    try {
      corpo = await resposta.json();
    } catch {
      corpo = null;
    }
    return { status: resposta.status, corpo };
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    logger.warn("assistente.metricas.chamada_interna_falhou", { caminho, detalhe });
    return { falhou: "a chamada interna à rota falhou" };
  }
}

export type VereditoDaRota =
  | { ok: true; dados: unknown }
  | { ok: false; motivo: "sem_permissao"; papel_minimo: Papel }
  | { ok: false; motivo: "parametro_invalido"; detalhe: string }
  | { ok: false; motivo: "indisponivel"; detalhe: string };

/**
 * Traduz a resposta da rota para o contrato de métrica. O envelope
 * `{ data, meta }` é desembrulhado AQUI (o `meta` não passa); 401/403 viram
 * `sem_permissao` com o papel mínimo da DEFINIÇÃO — nunca adivinhado pela
 * resposta; 400/404/422 viram `parametro_invalido` com o CÓDIGO do catálogo
 * de erros (a mensagem da rota não é ecoada); o resto é indisponível.
 */
export function traduzirResposta(resposta: RespostaDaRota, papelMinimo: Papel): VereditoDaRota {
  if ("falhou" in resposta) {
    return { ok: false, motivo: "indisponivel", detalhe: "a chamada interna à rota falhou" };
  }
  const { status, corpo } = resposta;
  if (status >= 200 && status < 300) {
    const dados =
      corpo !== null && typeof corpo === "object" && "data" in corpo
        ? (corpo as { data: unknown }).data
        : undefined;
    return { ok: true, dados };
  }
  if (status === 401 || status === 403) {
    return { ok: false, motivo: "sem_permissao", papel_minimo: papelMinimo };
  }
  if (status === 400 || status === 404 || status === 422) {
    const codigo =
      corpo !== null && typeof corpo === "object" && "error" in corpo
        ? (corpo as { error?: { code?: unknown } }).error?.code
        : undefined;
    return {
      ok: false,
      motivo: "parametro_invalido",
      detalhe: typeof codigo === "string" ? codigo : "a validação da rota recusou o pedido",
    };
  }
  return { ok: false, motivo: "indisponivel", detalhe: "a rota respondeu erro interno" };
}
