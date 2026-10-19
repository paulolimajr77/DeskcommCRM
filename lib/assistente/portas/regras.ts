/**
 * Regras de leitura e escrita do catálogo de portas do assistente interno.
 *
 * Ler: qualquer porta da empresa (GET), exceto prefixos proibidos, portas
 * proibidas exatas e sufixos proibidos (OAuth). Escrever: proibido por
 * padrão, liberado só o que está em ESCRITA_PERMITIDA (aprovada pelo Paulo).
 * Nenhum DELETE.
 */

import type { Metodo, PortaDoCatalogo } from "./tipos";
import { CATALOGO_DE_PORTAS } from "./catalogo.gerado";
import {
  AREAS_SO_LEITURA,
  ESCRITA_PERMITIDA,
  PREFIXOS_PROIBIDOS,
  PORTAS_PROIBIDAS,
  SUFIXOS_PROIBIDOS,
  casaComPrefixo,
  ehProibida,
} from "./listas";

/**
 * Verdadeiro se `id` existe no catálogo, expõe `GET`, não casa com nenhum
 * prefixo proibido, não é uma porta proibida exata e não termina com um
 * sufixo proibido (OAuth).
 */
export function portaDeLeituraPermitida(id: string): boolean {
  const porta = CATALOGO_DE_PORTAS.find((p) => p.id === id);
  if (!porta) return false;
  if (!porta.metodos.includes("GET")) return false;
  if (ehProibida(id)) return false;
  return true;
}

/**
 * Verdadeiro se a escrita em `id` com `metodo` é permitida.
 *
 * `DELETE` é sempre recusado (sem exceção). Para `POST`/`PATCH`/`PUT`:
 * - recusa se casar com PREFIXOS_PROIBIDOS, PORTAS_PROIBIDAS, sufixos
 *   proibidos ou AREAS_SO_LEITURA;
 * - senão, só se o par (porta, metodo) está em ESCRITA_PERMITIDA.
 */
export function escritaPermitida(
  id: string,
  metodo: Metodo,
): boolean {
  if (metodo === "DELETE") return false;
  if (metodo !== "POST" && metodo !== "PATCH" && metodo !== "PUT") return false;
  if (
    ehProibida(id) ||
    AREAS_SO_LEITURA.some((prefixo) => casaComPrefixo(id, prefixo))
  ) {
    return false;
  }
  return ESCRITA_PERMITIDA.some(
    (e) => e.porta === id && e.metodo === metodo,
  );
}

// Reexporta as listas para consumo por outros módulos e testes.
export {
  AREAS_SO_LEITURA,
  ESCRITA_PERMITIDA,
  PREFIXOS_PROIBIDOS,
  PORTAS_PROIBIDAS,
  SUFIXOS_PROIBIDOS,
  casaComPrefixo,
  ehProibida,
};

/**
 * Verdadeiro se o método de escrita (POST/PATCH/PUT) é permitido para a porta.
 */
export function tipoDeMetodoPermitido(
  id: string,
  metodo: "POST" | "PATCH" | "PUT",
): boolean {
  return escritaPermitida(id, metodo);
}
