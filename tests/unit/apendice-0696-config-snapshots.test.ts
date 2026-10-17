/**
 * O APÊNDICE DO BASELINE É ESPELHO EXATO DA MIGRATION 0696 — mesma cerca da 0690.
 *
 * A migration cria `config_snapshots` (propostas de configuração do assistente
 * interno, F2b). O kit self-host aplica SÓ o `baseline.sql`; sem espelho exato, o
 * clone recebe SQL diferente do que o repositório entrega — e a retenção de
 * snapshots não chegaria em quem instalou.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const MIGRATION = "supabase/migrations/20261020140000_0696_config_snapshots.sql";

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

describe("o apêndice do baseline espelha a migration 0696", () => {
  it("controle: os dois arquivos existem e não estão vazios", () => {
    expect(existsSync(join(RAIZ, MIGRATION))).toBe(true);
    expect(ler(MIGRATION).length).toBeGreaterThan(1000);
    expect(ler("supabase/baseline.sql").length).toBeGreaterThan(1000);
  });

  it("o apêndice entra ANTES do bloco da VARREDURA anon (que é o último do arquivo)", () => {
    const baseline = ler("supabase/baseline.sql");
    // O rótulo repete (apêndice + corpo da migration): ancora na ÚLTIMA ocorrência.
    const bloco = baseline.lastIndexOf("-- ---- snapshots de auditoria do assistente (migration 0696) ----");
    const varredura = baseline.indexOf("E entra ANTES do bloco da VARREDURA anon");
    expect(bloco).toBeGreaterThan(-1);
    expect(varredura).toBeGreaterThan(-1);
    expect(bloco).toBeLessThan(varredura);
  });

  it("o baseline traz o bloco 0696 uma única vez", () => {
    const baseline = ler("supabase/baseline.sql");
    const rotulo = "-- ---- snapshots de auditoria do assistente (migration 0696) ----";
    // O rótulo aparece uma vez no baseline (apêndice inserido como bloco único).
    expect(baseline.split(rotulo).length - 1).toBe(1);
    expect(baseline.split("create table if not exists public.config_snapshots").length - 1).toBe(1);
  });

  it("a migration é idempotente e portável em psql puro", () => {
    const migration = ler(MIGRATION);
    expect(migration).toContain("create table if not exists public.config_snapshots");
    expect(migration).toContain("create index if not exists config_snapshots_org_taken_idx");
    expect(migration).toContain("alter table public.config_snapshots enable row level security;");
    expect(migration).toContain("revoke all on public.config_snapshots from anon, authenticated;");
    expect(migration).toContain("grant select on public.config_snapshots to authenticated;");
    expect(migration).toContain("grant all on public.config_snapshots to service_role;");
    expect(migration).toContain("do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;");
    expect(migration).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });

  it("o desenho de segurança está no SQL", () => {
    const migration = ler(MIGRATION);
    const revoke = migration.indexOf("revoke all on public.config_snapshots from anon, authenticated;");
    const grant = migration.indexOf("grant select on public.config_snapshots to authenticated;");
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
    expect(migration).toContain("grant all on public.config_snapshots to service_role;");
    expect(migration).toContain("alter table public.config_snapshots enable row level security;");
    // authenticated NUNCA recebe update/delete: aprovar e aplicar são do servidor.
    expect(migration).not.toMatch(/grant[^;]*\b(update|delete|all)\b[^;]*to authenticated/i);
  });

  it("o cabeçalho traz a linha `-- manifest:` numa linha só", () => {
    const migration = ler(MIGRATION);
    const linhas = migration.split("\n");
    expect((linhas[0] ?? "").startsWith("-- manifest:")).toBe(true);
    expect(linhas.filter((l) => l.startsWith("-- manifest:")).length).toBe(1);
  });
});
