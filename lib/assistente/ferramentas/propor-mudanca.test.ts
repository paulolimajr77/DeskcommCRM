// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ToolSet } from "ai";

import { criarProporMudanca } from "./propor-mudanca";
import { montarParaTeste, chamar } from "./auxiliar-de-teste";

vi.mock("@/lib/assistente/portas/abrir", () => ({
  abrirPorta: vi.fn(),
}));

vi.mock("@/lib/assistente/metricas/chamar-rota", () => ({
  chamarRotaPorDentro: vi.fn(),
}));

import { abrirPorta } from "@/lib/assistente/portas/abrir";
import { chamarRotaPorDentro } from "@/lib/assistente/metricas/chamar-rota";
import { escritaPermitida } from "@/lib/assistente/portas/regras";
import { dadosDaResposta } from "@/app/api/v1/ai/assistente/propostas/route";

const mockAbrirPorta = abrirPorta as ReturnType<typeof vi.fn>;
const mockChamarRota = chamarRotaPorDentro as ReturnType<typeof vi.fn>;

describe("propor_mudanca", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAbrirPorta.mockReturnValue(null);
    mockChamarRota.mockResolvedValue({
      status: 201,
      corpo: { data: { id: "proposta-123" } },
    });
  });

  it("propor_mudanca é só para admin", () => {
    const { ferramentas: doAdmin } = montarParaTeste("admin");
    expect(doAdmin).toHaveProperty("propor_mudanca");

    for (const papel of ["manager", "viewer", "agent"] as const) {
      const { ferramentas } = montarParaTeste(papel);
      expect(ferramentas).not.toHaveProperty("propor_mudanca");
    }
  });

  it("recusa DELETE no schema", async () => {
    const { ferramentas } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "propor_mudanca", {
      porta: "contacts/:id",
      metodo: "DELETE" as unknown as "POST",
      resumo: "teste",
      motivo: "teste",
    });
    expect(saida).toEqual({ ok: false, motivo: "parametro_invalido" });
  });

  it("recusa porta fora da lista branca com porta_nao_liberada", async () => {
    const { ferramentas } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "propor_mudanca", {
      porta: "cron/routing-worker",
      metodo: "POST",
      resumo: "teste",
      motivo: "teste",
    });
    expect(saida).toEqual({ ok: false, motivo: "porta_nao_liberada" });
  });

  it("propor POST cria proposta e anota cartão", async () => {
    const { ferramentas, coletor } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "propor_mudanca", {
      porta: "ai/agents",
      metodo: "POST",
      valores: {},
      corpo: { name: "Novo agente" },
      resumo: "Criar agente de teste",
      motivo: "Precisamos de um novo agente",
    });
    expect(saida).toEqual({ ok: true, propostaId: "proposta-123" });
    expect(coletor.acoes.some((a) => a.tipo === "proposta" && a.id === "proposta-123")).toBe(true);
    expect(mockChamarRota).toHaveBeenCalled();
  });

  it("propor PATCH lê o antes e cria proposta", async () => {
    mockAbrirPorta.mockReturnValue({
      handler: async () => new Response(JSON.stringify({ data: { id: "abc", name: "Antigo" } }), { status: 200 }),
      caminho: "/api/v1/contacts/abc",
    });
    const { ferramentas, coletor } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "propor_mudanca", {
      porta: "contacts/:id",
      metodo: "PATCH",
      valores: { id: "abc" },
      corpo: { name: "Novo nome" },
      resumo: "Renomear contato",
      motivo: "O cliente mudou de nome",
    });
    expect(saida).toEqual({ ok: true, propostaId: "proposta-123" });
    expect(mockAbrirPorta).toHaveBeenCalledWith("contacts/:id", "GET", { id: "abc" });
    expect(mockChamarRota).toHaveBeenCalled();
  });

  it("resposta 201 sem data.id → falha e nenhum cartão anotado", async () => {
    mockChamarRota.mockResolvedValue({ status: 201, corpo: { data: {} } });
    const { ferramentas, coletor } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "propor_mudanca", {
      porta: "ai/agents",
      metodo: "POST",
      valores: {},
      corpo: { name: "Novo agente" },
      resumo: "Criar agente de teste",
      motivo: "Precisamos de um novo agente",
    });
    expect(saida).toEqual({ ok: false, motivo: "indisponivel" });
    expect(coletor.acoes.some((a) => a.tipo === "proposta")).toBe(false);
  });

  it("proposta repetida (200) devolve o id existente e anota cartão", async () => {
    const existente = {
      id: "proposta-existente",
      kind: "acao",
      payload: { operacao: "criar" },
      risk: "baixo",
      status: "pendente",
      resumo: "Criar agente",
      expires_at: "2026-12-31T23:59:59Z",
    };
    mockChamarRota.mockResolvedValue({
      status: 200,
      corpo: { data: dadosDaResposta(existente as never) },
    });
    const { ferramentas, coletor } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "propor_mudanca", {
      porta: "ai/agents",
      metodo: "POST",
      valores: {},
      corpo: { name: "Novo agente" },
      resumo: "Criar agente de teste",
      motivo: "Precisamos de um novo agente",
    });
    expect(saida).toEqual({ ok: true, propostaId: "proposta-existente" });
    expect(coletor.acoes.some((a) => a.tipo === "proposta" && a.id === "proposta-existente")).toBe(true);
  });

  it("entrada inválida é recusada", async () => {
    const { ferramentas } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "propor_mudanca", {
      porta: "",
      metodo: "POST",
      resumo: "x",
      motivo: "y",
    });
    expect(saida).toEqual({ ok: false, motivo: "parametro_invalido" });
  });

  it("prospecting com action start é recusada com acao_nao_liberada e não grava proposta", async () => {
    const { ferramentas, coletor } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "propor_mudanca", {
      porta: "prospecting",
      metodo: "POST",
      corpo: { action: "start" },
      resumo: "Acelerar prospecção",
      motivo: "Queremos mais empresas na fila",
    });
    expect(saida).toEqual({ ok: false, motivo: "acao_nao_liberada" });
    expect(mockChamarRota).not.toHaveBeenCalled();
    expect(coletor.acoes.some((a) => a.tipo === "proposta")).toBe(false);
  });
});
