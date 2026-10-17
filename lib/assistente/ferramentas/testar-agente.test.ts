/**
 * `testar_agente`: roda o botão "Testar" num agente em RASCUNHO — manda as
 * mensagens de exemplo, o agente responde de verdade, sem WhatsApp e sem
 * contato real. Só testa rascunho (a de maior número); publicada nunca.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { sobreporHandlerDeTeste, sobreporHandlerDeVersoes } from "./testar-agente";

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const AGENTE = "11111111-1111-4111-8111-111111111111";
const V1 = "22222222-2222-4222-8222-222222222222";
const V2 = "33333333-3333-4333-8333-333333333333";
const V3 = "44444444-4444-4334-8333-444444444444";

function versao(id: string, numero: number, estado: string, extras: Record<string, unknown> = {}) {
  return { id, version_number: numero, status: estado, ...extras };
}

function respostaDeTeste(opcoes: {
  texto?: unknown;
  estado?: string;
  ferramentas?: unknown;
  passou?: unknown;
  simulado?: boolean;
  extras?: Record<string, unknown>;
} = {}) {
  return {
    run_id: "run-secreto",
    status: opcoes.estado ?? "ok",
    latency_ms: 123,
    final_text: opcoes.texto ?? "Olá! Posso ajudar com o agendamento.",
    tool_calls: opcoes.ferramentas ?? [],
    stub: opcoes.simulado ?? false,
    guardrails: { passou: opcoes.passou ?? true, detalhe: "SEGREDO-GUARDRAIL" },
    trace: ["SEGREDO-TRACE"],
    ...(opcoes.extras ?? {}),
  };
}

interface Captura {
  metodo: string;
  caminhos: string[];
  corpos: Record<string, unknown>[];
}

function ligar(opcoes: {
  versoes?: unknown;
  statusVersoes?: number;
  posts?: { status: number; corpo: unknown }[];
  captura?: Captura;
}): void {
  const hVersoes: HandlerDeRota = async () =>
    respostaJson(opcoes.statusVersoes ?? 200, { data: opcoes.versoes ?? [] });
  sobreporHandlerDeVersoes(hVersoes);

  let chamadas = 0;
  const hTeste: HandlerDeRota = async (req) => {
    const i = chamadas;
    chamadas += 1;
    if (opcoes.captura) {
      opcoes.captura.metodo = req.method;
      try {
        opcoes.captura.corpos.push((await req.json()) as Record<string, unknown>);
      } catch {
        opcoes.captura.corpos.push({});
      }
    }
    const post = opcoes.posts?.[i] ?? opcoes.posts?.[opcoes.posts.length - 1];
    if (!post) return respostaJson(200, { data: respostaDeTeste() });
    return respostaJson(post.status, post.corpo);
  };
  sobreporHandlerDeTeste(hTeste);
}

describe("testar_agente", () => {
  afterEach(() => {
    sobreporHandlerDeVersoes(null);
    sobreporHandlerDeTeste(null);
  });

  it("A. só há versão publicada: sem_rascunho e NENHUM POST de teste", async () => {
    const captura: Captura = { metodo: "", caminhos: [], corpos: [] };
    ligar({ versoes: [versao(V1, 1, "published")], captura });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string; detalhe: string }>(
      ferramentas,
      "testar_agente",
      { agente_id: AGENTE, mensagens: ["tem horário amanhã?"] },
    );

    expect(saida.ok).toBe(false);
    expect(saida.motivo).toBe("sem_rascunho");
    expect(saida.detalhe).toContain("PRECISO CONFIRMAR");
    expect(captura.corpos).toEqual([]);
  });

  it("A2. agente sem versão nenhuma: sem_rascunho", async () => {
    ligar({ versoes: [] });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string }>(ferramentas, "testar_agente", {
      agente_id: AGENTE,
      mensagens: ["oi"],
    });

    expect(saida).toEqual({
      ok: false,
      motivo: "sem_rascunho",
      detalhe: expect.stringContaining("PRECISO CONFIRMAR"),
    });
  });

  it("B. várias versões: testa a de MAIOR número entre as de rascunho", async () => {
    const vistos: string[] = [];
    const hVersoes: HandlerDeRota = async () =>
      respostaJson(200, {
        data: [versao(V1, 1, "published"), versao(V2, 2, "draft"), versao(V3, 3, "draft")],
      });
    sobreporHandlerDeVersoes(hVersoes);
    const hTeste: HandlerDeRota = async (req) => {
      vistos.push(req.url);
      return respostaJson(200, { data: respostaDeTeste() });
    };
    sobreporHandlerDeTeste(hTeste);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; versao: number }>(ferramentas, "testar_agente", {
      agente_id: AGENTE,
      mensagens: ["oi"],
    });

    expect(saida).toEqual({
      ok: true,
      versao: 3,
      resultados: expect.any(Array),
      resumo: expect.any(Object),
      custo: expect.any(String),
    });
    expect(vistos).toHaveLength(1);
    expect(vistos[0]).toContain(V3);
    expect(vistos[0]).not.toContain(V2);
  });

  it("C. projeção: sentinelas da rota NÃO vazam; resposta cortada em 1200", async () => {
    ligar({
      versoes: [
        versao(V2, 2, "draft", {
          system_prompt: "SEGREDO-PROMPT",
          credential_id: "cred-secreta",
          tool_ids: ["t1"],
          provider: "anthropic",
          model: "m",
        }),
      ],
      posts: [
        {
          status: 200,
          corpo: {
            data: respostaDeTeste({
              texto: `x`.repeat(2000),
              ferramentas: [
                { tool: "crm_move_lead_stage", arguments: { SEGREDO: 1 } },
                { tool: "t2", arguments: {} },
              ],
            }),
          },
        },
      ],
    });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{
      ok: boolean;
      versao: number;
      resultados: Record<string, unknown>[];
      resumo: { passaram: number; total: number };
      custo: string;
    }>(ferramentas, "testar_agente", { agente_id: AGENTE, mensagens: ["oi"] });

    expect(saida.ok).toBe(true);
    expect(saida.versao).toBe(2);
    expect(saida.resultados).toHaveLength(1);
    const unico = saida.resultados[0]!;
    expect(unico).toEqual({
      mensagem: "oi",
      estado: "ok",
      resposta: "x".repeat(1200),
      ferramentas: ["crm_move_lead_stage", "t2"],
      passou: true,
      simulado: false,
    });
    const serializada = JSON.stringify(saida);
    for (const segredo of [
      "SEGREDO-PROMPT",
      "cred-secreta",
      "run-secreto",
      "SEGREDO-TRACE",
      "SEGREDO-GUARDRAIL",
      "SEGREDO",
      "tool_ids",
      "credential_id",
      "guardrails",
    ]) {
      expect(serializada).not.toContain(segredo);
    }
    expect(saida.resumo).toEqual({ passaram: 1, total: 1 });
    expect(saida.custo).toContain("1 vez(es)");
  });

  it("D. esquema: lista vazia, 6 mensagens, vazia, 501 chars, uuid ruim e extras — sem chamar rota", async () => {
    const captura: Captura = { metodo: "", caminhos: [], corpos: [] };
    ligar({ versoes: [versao(V2, 2, "draft")], captura });
    const { ferramentas } = montarParaTeste("admin");

    const casos: unknown[] = [
      { agente_id: AGENTE, mensagens: [] },
      { agente_id: AGENTE, mensagens: ["a", "b", "c", "d", "e", "f"] },
      { agente_id: AGENTE, mensagens: [""] },
      { agente_id: AGENTE, mensagens: ["   "] },
      { agente_id: AGENTE, mensagens: ["x".repeat(501)] },
      { agente_id: "nao-uuid", mensagens: ["oi"] },
      { agente_id: AGENTE, mensagens: ["oi"], sample_contact: { name: "X" } },
      { agente_id: AGENTE, mensagens: ["oi"], versao_id: V2 },
      { agente_id: AGENTE, mensagens: ["oi"], organization_id: "x" },
    ];
    for (const entrada of casos) {
      expect(await chamar(ferramentas, "testar_agente", entrada)).toEqual({
        ok: false,
        motivo: "parametro_invalido",
      });
    }
    expect(captura.corpos).toEqual([]);
  });

  it("E. sequência: 3 POSTs em ordem; 2ª falha (500) → 1ª devolvida + indisponivel, 3ª NÃO roda", async () => {
    const vistas: string[] = [];
    const hVersoes: HandlerDeRota = async () => respostaJson(200, { data: [versao(V2, 2, "draft")] });
    sobreporHandlerDeVersoes(hVersoes);
    const hTeste: HandlerDeRota = async (req) => {
      const corpo = (await req.json()) as { sample_message: string };
      vistas.push(corpo.sample_message);
      if (vistas.length === 2) return respostaJson(500, { error: { code: "x" } });
      return respostaJson(200, { data: respostaDeTeste({ texto: `eco: ${corpo.sample_message}` }) });
    };
    sobreporHandlerDeTeste(hTeste);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{
      ok: boolean;
      motivo: string;
      versao: number;
      resultados: { mensagem: string; resposta: string }[];
      resumo: { passaram: number; total: number };
    }>(ferramentas, "testar_agente", { agente_id: AGENTE, mensagens: ["um", "dois", "três"] });

    expect(saida.ok).toBe(false);
    expect(saida.motivo).toBe("indisponivel");
    expect(saida.versao).toBe(2);
    expect(vistas).toEqual(["um", "dois"]);
    expect(saida.resultados.map((r) => r.mensagem)).toEqual(["um"]);
    expect(saida.resultados[0]?.resposta).toBe("eco: um");
    expect(saida.resumo).toEqual({ passaram: 1, total: 1 });
  });

  it("F. stub:true → simulado:true com aviso; blocked → bloqueado; passou:false", async () => {
    ligar({
      versoes: [versao(V2, 2, "draft")],
      posts: [
        {
          status: 200,
          corpo: {
            data: respostaDeTeste({ estado: "blocked", passou: false, simulado: true }),
          },
        },
      ],
    });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; resultados: Record<string, unknown>[] }>(
      ferramentas,
      "testar_agente",
      { agente_id: AGENTE, mensagens: ["oi"] },
    );

    expect(saida.ok).toBe(true);
    expect(saida.resultados[0]).toMatchObject({
      estado: "bloqueado",
      passou: false,
      simulado: true,
    });
    expect(typeof saida.resultados[0]?.aviso).toBe("string");
    expect(String(saida.resultados[0]?.aviso)).toContain("mentira");
  });

  it("G. erros: 403/404 → sem_permissao_ou_nao_existe; 422 → pedido_invalido; 500 → indisponivel", async () => {
    const { ferramentas } = montarParaTeste("admin");

    ligar({ statusVersoes: 403, versoes: [] });
    expect(
      await chamar(ferramentas, "testar_agente", { agente_id: AGENTE, mensagens: ["oi"] }),
    ).toEqual({ ok: false, motivo: "sem_permissao_ou_nao_existe" });

    ligar({ statusVersoes: 404, versoes: [] });
    expect(
      await chamar(ferramentas, "testar_agente", { agente_id: AGENTE, mensagens: ["oi"] }),
    ).toEqual({ ok: false, motivo: "sem_permissao_ou_nao_existe" });

    ligar({
      versoes: [versao(V2, 2, "draft")],
      posts: [{ status: 422, corpo: { error: { code: "validation_failed" } } }],
    });
    expect(
      await chamar(ferramentas, "testar_agente", { agente_id: AGENTE, mensagens: ["oi"] }),
    ).toEqual({ ok: false, motivo: "pedido_invalido" });

    ligar({
      versoes: [versao(V2, 2, "draft")],
      posts: [{ status: 500, corpo: { error: { code: "x", message: "SEGREDO-CORPO" } } }],
    });
    const saida500 = await chamar(ferramentas, "testar_agente", {
      agente_id: AGENTE,
      mensagens: ["oi"],
    });
    expect(saida500).toEqual({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(saida500)).not.toContain("SEGREDO-CORPO");
  });
});
