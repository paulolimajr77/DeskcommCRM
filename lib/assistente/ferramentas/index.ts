/**
 * As ferramentas do assistente interno — o que o modelo pode
 * chamar no turno do chat. Nada escreve fora do histórico e nada navega sozinho:
 *
 *   listar_metricas, consultar_metrica — o catálogo de métricas (T1–T5)
 *   listar_telas, abrir_tela           — a navegação do catálogo, por papel
 *   ler_guia                           — os guias `assistente-*`
 *   ler_configuracao_de_ia, listar_agentes, listar_funis, listar_materiais
 *                                      — a configuração da organização (T11),
 *                                        SÓ para `manager`/`admin`
 *   listar_modelos_de_followup, listar_etapas_do_funil
 *                                      — o catálogo de modelos e as etapas do
 *                                        funil (T13), SÓ para `manager`/`admin`
 *   criar_rascunho_de_agente, instalar_modelo_de_followup
 *                                      — cria agente e follow-up como rascunho
 *                                        (T12/T13), SÓ para `admin`
 *   montar_pacote_do_nicho              — agente + follow-ups de modelo em
 *                                        rascunho, numa pedida, do pacote do
 *                                        nicho (T14b), SÓ para `admin`
 *   testar_agente                       — roda o botão Testar num agente em
 *                                        RASCUNHO (T15), SÓ para `admin`
 *   propor_roteador, propor_conhecimento, propor_memoria,
 *   propor_modelo_dos_auxiliares, propor_funil
 *                                      — PROPÕEM mudança ao vivo (T19): só LEEM e
 *                                        gravam uma proposta `pendente`; quem
 *                                        aplica é a T20 após o clique do admin,
 *                                        SÓ para `admin`
 *
 * Quem monta é a rota do chat (T7): ela entrega o `ContextoDeConsulta` com a
 * organização e o papel DA SESSÃO (nunca do corpo) e um coletor novo por
 * turno; no fim lê o coletor — as métricas que devolveram dado (auditoria) e
 * os botões que o chat mostra. Nenhum `inputSchema` aceita organização, papel,
 * usuário, URL, caminho ou SQL: isso vem do contexto/catálogo, não do modelo.
 */
import type { ToolSet } from "ai";

import { criarAuditarEmpresa } from "./auditar-empresa";
import { criarConsultarMetrica } from "./consultar-metrica";
import { criarInstalarModeloDeFollowup } from "./instalar-modelo-de-followup";
import { criarRascunhoDeAgente } from "./criar-rascunho-de-agente";
import { criarLerGuia } from "./ler-guia";
import { criarLerConfiguracaoDeIa } from "./ler-configuracao-de-ia";
import { criarListarAgentes } from "./listar-agentes";
import { criarListarEtapasDoFunil } from "./listar-etapas-do-funil";
import { criarListarFunis } from "./listar-funis";
import { criarListarMateriais } from "./listar-materiais";
import { criarListarMetricas } from "./listar-metricas";
import { criarListarModelosDeFollowup } from "./listar-modelos-de-followup";
import { criarMontarPacoteDoNicho } from "./montar-pacote-do-nicho";
import { criarProporConhecimento } from "./propor-conhecimento";
import { criarProporFunil } from "./propor-funil";
import { criarProporMemoria } from "./propor-memoria";
import { criarProporModeloDosAuxiliares } from "./propor-modelo-dos-auxiliares";
import { criarProporRoteador } from "./propor-roteador";
import { criarTestarAgente } from "./testar-agente";
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
  const leitura = {
    listar_metricas: criarListarMetricas(entrada),
    consultar_metrica: criarConsultarMetrica(entrada),
    listar_telas: criarListarTelas(entrada),
    abrir_tela: criarAbrirTela(entrada),
    ler_guia: criarLerGuia(entrada),
    auditar_empresa: criarAuditarEmpresa(entrada),
  };
  // As leituras de configuração e de follow-up SÓ para quem gerencia — o papel
  // vem DA SESSÃO. Leitura defensiva: se o papel lançar, monta só a leitura (o
  // erro aparece no execute, como antes, em vez de quebrar a montagem).
  let papel: EntradaDasFerramentas["ctx"]["papel"] | null = null;
  try {
    papel = entrada.ctx.papel;
  } catch {
    papel = null;
  }
  if (papel !== "manager" && papel !== "admin") return leitura;
  const configuracao = {
    ler_configuracao_de_ia: criarLerConfiguracaoDeIa(entrada),
    listar_agentes: criarListarAgentes(entrada),
    listar_funis: criarListarFunis(entrada),
    listar_materiais: criarListarMateriais(entrada),
    listar_modelos_de_followup: criarListarModelosDeFollowup(entrada),
    listar_etapas_do_funil: criarListarEtapasDoFunil(entrada),
  };
  // Escrita SÓ para admin — a trava real continua na rota (defesa em profundidade).
  if (papel !== "admin") return { ...leitura, ...configuracao };
  return {
    ...leitura,
    ...configuracao,
    criar_rascunho_de_agente: criarRascunhoDeAgente(entrada),
    instalar_modelo_de_followup: criarInstalarModeloDeFollowup(entrada),
    montar_pacote_do_nicho: criarMontarPacoteDoNicho(entrada),
    testar_agente: criarTestarAgente(entrada),
    // Mudanças AO VIVO viram PROPOSTA (T19): grava uma linha pendente, não muda nada.
    propor_roteador: criarProporRoteador(entrada),
    propor_conhecimento: criarProporConhecimento(entrada),
    propor_memoria: criarProporMemoria(entrada),
    propor_modelo_dos_auxiliares: criarProporModeloDosAuxiliares(entrada),
    propor_funil: criarProporFunil(entrada),
  };
}
