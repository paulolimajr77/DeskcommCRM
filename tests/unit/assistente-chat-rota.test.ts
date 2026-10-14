/**
 * POST /api/v1/ai/assistente/chat — o chat de leitura do assistente interno (F1).
 *
 * F1 é determinístico e sem modelo: a pergunta vira resposta por três
 * caminhos — resumo operacional (contas diretas), trecho de guia
 * (`assistente-*` via loadSkills+matchSkills, o mesmo matcher do turno
 * inbound) ou fallback honesto. O que este arquivo prova: guardas antes de
 * tudo, idempotência por turn_id, escrita só em `config_*` + audit sem PII.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/agent-engine/agent/skills", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  loadSkills: vi.fn(),
}));

const { POST } = await import("@/app/api/v1/ai/assistente/chat/route");
const { loadSkills } = await import("@/lib/agent-engine/agent/skills");

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const THREAD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TURN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function session(effectiveRole: Role = "agent") {
  const user: AuthUser = {
    id: USER_ID,
    email: "u@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: effectiveRole }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) => {
    if (ROLE_RANK[effectiveRole] >= ROLE_RANK[min]) {
      return { ok: true, user, org: { orgId: ORG_ID, name: "Org", role: effectiveRole } };
    }
    return { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) };
  });
}

/** Pool falso respondendo por FORMA de consulta, registrando escritas. */
function poolFalso(
  over: {
    inserirLanca?: { code: string };
    threads?: unknown[];
    /** Turno pela metade: o insert do human colide, o do ai passa. */
    humanJaGravado?: boolean;
    /** Corrida: o insert do ai colide (a outra tentativa gravou primeiro). */
    aiJaGravado?: boolean;
    mensagensDoTurno?: Array<{ author_kind: string; body: string }>;
  } = {},
) {
  const escritas: Array<{ sql: string; params: unknown[] }> = [];
  const parGravado = over.mensagensDoTurno ?? [
    { author_kind: "human", body: "oi" },
    { author_kind: "ai", body: "olá" },
  ];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/insert into public\.config_(threads|messages)/.test(sql)) {
      if (over.inserirLanca) throw over.inserirLanca;
      if (over.humanJaGravado && /'human'/.test(sql)) throw { code: "23505" };
      if (over.aiJaGravado && /'ai'/.test(sql)) throw { code: "23505" };
      escritas.push({ sql, params });
      return { rows: [{ id: `nova-${escritas.length}` }] };
    }
    if (/from public\.config_threads/.test(sql)) return { rows: over.threads ?? [{ id: THREAD_ID }] };
    if (/from public\.config_messages/.test(sql)) {
      return { rows: parGravado };
    }
    if (/count\(\*\)/.test(sql)) return { rows: [{ n: "7" }] };
    return { rows: [] };
  });
  vi.mocked(getRequestPool).mockReturnValue({ query } as never);
  return { escritas };
}

function pedido(corpo: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/ai/assistente/chat", {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
}

const CORPO_OK = { thread_id: THREAD_ID, turn_id: TURN_ID, pergunta: "quantas conversas abertas?" };

const GUIA_METRICAS = {
  versionId: "v1",
  name: "assistente-metricas",
  description: "como ler cada número",
  body: "# Métricas: o funil lê stage_changed; amostra zero vira null.",
  matcher: { any_keywords: ["funil", "metrica", "conversao"] },
  manifest: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  session("agent");
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(loadSkills).mockResolvedValue([GUIA_METRICAS]);
});

describe("POST — guardas", () => {
  it("403 em acompanhamento somente-leitura, ANTES de tudo", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("forbidden", "somente leitura", 403, {}));
    poolFalso();
    const r = await POST(pedido(CORPO_OK));
    expect(r.status).toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
  });

  it("403 para viewer (chat exige agent)", async () => {
    session("viewer");
    poolFalso();
    expect((await POST(pedido(CORPO_OK))).status).toBe(403);
  });

  it("Zod é .strict(): campo desconhecido reprova com 422", async () => {
    poolFalso();
    expect((await POST(pedido({ ...CORPO_OK, thread_nova: true }))).status).toBe(422);
  });

  it("pergunta curta demais reprova com 422", async () => {
    poolFalso();
    expect((await POST(pedido({ turn_id: TURN_ID, pergunta: "e?" }))).status).toBe(422);
  });

  it("thread de outra org devolve 404, sem distinguir", async () => {
    poolFalso({ threads: [] });
    expect((await POST(pedido(CORPO_OK))).status).toBe(404);
  });
});

describe("POST — idempotência pelo turn_id", () => {
  it("turn_id repetido devolve replay SEM segunda resposta", async () => {
    const { escritas } = poolFalso({ inserirLanca: { code: "23505" } });
    const r = await POST(pedido(CORPO_OK));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ data: { replay: true } });
    expect(escritas).toEqual([]);
  });

  it("turno pela metade: reenvio gera a resposta que faltou", async () => {
    // O human gravou, o ai não. O reenvio com o mesmo turn_id RETOMA em vez
    // de devolver mudo: 1 insert (só o ai), resposta preenchida, 1 audit.
    const { escritas } = poolFalso({
      humanJaGravado: true,
      mensagensDoTurno: [{ author_kind: "human", body: "como ler o funil?" }],
    });
    const r = await POST(pedido({ turn_id: TURN_ID, pergunta: "como ler o funil?" }));
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { data: Record<string, unknown> };
    expect(corpo.data).toMatchObject({ fonte: "guia", replay: false });
    expect(String(corpo.data.resposta)).toContain("stage_changed");
    expect(escritas.filter((q) => /insert into public\.config_messages/.test(q.sql))).toHaveLength(1);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("o texto gravado manda: pedido novo não sobrescreve a pergunta do turno", async () => {
    const { escritas } = poolFalso({
      humanJaGravado: true,
      mensagensDoTurno: [{ author_kind: "human", body: "como ler o funil?" }],
    });
    const r = await POST(pedido({ turn_id: TURN_ID, pergunta: "outra pergunta qualquer" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ data: { fonte: "guia", replay: false } });
    expect(escritas.filter((q) => /insert into public\.config_messages/.test(q.sql))).toHaveLength(1);
  });

  it("dois ao mesmo tempo: ai colidindo devolve replay, sem audit e sem 500", async () => {
    const { escritas } = poolFalso({ aiJaGravado: true });
    const r = await POST(pedido({ turn_id: TURN_ID, pergunta: "como ler o funil?" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ data: { replay: true } });
    expect(escritas.filter((q) => /insert into public\.config_messages/.test(q.sql))).toHaveLength(1);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("POST — caminho feliz", () => {
  it("pergunta de guia devolve trecho da skill casada e grava as 2 linhas", async () => {
    const { escritas } = poolFalso();
    const r = await POST(pedido({ turn_id: TURN_ID, pergunta: "como ler o funil?" }));
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { data: Record<string, unknown> };
    expect(corpo.data).toMatchObject({ fonte: "guia", replay: false });
    expect(String(corpo.data.resposta)).toContain("stage_changed");
    expect(escritas.filter((q) => /insert into public.config_messages/.test(q.sql))).toHaveLength(2);
  });

  it("pergunta de resumo devolve contas diretas do banco", async () => {
    const { escritas } = poolFalso();
    const r = await POST(pedido({ turn_id: TURN_ID, pergunta: "resumo: quantas conversas abertas?" }));
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { data: Record<string, unknown> };
    expect(corpo.data).toMatchObject({ fonte: "metrica", replay: false });
    expect(String(corpo.data.resposta)).toContain("7");
    expect(escritas.filter((q) => /insert into public.config_messages/.test(q.sql))).toHaveLength(2);
  });

  it("pergunta sem match devolve fallback honesto", async () => {
    vi.mocked(loadSkills).mockResolvedValue([]);
    const { escritas } = poolFalso();
    const r = await POST(pedido({ turn_id: TURN_ID, pergunta: "qual o sentido da vida?" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ data: { fonte: "inicial" } });
    expect(escritas.filter((q) => /insert into public.config_messages/.test(q.sql))).toHaveLength(2);
  });
});

describe("POST — o que a rota NÃO toca", () => {
  it("zero escrita fora de config_threads/config_messages", async () => {
    const { escritas } = poolFalso();
    await POST(pedido({ turn_id: TURN_ID, pergunta: "como ler o funil?" }));
    expect(escritas.every((q) => /insert into public.config_(threads|messages)/.test(q.sql))).toBe(true);
  });

  it("audita SEM o texto da pergunta nem da resposta", async () => {
    poolFalso();
    await POST(pedido({ turn_id: TURN_ID, pergunta: "como ler o funil secreto?" }));
    expect(audit).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(audit).mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(arg).toMatchObject({ action: "ai.assistente_asked" });
    expect(JSON.stringify(arg)).not.toContain("funil secreto");
  });
});
