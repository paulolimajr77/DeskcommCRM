// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { metricaAtividades, sobreporHandlerDeAtividades } from "@/lib/assistente/metricas/adaptadores/atividades";
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

function handlerDe(status: number, corpo: unknown, captura?: { url?: string }) {
  const handler: HandlerDeRota = async (req) => {
    if (captura) captura.url = req.url;
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  };
  return handler;
}

/** Payload com atores (nome + ids) e atividades (contatoNome, negocioTitulo, motivo). */
function payloadSujo() {
  return {
    window: { from: "x", to: "y" },
    total: 50,
    resumo: { pessoas: 20, agentes: 10, automatico: 20 },
    tipos: [{ type: "lead_created", rotulo: "Criou lead", quantidade: 30, fatia: 60 }],
    dias: [{ data: "2026-10-10", rotulo: "10/10", quantidade: 5 }],
    atores: [
      { chave: "user:u1", nome: "Maria da Silva", userId: "u1", agentId: null, quantidade: 20, fatia: 40 },
      { chave: "ai:a1", nome: "Robô", userId: null, agentId: "a1", quantidade: 10, fatia: 20 },
    ],
    atividades: [
      {
        id: "act1", type: "lead_created", rotulo: "Criou lead", quando: "2026-10-10T10:00:00Z",
        atorNome: "Maria da Silva", atorForma: "usuario", motivo: "precificação",
        negocioId: "b1", negocioTitulo: "Projeto X", contatoId: "c1", contatoNome: "Cliente ABC",
      },
    ],
    items_truncated: false,
    truncado: false,
    vocabulario: { lead: "Paciente", lead_plural: "Pacientes" },
  };
}

afterEach(() => sobreporHandlerDeAtividades(null));

describe("atividades — days/tz e piso viewer", () => {
  it("semana_passada (padrão) vira days=7; tz vem do fuso da org", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDeAtividades(
      handlerDe(200, { data: { window: {}, total: 0, resumo: {}, tipos: [], dias: [], truncado: false, items_truncated: false, vocabulario: {} } }, captura),
    );
    await metricaAtividades.executar(CTX_VIEWER, {});
    const url = new URL(captura.url ?? "");
    expect(url.searchParams.get("days")).toBe("7");
    expect(url.searchParams.get("tz")).toBe("America/Sao_Paulo");
  });

  it("ultimos_dias 5 manda days=5; atinge o teto de 90 dias", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDeAtividades(
      handlerDe(200, { data: { window: {}, total: 0, resumo: {}, tipos: [], dias: [], truncado: false, items_truncated: false, vocabulario: {} } }, captura),
    );
    await metricaAtividades.executar(CTX_VIEWER, { periodo: { tipo: "ultimos_dias", dias: 5 } });
    expect(new URL(captura.url ?? "").searchParams.get("days")).toBe("5");
  });

  it("viewer PASSA (a rota é viewer)", async () => {
    sobreporHandlerDeAtividades(handlerDe(200, { data: payloadSujo() }));
    const resultado = await consultarMetrica(CTX_VIEWER, "atividades", {});
    expect(resultado).toMatchObject({ ok: true, metrica: "atividades" });
  });

  it("atores e atividades (PIIfull) são CORTADOS — contatoNome, negocioTitulo, motivo, nome, userId", async () => {
    sobreporHandlerDeAtividades(handlerDe(200, { data: payloadSujo() }));
    const resultado = await metricaAtividades.executar(CTX_VIEWER, {});
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const texto = JSON.stringify(resultado.dados);
      for (const proibido of ["Maria da Silva", "Cliente ABC", "Projeto X", "precificação", "userId", "agentId", "contatoNome", "negocioTitulo"]) {
        expect(texto).not.toContain(proibido);
      }
      const dados = resultado.dados as { total: number; resumo: unknown; tipos: unknown[]; dias: unknown[] };
      expect(dados.total).toBe(50);
      expect(Object.keys(dados).sort()).toEqual(["dias", "resumo", "tipos", "total", "truncado", "vocabulario"]);
    }
  });
});
