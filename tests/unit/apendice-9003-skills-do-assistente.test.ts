/**
 * O APÊNDICE DO BASELINE É ESPELHO EXATO DA MIGRATION 9003 — mesma cerca da 0611.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const MIGRATION = "supabase/migrations/20261022100200_9003_skills_do_assistente.sql";

describe("o apêndice do baseline espelha a migration 9003", () => {
  it("controle: os dois arquivos existem e não estão vazios", () => {
    expect(existsSync(join(RAIZ, MIGRATION))).toBe(true);
    const migration = readFileSync(join(RAIZ, MIGRATION), "utf8");
    const baseline = readFileSync(join(RAIZ, "supabase", "baseline.sql"), "utf8");
    expect(migration.length).toBeGreaterThan(1000);
    expect(baseline.length).toBeGreaterThan(1000);
  });

  it("⭐ o conteúdo da migration aparece no baseline, sem uma única diferença", () => {
    const migration = readFileSync(join(RAIZ, MIGRATION), "utf8");
    const baseline = readFileSync(join(RAIZ, "supabase", "baseline.sql"), "utf8");
    expect(baseline.includes(migration)).toBe(true);
  });
});
