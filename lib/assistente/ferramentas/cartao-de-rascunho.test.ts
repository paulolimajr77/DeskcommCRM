/**
 * Cartão "Criado como rascunho": as 3 ferramentas de criação anotam no
 * coletor um cartão por recurso criado — SÓ no sucesso, com `href` montado
 * no servidor a partir do id que a ROTA devolveu (nunca de texto do modelo).
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { sobreporHandlersDeCriacao } from "./criar-rascunho-de-agente";
import { sobreporHandlerDeInstalacao } from "./instalar-modelo-de-followup";
import { sobreporHandlerDeListaDeAgentes } from "./montar-pacote-do-nicho";
import type { CartaoDeArtefato } from "./tipos";

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
      validated_at: "2026-10-01T00:00:00Z",
      is_active: true,
    },
  ],
};

const PROMPT_BOM = "Você atende os pacientes da clínica com paciência e confirma cada dado antes de registrar.";

function cartoesDe(coletor: { acoes: unknown[] }): CartaoDeArtefato[] {
  return coletor.acoes.filter(
    (acao): acao is CartaoDeArtefato =>
      typeof acao === "object" && acao !== null && (acao as { tipo?: unknown }).tipo === "artefato",
  );
}

describe("cartão de rascunho — criar_rascunho_de_agente", () => {
  afterEach(() => {
    sobreporHandlersDeCriacao(null);
  });

  function ligarCriacao(statusPost = 201): void {
    const hProvedores: HandlerDeRota = async () => respostaJson(200, { data: PROVEDORES_OK });
    const hVazio: HandlerDeRota = async () => respostaJson(200, { data: [] });
    const hPost: HandlerDeRota = async () =>
      respostaJson(statusPost, {
        data: { agent: { id: "ag-novo", name: "Atendente da rota" }, version: { status: "draft" } },
      });
    sobreporHandlersDeCriacao({ provedores: hProvedores, funis: hVazio, materiais: hVazio, agentesPost: hPost });
  }

  it("A. sucesso anota 1 cartão de agente, com nome e href da rota", async () => {
    ligarCriacao();
    const { ferramentas, coletor } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean }>(ferramentas, "criar_rascunho_de_agente", {
      nome: "SENTINELA-DO-MODELO",
      prompt: PROMPT_BOM,
    });

    expect(saida.ok).toBe(true);
    expect(cartoesDe(coletor)).toEqual([
      {
        tipo: "artefato",
        artefato: "agente",
        nome: "Atendente da rota",
        rotulo: "Abrir o agente",
        href: "/app/ai/agents/ag-novo",
      },
    ]);
    expect(JSON.stringify(cartoesDe(coletor))).not.toContain("SENTINELA");
  });

  it("B. falha não anota: prompt curto nem erro de rota", async () => {
    ligarCriacao(500);
    const { ferramentas, coletor } = montarParaTeste("admin");

    expect(
      await chamar(ferramentas, "criar_rascunho_de_agente", { nome: "X", prompt: "curto" }),
    ).toMatchObject({ ok: false });
    expect(
      await chamar(ferramentas, "criar_rascunho_de_agente", { nome: "X", prompt: PROMPT_BOM }),
    ).toMatchObject({ ok: false, motivo: "indisponivel" });
    expect(coletor.acoes).toEqual([]);
  });

  it("B2. sem duplicata: dois sucessos iguais anotam 1 cartão", async () => {
    ligarCriacao();
    const { ferramentas, coletor } = montarParaTeste("admin");
    const pedido = { nome: "Atendente novo", prompt: PROMPT_BOM };

    await chamar(ferramentas, "criar_rascunho_de_agente", pedido);
    await chamar(ferramentas, "criar_rascunho_de_agente", pedido);

    expect(cartoesDe(coletor)).toHaveLength(1);
  });

  it("B3. teto de 8: com 8 cartões o 9º não entra", async () => {
    ligarCriacao();
    const { ferramentas, coletor } = montarParaTeste("admin");
    for (let i = 0; i < 8; i += 1) {
      coletor.acoes.push({
        tipo: "artefato",
        artefato: "agente",
        nome: `Antigo ${i}`,
        rotulo: "Abrir o agente",
        href: `/app/ai/agents/antigo-${i}`,
      });
    }

    await chamar(ferramentas, "criar_rascunho_de_agente", { nome: "X", prompt: PROMPT_BOM });

    expect(cartoesDe(coletor)).toHaveLength(8);
  });
});

describe("cartão de rascunho — instalar_modelo_de_followup", () => {
  afterEach(() => {
    sobreporHandlerDeInstalacao(null);
  });

  function ligarInstalacao(status = 201): void {
    const handler: HandlerDeRota = async () =>
      respostaJson(status, {
        data: { id: "ptr-1", name: "Exame da rota", status: "draft" },
      });
    sobreporHandlerDeInstalacao(handler);
  }

  it("A. sucesso anota 1 cartão de follow-up, com href do id da rota", async () => {
    ligarInstalacao();
    const { ferramentas, coletor } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean }>(ferramentas, "instalar_modelo_de_followup", {
      model_id: "clinica-consulta-retomada",
      nome: "SENTINELA-DO-MODELO",
    });

    expect(saida.ok).toBe(true);
    expect(cartoesDe(coletor)).toEqual([
      {
        tipo: "artefato",
        artefato: "followup",
        nome: "Exame da rota",
        rotulo: "Abrir o follow-up",
        href: "/app/ai/followups/ptr-1",
      },
    ]);
    expect(JSON.stringify(cartoesDe(coletor))).not.toContain("SENTINELA");
  });

  it("B. ja_existe não anota", async () => {
    ligarInstalacao(409);
    const { ferramentas, coletor } = montarParaTeste("admin");

    expect(
      await chamar(ferramentas, "instalar_modelo_de_followup", {
        model_id: "clinica-consulta-retomada",
      }),
    ).toEqual({ ok: false, motivo: "ja_existe" });
    expect(coletor.acoes).toEqual([]);
  });

  it("B2. rótulo sai no idioma da sessão", async () => {
    ligarInstalacao();
    const montagem = montarParaTeste("admin", {}, { idioma: "es" });

    await chamar(montagem.ferramentas, "instalar_modelo_de_followup", {
      model_id: "clinica-consulta-retomada",
    });

    expect(cartoesDe(montagem.coletor)[0]?.rotulo).toBe("Abrir el seguimiento");
  });
});

describe("cartão de rascunho — montar_pacote_do_nicho", () => {
  afterEach(() => {
    sobreporHandlerDeListaDeAgentes(null);
    sobreporHandlersDeCriacao(null);
    sobreporHandlerDeInstalacao(null);
  });

  function ligarPacote(): void {
    const hLista: HandlerDeRota = async () => respostaJson(200, { data: [] });
    sobreporHandlerDeListaDeAgentes(hLista);
    const hProvedores: HandlerDeRota = async () => respostaJson(200, { data: PROVEDORES_OK });
    const hVazio: HandlerDeRota = async () => respostaJson(200, { data: [] });
    const hPostAgente: HandlerDeRota = async () =>
      respostaJson(201, {
        data: { agent: { id: "ag-novo", name: "Recepção da rota" }, version: { status: "draft" } },
      });
    sobreporHandlersDeCriacao({
      provedores: hProvedores,
      funis: hVazio,
      materiais: hVazio,
      agentesPost: hPostAgente,
    });
    const hPostFollowup: HandlerDeRota = async (req) => {
      const corpo = (await req.json()) as { model_id: string };
      return respostaJson(201, {
        data: { id: `ptr-${corpo.model_id}`, name: `Da rota ${corpo.model_id}`, status: "draft" },
      });
    };
    sobreporHandlerDeInstalacao(hPostFollowup);
  }

  it("C. agente + 2 follow-ups anotam 3 cartões", async () => {
    ligarPacote();
    const { ferramentas, coletor } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean }>(ferramentas, "montar_pacote_do_nicho", {
      nicho: "clinica",
      negocio: "SENTINELA-NEGOCIO",
      descricao: "consultas",
      nome_do_agente: "SENTINELA-AGENTE",
      followups: ["clinica-consulta-retomada", "clinica-falta-remarcar"],
    });

    expect(saida.ok).toBe(true);
    expect(cartoesDe(coletor)).toEqual([
      {
        tipo: "artefato",
        artefato: "agente",
        nome: "Recepção da rota",
        rotulo: "Abrir o agente",
        href: "/app/ai/agents/ag-novo",
      },
      {
        tipo: "artefato",
        artefato: "followup",
        nome: "Da rota clinica-consulta-retomada",
        rotulo: "Abrir o follow-up",
        href: "/app/ai/followups/ptr-clinica-consulta-retomada",
      },
      {
        tipo: "artefato",
        artefato: "followup",
        nome: "Da rota clinica-falta-remarcar",
        rotulo: "Abrir o follow-up",
        href: "/app/ai/followups/ptr-clinica-falta-remarcar",
      },
    ]);
    for (const cartao of cartoesDe(coletor)) {
      expect(cartao.href).not.toContain("SENTINELA");
    }
  });

  it("B. nicho sem prompt não anota nada", async () => {
    ligarPacote();
    const { ferramentas, coletor } = montarParaTeste("admin");

    expect(
      await chamar(ferramentas, "montar_pacote_do_nicho", {
        nicho: "imobiliaria",
        negocio: "Imob Sul",
        descricao: "vendas",
        nome_do_agente: "Vendas Sul",
      }),
    ).toMatchObject({ ok: false, motivo: "nicho_sem_prompt" });
    expect(coletor.acoes).toEqual([]);
  });
});
