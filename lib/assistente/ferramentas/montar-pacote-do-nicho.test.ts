/**
 * `montar_pacote_do_nicho`: numa pedida, cria o agente do nicho como RASCUNHO
 * (prompt do nicho preenchido) e instala os follow-ups de modelo escolhidos,
 * também como rascunho. Nada publica, nada liga, nada de funil novo.
 *
 * Checagens 1–4 antes de qualquer POST; falha de follow-up vai para `falta`
 * sem desfazer o agente.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import { nichoPorId, preencherEsqueleto } from "@/lib/assistente/nichos";
import type { NichoDoAssistente } from "@/lib/assistente/nichos";
import { catalogoComHandler } from "@/lib/ai/agents/capacidades-padrao";
import { ligarPacote } from "@/lib/mcp/tools/selecao-por-pacote";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { sobreporHandlersDeCriacao } from "./criar-rascunho-de-agente";
import { sobreporHandlerDeInstalacao } from "./instalar-modelo-de-followup";
import { montarPacoteDoNicho, sobreporHandlerDeListaDeAgentes } from "./montar-pacote-do-nicho";

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

interface CorpoCapturado {
  metodo: string;
  corpos: Record<string, unknown>[];
}

function ligar(opcoes: {
  agentes?: unknown;
  statusAgentes?: number;
  provedores?: unknown;
  corpoPostAgente?: unknown;
  statusPostAgente?: number;
  capturaAgente?: CorpoCapturado;
  corpoPostFollowup?: (modelId: string) => unknown;
  statusPostFollowup?: number;
  capturaFollowup?: CorpoCapturado;
}): void {
  const hLista: HandlerDeRota = async () =>
    respostaJson(opcoes.statusAgentes ?? 200, { data: opcoes.agentes ?? [] });
  sobreporHandlerDeListaDeAgentes(hLista);

  const hProvedores: HandlerDeRota = async () =>
    respostaJson(200, { data: opcoes.provedores ?? PROVEDORES_OK });
  const hFunis: HandlerDeRota = async () => respostaJson(200, { data: [] });
  const hMateriais: HandlerDeRota = async () => respostaJson(200, { data: [] });
  const hPostAgente: HandlerDeRota = async (req) => {
    if (opcoes.capturaAgente) {
      opcoes.capturaAgente.metodo = req.method;
      try {
        opcoes.capturaAgente.corpos.push((await req.json()) as Record<string, unknown>);
      } catch {
        opcoes.capturaAgente.corpos.push({});
      }
    }
    return respostaJson(opcoes.statusPostAgente ?? 201, {
      data:
        opcoes.corpoPostAgente ?? {
          agent: { id: "ag-novo", name: "Recepção Aurora" },
          version: { id: "v1", status: "draft" },
        },
    });
  };
  sobreporHandlersDeCriacao({
    provedores: hProvedores,
    funis: hFunis,
    materiais: hMateriais,
    agentesPost: hPostAgente,
  });

  const hPostFollowup: HandlerDeRota = async (req) => {
    let corpo: Record<string, unknown> = {};
    try {
      corpo = (await req.json()) as Record<string, unknown>;
    } catch {
      corpo = {};
    }
    if (opcoes.capturaFollowup) {
      opcoes.capturaFollowup.metodo = req.method;
      opcoes.capturaFollowup.corpos.push(corpo);
    }
    return respostaJson(opcoes.statusPostFollowup ?? 201, {
      data: opcoes.corpoPostFollowup
        ? opcoes.corpoPostFollowup(typeof corpo.model_id === "string" ? corpo.model_id : "")
        : { id: `ptr-${corpo.model_id}`, name: `Instalado ${corpo.model_id}`, status: "draft" },
    });
  };
  sobreporHandlerDeInstalacao(hPostFollowup);
}

const ENTRADA_CLINICA = {
  nicho: "clinica",
  negocio: "Clínica Aurora",
  descricao: "consultas e exames com acolhimento",
  nome_do_agente: "Recepção Aurora",
} as const;

describe("montar_pacote_do_nicho", () => {
  afterEach(() => {
    sobreporHandlerDeListaDeAgentes(null);
    sobreporHandlersDeCriacao(null);
    sobreporHandlerDeInstalacao(null);
  });

  it("A. clínica feliz: system_prompt preenchido, tool_ids do pacote, sem organization_id", async () => {
    const capturaAgente: CorpoCapturado = { metodo: "", corpos: [] };
    const capturaFollowup: CorpoCapturado = { metodo: "", corpos: [] };
    ligar({ capturaAgente, capturaFollowup });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{
      ok: boolean;
      criado: { agente: { id: string; nome: string; estado: string }; followups: unknown[] };
      falta: string[];
    }>(ferramentas, "montar_pacote_do_nicho", { ...ENTRADA_CLINICA });

    expect(capturaAgente.metodo).toBe("POST");
    const versao = capturaAgente.corpos[0]?.version as Record<string, unknown>;
    const nicho = nichoPorId("clinica");
    const preenchido = preencherEsqueleto(nicho?.esqueleto ?? "", {
      "clínica": ENTRADA_CLINICA.negocio,
      "especialidades, em uma frase": ENTRADA_CLINICA.descricao,
      nome: ENTRADA_CLINICA.nome_do_agente,
    });
    expect(preenchido.ok).toBe(true);
    if (preenchido.ok) expect(versao.system_prompt).toBe(preenchido.texto);
    expect(versao.system_prompt).not.toContain("{");
    expect(versao.system_prompt).toContain("Clínica Aurora");
    expect(versao.system_prompt).toContain("Recepção Aurora");
    expect(versao.tool_ids).toEqual(ligarPacote([], catalogoComHandler(), "vender"));
    expect(JSON.stringify(capturaAgente.corpos[0])).not.toContain("organization_id");

    expect(saida.ok).toBe(true);
    expect(saida.criado.agente).toEqual({ id: "ag-novo", nome: "Recepção Aurora", estado: "rascunho" });
    expect(saida.falta.some((f) => f.includes("Agendamentos"))).toBe(true);
    expect(saida.falta.some((f) => f.includes("convênios aceitos"))).toBe(true);
    expect(saida.falta.some((f) => f.includes("tem horário essa semana?"))).toBe(true);
    expect(saida.falta.some((f) => f.includes("publicar"))).toBe(true);
    expect(saida.falta.some((f) => f.includes("PRECISO CONFIRMAR"))).toBe(true);
  });

  it.each(["imobiliaria", "servicos", "infoproduto", "loja", "generico", "advocacia"] as const)(
    "D. %s: cria o agente em rascunho com o prompt do nicho preenchido e o pacote vender",
    async (nicho) => {
      const capturaAgente: CorpoCapturado = { metodo: "", corpos: [] };
      ligar({ capturaAgente });
      const { ferramentas } = montarParaTeste("admin");

      const saida = await chamar<{ ok: boolean; criado: { agente: { estado: string } }; falta: string[] }>(
        ferramentas,
        "montar_pacote_do_nicho",
        { nicho, negocio: "Negócio Teste", descricao: "faz coisas boas", nome_do_agente: "Atendente Teste" },
      );

      expect(saida.ok).toBe(true);
      expect(saida.criado.agente.estado).toBe("rascunho");
      expect(capturaAgente.corpos).toHaveLength(1);
      const versao = capturaAgente.corpos[0]?.version as { system_prompt: string; tool_ids: string[] };
      expect(versao.system_prompt).toContain("Negócio Teste");
      expect(versao.system_prompt).toContain("faz coisas boas");
      expect(versao.system_prompt).toContain("Atendente Teste");
      // Nenhum marcador ficou sem preencher: o texto que vai ao banco não tem chave.
      expect(versao.system_prompt).not.toMatch(/[{}]/);
      expect(versao.tool_ids.length).toBeGreaterThan(0);
      expect(saida.falta.some((f) => f.includes("publicar"))).toBe(true);
    },
  );

  it("B. nicho sem prompt: nicho_sem_prompt e NENHUM POST", async () => {
    const capturaAgente: CorpoCapturado = { metodo: "", corpos: [] };
    const capturaFollowup: CorpoCapturado = { metodo: "", corpos: [] };
    ligar({ capturaAgente, capturaFollowup });
    const sem = { ...nichoPorId("imobiliaria")!, esqueleto: null, campos: [] } as NichoDoAssistente;
    const saida = await montarPacoteDoNicho({
      nicho: sem,
      negocio: "Imob Sul",
      descricao: "venda e locação",
      nomeDoAgente: "Vendas Sul",
      followups: [],
    });

    if (saida.ok) throw new Error("devia recusar");
    expect(saida.motivo).toBe("nicho_sem_prompt");
    expect(saida.detalhe).toContain("PRECISO CONFIRMAR");
    expect(capturaAgente.corpos).toEqual([]);
    expect(capturaFollowup.corpos).toEqual([]);
  });

  it("C. marcador fora do mapeamento: falta_dado, sem POST", async () => {
    const capturaAgente: CorpoCapturado = { metodo: "", corpos: [] };
    ligar({ capturaAgente });
    const clinica = nichoPorId("clinica");
    const falso: NichoDoAssistente = {
      ...clinica!,
      esqueleto: `Olá {nome}, bem-vindo à {cidade}.`,
    };

    const saida = await montarPacoteDoNicho({
      nicho: falso,
      negocio: "Clínica Aurora",
      descricao: "consultas",
      nomeDoAgente: "Recepção Aurora",
      followups: [],
    });

    expect(saida).toEqual({
      ok: false,
      motivo: "falta_dado",
      faltam: ["cidade"],
      detalhe: expect.stringContaining("PRECISO CONFIRMAR"),
    });
    expect(capturaAgente.corpos).toEqual([]);
  });

  it("D. nome duplicado: ja_existe, sem POST", async () => {
    const capturaAgente: CorpoCapturado = { metodo: "", corpos: [] };
    const capturaFollowup: CorpoCapturado = { metodo: "", corpos: [] };
    ligar({
      agentes: [{ id: "ag-velho", name: "Recepção Aurora" }],
      capturaAgente,
      capturaFollowup,
    });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string }>(ferramentas, "montar_pacote_do_nicho", {
      ...ENTRADA_CLINICA,
    });

    expect(saida).toEqual({ ok: false, motivo: "ja_existe" });
    expect(capturaAgente.corpos).toEqual([]);
    expect(capturaFollowup.corpos).toEqual([]);
  });

  it("E. follow-up de outro nicho: followup_de_outro_nicho, sem POST", async () => {
    const capturaAgente: CorpoCapturado = { metodo: "", corpos: [] };
    const capturaFollowup: CorpoCapturado = { metodo: "", corpos: [] };
    ligar({ capturaAgente, capturaFollowup });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string }>(ferramentas, "montar_pacote_do_nicho", {
      nicho: "advocacia",
      negocio: "Escritório Prado",
      descricao: "direito trabalhista",
      nome_do_agente: "Triagem Prado",
      followups: ["clinica-consulta-retomada"],
    });

    expect(saida).toEqual({ ok: false, motivo: "followup_de_outro_nicho" });
    expect(capturaAgente.corpos).toEqual([]);
    expect(capturaFollowup.corpos).toEqual([]);
  });

  it("F. os 4 da clínica: 2 sem etapa instalam (2 POSTs), 2 com etapa vão para falta", async () => {
    const capturaAgente: CorpoCapturado = { metodo: "", corpos: [] };
    const capturaFollowup: CorpoCapturado = { metodo: "", corpos: [] };
    ligar({ capturaAgente, capturaFollowup });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; criado: { followups: { id: string }[] }; falta: string[] }>(
      ferramentas,
      "montar_pacote_do_nicho",
      {
        ...ENTRADA_CLINICA,
        followups: [
          "clinica-consulta-retomada",
          "clinica-exame-marcar",
          "clinica-cirurgia-decisao",
          "clinica-falta-remarcar",
        ],
      },
    );

    expect(saida.ok).toBe(true);
    expect(capturaFollowup.metodo).toBe("POST");
    expect(capturaFollowup.corpos).toHaveLength(2);
    expect(capturaFollowup.corpos.map((c) => c.model_id).sort()).toEqual([
      "clinica-consulta-retomada",
      "clinica-falta-remarcar",
    ]);
    expect(saida.criado.followups).toHaveLength(2);
    expect(saida.falta.some((f) => f.includes("clinica-exame-marcar"))).toBe(true);
    expect(saida.falta.some((f) => f.includes("clinica-cirurgia-decisao"))).toBe(true);
  });

  it("F2. follow-up que dá 500 não desfaz o agente: ok:true e falta cita a falha", async () => {
    const capturaAgente: CorpoCapturado = { metodo: "", corpos: [] };
    ligar({
      capturaAgente,
      statusPostFollowup: 500,
      corpoPostFollowup: () => ({ error: { code: "x" } }),
    });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; criado: { agente: unknown; followups: unknown[] }; falta: string[] }>(
      ferramentas,
      "montar_pacote_do_nicho",
      { ...ENTRADA_CLINICA, followups: ["clinica-consulta-retomada"] },
    );

    expect(saida.ok).toBe(true);
    expect(saida.criado.agente).toBeDefined();
    expect(saida.criado.followups).toEqual([]);
    expect(saida.falta.some((f) => f.includes("clinica-consulta-retomada"))).toBe(true);
  });

  it("G. agente falha (POST 500): o motivo da função, sem POST de follow-up", async () => {
    const capturaFollowup: CorpoCapturado = { metodo: "", corpos: [] };
    ligar({ statusPostAgente: 500, capturaFollowup });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string }>(ferramentas, "montar_pacote_do_nicho", {
      ...ENTRADA_CLINICA,
      followups: ["clinica-consulta-retomada"],
    });

    expect(saida).toEqual({ ok: false, motivo: "indisponivel" });
    expect(capturaFollowup.corpos).toEqual([]);
  });

  it("G2. sem credencial: sem_credencial, sem POST de follow-up", async () => {
    const capturaFollowup: CorpoCapturado = { metodo: "", corpos: [] };
    ligar({
      provedores: { padrao: { provider: "anthropic", defaultModel: "x" }, credenciais: [] },
      capturaFollowup,
    });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string }>(ferramentas, "montar_pacote_do_nicho", {
      ...ENTRADA_CLINICA,
      followups: ["clinica-consulta-retomada"],
    });

    expect(saida.motivo).toBe("sem_credencial");
    expect(capturaFollowup.corpos).toEqual([]);
  });
});
