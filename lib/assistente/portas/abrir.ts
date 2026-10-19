/**
 * Abre uma porta do catálogo para chamada interna, resolvendo o handler e
 * substituindo os parâmetros de caminho (`:x`) pelos valores fornecidos.
 *
 * Para leitura (GET), usa CARREGADORES (portas de leitura permitida).
 * Para escrita (POST/PATCH/PUT), usa CARREGADORES_DE_ESCRITA e só abre se a
 * entrada constar de ESCRITA_PERMITIDA.
 *
 * NUNCA LANÇA: devolve null quando a porta não existe, o método não é
 * permitido, falta/sobra valor ou um valor é inválido.
 */

import { NextRequest } from "next/server";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import {
  CARREGADORES,
  CARREGADORES_DE_ESCRITA,
} from "@/lib/assistente/portas/catalogo.gerado";
import {
  escritaPermitida,
  portaDeLeituraPermitida,
} from "@/lib/assistente/portas/regras";

export type MetodoAbertura = "GET" | "POST" | "PATCH" | "PUT";

/**
 * Handler que recebe `params` (o contrato das rotas Next.js com [param]).
 */
export type HandlerComParams = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const VALOR_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Valores esperados para uma porta (nomes entre colchetes, em ordem), lidos
 * do catálogo.
 */
type PortaDoCatalogo = { id: string; caminho: string; parametros: string[] };

function extrairParametrosDoId(id: string): string[] {
  const out: string[] = [];
  for (const segmento of id.split("/")) {
    const m = segmento.match(/^:(.+)$/);
    if (m) out.push(m[1]!);
  }
  return out;
}

/**
 * Resolve o carregador para `(id, metodo)` e devolve o handler embrulhado com
 * `params`, mais o caminho completo com os valores substituídos.
 *
 * Devolve null se:
 * - a porta não existe no catálogo de leitura ou escrita;
 * - o método não existe nessa porta;
 * - falta ou sobra valor para os parâmetros de caminho;
 * - algum valor não casa com `^[A-Za-z0-9_-]{1,64}$`.
 */
export async function abrirPorta(
  id: string,
  metodo: MetodoAbertura,
  valores: Record<string, string>,
): Promise<{ handler: HandlerDeRota; caminho: string } | null> {
  const parametrosEsperados = extrairParametrosDoId(id);

  // Verifica valores faltando ou sobrando.
  const chavesValores = Object.keys(valores);
  if (chavesValores.length !== parametrosEsperados.length) return null;
  for (const nome of parametrosEsperados) {
    if (!(nome in valores)) return null;
  }

  // Valida cada valor.
  for (const [, valor] of Object.entries(valores)) {
    if (!VALOR_VALIDO.test(valor)) return null;
  }

  // Resolve o carregador.
  let carregador: (() => Promise<Record<string, unknown>>) | undefined;
  let metodoResolvido: "GET" | "POST" | "PATCH" | "PUT";

  if (metodo === "GET") {
    if (!portaDeLeituraPermitida(id)) return null;
    carregador = CARREGADORES[id];
    metodoResolvido = "GET";
  } else {
    if (!escritaPermitida(id, metodo)) return null;
    carregador = CARREGADORES_DE_ESCRITA[id];
    metodoResolvido = metodo;
  }

  if (!carregador) return null;

  const modulo = await carregador();
  const handlerDeRota = modulo[metodoResolvido] as HandlerDeRota | undefined;
  if (!handlerDeRota) return null;

  // Constrói o caminho segmento a segmento, trocando :nome pelo valor.
  // Isso evita que ":id" case dentro de ":idX" (problema do String.replace).
  const caminhoSegmentos: string[] = [];
  for (const segmento of id.split("/")) {
    const m = segmento.match(/^:(.+)$/);
    if (m) {
      const nome = m[1]!;
      if (!(nome in valores)) return null;
      caminhoSegmentos.push(valores[nome]!);
    } else {
      caminhoSegmentos.push(segmento);
    }
  }
  const caminho = "/api/v1/" + caminhoSegmentos.join("/");

  // Embrulha o handler entregando params.
  const handlerComParams: HandlerDeRota = async (req) => {
    const ctx = { params: Promise.resolve(valores) };
    return (handlerDeRota as unknown as HandlerComParams)(req, ctx);
  };

  return { handler: handlerComParams, caminho };
}
