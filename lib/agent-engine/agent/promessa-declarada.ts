/**
 * A DECLARAÇÃO DO TURNO GANHA UMA TESTEMUNHA DO SISTEMA.
 *
 * ═══ O DEFEITO, MEDIDO EM PRODUÇÃO (2026-09-16) ═══
 *
 * O agente escreveu ao cliente: *"Vou encaminhar as informações do site
 * imobiliário para análise e te retorno com a proposta."* O cliente saiu da
 * conversa esperando um orçamento. O mecanismo de avisar "o assistente prometeu
 * e ninguém ficou responsável" JÁ EXISTE INTEIRO:
 *
 *   - o agente DECLARA a promessa em `content.declaracao.promessas`;
 *   - o turno enfileira o papel Operador;
 *   - o Operador decide se há dono e, não havendo, emite a atividade
 *     `promise_unowned` e o aviso `promise_unfulfilled` na Central.
 *
 * Nada disso é para construir de novo. Mas em produção ele não produziu aviso
 * nenhum — porque ninguém CONFERE a declaração do modelo contra o que o sistema
 * detectou. `declaracaoDoTurnoSchema` tem `promessas: z.array(...).default([])`:
 * o modelo pode simplesmente OMITIR a promessa, o Zod preenche vazio, e o
 * Operador recebe "nada a fazer". Silencioso.
 *
 * É a mesma família de defeito do resto desta entrega: **o sistema pede ao
 * modelo que reporte algo e nunca verifica**. Foi assim com o `lead_id` que ele
 * inventava.
 *
 * ═══ O CONSERTO, E POR QUE ELE É PEQUENO ═══
 *
 * O gate de promessa roda no turno ANTES de o checkpoint ser gravado. Quando o
 * turno vai gravar a declaração, ele JÁ SABE se o gate flagrou promessa neste
 * turno. O princípio já vale para o negócio da conversa — quem sabe é o sistema,
 * e o auto-relato do modelo não sobrepõe o fato medido.
 *
 * Esta função é o elo PURO que completa a declaração. Não toca banco, não recebe
 * pool: só recebe o que o modelo declarou e o que o sistema detectou, e decide
 * se precisa intervir.
 */
import type { DeclaracaoDoTurno, Promessa } from './declaracao';

/** O que o sistema flagrou neste turno — `texto` é o corpo da mensagem. */
export interface PromessaDetectada {
  houve: boolean;
  texto: string;
}

/** Teto do texto da mensagem que vira `o_que` — a Central não é lugar de despejo. */
const TAMANHO_MAXIMO_DO_TEXTO = 200;

/**
 * O que identifica a promessa na Central como DETECTADA PELO SISTEMA.
 *
 * Não é decorativo: quem lê o aviso precisa saber que o modelo NÃO declarou
 * essa promessa — ela apareceu porque o gate a flagrou no corpo da mensagem.
 * Sem o prefixo, o leitor atribuiria ao modelo uma declaração que ele nunca
 * fez, e as correções futuras (prompt, schema) mirariam o lugar errado.
 */
const PREFIXO_DO_SISTEMA = '(detectada automaticamente pelo sistema) ';

/**
 * Completa a declaração do modelo com a promessa que o sistema detectou.
 *
 * Regras:
 *  - NADA detectado → devolve a declaração COMO VEIO, inclusive `null`. Não
 *    inventa declaração onde o modelo não fez nenhuma.
 *  - DETECTADO e o modelo JÁ declarou promessa → devolve como veio. Sem
 *    duplicar, sem reescrever. O modelo fez o trabalho dele.
 *  - DETECTADO e `promessas` vazio → cópia com UMA promessa acrescentada.
 *  - DETECTADO e declaração `null` → declaração NOVA mínima, com a promessa.
 *
 * `prazo: null` é OBRIGATÓRIO aqui, e não é preguiça: o sistema detectou que
 * HOUVE promessa, não QUANDO ela vence. Inventar um prazo seria o mesmo defeito
 * que `promessaSchema` já documenta — "forçar uma data faria o modelo inventar
 * uma". O schema diz que `prazo` é nullable exatamente para "te retorno assim
 * que souber".
 *
 * PURA e IMUTÁVEL: o objeto recebido NÃO é modificado — o original circula por
 * outros caminhos do turno, e mutá-lo aqui daria a uns leitores a versão vazia
 * e a outros, a completada.
 */
export function declaracaoComPromessaDetectada(
  declaracao: DeclaracaoDoTurno | null,
  detectada: PromessaDetectada,
): DeclaracaoDoTurno | null {
  if (!detectada.houve) return declaracao;

  const textoLimpo = detectada.texto.trim();
  if (textoLimpo === '') return declaracao;

  const oQue =
    PREFIXO_DO_SISTEMA +
    (textoLimpo.length > TAMANHO_MAXIMO_DO_TEXTO
      ? `${textoLimpo.slice(0, TAMANHO_MAXIMO_DO_TEXTO)}…`
      : textoLimpo);

  const nova: Promessa = { o_que: oQue, prazo: null };

  if (declaracao === null) {
    return {
      intencoes: [],
      promessas: [nova],
      nada_a_declarar: false,
    };
  }

  if (declaracao.promessas.length > 0) return declaracao;

  // `nada_a_declarar: false` porque ACABOU de haver o que declarar — o modelo
  // disse que não tinha, o sistema provou que tinha. Manter `true` aqui seria
  // uma declaração que se contradiz na mesma linha.
  return {
    ...declaracao,
    promessas: [nova],
    nada_a_declarar: false,
  };
}
