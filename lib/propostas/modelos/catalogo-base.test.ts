import { describe, expect, it } from "vitest";
import { MODELOS_BASE } from "./catalogo-base";

describe("MODELOS_BASE — catálogo de modelos da plataforma (código, não banco)", () => {
  it("nasce vazio: os 8 modelos-piloto ainda não foram trazidos ao repositório (spec §6.4)", () => {
    expect(Object.keys(MODELOS_BASE)).toEqual([]);
  });

  it("é um objeto congelado — ninguém muta o catálogo em runtime", () => {
    expect(Object.isFrozen(MODELOS_BASE)).toBe(true);
  });
});
