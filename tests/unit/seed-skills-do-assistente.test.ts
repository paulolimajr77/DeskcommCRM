/**
 * SEED DAS SKILLS DO ASSISTENTE (migration 9003) — convenções medidas no arquivo.
 *
 * As 4 skills `assistente-*` são lidas pelo chat via loadSkills+matchSkills.
 * Duas regras mecânicas: corpo com no máximo 200 linhas (teto de
 * `MAX_SKILL_BODY_LINES`, cobrado no insert da aplicação mas NÃO no seed SQL
 * — sem esta cerca o seed passaria com corpo que a aplicação recusa) e
 * `matcher` JSON válido no schema (`any_keywords` obrigatório).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const MIGRATION = "supabase/migrations/20261022100200_9003_skills_do_assistente.sql";
const MIGRATION_9007 = "supabase/migrations/20261022100600_9007_skill_assistente_sistema_vivo.sql";

function corpos(): string[] {
  const sql = readFileSync(join(RAIZ, MIGRATION), "utf8");
  return [...sql.matchAll(/\$body\$([\s\S]*?)\$body\$/g)].map((m) => m[1] ?? "");
}

function matchers(): unknown[] {
  const sql = readFileSync(join(RAIZ, MIGRATION), "utf8");
  return [...sql.matchAll(/'(\{"any_keywords".*?\})'::jsonb/g)].map((m) => JSON.parse(m[1] ?? "{}"));
}

describe("seed das skills do assistente", () => {
  it("semeia exatamente as 4 skills assistente-* na 9003", () => {
    const sql = readFileSync(join(RAIZ, MIGRATION), "utf8");
    for (const nome of ["assistente-operacao", "assistente-metricas", "assistente-prompt", "assistente-cliente-novo"]) {
      expect(sql).toContain(`name = '${nome}'`);
    }
    expect(corpos()).toHaveLength(4);
  });

  it("semeia a skill assistente-sistema-vivo na 9007", () => {
    const sql = readFileSync(join(RAIZ, MIGRATION_9007), "utf8");
    expect(sql).toContain("name = 'assistente-sistema-vivo'");
  });

  it("nenhum corpo passa de 200 linhas (9003)", () => {
    for (const corpo of corpos()) {
      expect(corpo.split("\n").length).toBeLessThanOrEqual(200);
    }
  });

  it("o corpo da 9007 cabe em 200 linhas", () => {
    const sql = readFileSync(join(RAIZ, MIGRATION_9007), "utf8");
    const corpos = [...sql.matchAll(/\$corpo_sv\$([\s\S]*?)\$corpo_sv\$/g)].map((m) => m[1] ?? "");
    expect(corpos).toHaveLength(1);
    expect(corpos[0]!.split("\n").length).toBeLessThanOrEqual(200);
  });

  it("todo matcher tem any_keywords não vazio", () => {
    const lista = matchers();
    expect(lista).toHaveLength(4);
    for (const m of lista) {
      const matcher = m as { any_keywords?: unknown };
      expect(Array.isArray(matcher.any_keywords)).toBe(true);
      expect((matcher.any_keywords as unknown[]).length).toBeGreaterThan(0);
    }
  });
});
