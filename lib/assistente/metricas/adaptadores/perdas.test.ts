// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { metricaPerdas, sobreporHandlerDePerdas } from "@/lib/assistente/metricas/adaptadores/perdas";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta } from "@/lib/assistente/metricas/tipos";

const CTX_MANAGER: ContextoDeConsulta = {
  orgId: "org-1",
  papel: "manager",
  idioma: "pt-BR",
  fuso: "America/Sao_Paulo",
  agoraIso: "2026-10-14T09:00:00-03:00",
  bancoDosModulos: {} as ContextoDeConsulta["bancoDosModulos"],
};
const CTX_VIEWER: ContextoDeConsulta = { ...CTX_MANAGER, papel: "viewer" };

function handlerDe(status: number, corpo: unknown, captura?: { url?: string }) {
  const handler: HandlerDeRota = async (req) => {
    if (captura) captura.url = req.url;
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  };
  return handler;
}

/** Payload com porMotivo em TEXTO LIVRE (sai cortado) + dados de perda. */
function payloadSujo() {
  return {
    porMotivo: [
      { chave: "Preço muito alto para a Sara", quantidade: 4 }, // motivo livre
    ],
    porCategoria: [{ chave: "Preço", quantidade: 4 }],
    porEtapa: [{ chave: "Oferta", quantidade: 4 }],
    porMoeda: [{ moeda: "BRL", quantidade: 4, valor_cents: 800_000 }],
    total: 10,
  };
}

afterEach(() => sobreporHandlerDePerdas(null));

describe("perdas — fim exclusivo, piso manager e corte de texto livre", () => {
  it("manda from=deInstante e to=ateInstanteExclusivo; 5xx vira indisponivel", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDePerdas(handlerDe(200, { data: payloadSujo() }, captura));
    const resultado = await metricaPerdas.executar(CTX_MANAGER, {});
    expect(resultado.ok).toBe(true);
    const url = new URL(captura.url ?? "");
    expect(url.searchParams.get("from")).toBe("2026-10-05T03:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-10-12T03:00:00.000Z");
  });

  it("viewer SEM permissão na rota de manager: sem_permissao SEM chamar a rota", async () => {
    const handler = vi.fn(handlerDe(200, { data: payloadSujo() }));
    sobreporHandlerDePerdas(handler);
    const resultado = await consultarMetrica(CTX_VIEWER, "perdas", {});
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao", papel_minimo: "manager" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("porMotivo (texto livre) é CORTADO; porCategoria, porEtapa, porMoeda e total sobrevivem", async () => {
    sobreporHandlerDePerdas(handlerDe(200, { data: payloadSujo() }));
    const resultado = await metricaPerdas.executar(CTX_MANAGER, {});
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const texto = JSON.stringify(resultado.dados);
      expect(texto).not.toContain("Preço muito alto");
      expect(texto).not.toContain("porMotivo");
      const dados = resultado.dados as { porCategoria: unknown[]; porEtapa: unknown[]; porMoeda: unknown[]; total: number };
      expect(dados.porCategoria).toHaveLength(1);
      expect(dados.porEtapa).toHaveLength(1);
      expect(dados.porMoeda[0]).toMatchObject({ moeda: "BRL", valor_cents: 800_000 });
      expect(dados.total).toBe(10);
    }
  });

  it("amostra zero: dados=null + aviso exato", async () => {
    sobreporHandlerDePerdas(handlerDe(200, { data: { porMotivo: [], porCategoria: [], porEtapa: [], porMoeda: [], total: 0 } }));
    const resultado = await metricaPerdas.executar(CTX_MANAGER, {});
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.dados).toBeNull();
      expect(resultado.avisos).toContain("Sem perdas registradas no período.");
    }
  });
});
