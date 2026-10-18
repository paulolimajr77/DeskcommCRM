/**
 * O tipo do tradutor injetado no formatador puro (`diff-legivel.ts`).
 *
 * Arquivo próprio de propósito: o formatador é PURO (sem importar React nem
 * hooks) e precisa do tipo sem puxar o `useT` — que só existe em componente.
 * A chave é sempre o texto em português (`lib/i18n/dicionario.ts`).
 */
export type Tradutor = (texto: string) => string;
