/**
 * O APÊNDICE DO BASELINE É ESPELHO EXATO DA MIGRATION 9007.
 *
 * A migration semeia a skill `assistente-sistema-vivo`. O kit self-host aplica
 * SÓ o `baseline.sql`; sem espelho exato, o clone não recebe a skill de gate de
 * arquitetura.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const MIGRATION = "supabase/migrations/20261022100600_9007_skill_assistente_sistema_vivo.sql";

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

describe("o apêndice do baseline espelha a migration 9007", () => {
  it("controle: os dois arquivos existem e não estão vazios", () => {
    expect(existsSync(join(RAIZ, MIGRATION))).toBe(true);
    expect(ler(MIGRATION).length).toBeGreaterThan(1000);
    expect(ler("supabase/baseline.sql").length).toBeGreaterThan(1000);
  });

  it("⭐ o conteúdo da migration aparece no baseline, sem uma única diferença", () => {
    const migration = ler(MIGRATION);
    const baseline = ler("supabase/baseline.sql");

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

  it("o baseline traz o bloco 9007 uma única vez (apêndice + rótulo do corpo da migration)", () => {
    const baseline = ler("supabase/baseline.sql");
    const rotulo = "-- ---- skill assistente-sistema-vivo (migration 9007) ----";
    expect(baseline.split(rotulo).length - 1).toBe(2);
  });

  it("a migration é idempotente e portável em psql puro", () => {
    const migration = ler(MIGRATION);
    expect(migration).toContain("assistente-sistema-vivo");
    expect(migration).toContain("do $seed$");
    expect(migration).toContain("end\n$seed$;");
    expect(migration).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });

  it("o corpo da skill cabe em 200 linhas", () => {
    const migration = ler(MIGRATION);
    const corpos = [...migration.matchAll(/\$corpo_sv\$([\s\S]*?)\$corpo_sv\$/g)].map((m) => m[1] ?? "");
    expect(corpos).toHaveLength(1);
    expect(corpos[0]!.split("\n").length).toBeLessThanOrEqual(200);
  });

  it("o cabeçalho traz a linha `-- manifest:` numa linha só", () => {
    const migration = ler(MIGRATION);
    const linhas = migration.split("\n");
    expect((linhas[0] ?? "").startsWith("-- manifest: ")).toBe(true);
    expect(linhas.filter((l) => l.startsWith("-- manifest:")).length).toBe(1);
  });
});
