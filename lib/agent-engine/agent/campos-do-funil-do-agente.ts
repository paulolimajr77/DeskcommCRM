/**
 * O VOCABULÁRIO DO NICHO — os campos personalizados do funil, ensinados ao agente.
 *
 * ═══ O DEFEITO, MEDIDO ═══
 *
 * A empresa declara até 50 campos por funil em Configurações › Funis, e a ficha
 * do lead desenha todos: uma clínica declara `convenio` e `queixa_principal`,
 * uma imobiliária `bairro` e `faixa_de_preco`, uma agência `prazo` e `segmento`.
 * O agente NÃO sabia que eles existem. Numa instalação real: 6 campos
 * declarados, 4 leads, **0 com qualquer campo preenchido**.
 *
 * Ler ele já lia — `crm_get_lead` devolve `*`. Mas num lead novo `custom_fields`
 * é `{}`, e objeto vazio não ensina chave nenhuma. O que faltava é a DEFINIÇÃO.
 *
 * ═══ POR QUE ESTE BLOCO SÓ PODE CARREGAR DEFINIÇÃO ═══
 *
 * Ele entra no PREFIXO ESTÁVEL (`edge/llm/stable-prefix.ts`), que precisa ser
 * byte-idêntico entre TODOS os leads da organização — é o que faz o cache do
 * provedor acertar. Chave, rótulo, tipo, opções e obrigatoriedade são iguais
 * para a organização inteira e podem entrar. **Valor preenchido é do lead e não
 * entra**: um único valor aqui mataria o cache a cada conversa e encareceria
 * todo atendimento. O valor chega por outro caminho, no sufixo.
 *
 * Mesmo motivo de `renderOrgMemory`: sem campo declarado, o bloco é string
 * vazia — quem não usa campo personalizado não paga byte nenhum.
 */
import type pg from 'pg';

import { camposDoFunil } from '@/lib/leads/campos-do-funil';
import type { CustomFieldDef } from '@/lib/schemas/settings';

export interface CamposPorFunil {
  pipelineId: string;
  nome: string;
  campos: CustomFieldDef[];
}

/**
 * Carrega a definição dos campos dos funis que ESTE agente alcança.
 *
 * `pipelineIds` vazio devolve `[]` **sem tocar no banco** — é a regra de
 * `ESCOPO_VAZIO` (`lib/leads/escopo-de-funil.ts`): vazio significa NENHUM, nunca
 * "todos". Devolver todos os funis da organização daria ao agente de suporte o
 * vocabulário do funil de vendas, e o vocabulário é o que ele sai perguntando.
 *
 * A ordem é `name, id` — determinística, porque o resultado vira prefixo
 * cacheado e ordem instável do banco viraria bytes instáveis.
 */
export async function carregarCamposDoFunilDoAgente(
  db: pg.Pool,
  tenantId: string,
  pipelineIds: string[],
): Promise<CamposPorFunil[]> {
  if (pipelineIds.length === 0) return [];
  const { rows } = await db.query<{ id: string; name: string; settings: unknown }>(
    `select id, name, settings
     from crm_pipelines
     where organization_id = $1 and id = any($2::uuid[])
     order by name asc, id asc`,
    [tenantId, pipelineIds],
  );
  return rows.map((r) => ({
    pipelineId: r.id,
    nome: r.name,
    // `camposDoFunil` faz safeParse por item: jsonb velho de clone antigo vira
    // descarte silencioso, nunca exceção dentro do turno do agente.
    campos: camposDoFunil((r.settings ?? null) as Record<string, unknown> | null),
  }));
}

/**
 * O que a RESPOSTA precisa ser, derivado do `type`.
 *
 * O modelo não adivinha formato: sem esta frase ele grava "semana que vem" numa
 * coluna `date` e o campo fica com texto que nenhuma tela sabe ler.
 */
function formaDaResposta(campo: CustomFieldDef): string {
  const opcoes = (campo.options ?? []).map((o) => `${o.value} (${o.label})`).join(' | ');
  switch (campo.type) {
    case 'select':
      return `escolha UMA opção: ${opcoes}`;
    case 'multiselect':
      return `escolha uma ou mais opções: ${opcoes}`;
    case 'boolean':
      return 'responda sim ou não';
    case 'date':
      return 'data no formato AAAA-MM-DD — nunca grave "semana que vem" ou outro texto relativo';
    case 'number':
      return 'número';
    case 'email':
      return 'e-mail';
    case 'phone':
      return 'telefone';
    case 'url':
      return 'URL';
    case 'text':
    case 'textarea':
      return 'texto';
  }
}

/**
 * Bloco do prefixo estável — '' quando nenhum funil do escopo declarou campo.
 *
 * As cinco regras de conduta fecham ESTE bloco, e não um segundo: cabeçalho e
 * separador extras custariam bytes no prefixo sem ensinar nada a mais.
 */
/**
 * ⛔ `podeAnotar` NÃO É ENFEITE: sem ele o bloco manda anotar quem não tem com o quê.
 *
 * `lead_fields_enabled` (a chave da versão) e `crm_update_lead` (a ferramenta)
 * são interruptores SEPARADOS, em telas diferentes. Nada obriga os dois a
 * andarem juntos, e com os campos ligados e a ferramenta ausente o que sai não
 * é silêncio: é o modelo dizendo ao cliente que anotou. Mesmo defeito que
 * derrubou `lead_fields_propose_new` — a tela grava, o motor ignora.
 *
 * Padrão `true` de propósito: vários testes montam este bloco, e um padrão que
 * negasse a capacidade mudaria todos eles em silêncio. Quem sabe da ferramenta
 * é o turno, e é ele que diz.
 *
 * Mesma forma do que a agenda já faz (`AGENDA_SEM_FERRAMENTA`, inbound-turn):
 * sem ferramenta o bloco não some — ele troca de texto e proíbe a afirmação.
 */
/**
 * A PERGUNTA DO DONO ENTRA NUM BLOCO ESTRUTURADO — e por isso passa por aqui.
 *
 * Ela é texto livre, digitado por gente, e vai para o prefixo do turno entre
 * aspas, numa linha de um bloco que tem forma (`- chave (rótulo)`, `--- funil:
 * … ---`). Sem sanear, uma quebra de linha ou uma aspa reescrevem a estrutura
 * do bloco inteiro — e o estrago não é no campo dela: é nos campos SEGUINTES,
 * que o modelo passa a ler errado.
 *
 * ## O que este saneamento é, e o que ele NÃO é
 *
 * Não é defesa contra o dono: quem escreve aqui já controla o `system_prompt`
 * inteiro do próprio agente, então não há privilégio a escalar. É defesa contra
 * ACIDENTE DE FORMATAÇÃO — e contra o caso real de quem edita o funil não ser
 * a mesma pessoa que escreveu o prompt.
 *
 * Quebra de linha (inclusive os separadores Unicode, que atravessam um
 * `<input>` sem aparecer), aspa dupla e espaço repetido viram um espaço só. O
 * texto continua legível; o bloco continua com uma linha por campo.
 *
 * ## E o tipo é CONFERIDO aqui, não confiado
 *
 * `settings` é `jsonb`: um import antigo, um `UPDATE` à mão ou um bug podem ter
 * deixado `pergunta` como número ou objeto. Um `.trim()` num número estoura no
 * CAMINHO QUENTE do turno — a conversa inteira morre por um campo de
 * configuração. Aqui, o que não é string vira ausência.
 */
function perguntaSegura(bruta: unknown): string {
  if (typeof bruta !== "string") return "";
  return bruta
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function renderCamposDoFunil(
  funis: CamposPorFunil[],
  opcoes: { podeAnotar?: boolean; podePropor?: boolean } = {},
): string {
  const podeAnotar = opcoes.podeAnotar ?? true;
  const podePropor = opcoes.podePropor ?? false;
  const comCampos = funis.filter((f) => f.campos.length > 0);
  if (comCampos.length === 0) return '';

  const linhas: string[] = [
    podeAnotar
      ? '=== campos do cadastro (o vocabulário desta empresa — pergunte e anote) ==='
      : '=== campos do cadastro (o vocabulário desta empresa — pergunte; quem anota é a equipe) ===',
    podeAnotar
      ? 'A chave é o que vai no argumento `custom_fields` da ferramenta `crm_update_lead`; o rótulo é o nome que a empresa usa ao falar com gente.'
      : 'O rótulo é o nome que a empresa usa ao falar com gente. Você NÃO tem ferramenta para gravar estes campos nesta conversa.',
  ];

  for (const funil of comCampos) {
    linhas.push(`--- funil: ${funil.nome} ---`);
    for (const campo of funil.campos) {
      const marca = campo.required === true ? ' [obrigatório]' : '';
      linhas.push(`- ${campo.key} (${campo.label})${marca} — ${formaDaResposta(campo)}`);
      // A PERGUNTA DO DONO, quando ele escreveu uma.
      //
      // Sem ela o modelo deriva do rótulo e funciona — "Segmento" vira "qual o
      // seu segmento?", que é linguagem de formulário. Quem conhece o cliente
      // sabe que a pergunta boa é "você atende convênio ou particular?".
      //
      // Entra como "pergunte assim" e NÃO como ordem literal: o modelo precisa
      // poder encaixá-la na conversa ("aproveitando, você atende…"), senão duas
      // perguntas seguidas saem soletradas e o atendimento vira interrogatório.
      const pergunta = perguntaSegura((campo as { pergunta?: unknown }).pergunta);
      if (pergunta) linhas.push(`  pergunte assim: "${pergunta}"`);
    }
  }

  if (podeAnotar) {
    linhas.push(
      '--- como preencher ---',
      '1. Uma pergunta por vez, na linguagem do cliente. Despejar a lista inteira vira formulário, e formulário faz o cliente abandonar a conversa.',
      '2. Anote assim que ouvir, sem esperar o fim da conversa: conversa que cai no meio leva junto tudo o que não foi anotado.',
      '3. Grave somente o que foi dito. Se a frase não contém a resposta, o campo fica vazio. "Ele falou em clínica, logo o segmento é saúde" é dedução, e dedução enche o cadastro de dado errado com cara de certo.',
      '4. Não sobrescreva campo já preenchido. Se o que o cliente disser hoje divergir do que está gravado, mantenha o gravado e siga.',
      '5. Não pergunte o que já está na ficha.',
    );
  } else {
    // PERGUNTAR CONTINUA VALENDO, e por isso o bloco não some: a resposta do
    // cliente fica na conversa, e quem atende lê e registra. O que não pode é
    // prometer registro — é a promessa, não a falta da ferramenta, que quebra
    // a confiança de quem está do outro lado.
    linhas.push(
      '--- como usar ---',
      '1. Uma pergunta por vez, na linguagem do cliente. Despejar a lista inteira vira formulário, e formulário faz o cliente abandonar a conversa.',
      '2. Pergunte somente o que ainda falta e serve à conversa de agora. Estes campos existem para a empresa entender quem chegou, não para virar cadastro.',
      '3. NUNCA diga que anotou, registrou, salvou ou atualizou o cadastro. Você não tem ferramenta para isso nesta conversa, e quem lê a resposta do cliente é a equipe.',
      '4. Se o cliente perguntar se ficou registrado, diga que a equipe recebe a conversa e cuida disso. Isso é como a empresa funciona, não uma limitação a esconder.',
    );
  }

  if (podePropor) {
    // ⛔ PROPOR É EXTRA, NUNCA O ASSUNTO. Sem esta ressalva o modelo vira um
    // consultor de CRM: interrompe a conversa do cliente para sugerir campo, e
    // a Central enche de proposta enquanto o atendimento para.
    //
    // E ele NÃO pode dizer ao cliente que criou o campo: quem decide isso é
    // quem administra a empresa, e a proposta pode ser recusada. Prometer o que
    // depende de decisão alheia é a mesma família de defeito que fez o bloco
    // sem `crm_update_lead` parar de mandar anotar.
    linhas.push(
      '--- quando faltar campo ---',
      'Se o cliente disser algo importante que NÃO cabe em nenhum campo acima, proponha um campo novo com `crm_propose_lead_field` — uma vez, e siga a conversa. Nunca interrompa o atendimento para falar de configuração, e NUNCA diga ao cliente que criou ou vai criar um campo: quem decide é quem administra a empresa, e a proposta pode ser recusada.',
      'Não proponha o que já está na lista acima, em nenhuma grafia.',
    );
  }

  return linhas.join('\n');
}
