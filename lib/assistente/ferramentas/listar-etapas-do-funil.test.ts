/**
 * `listar_etapas_do_funil`: as etapas vivas de um funil, projetadas por LISTA
 * POSITIVA (id, nome, posicao, ganha, perdida). A janela de esfriamento
 * (`expected_duration_hours`) e qualquer campo novo da rota NÃO saem daqui.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { sobreporHandlerDeEtapas } from "./listar-etapas-do-funil";

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const FUNIL_ID = "11111111-1111-4111-8111-111111111111";

const ETAPAS_DA_ROTA = [
  {
    id: "estagio-1",
    organization_id: "org-1",
    pipeline_id: FUNIL_ID,
    name: "Em conversa",
    position: 1000,
    is_won: false,
    is_lost: false,
    is_archived: false,
    expected_duration_hours: 24,
    campo_extra_inventado: "EXTRA",
  },
  {
    id: "estagio-2",
    organization_id: "org-1",
    pipeline_id: FUNIL_ID,
    name: "Pago",
    position: 2000,
    is_won: true,
    is_lost: false,
    is_archived: false,
    expected_duration_hours: null,
  },
];

describe("listar_etapas_do_funil", () => {
  afterEach(() => {
    sobreporHandlerDeEtapas(null);
  });

  it("sai só a projeção positiva; a janela de esfriamento e extras ficam na rota", async () => {
    const handler: HandlerDeRota = async () => respostaJson(200, { data: ETAPAS_DA_ROTA });
    sobreporHandlerDeEtapas(handler);
    const { ferramentas } = montarParaTeste("manager");

    const saida = await chamar(ferramentas, "listar_etapas_do_funil", { funil_id: FUNIL_ID });

    expect(saida).toEqual({
      ok: true,
      etapas: [
        { id: "estagio-1", nome: "Em conversa", posicao: 1000, ganha: false, perdida: false },
        { id: "estagio-2", nome: "Pago", posicao: 2000, ganha: true, perdida: false },
      ],
    });
    const texto = JSON.stringify(saida);
    expect(texto).not.toContain("expected_duration_hours");
    expect(texto).not.toContain("EXTRA");
    expect(texto).not.toContain("org-1");
  });

  it("funil_id que não é uuid é recusado pelo esquema, sem chamar a rota", async () => {
    let chamou = false;
    const handler: HandlerDeRota = async () => {
      chamou = true;
      return respostaJson(200, { data: ETAPAS_DA_ROTA });
    };
    sobreporHandlerDeEtapas(handler);
    const { ferramentas } = montarParaTeste("manager");

    const saida = await chamar(ferramentas, "listar_etapas_do_funil", { funil_id: "nao-e-uuid" });

    expect(saida).toEqual({ ok: false, motivo: "parametro_invalido" });
    expect(chamou).toBe(false);
  });

  it("rota 403/500 ou corpo inválido: mensagem neutra, sem lançar", async () => {
    const { ferramentas } = montarParaTeste("manager");

    const handler403: HandlerDeRota = async () =>
      respostaJson(403, { error: { code: "x", message: "SEGREDO-CORPO" } });
    sobreporHandlerDeEtapas(handler403);
    const saida403 = await chamar(ferramentas, "listar_etapas_do_funil", { funil_id: FUNIL_ID });
    expect(saida403).toEqual({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(saida403)).not.toContain("SEGREDO-CORPO");

    const handler500: HandlerDeRota = async () => respostaJson(500, { error: { code: "y" } });
    sobreporHandlerDeEtapas(handler500);
    expect(await chamar(ferramentas, "listar_etapas_do_funil", { funil_id: FUNIL_ID })).toEqual({
      ok: false,
      motivo: "indisponivel",
    });

    const handlerInvalido: HandlerDeRota = async () => respostaJson(200, { data: null });
    sobreporHandlerDeEtapas(handlerInvalido);
    expect(await chamar(ferramentas, "listar_etapas_do_funil", { funil_id: FUNIL_ID })).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
  });
});
