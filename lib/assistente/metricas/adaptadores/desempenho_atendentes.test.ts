// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { metricaDesempenhoAtendentes, sobreporHandlerDeDesempenho } from "@/lib/assistente/metricas/adaptadores/desempenho_atendentes";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta, DefinicaoDeMetrica, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";

const CTX_VIEWER: ContextoDeConsulta = {
  orgId: "org-1",
  papel: "viewer",
  idioma: "pt-BR",
  fuso: "America/Sao_Paulo",
  agoraIso: "2026-10-14T09:00:00-03:00",
  bancoDosModulos: {} as ContextoDeConsulta["bancoDosModulos"],
};
const CTX_AGENT: ContextoDeConsulta = { ...CTX_VIEWER, papel: "agent" };

function handlerDe(status: number, corpo: unknown, captura?: { url?: string }) {
  const handler: HandlerDeRota = async (req) => {
    if (captura) captura.url = req.url;
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  };
  return handler;
}

function payloadSujo() {
  return {
    window: { from: "x", to: "y" },
    owner_user_id: null,
    funnel: [{ stage_id: "s1", stage_name: "Negociação", position: 1, count: 10 }],
    attendants: [
      { user_id: "u1", name: "João", email: "joao@empresa.com", won: 8, lost: 2, conversations_handled: 20, avg_first_response_seconds: 36 },
    ],
  };
}

afterEach(() => sobreporHandlerDeDesempenho(null));

describe("desempenho_atendentes — URL e fim exclusivo", () => {
  it("mapeia from=deInstante e to=ateInstanteExclusivo (fim EXCLUSIVO)", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDeDesempenho(handlerDe(200, { data: { window: {}, owner_user_id: null, funnel: [], attendants: [] } }, captura));
    await metricaDesempenhoAtendentes.executar(CTX_AGENT, {});
    expect(captura.url).toBeDefined();
    const url = new URL(captura.url ?? "");
    expect(url.searchParams.get("from")).toBe("2026-10-05T03:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-10-12T03:00:00.000Z");
  });

  it("papel mínimo é agent (viewer fica sem permissão SEM chamar a rota)", async () => {
    const handler = vi.fn(handlerDe(200, { data: payloadSujo() }));
    sobreporHandlerDeDesempenho(handler);
    const resultado = await consultarMetrica(CTX_VIEWER, "desempenho_atendentes", {});
    expect(resultado).toEqual({ ok: false, metrica: "desempenho_atendentes", motivo: "sem_permissao", papel_minimo: "agent" });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("desempenho_atendentes — corte de PII", () => {
  it("payload sujo: name, email, user_id e stage_id NÃO saem", async () => {
    sobreporHandlerDeDesempenho(handlerDe(200, { data: payloadSujo() }));
    const resultado = await metricaDesempenhoAtendentes.executar(CTX_AGENT, {});
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const texto = JSON.stringify(resultado.dados);
      for (const proibido of ["João", "@empresa.com", "user_id", "stage_id", "owner_user_id"]) {
        expect(texto).not.toContain(proibido);
      }
      const dados = resultado.dados as { attendants: { index: number }[]; funnel: unknown[] };
      expect(dados.attendants[0]).toMatchObject({ index: 1, won: 8, lost: 2, conversations_handled: 20, avg_first_response_seconds: 36 });
      expect(Object.keys(dados.attendants[0]).sort()).toEqual(["avg_first_response_seconds", "conversations_handled", "index", "lost", "won"]);
    }
  });

  it("amostra zero (sem atendentes) vira null com aviso, nunca crash", async () => {
    sobreporHandlerDeDesempenho(handlerDe(200, { data: { window: {}, owner_user_id: null, funnel: [], attendants: [] } }));
    const resultado = await metricaDesempenhoAtendentes.executar(CTX_AGENT, {});
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const dados = resultado.dados as { attendants: unknown[] };
      expect(dados.attendants).toEqual([]);
    }
  });
});
