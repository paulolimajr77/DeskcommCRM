/**
 * As 5 ferramentas de LEITURA do assistente interno — o que o modelo pode
 * chamar no turno do chat. Nada escreve e nada navega sozinho:
 *
 *   listar_metricas, consultar_metrica — o catálogo de métricas (T1–T5)
 *   listar_telas, abrir_tela           — a navegação do catálogo, por papel
 *   ler_guia                           — os guias `assistente-*`
 *
 * Quem monta é a rota do chat (T7): ela entrega o `ContextoDeConsulta` com a
 * organização e o papel DA SESSÃO (nunca do corpo) e um coletor novo por
 * turno; no fim lê o coletor — as métricas que devolveram dado (auditoria) e
 * os botões que o chat mostra. Nenhum `inputSchema` aceita organização, papel,
 * usuário, URL, caminho ou SQL: isso vem do contexto/catálogo, não do modelo.
 */
import type { ToolSet } from "ai";

import { criarConsultarMetrica } from "./consultar-metrica";
import { criarLerGuia } from "./ler-guia";
import { criarListarMetricas } from "./listar-metricas";
import { criarAbrirTela, criarListarTelas } from "./telas";
import type { EntradaDasFerramentas } from "./tipos";

export {
  criarColetorDoTurno,
  type AcaoDoChat,
  type ColetorDoTurno,
  type EntradaDasFerramentas,
  type SkillDoAssistente,
} from "./tipos";

/** O teto do laço de chamadas de ferramenta num turno (o knob do turno, nunca constante solta). */
export const MAXIMO_DE_PASSOS_DO_ASSISTENTE = 6;

export function montarFerramentasDoAssistente(entrada: EntradaDasFerramentas): ToolSet {
  return {
    listar_metricas: criarListarMetricas(entrada),
    consultar_metrica: criarConsultarMetrica(entrada),
    listar_telas: criarListarTelas(entrada),
    abrir_tela: criarAbrirTela(entrada),
    ler_guia: criarLerGuia(entrada),
  };
}
