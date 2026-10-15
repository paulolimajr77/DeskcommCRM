/**
 * Os números dos limites de perguntas do assistente, num arquivo SEM dependência.
 *
 * Moram aqui, e não em `limites.ts`, porque `lib/ai/budget/check.ts` precisa do
 * padrão para montar o estado do orçamento e `limites.ts` puxa o dicionário de
 * tradução inteiro (milhares de linhas) — importar um pelo outro arrastaria o
 * dicionário para tudo que lê o orçamento. A faixa também é do banco (CHECKs da
 * migration 0675): mudar um número aqui sem mudar lá faz a rota aceitar o que o
 * banco recusa (500) ou o contrário.
 */
export const PERGUNTAS_POR_PESSOA_PADRAO = 60;
export const MAXIMO_POR_PESSOA = 10000;
export const MAXIMO_POR_ORGANIZACAO = 100000;
/** "Por dia" = as últimas 24 horas corridas, não o dia do calendário. */
export const JANELA_DO_LIMITE_HORAS = 24;
