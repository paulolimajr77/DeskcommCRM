/**
 * GET /api/v1/ai/assistente/threads e
 * GET /api/v1/ai/assistente/threads/[id]/messages — leitura pelo cliente de
 * SESSÃO (vale a RLS). Thread de outra org = 404, nunca 403.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { fail } from "@/lib/api/wrappers";
import type { AuthUser } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { GET: GET_THREADS } = await import("@/app/api/v1/ai/assistente/threads/route");
const { GET: GET_MESSAGES } = await import(
  "@/app/api/v1/ai/assistente/threads/[id]/messages/route"
);

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const THREAD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const user: AuthUser = {
  id: USER_ID,
  email: "u@example.com",
  full_name: null,
  avatar_url: null,
  is_platform_admin: false,
  idioma: "pt-BR" as const,
  organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: "agent" }],
};

vi.mocked(requireRole).mockImplementation(async (min: string) => {
  // Trava o papel mínimo: se a rota subir para "agent", este mock devolve 403
  // e os casos abaixo ficam vermelhos.
  if (min !== "viewer") {
    return { ok: false, response: fail("forbidden_role", "Papel mínimo do chat: viewer.", 403, {}) };
  }
  return {
    ok: true,
    user,
    org: { orgId: ORG_ID, name: "Org", role: "agent" },
  } as never;
});

function sessaoCom(linhas: Record<string, unknown[]>) {
  function cadeia(rows: unknown[]) {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
    c.then = (aceita: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(aceita);
    return c;
  }
  vi.mocked(createClient).mockResolvedValue({
    from: (t: string) => cadeia(linhas[t] ?? []),
  } as never);
}

describe("GET threads", () => {
  it("devolve as threads da org pelo cliente de sessão", async () => {
    sessaoCom({ config_threads: [{ id: THREAD_ID }] });
    const r = await GET_THREADS(new NextRequest("http://localhost/api/v1/ai/assistente/threads"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ data: { threads: [{ id: THREAD_ID }] } });
  });
});

describe("GET messages", () => {
  it("thread de outra org devolve 404", async () => {
    sessaoCom({});
    const r = await GET_MESSAGES(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: THREAD_ID }),
    });
    expect(r.status).toBe(404);
  });

  it("devolve o histórico em ordem", async () => {
    sessaoCom({
      config_threads: [{ id: THREAD_ID }],
      config_messages: [
        { author_kind: "human", body: "oi" },
        { author_kind: "ai", body: "olá" },
      ],
    });
    const r = await GET_MESSAGES(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: THREAD_ID }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      data: { mensagens: [{ author_kind: "human" }, { author_kind: "ai" }] },
    });
  });
});
