/**
 * POST /api/v1/ai/assistente/propostas/[id]/rejeitar — T20.
 *
 * O que este arquivo prova: só `admin` decide; `requireSupportWrite` antes de
 * qualquer efeito; `[id]` uuid; corpo estrito (`motivo` opcional ≤1000,
 * organização do corpo é 422); compare-and-swap de `pendente` com a
 * organização DA SESSÃO; zero linhas explica (404 / expirada / estado); o
 * motivo vai para `decision_reason` na LINHA e NUNCA para o audit.
 */
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { audit } from "@/lib/audit";
import { requireSupportWrite } from "@/lib/impersonate/support";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: vi.fn() }));

const { POST } = await import("@/app/api/v1/ai/assistente/propostas/[id]/rejeitar/route");
const { getRequestPool } = await import("@/lib/agent-engine/db/request-pool");

const ORG_ID = "11111111-2222-4333-8444-555555555551";
const USER_ID = "11111111-2222-4333-8444-555555555552";
const PROPOSTA_ID = "11111111-2222-4333-8444-555555555555";
const MOTIVO = "O agente que a proposta cria atende errado neste nicho.";

function sessao(papel: Role) {
  const user: AuthUser = {
    id: USER_ID,
    email: "u@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR",
    organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) => {
    if (ROLE_RANK[papel] >= ROLE_RANK[min]) {
      return { ok: true, user, org: { orgId: ORG_ID, name: "Org", role: papel } };
    }
    return { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) };
  });
}

interface LinhaDeTeste {
  id: string;
  kind: string;
  payload: { operacao: string; corpo: Record<string, unknown> };
  risk: string;
  status: string;
  resumo: string;
  motivo: string;
  antes: null;
  requested_by: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  applied_by: string | null;
  applied_at: string | null;
  apply_result: null;
  expires_at: string;
  created_at: string;
}

function linha(over: Partial<LinhaDeTeste>): LinhaDeTeste {
  return {
    id: PROPOSTA_ID,
    kind: "roteador",
    payload: { operacao: "criar", corpo: { name: "Roteador", channel_session_id: "11111111-2222-4333-8444-555555555556" } },
    risk: "atencao",
    status: "rejeitada",
    resumo: "Criar o roteador",
    motivo: "A pessoa pediu.",
    antes: null,
    requested_by: USER_ID,
    decided_by: USER_ID,
    decided_at: "2026-10-16T10:00:00Z",
    decision_reason: null,
    applied_by: null,
    applied_at: null,
    apply_result: null,
    expires_at: "2099-10-23T09:00:00Z",
    created_at: "2026-10-16T09:00:00Z",
    ...over,
  };
}

interface Consulta {
  sql: string;
  params: unknown[] | undefined;
}

interface Estado {
  cas: LinhaDeTeste | null;
  linhaAtual: Record<string, unknown> | null;
  consultas: Consulta[];
  erro: Error | null;
}

function poolFalso(estado: Estado) {
  async function executar(sql: string, params: unknown[]) {
    if (estado.erro) throw estado.erro;
    estado.consultas.push({ sql, params });
    const s = sql.toLowerCase();
    if (s.includes("set status = 'rejeitada'")) return { rows: estado.cas ? [estado.cas] : [] };
    if (s.includes("set status = 'expirada'")) return { rows: [] };
    if (s.trim().startsWith("select status, expires_at")) {
      return { rows: estado.linhaAtual ? [estado.linhaAtual] : [] };
    }
    throw new Error(`SQL não esperado pelo dublê: ${sql.slice(0, 80)}`);
  }
  return { query: vi.fn(executar) };
}

let estado: Estado;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(audit).mockResolvedValue(undefined);
  estado = { cas: null, linhaAtual: null, consultas: [], erro: null };
  vi.mocked(getRequestPool).mockImplementation(() => poolFalso(estado) as never);
  sessao("admin");
});

function requisicao(id: string, corpo?: unknown): NextRequest {
  return new NextRequest(`http://interno.invalid/api/v1/ai/assistente/propostas/${id}/rejeitar`, {
    method: "POST",
    headers: corpo === undefined ? {} : { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

describe("quem pode rejeitar", () => {
  it.each(["manager", "agent", "viewer"] as const)("%s recebe 403 e o pool não é tocado", async (papel) => {
    sessao(papel);

    const resposta = await POST(requisicao(PROPOSTA_ID, {}), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(403);
    expect(getRequestPool).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("requireSupportWrite roda ANTES de qualquer efeito", async () => {
    // Sabotagem: mover a guarda para depois do CAS (ou apagá-la) → a ordem das
    // chamadas e o gate `suporte-cobertura-de-efeitos` ficam vermelhos.
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("support_readonly", "somente leitura", 403, {}) as never);

    const resposta = await POST(requisicao(PROPOSTA_ID, {}), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
    expect(getRequestPool).not.toHaveBeenCalled();
  });

  it("id que não é uuid é 422; corpo estranho (org no corpo) é 422; motivo longo é 422", async () => {
    expect((await POST(requisicao("nao-e-uuid", {}), { params: Promise.resolve({ id: "nao-e-uuid" }) })).status).toBe(422);

    const longo = "a".repeat(1001);
    expect((await POST(requisicao(PROPOSTA_ID, { motivo: longo }), { params: Promise.resolve({ id: PROPOSTA_ID }) })).status).toBe(422);
    expect(
      (await POST(requisicao(PROPOSTA_ID, { organization_id: ORG_ID }), { params: Promise.resolve({ id: PROPOSTA_ID }) })).status,
    ).toBe(422);
    expect(estado.consultas).toEqual([]);
  });
});

describe("o compare-and-swap", () => {
  it("só rejeita `pendente` dentro do prazo, na organização da SESSÃO, com o motivo na linha", async () => {
    estado.cas = linha({ decision_reason: MOTIVO });

    const resposta = await POST(requisicao(PROPOSTA_ID, { motivo: MOTIVO }), {
      params: Promise.resolve({ id: PROPOSTA_ID }),
    });

    expect(resposta.status).toBe(200);
    const consulta = estado.consultas[0]!;
    expect(consulta.sql).toContain("status = 'pendente' and expires_at > now()");
    expect(consulta.sql).toContain("decision_reason = $4::text");
    expect(consulta.params).toEqual([PROPOSTA_ID, ORG_ID, USER_ID, MOTIVO]);
    const json = (await resposta.json()) as { data: { status: string; decision_reason: string | null } };
    expect(json.data.status).toBe("rejeitada");
    expect(json.data.decision_reason).toBe(MOTIVO);
  });

  it("sem corpo nenhum também rejeita (motivo null)", async () => {
    estado.cas = linha({ decision_reason: null });

    const resposta = await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(200);
    expect(estado.consultas[0]!.params![3]).toBeNull();
  });

  it("audita `assistente.proposta_rejeitada` só com kind, operacao e risk — NUNCA o motivo", async () => {
    // Sabotagem: acrescentar `motivo` (ou o texto) ao metadata do audit → o `toEqual` e o
    // `not.toContain` ficam vermelhos.
    estado.cas = linha({ decision_reason: MOTIVO });

    await POST(requisicao(PROPOSTA_ID, { motivo: MOTIVO }), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(audit).toHaveBeenCalledTimes(1);
    const entrada = vi.mocked(audit).mock.calls[0]![0];
    expect(entrada).toMatchObject({
      action: "assistente.proposta_rejeitada",
      actorUserId: USER_ID,
      organizationId: ORG_ID,
      resourceType: "config_proposals",
      resourceId: PROPOSTA_ID,
    });
    expect(entrada.metadata).toEqual({ kind: "roteador", operacao: "criar", risk: "atencao" });
    expect(JSON.stringify(entrada)).not.toContain(MOTIVO);
  });

  it("zero linhas por organização de outra empresa → 404 e nenhuma escrita além do CAS", async () => {
    estado.cas = null;
    estado.linhaAtual = null;

    const resposta = await POST(requisicao(PROPOSTA_ID, {}), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(404);
    expect(estado.consultas).toHaveLength(2);
    expect(estado.consultas[0]!.params![1]).toBe(ORG_ID);
    expect(estado.consultas.slice(1).some((c) => c.sql.toLowerCase().includes("set status"))).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });

  it("vencida → marca `expirada` e 409 `proposta_expirada`", async () => {
    estado.cas = null;
    estado.linhaAtual = { status: "pendente", expires_at: "2020-01-01T00:00:00Z" };

    const resposta = await POST(requisicao(PROPOSTA_ID, {}), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(409);
    const json = (await resposta.json()) as { error: { code: string } };
    expect(json.error.code).toBe("proposta_expirada");
    const expirada = estado.consultas.find((c) => c.sql.includes("set status = 'expirada'"));
    expect(expirada, "a proposta vencida deve ser marcada `expirada`").toBeTruthy();
    expect(audit).not.toHaveBeenCalled();
  });

  it.each(["aprovada", "aplicada"] as const)(
    "estado %s → 409 `proposta_em_estado_invalido` com o status atual",
    async (statusAtual) => {
      estado.cas = null;
      estado.linhaAtual = { status: statusAtual, expires_at: "2099-10-23T09:00:00Z" };

      const resposta = await POST(requisicao(PROPOSTA_ID, {}), { params: Promise.resolve({ id: PROPOSTA_ID }) });

      expect(resposta.status).toBe(409);
      const json = (await resposta.json()) as { error: { code: string; details?: { status?: string } } };
      expect(json.error.code).toBe("proposta_em_estado_invalido");
      expect(json.error.details?.status).toBe(statusAtual);
      expect(audit).not.toHaveBeenCalled();
    },
  );

  it("erro do pool é 500 sem vazar a mensagem do banco", async () => {
    estado.erro = new Error("conexão caiu no meio do update");

    const resposta = await POST(requisicao(PROPOSTA_ID, {}), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(500);
    expect(JSON.stringify(await resposta.json())).not.toContain("conexão caiu");
  });
});
