/**
 * `montar_followup_de_nicho`: os toques informados passam por `montarEscada`
 * (o grafo é válido por construção, o modelo nunca escreve JSON de grafo) e o
 * follow-up nasce RASCUNHO por `POST ai/followup-flows` + `PATCH …/[id]`.
 * Nunca publica, nunca liga a agente; só `admin`.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { montarEscada } from "@/lib/followup/modelos/escada";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";

import { chamar, montarParaTeste, ORG, OUTRA_ORG } from "./auxiliar-de-teste";
import { sobreporHandlersDeFollowupDeNicho } from "./montar-followup-de-nicho";

const ETAPA = "33333333-3333-4333-8333-333333333333";

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

interface Chamada {
  metodo: string;
  caminho: string;
  corpo: Record<string, unknown> | null;
}

function ligar(opcoes: {
  statusPost?: number;
  linhaPost?: Record<string, unknown>;
  statusPatch?: number;
  linhaPatch?: Record<string, unknown>;
  chamadas?: Chamada[];
}): Chamada[] {
  const chamadas = opcoes.chamadas ?? [];
  const registrar = async (req: Request): Promise<Chamada> => {
    let corpo: Record<string, unknown> | null = null;
    try {
      corpo = (await req.json()) as Record<string, unknown>;
    } catch {
      corpo = null;
    }
    const chamada = { metodo: req.method, caminho: new URL(req.url).pathname, corpo };
    chamadas.push(chamada);
    return chamada;
  };
  const criar: HandlerDeRota = async (req) => {
    await registrar(req);
    return json(opcoes.statusPost ?? 201, {
      data: opcoes.linhaPost ?? { id: "ptr-1", name: "Cobrança de orçamento", status: "draft" },
    });
  };
  const atualizar: HandlerDeRota = async (req) => {
    await registrar(req);
    return json(opcoes.statusPatch ?? 200, {
      data: opcoes.linhaPatch ?? { id: "ptr-1", name: "Cobrança de orçamento", status: "draft" },
    });
  };
  sobreporHandlersDeFollowupDeNicho({ criar, atualizar });
  return chamadas;
}

const TOQUES = [
  { rotulo: "Pergunta se ficou dúvida", texto: "Oi! Ficou alguma dúvida sobre o orçamento que enviamos?" },
  { rotulo: "Última tentativa", texto: "Vou deixar o orçamento por aqui. Se quiser retomar, é só responder.", espera_horas: 72 },
];

const ENTRADA = { nicho: "servicos", nome: "Cobrança de orçamento", toques: TOQUES, silencio_horas: 24 } as const;

describe("montar_followup_de_nicho", () => {
  afterEach(() => {
    sobreporHandlersDeFollowupDeNicho(null);
  });

  it("feliz: POST só com o nome, PATCH com o grafo da escada, gatilho de silêncio e handoff pause", async () => {
    const chamadas = ligar({});
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "montar_followup_de_nicho", { ...ENTRADA });

    expect(saida).toMatchObject({
      ok: true,
      followup: { id: "ptr-1", nome: "Cobrança de orçamento", estado: "rascunho" },
      gatilho: "silencio",
      toques: 2,
    });
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual([
      "POST /api/v1/ai/followup-flows",
      "PATCH /api/v1/ai/followup-flows/ptr-1",
    ]);
    expect(chamadas[0]?.corpo).toEqual({ name: "Cobrança de orçamento" });
    expect(chamadas[1]?.corpo).toMatchObject({
      trigger_config: { kind: "silence", params: { threshold_minutes: 1440 }, cancel_on_reply: true },
      handoff_policy: "pause",
    });
    for (const chamada of chamadas) {
      expect(JSON.stringify(chamada.corpo)).not.toContain("organization_id");
    }
  });

  it("o grafo gravado é EXATAMENTE o de montarEscada e passa pelo validador de publicação", async () => {
    // Sabotagem: gravar um grafo escrito à mão (ou sem passar por montarEscada) → este teste fica vermelho.
    const chamadas = ligar({});
    const { ferramentas } = montarParaTeste("admin");

    await chamar(ferramentas, "montar_followup_de_nicho", { ...ENTRADA });

    const esperado = montarEscada({
      prazoDeRespostaMs: 2 * 86_400_000,
      sim: { rotulo: "Quer seguir", padrao: "quero" },
      notaDeResposta: "O cliente respondeu — quem segue a conversa é o atendimento.",
      toques: [
        { rotulo: TOQUES[0]!.rotulo, texto: TOQUES[0]!.texto },
        { rotulo: TOQUES[1]!.rotulo, texto: TOQUES[1]!.texto, esperaAntesMs: 72 * 3_600_000 },
      ],
    });
    const gravado = chamadas[1]?.corpo?.draft_graph;
    expect(gravado).toEqual(esperado);
    const parseado = flowGraphSchema.safeParse(gravado);
    expect(parseado.success).toBe(true);
    if (parseado.success) expect(validateFlowForPublish(parseado.data).ok).toBe(true);
  });

  it("com etapa: confere a etapa NA ORGANIZAÇÃO da sessão e arma o gatilho de etapa", async () => {
    const chamadas = ligar({});
    const { ferramentas, sessao } = montarParaTeste("admin", {
      crm_stages: [{ id: ETAPA, organization_id: ORG, is_archived: false }],
    });

    const saida = await chamar(ferramentas, "montar_followup_de_nicho", {
      nicho: "loja",
      nome: "Pagamento pendente",
      toques: [{ rotulo: "Lembrete", texto: "Oi! O pagamento do seu pedido ainda está pendente.", espera_horas: 2 }],
      etapa_id: ETAPA,
    });

    expect(saida).toMatchObject({ ok: true, gatilho: "etapa" });
    expect(chamadas[1]?.corpo?.trigger_config).toEqual({
      kind: "stage_change",
      params: { stage_id: ETAPA },
      cancel_on_reply: true,
    });
    expect(sessao.consultas[0]?.tabela).toBe("crm_stages");
    expect(sessao.consultas[0]?.filtros).toContainEqual(["organization_id", ORG]);
  });

  it("etapa de OUTRA organização ou arquivada: etapa_inexistente, e nada é criado", async () => {
    const chamadas = ligar({});
    const { ferramentas } = montarParaTeste("admin", {
      crm_stages: [
        { id: ETAPA, organization_id: OUTRA_ORG, is_archived: false },
        { id: "44444444-4444-4444-8444-444444444444", organization_id: ORG, is_archived: true },
      ],
    });

    for (const etapa of [ETAPA, "44444444-4444-4444-8444-444444444444"]) {
      const saida = await chamar<{ ok: boolean; motivo: string; detalhe: string }>(
        ferramentas,
        "montar_followup_de_nicho",
        { nicho: "loja", nome: "X", toques: [{ rotulo: "A", texto: "Oi!" }], etapa_id: etapa },
      );
      expect(saida.motivo).toBe("etapa_inexistente");
      expect(saida.detalhe).toContain("PRECISO CONFIRMAR");
    }
    expect(chamadas).toEqual([]);
  });

  it("sem gatilho nenhum: o follow-up fica manual", async () => {
    const chamadas = ligar({});
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "montar_followup_de_nicho", {
      nicho: "infoproduto",
      nome: "Fim de turma",
      toques: [{ rotulo: "Aviso", texto: "As matrículas da turma encerram em breve." }],
    });

    expect(saida).toMatchObject({ ok: true, gatilho: "manual" });
    expect(chamadas[1]?.corpo?.trigger_config).toEqual({ kind: "manual", cancel_on_reply: true });
  });

  it("texto com chaves {produto}: recusa ANTES de qualquer chamada (o modo texto não preenche marcador)", async () => {
    const chamadas = ligar({});
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string; detalhe: string }>(
      ferramentas,
      "montar_followup_de_nicho",
      {
        nicho: "loja",
        nome: "Dúvida",
        toques: [{ rotulo: "Dúvida", texto: "Ficou alguma dúvida sobre o {produto}?" }],
        silencio_horas: 24,
      },
    );

    expect(saida.motivo).toBe("texto_com_marcador");
    expect(saida.detalhe).toContain("PRECISO CONFIRMAR");
    expect(chamadas).toEqual([]);
  });

  it("do segundo toque em diante a espera é obrigatória", async () => {
    const chamadas = ligar({});
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "montar_followup_de_nicho", {
      ...ENTRADA,
      toques: [TOQUES[0], { rotulo: "Segundo", texto: "Passando de novo." }],
    });

    expect(saida).toMatchObject({ ok: false, motivo: "falta_espera" });
    expect(chamadas).toEqual([]);
  });

  it("silêncio E etapa ao mesmo tempo: gatilho_invalido, sem chamada", async () => {
    const chamadas = ligar({});
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "montar_followup_de_nicho", { ...ENTRADA, etapa_id: ETAPA });

    expect(saida).toMatchObject({ ok: false, motivo: "gatilho_invalido" });
    expect(chamadas).toEqual([]);
  });

  it("nome repetido (409): ja_existe, e o PATCH não é chamado", async () => {
    const chamadas = ligar({ statusPost: 409 });
    const { ferramentas } = montarParaTeste("admin");

    expect(await chamar(ferramentas, "montar_followup_de_nicho", { ...ENTRADA })).toEqual({
      ok: false,
      motivo: "ja_existe",
    });
    expect(chamadas).toHaveLength(1);
  });

  it("PATCH falha depois do POST: grafo_nao_gravado, diz o nome do rascunho vazio e não vaza o corpo", async () => {
    ligar({ statusPatch: 500, linhaPatch: { error: "SEGREDO-CORPO" } });
    const { ferramentas, coletor } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string; detalhe: string }>(
      ferramentas,
      "montar_followup_de_nicho",
      { ...ENTRADA },
    );

    expect(saida.motivo).toBe("grafo_nao_gravado");
    expect(saida.detalhe).toContain("Cobrança de orçamento");
    expect(JSON.stringify(saida)).not.toContain("SEGREDO-CORPO");
    expect(coletor.acoes).toEqual([]);
  });

  it("201 que não vem como rascunho, ou PATCH que devolve outro estado: nada é dado como criado", async () => {
    const { ferramentas, coletor } = montarParaTeste("admin");

    const chamadas = ligar({ linhaPost: { id: "ptr-1", name: "X", status: "active" } });
    expect(await chamar(ferramentas, "montar_followup_de_nicho", { ...ENTRADA })).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
    expect(chamadas).toHaveLength(1);

    ligar({ linhaPatch: { id: "ptr-1", name: "X", status: "active" } });
    expect(await chamar(ferramentas, "montar_followup_de_nicho", { ...ENTRADA })).toMatchObject({
      ok: false,
      motivo: "grafo_nao_gravado",
    });
    expect(coletor.acoes).toEqual([]);
  });

  it("NUNCA publica nem liga a agente: só POST de criação e PATCH do rascunho", async () => {
    // Sabotagem: chamar `…/publish` (ou qualquer outra rota) depois do PATCH → esta lista deixa de bater.
    const chamadas = ligar({});
    const { ferramentas } = montarParaTeste("admin");

    await chamar(ferramentas, "montar_followup_de_nicho", { ...ENTRADA });

    expect(chamadas.map((c) => c.metodo)).toEqual(["POST", "PATCH"]);
    expect(chamadas.some((c) => /publish|agents/.test(c.caminho))).toBe(false);
    expect(chamadas[1]?.corpo).not.toHaveProperty("status");
    expect(chamadas[1]?.corpo).not.toHaveProperty("active_version_id");
  });

  it("anota o cartão 'Abrir o follow-up' com o id que a rota devolveu", async () => {
    ligar({});
    const { ferramentas, coletor } = montarParaTeste("admin");

    await chamar(ferramentas, "montar_followup_de_nicho", { ...ENTRADA });

    expect(coletor.acoes).toEqual([
      {
        tipo: "artefato",
        artefato: "followup",
        nome: "Cobrança de orçamento",
        rotulo: "Abrir o follow-up",
        href: "/app/ai/followups/ptr-1",
      },
    ]);
  });

  it("só admin tem a ferramenta — manager, agent e viewer não", () => {
    for (const papel of ["manager", "agent", "viewer"] as const) {
      const { ferramentas } = montarParaTeste(papel);
      expect(ferramentas, papel).not.toHaveProperty("montar_followup_de_nicho");
    }
    expect(montarParaTeste("admin").ferramentas).toHaveProperty("montar_followup_de_nicho");
  });

  it("entrada fora do esquema (5 toques, espera de 0 h, organização) é recusada sem chamar a rota", async () => {
    const chamadas = ligar({});
    const { ferramentas } = montarParaTeste("admin");
    const cinco = Array.from({ length: 5 }, (_, i) => ({ rotulo: `T${i}`, texto: "Oi!", espera_horas: 1 }));

    for (const entrada of [
      { ...ENTRADA, toques: cinco },
      { ...ENTRADA, toques: [{ rotulo: "A", texto: "Oi!", espera_horas: 0 }] },
      { ...ENTRADA, organization_id: OUTRA_ORG },
      { ...ENTRADA, toques: [] },
    ]) {
      expect(await chamar(ferramentas, "montar_followup_de_nicho", entrada)).toEqual({
        ok: false,
        motivo: "parametro_invalido",
      });
    }
    expect(chamadas).toEqual([]);
  });
});
