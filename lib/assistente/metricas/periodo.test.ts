// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  PeriodoSolicitado,
  resolverPeriodo,
  type PeriodoSolicitado as TipoPeriodoSolicitado,
} from "@/lib/assistente/metricas/periodo";

const AGORA_SP = "2026-10-14T09:00:00-03:00"; // quarta-feira
const SP = "America/Sao_Paulo";

function resolver(solicitado: TipoPeriodoSolicitado, agoraIso = AGORA_SP, fuso = SP) {
  return resolverPeriodo(solicitado, agoraIso, fuso, "pt-BR");
}

describe("PeriodoSolicitado (Zod)", () => {
  it("recusa intervalo invertido", () => {
    expect(PeriodoSolicitado.safeParse({ tipo: "intervalo", de: "2026-10-11", ate: "2026-10-05" }).success).toBe(false);
  });

  it("recusa intervalo acima de 400 dias e aceita exatamente 400 (inclusivo)", () => {
    // 2025-09-10 → 2026-10-14 são 399 dias de distância = 400 dias contando os dois.
    expect(PeriodoSolicitado.safeParse({ tipo: "intervalo", de: "2025-09-09", ate: "2026-10-14" }).success).toBe(false);
    expect(PeriodoSolicitado.safeParse({ tipo: "intervalo", de: "2025-09-10", ate: "2026-10-14" }).success).toBe(true);
  });

  it("recusa data de calendário que não existe", () => {
    expect(PeriodoSolicitado.safeParse({ tipo: "intervalo", de: "2026-02-30", ate: "2026-03-02" }).success).toBe(false);
  });

  it("recusa ultimos_dias fora de 1..400", () => {
    expect(PeriodoSolicitado.safeParse({ tipo: "ultimos_dias", dias: 0 }).success).toBe(false);
    expect(PeriodoSolicitado.safeParse({ tipo: "ultimos_dias", dias: 401 }).success).toBe(false);
    expect(PeriodoSolicitado.safeParse({ tipo: "ultimos_dias", dias: 400 }).success).toBe(true);
  });
});

describe("resolverPeriodo — semana no fuso da organização", () => {
  it("semana_passada = segunda a domingo completos, com os três cortes", () => {
    const periodo = resolver({ tipo: "semana_passada" });
    expect(periodo.de).toBe("2026-10-05");
    expect(periodo.ateInclusivo).toBe("2026-10-11");
    expect(periodo.ateExclusivo).toBe("2026-10-12");
    expect(periodo.parcial).toBe(false);
    expect(periodo.rotulo).toBe("segunda 05/10 a domingo 11/10/2026");
  });

  it("semana_atual = segunda até hoje, parcial", () => {
    const periodo = resolver({ tipo: "semana_atual" });
    expect(periodo.de).toBe("2026-10-12");
    expect(periodo.ateInclusivo).toBe("2026-10-14");
    expect(periodo.parcial).toBe(true);
    expect(periodo.rotulo).toBe("segunda 12/10 a quarta 14/10/2026");
  });

  it("no domingo à noite, semana_passada ainda é a semana anterior", () => {
    const periodo = resolver({ tipo: "semana_passada" }, "2026-10-11T22:00:00-03:00");
    expect(periodo.de).toBe("2026-09-28");
    expect(periodo.ateInclusivo).toBe("2026-10-04");
  });

  it("na segunda às 00:30, semana_passada passa a ser a semana que acabou", () => {
    const periodo = resolver({ tipo: "semana_passada" }, "2026-10-12T00:30:00-03:00");
    expect(periodo.de).toBe("2026-10-05");
    expect(periodo.ateInclusivo).toBe("2026-10-11");
  });

  it("ultimos_dias conta dias completos terminando ONTEM", () => {
    const periodo = resolver({ tipo: "ultimos_dias", dias: 7 });
    expect(periodo.de).toBe("2026-10-07");
    expect(periodo.ateInclusivo).toBe("2026-10-13");
    expect(periodo.ateExclusivo).toBe("2026-10-14");
    expect(periodo.parcial).toBe(false);
  });

  it("mes_atual é parcial e começa no dia 1", () => {
    const periodo = resolver({ tipo: "mes_atual" });
    expect(periodo.de).toBe("2026-10-01");
    expect(periodo.ateInclusivo).toBe("2026-10-14");
    expect(periodo.parcial).toBe(true);
    expect(periodo.rotulo).toBe("01/10/2026 a 14/10/2026");
  });

  it("mes_passado em janeiro volta a dezembro do ano anterior", () => {
    const periodo = resolver({ tipo: "mes_passado" }, "2026-01-15T12:00:00-03:00");
    expect(periodo.de).toBe("2025-12-01");
    expect(periodo.ateInclusivo).toBe("2025-12-31");
  });

  it("mes_passado em ano bissexto pega 29 de fevereiro", () => {
    const periodo = resolver({ tipo: "mes_passado" }, "2028-03-15T12:00:00-03:00");
    expect(periodo.de).toBe("2028-02-01");
    expect(periodo.ateInclusivo).toBe("2028-02-29");
  });

  it("intervalo respeita o que a pessoa pediu, com ate inclusivo", () => {
    const periodo = resolver({ tipo: "intervalo", de: "2026-10-05", ate: "2026-10-11" });
    expect(periodo.de).toBe("2026-10-05");
    expect(periodo.ateInclusivo).toBe("2026-10-11");
    expect(periodo.ateExclusivo).toBe("2026-10-12");
    expect(periodo.parcial).toBe(false);
    expect(periodo.rotulo).toBe("05/10/2026 a 11/10/2026");
  });
});

describe("resolverPeriodo — instantes com o deslocamento REAL do fuso", () => {
  it("converte a meia-noite local de São Paulo (UTC-3 o ano todo)", () => {
    const periodo = resolver({ tipo: "semana_passada" });
    expect(periodo.deInstante).toBe("2026-10-05T03:00:00.000Z");
    expect(periodo.ateInstanteExclusivo).toBe("2026-10-12T03:00:00.000Z");
  });

  it("fuso com horário de verão: a semana tem 167 horas, não 168", () => {
    // Semana que contém 2026-03-08 (domingo em que Nova York entra no horário
    // de verão). Prova de que o instante NÃO foi calculado somando 7×24 h.
    const periodo = resolver({ tipo: "semana_passada" }, "2026-03-11T12:00:00-04:00", "America/New_York");
    expect(periodo.de).toBe("2026-03-02");
    expect(periodo.ateInclusivo).toBe("2026-03-08");
    expect(periodo.ateExclusivo).toBe("2026-03-09");
    expect(periodo.deInstante).toBe("2026-03-02T05:00:00.000Z"); // meia-noite EST
    expect(periodo.ateInstanteExclusivo).toBe("2026-03-09T04:00:00.000Z"); // meia-noite EDT
    const horas = (Date.parse(periodo.ateInstanteExclusivo) - Date.parse(periodo.deInstante)) / 3_600_000;
    expect(horas).toBe(167);
    expect(horas).not.toBe(168);
  });

  it("instante UTC não é dia civil: 01:00Z em São Paulo ainda é terça 13/10", () => {
    const periodo = resolver({ tipo: "semana_atual" }, "2026-10-14T01:00:00Z");
    expect(periodo.de).toBe("2026-10-12");
    expect(periodo.ateInclusivo).toBe("2026-10-13");
    expect(periodo.parcial).toBe(true);
    expect(periodo.rotulo).toContain("terça");
  });

  it("fuso inválido cai para UTC, declarado na resposta", () => {
    const periodo = resolver({ tipo: "semana_passada" }, "2026-10-14T12:00:00Z", "Fuso/Inexistente");
    expect(periodo.fuso).toBe("UTC");
    expect(periodo.de).toBe("2026-10-05");
    expect(periodo.ateInclusivo).toBe("2026-10-11");
  });

  it("rótulo em espanhol no idioma pedido", () => {
    const periodo = resolverPeriodo({ tipo: "semana_passada" }, AGORA_SP, SP, "es");
    expect(periodo.rotulo).toBe("lunes 05/10 a domingo 11/10/2026");
  });

  it("é determinístico: mesmos valores, mesma resposta", () => {
    expect(resolver({ tipo: "semana_passada" })).toEqual(resolver({ tipo: "semana_passada" }));
  });
});
