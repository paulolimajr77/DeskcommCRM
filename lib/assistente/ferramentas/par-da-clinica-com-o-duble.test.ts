/**
 * O PAR DA CLÍNICA, até o dublê do e2e (`preview-fixture.ts`).
 *
 * O e2e `assistente-rascunho-de-agente.spec.ts` pede "monta o agente da minha
 * clínica" ao chat; o dublê finge o raciocínio do modelo e chama
 * `montar_pacote_do_nicho` de verdade. No CI o turno quebrou com
 * `TypeError` (a rota só registrava o nome do erro). Este teste roda o MESMO
 * laço de ferramentas do `runModelCall` (`generateText` + `stopWhen` +
 * `guardServiceTools`) com o dublê e o catálogo real do admin, trocando só a
 * fronteira (as rotas por dentro), e exige que o cartão do agente nasça.
 */
// @vitest-environment node
import { vi } from "vitest";

// `lib/env.ts` lê o processo no carregamento: a chave AES precisa existir ANTES dos imports.
vi.hoisted(() => {
  process.env.AI_CRED_AES_KEY = "iBc1Z2gYaAH4rEHs1dHQ2dvNQ6t4OfrdE1/Y6OSvtZY=";
});

import { generateText, stepCountIs } from "ai";
import { afterEach, describe, expect, it } from "vitest";

import { responderComoAssistente } from "@/lib/agent-engine/agent/assistente-turn";
import { previewFixtureRegistry } from "@/lib/agent-engine/agent/preview-fixture";
import { cifrarChaveDeTeste } from "../../../tests/e2e/helpers/chave-de-ia-de-teste";
import { montarSystemDoAssistente } from "@/lib/agent-engine/agent/assistente/prompt";
import { guardServiceTools } from "@/lib/atendimento/fronteira-server";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { montarParaTeste } from "./auxiliar-de-teste";
import { sobreporHandlersDeCriacao } from "./criar-rascunho-de-agente";
import { sobreporHandlerDeInstalacao } from "./instalar-modelo-de-followup";
import { sobreporHandlerDeListaDeAgentes } from "./montar-pacote-do-nicho";

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

function ligar(): void {
  const lista: HandlerDeRota = async () => json(200, { data: [] });
  sobreporHandlerDeListaDeAgentes(lista);
  sobreporHandlersDeCriacao({
    provedores: async () =>
      json(200, {
        data: {
          padrao: { provider: "anthropic", defaultModel: "claude-sonnet-4-6" },
          credenciais: [
            { id: "cred-1", provider: "anthropic", label: "Chave", validated_at: "2026-10-01T00:00:00Z", is_active: true },
          ],
        },
      }),
    funis: async () => json(200, { data: [] }),
    materiais: async () => json(200, { data: [] }),
    agentesPost: async (req) => {
      const corpo = (await req.json()) as { agent?: { name?: string }; name?: string };
      const nome = corpo.agent?.name ?? corpo.name ?? "Agente";
      return json(201, { data: { agent: { id: "ag-novo", name: nome }, version: { id: "v1", status: "draft" } } });
    },
  });
  sobreporHandlerDeInstalacao(async (req) => {
    const corpo = (await req.json()) as { model_id?: string };
    return json(201, { data: { id: `ptr-${corpo.model_id}`, name: `Instalado ${corpo.model_id}`, status: "draft" } });
  });
}

describe("o dublê do e2e conduz o par da clínica até o cartão do agente", () => {
  afterEach(() => {
    sobreporHandlerDeListaDeAgentes(null);
    sobreporHandlersDeCriacao(null);
    sobreporHandlerDeInstalacao(null);
  });

  it("monta_pacote_do_nicho roda no laço do seam e anota o cartão", async () => {
    ligar();
    const { ferramentas, coletor, ctx } = montarParaTeste("admin");
    const model = previewFixtureRegistry().anthropic!("chave", "modelo");

    const resposta = await generateText({
      model,
      system: montarSystemDoAssistente({ idioma: ctx.idioma, fuso: ctx.fuso, agoraIso: ctx.agoraIso, papel: "admin" }),
      messages: [{ role: "user", content: "monta o agente da minha clínica" }],
      tools: guardServiceTools(ferramentas),
      stopWhen: stepCountIs(6),
    });

    expect(resposta.text).toMatch(/Criei o rascunho do Agente Clinica E2E/);
    const cartao = coletor.acoes.find(
      (a): a is Extract<typeof a, { tipo: "artefato" }> => a.tipo === "artefato" && a.artefato === "agente",
    );
    expect(cartao?.href).toBe("/app/ai/agents/ag-novo");
    expect(cartao?.nome).toMatch(/^Agente Clinica E2E /);
  });

  /** O turno inteiro pelo seam (`runModelCall`), com a credencial da organização que o e2e semeia. */
  async function turnoComCredencial(credencial: Record<string, string>) {
    ligar();
    const { ferramentas, coletor, ctx } = montarParaTeste("admin");
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("settings->'llm'")) {
        return { rows: [{ llm: { provider: "anthropic", default_model: "claude-padrao", params: {}, enabled_models: [], monthly_budget_cents: null } }] };
      }
      if (sql.includes("select id, api_key_encrypted")) return { rows: [{ id: "cred-1", ...credencial }] };
      if (sql.includes("insert into llm_calls")) return { rows: [{ id: "call-1" }] };
      return { rows: [] };
    });
    const saida = await responderComoAssistente(
      { query } as never,
      { anthropicApiKey: "local-controlled-provider", cacheTtl: "1h" } as never,
      {
        tenantId: ctx.orgId,
        system: montarSystemDoAssistente({ idioma: ctx.idioma, fuso: ctx.fuso, agoraIso: ctx.agoraIso, papel: "admin" }),
        historico: [],
        pergunta: "monta o agente da minha clínica",
        tools: ferramentas,
        maxSteps: 6,
      },
      { registry: previewFixtureRegistry() },
    );
    return { saida, coletor };
  }

  it("pelo seam inteiro, com a credencial cifrada de verdade (o que o e2e passa a semear): o cartão nasce", async () => {
    const { saida, coletor } = await turnoComCredencial({ ...cifrarChaveDeTeste("chave-de-teste-e2e") });
    expect(saida.texto).toMatch(/Criei o rascunho do Agente Clinica E2E/);
    expect(coletor.acoes.some((a) => a.tipo === "artefato" && a.artefato === "agente")).toBe(true);
  });

  it("A CAUSA do vermelho do CI: credencial semeada com um byte zero em cada campo derruba o turno com TypeError", async () => {
    const enfeite = String.fromCharCode(92) + "x00";
    const erro = await turnoComCredencial({
      api_key_encrypted: enfeite,
      api_key_iv: enfeite,
      api_key_tag: enfeite,
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(TypeError);
    expect((erro as Error).message).toMatch(/Invalid authentication tag length/);
  });
});
