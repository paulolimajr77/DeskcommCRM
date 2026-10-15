/**
 * O APÊNDICE DO BASELINE É ESPELHO EXATO DA MIGRATION 0677 — mesma cerca da 0675.
 *
 * O kit self-host aplica SÓ o `baseline.sql`. Uma migration que não está no
 * apêndice não chega a quem instalou numa VPS; e as colunas novas de
 * `ai_budgets` são lidas por `lib/assistente/limites.ts` e escritas pelo
 * `PATCH /api/v1/ai/budget` — sem elas, o limite de perguntas quebra em quem
 * atualizou pelo `update.sh`.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const MIGRATION = "supabase/migrations/20261019080002_0677_limites_de_perguntas_do_assistente.sql";

describe("o apêndice do baseline espelha a migration 0677", () => {
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

  it("a migration é idempotente: coluna, constraint e índice se refazem sem erro", () => {
    const migration = readFileSync(join(RAIZ, MIGRATION), "utf8");
    expect(migration).toContain("add column if not exists assistant_questions_per_user_day integer not null default 60");
    expect(migration).toContain("add column if not exists assistant_questions_per_org_day integer");
    expect(migration).toContain("drop constraint if exists ai_budgets_assistant_per_user_day_check");
    expect(migration).toContain("drop constraint if exists ai_budgets_assistant_per_org_day_check");
    expect(migration).toContain("create index if not exists config_messages_contagem_idx");
    expect(migration).not.toMatch(/\b(begin|commit)\s*;/i);
  });

  it("as faixas do banco são as mesmas que a rota e a biblioteca usam", () => {
    const migration = readFileSync(join(RAIZ, MIGRATION), "utf8");
    expect(migration).toContain("assistant_questions_per_user_day between 1 and 10000");
    expect(migration).toContain(
      "assistant_questions_per_org_day is null or assistant_questions_per_org_day between 1 and 100000",
    );
  });

  it("o cabeçalho traz a linha `-- manifest:` numa linha só", () => {
    const migration = readFileSync(join(RAIZ, MIGRATION), "utf8");
    const primeira = migration.split("\n")[0] ?? "";
    expect(primeira.startsWith("-- manifest: ")).toBe(true);
  });
});
