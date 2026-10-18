import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const requireRole = vi.fn();
vi.mock('@/lib/auth/require-role', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }));

const from = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }));

import { GET } from './route';
import { NextRequest } from 'next/server';

function req(qs = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/ai/evolution${qs}`);
}

/** O que o fake registra de CADA consulta, para as asserções de filtro. */
interface Espiao {
  eq: Array<[string, unknown]>;
  gte: Array<[string, unknown]>;
  lte: Array<[string, unknown]>;
  order: Array<[string, string]>;
  tabelas: string[];
}

/**
 * Encadeamento do query builder do Supabase: tudo devolve `this`, o await resolve.
 *
 * `head: true` devolve `data: null` + `count`, como o PostgREST de verdade. Sem
 * isso o fake entregaria as linhas nas duas formas e um `data.length` passaria
 * por uma contagem — o teste concordaria com o defeito em vez de medi-lo.
 */
function fakeDb(
  porTabela: Record<string, unknown[]> = {},
  erros: Record<string, string> = {},
): Espiao {
  const espiao: Espiao = { eq: [], gte: [], lte: [], order: [], tabelas: [] };
  from.mockImplementation((tabela: string) => {
    espiao.tabelas.push(tabela);
    const rows = porTabela[tabela] ?? [];
    let head = false;
    const b: Record<string, unknown> = {};
    for (const m of ['not', 'limit', 'in']) b[m] = () => b;
    b.order = (col: string) => {
      espiao.order.push([tabela, col]);
      return b;
    };
    b.select = (_colunas: string, opts?: { head?: boolean }) => {
      head = opts?.head === true;
      return b;
    };
    b.eq = (col: string, val: unknown) => {
      espiao.eq.push([col, val]);
      return b;
    };
    b.gte = (col: string, val: unknown) => {
      espiao.gte.push([col, val]);
      return b;
    };
    b.lte = (col: string, val: unknown) => {
      espiao.lte.push([col, val]);
      return b;
    };
    b.then = (resolve: (v: unknown) => void) =>
      resolve(
        erros[tabela]
          ? { data: null, count: null, error: { message: erros[tabela] } }
          : { data: head ? null : rows, count: rows.length, error: null },
      );
    return b;
  });
  return espiao;
}

beforeEach(() => {
  requireRole.mockReset();
  from.mockReset();
  requireRole.mockResolvedValue({ ok: true, org: { orgId: 'org-1' }, user: { idioma: 'pt-BR' } });
  fakeDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/v1/ai/evolution', () => {
  it('recusa quem não é manager', async () => {
    requireRole.mockResolvedValue({ ok: false, response: new Response('nao', { status: 403 }) });
    const r = await GET(req());
    expect(r.status).toBe(403);
  });

  it('recusa intervalo malformado com 422', async () => {
    const r = await GET(req('?from=ontem'));
    expect(r.status).toBe(422);
  });

  it('devolve o payload agregado sem double-nest', async () => {
    const r = await GET(req('?from=2026-07-01&to=2026-07-03'));
    expect(r.status).toBe(200);
    const body = await r.json();
    // `ok()` já envelopa em { data } — um `data.data` aqui é o bug de double-nest.
    expect(body.data.range).toEqual({ from: '2026-07-01', to: '2026-07-03' });
    expect(body.data.data).toBeUndefined();
    expect(body.data.gaps).toBeDefined();
  });

  it('toda consulta filtra a organização do JWT', async () => {
    const espiao = fakeDb();
    await GET(req('?from=2026-07-01&to=2026-07-03'));

    const orgFilters = espiao.eq.filter(([c]) => c === 'organization_id');
    expect(orgFilters.length).toBeGreaterThan(0);
    expect(orgFilters.every(([, v]) => v === 'org-1')).toBe(true);
    // Nenhuma tabela pode ser lida sem o filtro de org: uma consulta a mais que
    // filtros de org significa exatamente uma leitura de tenant aberta.
    expect(orgFilters.length).toBe(espiao.tabelas.length);
  });

  it('toda leitura por data usa o MESMO intervalo do range devolvido', async () => {
    // Contadores contam TUDO que a rota entrega; as séries só cobrem os dias do
    // range. Buscar fora da janela some do gráfico e permanece no card.
    const espiao = fakeDb();
    await GET(req('?from=2026-07-01&to=2026-07-03'));

    expect(espiao.gte.every(([, v]) => v === '2026-07-01T00:00:00.000Z')).toBe(true);
    expect(espiao.lte.every(([, v]) => v === '2026-07-03T23:59:59.999Z')).toBe(true);
    // Contra TODAS as consultas menos `crm_stages` (estado atual do funil, não
    // evento do período). Comparar `gte.length` com `lte.length` NÃO serviria:
    // some o par inteiro de uma leitura e a igualdade continua verdadeira — que é
    // justamente o defeito "leitura sem janela nenhuma".
    expect(espiao.gte.length).toBe(espiao.tabelas.length - 1);
    expect(espiao.lte.length).toBe(espiao.tabelas.length - 1);
  });

  it('soma as DUAS fontes de handoff — os dois runtimes registram em lugares diferentes', async () => {
    // O agent-engine (canônico) grava agent_inbox_items(kind=handoff) e não toca
    // no event_log; o runtime nativo antigo só emite event_log. Ler um só devolve
    // "0% de handoff" para o tenant inteiro do outro.
    fakeDb({
      messages: [{}, {}, {}, {}, {}, {}, {}, {}],
      agent_inbox_items: [{}, {}],
      event_log: [{}],
    });
    const r = await GET(req('?from=2026-07-01&to=2026-07-03'));
    const body = await r.json();
    expect(body.data.outcome.handoff_rate).toBe(3 / 8);
  });

  it('assere os filtros que definem numerador e denominador', async () => {
    // Sem isto, apagar o `.eq("direction","inbound")` deixa a suíte verde e passa
    // a contar mensagem OUTBOUND no denominador da taxa de handoff.
    const espiao = fakeDb();
    await GET(req('?from=2026-07-01&to=2026-07-03'));
    const pares = espiao.eq.map(([c, v]) => `${c}=${String(v)}`);
    expect(pares).toContain('direction=inbound');
    expect(pares).toContain('kind=handoff');
    expect(pares).toContain('event_type=ai.handoff_triggered');
    expect(pares).toContain('is_archived=false');
    // O embed também filtra a org: o cabeçalho do arquivo promete defesa em
    // profundidade, e a RLS não é a promessa — é a rede embaixo dela.
    expect(pares).toContain('crm_pipelines.organization_id=org-1');
  });

  it('ordena antes de truncar e avisa quando o teto é atingido', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ROW_CAP = 50_000;
    const espiao = fakeDb({ llm_calls: Array.from({ length: ROW_CAP }, () => ({ cost_cents: 1 })) });

    const r = await GET(req('?from=2026-07-01&to=2026-07-03'));
    expect(r.status).toBe(200);

    // Sem ORDER BY, QUAIS 50k linhas voltam é indefinido: as séries viram amostra
    // arbitrária e o custo sub-relata, com cara de número exato.
    expect(espiao.order).toContainEqual(['llm_calls', 'created_at']);
    expect(espiao.order).toContainEqual(['ai_router_decisions', 'created_at']);

    const aviso = warn.mock.calls.find((c) => String(c[0]).includes('llm_calls'));
    expect(aviso, 'teto batido tem que sinalizar, não passar por número exato').toBeDefined();
    expect(JSON.stringify(aviso![1])).toContain('row cap');
  });

  it('soma o custo como número mesmo quando o driver entrega numeric como string', async () => {
    // `cost_cents` é `numeric`; um `+` sobre strings concatena em silêncio
    // ('12.5' + '30.25' = '12.530.25' → NaN depois, ou pior, texto no JSON).
    fakeDb({ llm_calls: [{ cost_cents: '12.5' }, { cost_cents: '30.25' }, { cost_cents: null }] });
    const r = await GET(req('?from=2026-07-01&to=2026-07-03'));
    const body = await r.json();
    expect(body.data.outcome.cost_cents).toBe(42.75);
  });

  it('deriva a taxa de handoff da contagem, não do tamanho da página lida', async () => {
    fakeDb({
      messages: [{}, {}, {}, {}],
      event_log: [{}],
    });
    const r = await GET(req('?from=2026-07-01&to=2026-07-03'));
    const body = await r.json();
    expect(body.data.outcome.handoff_rate).toBe(0.25);
  });

  it('uma fonte fora do ar zera o bloco dela e nomeia tabela + requestId no log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeDb(
      { skill_activations: [{ created_at: '2026-07-02T10:00:00.000Z', skill_name: 'a' }] },
      { org_memory_entries: 'relation down' },
    );

    const r = await GET(req('?from=2026-07-01&to=2026-07-03'));
    expect(r.status).toBe(200);
    const body = await r.json();

    // O bloco da fonte quebrada zera; os outros continuam contando a história.
    expect(body.data.learned.memory_entries).toBe(0);
    expect(body.data.activity.by_skill).toEqual({ a: 1 });

    const chamada = warn.mock.calls.find((c) => String(c[0]).includes('org_memory_entries'));
    expect(chamada, 'a tabela que falhou precisa aparecer no log').toBeDefined();
    expect(JSON.stringify(chamada![1])).toContain(r.headers.get('X-Request-Id'));
  });
});

describe('laço de retorno do assistente (F4): config_proposals', () => {
  const A = 'org-1';
  const B = 'org-2';
  const linha = (organization_id: string, kind: string, status: string, decided: boolean, applied: boolean) => ({
    organization_id,
    kind,
    status,
    decided_at: decided ? '2026-07-02T10:00:00Z' : null,
    applied_at: applied ? '2026-07-02T11:00:00Z' : null,
  });

  /** Fake que HONRA `.eq('organization_id', …)` na tabela — o isolamento é o que se mede. */
  function dbComIsolamento(linhas: Array<ReturnType<typeof linha>>): void {
    from.mockImplementation((tabela: string) => {
      let filtroOrg: unknown;
      const b: Record<string, unknown> = {};
      for (const m of ['not', 'limit', 'in', 'order', 'gte', 'lte']) b[m] = () => b;
      b.select = () => b;
      b.eq = (col: string, val: unknown) => {
        if (col === 'organization_id') filtroOrg = val;
        return b;
      };
      b.then = (resolve: (v: unknown) => void) =>
        resolve({
          data: tabela === 'config_proposals' ? linhas.filter((l) => filtroOrg === undefined || l.organization_id === filtroOrg) : [],
          count: 0,
          error: null,
        });
      return b;
    });
  }

  function comoAdmin(): void {
    requireRole.mockResolvedValue({ ok: true, org: { orgId: A, role: 'admin' }, user: { idioma: 'pt-BR' } });
  }

  it('admin: conta aprovadas, aplicadas e rejeitadas por kind — só da própria organização', async () => {
    comoAdmin();
    dbComIsolamento([
      linha(A, 'roteador', 'rejeitada', true, false),
      linha(A, 'roteador', 'aplicada', true, true),
      linha(A, 'conhecimento', 'pendente', false, false),
      // Organização B: 40 propostas que NUNCA podem aparecer para a A.
      ...Array.from({ length: 40 }, () => linha(B, 'funil', 'aplicada', true, true)),
    ]);
    const r = await GET(req('?from=2026-07-01&to=2026-07-03'));
    const { config_loop } = (await r.json()).data;
    expect(config_loop.estado).toBe('ok');
    expect(config_loop.total).toBe(3);
    expect(config_loop.por_kind.map((k: { kind: string }) => k.kind).sort()).toEqual(['conhecimento', 'roteador']);
    const roteador = config_loop.por_kind.find((k: { kind: string }) => k.kind === 'roteador');
    expect(roteador).toMatchObject({ propostas: 2, aprovadas: 1, aplicadas: 1, rejeitadas: 1, sem_decisao: 0 });
    expect(config_loop.taxa_aprovacao).toBe(0.5);
  });

  it('a leitura filtra a organização da sessão e a janela', async () => {
    comoAdmin();
    const espiao = fakeDb({ config_proposals: [] });
    await GET(req('?from=2026-07-01&to=2026-07-03'));
    expect(espiao.tabelas).toContain('config_proposals');
    const orgFilters = espiao.eq.filter(([c]) => c === 'organization_id');
    expect(orgFilters.length).toBe(espiao.tabelas.length);
    expect(orgFilters.every(([, v]) => v === A)).toBe(true);
    expect(espiao.gte.length).toBe(espiao.tabelas.length - 1);
  });

  it('manager: NÃO lê a tabela e o payload diz "restrito" (zero seria mentira)', async () => {
    requireRole.mockResolvedValue({ ok: true, org: { orgId: A, role: 'manager' }, user: { idioma: 'pt-BR' } });
    const espiao = fakeDb({ config_proposals: [{ kind: 'funil', status: 'aplicada', decided_at: 'x', applied_at: 'y' }] });
    const body = await (await GET(req('?from=2026-07-01&to=2026-07-03'))).json();
    expect(espiao.tabelas).not.toContain('config_proposals');
    expect(body.data.config_loop).toEqual({ estado: 'restrito', total: 0, taxa_aprovacao: null, por_kind: [] });
  });

  it('falha na leitura vira "indisponivel" com aviso, não um zero', async () => {
    comoAdmin();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeDb({}, { config_proposals: 'boom' });
    const body = await (await GET(req('?from=2026-07-01&to=2026-07-03'))).json();
    expect(body.data.config_loop.estado).toBe('indisponivel');
    expect(warn.mock.calls.some((c) => String(c[0]).includes('config_proposals'))).toBe(true);
  });
});
