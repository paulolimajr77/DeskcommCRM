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
export function renderCamposDoFunil(funis: CamposPorFunil[]): string {
  const comCampos = funis.filter((f) => f.campos.length > 0);
  if (comCampos.length === 0) return '';

  const linhas: string[] = [
    '=== campos do cadastro (o vocabulário desta empresa — pergunte e anote) ===',
    'A chave é o que vai no argumento `custom_fields` da ferramenta `crm_update_lead`; o rótulo é o nome que a empresa usa ao falar com gente.',
  ];

  for (const funil of comCampos) {
    linhas.push(`--- funil: ${funil.nome} ---`);
    for (const campo of funil.campos) {
      const marca = campo.required === true ? ' [obrigatório]' : '';
      linhas.push(`- ${campo.key} (${campo.label})${marca} — ${formaDaResposta(campo)}`);
    }
  }

  linhas.push(
    '--- como preencher ---',
    '1. Uma pergunta por vez, na linguagem do cliente. Despejar a lista inteira vira formulário, e formulário faz o cliente abandonar a conversa.',
    '2. Anote assim que ouvir, sem esperar o fim da conversa: conversa que cai no meio leva junto tudo o que não foi anotado.',
    '3. Grave somente o que foi dito. Se a frase não contém a resposta, o campo fica vazio. "Ele falou em clínica, logo o segmento é saúde" é dedução, e dedução enche o cadastro de dado errado com cara de certo.',
    '4. Não sobrescreva campo já preenchido. Se o que o cliente disser hoje divergir do que está gravado, mantenha o gravado e siga.',
    '5. Não pergunte o que já está na ficha.',
  );

  return linhas.join('\n');
}
