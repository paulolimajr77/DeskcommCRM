/**
 * `criar_rascunho_de_agente`: cria o agente como RASCUNHO (v1 draft, nada
 * publicado). O modelo escolhe nome, descrição, prompt e pacotes; provedor,
 * modelo e credencial vêm da configuração da org (T11), nunca do modelo.
 * Funil/material de fora da org nem chega ao POST.
 */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import { ligarPacote } from "@/lib/mcp/tools/selecao-por-pacote";
import { catalogoComHandler } from "@/lib/ai/agents/capacidades-padrao";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { sobreporHandlersDeCriacao } from "./criar-rascunho-de-agente";

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PROVEDORES_OK = {
  padrao: { provider: "anthropic", defaultModel: "claude-sonnet-4-6" },
  credenciais: [
    {
      id: "cred-1",
      provider: "anthropic",
      label: "Chave da empresa",
      validated_at: "2026-10-01T00:00:00Z",
      is_active: true,
    },
  ],
};

const FUNIS_OK = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Vendas" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Pós-venda" },
];

const MATERIAIS_OK = [{ id: "33333333-3333-4333-8333-333333333333", name: "Guia", source_type: "faq", status: "ready" }];

interface CorpoCapturado {
  name?: unknown;
  description?: unknown;
  priority?: unknown;
  version?: Record<string, unknown>;
}

function ligar(opcoes: {
  provedores?: unknown;
  funis?: unknown;
  materiais?: unknown;
  statusPost?: number;
  corpoPost?: unknown;
  corpoVisto?: { corpo: CorpoCapturado | null; metodo: string };
}): void {
  const hProvedores: HandlerDeRota = async () => respostaJson(200, { data: opcoes.provedores ?? PROVEDORES_OK });
  const hFunis: HandlerDeRota = async () => respostaJson(200, { data: opcoes.funis ?? FUNIS_OK });
  const hMateriais: HandlerDeRota = async () => respostaJson(200, { data: opcoes.materiais ?? MATERIAIS_OK });
  const hPost: HandlerDeRota = async (req) => {
    if (opcoes.corpoVisto) {
      opcoes.corpoVisto.metodo = req.method;
      try {
        opcoes.corpoVisto.corpo = (await req.json()) as CorpoCapturado;
      } catch {
        opcoes.corpoVisto.corpo = null;
      }
    }
    return respostaJson(opcoes.statusPost ?? 201, {
      data:
        opcoes.corpoPost ?? {
          agent: { id: "ag-novo", name: "Atendente novo" },
          version: { id: "v1", status: "draft" },
        },
    });
  };
  sobreporHandlersDeCriacao({ provedores: hProvedores, funis: hFunis, materiais: hMateriais, agentesPost: hPost });
}

const PROMPT_BOM = "Você atende os pacientes da clínica com paciência e confirma cada dado antes de registrar.";

describe("criar_rascunho_de_agente", () => {
  afterEach(() => {
    sobreporHandlersDeCriacao(null);
    vi.restoreAllMocks();
  });

  it("cria o rascunho com os tool_ids do pacote, sem nada do modelo além do pedido", async () => {
    const corpoVisto: { corpo: CorpoCapturado | null; metodo: string } = { corpo: null, metodo: "" };
    ligar({ corpoVisto });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "criar_rascunho_de_agente", {
      nome: "Atendente novo",
      prompt: PROMPT_BOM,
      pacotes: ["vender"],
      funis: [FUNIS_OK[0]!.id],
      materiais: [MATERIAIS_OK[0]!.id],
    });

    expect(saida).toEqual({
      ok: true,
      agente: { id: "ag-novo", nome: "Atendente novo", estado: "rascunho" },
    });
    expect(corpoVisto.metodo).toBe("POST");
    const esperado = ligarPacote([], catalogoComHandler(), "vender");
    expect(corpoVisto.corpo?.version?.tool_ids).toEqual(esperado);
    expect(corpoVisto.corpo?.version).toMatchObject({
      system_prompt: PROMPT_BOM,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      credential_id: "cred-1",
      channel_session_id: null,
      pipeline_ids: [FUNIS_OK[0]!.id],
      knowledge_source_ids: [MATERIAIS_OK[0]!.id],
    });
    expect(JSON.stringify(corpoVisto.corpo)).not.toContain("organization_id");
  });

  it("prompt curto nem chama o POST: pede para reescrever", async () => {
    const corpoVisto: { corpo: CorpoCapturado | null; metodo: string } = { corpo: null, metodo: "" };
    ligar({ corpoVisto });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "criar_rascunho_de_agente", { nome: "X", prompt: "curto" });

    expect(saida).toEqual({ ok: false, motivo: "prompt_curto" });
    expect(corpoVisto.corpo).toBeNull();
  });

  it("sem credencial validada: PRECISO CONFIRMAR com o link, sem chamar o POST", async () => {
    const corpoVisto: { corpo: CorpoCapturado | null; metodo: string } = { corpo: null, metodo: "" };
    ligar({
      corpoVisto,
      provedores: { padrao: { provider: "anthropic", defaultModel: "x" }, credenciais: [] },
    });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string; detalhe: string }>(
      ferramentas,
      "criar_rascunho_de_agente",
      { nome: "X", prompt: PROMPT_BOM },
    );

    expect(saida.ok).toBe(false);
    expect(saida.motivo).toBe("sem_credencial");
    expect(saida.detalhe).toContain("PRECISO CONFIRMAR");
    expect(saida.detalhe).toContain("/app/ai/credentials");
    expect(corpoVisto.corpo).toBeNull();
  });

  it("credencial de OUTRO provedor nunca é usada: pega a do provedor padrão", async () => {
    const corpoVisto: { corpo: CorpoCapturado | null; metodo: string } = { corpo: null, metodo: "" };
    const validada = "2026-10-01T00:00:00Z";
    ligar({
      corpoVisto,
      provedores: {
        padrao: { provider: "openai", defaultModel: "gpt-x" },
        credenciais: [
          { id: "cred-anthropic", provider: "anthropic", validated_at: validada, is_active: true },
          { id: "cred-openai", provider: "openai", validated_at: validada, is_active: true },
        ],
      },
    });
    const { ferramentas } = montarParaTeste("admin");

    await chamar(ferramentas, "criar_rascunho_de_agente", { nome: "X", prompt: PROMPT_BOM });

    expect(corpoVisto.corpo?.version).toMatchObject({ provider: "openai", model: "gpt-x", credential_id: "cred-openai" });
  });

  it("só há chave de outro provedor: PRECISO CONFIRMAR, sem chamar o POST", async () => {
    const corpoVisto: { corpo: CorpoCapturado | null; metodo: string } = { corpo: null, metodo: "" };
    ligar({
      corpoVisto,
      provedores: {
        padrao: { provider: "openai", defaultModel: "gpt-x" },
        credenciais: [{ id: "cred-anthropic", provider: "anthropic", validated_at: "2026-10-01T00:00:00Z", is_active: true }],
      },
    });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string; detalhe: string }>(
      ferramentas,
      "criar_rascunho_de_agente",
      { nome: "X", prompt: PROMPT_BOM },
    );

    expect(saida.motivo).toBe("sem_credencial");
    expect(corpoVisto.corpo).toBeNull();
  });

  it("organização sem modelo padrão: pede para definir, em vez de dizer que falta chave", async () => {
    const corpoVisto: { corpo: CorpoCapturado | null; metodo: string } = { corpo: null, metodo: "" };
    ligar({
      corpoVisto,
      provedores: { ...PROVEDORES_OK, padrao: { provider: "anthropic", defaultModel: null } },
    });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string; detalhe: string }>(
      ferramentas,
      "criar_rascunho_de_agente",
      { nome: "X", prompt: PROMPT_BOM },
    );

    expect(saida.motivo).toBe("sem_modelo_padrao");
    expect(saida.detalhe).toContain("PRECISO CONFIRMAR");
    expect(corpoVisto.corpo).toBeNull();
  });

  it("funil de fora da org: recusa antes do POST, sem vazar nada", async () => {
    const corpoVisto: { corpo: CorpoCapturado | null; metodo: string } = { corpo: null, metodo: "" };
    ligar({ corpoVisto });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "criar_rascunho_de_agente", {
      nome: "X",
      prompt: PROMPT_BOM,
      funis: ["99999999-9999-4999-8999-999999999999"],
    });

    expect(saida).toEqual({ ok: false, motivo: "escopo_invalido" });
    expect(corpoVisto.corpo).toBeNull();
  });

  it("união de pacotes acima do teto: recusa fechada com a contagem, nunca corta sozinho", async () => {
    const corpoVisto: { corpo: CorpoCapturado | null; metodo: string } = { corpo: null, metodo: "" };
    ligar({ corpoVisto });
    const { ferramentas } = montarParaTeste("admin");
    const catalogo = catalogoComHandler();
    let uniao: string[] = [];
    for (const pacote of ["atender", "vender", "reter", "escalar", "organizar", "evoluir"] as const) {
      uniao = ligarPacote(uniao, catalogo, pacote);
    }

    const saida = await chamar<{ ok: boolean; motivo?: string }>(ferramentas, "criar_rascunho_de_agente", {
      nome: "X",
      prompt: PROMPT_BOM,
      pacotes: ["atender", "vender", "reter", "escalar", "organizar", "evoluir"],
    });

    if (uniao.length > 27) {
      expect(saida).toEqual({
        ok: false,
        motivo: "teto_de_ferramentas",
        detalhe: expect.stringContaining(`${uniao.length}`),
      });
      expect(corpoVisto.corpo).toBeNull();
    } else {
      expect(saida.ok).toBe(true);
    }
  });

  it("POST 500: mensagem neutra, sem lançar, sem vazar o corpo", async () => {
    const hProvedores: HandlerDeRota = async () => respostaJson(200, { data: PROVEDORES_OK });
    const hFunis: HandlerDeRota = async () => respostaJson(200, { data: FUNIS_OK });
    const hMateriais: HandlerDeRota = async () => respostaJson(200, { data: MATERIAIS_OK });
    const hPost: HandlerDeRota = async () =>
      respostaJson(500, { error: { code: "x", message: "SEGREDO-CORPO" } });
    sobreporHandlersDeCriacao({ provedores: hProvedores, funis: hFunis, materiais: hMateriais, agentesPost: hPost });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "criar_rascunho_de_agente", { nome: "X", prompt: PROMPT_BOM });

    expect(saida).toEqual({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(saida)).not.toContain("SEGREDO-CORPO");
  });

  it("pacote desconhecido é recusado pelo esquema, sem chamar o POST", async () => {
    const corpoVisto: { corpo: CorpoCapturado | null; metodo: string } = { corpo: null, metodo: "" };
    ligar({ corpoVisto });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "criar_rascunho_de_agente", {
      nome: "X",
      prompt: PROMPT_BOM,
      pacotes: ["dominar-o-mundo"],
    });

    expect(saida).toEqual({ ok: false, motivo: "parametro_invalido" });
    expect(corpoVisto.corpo).toBeNull();
  });
});
