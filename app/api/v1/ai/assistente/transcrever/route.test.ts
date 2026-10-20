/**
 * POST /api/v1/ai/assistente/transcrever — o áudio do campo do chat vira texto.
 *
 * O que este arquivo prova: sem sessão → 401 e nada é chamado; tipo que não é
 * áudio → 422; grande demais → 413; áudio vazio → 422; a guarda de suporte roda
 * antes de qualquer efeito; qualquer papel transcreve (viewer inclusive); a
 * organização vem SEMPRE da sessão (um `organization_id` no corpo é ignorado);
 * o sucesso devolve `{ data: { texto } }`; "sem quem transcreva" vira a frase
 * sobre a chave da OpenAI; a auditoria leva tamanho e tipo, nunca o texto.
 */
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { audit } from "@/lib/audit";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { TAMANHO_MAXIMO_DO_AUDIO } from "@/lib/assistente/transcricao/limites";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: vi.fn(() => ({})) }));
vi.mock("@/lib/agent-engine/agent/request-deps", () => ({
  requestTurnDeps: vi.fn(() => ({ llmCfg: {} })),
}));
vi.mock("@/lib/assistente/transcricao/transcrever", () => ({
  transcreverAudioDoChat: vi.fn(),
}));

const { POST } = await import("@/app/api/v1/ai/assistente/transcrever/route");
const { transcreverAudioDoChat } = await import("@/lib/assistente/transcricao/transcrever");

const ORG_ID = "11111111-2222-4333-8444-555555555551";
const OUTRA_ORG = "99999999-2222-4333-8444-555555555559";
const USER_ID = "11111111-2222-4333-8444-555555555552";
const TEXTO = "TEXTO-FALADO-PELA-PESSOA";

function sessao(papel: Role | null) {
  vi.mocked(requireRole).mockImplementation(async (min: Role) => {
    if (papel === null) {
      return { ok: false, response: fail("unauthenticated", "Sem sessão.", 401, {}) };
    }
    const user: AuthUser = {
      id: USER_ID,
      email: "u@example.com",
      full_name: null,
      avatar_url: null,
      is_platform_admin: false,
      idioma: "pt-BR",
      organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: papel }],
    };
    if (ROLE_RANK[papel] >= ROLE_RANK[min]) {
      return { ok: true, user, org: { orgId: ORG_ID, name: "Org", role: papel } };
    }
    return { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) };
  });
}

function pedido(
  opcoes: { tipo?: string; bytes?: number; extras?: Record<string, string>; semArquivo?: boolean } = {},
) {
  const corpo = new FormData();
  if (opcoes.semArquivo !== true) {
    const conteudo = new Uint8Array(opcoes.bytes ?? 2048).fill(7);
    corpo.append("audio", new File([conteudo], "audio.webm", { type: opcoes.tipo ?? "audio/webm" }));
  }
  for (const [k, v] of Object.entries(opcoes.extras ?? {})) corpo.append(k, v);
  return new NextRequest("http://localhost/api/v1/ai/assistente/transcrever", {
    method: "POST",
    body: corpo,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
  vi.mocked(transcreverAudioDoChat).mockResolvedValue({ ok: true, texto: TEXTO });
  sessao("viewer");
});

describe("POST /api/v1/ai/assistente/transcrever", () => {
  it("sem sessão devolve 401 e nada é transcrito", async () => {
    sessao(null);
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(401);
    expect(transcreverAudioDoChat).not.toHaveBeenCalled();
  });

  it("a guarda de suporte barra antes de qualquer efeito", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValue(
      fail("support_readonly", "somente leitura", 403, {}) as never,
    );
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(403);
    expect(transcreverAudioDoChat).not.toHaveBeenCalled();
  });

  it("tipo que não é áudio devolve 422", async () => {
    const resposta = await POST(pedido({ tipo: "text/plain" }));
    expect(resposta.status).toBe(422);
    expect(transcreverAudioDoChat).not.toHaveBeenCalled();
  });

  it("sem o campo do arquivo devolve 422", async () => {
    const resposta = await POST(pedido({ semArquivo: true }));
    expect(resposta.status).toBe(422);
    expect(transcreverAudioDoChat).not.toHaveBeenCalled();
  });

  it("grande demais devolve 413", async () => {
    const resposta = await POST(pedido({ bytes: TAMANHO_MAXIMO_DO_AUDIO + 1 }));
    expect(resposta.status).toBe(413);
    expect(transcreverAudioDoChat).not.toHaveBeenCalled();
  });

  it("áudio vazio devolve 422", async () => {
    const resposta = await POST(pedido({ bytes: 0 }));
    expect(resposta.status).toBe(422);
    expect(transcreverAudioDoChat).not.toHaveBeenCalled();
  });

  it("o limite por minuto devolve 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false } as never);
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(429);
    expect(transcreverAudioDoChat).not.toHaveBeenCalled();
  });

  it("sucesso devolve { data: { texto } } e a organização é a da SESSÃO", async () => {
    const resposta = await POST(
      pedido({ tipo: "audio/webm;codecs=opus", extras: { organization_id: OUTRA_ORG } }),
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ data: { texto: TEXTO } });
    const entrada = vi.mocked(transcreverAudioDoChat).mock.calls[0]![0];
    expect(entrada.orgId).toBe(ORG_ID);
    expect(entrada.mime).toBe("audio/webm");
    expect(entrada.audio.length).toBe(2048);
  });

  it("a auditoria leva tamanho e tipo, nunca o texto", async () => {
    await POST(pedido());
    expect(audit).toHaveBeenCalledTimes(1);
    const chamada = vi.mocked(audit).mock.calls[0]![0];
    expect(chamada.action).toBe("ai.assistente_transcribed");
    expect(chamada.organizationId).toBe(ORG_ID);
    expect(JSON.stringify(chamada)).not.toContain(TEXTO);
  });

  it("sem quem transcreva, a frase manda cadastrar a chave da OpenAI", async () => {
    vi.mocked(transcreverAudioDoChat).mockResolvedValue({ ok: false, motivo: "sem_chave" });
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(422);
    const corpo = (await resposta.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("chave da OpenAI em Credenciais");
    expect(audit).not.toHaveBeenCalled();
  });

  it("transcrição vazia (sem fala) devolve 422 em português", async () => {
    vi.mocked(transcreverAudioDoChat).mockResolvedValue({ ok: false, motivo: "audio_vazio" });
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(422);
  });

  it("falha do provedor devolve 502", async () => {
    vi.mocked(transcreverAudioDoChat).mockResolvedValue({ ok: false, motivo: "falhou" });
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(502);
  });
});
