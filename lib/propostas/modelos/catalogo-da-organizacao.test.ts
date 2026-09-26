// lib/propostas/modelos/catalogo-da-organizacao.test.ts
import { describe, expect, it } from "vitest";

import { listarModelosDaOrganizacao } from "./catalogo-da-organizacao";

function db(linhas: Array<Record<string, unknown>>) {
  const cadeia: Record<string, unknown> = {};
  cadeia.select = () => cadeia;
  cadeia.eq = () => cadeia;
  cadeia.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data: linhas, error: null }).then(resolve);
  return { from: () => cadeia } as never;
}

describe("listarModelosDaOrganizacao", () => {
  it("sem cópia nenhuma: os 8 da plataforma, com o rótulo do código", async () => {
    const lista = await listarModelosDaOrganizacao(db([]), "org-1");
    expect(lista).toHaveLength(8);
    expect(lista[0]).toMatchObject({ slug: "site_institucional", nome: "Site institucional", origem: "plataforma" });
  });

  it("cópia de modelo da plataforma aparece como personalizado, no lugar dele", async () => {
    const lista = await listarModelosDaOrganizacao(
      db([{ slug: "catalogo_imobiliario", nome: null, version: 3, sections: [{}, {}] }]),
      "org-1",
    );
    expect(lista).toHaveLength(8);
    expect(lista.find((m) => m.slug === "catalogo_imobiliario")).toMatchObject({
      origem: "personalizado",
      nome: "Catálogo imobiliário",
      version: 3,
      secoes: 2,
    });
  });

  it("modelo da empresa entra depois dos da plataforma, com o nome dela", async () => {
    const lista = await listarModelosDaOrganizacao(
      db([{ slug: "empresa_locacao", nome: "Locação por temporada", version: 1, sections: [{}] }]),
      "org-1",
    );
    expect(lista).toHaveLength(9);
    expect(lista[8]).toEqual({ slug: "empresa_locacao", nome: "Locação por temporada", origem: "empresa", secoes: 1, version: 1 });
  });
});
