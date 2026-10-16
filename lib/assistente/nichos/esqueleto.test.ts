/**
 * As funções puras do esqueleto: ler marcadores e preencher.
 *
 * Os marcadores da clínica são medidos contra o bloco real do `.md`
 * (`{clínica}`, `{especialidades, em uma frase}`, `{nome}`).
 */
import { describe, expect, it } from "vitest";

import { nichoPorId, placeholdersDoEsqueleto, preencherEsqueleto } from "./index";

const CLINICA = nichoPorId("clinica")?.esqueleto ?? "";
const ADVOCACIA = nichoPorId("advocacia")?.esqueleto ?? "";

const VALORES_CLINICA = {
  "clínica": "Clínica Vida",
  "especialidades, em uma frase": "consultas e exames",
  nome: "Ana",
};

describe("placeholdersDoEsqueleto", () => {
  it("lê os marcadores reais do esqueleto da clínica, distintos e na ordem", () => {
    expect(placeholdersDoEsqueleto(CLINICA)).toEqual([
      "clínica",
      "especialidades, em uma frase",
      "nome",
    ]);
  });

  it("não duplica e trata marcador com vírgula como UM só", () => {
    const marcadores = placeholdersDoEsqueleto(CLINICA);
    expect(new Set(marcadores).size).toBe(marcadores.length);
    expect(marcadores).toContain("especialidades, em uma frase");
  });

  it("lê os marcadores do esqueleto da advocacia", () => {
    expect(placeholdersDoEsqueleto(ADVOCACIA)).toEqual([
      "escritório",
      "área(s) do direito",
      "nome",
    ]);
  });

  it("devolve [] quando não há marcador", () => {
    expect(placeholdersDoEsqueleto("texto sem marcador nenhum")).toEqual([]);
  });
});

describe("preencherEsqueleto", () => {
  it("com todos os valores, devolve ok:true e o texto sem chaves", () => {
    const r = preencherEsqueleto(CLINICA, VALORES_CLINICA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto).not.toContain("{");
    expect(r.texto).not.toContain("}");
    expect(r.texto).toContain("Clínica Vida");
    expect(r.texto).toContain("consultas e exames");
  });

  it("faltando um valor, devolve ok:false com o nome certo e SEM texto", () => {
    const r = preencherEsqueleto(CLINICA, {
      "clínica": "Clínica Vida",
      nome: "Ana",
    });
    expect(r).toEqual({ ok: false, faltam: ["especialidades, em uma frase"] });
    expect("texto" in r).toBe(false);
  });

  it("valor em branco conta como faltando", () => {
    const r = preencherEsqueleto(CLINICA, {
      ...VALORES_CLINICA,
      "especialidades, em uma frase": "   ",
    });
    expect(r).toEqual({ ok: false, faltam: ["especialidades, em uma frase"] });
  });

  it("valor contendo chaves é recusado (evita injeção de marcador)", () => {
    const r = preencherEsqueleto(CLINICA, {
      ...VALORES_CLINICA,
      "clínica": "{outro}",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltam).toContain("clínica");
  });

  it("lista TODOS os que faltam, na ordem dos marcadores", () => {
    const r = preencherEsqueleto(CLINICA, {});
    expect(r).toEqual({
      ok: false,
      faltam: ["clínica", "especialidades, em uma frase", "nome"],
    });
  });
});
