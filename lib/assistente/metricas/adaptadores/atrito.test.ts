// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { metricaAtrito, sobreporHandlerDeAtrito } from "@/lib/assistente/metricas/adaptadores/atrito";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta } from "@/lib/assistente/metricas/tipos";

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

const payloadValido = () => ({
  window: { from: "2026-10-05T03:00:00.000Z", to: "2026-10-12T03:00:00.000Z" },
  escopo: {
    demandas: 30, de: "2026-10-05T03:00:00.000Z", ate: "2026-10-12T03:00:00.000Z",
    abandono_horas: 72, repeticao_min: 0.7, espera_horas: 4,
    demandas_com_caso: 10, demandas_abertas: 5, denominador: "demandas",
  },
  regua: { abandono_horas: 72, default: 72 },
  pares: [{ chave: "conversao", titulo: "Conversão", eficiencia: { chave: "ganhos", rotulo: "Ganhos", valor: 30, unidade: "contagem" }, danos: [] }],
  componentes: { cliente: { pedidos_de_humano: 3 }, empresa: { envios_por_ia: 100 } },
});

afterEach(() => sobreporHandlerDeAtrito(null));

describe("atrito — período fim exclusivo e piso agent", () => {
  it("manda from=deInstante e to=ateInstanteExclusivo", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDeAtrito(handlerDe(200, { data: payloadValido() }, captura));
    await metricaAtrito.executar(CTX_AGENT, {});
    const url = new URL(captura.url ?? "");
    expect(url.searchParams.get("from")).toBe("2026-10-05T03:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-10-12T03:00:00.000Z");
  });

  it("viewer fica sem_permissao SEM chamar a rota (piso agent)", async () => {
    const handler = vi.fn(handlerDe(200, { data: payloadValido() }));
    sobreporHandlerDeAtrito(handler);
    const resultado = await consultarMetrica(CTX_VIEWER, "atrito", {});
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao", papel_minimo: "agent" });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("atrito — sem PII na resposta", () => {
  it("não adiciona chaves proibidas e devolve os pares", async () => {
    sobreporHandlerDeAtrito(handlerDe(200, { data: payloadValido() }));
    const resultado = await metricaAtrito.executar(CTX_AGENT, {});
    expect(resultado).toMatchObject({ ok: true });
    if (resultado.ok) {
      const texto = JSON.stringify(resultado.dados);
      expect(texto).not.toContain("user_id");
      expect(texto).not.toContain("attendant_user_id");
      const dados = resultado.dados as { pares: { eficiencia: { valor: number } }[] };
      expect(dados.pares[0]?.eficiencia.valor).toBe(30);
    }
  });

  it("componente com valor string vira indisponivel", async () => {
    const payload = { ...payloadValido(), componentes: { cliente: { pedidos_de_humano: "x" }, empresa: {} } };
    sobreporHandlerDeAtrito(handlerDe(200, { data: payload }));
    const resultado = await metricaAtrito.executar(CTX_AGENT, {});
    expect(resultado).toMatchObject({ ok: false, motivo: "indisponivel" });
  });

  it("amostra zero (demandas=0): dados=null + aviso exato", async () => {
    const payload = payloadValido();
    payload.escopo.demandas = 0;
    sobreporHandlerDeAtrito(handlerDe(200, { data: payload }));
    const resultado = await metricaAtrito.executar(CTX_AGENT, {});
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.dados).toBeNull();
      expect(resultado.avisos).toContain("Sem demandas no período; o índice não se aplica.");
    }
  });
});
