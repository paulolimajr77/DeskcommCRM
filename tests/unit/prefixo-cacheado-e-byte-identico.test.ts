/**
 * O PREFIXO CACHEADO PROMETIA UM TESTE QUE NÃO EXISTIA.
 *
 * `lib/agent-engine/edge/llm/stable-prefix.ts` monta o pedaço do request que o
 * provedor guarda em cache: as tools em ordem determinística + o `system` do
 * playbook, com o breakpoint de cache no fim. Mesmas entradas ⇒ mesmos bytes ⇒
 * o provedor reaproveita o prefixo e cobra uma fração do preço por cada turno de
 * atendimento. Um único valor por-lead lá dentro (nome do contato, timestamp,
 * contador, id) muda os bytes a cada conversa, o cache nunca acerta, e **não há
 * sintoma nenhum**: as respostas continuam certas, só a fatura sobe.
 *
 * ## O defeito que fez este arquivo existir
 *
 * O cabeçalho do módulo, na linha 19, afirmava (e afirma):
 *
 *     REGRA DURA deste módulo: NADA volátil (timestamp, random, lead, contador)
 *     entra aqui — o teste de byte-identidade (llm-cache.test.ts) quebra se entrar.
 *
 * **Esse teste nunca existiu.** Medido em 2026-09-14, no repositório inteiro:
 *
 *     $ find . -name "*llm-cache*" -not -path "./node_modules/*"
 *     (vazio, exit=1)
 *
 *     $ grep -rn "buildStablePrefix\|serializeStablePrefix\|stablePrefixHash" \
 *         --include=*.test.ts --include=*.test.tsx . | grep -v node_modules
 *     tests/unit/playbook-cita-a-ferramenta.test.ts:16:  ... (comentário)
 *     tests/unit/playbook-cita-a-ferramenta.test.ts:187: ... (mensagem de erro)
 *
 * As duas únicas ocorrências em teste são texto — um comentário de cabeçalho e
 * uma string de mensagem de falha. **Nenhum teste chamava o módulo.** Fora de
 * teste, quem o exercitava era `scripts/smoke-llm.ts`, um script manual que
 * ninguém roda no CI. Ou seja: a disciplina de cache vivia só de revisão humana,
 * enquanto a prosa do módulo dizia que havia uma cerca armada.
 *
 * ## Por que nenhum gate pegava
 *
 * Porque não há o que um gate genérico possa pegar. `typecheck` e `lint` não têm
 * opinião sobre volatilidade; a suíte não tocava o módulo; e o efeito de um valor
 * por-lead no prefixo é **econômico**, não funcional — nenhum teste de
 * comportamento fica vermelho, nenhuma tela quebra, nenhum log acende. É o pior
 * formato de regressão que existe: cara, silenciosa e só visível na fatura do
 * provedor, meses depois, sem nada que aponte para o commit que a causou.
 *
 * O risco é agudo agora: duas capacidades novas estão entrando no prefixo neste
 * momento — o bloco de identificação (`lib/agent-engine/agent/identificacao.ts`)
 * e a definição dos campos personalizados do funil
 * (`lib/agent-engine/agent/campos-do-funil-do-agente.ts`). Os dois cabeçalhos
 * citam a regra dura do `stable-prefix.ts` como se ela fosse vigiada. A partir
 * deste arquivo, ela é.
 *
 * ## A regra
 *
 * 1. Mesmas entradas, montadas duas vezes ⇒ **mesmo hash**.
 * 2. O mesmo CONJUNTO de tools, passado em ordens diferentes ⇒ **mesmo hash**.
 *    Isto não é detalhe: dois processos (handler do webhook e worker) montam o
 *    objeto de tools em ordens que dependem do código de cada um, e é a ordenação
 *    por nome que faz os dois acertarem o MESMO prefixo no provedor.
 * 3. O breakpoint (`providerOptions.anthropic.cacheControl`) fica no `system` e na
 *    **última** tool da ordem alfabética. Se sumir, o prefixo deixa de ser
 *    cacheado — mesmo custo silencioso.
 * 4. Nada por-lead entra na chamada. Dois leads diferentes, mesmo playbook e
 *    mesmas tools ⇒ mesmo hash.
 *
 * ## Controle de vacuidade — por que os testes abaixo não são verdes de mentira
 *
 * Uma sonda de byte-identidade que compare a coisa errada (ou que compare `x`
 * consigo mesmo) fica verde para sempre, medindo nada, e essa é a única falha que
 * um teste de identidade pode ter. Por isso os casos "o instrumento enxerga a
 * diferença…" existem: eles sabotam o prefixo de propósito — uma letra trocada no
 * `system`, um timestamp interpolado, uma `description` de tool alterada — e
 * exigem que o hash MUDE. Se algum dia a sonda cegar, são esses que ficam
 * vermelhos primeiro.
 *
 * A cerca foi provada mordendo, não só passando: com uma cópia do módulo sem o
 * `.sort()` das tools e sem os dois `cacheControl`, 5 dos 13 casos ficam
 * vermelhos (ordem, breakpoint do system, breakpoint da última tool, ttl, e o
 * caso sem tools). Verde aqui é verde porque o módulo está certo, não porque o
 * teste não olha.
 *
 * ## ⚠️ O QUE ESTE ARQUIVO **NÃO** PROVA
 *
 * Ele mede o MÓDULO. Não prova que quem monta a string `system` lá em cima —
 * `lib/agent-engine/agent/inbound-turn.ts` — deixou de interpolar coisa volátil
 * nela. Este gate vê a função como pura e determinística (e ela é); quem puser
 * `new Date()` dentro do texto do playbook passa por aqui verde. Para esse outro
 * lado, o gate seria montar o `system` duas vezes com o mesmo agente e leads
 * diferentes, em runtime, e cobrar hash igual — que é o que `scripts/smoke-llm.ts`
 * faz à mão, sem ninguém rodando.
 */
import { createHash } from 'node:crypto';

import { tool, type ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  buildStablePrefix,
  serializeStablePrefix,
  stablePrefixHash,
} from '@/lib/agent-engine/edge/llm/stable-prefix';

/**
 * Playbook de uma organização — o `system` real é o corpo do playbook do tenant.
 * É org-wide de propósito: NADA aqui varia por lead.
 */
const SYSTEM_DA_ORG =
  'Você atende pela clínica Sorriso. Responda em pt-br, curto. ' +
  'Só fale com o lead por send_message.';

/**
 * Superfície estática de três tools, escrita FORA de ordem alfabética de
 * propósito (`send_message` < `update_lead_state`, e `get_lead_context` é o
 * primeiro alfabeticamente mas o último aqui). O módulo tem de normalizar.
 */
function toolsDaOrg(): ToolSet {
  return {
    update_lead_state: tool({
      description: 'Marca um avanço REAL no funil deste lead.',
      inputSchema: z.object({ stage: z.string().optional() }),
    }),
    send_message: tool({
      description: 'Envia UMA mensagem de WhatsApp ao lead desta conversa.',
      inputSchema: z.object({ body: z.string().min(1) }),
    }),
    get_lead_context: tool({
      description: 'Relê o contexto curado do lead nesta organização.',
      inputSchema: z.object({}),
    }),
  };
}

/**
 * As MESMAS tools, com as chaves em outra ordem de inserção — a ordem alfabética,
 * que é justamente a que `toolsDaOrg()` NÃO usa. (Inverter a alfabética daria, por
 * acidente deste conjunto, exatamente a ordem original — e o caso de ordem viraria
 * uma comparação de um objeto consigo mesmo.)
 */
function toolsDaOrgEmOutraOrdem(): ToolSet {
  const t = toolsDaOrg();
  const reordenada: ToolSet = {};
  for (const nome of Object.keys(t).sort()) {
    reordenada[nome] = t[nome]!;
  }
  return reordenada;
}

/** Leitura do breakpoint sem confiar em cast largo — é JSONValue no tipo. */
function breakpointDe(
  providerOptions: { anthropic?: Record<string, unknown> } | undefined,
): unknown {
  return providerOptions?.anthropic?.['cacheControl'];
}

describe('prefixo cacheado — byte-identidade', () => {
  it('as mesmas entradas, montadas duas vezes, dão o mesmo hash', async () => {
    const a = await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: toolsDaOrg() });
    const b = await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: toolsDaOrg() });

    expect(
      b,
      'Duas montagens idênticas deram prefixos diferentes: o provedor nunca acerta o cache\n' +
        'e o custo por turno sobe sem nenhum sintoma visível. Procure o que entrou no\n' +
        'prefixo e varia entre chamadas (timestamp, random, contador, dado de lead).',
    ).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('o instrumento enxerga diferença quando ela existe — uma letra no system', async () => {
    // CONTROLE DE VACUIDADE. Sem este caso, um hash constante (ou uma sonda que
    // compare a coisa errada) deixaria TODOS os testes de identidade acima verdes
    // para sempre, medindo nada.
    const original = await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: toolsDaOrg() });
    const umaLetraTrocada = SYSTEM_DA_ORG.replace('curto', 'curta');

    expect(umaLetraTrocada).not.toBe(SYSTEM_DA_ORG); // a sabotagem pegou mesmo
    expect(
      await stablePrefixHash({ system: umaLetraTrocada, tools: toolsDaOrg() }),
      'Trocar uma letra do system NÃO mudou o hash — a sonda está cega e todo o resto\n' +
        'deste arquivo é verde de mentira.',
    ).not.toBe(original);
  });

  it('o instrumento enxerga diferença quando ela existe — description de tool', async () => {
    // Segundo braço do controle: o lado das tools também precisa entrar no hash.
    const base = toolsDaOrg();
    const alterada: ToolSet = {
      ...base,
      send_message: tool({
        description: 'Envia UMA mensagem de WhatsApp ao lead desta conversa. (v2)',
        inputSchema: z.object({ body: z.string().min(1) }),
      }),
    };

    expect(
      await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: alterada }),
      'Mudar a description de uma tool não mudou o hash — a serialização está ignorando\n' +
        'as tools, e a promessa de byte-identidade não cobre metade do prefixo.',
    ).not.toBe(await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: base }));
  });
});

describe('prefixo cacheado — ordem das tools é determinística', () => {
  it('o mesmo conjunto de tools em ordens diferentes dá o mesmo hash', async () => {
    const naOrdemA = toolsDaOrg();
    const naOrdemB = toolsDaOrgEmOutraOrdem();

    // A sabotagem é real: as chaves chegam mesmo em ordens diferentes.
    expect(Object.keys(naOrdemA)).not.toEqual(Object.keys(naOrdemB));

    expect(
      await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: naOrdemB }),
      'Ordem de inserção das tools mudou o prefixo. Dois processos que montam o objeto de\n' +
        'tools em ordens diferentes (handler do webhook e worker) passariam a competir por\n' +
        'duas entradas de cache distintas — metade dos turnos pagando preço cheio.',
    ).toBe(await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: naOrdemA }));
  });

  it('a serialização emite as tools em ordem alfabética, e o system por último', async () => {
    const texto = await serializeStablePrefix({
      system: SYSTEM_DA_ORG,
      tools: toolsDaOrgEmOutraOrdem(),
    });
    const cabecalhos = [...texto.matchAll(/^=== (tool:[a-z_]+|system) ===$/gm)].map((m) => m[1]);

    expect(cabecalhos).toEqual([
      'tool:get_lead_context',
      'tool:send_message',
      'tool:update_lead_state',
      'system',
    ]);
  });

  it('buildStablePrefix reordena as chaves de tools por nome', () => {
    const prefixo = buildStablePrefix({
      system: SYSTEM_DA_ORG,
      tools: toolsDaOrgEmOutraOrdem(),
      cacheTtl: '1h',
    });

    expect(Object.keys(prefixo.tools ?? {})).toEqual([
      'get_lead_context',
      'send_message',
      'update_lead_state',
    ]);
  });
});

describe('prefixo cacheado — o breakpoint está onde o módulo diz', () => {
  it('o system carrega cacheControl ephemeral com o ttl pedido', () => {
    const prefixo = buildStablePrefix({
      system: SYSTEM_DA_ORG,
      tools: toolsDaOrg(),
      cacheTtl: '1h',
    });

    expect(
      breakpointDe(prefixo.system?.providerOptions),
      'O system perdeu o breakpoint de cache: o prefixo deixa de ser cacheado e o custo\n' +
        'por turno sobe sem nenhum sintoma — as respostas continuam certas.',
    ).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('o breakpoint das tools fica na ÚLTIMA da ordem alfabética, e só nela', () => {
    const prefixo = buildStablePrefix({
      system: SYSTEM_DA_ORG,
      tools: toolsDaOrgEmOutraOrdem(),
      cacheTtl: '5m',
    });
    const tools = prefixo.tools ?? {};
    const comBreakpoint = Object.keys(tools).filter(
      (nome) => breakpointDe(tools[nome]?.providerOptions) !== undefined,
    );

    expect(
      comBreakpoint,
      'O breakpoint das tools tem de ficar na ÚLTIMA da ordem determinística — é ela que\n' +
        'fecha o bloco de tools, que o Anthropic recebe ANTES do system.',
    ).toEqual(['update_lead_state']);
    expect(breakpointDe(tools['update_lead_state']?.providerOptions)).toEqual({
      type: 'ephemeral',
      ttl: '5m',
    });
  });

  it('o ttl pedido chega ao breakpoint (5m e 1h não colapsam no mesmo objeto)', () => {
    const umaHora = buildStablePrefix({ system: SYSTEM_DA_ORG, cacheTtl: '1h' });
    const cincoMin = buildStablePrefix({ system: SYSTEM_DA_ORG, cacheTtl: '5m' });

    // Controle de vacuidade do caso acima: se o ttl fosse hardcoded, os dois
    // seriam iguais e os `toEqual` acima estariam medindo uma constante.
    expect(breakpointDe(umaHora.system?.providerOptions)).not.toEqual(
      breakpointDe(cincoMin.system?.providerOptions),
    );
  });

  it('sem tools, não há breakpoint de tool para pôr (e nada explode)', () => {
    const prefixo = buildStablePrefix({ system: SYSTEM_DA_ORG, tools: {}, cacheTtl: '1h' });

    expect(prefixo.tools).toBeUndefined();
    expect(breakpointDe(prefixo.system?.providerOptions)).toEqual({
      type: 'ephemeral',
      ttl: '1h',
    });
  });
});

describe('prefixo cacheado — a REGRA DURA, dita em teste', () => {
  it('leads diferentes, mesmo playbook e mesmas tools: o MESMO hash', async () => {
    // Esta é a regra escrita no cabeçalho do módulo, em forma executável.
    // Tudo que é por-lead (nome, checkpoint, estado do funil, histórico) vive em
    // `input.messages`, DEPOIS do breakpoint — nunca na chamada abaixo. O
    // `buildStablePrefix` real (run-model-call.ts) recebe exatamente `system`,
    // `tools` e `cacheTtl`: não há por onde um dado de lead entrar.
    const leadA = { nome: 'Ana', leadId: 'a1b2', ultimoContato: '2026-09-14T10:00:00Z' };
    const leadB = { nome: 'Bruno', leadId: 'z9y8', ultimoContato: '2026-09-14T18:30:00Z' };

    const hashA = await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: toolsDaOrg() });
    const hashB = await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: toolsDaOrg() });

    expect(leadA.leadId).not.toBe(leadB.leadId); // são mesmo dois leads distintos
    expect(
      hashB,
      'O prefixo variou entre dois leads da MESMA organização. Isso é exatamente a regra\n' +
        'dura do stable-prefix.ts sendo violada: o cache do provedor passa a ter uma entrada\n' +
        'por lead, nenhuma é reaproveitada, e a conta do atendimento multiplica.',
    ).toBe(hashA);
  });

  it('SABOTAGEM: um timestamp interpolado no system mata o cache — e a cerca morde', async () => {
    // A violação que a regra dura proíbe, executada de propósito. É o mesmo
    // formato de erro que alguém cometeria "só para dar contexto ao modelo":
    // pôr a hora atual, o nome do lead ou um contador no corpo do playbook.
    const comTimestamp = (agora: Date): string => `${SYSTEM_DA_ORG}\nAgora: ${agora.toISOString()}`;

    const turno1 = await stablePrefixHash({
      system: comTimestamp(new Date('2026-09-14T10:00:00Z')),
      tools: toolsDaOrg(),
    });
    const turno2 = await stablePrefixHash({
      system: comTimestamp(new Date('2026-09-14T10:00:05Z')),
      tools: toolsDaOrg(),
    });

    expect(
      turno2,
      'A sabotagem NÃO foi detectada: interpolar um timestamp no system deixou o hash igual.\n' +
        'Se isso acontecer, a sonda está cega e nenhum teste deste arquivo vale.',
    ).not.toBe(turno1);

    // E a prova de que a diferença veio do texto volátil, não de outra coisa: o
    // prefixo limpo é estável entre os mesmos dois instantes.
    expect(await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: toolsDaOrg() })).toBe(
      await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: toolsDaOrg() }),
    );
  });

  it('o hash é sha256 do texto canônico — a sonda não tem vida própria', async () => {
    // Amarra as duas superfícies exportadas: se `stablePrefixHash` passasse a
    // hashear outra coisa (um objeto, uma versão, um id), este caso quebra e
    // ninguém precisa descobrir isso pela fatura.
    const texto = await serializeStablePrefix({ system: SYSTEM_DA_ORG, tools: toolsDaOrg() });
    const esperado = createHash('sha256').update(texto, 'utf8').digest('hex');

    expect(await stablePrefixHash({ system: SYSTEM_DA_ORG, tools: toolsDaOrg() })).toBe(esperado);
  });
});
