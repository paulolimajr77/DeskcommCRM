/**
 * Limite da leitura de porta em bytes.
 *
 * 24 KB: suficiente para a maioria das consultas, pequeno o suficiente para não
 * estourar o contexto do modelo em uma única resposta.
 */
export const LIMITE_DA_LEITURA_EM_BYTES = 24 * 1024;
