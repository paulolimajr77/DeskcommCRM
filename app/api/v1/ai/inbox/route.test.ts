import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));

/**
 * GET /api/v1/ai/inbox — O SINO OLHA O NOVO, NÃO O ACERVO.
 *
 * Migration 0275 deu à tabela `seen_at`. Esta rota passou a somar uma TERCEIRA
 * consulta (`unseen_count`), ao lado da que já existia (`open_count`) — e as
 * duas precisam continuar DISTINTAS: uma é o acervo (tudo que está `open`),
 * a outra é só o que ninguém viu (`open` e `seen_at is null`).
 *
 * O caso ⭐ é o que separa "a coluna existe" de "a rota a usa": se o código
 * esquecesse o `.is("seen_at", null)`, as duas contagens sairiam da MESMA
 * consulta e o double devolveria o mesmo número para as duas — o teste
 * reprovaria por `unseen_count` bater com `open_count` em vez do valor
 * esperado.
 */

const ORG = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const usuario: AuthUser = {
  id: USER_ID,
  email: "ana@clinica.com.br",
  full_name: "Ana",
  avatar_url: null,
  is_platform_admin: false,
  idioma: "pt-BR" as const,
  organizations: [{ organization_id: ORG, organization_name: "Clínica", role: "agent" }],
};
const orgAtiva: ActiveOrg = { orgId: ORG, name: "Clínica", role: "agent" };

interface Mundo {
  client: unknown;
  /** Cada consulta de CONTAGEM feita, na ordem — para provar o filtro de org. */
  contagens: Array<{ filtros: Array<[string, unknown]>; temFiltroDeVisto: boolean }>;
}

/**
 * Dublê do Supabase admin. Distingue a consulta de LISTA (devolve `data`) das
 * duas de CONTAGEM (`head: true` no `select`) pela opção passada — e, entre as
 * duas contagens, pela presença de `.is("seen_at", null)` na cadeia. É essa
 * distinção que prova que a rota fez a pergunta CERTA, não só uma pergunta a
 * mais.
 */
function montar(opts: { openCount: number; unseenCount: number }): Mundo {
  const contagens: Mundo["contagens"] = [];

  function builder() {
    let ehContagem = false;
    const filtros: Array<[string, unknown]> = [];

    const enc: Record<string, unknown> = {};
    enc.select = (_cols: string, options?: { head?: boolean }) => {
      if (options?.head) ehContagem = true;
      return enc;
    };
    enc.eq = (col: string, val: unknown) => {
      filtros.push([col, val]);
      return enc;
    };
    enc.is = (col: string, val: unknown) => {
      filtros.push([col, val]);
      return enc;
    };
    enc.order = () => enc;
    enc.limit = () => enc;

    enc.then = (resolve: (v: unknown) => unknown) => {
      if (ehContagem) {
        const temFiltroDeVisto = filtros.some(([c, v]) => c === "seen_at" && v === null);
        contagens.push({ filtros: [...filtros], temFiltroDeVisto });
        const count = temFiltroDeVisto ? opts.unseenCount : opts.openCount;
        return Promise.resolve(resolve({ data: null, count, error: null }));
      }
      return Promise.resolve(resolve({ data: [], error: null }));
    };

    return enc;
  }

  const client = { from: () => builder() } as never;
  return { client, contagens };
}

async function pedir() {
  const { GET } = await import("./route");
  const req = new NextRequest("https://crm.exemplo/api/v1/ai/inbox?status=open");
  return GET(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: usuario, org: orgAtiva });
});

describe("GET /api/v1/ai/inbox — unseen_count é distinto de open_count", () => {
  it("⭐ open_count é o ACERVO, unseen_count é só o que ninguém viu", async () => {
    const m = montar({ openCount: 9, unseenCount: 1 });
    vi.mocked(createAdminClient).mockReturnValue(m.client as never);

    const res = await pedir();
    const body = (await res.json()) as { data: { open_count: number; unseen_count: number } };

    expect(res.status).toBe(200);
    expect(body.data.open_count).toBe(9);
    expect(body.data.unseen_count).toBe(1);
  });

  it("CONTROLE DE TENANT — as DUAS contagens filtram organization_id", async () => {
    // Vazamento entre organizações é o fim do produto, não um bug grave — cada
    // organização é um cliente pagante diferente.
    const m = montar({ openCount: 3, unseenCount: 2 });
    vi.mocked(createAdminClient).mockReturnValue(m.client as never);

    await pedir();

    expect(m.contagens).toHaveLength(2);
    for (const c of m.contagens) {
      expect(c.filtros).toContainEqual(["organization_id", ORG]);
      expect(c.filtros).toContainEqual(["status", "open"]);
    }
    // E só UMA das duas leva o filtro de visto — é o que as separa.
    expect(m.contagens.filter((c) => c.temFiltroDeVisto)).toHaveLength(1);
  });

  it("CONTROLE — zero avisos abertos: as duas contagens saem 0, não undefined nem null", async () => {
    const m = montar({ openCount: 0, unseenCount: 0 });
    vi.mocked(createAdminClient).mockReturnValue(m.client as never);

    const res = await pedir();
    const body = (await res.json()) as { data: { open_count: number; unseen_count: number } };

    expect(body.data.open_count).toBe(0);
    expect(body.data.unseen_count).toBe(0);
  });
});
