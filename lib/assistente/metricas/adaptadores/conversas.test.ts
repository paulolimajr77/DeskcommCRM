// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  metricaConversas,
  sobreporHandlerDeContagens,
  type ParametrosDeConversas,
} from "@/lib/assistente/metricas/adaptadores/conversas";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta } from "@/lib/assistente/metricas/tipos";

const CTX: ContextoDeConsulta = {
  orgId: "00000000-0000-0000-0000-000000000001",
  papel: "viewer",
  idioma: "pt-BR",
  fuso: "America/Sao_Paulo",
  agoraIso: "2026-10-14T09:00:00-03:00",
  bancoDosModulos: {} as ContextoDeConsulta["bancoDosModulos"],
};

function handlerDe(status: number, corpo: unknown, captura?: { url?: string }) {
  const handler: HandlerDeRota = async (req) => {
    if (captura) captura.url = req.url;
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  };
  return handler;
}

afterEach(() => {
  sobreporHandlerDeContagens(null);
});

describe("metricaConversas", () => {
  it("projeta as seis visões e descarta unassigned e lixo", async () => {
    const payload = {
      fila: 3,
      automatico: 1,
      unassigned: 3,
      mine: 2,
      all: 10,
      closed: 4,
      archived: 1,
      campo_estranho: "lixo",
    };
    sobreporHandlerDeContagens(handlerDe(200, { data: payload }));
    const resultado = await metricaConversas.executar(CTX, {} as ParametrosDeConversas);
    expect(resultado).toMatchObject({ ok: true, metrica: "conversas_por_visao", periodo: null });
    if (resultado.ok) {
      expect(resultado.dados).toEqual({ fila: 3, automatico: 1, mine: 2, all: 10, closed: 4, archived: 1 });
      expect(resultado.regua).toContain("Foto do inbox");
      expect(resultado.avisos).toEqual([]);
    }
  });

  it("inteiro negativo é formato quebrado: indisponivel, nunca número sujo", async () => {
    sobreporHandlerDeContagens(handlerDe(200, { data: { fila: -1, automatico: 0, mine: 0, all: 0, closed: 0, archived: 0 } }));
    const resultado = await metricaConversas.executar(CTX, {} as ParametrosDeConversas);
    expect(resultado).toMatchObject({ ok: false, motivo: "indisponivel" });
  });

  it("contagem que virou texto é formato quebrado: indisponivel", async () => {
    sobreporHandlerDeContagens(handlerDe(200, { data: { fila: "3", automatico: 0, mine: 0, all: 0, closed: 0, archived: 0 } }));
    const resultado = await metricaConversas.executar(CTX, {} as ParametrosDeConversas);
    expect(resultado).toMatchObject({ ok: false, motivo: "indisponivel" });
  });

  it("403 da rota vira sem_permissao", async () => {
    sobreporHandlerDeContagens(handlerDe(403, { error: { code: "no_active_org", message: "x" } }));
    const resultado = await metricaConversas.executar(CTX, {} as ParametrosDeConversas);
    expect(resultado).toEqual({ ok: false, metrica: "conversas_por_visao", motivo: "sem_permissao", papel_minimo: "viewer" });
  });

  it("chama a rota sem parâmetro nenhum na query", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDeContagens(handlerDe(200, { data: { fila: 0, automatico: 0, mine: 0, all: 0, closed: 0, archived: 0 } }, captura));
    await metricaConversas.executar(CTX, {} as ParametrosDeConversas);
    expect(captura.url).toBeDefined();
    expect([...new URL(captura.url ?? "").searchParams.keys()]).toEqual([]);
  });
});
