/**
 * O APÊNDICE DO BASELINE É ESPELHO EXATO DA MIGRATION 9006.
 *
 * A migration acrescenta `'acao'` ao CHECK de `kind` e divide o índice de
 * turno único. O kit self-host aplica SÓ o `baseline.sql`; sem espelho exato,
 * o clone recebe SQL diferente e a trava de idempotência de ação não existiria.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const MIGRATION = "supabase/migrations/20261022100500_9006_config_proposals_acao.sql";

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

describe("o apêndice do baseline espelha a migration 9006", () => {
  it("controle: os dois arquivos existem e não estão vazios", () => {
    expect(existsSync(join(RAIZ, MIGRATION))).toBe(true);
    expect(ler(MIGRATION).length).toBeGreaterThan(1000);
    expect(ler("supabase/baseline.sql").length).toBeGreaterThan(1000);
  });

  it("⭐ o conteúdo da migration aparece no baseline, sem uma única diferença", () => {
    const migration = ler(MIGRATION);
    const baseline = ler("supabase/baseline.sql");

    // O corpo da migration (sem as 2 linhas do cabeçalho: -- manifest: e linha vazia).
    const corpo = migration.split("\n").slice(2).join("\n");

    if (!baseline.includes(corpo)) {
      const linhas = corpo.split("\n");
      const divergente = linhas.findIndex((l) => l.trim().length > 0 && !baseline.includes(l));
      throw new Error(
        divergente === -1
          ? "O baseline não contém a migration inteira, mas toda linha dela existe nele isolada."
          : `O apêndice do baseline divergiu da migration a partir da linha ${divergente + 1}:\n` +
            `  ${linhas[divergente]}\n` +
            "Reaplique o bloco a partir da migration. Não edite o baseline à mão.",
      );
    }
    expect(baseline.includes(corpo)).toBe(true);
  });

  it("o apêndice entra ANTES de qualquer varredura de anon posterior", () => {
    const baseline = ler("supabase/baseline.sql");
    const bloco = baseline.lastIndexOf("-- ---- config_proposals acao (migration 9006) ----");
    expect(bloco).toBeGreaterThan(-1);
  });

  it("o baseline traz o bloco 9006 uma única vez (apêndice + rótulo do corpo da migration)", () => {
    const baseline = ler("supabase/baseline.sql");
    const rotulo = "-- ---- config_proposals acao (migration 9006) ----";
    expect(baseline.split(rotulo).length - 1).toBe(2);
    expect(baseline.split("create unique index if not exists config_proposals_acao_turno_unico").length - 1).toBe(1);
  });

  it("a migration é idempotente e portável em psql puro", () => {
    const migration = ler(MIGRATION);
    expect(migration).toContain("drop constraint if exists config_proposals_kind_check");
    expect(migration).toContain("add constraint config_proposals_kind_check check (kind in");
    expect(migration).toContain("'acao'");
    expect(migration).toContain("drop index if exists config_proposals_turno_unico");
    expect(migration).toContain("create unique index if not exists config_proposals_turno_unico");
    expect(migration).toContain("kind <> 'acao'");
    expect(migration).toContain("create unique index if not exists config_proposals_acao_turno_unico");
    expect(migration).toContain("kind = 'acao'");
    expect(migration).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });

  it("o CHECK de kind inclui 'acao' e mantém os 5 anteriores", () => {
    const migration = ler(MIGRATION);
    const m = /check\s*\(\s*kind\s*in\s*\(([^)]*)\)\s*\)/m.exec(migration);
    expect(m).not.toBeNull();
    const valores = [...(m![1] as string).matchAll(/'([^']+)'/g)].map((x) => x[1] as string);
    expect(valores.sort()).toEqual([
      "acao",
      "conhecimento",
      "funil",
      "memoria",
      "modelo_auxiliares",
      "roteador",
    ].sort());
  });

  it("o cabeçalho traz a linha `-- manifest:` numa linha só", () => {
    const migration = ler(MIGRATION);
    const linhas = migration.split("\n");
    expect((linhas[0] ?? "").startsWith("-- manifest: ")).toBe(true);
    expect(linhas.filter((l) => l.startsWith("-- manifest:")).length).toBe(1);
  });
});
