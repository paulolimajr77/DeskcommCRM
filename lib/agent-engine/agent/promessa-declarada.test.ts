import { describe, expect, it } from 'vitest';

import { declaracaoComPromessaDetectada } from './promessa-declarada';
import {
  declaracaoDoTurnoSchema,
  type DeclaracaoDoTurno,
} from './declaracao';

/**
 * A TESTEMUNHA DO SISTEMA — o modelo não sobrescreve o fato medido.
 *
 * ═══ O DEFEITO QUE ESTA CERCA GUARDA ═══
 *
 * O mecanismo de avisar "o assistente prometeu e ninguém ficou responsável" já
 * existe inteiro; em produção, em 2026-09-16, ele não produziu aviso nenhum.
 * A razão não estava no Operador nem no Zod: estava em NINGUÉM CONFERIR a
 * declaração do modelo contra o que o sistema detectou. O modelo pode omitir a
 * promessa da declaração, o schema preenche `promessas: []`, e o Operador lê
 * "nada a fazer". Silencioso.
 *
 * `declaracaoComPromessaDetectada` é o elo PURO que completa a declaração com
 * a promessa que o gate flagrou. Estes casos exercitam direto — sem turno, sem
 * pool, sem modelo — porque o que precisa ser provado é pequeno e exato: quem
 * sabe é o sistema, o auto-relato do modelo não sobrepõe o fato medido, e o
 * objeto que circula pelo resto do turno não é corrompido.
 *
 * O caso 6 (imutabilidade) é o que separa o conserto dos casos 4 e 5: uma
 * implementação que fizesse `declaracao.promessas.push(...)` passaria nos dois
 * e corromperia o objeto compartilhado. O caso 7 (schema real) é o que impede
 * o módulo de produzir uma declaração que o resto do sistema recusaria — o
 * `declaracaoDoTurnoSchema` é `.strict()`, e um campo a mais reprova.
 */

const TEXTO_DETECTADO =
  'Vou encaminhar as informações do site imobiliário para análise e te retorno com a proposta.';

describe('declaracaoComPromessaDetectada', () => {
  it('nada detectado → a declaração volta idêntica', () => {
    const declaracao: DeclaracaoDoTurno = {
      intencoes: [{ o_que: 'quer remarcar', evidencia: 'e se for outro dia?' }],
      promessas: [{ o_que: 'te retorno com a proposta', prazo: null }],
      nada_a_declarar: false,
    };
    const r = declaracaoComPromessaDetectada(declaracao, { houve: false, texto: TEXTO_DETECTADO });
    expect(r).toEqual(declaracao);
  });

  it('nada detectado e declaração null → volta null', () => {
    // Não inventar declaração onde o modelo não fez nenhuma é o ponto: fabricar
    // uma aqui faria "o modelo não declarou" e "o modelo não tinha nada a
    // declarar" virarem o mesmo estado — a distinção que `declaracao.ts`
    // documenta como operacional (AUSENTE ≠ VAZIA).
    const r = declaracaoComPromessaDetectada(null, { houve: false, texto: TEXTO_DETECTADO });
    expect(r).toBeNull();
  });

  it('detectado e o modelo JÁ declarou uma promessa → volta idêntica, sem duplicar', () => {
    // O modelo fez o trabalho dele; o sistema não estraga. Duplicar (ou
    // reescrever o `o_que` do modelo com o texto bruto da mensagem) faria o
    // Operador ver duas promessas onde há uma — e a detectada pelo sistema
    // ficaria pendurada ao lado da promessa real como se fossem coisas
    // diferentes.
    const declaracao: DeclaracaoDoTurno = {
      intencoes: [],
      promessas: [{ o_que: 'retorno com a proposta', prazo: '2026-09-20T10:00:00-03:00' }],
      nada_a_declarar: false,
    };
    const r = declaracaoComPromessaDetectada(declaracao, { houve: true, texto: TEXTO_DETECTADO });
    expect(r?.promessas).toHaveLength(1);
    expect(r?.promessas[0]?.o_que).toBe('retorno com a proposta');
  });

  it('detectado e `promessas` vazio → ganha exatamente UMA promessa, com `prazo: null`', () => {
    // `prazo: null` é o ponto: o sistema detectou que HOUVE promessa, não QUANDO
    // ela vence. Inventar um prazo aqui é o mesmo defeito que `promessaSchema`
    // documenta — forçar uma data faria o modelo inventar uma.
    const declaracao: DeclaracaoDoTurno = {
      intencoes: [{ o_que: 'quer orçamento', evidencia: 'vocês atendem esse caso?' }],
      promessas: [],
      nada_a_declarar: true,
    };
    const r = declaracaoComPromessaDetectada(declaracao, { houve: true, texto: TEXTO_DETECTADO });
    expect(r?.promessas).toHaveLength(1);
    expect(r?.promessas[0]?.prazo).toBeNull();
    expect(r?.promessas[0]?.o_que).toContain('detectada automaticamente pelo sistema');
  });

  it('detectado e declaração null → nasce uma declaração mínima com a promessa', () => {
    // O modelo não declarou NADA, mas o sistema flagrou promessa. A cobertura do
    // buraco é justamente esta: sintetizar o mínimo que o Operador precisa para
    // abrir o aviso. Sem isto, o auto-relato do modelo venceria o fato medido.
    const r = declaracaoComPromessaDetectada(null, { houve: true, texto: TEXTO_DETECTADO });
    expect(r).not.toBeNull();
    expect(r?.promessas).toHaveLength(1);
    expect(r?.intencoes).toEqual([]);
    expect(r?.nada_a_declarar).toBe(false);
  });

  it('a função NÃO modifica o objeto recebido', () => {
    // Uma implementação que fizesse `declaracao.promessas.push(...)` passaria nos
    // casos 4 e 5 e corromperia o objeto que circula pelo resto do turno — o
    // checkpoint gravaria uma versão, o Operador leria outra. Este caso é o que
    // separa conserto de efeito colateral.
    const declaracao: DeclaracaoDoTurno = {
      intencoes: [{ o_que: 'quer orçamento', evidencia: 'vocês atendem esse caso?' }],
      promessas: [],
      nada_a_declarar: true,
    };
    const copia = structuredClone(declaracao);
    declaracaoComPromessaDetectada(declaracao, { houve: true, texto: TEXTO_DETECTADO });
    expect(declaracao).toEqual(copia);
  });

  it('o resultado é aceito pelo schema real', () => {
    // O `declaracaoDoTurnoSchema` é `.strict()` — campo a mais REPROVA. Este caso
    // é o que impede o módulo de produzir uma declaração que o resto do sistema
    // recusaria. Sem ele, o conserto passaria nos testes puros e morreria na
    // validação do turno, no caminho mais amargo possível.
    const r = declaracaoComPromessaDetectada(null, { houve: true, texto: TEXTO_DETECTADO });
    expect(r).not.toBeNull();
    const parsed = declaracaoDoTurnoSchema.safeParse(r);
    expect(parsed.success).toBe(true);
  });
});
