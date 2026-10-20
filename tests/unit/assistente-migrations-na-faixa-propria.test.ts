/**
 * A faixa 9000 é exclusiva do fork do assistente interno.
 *
 * Caso 1: toda migration cujo nome contém `assistente`, `config_proposals` ou
 * `config_snapshots` tem número ≥ 9000.
 *
 * Caso 2: nenhuma migration FORA dessa lista tem número ≥ 9000. Se o produto
 * um dia chegar ao 9000, este teste avisa que a faixa colidiu.
 *
 * O NNNN é lido com a âncora canônica `^[0-9]{14}_([0-9]{4})_`.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "supabase", "migrations");

// Âncora canônica: timestamp de 14 dígitos, underline, NNNN de 4 dígitos, underline, slug.
const NUMERO = /^[0-9]{14}_([0-9]{4})_/;

/** É do assistente interno? Nome da migration (sem .sql) contém um dos marcadores. */
function ehDoAssistente(nome: string): boolean {
  const lower = nome.toLowerCase();
  return (
    lower.includes("assistente") ||
    lower.includes("config_proposals") ||
    lower.includes("config_snapshots")
  );
}

function numerosDasMigrations(): { arquivo: string; numero: number; ehDoAssistente: boolean }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((arquivo) => {
      const m = NUMERO.exec(arquivo);
      return {
        arquivo,
        numero: m ? Number(m[1]) : -1,
        ehDoAssistente: ehDoAssistente(arquivo.replace(/\.sql$/, "")),
      };
    })
    .filter((m) => m.numero > 0);
}

describe("assistente — migrations na faixa própria (9000)", () => {
  it("toda migration do assistente interno tem número >= 9000", () => {
    const foraDaFaixa = numerosDasMigrations().filter(
      (m) => m.ehDoAssistente && m.numero < 9000,
    );
    expect(
      foraDaFaixa.map((m) => m.arquivo),
      "migration do assistente abaixo de 9000 — ainda não foi renumerada",
    ).toEqual([]);
  });

  it("nenhuma migration fora da lista do assistente usa número >= 9000", () => {
    const invasoras = numerosDasMigrations().filter(
      (m) => !m.ehDoAssistente && m.numero >= 9000,
    );
    expect(
      invasoras.map((m) => m.arquivo),
      "migration não-assistente na faixa 9000 — colisão com o fork",
    ).toEqual([]);
  });
});
