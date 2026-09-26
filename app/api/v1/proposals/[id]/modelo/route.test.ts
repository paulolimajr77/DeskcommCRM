// app/api/v1/proposals/[id]/modelo/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks: Record<string, any> = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSupportWrite: vi.fn(),
  createAdminClient: vi.fn(),
  audit: vi.fn(),
  traduzir: vi.fn((txt: string) => txt),
  resolverModelo: vi.fn(),
}));

vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.requireSupportWrite }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/i18n/dicionario", () => ({ traduzir: mocks.traduzir }));
vi.mock("@/lib/propostas/modelos/resolver", () => ({ resolverModelo: mocks.resolverModelo }));

import { PATCH } from "./route";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROPOSTA_ID = "11111111-1111-4111-8111-111111111111";
const ROLE_RANK: Record<string, number> = { viewer: 1, agent: 2, manager: 3, admin: 4 };

interface MundoOpts {
  papel?: keyof typeof ROLE_RANK;
  status?: string;
  templateSlug?: string | null;
  sugestao?: string | null;
  modeloResolve?: { slug: string; version: number } | null;
}

function montarMundo(opts: MundoOpts = {}) {
  const papel = opts.papel ?? "manager";
  const rank = ROLE_RANK[papel] ?? 0;
  mocks.requireRole.mockImplementation(async (minRole: keyof typeof ROLE_RANK) => {
    const minRank = ROLE_RANK[minRole] ?? 0;
    return rank < minRank
      ? { ok: false, response: new Response(JSON.stringify({ error: { code: "forbidden_role" } }), { status: 403 }) }
      : { ok: true, user: { id: "u1", idioma: "pt-BR" }, org: { orgId: ORG_ID } };
  });
  mocks.requireSupportWrite.mockResolvedValue(null);

  const propostaRow = {
    id: PROPOSTA_ID,
    status: opts.status ?? "rascunho",
    template_slug: opts.templateSlug ?? null,
    template_slug_sugerido: opts.sugestao ?? null,
  };

  let updateCapturado: Record<string, unknown> | undefined;
  const admin = {
    from: vi.fn((tabela: string) => {
      if (tabela === "crm_proposals") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: propostaRow }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updateCapturado = payload;
            return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
          },
        };
      }
      throw new Error(`tabela inesperada no mock: ${tabela}`);
    }),
  };
  mocks.createAdminClient.mockReturnValue(admin);

  mocks.resolverModelo.mockImplementation(async () => {
    const m = opts.modeloResolve === undefined ? { slug: "landing_page", version: 1 } : opts.modeloResolve;
    if (!m) return null;
    return { ...m, sections: [], sectionOrder: [], origem: "base" };
  });

  return { updateCapturado: () => updateCapturado };
}

function reqComBody(body: unknown) {
  return new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }) as never;
}

function ctx(id = PROPOSTA_ID) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/v1/proposals/[id]/modelo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirma um modelo válido: grava template_slug/version e limpa a sugestão", async () => {
    const mundo = montarMundo({ sugestao: "landing_page", modeloResolve: { slug: "landing_page", version: 1 } });
    const res = await PATCH(reqComBody({ template_slug: "landing_page" }), ctx());
    expect(res.status).toBe(200);
    expect(mundo.updateCapturado()).toMatchObject({
      template_slug: "landing_page",
      template_version: expect.any(Number),
      template_slug_sugerido: null,
    });
  });

  it("recusa modelo que não existe no catálogo nem na organização", async () => {
    montarMundo({ modeloResolve: null });
    const res = await PATCH(reqComBody({ template_slug: "nao_existe" }), ctx());
    expect(res.status).toBe(422);
  });

  it("recusa confirmar modelo numa proposta que já não está em rascunho", async () => {
    montarMundo({ status: "enviada" });
    const res = await PATCH(reqComBody({ template_slug: "landing_page" }), ctx());
    expect(res.status).toBe(409);
  });

  it("template_slug: null remove o modelo confirmado (não mexe na sugestão)", async () => {
    const mundo = montarMundo({ templateSlug: "landing_page", sugestao: "ecommerce" });
    const res = await PATCH(reqComBody({ template_slug: null }), ctx());
    expect(res.status).toBe(200);
    expect(mundo.updateCapturado()).toMatchObject({ template_slug: null, template_version: null });
    expect(mundo.updateCapturado()).not.toHaveProperty("template_slug_sugerido");
  });
});
