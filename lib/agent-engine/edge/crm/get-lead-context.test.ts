/**
 * O contexto tem que dizer se o nome do contato foi CONFIRMADO pela empresa — e
 * de qual NEGÓCIO a conversa está falando.
 *
 * Numa instalação real, 2 de 3 contatos estavam com `contacts.name` vazio: todo
 * mundo que entra pelo WhatsApp chega só com `display_name`, que é o texto que a
 * própria pessoa escreveu no aparelho ("Josué sites", "Ana Maria Matias", o
 * próprio número) e não serve para proposta, documento nem nota fiscal. Como o
 * payload funde as duas colunas (`display_name ?? name`), o modelo SEMPRE lia um
 * nome e concluía que já sabia quem era o cliente — então nunca perguntava.
 * Nenhuma instrução de prompt conserta isso: mandar "pergunte o nome de quem não
 * tem" a um modelo que lê `name: "Josué sites"` não produz pergunta nenhuma.
 *
 * Os casos abaixo vigiam as DUAS metades do contrato ao mesmo tempo: o `name`
 * antigo continua exatamente como era (ele circula por follow-up, case-reply e
 * escalação — ver o comentário de ~linha 270 do módulo), e o booleano novo diz a
 * verdade que faltava.
 *
 * ═══ E OS CASOS DE `negocio_id` NASCERAM DE UMA SABOTAGEM MEDIDA ═══
 *
 * A Tarefa 6 acrescentou `negocio_id` e `negocio_situacao` ao contexto — o id do
 * NEGÓCIO (a oportunidade do funil), não o do CONTATO. Depois de aplicar, a
 * sabotagem obrigatória: trocar `negocio_id` por `input.leadId`, isto é, fazer o
 * contexto VOLTAR A MENTIR. Resultado medido em 2026-09-16: **22 arquivos de
 * teste, 190 casos, tudo verde.** Nada caiu.
 *
 * A lição é a razão destes casos existirem: o conserto do PROMPT está vigiado,
 * o conserto do CONTEXTO não tinha quem o guardasse. **Conserto sem cerca é
 * conserto que a próxima sessão desfaz sem saber** — o código volta a mentir e a
 * bateria de testes aplaude. Os quatro casos abaixo fecham esse buraco: eles
 * falham no instante em que o contexto voltar a devolver o id do CONTATO onde
 * deveria estar o id do NEGÓCIO.
 *
 * Os casos de `last_proposal` (N7, mais abaixo) vieram do merge da proposta
 * comercial (25/09/2026) — feature independente desta, que só compartilha o
 * mesmo arquivo-fonte.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getLeadContext } from './get-lead-context';
import type { CrmEdgeConfig } from './mcp-client';
import type { Queryable } from '../../queue/queue';

const knobs = { historyLimit: 20, maxTokens: 1000 };
const cfg = {} as CrmEdgeConfig;

const ORG = '11111111-1111-4111-8111-111111111111';
const CONTATO = '22222222-2222-4222-8222-222222222222';
const NEGOCIO = '33333333-3333-4333-8333-333333333333';
const OUTRO_NEGOCIO = '44444444-4444-4444-8444-444444444444';

/** O que `crm_leads` devolve — as seis colunas que `negocioDaConversa` seleciona. */
interface NegocioRow {
  id: string;
  organization_id: string;
  pipeline_id: string;
  status: string;
  last_activity_at: string | null;
  created_at: string;
}

/**
 * Um negócio ABERTO do contato. O `last_activity_at` é parâmetro porque
 * `resolveActiveLeadForContact` só devolve ambíguo quando há EMPATE — dois
 * negócios abertos com atividades diferentes roteiam para o mais recente, e o
 * caso de "varios" precisa dos dois idênticos para exercitar o ramo certo.
 */
function negocio(id: string, last_activity_at: string | null = '2026-09-15T00:00:00Z'): NegocioRow {
  return {
    id,
    organization_id: ORG,
    pipeline_id: 'pipe-1',
    status: 'open',
    last_activity_at,
    created_at: '2026-09-01T00:00:00Z',
  };
}

/**
 * Pool falso no mesmo padrão de `drain.test.ts`: despacha por trecho do SQL. A
 * linha de `contacts` alimenta o payload mínimo; a de `crm_leads` alimenta o
 * `negocio_id` que os casos novos medem — quem não passar negócio nenhum recebe
 * `[]`, e o contexto responde `negocio_id: null, negocio_situacao: 'nenhum'`.
 */
function poolFalso(
  contato: { name: string | null; display_name: string | null },
  negociosDoContato: NegocioRow[] = [],
): Queryable {
  const query = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('from contacts')) {
      return {
        rows: [
          {
            name: contato.name,
            display_name: contato.display_name,
            email: null,
            phone_number: '5562999990000',
            tags: null,
            is_blocked: false,
            source: 'whatsapp',
            consent: null,
            is_anonymized: false,
          },
        ],
      };
    }
    if (sql.includes('from crm_leads')) {
      return { rows: negociosDoContato };
    }
    return { rows: [] };
  });
  return { query } as unknown as Queryable;
}

async function contextoDe(
  contato: { name: string | null; display_name: string | null },
  negociosDoContato: NegocioRow[] = [],
) {
  const r = await getLeadContext(
    poolFalso(contato, negociosDoContato),
    cfg,
    { tenantId: ORG, leadId: CONTATO, conversationId: null, fuso: 'America/Sao_Paulo' },
    knobs,
  );
  if (!r.ok) throw new Error(`esperava ok:true, veio ${r.error.code}`);
  return r.context;
}

it('só apelido do aparelho: o nome antigo não muda e nome_confirmado é false', async () => {
  const ctx = await contextoDe({ name: null, display_name: 'Josué sites' });
  // O campo antigo é intocado de propósito — trocá-lo custa uma wave inteira.
  expect(ctx.contact.name).toBe('Josué sites');
  expect(ctx.contact.nome_confirmado).toBe(false);
});

it('nome preenchido pela empresa: nome_confirmado é true', async () => {
  const ctx = await contextoDe({ name: 'Paulo Lima', display_name: 'Paulão' });
  expect(ctx.contact.nome_confirmado).toBe(true);
});

it('nome só com espaços não é nome: nome_confirmado é false', async () => {
  const ctx = await contextoDe({ name: '   ', display_name: 'Paulão' });
  expect(ctx.contact.nome_confirmado).toBe(false);
});

it('um negócio aberto: `negocio_id` é o do NEGÓCIO — e NÃO o do contato', async () => {
  const ctx = await contextoDe({ name: 'Paulo Lima', display_name: 'Paulão' }, [negocio(NEGOCIO)]);
  expect(ctx.negocio_situacao).toBe('um');
  expect(ctx.negocio_id).toBe(NEGOCIO);
  // ⛔ ESTA METADE É A QUE MATA A SABOTAGEM. Um `negocio_id: input.leadId` que
  // por acaso batesse com NEGOCIO passaria a primeira asserção — a segunda
  // (que os dois ids são DIFERENTES, como são na vida real) é o que prova que
  // o contexto não está devolvendo o valor do contato com outro nome.
  expect(ctx.negocio_id).not.toBe(CONTATO);
});

it('nenhum negócio aberto: `negocio_id` é null, a situação é "nenhum" — e NÃO é erro', async () => {
  // O `contextoDe` estoura se `ok` for falso: chegar até aqui já prova que
  // "nenhum negócio" é um desfecho de NEGÓCIO, não falha de leitura. Colapsar
  // os dois faria o sistema culpar a infraestrutura por uma pessoa que ainda
  // não tem negócio aberto — e o modelo responderia diferente em cada caso.
  const ctx = await contextoDe({ name: null, display_name: 'Ana' }, []);
  expect(ctx.negocio_id).toBeNull();
  expect(ctx.negocio_situacao).toBe('nenhum');
});

it('dois negócios EMPATADOS: `negocio_id` é null e a situação é "varios"', async () => {
  // ⚠️ "Empatados" é literal: `resolveActiveLeadForContact` só devolve ambíguo
  // quando as atividades empatam. Dois negócios abertos com `last_activity_at`
  // diferentes ROTEIAM para o mais recente — usar aqui datas distintas mediria
  // o caminho feliz com o rótulo do caminho ambíguo.
  const ctx = await contextoDe({ name: null, display_name: 'Ana' }, [
    negocio(NEGOCIO, '2026-09-15T00:00:00Z'),
    negocio(OUTRO_NEGOCIO, '2026-09-15T00:00:00Z'),
  ]);
  expect(ctx.negocio_id).toBeNull();
  expect(ctx.negocio_situacao).toBe('varios');
});

it('CONTROLE — `lead_id` e `contact_id` continuam sendo o CONTATO', async () => {
  // O campo antigo circula por follow-up, case-reply e escalação, e por
  // invariantes CONGELADOS — trocá-lo custaria uma wave inteira. Somar o campo
  // certo ao lado custou uma linha. Este caso existe para que a próxima sessão
  // não "arrume" o nome que mente: aqui ele continua mentindo DE PROPÓSITO, e
  // quem quiser o negócio tem `negocio_id`.
  const ctx = await contextoDe({ name: null, display_name: 'Ana' }, [negocio(NEGOCIO)]);
  expect(ctx.lead_id).toBe(CONTATO);
  expect(ctx.contact_id).toBe(CONTATO);
});

// ─── last_proposal (N7) — merge da proposta comercial, 25/09/2026 ───────────

const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

interface MundoOpts {
  /** Linhas que a query de crm_proposals devolve. `undefined` = a query lança. */
  propostas?: Array<Record<string, unknown>>;
}

function montarDb(opts: MundoOpts = {}) {
  const consultas: string[] = [];
  const db = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: vi.fn(async (sql: string, _params: any[]) => {
      consultas.push(sql);
      if (sql.includes("from contacts")) {
        return {
          rows: [{
            name: "Cliente", display_name: null, email: null, phone_number: "5511",
            tags: [], is_blocked: false, source: "whatsapp", consent: null, is_anonymized: false,
          }],
        };
      }
      if (sql.includes("crm_lead_activities")) return { rows: [] };
      if (sql.includes("from messages")) return { rows: [] };
      if (sql.includes("from demandas")) return { rows: [] };
      if (sql.includes("from crm_proposals")) {
        if (opts.propostas === undefined) throw new Error("relation crm_proposals does not exist");
        return { rows: opts.propostas };
      }
      // `negocioDaConversa` (merge da M0-M6 com a vps/pljr-combinada, 25/09/2026)
      // também consulta `crm_leads` — sem negócio aberto, o que estes casos não medem.
      if (sql.includes("from crm_leads")) return { rows: [] };
      throw new Error(`query não mockada: ${sql.slice(0, 60)}`);
    }),
  };
  return { db, consultas };
}

const INPUT = { tenantId: TENANT_ID, leadId: CONTACT_ID, conversationId: "conv-1", fuso: "America/Sao_Paulo" };
const KNOBS = { historyLimit: 20, maxTokens: 1000 };

describe("getLeadContext — last_proposal (N7)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("negócio com proposta RECUSADA: last_proposal reflete status e motivo (N7)", async () => {
    const { db } = montarDb({
      propostas: [{ status: "recusada", total_cents: 50000, decision_reason: "Preço acima do orçamento", numero: 1, ano: 2026 }],
    });
    const r = await getLeadContext(db as never, {} as never, INPUT, KNOBS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.context.last_proposal).toEqual({
        status: "recusada", total_cents: 50000, decision_reason: "Preço acima do orçamento", numero: 1, ano: 2026,
      });
    }
  });

  it("negócio SEM nenhuma proposta com desfecho: last_proposal é null (Review Focus 5)", async () => {
    const { db, consultas } = montarDb({ propostas: [] });
    const r = await getLeadContext(db as never, {} as never, INPUT, KNOBS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.context.last_proposal).toBeNull();
    // rascunho nunca é desfecho: a query só admite os 4 status com desfecho
    // real, no SQL (allowlist, não blocklist — status futuro não vaza).
    const sqlPropostas = consultas.find((s) => s.includes("from crm_proposals")) ?? "";
    expect(sqlPropostas).toMatch(/status in \('enviada', 'aceita', 'recusada', 'vencida'\)/);
  });

  it("query de crm_proposals falha: last_proposal null, o resto do contexto SEGUE montando (falha aberta)", async () => {
    const { db } = montarDb();
    const r = await getLeadContext(db as never, {} as never, INPUT, KNOBS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.context.last_proposal).toBeNull();
      expect(r.context.contact).toBeDefined();
    }
  });
});
