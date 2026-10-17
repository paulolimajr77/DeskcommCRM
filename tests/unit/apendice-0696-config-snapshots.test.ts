/**
 * O APÊNDICE DO BASELINE É ESPELHO EXATO DA MIGRATION 0696 — mesma cerca da 0687.
 *
 * A migration cria `config_snapshots` e estende `fn_expurgar_config_assistente_vencida`
 * para também expurgar `config_proposals` e `config_snapshots` (F3, dívida de retenção).
 * O kit self-host aplica SÓ o `baseline.sql`; sem espelho exato, o clone recebe SQL
 * diferente e o expurgo nunca toca `config_proposals` nem `config_snapshots`.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const MIGRATION = "supabase/migrations/20261020160000_0696_config_snapshots.sql";

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

describe("o apêndice do baseline espelha a migration 0696", () => {
  it("controle: os dois arquivos existem e não estão vazios", () => {
    expect(existsSync(join(RAIZ, MIGRATION))).toBe(true);
    expect(ler(MIGRATION).length).toBeGreaterThan(1000);
    expect(ler("supabase/baseline.sql").length).toBeGreaterThan(1000);
  });

  it("⭐ o conteúdo da migration aparece no baseline, sem uma única diferença", () => {
    const migration = ler(MIGRATION);
    const baseline = ler("supabase/baseline.sql");

    if (!baseline.includes(migration)) {
      const linhas = migration.split("\n");
      const divergente = linhas.findIndex((l) => l.trim().length > 0 && !baseline.includes(l));
      throw new Error(
        divergente === -1
          ? "O baseline não contém a migration inteira, mas toda linha dela existe nele isolada: " +
            "o apêndice provavelmente está fora de ordem ou cortado."
          : `O apêndice do baseline divergiu da migration a partir da linha ${divergente + 1}:\n` +
            `  ${linhas[divergente]}\n` +
            "Reaplique o bloco a partir da migration. Não edite o baseline à mão.",
      );
    }
    expect(baseline.includes(migration)).toBe(true);
  });

  it("o apêndice entra ANTES da varredura de anon (função nova não pode ficar abaixo dela)", () => {
    const baseline = ler("supabase/baseline.sql");
    // O rótulo repete (apêndice + corpo da migration): ancora na ÚLTIMA ocorrência.
    const bloco = baseline.lastIndexOf("-- ---- snapshots de auditoria do assistente (migration 0696) ----");
    const varredura = baseline.indexOf("-- ---- VARREDURA anon:");
    expect(bloco).toBeGreaterThan(-1);
    expect(varredura).toBeGreaterThan(-1);
    expect(bloco).toBeLessThan(varredura);
  });

  it("o bloco 0696 vem DEPOIS do bloco 0687 e ANTES da varredura de anon", () => {
    const baseline = ler("supabase/baseline.sql");
    const bloco0696 = baseline.lastIndexOf("-- ---- snapshots de auditoria do assistente (migration 0696) ----");
    const bloco0687 = baseline.indexOf("-- ---- chat do assistente interno: config_threads/messages (migration 0687) ----");
    const varredura = baseline.indexOf("-- ---- VARREDURA anon:");
    expect(bloco0687).toBeGreaterThan(-1);
    expect(bloco0696).toBeGreaterThan(bloco0687);
    expect(bloco0696).toBeLessThan(varredura);
  });

  it("a ÚLTIMA definição de fn_expurgar_config_assistente_vencida expurga config_proposals e config_snapshots", () => {
    const baseline = ler("supabase/baseline.sql");
    const ultima = baseline.lastIndexOf("create or replace function public.fn_expurgar_config_assistente_vencida");
    expect(ultima).toBeGreaterThan(-1);
    const resto = baseline.slice(ultima);
    expect(resto).toContain("config_proposals");
    expect(resto).toContain("config_snapshots");
  });

  it("o baseline traz o rótulo 0696 uma única vez", () => {
    const baseline = ler("supabase/baseline.sql");
    const rotulo = "-- ---- snapshots de auditoria do assistente (migration 0696) ----";
    expect(baseline.split(rotulo).length - 1).toBe(1);
  });

  it("a migration é idempotente e portável em psql puro", () => {
    const migration = ler(MIGRATION);
    expect(migration).toContain("create table if not exists public.config_snapshots");
    expect(migration).toContain("create index if not exists config_snapshots_org_taken_idx");
    expect(migration).toContain("create or replace function public.fn_expurgar_config_assistente_vencida");
    expect(migration).toContain(
      "drop policy if exists tenant_isolation_config_snapshots_select on public.config_snapshots",
    );
    expect(migration).toContain(
      "drop policy if exists tenant_isolation_config_snapshots_insert on public.config_snapshots",
    );
    expect(migration).toContain("alter table public.config_snapshots enable row level security;");
    expect(migration).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });

  it("o desenho de segurança está no SQL: RLS ligada, só select+insert à sessão, função só do service_role", () => {
    const migration = ler(MIGRATION);
    expect(migration).toContain("alter table public.config_snapshots enable row level security;");
    expect(migration).toContain("grant select on public.config_snapshots to authenticated;");
    expect(migration).toContain("grant all on public.config_snapshots to service_role;");
    expect(migration).not.toMatch(/grant[^;]*\b(update|delete|all)\b[^;]*to authenticated/i);
    expect(migration).toContain(
      "revoke all    on function public.fn_expurgar_config_assistente_vencida(int, int) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant  execute on function public.fn_expurgar_config_assistente_vencida(int, int) to service_role;",
    );
  });

  it("a função de expurgo fecha as DUAS origens de EXECUTE", () => {
    const migration = ler(MIGRATION);
    const sub1 = "revoke all    on function public.fn_expurgar_config_assistente_vencida(int, int) from public, anon, authenticated;";
    const sub2 = "grant  execute on function public.fn_expurgar_config_assistente_vencida(int, int) to service_role;";
    expect(migration).toContain(sub1);
    expect(migration).toContain(sub2);
  });

  it("o cabeçalho traz a linha `-- manifest:` numa linha só", () => {
    const migration = ler(MIGRATION);
    const linhas = migration.split("\n");
    expect((linhas[0] ?? "").startsWith("-- manifest: ")).toBe(true);
    expect(linhas.filter((l) => l.startsWith("-- manifest:")).length).toBe(1);
  });
});
