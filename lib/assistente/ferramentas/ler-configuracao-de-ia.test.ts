/**
 * `ler_configuracao_de_ia`: provedor e modelo padrão + credenciais SÓ com
 * id, provedor, nome e estado — nunca `api_key_last4`, chave ou URL base.
 * Também diz se há agente publicado (id, nome).
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { sobreporFontesDeConfiguracao } from "./ler-configuracao-de-ia";

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
      api_key_last4: "SEGREDO-CHAVE",
      base_url: "https://segredo.invalid",
      validated_at: "2026-10-01T00:00:00Z",
      is_active: true,
      campo_extra_inventado: "EXTRA",
    },
  ],
};

const AGENTES_OK = [
  {
    id: "ag-1",
    name: "Atendente",
    description: "Atende",
    kind: "mcp_agent",
    is_active: true,
    published_version_id: "v1",
    paused_at: null,
    operation_mode: "auto",
    system_prompt: "SEGREDO-PROMPT",
    config: { x: "SEGREDO-CONFIG" },
    versao_publicada: { provider: "anthropic", model: "claude-sonnet-4-6" },
  },
];

function ligar(provedores: unknown, agentes: unknown): void {
  const hProvedores: HandlerDeRota = async () => respostaJson(200, { data: provedores });
  const hAgentes: HandlerDeRota = async () => respostaJson(200, { data: agentes });
  sobreporFontesDeConfiguracao(hProvedores, hAgentes);
}

describe("ler_configuracao_de_ia", () => {
  afterEach(() => {
    sobreporFontesDeConfiguracao(null, null);
  });

  it("devolve só os campos permitidos, sem segredo da rota", async () => {
    ligar(PROVEDORES_OK, AGENTES_OK);
    const { ferramentas } = montarParaTeste("manager");

    const saida = await chamar(ferramentas, "ler_configuracao_de_ia", {});

    expect(saida).toEqual({
      ok: true,
      provedor_padrao: "anthropic",
      modelo_padrao: "claude-sonnet-4-6",
      credenciais: [
        { id: "cred-1", provedor: "anthropic", nome: "Chave da empresa", validada: true, ativa: true },
      ],
      agente_publicado: { id: "ag-1", nome: "Atendente" },
    });
    const texto = JSON.stringify(saida);
    expect(texto).not.toContain("SEGREDO-CHAVE");
    expect(texto).not.toContain("segredo.invalid");
    expect(texto).not.toContain("SEGREDO-PROMPT");
    expect(texto).not.toContain("SEGREDO-CONFIG");
    expect(texto).not.toContain("EXTRA");
  });

  it("sem agente publicado, devolve agente_publicado null", async () => {
    ligar(PROVEDORES_OK, []);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "ler_configuracao_de_ia", {});

    expect(saida).toEqual({
      ok: true,
      provedor_padrao: "anthropic",
      modelo_padrao: "claude-sonnet-4-6",
      credenciais: [
        { id: "cred-1", provedor: "anthropic", nome: "Chave da empresa", validada: true, ativa: true },
      ],
      agente_publicado: null,
    });
  });

  it("provedores 403: mensagem neutra, sem lançar, sem vazar o corpo", async () => {
    const hProvedores: HandlerDeRota = async () =>
      respostaJson(403, { error: { code: "x", message: "SEGREDO-CORPO" } });
    const hAgentes: HandlerDeRota = async () => respostaJson(200, { data: [] });
    sobreporFontesDeConfiguracao(hProvedores, hAgentes);
    const { ferramentas } = montarParaTeste("manager");

    const saida = await chamar(ferramentas, "ler_configuracao_de_ia", {});

    expect(saida).toEqual({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(saida)).not.toContain("SEGREDO-CORPO");
  });

  it("provedores 500 ou corpo inválido: indisponivel, sem lançar", async () => {
    const hProvedores: HandlerDeRota = async () => respostaJson(500, { error: { code: "y" } });
    const hAgentes: HandlerDeRota = async () => respostaJson(200, { data: [] });
    sobreporFontesDeConfiguracao(hProvedores, hAgentes);
    const { ferramentas } = montarParaTeste("manager");

    expect(await chamar(ferramentas, "ler_configuracao_de_ia", {})).toEqual({
      ok: false,
      motivo: "indisponivel",
    });

    const hInvalido: HandlerDeRota = async () => respostaJson(200, { data: null });
    sobreporFontesDeConfiguracao(hInvalido, hAgentes);
    expect(await chamar(ferramentas, "ler_configuracao_de_ia", {})).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
  });
});
