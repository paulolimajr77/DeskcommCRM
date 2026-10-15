/**
 * `consultar_metrica`: repassa a consulta do catálogo, anota no coletor só o
 * que devolveu dado, e recusa resultado grande demais. Por padrão a
 * `consultarMetrica` é a REAL (o `vi.fn` delega a ela); só os casos de
 * tamanho trocam o retorno de uma chamada.
 */
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { consultarMetrica } from "@/lib/assistente/metricas";

import { chamar, montarParaTeste, ORG, OUTRA_ORG } from "./auxiliar-de-teste";
import { LIMITE_DE_CARACTERES_DO_RESULTADO } from "./consultar-metrica";

vi.mock("@/lib/assistente/metricas", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("@/lib/assistente/metricas")>();
  return { ...original, consultarMetrica: vi.fn(original.consultarMetrica) };
});

const NEGOCIOS = [
  { organization_id: ORG, source: "Site", created_at: "2026-10-06", status: "won" },
  { organization_id: ORG, source: "Site", created_at: "2026-10-07", status: "open" },
  { organization_id: ORG, source: "Indicação", created_at: "2026-10-08", status: "lost" },
];

interface SaidaDaMetrica {
  ok: boolean;
  motivo?: string;
  detalhe?: string;
  metrica?: string;
  papel_minimo?: string;
  dados?: { total_criados?: number } | null;
}

function resultadoComTexto(tamanho: number) {
  return {
    ok: true as const,
    metrica: "leads_por_origem",
    periodo: null,
    regua: "régua de teste",
    dados: { texto: "x".repeat(tamanho) },
    avisos: [],
  };
}

describe("consultar_metrica", () => {
  beforeEach(() => {
    vi.mocked(consultarMetrica).mockClear();
  });

  it("id desconhecido devolve parametro_invalido e não anota nada", async () => {
    const { ferramentas, coletor } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "consultar_metrica", { metrica: "nao_existe" });

    expect(saida).toEqual({
      ok: false,
      metrica: "nao_existe",
      motivo: "parametro_invalido",
      detalhe: "métrica desconhecida",
    });
    expect(coletor.metricas).toEqual([]);
  });

  it("papel insuficiente devolve sem_permissao e o banco da sessão não é tocado", async () => {
    const { ferramentas, coletor, sessao } = montarParaTeste("viewer", { crm_leads: NEGOCIOS });

    const saida = await chamar(ferramentas, "consultar_metrica", { metrica: "anuncios_meta" });

    expect(saida).toEqual({
      ok: false,
      metrica: "anuncios_meta",
      motivo: "sem_permissao",
      papel_minimo: "manager",
    });
    expect(sessao.consultas.length).toBe(0);
    expect(coletor.metricas).toEqual([]);
  });

  it("organization_id dentro dos parâmetros é recusado pela métrica e o banco não é tocado", async () => {
    const { ferramentas, coletor, sessao } = montarParaTeste("manager", { crm_leads: NEGOCIOS });

    const saida = await chamar<SaidaDaMetrica>(ferramentas, "consultar_metrica", {
      metrica: "leads_por_origem",
      parametros: { organization_id: OUTRA_ORG },
    });

    expect(saida.ok).toBe(false);
    expect(saida.motivo).toBe("parametro_invalido");
    expect(sessao.consultas.length).toBe(0);
    expect(coletor.metricas).toEqual([]);
  });

  it("sucesso anota o id uma vez só, mesmo chamando duas vezes", async () => {
    const { ferramentas, coletor } = montarParaTeste("manager", { crm_leads: NEGOCIOS });

    const primeira = await chamar<SaidaDaMetrica>(ferramentas, "consultar_metrica", { metrica: "leads_por_origem" });
    const segunda = await chamar<SaidaDaMetrica>(ferramentas, "consultar_metrica", {
      metrica: "leads_por_origem",
      parametros: { periodo: { tipo: "semana_passada" } },
    });

    expect(primeira.ok).toBe(true);
    expect(primeira.dados?.total_criados).toBe(3);
    expect(segunda.ok).toBe(true);
    expect(vi.mocked(consultarMetrica)).toHaveBeenCalledTimes(2);
    expect(coletor.metricas).toEqual(["leads_por_origem"]);
  });

  it("métrica ok mas sem dado (dados null) NÃO é anotada", async () => {
    const { ferramentas, coletor } = montarParaTeste("manager", { crm_leads: [] });

    const saida = await chamar<SaidaDaMetrica>(ferramentas, "consultar_metrica", { metrica: "leads_por_origem" });

    expect(saida.ok).toBe(true);
    expect(saida.dados).toBeNull();
    expect(coletor.metricas).toEqual([]);
  });

  it("falha de leitura devolve indisponivel e NÃO anota", async () => {
    const { ferramentas, coletor } = montarParaTeste("manager", { crm_leads: NEGOCIOS }, { erroEm: "crm_leads" });

    const saida = await chamar<SaidaDaMetrica>(ferramentas, "consultar_metrica", { metrica: "leads_por_origem" });

    expect(saida).toEqual({
      ok: false,
      metrica: "leads_por_origem",
      motivo: "indisponivel",
      detalhe: "não consegui ler os negócios por origem",
    });
    expect(coletor.metricas).toEqual([]);
  });

  it("sem parametros, a consulta recebe um objeto vazio", async () => {
    const { ferramentas, ctx } = montarParaTeste("manager", { crm_leads: NEGOCIOS });

    await chamar(ferramentas, "consultar_metrica", { metrica: "leads_por_origem" });

    expect(vi.mocked(consultarMetrica)).toHaveBeenCalledWith(ctx, "leads_por_origem", {});
  });

  it("resultado com mais de 20.000 caracteres é recusado e NÃO anota", async () => {
    const { ferramentas, coletor } = montarParaTeste("manager");
    vi.mocked(consultarMetrica).mockResolvedValueOnce(resultadoComTexto(LIMITE_DE_CARACTERES_DO_RESULTADO + 1));

    const saida = await chamar(ferramentas, "consultar_metrica", { metrica: "leads_por_origem" });

    expect(saida).toEqual({ ok: false, motivo: "indisponivel", detalhe: "resultado grande demais" });
    expect(coletor.metricas).toEqual([]);
  });

  it("resultado dentro do limite passa inteiro e é anotado", async () => {
    const { ferramentas, coletor } = montarParaTeste("manager");
    const resultado = resultadoComTexto(LIMITE_DE_CARACTERES_DO_RESULTADO - 1_000);
    vi.mocked(consultarMetrica).mockResolvedValueOnce(resultado);

    const saida = await chamar(ferramentas, "consultar_metrica", { metrica: "leads_por_origem" });

    expect(saida).toEqual(resultado);
    expect(coletor.metricas).toEqual(["leads_por_origem"]);
  });

  it("a descrição ensina os seis formatos de período e manda listar as métricas antes", async () => {
    const { ferramentas } = montarParaTeste("manager");
    const descricao = ferramentas.consultar_metrica?.description ?? "";

    for (const tipo of ["semana_passada", "semana_atual", "ultimos_dias", "mes_atual", "mes_passado", "intervalo"]) {
      expect({ tipo, citado: descricao.includes(`"tipo":"${tipo}"`) }).toEqual({ tipo, citado: true });
    }
    expect(descricao).toContain("listar_metricas");
  });
});
