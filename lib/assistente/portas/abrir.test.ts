// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

import { NextRequest } from "next/server";
import { abrirPorta, type HandlerComParams } from "@/lib/assistente/portas/abrir";

vi.mock("@/lib/assistente/portas/catalogo.gerado", () => ({
  CARREGADORES: {
    "ai/agents/:id": vi.fn(async () => ({
      GET: async () => new Response(JSON.stringify({ data: { id: "abc" } }), { status: 200 }),
    })),
  },
  CARREGADORES_DE_ESCRITA: {
    messages: vi.fn(async () => ({
      POST: async () => new Response(JSON.stringify({ data: {} }), { status: 201 }),
    })),
    "agenda/agendamentos": vi.fn(async () => ({
      POST: async () => new Response(JSON.stringify({ data: {} }), { status: 201 }),
      PATCH: async () => new Response(JSON.stringify({ data: {} }), { status: 200 }),
    })),
    "contatos/:id/:idItem": vi.fn(async () => ({
      PATCH: async () => new Response(JSON.stringify({ data: {} }), { status: 200 }),
    })),
  },
}));

vi.mock("@/lib/assistente/portas/regras", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/assistente/portas/regras")>();
  return {
    ...actual,
    escritaPermitida: vi.fn(() => false),
    portaDeLeituraPermitida: vi.fn(() => true),
  };
});

import { escritaPermitida, portaDeLeituraPermitida } from "@/lib/assistente/portas/regras";

const mockEscritaPermitida = escritaPermitida as ReturnType<typeof vi.fn>;
const mockPortaDeLeituraPermitida = portaDeLeituraPermitida as ReturnType<typeof vi.fn>;

describe("abrirPorta", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPortaDeLeituraPermitida.mockReturnValue(true);
    mockEscritaPermitida.mockReturnValue(false);
  });

  it("GET com parametro: devolve caminho e handler recebe params.id", async () => {
    const resultado = await abrirPorta("ai/agents/:id", "GET", { id: "abc" });
    expect(resultado).not.toBeNull();
    expect(resultado!.caminho).toBe("/api/v1/ai/agents/abc");

    const handler = resultado!.handler;
    const resposta = await (handler as unknown as HandlerComParams)(
      new NextRequest("http://interno.invalid/api/v1/ai/agents/abc", { method: "GET" }),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(resposta.status).toBe(200);
  });

  it("valor com barra devolve null", async () => {
    expect(await abrirPorta("ai/agents/:id", "GET", { id: "a/b" })).toBeNull();
  });

  it("valor com ponto-ponto devolve null", async () => {
    expect(await abrirPorta("ai/agents/:id", "GET", { id: ".." })).toBeNull();
  });

  it("valor com espaco devolve null", async () => {
    expect(await abrirPorta("ai/agents/:id", "GET", { id: "a b" })).toBeNull();
  });

  it("valor vazio devolve null", async () => {
    expect(await abrirPorta("ai/agents/:id", "GET", { id: "" })).toBeNull();
  });

  it("valor com 65 caracteres devolve null", async () => {
    expect(await abrirPorta("ai/agents/:id", "GET", { id: "a".repeat(65) })).toBeNull();
  });

  it("valor com 64 caracteres valido nao devolve null", async () => {
    const valido = "a".repeat(64);
    expect(await abrirPorta("ai/agents/:id", "GET", { id: valido })).not.toBeNull();
  });

  it("valor faltando devolve null", async () => {
    expect(await abrirPorta("ai/agents/:id", "GET", {})).toBeNull();
  });

  it("valor sobrando devolve null", async () => {
    expect(await abrirPorta("ai/agents/:id", "GET", { id: "abc", extra: "x" })).toBeNull();
  });

  it("porta fora do catalogo devolve null", async () => {
    expect(await abrirPorta("inexistente/:id", "GET", { id: "abc" })).toBeNull();
  });

  it("porta proibida devolve null", async () => {
    mockPortaDeLeituraPermitida.mockReturnValue(false);
    expect(await abrirPorta("cron/agenda-expira-pendentes", "GET", {})).toBeNull();
  });

  it("POST em porta fora da lista branca devolve null", async () => {
    mockEscritaPermitida.mockReturnValue(false);
    expect(await abrirPorta("messages", "POST", {})).toBeNull();
  });

  it("mesma porta com POST e PATCH: abre ambos os métodos", async () => {
    mockEscritaPermitida.mockReturnValue(true);
    const resultadoPost = await abrirPorta("agenda/agendamentos", "POST", {});
    expect(resultadoPost).not.toBeNull();
    expect(resultadoPost!.caminho).toBe("/api/v1/agenda/agendamentos");

    const resultadoPatch = await abrirPorta("agenda/agendamentos", "PATCH", {});
    expect(resultadoPatch).not.toBeNull();
    expect(resultadoPatch!.caminho).toBe("/api/v1/agenda/agendamentos");
  });

  it("dois parametros :id e :idItem: monta o caminho segmento a segmento", async () => {
    mockEscritaPermitida.mockReturnValue(true);
    const resultado = await abrirPorta("contatos/:id/:idItem", "PATCH", {
      id: "abc",
      idItem: "xyz",
    });
    expect(resultado).not.toBeNull();
    expect(resultado!.caminho).toBe("/api/v1/contatos/abc/xyz");
  });

  it(":id nao case dentro de :idX", async () => {
    mockEscritaPermitida.mockReturnValue(true);
    const resultado = await abrirPorta("contatos/:id/:idItem", "PATCH", {
      id: "abc",
      idItem: "xyz",
    });
    expect(resultado!.caminho).not.toContain(":idX");
    expect(resultado!.caminho).toBe("/api/v1/contatos/abc/xyz");
  });

  it("DELETE nao compila", async () => {
    // @ts-expect-error - DELETE nao e um metodo de abertura valido
    await abrirPorta("ai/agents", "DELETE", {});
  });
});
