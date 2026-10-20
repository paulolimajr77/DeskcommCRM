// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  METRICAS,
  consultarMetrica,
  listarMetricas,
  papelSuficiente,
} from "@/lib/assistente/metricas/registro";
import type { ContextoDeConsulta, DefinicaoDeMetrica, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";

function ctxDe(papel: ContextoDeConsulta["papel"]): ContextoDeConsulta {
  return {
    orgId: "00000000-0000-0000-0000-000000000001",
    papel,
    idioma: "pt-BR",
    fuso: "America/Sao_Paulo",
    agoraIso: "2026-10-14T09:00:00-03:00",
    bancoDosModulos: {} as ContextoDeConsulta["bancoDosModulos"],
  };
}

const executarEspiao = vi.fn(
  async (): Promise<ResultadoDeMetrica> => ({
    ok: true,
    metrica: "metrica_de_gerente",
    periodo: null,
    regua: "régua de teste",
    dados: {},
    avisos: [],
  }),
);

const metricaDeGerente: DefinicaoDeMetrica<unknown> = {
  id: "metrica_de_gerente",
  descricao: "só para testar o portão de papel",
  papelMinimo: "manager",
  modulo: null,
  parametros: z.strictObject({}),
  dimensoes: [],
  regua: "régua de teste",
  executar: executarEspiao,
};

const catalogoDeTeste: DefinicaoDeMetrica<unknown>[] = [...METRICAS, metricaDeGerente];

describe("registro — higiene do catálogo", () => {
  it("os 17 ids, únicos e em snake_case", () => {
    const ids = METRICAS.map((def) => def.id);
    expect([...ids].sort()).toEqual(
      [
        "anuncios_meta",
        "atividades",
        "atrito",
        "canais",
        "conversas_por_visao",
        "conversoes_enviadas",
        "desempenho_atendentes",
        "etiquetas",
        "evolucao_da_ia",
        "faturamento",
        "fechamentos_por_funil",
        "funil_conversao",
        "leads_por_origem",
        "perdas",
        "propostas_aceitas_por_produto",
        "taxa_de_ganho_por_etapa",
        "uso_de_ia",
      ].sort(),
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("papelMinimo de cada uma é EXATAMENTE o da rota medida", () => {
    const esperado: Record<string, "viewer" | "agent" | "manager" | "admin"> = {
      conversas_por_visao: "viewer",
      faturamento: "viewer",
      desempenho_atendentes: "agent",
      atrito: "agent",
      canais: "agent",
      perdas: "manager",
      atividades: "viewer",
      etiquetas: "viewer",
      uso_de_ia: "manager",
      evolucao_da_ia: "manager",
      funil_conversao: "agent",
      taxa_de_ganho_por_etapa: "manager",
      fechamentos_por_funil: "agent",
      leads_por_origem: "agent",
      propostas_aceitas_por_produto: "viewer",
      anuncios_meta: "manager",
      conversoes_enviadas: "admin",
    };
    for (const def of METRICAS) {
      expect(def.papelMinimo).toBe(esperado[def.id]);
    }
  });

  it("toda métrica tem descrição, régua, dimensões e papel válido", () => {
    for (const def of METRICAS) {
      expect(def.descricao.length).toBeGreaterThan(0);
      expect(def.regua.length).toBeGreaterThan(0);
      expect(Array.isArray([...def.dimensoes])).toBe(true);
      expect(["viewer", "agent", "manager", "admin"]).toContain(def.papelMinimo);
    }
  });

  it("campo inventado nunca passa — url, sql e organization_id recusados em TODA métrica", () => {
    const invasores = [
      { url: "http://x" },
      { sql: "select 1" },
      { organization_id: "00000000-0000-0000-0000-000000000002" },
    ];
    for (const def of METRICAS) {
      for (const invasor of invasores) {
        expect(def.parametros.safeParse(invasor).success).toBe(false);
      }
    }
  });
});

describe("consultarMetrica — a ordem dos portões", () => {
  it("id desconhecido vira parametro_invalido", async () => {
    const resultado = await consultarMetrica(ctxDe("viewer"), "metrica_inexistente", {});
    expect(resultado).toMatchObject({ ok: false, motivo: "parametro_invalido" });
  });

  it("papel insuficiente devolve sem_permissao SEM chamar a rota", async () => {
    executarEspiao.mockClear();
    const resultado = await consultarMetrica(ctxDe("viewer"), "metrica_de_gerente", {}, catalogoDeTeste);
    expect(resultado).toEqual({ ok: false, metrica: "metrica_de_gerente", motivo: "sem_permissao", papel_minimo: "manager" });
    expect(executarEspiao).not.toHaveBeenCalled();
  });

  it("papel suficiente executa", async () => {
    executarEspiao.mockClear();
    const resultado = await consultarMetrica(ctxDe("manager"), "metrica_de_gerente", {}, catalogoDeTeste);
    expect(resultado).toMatchObject({ ok: true, metrica: "metrica_de_gerente" });
    expect(executarEspiao).toHaveBeenCalledTimes(1);
  });

  it("parametro invalido traz a mensagem do Zod resumida", async () => {
    const resultado = await consultarMetrica(ctxDe("viewer"), "conversas_por_visao", { url: "http://x" });
    expect(resultado).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    if (resultado.ok === false && resultado.motivo === "parametro_invalido") {
      expect(resultado.detalhe.length).toBeGreaterThan(0);
    }
  });
});

describe("papelSuficiente — a mesma régua do ROLE_RANK", () => {
  it("viewer não alcança manager; manager alcança; admin alcança tudo", () => {
    expect(papelSuficiente("viewer", "manager")).toBe(false);
    expect(papelSuficiente("agent", "viewer")).toBe(true);
    expect(papelSuficiente("manager", "manager")).toBe(true);
    expect(papelSuficiente("admin", "manager")).toBe(true);
    expect(papelSuficiente("viewer", "viewer")).toBe(true);
  });
});

describe("listarMetricas — o modelo vê tudo e sabe o que pode usar", () => {
  it("marca disponivel_para_voce falso para viewer em métrica de manager", async () => {
    const lista = await listarMetricas(ctxDe("viewer"), catalogoDeTeste);
    const porId = new Map(lista.map((linha) => [linha.id, linha]));
    expect(porId.get("metrica_de_gerente")?.disponivel_para_voce).toBe(false);
    expect(porId.get("conversas_por_visao")?.disponivel_para_voce).toBe(true);
    expect(porId.get("faturamento")?.disponivel_para_voce).toBe(true);
  });

  it("para gerente, a métrica de gerente fica disponível", async () => {
    const lista = await listarMetricas(ctxDe("manager"), catalogoDeTeste);
    const linha = lista.find((item) => item.id === "metrica_de_gerente");
    expect(linha?.disponivel_para_voce).toBe(true);
    expect(linha?.papel_minimo).toBe("manager");
  });

  it("viewer vê as viewer, mas não as de agent/manager — e vê tudo na lista", async () => {
    const lista = await listarMetricas(ctxDe("viewer"), catalogoDeTeste);
    const porId = new Map(lista.map((linha) => [linha.id, linha]));
    expect(porId.get("conversas_por_visao")?.disponivel_para_voce).toBe(true);
    expect(porId.get("faturamento")?.disponivel_para_voce).toBe(true);
    expect(porId.get("atividades")?.disponivel_para_voce).toBe(true);
    expect(porId.get("desempenho_atendentes")?.disponivel_para_voce).toBe(false);
    expect(porId.get("atrito")?.disponivel_para_voce).toBe(false);
    expect(porId.get("canais")?.disponivel_para_voce).toBe(false);
    expect(porId.get("perdas")?.disponivel_para_voce).toBe(false);
  });

  it("toda linha carrega os campos que o modelo precisa", async () => {
    const lista = await listarMetricas(ctxDe("viewer"));
    expect(lista.length).toBe(METRICAS.length);
    for (const linha of lista) {
      expect(Object.keys(linha).sort()).toEqual(
        ["descricao", "dimensoes", "disponivel_para_voce", "id", "modulo", "papel_minimo", "regua"].sort(),
      );
    }
  });
});
