/**
 * POST /api/v1/ai/assistente/propostas/[id]/aprovar — T20.
 *
 * O que este arquivo prova: só `admin` decide (manager/agent/viewer → 403, sem
 * tocar o pool); `requireSupportWrite` roda ANTES de qualquer efeito; o
 * compare-and-swap leva o estado esperado na própria condição e a organização
 * DA SESSÃO; zero linhas explica o porquê (404 / marca `expirada` + 409 /
 * 409 com o status atual); o audit leva só kind, operacao e risk.
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

const { POST } = await import("@/app/api/v1/ai/assistente/propostas/[id]/aprovar/route");
const { getRequestPool } = await import("@/lib/agent-engine/db/request-pool");

const ORG_ID = "11111111-2222-4333-8444-555555555551";
const USER_ID = "11111111-2222-4333-8444-555555555552";
const PROPOSTA_ID = "11111111-2222-4333-8444-555555555555";
const TEXTO_DA_PROPOSTA = "SEGREDO-NO-TEXTO-DA-PROPOSTA";

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
    kind: "memoria",
    payload: { operacao: "criar", corpo: { title: "Horário", body: TEXTO_DA_PROPOSTA } },
    risk: "seguro",
    status: "pendente",
    resumo: "Guardar o horário",
    motivo: "A pessoa pediu.",
    antes: null,
    requested_by: USER_ID,
    decided_by: null,
    decided_at: null,
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
  /** O que o compare-and-swap devolve (null = zero linhas). */
  cas: LinhaDeTeste | Record<string, unknown> | null;
  /** O que o select do "por quê" devolve (null = proposta não existe/outra org). */
  linhaAtual: Record<string, unknown> | null;
  consultas: Consulta[];
  erro: Error | null;
}

function poolFalso(estado: Estado) {
  async function executar(sql: string, params: unknown[]) {
    if (estado.erro) throw estado.erro;
    estado.consultas.push({ sql, params });
    const s = sql.toLowerCase();
    if (s.includes("set status = 'aprovada'")) {
      return { rows: estado.cas ? [estado.cas] : [] };
    }
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
  vi.mocked(getRequestPool).mockImplementation(
    () => poolFalso(estado) as never,
  );
  sessao("admin");
});

function requisicao(id: string): NextRequest {
  return new NextRequest(`http://interno.invalid/api/v1/ai/assistente/propostas/${id}/aprovar`, {
    method: "POST",
  });
}

describe("quem pode aprovar", () => {
  it.each(["manager", "agent", "viewer"] as const)("%s recebe 403 e o pool não é tocado", async (papel) => {
    sessao(papel);

    const resposta = await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(403);
    expect(getRequestPool).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("a exigência é `admin`, lida da sessão", async () => {
    estado.cas = linha({ status: "aprovada", decided_by: USER_ID, decided_at: "2026-10-16T10:00:00Z" });

    await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(vi.mocked(requireRole).mock.calls[0]![0]).toBe("admin");
  });

  it("requireSupportWrite roda ANTES de qualquer efeito", async () => {
    // Sabotagem: mover `requireSupportWrite()` para depois do CAS (ou apagá-lo) → a ordem
    // das chamadas e o gate `suporte-cobertura-de-efeitos` ficam vermelhos.
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("support_readonly", "somente leitura", 403, {}) as never);

    const resposta = await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
    expect(getRequestPool).not.toHaveBeenCalled();
  });

  it("id que não é uuid é 422, sem tocar o pool", async () => {
    const resposta = await POST(requisicao("nao-e-uuid"), { params: Promise.resolve({ id: "nao-e-uuid" }) });

    expect(resposta.status).toBe(422);
    expect(getRequestPool).not.toHaveBeenCalled();
  });
});

describe("o compare-and-swap", () => {
  it("só aprova `pendente` dentro do prazo, na organização da SESSÃO", async () => {
    estado.cas = linha({ status: "aprovada", decided_by: USER_ID, decided_at: "2026-10-16T10:00:00Z" });

    const resposta = await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(200);
    const consulta = estado.consultas[0]!;
    expect(consulta.sql).toContain("status = 'pendente' and expires_at > now()");
    expect(consulta.params).toEqual([PROPOSTA_ID, ORG_ID, USER_ID]);
  });

  it("200 com a proposta aprovada e `vencida` recalculada (o payload vai, pois quem lê é admin)", async () => {
    estado.cas = linha({ status: "aprovada", decided_by: USER_ID, decided_at: "2026-10-16T10:00:00Z" });

    const resposta = await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(200);
    const json = (await resposta.json()) as { data: { status: string; vencida: boolean; decided_by: string | null } };
    expect(json.data.status).toBe("aprovada");
    expect(json.data.vencida).toBe(false);
    expect(json.data.decided_by).toBe(USER_ID);
    // A decisão devolve a proposta INTEIRA para a tela da T21 (só admin lê, pela RLS);
    // quem NUNCA leva o texto é o audit — provado no caso abaixo.
    expect(JSON.stringify(json)).toContain(TEXTO_DA_PROPOSTA);
  });

  it("audita `assistente.proposta_aprovada` só com kind, operacao e risk", async () => {
    // Sabotagem: acrescentar `payload` (ou o texto) ao metadata → o `toEqual` fica vermelho.
    estado.cas = linha({ status: "aprovada", decided_by: USER_ID, decided_at: "2026-10-16T10:00:00Z" });

    await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(audit).toHaveBeenCalledTimes(1);
    const entrada = vi.mocked(audit).mock.calls[0]![0];
    expect(entrada).toMatchObject({
      action: "assistente.proposta_aprovada",
      actorUserId: USER_ID,
      organizationId: ORG_ID,
      resourceType: "config_proposals",
      resourceId: PROPOSTA_ID,
    });
    expect(entrada.metadata).toEqual({ kind: "memoria", operacao: "criar", risk: "seguro" });
    expect(JSON.stringify(entrada)).not.toContain(TEXTO_DA_PROPOSTA);
  });

  it("zero linhas por organização de outra empresa → 404, lê para explicar e NENHUMA outra escrita", async () => {
    estado.cas = null;
    estado.linhaAtual = null;

    const resposta = await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(404);
    // Só o CAS e a leitura do "por quê" — nenhuma escrita de expirada, nenhum audit.
    expect(estado.consultas).toHaveLength(2);
    expect(estado.consultas[0]!.params![1]).toBe(ORG_ID);
    expect(estado.consultas.slice(1).some((c) => c.sql.toLowerCase().includes("set status"))).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });

  it("vencida → marca `expirada` e 409 `proposta_expirada`, sem audit da ação", async () => {
    // Sabotagem: tirar o ramo de expiração (ou a condição `expires_at`) → este caso e o
    // teste de SQL ficam vermelhos.
    estado.cas = null;
    estado.linhaAtual = { status: "pendente", expires_at: "2020-01-01T00:00:00Z" };

    const resposta = await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(409);
    const json = (await resposta.json()) as { error: { code: string } };
    expect(json.error.code).toBe("proposta_expirada");
    const expirada = estado.consultas.find((c) => c.sql.includes("set status = 'expirada'"));
    expect(expirada, "a proposta vencida deve ser marcada `expirada`").toBeTruthy();
    expect(expirada!.params).toEqual([PROPOSTA_ID, ORG_ID]);
    expect(audit).not.toHaveBeenCalled();
  });

  it.each(["aprovada", "aplicada", "rejeitada", "expirada"] as const)(
    "estado %s → 409 `proposta_em_estado_invalido` com o status atual, sem marcar expirada",
    async (statusAtual) => {
      estado.cas = null;
      estado.linhaAtual = { status: statusAtual, expires_at: "2099-10-23T09:00:00Z" };

      const resposta = await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

      expect(resposta.status).toBe(409);
      const json = (await resposta.json()) as { error: { code: string; details?: { status?: string } } };
      expect(json.error.code).toBe("proposta_em_estado_invalido");
      expect(json.error.details?.status).toBe(statusAtual);
      expect(estado.consultas.some((c) => c.sql.includes("set status = 'expirada'"))).toBe(false);
      expect(audit).not.toHaveBeenCalled();
    },
  );

  it("erro do pool é 500 sem vazar a mensagem do banco", async () => {
    estado.erro = new Error("connection refused do banco");

    const resposta = await POST(requisicao(PROPOSTA_ID), { params: Promise.resolve({ id: PROPOSTA_ID }) });

    expect(resposta.status).toBe(500);
    expect(JSON.stringify(await resposta.json())).not.toContain("connection refused");
  });
});
