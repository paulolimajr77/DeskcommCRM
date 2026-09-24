import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks: Record<string, any> = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSupportWrite: vi.fn(),
  createAdminClient: vi.fn(),
  audit: vi.fn(),
  traduzir: vi.fn((txt: string) => txt),
}));

vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.requireSupportWrite }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/i18n/dicionario", () => ({ traduzir: mocks.traduzir }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROPOSTA_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "66666666-6666-4666-8666-666666666666";
const CONTACT_ID = "77777777-7777-4777-8777-777777777777";
const CONVERSA_ID = "88888888-8888-4888-8888-888888888888";

const ROLE_RANK: Record<string, number> = { viewer: 1, agent: 2, manager: 3, admin: 4 };

interface MundoOpts {
  papel?: keyof typeof ROLE_RANK;
  status?: string;
  numero?: number | null;
  ano?: number | null;
  versao?: number;
  /** O INSERT da v2 colide (negócio já tem outro rascunho aberto — §5.3). */
  criacaoDaV2Colide23505?: boolean;
  /** Força o INSERT de `crm_proposal_items` da v2 a falhar. */
  itensDaV2Falham?: boolean;
  /** A v1 não tem itens (a v2 nasce sem itens, sem erro). */
  semItens?: boolean;
}

function montarMundoDeRevisao(opts: MundoOpts = {}) {
  const papel = opts.papel ?? "manager";
  const rank = ROLE_RANK[papel] ?? 0;
  mocks.requireRole.mockImplementation(async (minRole: keyof typeof ROLE_RANK) => {
    const minRank = ROLE_RANK[minRole] ?? 0;
    return rank < minRank
      ? { ok: false, response: new Response(JSON.stringify({ error: { code: "forbidden_role" } }), { status: 403 }) }
      : { ok: true, user: { id: USER_ID, idioma: "pt-BR" }, org: { orgId: ORG_ID } };
  });
  mocks.requireSupportWrite.mockResolvedValue(null);

  const proposta = {
    id: PROPOSTA_ID,
    organization_id: ORG_ID,
    lead_id: LEAD_ID,
    contact_id: CONTACT_ID,
    conversation_id: CONVERSA_ID,
    titulo: "Proposta de Teste",
    condicoes: "Condições",
    valid_until: "2026-12-31",
    total_cents: 500000,
    moeda: "BRL",
    pricing_status: "manual",
    status: opts.status ?? "enviada",
    numero: opts.numero ?? 42,
    ano: opts.ano ?? 2026,
    versao: opts.versao ?? 1,
    substitui_id: null,
  };
  const item = {
    id: "item-1",
    organization_id: ORG_ID,
    proposal_id: PROPOSTA_ID,
    product_id: null,
    descricao: "Serviço",
    quantidade: 1,
    preco_unitario_cents: 500000,
    desconto_cents: 0,
    position: 1000,
  };

  let propostaCriada: Record<string, unknown> | null = null;
  let itensCopiados: Array<Record<string, unknown>> | null = null;
  let propostaDeletadaId: string | null = null;
  const updateChamadas: Array<unknown> = [];

  mocks.createAdminClient.mockReturnValue({
    from: (tabela: string) => {
      if (tabela === "crm_proposals") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: proposta, error: null }),
              }),
            }),
          }),
          insert: (dados: unknown) => ({
            select: () => ({
              single: async () => {
                if (opts.criacaoDaV2Colide23505) return { data: null, error: { code: "23505", message: "colisao" } };
                propostaCriada = { ...(dados as object), id: "v2-id-nova" };
                return { data: propostaCriada, error: null };
              },
            }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          update: (dados: any) => {
            updateChamadas.push(dados);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cadeia: any = {
              eq: () => cadeia,
              then(resolve: (r: { error: null }) => void) {
                resolve({ error: null });
              },
            };
            return cadeia;
          },
          delete: () => {
            let alvoId: string | null = null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cadeia: any = {
              eq(campo: string, valor: unknown) {
                if (campo === "id") alvoId = valor as string;
                return cadeia;
              },
              then(resolve: (r: { error: null }) => void) {
                propostaDeletadaId = alvoId;
                resolve({ error: null });
              },
            };
            return cadeia;
          },
        };
      }
      if (tabela === "crm_proposal_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({ data: opts.semItens ? [] : [item], error: null }),
              }),
            }),
          }),
          insert: (dados: unknown) => {
            if (opts.itensDaV2Falham) return { error: { message: "boom" } };
            itensCopiados = dados as Array<Record<string, unknown>>;
            return { error: null };
          },
        };
      }
      throw new Error(`Tabela desconhecida: ${tabela}`);
    },
  });

  return {
    get propostaCriada() { return propostaCriada; },
    get itensCopiados() { return itensCopiados; },
    get propostaDeletadaId() { return propostaDeletadaId; },
    get updateChamadas() { return updateChamadas; },
    async POST() {
      const { POST } = await import("./route");
      return POST(new Request("http://x") as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/v1/proposals/[id]/revise", () => {
  it("proposta enviada: cria v2 em rascunho, herda numero/ano, copia os itens; v1 CONTINUA enviada", async () => {
    const mundo = montarMundoDeRevisao({ status: "enviada" });
    const res = await mundo.POST();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("v2-id-nova");
    // a v1 NÃO deve ter sido atualizada para 'substituida' aqui — só a v2 é inserida.
    expect(mundo.updateChamadas).toHaveLength(0);
    expect(mundo.propostaCriada).toMatchObject({
      status: "rascunho", numero: 42, ano: 2026, versao: 2, substitui_id: PROPOSTA_ID,
    });
    expect(mundo.itensCopiados).toHaveLength(1);
    expect(mundo.itensCopiados?.[0]).toMatchObject({ proposal_id: "v2-id-nova", descricao: "Serviço" });
  });

  it("proposta rascunho: 409, ela já é editável pela PATCH", async () => {
    const mundo = montarMundoDeRevisao({ status: "rascunho", numero: null, ano: null });
    const res = await mundo.POST();
    expect(res.status).toBe(409);
    expect(mundo.propostaCriada).toBeNull();
  });

  it("proposta aceita/recusada/vencida/cancelada: 409", async () => {
    for (const status of ["aceita", "recusada", "vencida", "cancelada"]) {
      const mundo = montarMundoDeRevisao({ status, numero: status === "aceita" ? 42 : null, ano: status === "aceita" ? 2026 : null });
      const res = await mundo.POST();
      expect(res.status).toBe(409);
      expect(mundo.propostaCriada).toBeNull();
    }
  });

  it("negócio já tem OUTRO rascunho aberto (índice único global do §5.3): 409, nada é gravado", async () => {
    const mundo = montarMundoDeRevisao({ status: "enviada", criacaoDaV2Colide23505: true });
    const res = await mundo.POST();
    expect(res.status).toBe(409);
    expect(mundo.propostaCriada).toBeNull();
  });

  it("falha ao copiar os itens: a v2 recém-criada é APAGADA, v1 continua intacta", async () => {
    const mundo = montarMundoDeRevisao({ status: "enviada", itensDaV2Falham: true });
    const res = await mundo.POST();
    expect(res.status).toBe(500);
    expect(mundo.propostaDeletadaId).toBe("v2-id-nova");
    expect(mundo.updateChamadas).toHaveLength(0);
  });

  it("papel agent (abaixo de manager): 403", async () => {
    const mundo = montarMundoDeRevisao({ papel: "agent", status: "enviada" });
    const res = await mundo.POST();
    expect(res.status).toBe(403);
    expect(mundo.propostaCriada).toBeNull();
  });
});
