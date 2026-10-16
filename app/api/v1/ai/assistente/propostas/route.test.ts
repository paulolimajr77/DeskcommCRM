/**
 * POST /api/v1/ai/assistente/propostas — grava UMA proposta `pendente` (T19).
 *
 * O que este arquivo prova: só `admin` propõe (manager/agent/viewer → 403, sem
 * tocar o banco); `requireSupportWrite` roda ANTES do insert; o insert usa o
 * cliente da SESSÃO e nunca o de serviço; `organization_id` e `risk` não vêm
 * do corpo; o destino não mora no dado; o reenvio do mesmo turno devolve a
 * proposta que já existe (23505) sem novo audit; o audit leva só kind,
 * operacao e risk — nunca o texto.
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
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { POST } = await import("@/app/api/v1/ai/assistente/propostas/route");
const { createClient } = await import("@/lib/supabase/server");
const { createAdminClient } = await import("@/lib/supabase/admin");

const ORG_ID = "11111111-2222-4333-8444-555555555551";
const OUTRA_ORG = "99999999-2222-4333-8444-555555555559";
const USER_ID = "11111111-2222-4333-8444-555555555552";
const THREAD_ID = "11111111-2222-4333-8444-555555555553";
const TURN_ID = "11111111-2222-4333-8444-555555555554";
const PROPOSTA_ID = "11111111-2222-4333-8444-555555555555";
const ROTEADOR = "11111111-2222-4333-8444-555555555556";

const SEGREDO_DO_TEXTO = "SEGREDO-NO-TEXTO-DA-PROPOSTA";

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

interface Estado {
  /** Conversas que existem, com a organização dona. */
  threads: Array<{ id: string; organization_id: string }>;
  /** Linhas já gravadas em config_proposals. */
  propostas: Array<Record<string, unknown>>;
  /** Erro a devolver no insert. */
  erroNoInsert: { code: string; message: string } | null;
  filtros: Array<[string, unknown]>;
  insercoes: Array<Record<string, unknown>>;
  tabelasLidas: string[];
}

function clienteFalso(estado: Estado) {
  function consulta(tabela: string) {
    const meus: Array<[string, unknown]> = [];
    const q = {
      eq(coluna: string, valor: unknown) {
        meus.push([coluna, valor]);
        estado.filtros.push([coluna, valor]);
        return q;
      },
      async maybeSingle() {
        const base = tabela === "config_threads" ? estado.threads : estado.propostas;
        const achadas = base.filter((l) => meus.every(([k, v]) => l[k] === v));
        return { data: achadas[0] ?? null, error: null };
      },
    };
    return q;
  }
  return {
    from(tabela: string) {
      estado.tabelasLidas.push(tabela);
      return {
        select: () => consulta(tabela),
        insert(linha: Record<string, unknown>) {
          estado.insercoes.push(linha);
          return {
            select: () => ({
              async single() {
                if (estado.erroNoInsert) return { data: null, error: estado.erroNoInsert };
                const gravada = {
                  id: PROPOSTA_ID,
                  ...linha,
                  expires_at: "2026-10-23T09:00:00Z",
                };
                estado.propostas.push(gravada);
                return { data: gravada, error: null };
              },
            }),
          };
        },
      };
    },
  };
}

let estado: Estado;

const PAYLOAD_OK = {
  operacao: "criar",
  corpo: { title: "Horário", body: SEGREDO_DO_TEXTO },
};

function corpo(extra: Record<string, unknown> = {}) {
  return {
    kind: "memoria",
    resumo: "Guardar o horário de atendimento",
    motivo: "A pessoa pediu para a IA lembrar do horário.",
    antes: null,
    payload: PAYLOAD_OK,
    ...extra,
  };
}

function requisicao(c: unknown): NextRequest {
  return new NextRequest("http://interno.invalid/api/v1/ai/assistente/propostas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof c === "string" ? c : JSON.stringify(c),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(audit).mockResolvedValue(undefined);
  estado = {
    threads: [
      { id: THREAD_ID, organization_id: ORG_ID },
    ],
    propostas: [],
    erroNoInsert: null,
    filtros: [],
    insercoes: [],
    tabelasLidas: [],
  };
  vi.mocked(createClient).mockImplementation(async () => clienteFalso(estado) as never);
  vi.mocked(createAdminClient).mockImplementation(() => {
    throw new Error("o cliente de serviço não pode ser usado para propor");
  });
  sessao("admin");
});

describe("quem pode propor", () => {
  it.each(["manager", "agent", "viewer"] as const)("%s recebe 403 e o banco não é tocado", async (papel) => {
    sessao(papel);

    const resposta = await POST(requisicao(corpo()));

    expect(resposta.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
    expect(estado.insercoes).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("a exigência é `admin`, lida da sessão", async () => {
    await POST(requisicao(corpo()));

    expect(vi.mocked(requireRole).mock.calls[0]![0]).toBe("admin");
  });

  it("o acompanhamento de suporte em leitura (requireSupportWrite) barra antes de qualquer efeito", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("support_readonly", "somente leitura", 403, {}) as never);

    const resposta = await POST(requisicao(corpo()));

    expect(resposta.status).toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(estado.insercoes).toEqual([]);
  });

  it("requireSupportWrite roda ANTES do insert", async () => {
    // Sabotagem: mover `requireSupportWrite()` para depois do insert (ou apagá-lo) → este expect
    // e o gate `suporte-cobertura-de-efeitos` ficam vermelhos.
    await POST(requisicao(corpo()));

    const guarda = vi.mocked(requireSupportWrite).mock.invocationCallOrder[0]!;
    const papel = vi.mocked(requireRole).mock.invocationCallOrder[0]!;
    const cliente = vi.mocked(createClient).mock.invocationCallOrder[0]!;
    expect(guarda).toBeLessThan(papel);
    expect(guarda).toBeLessThan(cliente);
    expect(estado.insercoes).toHaveLength(1);
  });
});

describe("o insert", () => {
  it("usa o cliente da SESSÃO e nunca o de serviço", async () => {
    // Sabotagem: trocar `createClient()` por `createAdminClient()` na rota → `createClient` deixa
    // de ser chamado e o cliente de serviço lança: este caso fica vermelho.
    const resposta = await POST(requisicao(corpo()));

    expect(resposta.status).toBe(201);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(estado.insercoes).toHaveLength(1);
  });

  it("grava organização e autor DA SESSÃO, estado pendente e o risco decidido pelo código", async () => {
    await POST(requisicao(corpo()));

    expect(estado.insercoes[0]).toEqual({
      organization_id: ORG_ID,
      thread_id: null,
      turn_id: null,
      kind: "memoria",
      risk: "seguro",
      resumo: "Guardar o horário de atendimento",
      motivo: "A pessoa pediu para a IA lembrar do horário.",
      antes: null,
      payload: PAYLOAD_OK,
      status: "pendente",
      requested_by: USER_ID,
    });
  });

  it("o risco vem do tipo: funil e roteador são `atencao`", async () => {
    await POST(
      requisicao(
        corpo({ kind: "funil", payload: { operacao: "criar_funil", corpo: { name: "Pós-venda" } } }),
      ),
    );
    await POST(
      requisicao(
        corpo({
          kind: "roteador",
          payload: { operacao: "alterar", router_id: ROTEADOR, corpo: { name: "Novo" } },
        }),
      ),
    );

    expect(estado.insercoes.map((i) => i.risk)).toEqual(["atencao", "atencao"]);
  });

  it("organization_id do corpo é recusado (422) e nada é gravado — a organização é da sessão", async () => {
    const resposta = await POST(requisicao(corpo({ organization_id: OUTRA_ORG })));

    expect(resposta.status).toBe(422);
    expect(estado.insercoes).toEqual([]);
  });

  it("risk, status e requested_by no corpo são recusados (422)", async () => {
    for (const extra of [{ risk: "seguro" }, { status: "aprovada" }, { requested_by: OUTRA_ORG }]) {
      const resposta = await POST(requisicao(corpo(extra)));
      expect(resposta.status, JSON.stringify(extra)).toBe(422);
    }
    expect(estado.insercoes).toEqual([]);
  });

  it("chave de destino dentro do payload é recusada (422) com o caminho dela, e nada é gravado", async () => {
    const resposta = await POST(
      requisicao(corpo({ payload: { ...PAYLOAD_OK, corpo: { ...PAYLOAD_OK.corpo, metodo: "DELETE" } } })),
    );

    expect(resposta.status).toBe(422);
    const json = (await resposta.json()) as { error: { details: Array<{ path: string }> } };
    expect(json.error.details[0]!.path).toBe("payload.corpo.metodo");
    expect(estado.insercoes).toEqual([]);
  });

  it("corpo que não é JSON é 400; payload inválido é 422 — sem gravar", async () => {
    expect((await POST(requisicao("isto não é json"))).status).toBe(400);
    expect((await POST(requisicao(corpo({ kind: "critico" })))).status).toBe(422);
    expect((await POST(requisicao(corpo({ payload: { operacao: "apagar", corpo: {} } })))).status).toBe(422);
    expect(estado.insercoes).toEqual([]);
  });
});

describe("a conversa", () => {
  it("thread_id de outra organização é 404 e nada é gravado", async () => {
    estado.threads = [{ id: THREAD_ID, organization_id: OUTRA_ORG }];

    const resposta = await POST(requisicao(corpo({ thread_id: THREAD_ID, turn_id: TURN_ID })));

    expect(resposta.status).toBe(404);
    expect(estado.insercoes).toEqual([]);
    // A conferência filtra pela organização DA SESSÃO.
    expect(estado.filtros).toContainEqual(["organization_id", ORG_ID]);
  });

  it("thread_id e turn_id da própria organização são gravados", async () => {
    const resposta = await POST(requisicao(corpo({ thread_id: THREAD_ID, turn_id: TURN_ID })));

    expect(resposta.status).toBe(201);
    expect(estado.insercoes[0]).toMatchObject({ thread_id: THREAD_ID, turn_id: TURN_ID });
  });
});

describe("idempotência do turno", () => {
  it("23505 devolve a proposta que já existe (200), sem segundo audit", async () => {
    // Sabotagem: apagar o ramo `error?.code === "23505"` → a resposta vira 500 e este caso fica vermelho.
    await POST(requisicao(corpo({ thread_id: THREAD_ID, turn_id: TURN_ID })));
    expect(audit).toHaveBeenCalledTimes(1);
    estado.erroNoInsert = { code: "23505", message: "duplicate key value violates unique constraint" };
    estado.filtros = [];

    const segunda = await POST(requisicao(corpo({ thread_id: THREAD_ID, turn_id: TURN_ID })));

    expect(segunda.status).toBe(200);
    const json = (await segunda.json()) as { data: { id: string; kind: string; status: string } };
    expect(json.data).toMatchObject({ id: PROPOSTA_ID, kind: "memoria", status: "pendente" });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(estado.propostas).toHaveLength(1);
  });

  it("a busca da existente filtra organização (da sessão), turno e tipo", async () => {
    await POST(requisicao(corpo({ turn_id: TURN_ID })));
    estado.erroNoInsert = { code: "23505", message: "duplicate" };
    estado.filtros = [];

    await POST(requisicao(corpo({ turn_id: TURN_ID })));

    expect(estado.filtros).toEqual(
      expect.arrayContaining([
        ["organization_id", ORG_ID],
        ["turn_id", TURN_ID],
        ["kind", "memoria"],
      ]),
    );
  });

  it("outro erro do banco é 500 e não audita", async () => {
    estado.erroNoInsert = { code: "42501", message: "new row violates row-level security policy" };

    const resposta = await POST(requisicao(corpo()));

    expect(resposta.status).toBe(500);
    expect(audit).not.toHaveBeenCalled();
    // A mensagem do banco nunca sobe ao chamador.
    expect(JSON.stringify(await resposta.json())).not.toContain("row-level security");
  });
});

describe("a resposta e a auditoria", () => {
  it("201 com o formato combinado e SEM o payload", async () => {
    const resposta = await POST(requisicao(corpo()));

    expect(resposta.status).toBe(201);
    const json = (await resposta.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual({
      id: PROPOSTA_ID,
      kind: "memoria",
      operacao: "criar",
      risk: "seguro",
      status: "pendente",
      resumo: "Guardar o horário de atendimento",
      expires_at: "2026-10-23T09:00:00Z",
    });
    expect(JSON.stringify(json)).not.toContain(SEGREDO_DO_TEXTO);
    expect(resposta.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("audita `assistente.proposta_criada` só com kind, operacao e risk — sem o texto", async () => {
    // Sabotagem: acrescentar `payload` (ou `resumo`/`motivo`) ao metadata do audit → o
    // `toEqual` e o `not.toContain` ficam vermelhos.
    await POST(requisicao(corpo()));

    expect(audit).toHaveBeenCalledTimes(1);
    const entrada = vi.mocked(audit).mock.calls[0]![0];
    expect(entrada).toMatchObject({
      action: "assistente.proposta_criada",
      actorUserId: USER_ID,
      organizationId: ORG_ID,
      resourceType: "config_proposals",
      resourceId: PROPOSTA_ID,
    });
    expect(entrada.metadata).toEqual({ kind: "memoria", operacao: "criar", risk: "seguro" });
    const tudo = JSON.stringify(entrada);
    expect(tudo).not.toContain(SEGREDO_DO_TEXTO);
    expect(tudo).not.toContain("Guardar o horário de atendimento");
    expect(tudo).not.toContain("A pessoa pediu");
  });
});
