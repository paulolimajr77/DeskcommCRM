// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  chamarRotaPorDentro,
  traduzirResposta,
  type HandlerDeRota,
} from "@/lib/assistente/metricas/chamar-rota";

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("chamarRotaPorDentro", () => {
  it("leva a query na URL e NUNCA cookie", async () => {
    let capturado: Request | null = null;
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
