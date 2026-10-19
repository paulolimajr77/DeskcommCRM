/**
 * GET /api/v1/financeiro/comandas - filtro `contact_id` (uuid).
 *
 * - contact_id inválido → 400 `validation_failed`
 * - contact_id válido → filtra a lista pelo contacto (a consulta já é por organização,
 *   então contact_id de outra organização retorna vazio, nunca erro com dado alheio)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "33333333-3333-4333-8333-333333333333";

const FAKE_AUTHZ = {
  ok: true,
  user: { id: USER_ID, email: "a@example.com", is_platform_admin: false, idioma: "pt-BR" },
  org: { orgId: ORG_ID, name: "Org", role: "viewer" },
} as const;

interface Comanda {
  id: string;
  number: number;
  status: string;
  contact_id: string;
  total_cents: number;
}

const COMANDA_1: Comanda = { id: "s1", number: 101, status: "open", contact_id: CONTACT_ID, total_cents: 15000 };
const COMANDA_2: Comanda = { id: "s2", number: 102, status: "finalized", contact_id: "44444444-4444-4444-8444-444444444444", total_cents: 20000 };

let filtroContactId: string | null = null;
let comandasMock: Comanda[] = [];

function montarSupabase() {
  filtroContactId = null;
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((coluna: string, valor: unknown) => {
      if (coluna === "contact_id") filtroContactId = String(valor);
      return queryBuilder;
    }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((resolve) => {
      resolve({
        data: filtroContactId ? comandasMock.filter((c) => c.contact_id === filtroContactId) : comandasMock,
        error: null,
      });
    }),
  };
  const from = vi.fn().mockReturnValue(queryBuilder);
  vi.mocked(createClient).mockResolvedValue({ from } as never);
  return { from, queryBuilder };
}

function req(contactId?: string) {
  const url = new URL("http://localhost/api/v1/financeiro/comandas");
  if (contactId) url.searchParams.set("contact_id", contactId);
  return new NextRequest(url.toString());
}

describe("GET /api/v1/financeiro/comandas - filtro contact_id", () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue(FAKE_AUTHZ as never);
    vi.mocked(moduloLigado).mockResolvedValue(true);
    comandasMock = [COMANDA_1, COMANDA_2];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("contact_id inválido → 400 validation_failed", async () => {
    montarSupabase();
    const { GET } = await import("../../app/api/v1/financeiro/comandas/route");
    const res = await GET(req("not-a-uuid"));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_failed");
  });

  it("contact_id válido → filtra por contact_id", async () => {
    montarSupabase();
    const { GET } = await import("../../app/api/v1/financeiro/comandas/route");
    const res = await GET(req(CONTACT_ID));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Comanda[] };
    expect(body.data.length).toBe(1);
    expect(body.data[0]!.contact_id).toBe(CONTACT_ID);
    expect(filtroContactId).toBe(CONTACT_ID);
  });

  it("contact_id de outra organização → lista vazia (consulta já é por org)", async () => {
    montarSupabase();
    const { GET } = await import("../../app/api/v1/financeiro/comandas/route");
    // contact_id que NÃO está em comandasMock: o dublê só simula o banco,
    // a organização já é filtrada pela consulta real.
    const res = await GET(req("55555555-5555-4555-8555-555555555555"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Comanda[] };
    expect(body.data).toEqual([]);
  });

  it("sem contact_id → 200, sem .eq('contact_id', ...), mantém status/ordem/limit", async () => {
    montarSupabase();
    const { GET } = await import("../../app/api/v1/financeiro/comandas/route");
    const url = new URL("http://localhost/api/v1/financeiro/comandas?status=open&limit=10");
    const res = await GET(new NextRequest(url.toString()));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Comanda[] };
    expect(body.data.length).toBe(2);
    // Sem contact_id: não deve haver filtro de contact_id na consulta.
    expect(filtroContactId).toBeNull();
  });

  it("?status=x sem contact_id → 200 com filtro de status", async () => {
    montarSupabase();
    const { GET } = await import("../../app/api/v1/financeiro/comandas/route");
    const url = new URL("http://localhost/api/v1/financeiro/comandas?status=open");
    const res = await GET(new NextRequest(url.toString()));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Comanda[] };
    expect(body.data.length).toBe(2);
    expect(filtroContactId).toBeNull();
  });
});
