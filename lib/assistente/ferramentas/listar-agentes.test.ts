/**
 * `listar_agentes`: por agente só id, nome, descrição cortada, tipo, estado e
 * provedor/modelo da versão publicada — nunca `system_prompt`, `config`,
 * `guardrails`, `tool_ids` brutos nem `credential_id`.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { sobreporHandlerDeAgentes } from "./listar-agentes";

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const AGENTE_BASE = {
  id: "ag-1",
  organization_id: "org-1",
  name: "Atendente da clínica",
  description: "Atende os pacientes",
  model: "legado",
  system_prompt: "SEGREDO-PROMPT",
  is_active: true,
  is_default: false,
  kind: "mcp_agent",
  priority: 1,
  published_version_id: "v1",
  paused_at: null,
  operation_mode: "auto",
  operation_revision: 2,
  archived_at: null,
  config: { x: "SEGREDO-CONFIG" },
  guardrails: { y: "SEGREDO-GUARD" },
  credential_id: "SEGREDO-CRED",
  tool_ids: ["SEGREDO-TOOL"],
  campo_extra_inventado: "EXTRA",
  versao_publicada: { provider: "anthropic", model: "claude-sonnet-4-6" },
};

function ligar(linhas: unknown[], queryVista?: { query: Record<string, string> }): void {
  const handler: HandlerDeRota = async (req) => {
    if (queryVista) {
      const url = new URL(req.url);
      queryVista.query = Object.fromEntries(url.searchParams.entries());
    }
    return respostaJson(200, { data: linhas });
  };
  sobreporHandlerDeAgentes(handler);
}

describe("listar_agentes", () => {
  afterEach(() => {
    sobreporHandlerDeAgentes(null);
  });

  it("projeção positiva: sentinelas da rota não saem", async () => {
    ligar([AGENTE_BASE]);
    const { ferramentas } = montarParaTeste("manager");

    const saida = await chamar(ferramentas, "listar_agentes", {});

    expect(saida).toEqual({
      ok: true,
      agentes: [
        {
          id: "ag-1",
          nome: "Atendente da clínica",
          descricao: "Atende os pacientes",
          tipo: "mcp_agent",
          ativo: true,
          publicado: true,
          pausado: false,
          modo_de_operacao: "auto",
          provedor_publicado: "anthropic",
          modelo_publicado: "claude-sonnet-4-6",
        },
      ],
    });
    const texto = JSON.stringify(saida);
    for (const sentinela of ["SEGREDO-PROMPT", "SEGREDO-CONFIG", "SEGREDO-GUARD", "SEGREDO-CRED", "SEGREDO-TOOL", "EXTRA"]) {
      expect(texto).not.toContain(sentinela);
    }
  });

  it("descrição longa sai cortada em ~200 caracteres", async () => {
    ligar([{ ...AGENTE_BASE, description: "d".repeat(300) }]);
    const { ferramentas } = montarParaTeste("manager");

    const saida = await chamar<{ ok: boolean; agentes: { descricao: string }[] }>(
      ferramentas,
      "listar_agentes",
      {},
    );

    expect(saida.ok).toBe(true);
    expect(saida.agentes[0]!.descricao.length).toBeLessThanOrEqual(200);
  });

  it("arquivado não volta por padrão; com incluir_arquivados ele volta", async () => {
    const arquivado = { ...AGENTE_BASE, id: "ag-2", name: "Velho", archived_at: "2026-01-01T00:00:00Z" };
    const queryVista: { query: Record<string, string> } = { query: {} };
    ligar([AGENTE_BASE, arquivado], queryVista);
    const { ferramentas } = montarParaTeste("manager");

    const padrao = await chamar<{ ok: boolean; agentes: { id: string }[] }>(
      ferramentas,
      "listar_agentes",
      {},
    );
    expect(padrao.agentes.map((a) => a.id)).toEqual(["ag-1"]);
    expect(queryVista.query).not.toHaveProperty("include_archived");

    const comArquivados = await chamar<{ ok: boolean; agentes: { id: string }[] }>(
      ferramentas,
      "listar_agentes",
      { incluir_arquivados: true },
    );
    expect(comArquivados.agentes.map((a) => a.id).sort()).toEqual(["ag-1", "ag-2"]);
    expect(queryVista.query.include_archived).toBe("true");
  });

  it("rota 500: mensagem neutra, sem lançar, sem vazar o corpo", async () => {
    const handler: HandlerDeRota = async () =>
      respostaJson(500, { error: { code: "x", message: "SEGREDO-CORPO" } });
    sobreporHandlerDeAgentes(handler);
    const { ferramentas } = montarParaTeste("manager");

    const saida = await chamar(ferramentas, "listar_agentes", {});

    expect(saida).toEqual({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(saida)).not.toContain("SEGREDO-CORPO");
  });
});
