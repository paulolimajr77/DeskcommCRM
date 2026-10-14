// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  metricaFaturamento,
  sobreporHandlerDoFinanceiro,
  type ParametrosDeFaturamento,
} from "@/lib/assistente/metricas/adaptadores/faturamento";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta } from "@/lib/assistente/metricas/tipos";
import type { ModuloOpcional } from "@/lib/instalacao/modulos";

vi.mock("@/lib/instalacao/modulos", () => ({ modulosLigados: vi.fn() }));

import { modulosLigados } from "@/lib/instalacao/modulos";

const modulosLigadosMock = vi.mocked(modulosLigados);

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

/** Payload com a MESMA forma da resposta real da rota — sujeira incluída. */
function payloadReal(sujo = true) {
  const profissional = sujo ? [{ attendant_user_id: "u1", itens: 4, comissao_cents: 9000 }] : [];
  const cliente = sujo ? [{ contact_id: "c1", comandas: 2, total_cents: 45000 }] : [];
  return {
    de: "2026-10-05",
    ate: "2026-10-11",
    entradas_cents: 100_000,
    saidas_cents: 20_000,
    saldo_cents: 80_000,
    comandas_finalizadas: 4,
    comandas_estornadas: 1,
    faturado_cents: 90_000,
    ticket_medio_cents: 22_500,
    por_servico: [sujo ? { nome: "Consulta", quantidade: 3, total_cents: 60_000, email: "dono@clinica.com" } : { nome: "Consulta", quantidade: 3, total_cents: 60_000 }],
    por_forma: [{ nome: "Pix", quantidade: 4, total_cents: 90_000 }],
    por_profissional: profissional,
    por_cliente: cliente,
    por_moeda: {
      BRL: {
        entradas_cents: 100_000,
        saidas_cents: 20_000,
        saldo_cents: 80_000,
        comandas_finalizadas: 4,
        comandas_estornadas: 1,
        faturado_cents: 90_000,
        ticket_medio_cents: 22_500,
        por_forma: [{ nome: "Pix", quantidade: 4, total_cents: 90_000 }],
        por_servico: [{ nome: "Consulta", quantidade: 3, total_cents: 60_000 }],
        por_profissional: profissional,
        por_cliente: cliente,
      },
    },
  };
}

afterEach(() => {
  sobreporHandlerDoFinanceiro(null);
  modulosLigadosMock.mockReset();
});

describe("metricaFaturamento — a query que chega na rota", () => {
  it("semana_passada (padrão) manda de e ate INCLUSIVOS", async () => {
    const captura: { url?: string } = {};
    modulosLigadosMock.mockResolvedValue(["financeiro"] as ModuloOpcional[]);
    sobreporHandlerDoFinanceiro(handlerDe(200, { data: payloadReal(false) }, captura));
    const resultado = await metricaFaturamento.executar(CTX, {} as ParametrosDeFaturamento);
    expect(resultado.ok).toBe(true);
    const url = new URL(captura.url ?? "");
    expect(url.searchParams.get("de")).toBe("2026-10-05");
    // `ate` é o dia INCLUSIVO do pedido, não o corte exclusivo (a rota usa between).
    expect(url.searchParams.get("ate")).toBe("2026-10-11");
  });

  it("intervalo explícito passa de e ate como a pessoa pediu", async () => {
    const captura: { url?: string } = {};
    modulosLigadosMock.mockResolvedValue(["financeiro"] as ModuloOpcional[]);
    sobreporHandlerDoFinanceiro(handlerDe(200, { data: payloadReal(false) }, captura));
    await metricaFaturamento.executar(CTX, { periodo: { tipo: "intervalo", de: "2026-10-01", ate: "2026-10-05" } });
    const url = new URL(captura.url ?? "");
    expect(url.searchParams.get("de")).toBe("2026-10-01");
    expect(url.searchParams.get("ate")).toBe("2026-10-05");
  });
});

describe("metricaFaturamento — o que pode e o que NUNCA sai", () => {
  it("payload real sujo: por_profissional, por_cliente e e-mail não saem de jeito nenhum", async () => {
    modulosLigadosMock.mockResolvedValue(["financeiro"] as ModuloOpcional[]);
    sobreporHandlerDoFinanceiro(handlerDe(200, { data: payloadReal(true) }));
    const resultado = await metricaFaturamento.executar(CTX, {} as ParametrosDeFaturamento);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const texto = JSON.stringify(resultado.dados);
      for (const proibido of ["attendant_user_id", "comissao", "por_profissional", "contact_id", "por_cliente", "email", "user_id"]) {
        expect(texto).not.toContain(proibido);
      }
      const dados = resultado.dados as { moeda: string; caixa: unknown; comandas: { faturado_cents: number } };
      expect(dados.moeda).toBe("BRL");
      expect(dados.caixa).toEqual({ entradas_cents: 100_000, saidas_cents: 20_000, saldo_cents: 80_000 });
      expect(dados.comandas.faturado_cents).toBe(90_000);
    }
  });

  it("módulo ausente: comandas null, caixa preservado, aviso — nunca zero de comanda", async () => {
    modulosLigadosMock.mockResolvedValue([] as ModuloOpcional[]);
    sobreporHandlerDoFinanceiro(
      handlerDe(200, {
        data: {
          de: "2026-10-05",
          ate: "2026-10-11",
          entradas_cents: 100_000,
          saidas_cents: 20_000,
          saldo_cents: 80_000,
          comandas_finalizadas: 0,
          comandas_estornadas: 0,
          faturado_cents: 0,
          ticket_medio_cents: 0,
          por_servico: [],
          por_forma: [],
          por_profissional: [],
          por_cliente: [],
          por_moeda: {},
        },
      }),
    );
    const resultado = await metricaFaturamento.executar(CTX, {} as ParametrosDeFaturamento);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const dados = resultado.dados as { comandas: unknown; caixa: { entradas_cents: number }; dinheiro_por_moeda: unknown[] };
      expect(dados.comandas).toBeNull();
      expect(dados.caixa.entradas_cents).toBe(100_000);
      expect(dados.dinheiro_por_moeda).toEqual([]);
      expect(resultado.avisos).toContain("Esta instalação não usa comandas; só o caixa está disponível.");
      expect(JSON.stringify(resultado.dados)).not.toContain("faturado_cents");
    }
  });

  it("leitura do módulo FALHOU é indisponivel — 'não consegui saber' ≠ 'não tem'", async () => {
    modulosLigadosMock.mockRejectedValue(new Error("banco fora"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = vi.fn(handlerDe(200, { data: payloadReal(false) }));
    sobreporHandlerDoFinanceiro(handler);
    const resultado = await metricaFaturamento.executar(CTX, {} as ParametrosDeFaturamento);
    expect(resultado).toMatchObject({ ok: false, motivo: "indisponivel" });
    expect(handler).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("duas moedas: só os blocos por moeda, sem total de topo, com aviso", async () => {
    modulosLigadosMock.mockResolvedValue(["financeiro"] as ModuloOpcional[]);
    const base = payloadReal(false);
    const payload = {
      ...base,
      por_moeda: {
        ...base.por_moeda,
        EUR: {
          entradas_cents: 5_000,
          saidas_cents: 0,
          saldo_cents: 5_000,
          comandas_finalizadas: 1,
          comandas_estornadas: 0,
          faturado_cents: 5_000,
          ticket_medio_cents: 5_000,
          por_forma: [],
          por_servico: [],
        },
      },
    };
    sobreporHandlerDoFinanceiro(handlerDe(200, { data: payload }));
    const resultado = await metricaFaturamento.executar(CTX, {} as ParametrosDeFaturamento);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const dados = resultado.dados as {
        moeda: unknown;
        caixa: unknown;
        comandas: unknown;
        dinheiro_por_moeda: { moeda: string; faturado_cents: number }[];
      };
      expect(dados.moeda).toBeNull();
      expect(dados.caixa).toBeNull();
      expect(dados.comandas).toBeNull();
      expect(dados.dinheiro_por_moeda.map((bloco) => bloco.moeda)).toEqual(["BRL", "EUR"]);
      expect(resultado.avisos.join(" ")).toContain("mais de uma moeda");
      expect(Object.keys(dados).sort()).toEqual(["caixa", "comandas", "dinheiro_por_moeda", "moeda"]);
    }
  });

  it("403 da rota vira sem_permissao com o papel da definição", async () => {
    modulosLigadosMock.mockResolvedValue(["financeiro"] as ModuloOpcional[]);
    sobreporHandlerDoFinanceiro(handlerDe(403, { error: { code: "forbidden_role", message: "x" } }));
    const resultado = await metricaFaturamento.executar(CTX, {} as ParametrosDeFaturamento);
    expect(resultado).toEqual({ ok: false, metrica: "faturamento", motivo: "sem_permissao", papel_minimo: "viewer" });
  });

  it("item de comanda com total_cents negativo (desconto maior que preço) ainda é ok: dinheiro não tem trava de sinal", async () => {
    modulosLigadosMock.mockResolvedValue(["financeiro"] as ModuloOpcional[]);
    const payload = payloadReal(false);
    payload.por_servico = [{ nome: "Desconto Gigante", quantidade: 1, total_cents: -50_000 }];
    payload.por_moeda.BRL!.por_servico = [{ nome: "Desconto Gigante", quantidade: 1, total_cents: -50_000 }];
    sobreporHandlerDoFinanceiro(handlerDe(200, { data: payload }));
    const resultado = await metricaFaturamento.executar(CTX, {} as ParametrosDeFaturamento);
    expect(resultado.ok).toBe(true);
  });

  it("papel viewer PASSA — a rota do relatório é viewer", async () => {
    modulosLigadosMock.mockResolvedValue(["financeiro"] as ModuloOpcional[]);
    sobreporHandlerDoFinanceiro(handlerDe(200, { data: payloadReal(false) }));
    const resultado = await consultarMetrica(CTX, "faturamento", {});
    expect(resultado).toMatchObject({ ok: true, metrica: "faturamento" });
  });
});
