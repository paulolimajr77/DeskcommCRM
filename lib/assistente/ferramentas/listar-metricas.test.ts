/**
 * `listar_metricas`: o catálogo com o JSON Schema dos parâmetros de cada
 * métrica e o que a pessoa da sessão pode (ou não) usar.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { METRICAS } from "@/lib/assistente/metricas";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { esquemaDosParametros } from "./listar-metricas";

interface LinhaListada {
  id: string;
  papel_minimo: string;
  disponivel_para_voce: boolean;
  parametros: { properties?: Record<string, unknown>; additionalProperties?: unknown } | null;
}

interface SaidaListada {
  ok: true;
  metricas: LinhaListada[];
}

async function listar(papel: Parameters<typeof montarParaTeste>[0]): Promise<LinhaListada[]> {
  const { ferramentas } = montarParaTeste(papel);
  const saida = await chamar<SaidaListada>(ferramentas, "listar_metricas", {});
  expect(saida.ok).toBe(true);
  return saida.metricas;
}

function linhaDe(metricas: LinhaListada[], id: string): LinhaListada {
  const achada = metricas.find((metrica) => metrica.id === id);
  if (!achada) throw new Error(`métrica ${id} fora da lista`);
  return achada;
}

describe("listar_metricas", () => {
  it("lista todas as métricas do catálogo, e anuncios_meta e conversoes_enviadas estão entre elas", async () => {
    const metricas = await listar("admin");

    expect(metricas.map((metrica) => metrica.id).sort()).toEqual(METRICAS.map((def) => def.id).sort());
    expect(metricas.map((metrica) => metrica.id)).toContain("anuncios_meta");
    expect(metricas.map((metrica) => metrica.id)).toContain("conversoes_enviadas");
  });

  it("os parâmetros de anuncios_meta citam periodo e comparar_com_anterior, num objeto estrito", async () => {
    const parametros = linhaDe(await listar("admin"), "anuncios_meta").parametros;

    expect(Object.keys(parametros?.properties ?? {}).sort()).toEqual(["comparar_com_anterior", "periodo"]);
    expect(parametros?.additionalProperties).toBe(false);
  });

  it("os parâmetros de conversoes_enviadas citam periodo e plataforma", async () => {
    const parametros = linhaDe(await listar("admin"), "conversoes_enviadas").parametros;

    expect(Object.keys(parametros?.properties ?? {}).sort()).toEqual(["periodo", "plataforma"]);
  });

  it("o esquema do periodo oferece os seis tipos que o modelo pode pedir", async () => {
    const parametros = linhaDe(await listar("admin"), "anuncios_meta").parametros;
    const periodo = JSON.stringify(parametros?.properties?.periodo);

    for (const tipo of ["semana_passada", "semana_atual", "ultimos_dias", "mes_atual", "mes_passado", "intervalo"]) {
      expect({ tipo, citado: periodo.includes(`"${tipo}"`) }).toEqual({ tipo, citado: true });
    }
  });

  it("nenhuma métrica real fica sem esquema de parâmetros", async () => {
    const semEsquema = (await listar("admin")).filter((metrica) => metrica.parametros === null).map((m) => m.id);

    expect(semEsquema).toEqual([]);
  });

  it("para viewer, a métrica de gerente e a de administrador vêm com disponivel_para_voce false", async () => {
    const metricas = await listar("viewer");

    expect(linhaDe(metricas, "anuncios_meta")).toMatchObject({ papel_minimo: "manager", disponivel_para_voce: false });
    expect(linhaDe(metricas, "conversoes_enviadas")).toMatchObject({
      papel_minimo: "admin",
      disponivel_para_voce: false,
    });
    expect(linhaDe(metricas, "conversas_por_visao")).toMatchObject({
      papel_minimo: "viewer",
      disponivel_para_voce: true,
    });
  });

  it("o gerente usa anuncios_meta mas não conversoes_enviadas; o administrador usa as duas", async () => {
    const gerente = await listar("manager");
    const administrador = await listar("admin");

    expect(linhaDe(gerente, "anuncios_meta").disponivel_para_voce).toBe(true);
    expect(linhaDe(gerente, "conversoes_enviadas").disponivel_para_voce).toBe(false);
    expect(linhaDe(administrador, "anuncios_meta").disponivel_para_voce).toBe(true);
    expect(linhaDe(administrador, "conversoes_enviadas").disponivel_para_voce).toBe(true);
  });
});

describe("esquemaDosParametros", () => {
  it("converte um esquema Zod em JSON Schema de entrada, sem o marcador de dialeto", () => {
    const convertido = esquemaDosParametros(z.strictObject({ dias: z.number().int().optional() }));

    expect(convertido).not.toBeNull();
    expect(Object.keys((convertido?.properties as Record<string, unknown>) ?? {})).toEqual(["dias"]);
    expect(convertido?.additionalProperties).toBe(false);
    expect("$schema" in (convertido ?? {})).toBe(false);
  });

  it("esquema que não pode ser convertido vira null, sem lançar", () => {
    const naoEhEsquema = {} as unknown as z.ZodType;

    expect(esquemaDosParametros(naoEhEsquema)).toBeNull();
  });
});
