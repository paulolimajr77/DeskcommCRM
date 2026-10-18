/**
 * `listar_funis`: por funil só id e nome — o `listPipelinesHandler` não
 * devolve etapas, então não há etapa para projetar.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { sobreporHandlerDeFunis } from "./listar-funis";

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const FUNIS_DA_ROTA = [
  {
    id: "funil-1",
    organization_id: "org-1",
    name: "Vendas",
    slug: "vendas",
    description: "Funil de vendas",
    is_default: true,
    is_archived: false,
    position: 1000,
    vocabulary: { lead: "Cliente" },
    settings: { x: 1 },
    campo_extra_inventado: "EXTRA",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
];

describe("listar_funis", () => {
  afterEach(() => {
    sobreporHandlerDeFunis(null);
  });

  it("só id e nome saem; o resto da linha fica na rota", async () => {
    const handler: HandlerDeRota = async () => respostaJson(200, { data: FUNIS_DA_ROTA });
    sobreporHandlerDeFunis(handler);
    const { ferramentas } = montarParaTeste("manager");

    const saida = await chamar(ferramentas, "listar_funis", {});

    expect(saida).toEqual({ ok: true, funis: [{ id: "funil-1", nome: "Vendas" }] });
    expect(JSON.stringify(saida)).not.toContain("EXTRA");
    expect(JSON.stringify(saida)).not.toContain("org-1");
  });

  it("rota 403/500 ou corpo inválido: mensagem neutra, sem lançar", async () => {
    const { ferramentas } = montarParaTeste("manager");

    const handler403: HandlerDeRota = async () =>
      respostaJson(403, { error: { code: "x", message: "SEGREDO-CORPO" } });
    sobreporHandlerDeFunis(handler403);
    const saida403 = await chamar(ferramentas, "listar_funis", {});
    expect(saida403).toEqual({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(saida403)).not.toContain("SEGREDO-CORPO");

    const handler500: HandlerDeRota = async () => respostaJson(500, { error: { code: "y" } });
    sobreporHandlerDeFunis(handler500);
    expect(await chamar(ferramentas, "listar_funis", {})).toEqual({
      ok: false,
      motivo: "indisponivel",
    });

    const handlerInvalido: HandlerDeRota = async () => respostaJson(200, { data: null });
    sobreporHandlerDeFunis(handlerInvalido);
    expect(await chamar(ferramentas, "listar_funis", {})).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
  });
});
