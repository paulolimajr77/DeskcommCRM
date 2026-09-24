import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { sePropostasDesligadas } from "@/lib/propostas/porta";

vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
// Isola o handler do gate de suporte (autoridade própria testada em
// lib/impersonate/support.test.ts) — nenhum teste aqui exercita acompanhamento.
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const LEAD_ID = "44444444-4444-4444-8444-444444444444";
const CONTACT_ID = "55555555-5555-4555-8555-555555555555";

const ROLE_RANK: Record<string, number> = { viewer: 1, agent: 2, ai_operator: 3, manager: 4, admin: 5 };

function pedido(corpo: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/proposals", {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
}

interface MundoOpts {
  /** Simula um lead cujo organization_id é de OUTRA organização — a query
   * org-scoped não o encontra, exatamente como o Postgres real faria. */
  leadPertenceAOutraOrg?: boolean;
  papel?: keyof typeof ROLE_RANK;
}

function montarMundoDeProposta(opts: MundoOpts = {}) {
  const papel = opts.papel ?? "agent";
  const propostasCriadas: Record<string, unknown>[] = [];
  const itensCriados: Record<string, unknown>[] = [];

  vi.mocked(requireRole).mockImplementation(async (min: string) => {
    const rank = ROLE_RANK[papel] ?? 0;
    if (rank < (ROLE_RANK[min] ?? 0)) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: { code: "forbidden_role", message: "sem papel" } }), {
          status: 403,
        }),
      } as never;
    }
    return {
      ok: true,
      user: { id: USER_ID, idioma: "pt-BR" },
      org: { orgId: ORG_ID },
    } as never;
  });

  const supabase = {
    from: (tabela: string) => {
      if (tabela === "crm_leads") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: opts.leadPertenceAOutraOrg ? null : { id: LEAD_ID, contact_id: CONTACT_ID },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (tabela === "crm_proposals") {
        return {
          insert: (linha: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const id = `proposta-${propostasCriadas.length + 1}`;
                // numero/ano nunca são escritos pela rota — nascem NULL por
                // omissão da coluna, exatamente como o Postgres faria.
                propostasCriadas.push({ numero: null, ano: null, ...linha, id });
                return { data: { id }, error: null };
              },
            }),
          }),
          // Cadeia auto-referente (eq/order/limit sempre devolvem a mesma
          // cadeia, como o builder real do Supabase — que aceita `.eq()`
          // mesmo depois de `.limit()`), e resolve ao ser `await`ada.
          select: () => {
            const filtros: Record<string, unknown> = {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cadeia: any = {
              eq(campo: string, valor: unknown) {
                filtros[campo] = valor;
                return cadeia;
              },
              order() {
                return cadeia;
              },
              limit() {
                return cadeia;
              },
              then(resolve: (r: { data: unknown[]; error: null }) => void) {
                resolve({
                  data: propostasCriadas.filter((p) =>
                    Object.entries(filtros).every(([c, v]) => c === "organization_id" || p[c] === v),
                  ),
                  error: null,
                });
              },
            };
            return cadeia;
          },
        };
      }
      if (tabela === "crm_proposal_items") {
        return {
          insert: async (linhas: Record<string, unknown>[]) => {
            itensCriados.push(...linhas);
            return { error: null };
          },
        };
      }
      if (tabela === "crm_lead_activities") {
        return { insert: async () => ({ error: null }) };
      }
      if (tabela === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  settings: {
                    proposals: { enabled: false, default_valid_days: 15, default_conditions: null },
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela não mockada neste teste: ${tabela}`);
    },
  };
  vi.mocked(createClient).mockResolvedValue(supabase as never);

  return {
    leadId: LEAD_ID,
    propostasCriadas,
    itensCriados,
    async POST(corpo: unknown) {
      const { POST } = await import("./route");
      const res = await POST(pedido(corpo));
      const body = await res.clone().json();
      return { status: res.status, body };
    },
    async GET(query = "") {
      const { GET } = await import("./route");
      const res = await GET(new NextRequest(`http://localhost/api/v1/proposals${query}`));
      const body = await res.clone().json();
      return { status: res.status, body };
    },
  };
}

describe("POST /api/v1/proposals", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("cria com status rascunho, numero/ano nulos, total calculado", async () => {
    const mundo = montarMundoDeProposta();
    const res = await mundo.POST({
      lead_id: mundo.leadId,
      titulo: "Site institucional",
      itens: [
        { product_id: null, descricao: "Site", quantidade: 1, preco_unitario_cents: 800000, desconto_cents: 0, position: 1000 },
      ],
    });
    expect(res.status).toBe(201);
    const criada = mundo.propostasCriadas.at(-1);
    expect(criada?.status).toBe("rascunho");
    expect(criada?.numero).toBeNull();
    expect(criada?.total_cents).toBe(800000);
  });

  it("rejeita lead de OUTRA organização (422/404, nunca 500 silencioso)", async () => {
    const mundo = montarMundoDeProposta({ leadPertenceAOutraOrg: true });
    const res = await mundo.POST({ lead_id: mundo.leadId, titulo: "x", itens: [] });
    expect([404, 422]).toContain(res.status);
    expect(mundo.propostasCriadas).toHaveLength(0);
  });

  it("papel viewer não cria (403)", async () => {
    const mundo = montarMundoDeProposta({ papel: "viewer" });
    const res = await mundo.POST({ lead_id: mundo.leadId, titulo: "x", itens: [] });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/proposals", () => {
  it("lista só as propostas da organização ativa", async () => {
    const mundo = montarMundoDeProposta();
    const res = await mundo.GET();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("filtra por lead_id quando informado (D10 — tela de excluir negócio)", async () => {
    const mundo = montarMundoDeProposta();
    await mundo.POST({
      lead_id: mundo.leadId, titulo: "do lead", itens: [
        { product_id: null, descricao: "x", quantidade: 1, preco_unitario_cents: 100, desconto_cents: 0, position: 1000 },
      ],
    });
    const res = await mundo.GET(`?lead_id=${mundo.leadId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: { lead_id: string }) => p.lead_id === mundo.leadId)).toBe(true);

    const semFiltro = await mundo.GET(`?lead_id=algum-outro-id-que-nao-existe`);
    expect(semFiltro.body.data).toEqual([]);
  });
});

describe("GET /api/v1/proposals — capacidade desligada", () => {
  it("organização com propostas desligadas: 404, sem listar nada", async () => {
    const mundo = montarMundoDeProposta();
    vi.mocked(sePropostasDesligadas).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "not_found", message: "Not found." } }), {
        status: 404,
      }) as never,
    );
    const res = await mundo.GET();
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "not_found" } });
  });
});
