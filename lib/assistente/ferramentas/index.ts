/**
 * As ferramentas do assistente interno — o que o modelo pode
 * chamar no turno do chat. Nada escreve fora do histórico e nada navega sozinho:
 *
 *   listar_metricas, consultar_metrica — o catálogo de métricas
 *   listar_telas, abrir_tela           — a navegação do catálogo, por papel
 *   ler_guia                           — os guias `assistente-*`
 *   ler_porta, procurar_porta          — leitura e busca pelas portas do catálogo
 *   propor_mudanca, montar_pacote_do_nicho, testar_agente
 *                                        — escritas só para `admin`: propor_mudanca
 *                                        (T3: grava proposta `acao`, quem aplica é T4),
 *                                        montar_pacote_do_nicho (T14a), testar_agente (T13)
 *   auditar_empresa                    — o check-up da organização
 *
 * Quem monta é a rota do chat: ela entrega o `ContextoDeConsulta` com a
 * organização e o papel DA SESSÃO (nunca do corpo) e um coletor novo por
 * turno; no fim lê o coletor — as métricas que devolveram dado (auditoria) e
 * os botões que o chat mostra. Nenhum `inputSchema` aceita organização, papel,
 * usuário, URL, caminho ou SQL: isso vem do contexto/catálogo, não do modelo.
 */
import type { ToolSet } from "ai";

import { criarAuditarEmpresa } from "./auditar-empresa";
import { criarConsultarMetrica } from "./consultar-metrica";
import { criarLerGuia } from "./ler-guia";
import { criarListarMetricas } from "./listar-metricas";
import { criarLerPorta } from "./ler-porta";
import { criarMontarPacoteDoNicho } from "./montar-pacote-do-nicho";
import { criarProcurarPorta } from "./procurar-porta";
import { criarProporMudanca } from "./propor-mudanca";
import { criarAbrirTela, criarListarTelas } from "./telas";
import { criarTestarAgente } from "./testar-agente";
import type { EntradaDasFerramentas } from "./tipos";

export {
  criarColetorDoTurno,
  type AcaoDoChat,
  type ColetorDoTurno,
  type EntradaDasFerramentas,
  type SkillDoAssistente,
} from "./tipos";

/** O teto do laço de chamadas de ferramenta num turno (o knob do turno, nunca constante solta). */
export const MAXIMO_DE_PASSOS_DO_ASSISTENTE = 15;

export function montarFerramentasDoAssistente(entrada: EntradaDasFerramentas): ToolSet {
  const leitura = {
    listar_metricas: criarListarMetricas(entrada),
    consultar_metrica: criarConsultarMetrica(entrada),
    listar_telas: criarListarTelas(entrada),
    abrir_tela: criarAbrirTela(entrada),
    ler_guia: criarLerGuia(entrada),
    ler_porta: criarLerPorta(entrada),
    procurar_porta: criarProcurarPorta(entrada),
    auditar_empresa: criarAuditarEmpresa(entrada),
  };
  // Escrita SÓ para admin — a trava real continua na rota (defesa em profundidade).
  let papel: EntradaDasFerramentas["ctx"]["papel"] | null = null;
  try {
    papel = entrada.ctx.papel;
  } catch {
    papel = null;
  }
  if (papel !== "admin") return leitura;
  return {
    ...leitura,
    propor_mudanca: criarProporMudanca(entrada),
    montar_pacote_do_nicho: criarMontarPacoteDoNicho(entrada),
    testar_agente: criarTestarAgente(entrada),
  };
}
