import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn().mockResolvedValue(null) }));

/**
 * POST /api/v1/ai/inbox/mark-seen — marca visto sem NUNCA reescrever quem já
 * tinha sido visto.
 *
 * O caso ⭐ é o que separa esta rota de virar um `resolve-all` de `seen_at`:
 * sem `.is("seen_at", null)` no `update`, reabrir a Central sobrescreveria o
 * `seen_at` de um item visto há uma semana com "agora" — e a única informação
 * que a coluna guarda (QUANDO alguém olhou PELA PRIMEIRA VEZ) se perderia toda
 * vez que a tela recarrega.
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
  updates: Array<{ patch: Record<string, unknown>; filtros: Array<[string, unknown]> }>;
}

/** Dublê que registra o `update` e o que foi filtrado — inclusive `is()`. */
function montar(opts: { linhasAfetadas: number }): Mundo {
  const updates: Mundo["updates"] = [];

  function builder() {
    let patch: Record<string, unknown> = {};
    const filtros: Array<[string, unknown]> = [];

    const enc: Record<string, unknown> = {};
    enc.update = (p: Record<string, unknown>) => {
      patch = p;
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
    enc.select = () => enc;
    enc.then = (resolve: (v: unknown) => unknown) => {
      updates.push({ patch, filtros: [...filtros] });
      const data = Array.from({ length: opts.linhasAfetadas }, (_, i) => ({ id: `item-${i}` }));
      return Promise.resolve(resolve({ data, error: null }));
    };

    return enc;
  }

  const client = { from: () => builder() } as never;
  return { client, updates };
}

async function postar() {
  const { POST } = await import("./route");
  return POST();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: usuario, org: orgAtiva });
});

describe("POST /api/v1/ai/inbox/mark-seen", () => {
  it("⭐ o update filtra seen_at IS NULL — nunca reescreve quem já foi visto", async () => {
    const m = montar({ linhasAfetadas: 3 });
    vi.mocked(createAdminClient).mockReturnValue(m.client as never);

    const res = await postar();

    expect(res.status).toBe(200);
    expect(m.updates).toHaveLength(1);
    expect(m.updates[0]!.filtros).toContainEqual(["seen_at", null]);
    expect(m.updates[0]!.filtros).toContainEqual(["status", "open"]);
    expect(m.updates[0]!.filtros).toContainEqual(["organization_id", ORG]);
    expect(m.updates[0]!.patch).toHaveProperty("seen_at");
    expect(m.updates[0]!.patch.seen_at).not.toBeNull();
  });

  it("devolve marked_count igual ao número de linhas afetadas", async () => {
    const m = montar({ linhasAfetadas: 7 });
    vi.mocked(createAdminClient).mockReturnValue(m.client as never);

    const res = await postar();
    const body = (await res.json()) as { data: { marked_count: number } };

    expect(body.data.marked_count).toBe(7);
  });

  it("CONTROLE — zero avisos para marcar: 200, marked_count 0, e NÃO audita", async () => {
    // Rodada sem efeito não é mutação — auditar o vazio é a mesma poluição que
    // a doutrina já barra nos crons (cron-audita-so-quando-ha-efeito).
    const m = montar({ linhasAfetadas: 0 });
    vi.mocked(createAdminClient).mockReturnValue(m.client as never);

    const res = await postar();
    const body = (await res.json()) as { data: { marked_count: number } };

    expect(body.data.marked_count).toBe(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it("com efeito, audita com o código canônico e sem PII no metadata", async () => {
    const m = montar({ linhasAfetadas: 2 });
    vi.mocked(createAdminClient).mockReturnValue(m.client as never);

    await postar();

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai.inbox_items_marked_seen",
        organizationId: ORG,
        resourceId: null,
        metadata: { count: 2 },
      }),
    );
  });
});
