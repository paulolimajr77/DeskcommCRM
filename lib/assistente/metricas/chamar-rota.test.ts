// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  chamarRotaPorDentro,
  traduzirResposta,
  type HandlerDeRota,
} from "@/lib/assistente/metricas/chamar-rota";
import { logger } from "@/lib/logger";

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("chamarRotaPorDentro", () => {
  it("leva a query na URL e NUNCA cookie", async () => {
    let capturado = null as Request | null;
    const handler: HandlerDeRota = async (req) => {
      capturado = req;
      return respostaJson(200, { data: {} });
    };
    const resultado = await chamarRotaPorDentro(handler, "/api/v1/reports/financeiro", {
      de: "2026-10-05",
      ate: "2026-10-11",
    });
    expect(resultado).toEqual({ status: 200, corpo: { data: {} } });
    expect(capturado).not.toBeNull();
    const url = new URL((capturado as Request).url);
    expect(url.pathname).toBe("/api/v1/reports/financeiro");
    expect(url.searchParams.get("de")).toBe("2026-10-05");
    expect(url.searchParams.get("ate")).toBe("2026-10-11");
    expect((capturado as Request).headers.get("cookie")).toBeNull();
  });

  it("exceção do handler vira { falhou }, nunca lança", async () => {
    const handler: HandlerDeRota = async () => {
      throw new Error("sessão ausente");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resultado = await chamarRotaPorDentro(handler, "/api/v1/x", {});
    expect(resultado).toEqual({ falhou: "a chamada interna à rota falhou" });
    warn.mockRestore();
  });

  it("resposta sem corpo (204) vira corpo null, sem lançar", async () => {
    const handler: HandlerDeRota = async () => new Response(null, { status: 204 });
    const resultado = await chamarRotaPorDentro(handler, "/api/v1/x", {});
    expect(resultado).toEqual({ status: 204, corpo: null });
  });

  it("A. POST com corpo: o handler recebe POST e o corpo igual", async () => {
    let metodo = "";
    let corpoRecebido: unknown = null;
    const corpoEnviado = { nome: "Clínica Teste" };
    const handler: HandlerDeRota = async (req) => {
      metodo = req.method;
      corpoRecebido = await req.json();
      return respostaJson(201, { data: { id: "1" } });
    };
    const resultado = await chamarRotaPorDentro(handler, "/api/v1/ai/agents", {}, {
      metodo: "POST",
      corpo: corpoEnviado,
    });
    expect(metodo).toBe("POST");
    expect(corpoRecebido).toEqual(corpoEnviado);
    expect(resultado).toEqual({ status: 201, corpo: { data: { id: "1" } } });
  });

  it("B. PATCH com corpo: o handler recebe PATCH e o corpo igual", async () => {
    let metodo = "";
    let corpoRecebido: unknown = null;
    const corpoEnviado = { nome: "Novo nome" };
    const handler: HandlerDeRota = async (req) => {
      metodo = req.method;
      corpoRecebido = await req.json();
      return respostaJson(200, { data: { id: "1" } });
    };
    const resultado = await chamarRotaPorDentro(handler, "/api/v1/ai/agents/1", {}, {
      metodo: "PATCH",
      corpo: corpoEnviado,
    });
    expect(metodo).toBe("PATCH");
    expect(corpoRecebido).toEqual(corpoEnviado);
    expect(resultado).toEqual({ status: 200, corpo: { data: { id: "1" } } });
  });

  it("C. sem opcoes: o handler recebe GET e body null", async () => {
    let metodo = "";
    let corpo: unknown = "nao-lido";
    const handler: HandlerDeRota = async (req) => {
      metodo = req.method;
      corpo = req.body;
      return respostaJson(200, { data: {} });
    };
    await chamarRotaPorDentro(handler, "/api/v1/x", {});
    expect(metodo).toBe("GET");
    expect(corpo).toBeNull();
  });

  it("D. GET com corpo: o corpo é ignorado", async () => {
    let metodo = "";
    let corpo: unknown = "nao-lido";
    const handler: HandlerDeRota = async (req) => {
      metodo = req.method;
      corpo = req.body;
      return respostaJson(200, { data: {} });
    };
    await chamarRotaPorDentro(handler, "/api/v1/x", {}, { metodo: "GET", corpo: { x: 1 } });
    expect(metodo).toBe("GET");
    expect(corpo).toBeNull();
  });

  it("E. handler que lança: devolve { falhou } e o logger não recebe o corpo", async () => {
    const handler: HandlerDeRota = async () => {
      throw new Error("quebrou");
    };
    const aviso = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const resultado = await chamarRotaPorDentro(handler, "/api/v1/x", {}, {
      metodo: "POST",
      corpo: { segredo: "SEGREDO-DE-TESTE" },
    });
    expect(resultado).toEqual({ falhou: "a chamada interna à rota falhou" });
    const tudo = JSON.stringify(aviso.mock.calls);
    expect(tudo).not.toContain("SEGREDO-DE-TESTE");
    aviso.mockRestore();
  });

  it("G. POST e PATCH sem corpo continuam POST e PATCH (nunca viram GET)", async () => {
    const metodos: string[] = [];
    const handler: HandlerDeRota = async (req) => {
      metodos.push(req.method);
      return respostaJson(200, { data: {} });
    };
    await chamarRotaPorDentro(handler, "/api/v1/x", {}, { metodo: "POST" });
    await chamarRotaPorDentro(handler, "/api/v1/x", {}, { metodo: "PATCH" });
    expect(metodos).toEqual(["POST", "PATCH"]);
  });

  it("F. resposta que não é JSON: corpo null com o status preservado", async () => {
    const handler: HandlerDeRota = async () => new Response("não é json", { status: 200 });
    const resultado = await chamarRotaPorDentro(handler, "/api/v1/x", {});
    expect(resultado).toEqual({ status: 200, corpo: null });
  });
});

describe("traduzirResposta — cada mapeamento", () => {
  it("2xx desembrulha o envelope e devolve só `data` (o meta não passa)", () => {
    const veredito = traduzirResposta({ status: 200, corpo: { data: { a: 1 }, meta: { total: 9 } } }, "viewer");
    expect(veredito).toEqual({ ok: true, dados: { a: 1 } });
  });

  it("401 e 403 viram sem_permissao com o papel mínimo da DEFINIÇÃO", () => {
    expect(traduzirResposta({ status: 401, corpo: null }, "manager")).toEqual({
      ok: false,
      motivo: "sem_permissao",
      papel_minimo: "manager",
    });
    expect(traduzirResposta({ status: 403, corpo: { error: { code: "forbidden_role", message: "x" } } }, "agent")).toEqual({
      ok: false,
      motivo: "sem_permissao",
      papel_minimo: "agent",
    });
  });

  it("400, 404 e 422 viram parametro_invalido com o código do catálogo", () => {
    const corpo = { error: { code: "validation_failed", message: "período inválido" } };
    for (const status of [400, 404, 422]) {
      expect(traduzirResposta({ status, corpo }, "viewer")).toEqual({
        ok: false,
        motivo: "parametro_invalido",
        detalhe: "validation_failed",
      });
    }
  });

  it("5xx e falha interna viram indisponivel", () => {
    expect(traduzirResposta({ status: 500, corpo: null }, "viewer")).toEqual({
      ok: false,
      motivo: "indisponivel",
      detalhe: "a rota respondeu erro interno",
    });
    expect(traduzirResposta({ falhou: "x" }, "viewer")).toEqual({
      ok: false,
      motivo: "indisponivel",
      detalhe: "a chamada interna à rota falhou",
    });
  });
});
