import { describe, expect, it } from "vitest";
import { textoAte, semChavesPerigosas } from "./saneamento";

describe("saneamento", () => {
  it("textoAte(5) corta", () => {
    const s = textoAte(5).parse("abcdefgh");
    expect(s).toBe("abcde");
  });
  it("semChavesPerigosas tira __proto__ e preserva busca", () => {
    const r = semChavesPerigosas(JSON.parse('{"__proto__":3,"busca":1}'));
    expect(Object.keys(r)).toEqual(["busca"]);
    expect(Object.getPrototypeOf(r) === Object.prototype).toBe(true);
  });
});
