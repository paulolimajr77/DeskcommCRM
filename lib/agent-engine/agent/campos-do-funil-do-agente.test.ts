import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

import {
  carregarCamposDoFunilDoAgente,
  renderCamposDoFunil,
  type CamposPorFunil,
} from './campos-do-funil-do-agente';

/** Pool falso no molde de `drain.test.ts`: guarda o SQL para poder medi-lo depois. */
function poolFalso(rows: unknown[] = []) {
  const sqls: string[] = [];
  const query = vi.fn().mockImplementation((sql: string) => {
    sqls.push(sql);
    return { rows };
  });
  return { pool: { query } as unknown as pg.Pool, query, sqls };
}

const CLINICA: CamposPorFunil = {
  pipelineId: 'p1',
  nome: 'Clínica',
  campos: [
    {
      key: 'convenio',
      label: 'Convênio',
      type: 'select',
      required: true,
      options: [
        { value: 'unimed', label: 'Unimed' },
        { value: 'particular', label: 'Particular' },
      ],
    },
    { key: 'ja_fez_consulta', label: 'Já se consultou aqui?', type: 'boolean' },
  ],
};

describe('renderCamposDoFunil', () => {
  it('lista vazia ⇒ string vazia (custo zero para quem não declarou campo)', () => {
    expect(renderCamposDoFunil([])).toBe('');
  });

  it('funil sem campo declarado ⇒ string vazia', () => {
    expect(renderCamposDoFunil([{ pipelineId: 'p1', nome: 'Comercial', campos: [] }])).toBe('');
  });

  it('funil de clínica: nomeia chave, rótulo, opções e marca o obrigatório', () => {
    const out = renderCamposDoFunil([CLINICA]);
    expect(out).toContain('Clínica');
    // chave (o que vai no argumento) e rótulo (o nome de gente) — os dois, e distintos.
    expect(out).toContain('convenio');
    expect(out).toContain('Convênio');
    expect(out).toContain('ja_fez_consulta');
    expect(out).toContain('Já se consultou aqui?');
    // as opções vêm com value E label: só o label não serve de argumento.
    expect(out).toContain('unimed');
    expect(out).toContain('Unimed');
    expect(out).toContain('particular');
    expect(out).toContain('Particular');
    // o obrigatório é marcado, e o que não é não ganha a marca.
    const linhaConvenio = out.split('\n').find((l) => l.includes('convenio')) ?? '';
    const linhaBoolean = out.split('\n').find((l) => l.includes('ja_fez_consulta')) ?? '';
    expect(linhaConvenio).toContain('obrigatório');
    expect(linhaBoolean).not.toContain('obrigatório');
    // o boolean ensina a forma da resposta.
    expect(linhaBoolean).toMatch(/sim ou não/);
    // a ferramenta que grava é nomeada — senão o modelo não sabe onde usar a chave.
    expect(out).toContain('crm_update_lead');
    expect(out).toContain('custom_fields');
  });

  it('cada tipo ensina a forma da resposta; date proíbe texto relativo', () => {
    const out = renderCamposDoFunil([
      {
        pipelineId: 'p1',
        nome: 'Agência',
        campos: [
          { key: 'prazo', label: 'Prazo', type: 'date' },
          { key: 'verba', label: 'Verba', type: 'number' },
          { key: 'email_contato', label: 'E-mail', type: 'email' },
          { key: 'whats', label: 'WhatsApp', type: 'phone' },
          { key: 'site', label: 'Site', type: 'url' },
          { key: 'briefing', label: 'Briefing', type: 'textarea' },
          {
            key: 'servicos',
            label: 'Serviços',
            type: 'multiselect',
            options: [
              { value: 'seo', label: 'SEO' },
              { value: 'ads', label: 'Ads' },
            ],
          },
        ],
      },
    ]);
    const linha = (k: string) => out.split('\n').find((l) => l.includes(k)) ?? '';
    expect(linha('prazo')).toContain('AAAA-MM-DD');
    expect(out).toMatch(/semana que vem/); // a proibição literal do texto relativo
    expect(linha('verba')).toContain('número');
    expect(linha('email_contato')).toContain('e-mail');
    expect(linha('whats')).toContain('telefone');
    expect(linha('site')).toContain('URL');
    expect(linha('briefing')).toContain('texto');
    expect(linha('servicos')).toMatch(/uma ou mais/i);
  });

  it('as cinco regras de conduta vêm no MESMO bloco, sem cabeçalho separado', () => {
    const out = renderCamposDoFunil([CLINICA]);
    expect(out).toMatch(/uma pergunta por vez/i);
    expect(out).toMatch(/assim que ouvir/i);
    expect(out).toMatch(/somente o que foi dito|só o que foi dito/i);
    expect(out).toMatch(/não sobrescreva|não sobrescrever/i);
    expect(out).toMatch(/já está na ficha|já está preenchido na ficha/i);
    // um único cabeçalho `===` no bloco todo: dois custariam bytes no prefixo.
    expect(out.split('\n').filter((l) => l.startsWith('===')).length).toBe(1);
  });

  it('CONTROLE: só definição entra — nenhum valor de lead, e byte-idêntico entre chamadas', () => {
    const a = renderCamposDoFunil([CLINICA]);
    const b = renderCamposDoFunil([CLINICA]);
    expect(a).toBe(b); // prefixo cacheado: dois leads da mesma org veem os mesmos bytes

    // O bloco é feito só do que a DEFINIÇÃO carrega. Qualquer token que só um lead
    // teria (nome, telefone, valor preenchido) não tem por onde entrar — e este
    // controle quebra se alguém passar a concatenar `custom_fields` do lead aqui.
    const tokensDeLead = ['Maria Souza', '5562', 'unimed-da-maria', '2026-09-20', 'lead_'];
    for (const t of tokensDeLead) expect(a).not.toContain(t);

    // o contorno da API: render recebe DEFINIÇÃO, e é função pura dela.
    expect(renderCamposDoFunil([{ ...CLINICA, campos: [] }])).toBe('');
  });
});

describe('carregarCamposDoFunilDoAgente', () => {
  it('escopo vazio ⇒ [] SEM consultar o banco (vazio é NENHUM, nunca "todos")', async () => {
    const { pool, query } = poolFalso([{ id: 'p9', name: 'Vendas', settings: {} }]);
    const out = await carregarCamposDoFunilDoAgente(pool, 'org1', []);
    expect(out).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('filtra por organização E pelos funis pedidos, e nunca lê lead', async () => {
    const { pool, query, sqls } = poolFalso([
      {
        id: 'p1',
        name: 'Clínica',
        settings: {
          fields: [
            { key: 'convenio', label: 'Convênio', type: 'select', required: true, options: [{ value: 'unimed', label: 'Unimed' }] },
            { key: 'lixo_velho', type: 'coisa_que_nao_existe' }, // jsonb velho: descartado, não explode
          ],
        },
      },
    ]);
    const out = await carregarCamposDoFunilDoAgente(pool, 'org1', ['p1']);
    expect(out).toEqual([
      {
        pipelineId: 'p1',
        nome: 'Clínica',
        campos: [
          {
            key: 'convenio',
            label: 'Convênio',
            type: 'select',
            required: true,
            options: [{ value: 'unimed', label: 'Unimed' }],
          },
        ],
      },
    ]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('crm_pipelines');
    expect(params).toEqual(['org1', ['p1']]);
    expect(sql).toContain('organization_id');
    // nada de valor de lead na consulta — o bloco vai para o prefixo cacheado.
    expect(sqls.join('\n')).not.toContain('crm_leads');
    expect(sqls.join('\n')).not.toContain('custom_fields');
  });

  it('funil que sumiu do banco não vira linha; ordem é a do banco', async () => {
    const { pool } = poolFalso([]);
    expect(await carregarCamposDoFunilDoAgente(pool, 'org1', ['p1', 'p2'])).toEqual([]);
  });
});

describe('quando o dono ligou os campos mas NÃO deu a ferramenta de anotar', () => {
  /**
   * ⛔ INSTRUÇÃO SEM CAPACIDADE É O PIOR DOS DOIS MUNDOS.
   *
   * `lead_fields_enabled` e a ferramenta `crm_update_lead` são interruptores
   * SEPARADOS: o dono liga os campos na versão do agente, e escolhe as
   * ferramentas numa lista à parte. Nada obriga os dois a andarem juntos.
   *
   * Com os campos ligados e a ferramenta ausente, o bloco mandava "anote assim
   * que ouvir, sem esperar o fim da conversa" para um modelo que não tem com o
   * quê. O que sai disso não é silêncio — é o modelo dizendo ao cliente que
   * anotou. Foi exatamente o defeito que derrubou `lead_fields_propose_new`
   * hoje de manhã: a tela grava, o motor ignora, e quem paga a conta é a
   * confiança de quem está do outro lado.
   *
   * O produto já resolve isto na agenda: quando o agente não tem
   * `crm_book_appointment`, o bloco troca de texto e proíbe dizer "confirmado"
   * — ver `AGENDA_SEM_FERRAMENTA` em `inbound-turn.ts`. Aqui é a mesma regra.
   */
  const UM_FUNIL = [
    {
      pipelineId: 'p1',
      nome: 'Clientes',
      campos: [{ key: 'segmento', label: 'Segmento', type: 'text' as const }],
    },
  ];

  it('o bloco NÃO manda anotar, e proíbe dizer que anotou', () => {
    const bloco = renderCamposDoFunil(UM_FUNIL, { podeAnotar: false });
    expect(bloco, 'o bloco ficou vazio — perguntar continua valendo').not.toBe('');
    // Perguntar continua sendo trabalho útil: o que a pessoa responde vai para
    // a conversa, e quem atende lê. O que não pode é prometer registro.
    expect(bloco).toMatch(/pergunt/i);
    expect(bloco, 'mandou anotar sem ter com o quê').not.toMatch(/anote assim que ouvir/i);
    expect(bloco, 'não proibiu afirmar que registrou').toMatch(/nunca diga|não diga/i);
  });

  it('com a ferramenta, o bloco volta a mandar anotar', () => {
    // O controle positivo. Sem ele, um render que devolvesse sempre o texto
    // defensivo passaria no caso acima com a capacidade ligada quebrada.
    const bloco = renderCamposDoFunil(UM_FUNIL, { podeAnotar: true });
    expect(bloco).toMatch(/anote assim que ouvir/i);
    expect(bloco).toContain('crm_update_lead');
  });

  it('o padrão é PODER anotar — quem chama sem dizer não muda de comportamento', () => {
    // A opção nasce opcional de propósito: oito arquivos montam este bloco em
    // teste, e um padrão que negasse a capacidade mudaria todos eles em
    // silêncio.
    expect(renderCamposDoFunil(UM_FUNIL)).toBe(renderCamposDoFunil(UM_FUNIL, { podeAnotar: true }));
  });
});
