/**
 * POST/GET /api/v1/ai/assistente/auditoria — F3.
 *
 * POST (admin, requireSupportWrite antes): roda as leituras internas com a
 * sessão da pessoa, grava 1 retrato em `config_snapshots`, devolve
 * `{ snapshot, anterior }` e audita SÓ `pendencias` + `contagem_por_estado`.
 * Rate limit: 1 rodada por org a cada 60 s.
 * GET (qualquer membro): últimos N retratos da org da sessão.
 *
 * Prova: só `admin` roda POST (outros papéis → 403, banco não tocado);
 * `requireSupportWrite` roda ANTES de qualquer efeito no POST; o POST filtra
 * `organization_id` da SESSÃO; o GET filtra a organização da sessão e nunca
 * escreve; o audit leva só `pendencias` e `contagem_por_estado`; o rate
 * limit devolve 409 na repetição dentro da janela.
 */
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { audit } from "@/lib/audit";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { chamarRotaPorDentro } from "@/lib/assistente/metricas/chamar-rota";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/assistente/metricas/chamar-rota", () => ({
  chamarRotaPorDentro: vi.fn(),
}));

const { POST } = await import("@/app/api/v1/ai/assistente/auditoria/route");
const { GET } = await import("@/app/api/v1/ai/assistente/auditoria/route");
const { createClient } = await import("@/lib/supabase/server");

const ORG_ID = "11111111-2222-4333-8444-555555555551";
const USER_ID = "11111111-2222-4333-8444-555555555552";

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
  retratos: Array<Record<string, unknown>>;
  ultimoExistente: boolean;
  ultimoInserido: Record<string, unknown>;
  erroNoInsert: { code: string; message: string } | null;
  /** Cada `.eq(coluna, valor)` que a rota encadeou, na ordem. */
  filtros: Array<[string, unknown]>;
}

function clienteFalso(estado: Estado) {
  // O dublê é um Array (estados.retratos copiados) com métodos encadeáveis.
  // `await arr` resolve com o próprio array, então o GET recebe os retratos.
  class RetratosArray extends Array<Record<string, unknown>> {
    select() { return this; }
    insert(linha: Record<string, unknown>) { estado.ultimoInserido = linha; return this; }
    eq(coluna: string, valor: unknown) { estado.filtros.push([coluna, valor]); return this; }
    order() { return this; }
    limit() { return this; }
    async maybeSingle() {
      // rate limit (POST): select("taken_at").eq(...).order(...).limit(1).maybeSingle()
      if (estado.retratos.length > 0) {
        const maisNovo = estado.retratos[0]!;
        return { data: { id: "retrato-existente", taken_at: maisNovo.taken_at ?? "2026-10-16T09:00:00Z", pendencias: 3, resultado: { contagem_por_estado: { preenchido: 5 } } }, error: null };
      }
      return { data: null, error: null };
    }
    async single() {
      if (estado.erroNoInsert) return { data: null, error: estado.erroNoInsert };
      const gravado = {
        id: "retrato-novo", organization_id: ORG_ID, taken_at: "2026-10-16T09:00:01Z",
        resultado: { itens: [], contagem_por_estado: {} }, pendencias: 0, ...estado.ultimoInserido,
      };
      estado.retratos.push(gravado);
      return { data: gravado, error: null };
    }
  }
  return {
    from() {
      const arr = new RetratosArray();
      for (const item of estado.retratos) arr.push(item);
      return arr;
    },
    insert(linha: Record<string, unknown>) {
      estado.ultimoInserido = linha;
      const arr = new RetratosArray();
      for (const item of estado.retratos) arr.push(item);
      return arr;
    },
    update() {
      const arr = new RetratosArray();
      for (const item of estado.retratos) arr.push(item);
      return arr;
    },
    delete() {
      const arr = new RetratosArray();
      for (const item of estado.retratos) arr.push(item);
      return arr;
    },
  };
}

let estado: Estado;

function requisicaoPost(corpo: unknown = undefined): NextRequest {
  return new NextRequest("http://interno.invalid/api/v1/ai/assistente/auditoria", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

function requisicaoGet(query = ""): NextRequest {
  return new NextRequest(`http://interno.invalid/api/v1/ai/assistente/auditoria${query}`, { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(audit).mockResolvedValue(undefined);
  vi.mocked(chamarRotaPorDentro).mockImplementation(async () => ({ status: 200, corpo: { data: [] } }));
  estado = {
    retratos: [],
    ultimoExistente: false,
    ultimoInserido: {},
    erroNoInsert: null,
    filtros: [],
  };
  vi.mocked(createClient).mockImplementation(async () => clienteFalso(estado) as never);
  sessao("admin");
});

describe("quem pode rodar a auditoria (POST)", () => {
  it.each(["manager", "agent", "viewer"] as const)("%s recebe 403 e nada é gravado", async (papel) => {
    sessao(papel);
    const resposta = await POST(requisicaoPost());
    expect(resposta.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
    expect(estado.retratos).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("a exigência é `admin`, lida da sessão", async () => {
    await POST(requisicaoPost());
    expect(vi.mocked(requireRole).mock.calls[0]![0]).toBe("admin");
  });

  it("requireSupportWrite roda ANTES de qualquer efeito (sessão, não service role)", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("support_readonly", "somente leitura", 403, {}) as never);
    const resposta = await POST(requisicaoPost());
    expect(resposta.status).toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(estado.retratos).toEqual([]);
  });

  it("usa o cliente da sessão (não o de serviço) e filtra a organização da sessão", async () => {
    const resposta = await POST(requisicaoPost());
    expect(resposta.status).toBe(201);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(estado.retratos).toHaveLength(1);
    expect(estado.retratos[0]!.organization_id).toBe(ORG_ID);
  });

  it("audita `assistente.auditoria_rodada` só com pendencias e contagem_por_estado — sem texto livre", async () => {
    await POST(requisicaoPost());
    expect(audit).toHaveBeenCalledTimes(1);
    const entrada = vi.mocked(audit).mock.calls[0]![0];
    expect(entrada.action).toBe("assistente.auditoria_rodada");
    expect(entrada.organizationId).toBe(ORG_ID);
    expect(entrada.resourceType).toBe("config_snapshots");
    expect(entrada.metadata).toMatchObject({
      pendencias: expect.any(Number),
      contagem_por_estado: expect.any(Object),
    });
    // Lista POSITIVA de chaves: qualquer campo a mais (texto de item, nome de canal…) reprova.
    expect(Object.keys(entrada.metadata ?? {}).sort()).toEqual(["contagem_por_estado", "pendencias"]);
    const contagem = (entrada.metadata as { contagem_por_estado: Record<string, number> }).contagem_por_estado;
    for (const [estadoDoItem, n] of Object.entries(contagem)) {
      expect(["preenchido", "posso_completar", "preciso_confirmar", "nao_se_aplica"]).toContain(estadoDoItem);
      expect(typeof n).toBe("number");
    }
    const tudo = JSON.stringify(entrada);
    expect(tudo).not.toContain("WhatsApp");
    expect(tudo).not.toContain("Credencial");
  });

  it("filtra por organization_id da SESSÃO nas leituras do POST (rate limit e retrato anterior)", async () => {
    await POST(requisicaoPost());
    const daOrg = estado.filtros.filter(([c]) => c === "organization_id");
    expect(daOrg.length).toBeGreaterThanOrEqual(2);
    expect(daOrg.every(([, v]) => v === ORG_ID)).toBe(true);
  });

  it("repetir dentro de 60 s → 409 legível e NADA é gravado nem auditado", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-16T09:00:30Z"));
      estado.retratos = [{ id: "r0", taken_at: "2026-10-16T09:00:00Z", pendencias: 3, resultado: { itens: [] } }];
      const resposta = await POST(requisicaoPost());
      expect(resposta.status).toBe(409);
      const corpo = (await resposta.json()) as { error: { message: string } };
      expect(corpo.error.message).toMatch(/máximo 1 por minuto/);
      expect(estado.retratos).toHaveLength(1);
      expect(audit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("passada a janela de 60 s, a nova rodada é aceita (201) e devolve o anterior", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-16T09:02:00Z"));
      estado.retratos = [{ id: "r0", taken_at: "2026-10-16T09:00:00Z", pendencias: 3, resultado: { itens: [] } }];
      const resposta = await POST(requisicaoPost());
      expect(resposta.status).toBe(201);
      const corpo = (await resposta.json()) as { data: { snapshot: { id: string }; anterior: { pendencias: number } | null } };
      expect(corpo.data.snapshot.id).toBe("retrato-novo");
      expect(corpo.data.anterior?.pendencias).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── GET (T20): retratos da organização ───

describe("GET /auditoria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSupportWrite).mockResolvedValue(null);
    vi.mocked(audit).mockResolvedValue(undefined);
    vi.mocked(chamarRotaPorDentro).mockImplementation(async () => ({ status: 200, corpo: { data: [] } }));
    estado = {
      retratos: [],
      ultimoExistente: false,
      ultimoInserido: {},
      erroNoInsert: null,
      filtros: [],
    };
    vi.mocked(createClient).mockImplementation(async () => clienteFalso(estado) as never);
    sessao("viewer");
  });

  it.each(["manager", "agent", "viewer"] as const)("%s lê a fila (200)", async (papel) => {
    sessao(papel);
    estado.retratos = [{ id: "x", taken_at: "2026-10-16T09:00:00Z", pendencias: 2, resultado: { itens: [] } }];
    const resposta = await GET(requisicaoGet());
    expect(resposta.status).toBe(200);
  });

  it("o suporte somente-leitura NÃO é chamado no GET (guarda só de efeito)", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("support_readonly", "somente leitura", 403, {}) as never);
    estado.retratos = [{ id: "x", taken_at: "2026-10-16T09:00:00Z", pendencias: 0, resultado: { itens: [] } }];
    const resposta = await GET(requisicaoGet());
    expect(resposta.status).toBe(200);
    expect(requireSupportWrite).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("filtra SÓ pela organização da sessão e nunca escreve", async () => {
    estado.retratos = [{ id: "a", taken_at: "2026-10-16T09:00:00Z", pendencias: 2, resultado: { itens: [] } }];
    await GET(requisicaoGet());
    expect(estado.filtros).toEqual([["organization_id", ORG_ID]]);
    expect(estado.ultimoInserido).toEqual({});
  });

  it("limit fora da faixa → 422 sem tocar o banco", async () => {
    const resposta = await GET(requisicaoGet("?limit=500"));
    expect(resposta.status).toBe(422);
    expect(estado.filtros).toEqual([]);
  });

  it("devolve os retratos da organização (200)", async () => {
    estado.retratos = [
      { id: "a", taken_at: "2026-10-16T09:00:00Z", pendencias: 2, resultado: { itens: [] } },
      { id: "b", taken_at: "2026-10-15T09:00:00Z", pendencias: 0, resultado: { itens: [] } },
    ];
    const resposta = await GET(requisicaoGet());
    expect(resposta.status).toBe(200);
    expect(audit).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A LEITURA NO FORMATO REAL DAS ROTAS INTERNAS (defeito medido em 18/10/2026)
//
// O defeito: `extrairDados()` só aceitava `data` sendo ARRAY, mas duas rotas
// devolvem `data` como ENVELOPE — `/api/v1/ai/providers` devolve
// `{ data: { credenciais: [...] } }` e `/api/v1/ai/routers` devolve
// `{ data: { routers: [...] } }`. Com a chave da OpenAI validada e cadastrada a
// auditoria dizia "sem chave"; com o roteador ativo, dizia "sem roteador".
//
// Os dublês abaixo têm a forma EXATA de cada resposta (colunas reais do
// SELECT de cada rota), para que o teste reprove se a leitura voltar a ser
// feita no formato errado.
// ─────────────────────────────────────────────────────────────────────────────

interface ItemDoRetrato {
  id: string;
  estado: string;
  por_que: string;
}

/**
 * Dublês com o formato REAL das oito rotas que a auditoria lê:
 *
 *  - ai/providers        → `{ data: { credenciais: [...], instalacaoTemChave } }`  (route.ts:297)
 *  - channel-sessions    → `data` array, com `phone_number`                       (route.ts:66)
 *  - pipelines           → `data` array                                           (route.ts:43)
 *  - pipelines/[id]/stages → `data` array                                         (route.ts:88)
 *  - ai/agents           → `data` array, com `versao_publicada` (sem credential_id) (route.ts:142)
 *  - ai/routers          → `{ data: { routers: [...] } }`                         (route.ts:84)
 *  - ai/knowledge/sources→ `data` array, com `source_type`                        (route.ts:102)
 *  - ai/followup-flows   → `data` array, com `status`                             (route.ts:56)
 */
function rotasComFormatoReal(opcoes?: { instalacaoTemChave?: boolean; provedorDoAgente?: string }) {
  const provedorDoAgente = opcoes?.provedorDoAgente ?? "openai";
  const instalacaoTemChave = opcoes?.instalacaoTemChave ?? false;
  vi.mocked(chamarRotaPorDentro).mockImplementation(async (_handler, caminho) => {
    if (caminho === "/api/v1/ai/providers") {
      return {
        status: 200,
        corpo: {
          data: {
            papeis: [],
            pontos: [],
            padrao: null,
            provedores: ["openai", "anthropic"],
            modelos: [],
            podeEditar: true,
            credenciais: [
              {
                id: "c1",
                provider: "openai",
                label: "Chave OpenAI",
                api_key_last4: "4242",
                validated_at: "2026-10-01T00:00:00Z",
                is_active: true,
              },
            ],
            instalacaoTemChave,
          },
        },
      };
    }
    if (caminho === "/api/v1/ai/routers") {
      return {
        status: 200,
        corpo: {
          data: {
            routers: [
              {
                id: "rt1",
                name: "Roteador PLJR",
                channel_session_id: "s1",
                is_active: true,
                fallback_agent_id: null,
                updated_at: "2026-10-16T09:00:00Z",
              },
            ],
          },
        },
      };
    }
    if (caminho === "/api/v1/channel-sessions") {
      return {
        status: 200,
        corpo: {
          data: [
            {
              id: "s1",
              provider: "waha",
              waha_session_name: "sessao",
              display_name: "Atendimento",
              phone_number: "+5511999999999",
              status: "WORKING",
              status_reason: null,
              last_health_check_at: null,
              last_status_change_at: null,
              daily_message_limit: null,
              is_warmup_complete: true,
              created_at: "2026-10-01T09:00:00Z",
              metadata: { disabled: false },
            },
          ],
        },
      };
    }
    if (caminho === "/api/v1/ai/agents") {
      return {
        status: 200,
        corpo: {
          data: [
            {
              id: "a1",
              organization_id: ORG_ID,
              name: "Agente de vendas",
              description: null,
              model: "gpt-5",
              system_prompt: "Atenda bem.",
              is_active: true,
              is_default: true,
              kind: "atendimento",
              priority: 0,
              published_version_id: "v1",
              paused_at: null,
              operation_mode: "automatic",
              operation_revision: 1,
              archived_at: null,
              config: {},
              guardrails: {},
              active_kb_version_id: null,
              created_at: "2026-10-01T09:00:00Z",
              updated_at: "2026-10-01T09:00:00Z",
              // O join REAL da listagem: sem `credential_id`.
              versao_publicada: { provider: provedorDoAgente, model: "gpt-5" },
            },
          ],
        },
      };
    }
    if (caminho === "/api/v1/pipelines") {
      return { status: 200, corpo: { data: [{ id: "p1", name: "Vendas" }] } };
    }
    if (caminho === "/api/v1/pipelines/p1/stages") {
      return { status: 200, corpo: { data: [{ id: "e1", name: "Prospecção" }] } };
    }
    if (caminho === "/api/v1/ai/knowledge/sources") {
      return {
        status: 200,
        corpo: { data: [{ id: "k1", name: "FAQ", source_type: "faq", status: "ready" }] },
      };
    }
    if (caminho === "/api/v1/ai/followup-flows") {
      return {
        status: 200,
        corpo: { data: [{ id: "fl1", name: "Boas-vindas", status: "ativo" }] },
      };
    }
    return { status: 200, corpo: { data: [] } };
  });
}

async function itensDaRodada(): Promise<ItemDoRetrato[]> {
  const resposta = await POST(requisicaoPost());
  expect(resposta.status).toBe(201);
  const corpo = (await resposta.json()) as { data: { snapshot: { itens: ItemDoRetrato[] } } };
  return corpo.data.snapshot.itens;
}

function estadoDe(itens: ItemDoRetrato[], id: string): string {
  return itens.find((i) => i.id === id)?.estado ?? "ausente";
}

describe("auditoria lê o formato REAL das rotas internas", () => {
  it("acha a chave validada em `data.credenciais` (não em `data`) — 'tem chave validada'", async () => {
    rotasComFormatoReal();
    const itens = await itensDaRodada();
    expect(estadoDe(itens, "credencial_ia")).toBe("preenchido");
  });

  it("acha o roteador em `data.routers` (não em `data`) — 'tem roteador'", async () => {
    rotasComFormatoReal();
    const itens = await itensDaRodada();
    expect(estadoDe(itens, "canal_whatsapp")).toBe("preenchido");
    expect(estadoDe(itens, "agente_publicado")).toBe("preenchido");
    expect(estadoDe(itens, "roteador")).toBe("preenchido");
  });

  it("lê `versao_publicada` do agente (não `versao`) para achar a chave do provedor", async () => {
    // O agente é do provedor openai e só há chave validada openai: com o campo
    // certo, o agente é `preenchido`. Lendo `versao`, ficaria `preciso_confirmar`.
    rotasComFormatoReal({ provedorDoAgente: "openai" });
    const itens = await itensDaRodada();
    expect(estadoDe(itens, "agente_publicado")).toBe("preenchido");
  });

  it("agente publicado sem chave utilizável → preciso_confirmar com o motivo", async () => {
    rotasComFormatoReal({ provedorDoAgente: "anthropic" });
    const itens = await itensDaRodada();
    expect(estadoDe(itens, "agente_publicado")).toBe("preciso_confirmar");
    expect(itens.find((i) => i.id === "agente_publicado")?.por_que).toContain("anthropic");
  });

  it("com a chave da INSTALAÇÃO, o agente publicado é pronto mesmo sem credencial", async () => {
    rotasComFormatoReal({ instalacaoTemChave: true, provedorDoAgente: "anthropic" });
    const itens = await itensDaRodada();
    expect(estadoDe(itens, "credencial_ia")).toBe("preenchido");
    expect(estadoDe(itens, "agente_publicado")).toBe("preenchido");
  });

  it("lê `phone_number` do canal (o campo `numero` não existe)", async () => {
    vi.mocked(chamarRotaPorDentro).mockImplementation(async (_handler, caminho) => {
      if (caminho === "/api/v1/channel-sessions") {
        return { status: 200, corpo: { data: [{ id: "s1", status: "WORKING", phone_number: "+5511888888888" }] } };
      }
      return { status: 200, corpo: { data: [] } };
    });
    const resposta = await POST(requisicaoPost());
    expect(resposta.status).toBe(201);
    // Sem canal reconhecido, `canal_whatsapp` fica pendente: é o sinal de que a
    // leitura olhou `status`/`phone_number` do objeto real.
    const corpo = (await resposta.json()) as { data: { snapshot: { itens: ItemDoRetrato[] } } };
    expect(estadoDe(corpo.data.snapshot.itens, "canal_whatsapp")).toBe("preenchido");
  });
});
