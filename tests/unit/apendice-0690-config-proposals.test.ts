/**
 * O APÊNDICE DO BASELINE É ESPELHO EXATO DA MIGRATION 0690 — mesma cerca da 0687.
 *
 * A migration cria `config_proposals` (propostas de configuração do assistente
 * interno, F2b). O kit self-host aplica SÓ o `baseline.sql`; sem espelho exato, o
 * clone recebe SQL diferente do que o repositório diz entregar — e a trava que
 * impede "aplicar sem aprovar" (o gatilho) simplesmente não existiria nele.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const MIGRATION = "supabase/migrations/20261020110000_0690_config_proposals.sql";

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

describe("o apêndice do baseline espelha a migration 0690", () => {
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
    const bloco = baseline.lastIndexOf("-- ---- propostas de configuração do assistente (migration 0690) ----");
    const varredura = baseline.indexOf("-- ---- VARREDURA anon:");
    expect(bloco).toBeGreaterThan(-1);
    expect(varredura).toBeGreaterThan(-1);
    expect(bloco).toBeLessThan(varredura);
  });

  it("o baseline traz o bloco 0690 uma única vez", () => {
    const baseline = ler("supabase/baseline.sql");
    const rotulo = "-- ---- propostas de configuração do assistente (migration 0690) ----";
    // O rótulo aparece duas vezes por desenho (o do apêndice e o do cabeçalho do próprio
    // corpo da migration, como nos blocos 0687/0694/0695): nunca mais que isso.
    expect(baseline.split(rotulo).length - 1).toBe(2);
    expect(baseline.split("create table if not exists public.config_proposals").length - 1).toBe(1);
  });

  it("a migration é idempotente e portável em psql puro", () => {
    const migration = ler(MIGRATION);
    expect(migration).toContain("create table if not exists public.config_proposals");
    expect(migration).toContain("create index if not exists config_proposals_fila_idx");
    expect(migration).toContain("create index if not exists config_proposals_thread_idx");
    expect(migration).toContain("create unique index if not exists config_proposals_turno_unico");
    expect(migration).toContain("create or replace function public.fn_config_proposals_transicao()");
    expect(migration).toContain(
      "drop policy if exists tenant_isolation_config_proposals_select on public.config_proposals",
    );
    expect(migration).toContain(
      "drop policy if exists tenant_isolation_config_proposals_insert on public.config_proposals",
    );
    expect(migration).toContain("drop trigger if exists config_proposals_transicao_bu on public.config_proposals");
    expect(migration).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });

  it("o desenho de segurança está no SQL: revoke primeiro, só select+insert à sessão, RLS ligada", () => {
    const migration = ler(MIGRATION);
    const revoke = migration.indexOf("revoke all on public.config_proposals from anon, authenticated;");
    const grant = migration.indexOf("grant select, insert on public.config_proposals to authenticated;");
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
    expect(migration).toContain("grant all on public.config_proposals to service_role;");
    expect(migration).toContain("alter table public.config_proposals enable row level security;");
    // authenticated NUNCA recebe update/delete: aprovar e aplicar são do servidor.
    expect(migration).not.toMatch(/grant[^;]*\b(update|delete|all)\b[^;]*to authenticated/i);
    // crítico não existe na tabela (spec §6/§7b).
    expect(migration).toContain("check (risk in ('seguro','atencao'))");
  });

  it("a função de transição fecha as DUAS origens de EXECUTE", () => {
    const migration = ler(MIGRATION);
    expect(migration).toContain(
      "revoke all on function public.fn_config_proposals_transicao() from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.fn_config_proposals_transicao() to service_role;",
    );
  });

  it("a policy de inserção exige admin, autoria e nascimento sem carimbo", () => {
    const migration = ler(MIGRATION);
    const inicio = migration.indexOf("create policy tenant_isolation_config_proposals_insert");
    const fim = migration.indexOf(");", inicio);
    const corpo = migration.slice(inicio, fim);
    for (const trecho of [
      "organization_id in (select public.fn_user_org_ids())",
      "public.fn_role_at_least(organization_id, 'admin')",
      "requested_by = auth.uid()",
      "status = 'pendente'",
      "decided_by is null",
      "decided_at is null",
      "applied_by is null",
      "applied_at is null",
      "apply_result is null",
    ]) {
      expect(corpo, trecho).toContain(trecho);
    }
  });

  it("a migration replanta as travas de suporte e blinda o carimbo da decisão", () => {
    const migration = ler(MIGRATION);
    expect(migration).toContain("do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;");
    expect(migration).toContain("old.decided_at is not null");
    expect(migration).toContain("status = 'pendente' and decided_by is null and decided_at is null and decision_reason is null");
  });

  it("o cabeçalho traz a linha `-- manifest:` numa linha só", () => {
    const migration = ler(MIGRATION);
    const linhas = migration.split("\n");
    expect((linhas[0] ?? "").startsWith("-- manifest: ")).toBe(true);
    expect(linhas.filter((l) => l.startsWith("-- manifest:")).length).toBe(1);
  });
});
