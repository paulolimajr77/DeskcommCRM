/**
 * `listar_materiais`: por fonte só id, nome, tipo e estado — nada do
 * conteúdo do material.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { sobreporHandlerDeMateriais } from "./listar-materiais";

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const FONTES_DA_ROTA = [
  {
    id: "mat-1",
    agent_id: null,
    organization_id: "org-1",
    source_type: "faq",
    name: "Perguntas da clínica",
    status: "ready",
    last_index_status: "ok",
    last_index_error: null,
    last_indexed_at: "2026-10-01T00:00:00Z",
    chunks_count: 12,
    is_active: true,
    source_metadata: { segredo: "SEGREDO-METADADO" },
    campo_extra_inventado: "EXTRA",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
];

describe("listar_materiais", () => {
  afterEach(() => {
    sobreporHandlerDeMateriais(null);
  });

  it("só id, nome, tipo e estado saem; metadados e extras ficam na rota", async () => {
    const handler: HandlerDeRota = async () => respostaJson(200, { data: FONTES_DA_ROTA });
    sobreporHandlerDeMateriais(handler);
    const { ferramentas } = montarParaTeste("manager");

    const saida = await chamar(ferramentas, "listar_materiais", {});

    expect(saida).toEqual({
      ok: true,
      materiais: [{ id: "mat-1", nome: "Perguntas da clínica", tipo: "faq", estado: "ready" }],
    });
    const texto = JSON.stringify(saida);
    expect(texto).not.toContain("SEGREDO-METADADO");
    expect(texto).not.toContain("EXTRA");
    expect(texto).not.toContain("org-1");
  });

  it("rota 403/500 ou corpo inválido: mensagem neutra, sem lançar", async () => {
    const { ferramentas } = montarParaTeste("manager");

    const handler403: HandlerDeRota = async () =>
      respostaJson(403, { error: { code: "x", message: "SEGREDO-CORPO" } });
    sobreporHandlerDeMateriais(handler403);
    const saida403 = await chamar(ferramentas, "listar_materiais", {});
    expect(saida403).toEqual({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(saida403)).not.toContain("SEGREDO-CORPO");

    const handler500: HandlerDeRota = async () => respostaJson(500, { error: { code: "y" } });
    sobreporHandlerDeMateriais(handler500);
    expect(await chamar(ferramentas, "listar_materiais", {})).toEqual({
      ok: false,
      motivo: "indisponivel",
    });

    const handlerInvalido: HandlerDeRota = async () => respostaJson(200, { data: null });
    sobreporHandlerDeMateriais(handlerInvalido);
    expect(await chamar(ferramentas, "listar_materiais", {})).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
  });
});
