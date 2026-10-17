import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  podeTransitar,
  RISCOS_DA_PROPOSTA,
  STATUS_DA_PROPOSTA,
  TIPOS_DE_PROPOSTA,
  type StatusDaProposta,
} from "./tipos";

const MIGRATION = join(
  __dirname,
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20261021100100_0699_config_proposals.sql",
);

const PERMITIDAS: ReadonlyArray<readonly [StatusDaProposta, StatusDaProposta]> = [
  ["pendente", "aprovada"],
  ["pendente", "rejeitada"],
  ["pendente", "expirada"],
  ["aprovada", "aplicada"],
  ["aprovada", "expirada"],
];

function sqlDaMigration(): string {
  return readFileSync(MIGRATION, "utf8");
}

/** Os literais de `<coluna> text not null ... check (<coluna> in (...))`, na ordem do SQL. */
function listaDoCheck(coluna: string): string[] {
  const m = new RegExp(`\\b${coluna}\\s+text[^\\n]*?check \\(${coluna} in \\(([^)]*)\\)\\)`).exec(
    sqlDaMigration(),
  );
  if (m === null) {
    throw new Error(`não achei o CHECK de ${coluna} na migration 0699 — o instrumento ficou cego`);
  }
  const valores = [...(m[1] as string).matchAll(/'([^']+)'/g)].map((x) => x[1] as string);
  if (valores.length === 0) throw new Error(`o CHECK de ${coluna} não rendeu literal nenhum`);
  return valores;
}

describe("podeTransitar — a máquina de estados da proposta", () => {
  it("controle: a matriz cobre as 25 combinações", () => {
    expect(STATUS_DA_PROPOSTA.length * STATUS_DA_PROPOSTA.length).toBe(25);
  });

  it.each(PERMITIDAS)("%s -> %s é permitida", (de, para) => {
    expect(podeTransitar(de, para)).toBe(true);
  });

  const proibidas = STATUS_DA_PROPOSTA.flatMap((de) =>
    STATUS_DA_PROPOSTA.filter(
      (para) => !PERMITIDAS.some(([o, n]) => o === de && n === para),
    ).map((para) => [de, para] as const),
  );

  it("exatamente 20 combinações são proibidas (25 menos as 5 permitidas)", () => {
    expect(proibidas.length).toBe(20);
  });

  it.each(proibidas)("%s -> %s é proibida", (de, para) => {
    expect(podeTransitar(de, para)).toBe(false);
  });

  it("estado igual não é transição, e aplicada/rejeitada/expirada não têm saída", () => {
    for (const s of STATUS_DA_PROPOSTA) expect(podeTransitar(s, s)).toBe(false);
    for (const final of ["aplicada", "rejeitada", "expirada"] as const) {
      for (const para of STATUS_DA_PROPOSTA) expect(podeTransitar(final, para)).toBe(false);
    }
  });

  it("aplicar só sai de aprovada (a trava de verdade)", () => {
    for (const de of STATUS_DA_PROPOSTA) {
      expect(podeTransitar(de, "aplicada")).toBe(de === "aprovada");
    }
  });
});

describe("paridade com o banco: a migration 0699", () => {
  it("TIPOS_DE_PROPOSTA = CHECK de kind", () => {
    expect([...TIPOS_DE_PROPOSTA].sort()).toEqual(listaDoCheck("kind").sort());
  });

  it("RISCOS_DA_PROPOSTA = CHECK de risk (e sem `critico`)", () => {
    expect([...RISCOS_DA_PROPOSTA].sort()).toEqual(listaDoCheck("risk").sort());
    expect(RISCOS_DA_PROPOSTA as readonly string[]).not.toContain("critico");
  });

  it("STATUS_DA_PROPOSTA = CHECK de status", () => {
    expect([...STATUS_DA_PROPOSTA].sort()).toEqual(listaDoCheck("status").sort());
  });

  it("as transições do gatilho (bloco `-- transicoes:`) são as de podeTransitar", () => {
    const m = /^-- transicoes:\s*(.+)$/m.exec(sqlDaMigration());
    if (m === null) throw new Error("bloco `-- transicoes:` não encontrado na função de transição");
    const doBanco = (m[1] as string)
      .split(",")
      .map((par) => par.trim())
      .filter(Boolean)
      .map((par) => par.split(">").map((x) => x.trim()) as [string, string]);
    expect(doBanco.length).toBeGreaterThan(0);

    // Toda transição que o banco declara, o TypeScript permite...
    for (const [de, para] of doBanco) {
      expect(podeTransitar(de as StatusDaProposta, para as StatusDaProposta), `${de}>${para}`).toBe(true);
    }
    // ...e o TypeScript não permite nenhuma que o banco não declare.
    const declaradas = new Set(doBanco.map(([de, para]) => `${de}>${para}`));
    for (const de of STATUS_DA_PROPOSTA) {
      for (const para of STATUS_DA_PROPOSTA) {
        expect(podeTransitar(de, para), `${de}>${para}`).toBe(declaradas.has(`${de}>${para}`));
      }
    }
  });
});
