import { describe, expect, it, vi } from "vitest";

import { capacidadesDaOrganizacao, capacidadesLigadas } from "./capacidades";

describe("capacidadesLigadas — só o booleano true liga", () => {
  it("proposals.enabled === true liga propostas", () => {
    expect(capacidadesLigadas({ proposals: { enabled: true } })).toEqual(["propostas"]);
  });
  it("false, ausente, string e lixo: desligado, sem lançar", () => {
    for (const s of [
      { proposals: { enabled: false } },
      { proposals: {} },
      {},
      null,
      undefined,
      "x",
      [],
      { proposals: { enabled: "true" } },
      { proposals: "ligado" },
    ]) {
      expect(capacidadesLigadas(s), JSON.stringify(s)).toEqual([]);
    }
  });
});

function dbQueDevolve(resultado: { data: unknown; error: unknown } | Error) {
  const maybeSingle = vi.fn(async () => {
    if (resultado instanceof Error) throw resultado;
    return resultado;
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { db: { from } as never, from, select, eq };
}

describe("capacidadesDaOrganizacao — falha fechada", () => {
  it("lê a linha da própria organização", async () => {
    const { db, from, eq } = dbQueDevolve({ data: { settings: { proposals: { enabled: true } } }, error: null });
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual(["propostas"]);
    expect(from).toHaveBeenCalledWith("organizations");
    expect(eq).toHaveBeenCalledWith("id", "org-1");
  });
  it("erro do banco = nenhuma capacidade", async () => {
    const { db } = dbQueDevolve({ data: null, error: { message: "boom" } });
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual([]);
  });
  it("exceção = nenhuma capacidade, sem relançar", async () => {
    const { db } = dbQueDevolve(new Error("rede"));
    await expect(capacidadesDaOrganizacao(db, "org-1")).resolves.toEqual([]);
  });
  it("organização inexistente = nenhuma", async () => {
    const { db } = dbQueDevolve({ data: null, error: null });
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual([]);
  });
});
