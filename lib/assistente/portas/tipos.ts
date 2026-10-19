/**
 * Tipos do catálogo gerado das portas `/api/v1`.
 *
 * Este módulo é puro: não importa rotas, não faz disco, não conhece o
 * ambiente. É a camada de contrato entre o gerador (`scripts/gerar-catalogo-de-portas.ts`)
 * e as regras de leitura/escrita (`regras.ts`).
 */

export type Metodo = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Uma porta do catálogo.
 *
 * - `id`: caminho sem `/api/v1/`, com `[x]` virando `:x` (ex.: `ai/agents/:id`).
 * - `caminho`: caminho completo sob `app/api/v1`, sem o `route.ts`.
 * - `metodos`: verbos HTTP que a porta expõe.
 * - `parametros`: nomes entre colchetes, em ordem de aparição no caminho.
 * - `area`: primeiro segmento do caminho (ex.: `ai`, `campaigns`, `team`).
 * - `resumo`: primeira frase do comentário de cabeçalho do `route.ts` (vazio se não houver).
 */
export type PortaDoCatalogo = {
  id: string;
  caminho: string;
  metodos: Metodo[];
  parametros: string[];
  area: string;
  resumo: string;
};
