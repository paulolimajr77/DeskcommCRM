// lib/propostas/documento/montar-dados.test.ts
import { describe, expect, it } from "vitest";

import { montarDadosDoDocumento } from "./montar-dados";

describe("montarDadosDoDocumento", () => {
  it("espalha o briefing_json no resultado", () => {
    const dados = montarDadosDoDocumento({ briefing_json: { project: { name: "Site Catálogo" } } });
    expect(dados).toMatchObject({ project: { name: "Site Catálogo" } });
  });

  it("numero é sempre null (renderer reafirma, não confia — Global Constraint da M2)", () => {
    const dados = montarDadosDoDocumento({ briefing_json: { numero: 42 } });
    expect(dados.numero).toBeNull();
  });

  it("briefing_json null não lança, devolve objeto só com numero", () => {
    expect(() => montarDadosDoDocumento({ briefing_json: null })).not.toThrow();
    expect(montarDadosDoDocumento({ briefing_json: null })).toEqual({ numero: null });
  });

  it("briefing_json que não é objeto (array, string) é ignorado, não lança", () => {
    expect(montarDadosDoDocumento({ briefing_json: ["x"] })).toEqual({ numero: null });
    expect(montarDadosDoDocumento({ briefing_json: "texto solto" })).toEqual({ numero: null });
  });
});
