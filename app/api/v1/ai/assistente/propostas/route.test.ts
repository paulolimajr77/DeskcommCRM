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
// Porta de escrita para as propostas `acao` usadas nos testes de idempotência.
vi.mock("@/lib/assistente/portas/regras", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/assistente/portas/regras")>();
  return {
    ...actual,
    escritaPermitida: vi.fn((id: string, metodo: string) =>
      id === "contacts/:id" && metodo === "PATCH" ? true : id === "ai/agents" && metodo === "POST",
    ),
  };
});

const { POST } = await import("@/app/api/v1/ai/assistente/propostas/route");
const { createClient } = await import("@/lib/supabase/server");
const { createAdminClient } = await import("@/lib/supabase/admin");
import { escritaPermitida } from "@/lib/assistente/portas/regras";

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
  vi.mocked(escritaPermitida).mockImplementation(() => true);
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

  it("duas acao DIFERENTES no mesmo turno são aceitas em inserts separados (a unicidade é do índice 9006, provada no CI)", async () => {
    const acao1 = {
      kind: "acao",
      resumo: "Renomear o contato principal",
      motivo: "O cliente trocou de razão social.",
      antes: null,
      payload: { porta: "contacts/:id", metodo: "PATCH", valores: { id: ROTEADOR }, corpo: { name: "Novo" } },
      turn_id: TURN_ID,
    };
    const acao2 = {
      kind: "acao",
      resumo: "Criar o agente de suporte",
      motivo: "Falta um agente dedicado ao suporte.",
      antes: null,
      payload: { porta: "ai/agents", metodo: "POST", corpo: { name: "Suporte" } },
      turn_id: TURN_ID,
    };

    const r1 = await POST(requisicao(acao1));
    const r2 = await POST(requisicao(acao2));

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(estado.insercoes).toHaveLength(2);
  });

  it("a MESMA acao repetida no mesmo turno devolve a já existente (23505), sem segundo audit", async () => {
    const acao = {
      kind: "acao",
      resumo: "Renomear o contato principal",
      motivo: "O cliente trocou de razão social.",
      antes: null,
      payload: { porta: "contacts/:id", metodo: "PATCH", valores: { id: ROTEADOR }, corpo: { name: "Novo" } },
      turn_id: TURN_ID,
    };
    await POST(requisicao(acao));
    expect(audit).toHaveBeenCalledTimes(1);
    estado.erroNoInsert = { code: "23505", message: "duplicate key value violates unique constraint" };
    estado.filtros = [];

    const segunda = await POST(requisicao(acao));

    expect(segunda.status).toBe(200);
    const json = (await segunda.json()) as { data: { id: string; kind: string; status: string } };
    expect(json.data).toMatchObject({ id: PROPOSTA_ID, kind: "acao", status: "pendente" });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(estado.propostas).toHaveLength(1);
  });

  it("acao com porta fora da lista branca é recusada com 422 (superRefine confere escritaPermitida)", async () => {
    vi.mocked(escritaPermitida).mockReturnValue(false);

    const acaoPortaProibida = {
      kind: "acao",
      resumo: "Tentar porta proibida",
      motivo: "Não deve passar.",
      antes: null,
      payload: { porta: "cron/routing-worker", metodo: "POST", corpo: {} },
      turn_id: TURN_ID,
    };

    const resposta = await POST(requisicao(acaoPortaProibida));

    expect(resposta.status).toBe(422);
    const json = (await resposta.json()) as { error: { code: string; message: string; details?: Array<{ message: string }> } };
    expect(json.error.code).toBe("validation_failed");
    expect(json.error.details?.[0]?.message).toContain("não libera esse método de escrita");
  });

  it("tipo NÃO-acao com url aninhada no payload continua recusado (sem regressão)", async () => {
    const memoriaComUrl = {
      kind: "memoria",
      resumo: "Guardar link",
      motivo: "Não deve passar url.",
      antes: null,
      payload: { operacao: "criar", corpo: { title: "x", body: "y", url: "https://exemplo.com" } },
      turn_id: TURN_ID,
    };

    const resposta = await POST(requisicao(memoriaComUrl));

    expect(resposta.status).toBe(422);
    const json = (await resposta.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("validation_failed");
    expect(json.error.message).toBe("O conteúdo da proposta não pode escolher o destino.");
  });

  it("roteador com metodo no payload continua recusado (acao não contagia outros tipos)", async () => {
    const roteadorComMetodo = {
      kind: "roteador",
      resumo: "Criar roteador",
      motivo: "Não deve passar metodo no payload.",
      antes: null,
      payload: { operacao: "criar", corpo: { name: "x", channel_session_id: ROTEADOR, metodo: "DELETE" } },
      turn_id: TURN_ID,
    };

    const resposta = await POST(requisicao(roteadorComMetodo));

    expect(resposta.status).toBe(422);
    const json = (await resposta.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("validation_failed");
    expect(json.error.message).toBe("O conteúdo da proposta não pode escolher o destino.");
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

// ─── GET (T20): a fila da organização ────────────────────────────────────────

const COLUNAS_ESPERADAS =
  "id, kind, payload, risk, status, resumo, motivo, antes, requested_by, decided_by, decided_at, decision_reason, applied_by, applied_at, apply_result, expires_at, created_at";

interface LinhaDeTeste {
  id: string;
  kind: string;
  payload: unknown;
  risk: string;
  status: string;
  resumo: string;
  motivo: string;
  antes: unknown;
  requested_by: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  applied_by: string | null;
  applied_at: string | null;
  apply_result: unknown;
  expires_at: string;
  created_at: string;
}

interface EstadoGet {
  propostas: LinhaDeTeste[];
  filtros: Array<[string, unknown]>;
  ordens: string[];
  limites: number[];
  escritas: string[];
  erroNoSelect: { message: string } | null;
}

function linhaDeTeste(over: Partial<LinhaDeTeste>): LinhaDeTeste {
  return {
    id: PROPOSTA_ID,
    kind: "memoria",
    payload: { operacao: "criar", corpo: { title: "t", body: SEGREDO_DO_TEXTO } },
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

/**
 * O dublê do cliente de sessão para o GET: builder encadeável como o do
 * supabase-js, que REGISTRA toda escrita chamada. Se a rota tentar
 * `update`/`insert`/`delete`, o registro guarda — e o teste do "GET nunca
 * escreve" fica vermelho.
 */
function clienteGetFalso(estadoGet: EstadoGet) {
  function consulta() {
    const q = {
      select(colunas: string) {
        estadoGet.ordens.push(`select:${colunas}`);
        return q;
      },
      eq(coluna: string, valor: unknown) {
        estadoGet.filtros.push([coluna, valor]);
        return q;
      },
      lt(coluna: string, valor: unknown) {
        estadoGet.filtros.push([`lt:${coluna}`, valor]);
        return q;
      },
      order(coluna: string, opts?: { ascending?: boolean }) {
        estadoGet.ordens.push(`${coluna}:${opts?.ascending === false ? "desc" : "asc"}`);
        return q;
      },
      limit(n: number) {
        estadoGet.limites.push(n);
        return q;
      },
      update() {
        estadoGet.escritas.push("update");
        return q;
      },
      insert() {
        estadoGet.escritas.push("insert");
        return q;
      },
      delete() {
        estadoGet.escritas.push("delete");
        return q;
      },
      then(
        resolve: (v: { data: LinhaDeTeste[] | null; error: { message: string } | null }) => unknown,
        reject: (e: unknown) => unknown,
      ) {
        const base = Promise.resolve(
          estadoGet.erroNoSelect
            ? { data: null, error: estadoGet.erroNoSelect }
            : { data: estadoGet.propostas, error: null },
        );
        return base.then(resolve, reject);
      },
    };
    return q;
  }
  return {
    from(tabela: string) {
      estadoGet.ordens.push(`from:${tabela}`);
      return consulta();
    },
  };
}

let estadoGet: EstadoGet;

function requisicaoGet(query = ""): NextRequest {
  return new NextRequest(`http://interno.invalid/api/v1/ai/assistente/propostas${query}`, {
    method: "GET",
  });
}

const { GET } = await import("@/app/api/v1/ai/assistente/propostas/route");

describe("GET /propostas (T20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSupportWrite).mockResolvedValue(null);
    vi.mocked(audit).mockResolvedValue(undefined);
    estadoGet = {
      propostas: [],
      filtros: [],
      ordens: [],
      limites: [],
      escritas: [],
      erroNoSelect: null,
    };
    vi.mocked(createClient).mockImplementation(async () => clienteGetFalso(estadoGet) as never);
    sessao("admin");
  });

  it.each(["manager", "agent", "viewer"] as const)("%s recebe 403 e nada é lido", async (papel) => {
    sessao(papel);

    const resposta = await GET(requisicaoGet());

    expect(resposta.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("leitura NÃO passa por requireSupportWrite (guarda de efeito): suporte somente-leitura LÊ a fila", async () => {
    // C2 do julgamento: a guarda é de EFEITO e o GET só lê. Sabotagem: devolver a chamada
    // no GET → `requireSupportWrite` volta a ser chamado e este caso fica vermelho.
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("support_readonly", "somente leitura", 403, {}) as never);
    estadoGet.propostas = [linhaDeTeste({})];

    const resposta = await GET(requisicaoGet());

    // A fila LÊ apesar do acompanhamento em modo somente-leitura.
    expect(resposta.status).toBe(200);
    expect(requireRole).toHaveBeenCalledTimes(1);
    expect(estadoGet.ordens.some((o) => o.startsWith("from:config_proposals"))).toBe(true);
  });

  it("lê pelo cliente da SESSÃO, filtra a organização, ordena created_at desc e NUNCA escreve", async () => {
    // Sabotagem: trocar o select por update (ou acrescentar escrita) → `escritas` deixa
    // de estar vazio e este caso fica vermelho.
    estadoGet.propostas = [linhaDeTeste({})];

    const resposta = await GET(requisicaoGet());

    expect(resposta.status).toBe(200);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(estadoGet.escritas).toEqual([]);
    expect(estadoGet.filtros).toContainEqual(["organization_id", ORG_ID]);
    expect(estadoGet.ordens).toEqual(
      expect.arrayContaining(["from:config_proposals", `select:${COLUNAS_ESPERADAS}`, "created_at:desc", "id:desc"]),
    );
    expect(audit).not.toHaveBeenCalled();
  });

  it("devolve o item completo, com `operacao` extraída e `vencida` CALCULADA", async () => {
    estadoGet.propostas = [
      linhaDeTeste({ id: "22222222-2222-4333-8444-555555555521", status: "pendente", expires_at: "2020-01-01T00:00:00Z" }),
      linhaDeTeste({ id: "22222222-2222-4333-8444-555555555522", status: "pendente", expires_at: "2099-01-01T00:00:00Z" }),
      linhaDeTeste({
        id: "22222222-2222-4333-8444-555555555523",
        status: "aplicada",
        expires_at: "2020-01-01T00:00:00Z",
        applied_by: USER_ID,
        applied_at: "2026-10-16T10:00:00Z",
        apply_result: { destino: "x", http_status: 200 },
      }),
    ];

    const resposta = await GET(requisicaoGet());

    expect(resposta.status).toBe(200);
    const json = (await resposta.json()) as { data: Array<{ id: string; vencida: boolean; operacao: string | null }> };
    const vencidaPorId = new Map(json.data.map((p) => [p.id, p.vencida]));
    // vencida = (pendente|aprovada) and expires_at < now() — aplicada vencida NÃO é vencida.
    expect(vencidaPorId.get("22222222-2222-4333-8444-555555555521")).toBe(true);
    expect(vencidaPorId.get("22222222-2222-4333-8444-555555555522")).toBe(false);
    expect(vencidaPorId.get("22222222-2222-4333-8444-555555555523")).toBe(false);
    expect(json.data[0]!.operacao).toBe("criar");
    // O payload vai inteiro para a tela da T21 (só admin lê, pela RLS).
    expect(JSON.stringify(json)).toContain(SEGREDO_DO_TEXTO);
  });

  it("filtro ?status= e a paginação limit/cursor chegam ao banco", async () => {
    await GET(requisicaoGet("?status=aprovada&limit=10&cursor=2026-10-15T09%3A00%3A00Z"));

    expect(estadoGet.filtros).toEqual(
      expect.arrayContaining([
        ["organization_id", ORG_ID],
        ["status", "aprovada"],
        ["lt:created_at", "2026-10-15T09:00:00Z"],
      ]),
    );
    expect(estadoGet.limites).toEqual([11]);
  });

  it("paginação: uma linha a mais vira has_more com o cursor do último item", async () => {
    estadoGet.propostas = [
      linhaDeTeste({ id: "22222222-2222-4333-8444-555555555531", created_at: "2026-10-16T09:00:00Z" }),
      linhaDeTeste({ id: "22222222-2222-4333-8444-555555555532", created_at: "2026-10-15T09:00:00Z" }),
      linhaDeTeste({ id: "22222222-2222-4333-8444-555555555533", created_at: "2026-10-14T09:00:00Z" }),
    ];

    const resposta = await GET(requisicaoGet("?limit=2"));

    expect(resposta.status).toBe(200);
    const json = (await resposta.json()) as {
      data: Array<{ id: string }>;
      meta: { cursor: string | null; has_more: boolean };
    };
    expect(json.data).toHaveLength(2);
    expect(json.meta.has_more).toBe(true);
    expect(json.meta.cursor).toBe("2026-10-15T09:00:00Z");
  });

  it("paginação na última página: cursor null e has_more false", async () => {
    estadoGet.propostas = [linhaDeTeste({ created_at: "2026-10-16T09:00:00Z" })];

    const resposta = await GET(requisicaoGet("?limit=20"));

    const json = (await resposta.json()) as { meta: { cursor: string | null; has_more: boolean } };
    expect(json.meta.has_more).toBe(false);
    expect(json.meta.cursor).toBeNull();
  });

  it("query inválida (limit > 50, status estranho) é 422 e nada é lido", async () => {
    expect((await GET(requisicaoGet("?limit=51"))).status).toBe(422);
    expect((await GET(requisicaoGet("?status=zumbi"))).status).toBe(422);
    expect((await GET(requisicaoGet("?invasor=1"))).status).toBe(422);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("erro do select é 500 sem vazar a mensagem do banco", async () => {
    estadoGet.erroNoSelect = { message: "row-level security" };

    const resposta = await GET(requisicaoGet());

    expect(resposta.status).toBe(500);
    expect(JSON.stringify(await resposta.json())).not.toContain("row-level security");
  });
});
