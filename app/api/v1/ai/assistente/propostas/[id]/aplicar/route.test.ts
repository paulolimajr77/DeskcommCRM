/**
 * POST /api/v1/ai/assistente/propostas/[id]/aplicar — T20, o coração.
 *
 * O que este arquivo prova:
 *  - O ESPINHA do guardrail 2 (spec §6.2): aplicar proposta `pendente` → 409
 *    e `chamarRotaPorDentro` NUNCA é chamado — nenhuma escrita nasce de
 *    proposta que não esteja `aprovada`.
 *  - A trava consultiva: ocupada → 409 sem tocar o destino; liberada no
 *    `finally` MESMO quando o destino lança.
 *  - O destino vem EXATAMENTE do mapa (rota com o id trocado, método do
 *    mapa), uma vez; o payload adulterado no banco é revalidado (422).
 *  - `definir_ponto` preserva o `credential_id` que o binding já tinha (e
 *    omite quando não havia) — o PUT sem `credential_id` o apagaria.
 *  - Falha do destino → continua `aprovada`, 422/502 e audit próprio.
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
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: vi.fn() }));
vi.mock("@/lib/assistente/metricas/chamar-rota", () => ({ chamarRotaPorDentro: vi.fn() }));

const { POST } = await import("@/app/api/v1/ai/assistente/propostas/[id]/aplicar/route");
const { getRequestPool } = await import("@/lib/agent-engine/db/request-pool");

const ORG_ID = "11111111-2222-4333-8444-555555555551";
const USER_ID = "11111111-2222-4333-8444-555555555552";
const PROPOSTA_ID = "11111111-2222-4333-8444-555555555555";
const ARTEFATO_ID = "11111111-2222-4333-8444-555555555557";
const PIPELINE_ID = "11111111-2222-4333-8444-555555555558";
const STAGE_ID = "11111111-2222-4333-8444-555555555559";
const PONTO = "assistente_chat";
const CRED_ID = "11111111-2222-4333-8444-555555555560";
const TEXTO_DA_MEMORIA = "SEGREDO-NO-TEXTO-DA-MEMORIA";

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
  payload: Record<string, unknown>;
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
  apply_result: unknown;
  expires_at: string;
  created_at: string;
}

const PAYLOAD_MEMORIA = { operacao: "criar", corpo: { title: "Horário", body: TEXTO_DA_MEMORIA } };

function linha(over: Partial<LinhaDeTeste> = {}): LinhaDeTeste {
  return {
    id: PROPOSTA_ID,
    kind: "memoria",
    payload: PAYLOAD_MEMORIA,
    risk: "seguro",
    status: "aprovada",
    resumo: "Guardar o horário",
    motivo: "A pessoa pediu.",
    antes: null,
    requested_by: USER_ID,
    decided_by: USER_ID,
    decided_at: "2026-10-16T09:30:00Z",
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
  /** A trava consultiva responde ocupada? (default: livre) */
  travado: boolean;
  /** A linha lida com a organização da sessão (null = não existe/outra org). */
  linhaAtual: LinhaDeTeste | null;
  /** O que o CAS de `aplicada` devolve (null = zero linhas). */
  casAplicada: LinhaDeTeste | null;
  /** Lança na gravação do `aplicada` (a dívida descrita na rota). */
  erroNaGravacao: Error | null;
  consultas: Consulta[];
  unlocks: Consulta[];
  releases: number;
}

function poolFalso(estado: Estado) {
  async function executar(sql: string, params: unknown[]) {
    const s = sql.toLowerCase();
    if (s.includes("pg_try_advisory_lock")) {
      estado.consultas.push({ sql, params });
      return { rows: [{ travado: estado.travado }] };
    }
    if (s.includes("pg_advisory_unlock")) {
      estado.unlocks.push({ sql, params });
      return { rows: [] };
    }
    if (s.includes("set status = 'expirada'")) {
      estado.consultas.push({ sql, params });
      return { rows: [] };
    }
    if (s.includes("set status = 'aplicada'")) {
      estado.consultas.push({ sql, params });
      if (estado.erroNaGravacao) throw estado.erroNaGravacao;
      return { rows: estado.casAplicada ? [estado.casAplicada] : [] };
    }
    if (s.trim().startsWith("select") && s.includes("from public.config_proposals")) {
      estado.consultas.push({ sql, params });
      return { rows: estado.linhaAtual ? [estado.linhaAtual] : [] };
    }
    throw new Error(`SQL não esperado pelo dublê: ${sql.slice(0, 80)}`);
  }
  const cliente = {
    query: vi.fn(executar),
    release: vi.fn(() => {
      estado.releases += 1;
    }),
  };
  return { connect: vi.fn(async () => cliente), cliente };
}

let estado: Estado;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(audit).mockResolvedValue(undefined);
  estado = {
    travado: true,
    linhaAtual: null,
    casAplicada: null,
    erroNaGravacao: null,
    consultas: [],
    unlocks: [],
    releases: 0,
  };
  const pool = poolFalso(estado);
  vi.mocked(getRequestPool).mockImplementation(() => pool as never);
  vi.mocked(chamarRotaPorDentro).mockResolvedValue({ status: 200, corpo: { data: { id: ARTEFATO_ID } } });
  sessao("admin");
});

function requisicao(id: string): NextRequest {
  return new NextRequest(`http://interno.invalid/api/v1/ai/assistente/propostas/${id}/aplicar`, {
    method: "POST",
  });
}

function post(id: string) {
  return POST(requisicao(id), { params: Promise.resolve({ id }) });
}

describe("quem pode aplicar", () => {
  it.each(["manager", "agent", "viewer"] as const)("%s recebe 403 e o pool não é tocado", async (papel) => {
    sessao(papel);

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(403);
    expect(getRequestPool).not.toHaveBeenCalled();
    expect(chamarRotaPorDentro).not.toHaveBeenCalled();
  });

  it("requireSupportWrite roda ANTES de qualquer efeito", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("support_readonly", "somente leitura", 403, {}) as never);

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
    expect(getRequestPool).not.toHaveBeenCalled();
  });

  it("id que não é uuid é 422, sem tocar o pool", async () => {
    expect((await post("nao-e-uuid")).status).toBe(422);
    expect(getRequestPool).not.toHaveBeenCalled();
  });
});

describe("o guardrail 2 — ESPINHA (nenhuma escrita a partir de proposta que não está aprovada)", () => {
  it("aplicar `pendente` → 409 e chamarRotaPorDentro NUNCA é chamado", async () => {
    // Sabotagem (a) da ordem: no aplicar, aceitar `status in ('pendente','aprovada')`
    // (ou tirar o guard) → este caso fica vermelho, com o destino chamado.
    estado.linhaAtual = linha({ status: "pendente" });

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(409);
    const json = (await resposta.json()) as { error: { code: string; details?: { status?: string } } };
    expect(json.error.code).toBe("proposta_em_estado_invalido");
    expect(json.error.details?.status).toBe("pendente");
    expect(chamarRotaPorDentro).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(estado.consultas.some((c) => c.sql.includes("set status = 'aplicada'"))).toBe(false);
  });

  it.each(["rejeitada", "expirada", "aplicada"] as const)("estado %s → 409 com o status e o destino nunca é chamado", async (statusAtual) => {
    estado.linhaAtual = linha({ status: statusAtual });

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(409);
    const json = (await resposta.json()) as { error: { code: string; details?: { status?: string } } };
    expect(json.error.code).toBe("proposta_em_estado_invalido");
    expect(json.error.details?.status).toBe(statusAtual);
    expect(chamarRotaPorDentro).not.toHaveBeenCalled();
  });

  it("aprovada VENCIDA → marca `expirada`, 409 e o destino nunca é chamado", async () => {
    estado.linhaAtual = linha({ expires_at: "2020-01-01T00:00:00Z" });

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(409);
    const json = (await resposta.json()) as { error: { code: string } };
    expect(json.error.code).toBe("proposta_expirada");
    const expirada = estado.consultas.find((c) => c.sql.includes("set status = 'expirada'"));
    expect(expirada, "a proposta vencida deve ser marcada `expirada`").toBeTruthy();
    expect(expirada!.params).toEqual([PROPOSTA_ID, ORG_ID]);
    expect(chamarRotaPorDentro).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("proposta de outra organização → 404, sem destino e sem gravação", async () => {
    estado.linhaAtual = null;

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(404);
    const leitura = estado.consultas.find((c) => c.sql.includes("from public.config_proposals"));
    expect(leitura!.params![1]).toBe(ORG_ID);
    expect(chamarRotaPorDentro).not.toHaveBeenCalled();
    expect(estado.consultas.some((c) => c.sql.includes("set status = 'aplicada'"))).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });

  it("payload adulterado no banco (com chave `rota`) → 422 e nada é chamado", async () => {
    // Sabotagem: pular a revalidação do payload (usar a linha crua) → o destino seria
    // chamado com o dado adulterado e este caso fica vermelho.
    estado.linhaAtual = linha({ payload: { ...PAYLOAD_MEMORIA, rota: "/api/v1/ai/routers" } });

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(422);
    expect(chamarRotaPorDentro).not.toHaveBeenCalled();
    expect(estado.consultas.some((c) => c.sql.includes("set status = 'aplicada'"))).toBe(false);
  });
});

describe("a trava consultiva", () => {
  it("é a primeira coisa, por proposta; ocupada → 409 sem chamar o destino, e o cliente volta ao pool", async () => {
    estado.travado = false;

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(409);
    const json = (await resposta.json()) as { error: { code: string } };
    expect(json.error.code).toBe("proposta_em_aplicacao");
    expect(estado.consultas[0]!.sql).toContain("pg_try_advisory_lock");
    expect(estado.consultas[0]!.params).toEqual([PROPOSTA_ID]);
    expect(chamarRotaPorDentro).not.toHaveBeenCalled();
    // Sem trava, não há unlock — mas o cliente volta ao pool.
    expect(estado.unlocks).toEqual([]);
    expect(estado.releases).toBe(1);
  });

  it("a trava é liberada MESMO quando o destino lança, e o cliente volta ao pool", async () => {
    // Sabotagem (d) da ordem: tirar o `pg_advisory_unlock` do `finally` → este caso
    // fica vermelho (unlocks vazio).
    estado.linhaAtual = linha();
    vi.mocked(chamarRotaPorDentro).mockResolvedValue({ falhou: "a chamada interna à rota falhou" });

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(502);
    const json = (await resposta.json()) as { error: { code: string } };
    expect(json.error.code).toBe("proposta_falhou_ao_aplicar");
    expect(estado.unlocks).toHaveLength(1);
    expect(estado.unlocks[0]!.sql).toContain("pg_advisory_unlock");
    expect(estado.unlocks[0]!.params).toEqual([PROPOSTA_ID]);
    expect(estado.releases).toBe(1);
  });
});

describe("o destino e a gravação", () => {
  it("chama EXATAMENTE o destino do mapa — rota com o id trocado e método do mapa — uma vez", async () => {
    // Sabotagem (b) da ordem: trocar o destino por um campo do payload (ex.: ler
    // `payload.rota`) → o caminho/método divergem e este caso fica vermelho.
    estado.linhaAtual = linha({
      kind: "funil",
      payload: { operacao: "alterar_etapa", pipeline_id: PIPELINE_ID, stage_id: STAGE_ID, corpo: { name: "Nova etapa" } },
      risk: "atencao",
    });
    estado.casAplicada = linha({ status: "aplicada", applied_by: USER_ID, applied_at: "2026-10-16T10:00:00Z" });

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(200);
    expect(chamarRotaPorDentro).toHaveBeenCalledTimes(1);
    const chamada = vi.mocked(chamarRotaPorDentro).mock.calls[0]!;
    const [handler, caminho, query, opcoes] = chamada;
    expect(typeof handler).toBe("function");
    expect(caminho).toBe(`/api/v1/pipelines/${PIPELINE_ID}/stages/${STAGE_ID}`);
    expect(query).toEqual({});
    expect(opcoes).toEqual({ metodo: "PATCH", corpo: { name: "Nova etapa" } });
    expect(estado.consultas.some((c) => c.sql.includes("set status = 'aplicada'"))).toBe(true);
  });

  it("o CAS de `aplicada` leva o estado esperado na própria condição, a org da sessão e o recibo", async () => {
    estado.linhaAtual = linha();
    estado.casAplicada = linha({
      status: "aplicada",
      applied_by: USER_ID,
      applied_at: "2026-10-16T10:00:00Z",
      apply_result: {
        destino: "Cria uma entrada manual na memória da empresa.",
        http_status: 200,
        artefato: { tipo: "memoria", id: ARTEFATO_ID },
      },
    });

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(200);
    const cas = estado.consultas.find((c) => c.sql.includes("set status = 'aplicada'"))!;
    expect(cas.sql).toContain("and status = 'aprovada'");
    expect(cas.params![0]).toBe(PROPOSTA_ID);
    expect(cas.params![1]).toBe(ORG_ID);
    expect(cas.params![2]).toBe(USER_ID);
    expect(JSON.parse(String(cas.params![3]))).toEqual({
      destino: "Cria uma entrada manual na memória da empresa.",
      http_status: 200,
      artefato: { tipo: "memoria", id: ARTEFATO_ID },
    });
    const json = (await resposta.json()) as { data: { status: string; apply_result: unknown } };
    expect(json.data.status).toBe("aplicada");
    expect(json.data.apply_result).toEqual({
      destino: "Cria uma entrada manual na memória da empresa.",
      http_status: 200,
      artefato: { tipo: "memoria", id: ARTEFATO_ID },
    });
  });

  it("audita `assistente.proposta_aplicada` com kind, operacao, risk e http_status — sem o texto", async () => {
    // Sabotagem: acrescentar o corpo da resposta (ou o payload) ao metadata → vermelho.
    estado.linhaAtual = linha();
    estado.casAplicada = linha({ status: "aplicada", applied_by: USER_ID, applied_at: "2026-10-16T10:00:00Z" });

    await post(PROPOSTA_ID);

    expect(audit).toHaveBeenCalledTimes(1);
    const entrada = vi.mocked(audit).mock.calls[0]![0];
    expect(entrada).toMatchObject({
      action: "assistente.proposta_aplicada",
      actorUserId: USER_ID,
      organizationId: ORG_ID,
      resourceType: "config_proposals",
      resourceId: PROPOSTA_ID,
    });
    expect(entrada.metadata).toEqual({ kind: "memoria", operacao: "criar", risk: "seguro", http_status: 200 });
    expect(JSON.stringify(entrada)).not.toContain(TEXTO_DA_MEMORIA);
  });
});

describe("as falhas do destino — a proposta FICA aprovada", () => {
  it.each([
    { nome: "4xx", destino: { status: 422, corpo: { error: { code: "validation_failed", message: "x" } } }, esperado: 422, http: 422, codigo: "validation_failed" },
    { nome: "5xx", destino: { status: 502, corpo: { error: { code: "upstream_error", message: "x" } } }, esperado: 502, http: 502, codigo: "upstream_error" },
  ] as const)("$nome do destino → $esperado, continua `aprovada` e audita a falha", async ({ destino, esperado, http, codigo }) => {
    estado.linhaAtual = linha();
    vi.mocked(chamarRotaPorDentro).mockResolvedValue(destino);

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(esperado);
    const json = (await resposta.json()) as { error: { code: string; details?: { http_status?: number; codigo_do_destino?: string | null } } };
    expect(json.error.code).toBe("proposta_falhou_ao_aplicar");
    expect(json.error.details?.http_status).toBe(http);
    expect(json.error.details?.codigo_do_destino).toBe(codigo);
    // NÃO grava `aplicada`: a proposta continua aprovada para tentar de novo.
    expect(estado.consultas.some((c) => c.sql.includes("set status = 'aplicada'"))).toBe(false);
    const entrada = vi.mocked(audit).mock.calls[0]![0];
    expect(entrada.action).toBe("assistente.proposta_falhou_ao_aplicar");
    expect(entrada.metadata).toEqual({ kind: "memoria", operacao: "criar", risk: "seguro", http_status: http, codigo_do_destino: codigo });
  });

  it("a gravação do `aplicada` falhando depois do destino 2xx é a dívida descrita: 500 e audit da falha", async () => {
    estado.linhaAtual = linha();
    estado.casAplicada = null;
    estado.erroNaGravacao = new Error("conexão morreu na gravação");

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(500);
    const entrada = vi.mocked(audit).mock.calls[0]![0];
    expect(entrada.action).toBe("assistente.proposta_falhou_ao_aplicar");
    expect(entrada.metadata).toMatchObject({ http_status: 200 });
    expect(JSON.stringify(await resposta.json())).not.toContain("conexão morreu");
  });
});

describe("a credencial de `definir_ponto` é preservada", () => {
  function linhaDePonto(): Partial<LinhaDeTeste> {
    return {
      kind: "modelo_auxiliares",
      risk: "atencao",
      payload: { operacao: "definir_ponto", corpo: { purpose: PONTO, provider: "anthropic", model_id: "claude-x" } },
    };
  }

  function respostaProviders(origem: string, credentialId: unknown) {
    return {
      status: 200,
      corpo: {
        data: { pontos: [{ id: PONTO, efetivo: { origem, credentialId } }] },
      },
    };
  }

  it("binding com credencial: o PUT leva o `credential_id` QUE JÁ ESTAVA LÁ", async () => {
    // Sabotagem (c) da ordem: remover a preservação (mandar o corpo do payload cru) →
    // o PUT iria sem `credential_id` e APAGARIA a credencial — este caso fica vermelho.
    estado.linhaAtual = linha(linhaDePonto());
    estado.casAplicada = linha({ ...linhaDePonto(), status: "aplicada", applied_by: USER_ID, applied_at: "2026-10-16T10:00:00Z" });
    vi.mocked(chamarRotaPorDentro).mockImplementation(async (handler, caminho, query, opcoes) => {
      if (caminho === "/api/v1/ai/providers" && (opcoes?.metodo ?? "GET") === "GET") {
        return respostaProviders("binding", CRED_ID);
      }
      return { status: 200, corpo: { data: { binding: { id: ARTEFATO_ID } } } };
    });

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(200);
    const chamadas = vi.mocked(chamarRotaPorDentro).mock.calls;
    expect(chamadas).toHaveLength(2);
    const [leitura, escrita] = chamadas;
    expect(leitura![1]).toBe("/api/v1/ai/providers");
    expect(leitura![3]?.metodo ?? "GET").toBe("GET");
    expect(escrita![3]?.metodo).toBe("PUT");
    expect(escrita![3]?.corpo).toEqual({
      purpose: PONTO,
      provider: "anthropic",
      model_id: "claude-x",
      credential_id: CRED_ID,
    });
  });

  it("binding SEM credencial (origem de outro lugar): o PUT OMITE `credential_id`", async () => {
    estado.linhaAtual = linha(linhaDePonto());
    estado.casAplicada = linha({ ...linhaDePonto(), status: "aplicada", applied_by: USER_ID, applied_at: "2026-10-16T10:00:00Z" });
    vi.mocked(chamarRotaPorDentro).mockImplementation(async (handler, caminho, query, opcoes) => {
      if (caminho === "/api/v1/ai/providers" && (opcoes?.metodo ?? "GET") === "GET") {
        return respostaProviders("padrao_da_organizacao", "cRED-DE-OUTRA-ORIGEM");
      }
      return { status: 200, corpo: { data: { binding: { id: ARTEFATO_ID } } } };
    });

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(200);
    const escrita = vi.mocked(chamarRotaPorDentro).mock.calls[1]!;
    const corpo = escrita[3]?.corpo as Record<string, unknown>;
    expect(corpo).not.toHaveProperty("credential_id");
    expect(corpo).toEqual({ purpose: PONTO, provider: "anthropic", model_id: "claude-x" });
  });

  it("GET de providers falhando: o PUT segue sem `credential_id` (nada é apagado que existia além do caminho prescrito)", async () => {
    estado.linhaAtual = linha(linhaDePonto());
    estado.casAplicada = linha({ ...linhaDePonto(), status: "aplicada", applied_by: USER_ID, applied_at: "2026-10-16T10:00:00Z" });
    vi.mocked(chamarRotaPorDentro).mockImplementation(async (handler, caminho, query, opcoes) => {
      if (caminho === "/api/v1/ai/providers" && (opcoes?.metodo ?? "GET") === "GET") {
        return { falhou: "a chamada interna à rota falhou" };
      }
      return { status: 200, corpo: { data: { binding: { id: ARTEFATO_ID } } } };
    });

    const resposta = await post(PROPOSTA_ID);

    expect(resposta.status).toBe(200);
    const escrita = vi.mocked(chamarRotaPorDentro).mock.calls[1]!;
    expect((escrita[3]?.corpo as Record<string, unknown>)).not.toHaveProperty("credential_id");
  });
});
