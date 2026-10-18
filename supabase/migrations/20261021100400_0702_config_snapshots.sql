-- manifest: **Snapshots de auditoria do tenant (F3).** Cria `config_snapshots`
-- para guardar um retrato por rodada da auditoria da organização (estado de
-- cada verificação, contagem de pendências), permitindo à tela mostrar a
-- evolução ("ontem faltavam 5, hoje 3"). Retenção igual à do tenant; o expurgo
-- é ligado no cron `data-retention` (F3). Apêndice idempotente no baseline.
-- ---- snapshots de auditoria do assistente (migration 0702) ----
create table if not exists public.config_snapshots (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  taken_at          timestamptz not null default now(),
  taken_by          uuid references auth.users(id) on delete set null,
  resultado         jsonb not null check (jsonb_typeof(resultado) = 'object' and octet_length(resultado::text) <= 65536),
  pendencias        int not null check (pendencias >= 0),
  created_at        timestamptz not null default now()
);

-- A fila na tela (snapshots da org, do mais novo para o mais velho).
create index if not exists config_snapshots_org_taken_idx
  on public.config_snapshots (organization_id, taken_at desc);

alter table public.config_snapshots enable row level security;

-- ── Privilégio: o login (sessão) só LÊ e INSERE ──────────────────────────
revoke all on public.config_snapshots from anon, authenticated;
grant select, insert on public.config_snapshots to authenticated;
grant all on public.config_snapshots to service_role;

-- ── RLS: qualquer membro da org lê os snapshots dela; só admin insere ─────
drop policy if exists tenant_isolation_config_snapshots_select on public.config_snapshots;
create policy tenant_isolation_config_snapshots_select
  on public.config_snapshots
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
  );
drop policy if exists tenant_isolation_config_snapshots_insert on public.config_snapshots;
create policy tenant_isolation_config_snapshots_insert
  on public.config_snapshots
  for insert to authenticated
  with check (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin')
    and taken_by = auth.uid()
  );

-- Trava de suporte (mesma razão da 0699: o baseline concede default privileges
-- que dariam UPDATE/DELETE a authenticated sem este revoke).
revoke all on public.config_snapshots from anon, authenticated;
grant select, insert on public.config_snapshots to authenticated;

-- ── Extensão do expurgo de config assistente (F3, dívida de retenção) ───────
-- `fn_expurgar_config_assistente_vencida` existe desde a 0698 (F1) e só
-- apagava `config_messages` e `config_threads`. A F3 acrescenta
-- `config_proposals` vencidas e `config_snapshots` além da retenção — mesmo
-- corpo no baseline, para o kit self-host não divergir.
create or replace function public.fn_expurgar_config_assistente_vencida(
  p_retencao_dias int default null,
  p_limite int default null
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dias int := greatest(coalesce(p_retencao_dias, 365), 90);
  v_limite int := least(greatest(coalesce(p_limite, 1000), 1), 10000);
  v_apagadas int := 0;
  v_n int;
begin
  -- config_messages (0698, existente — mantido)
  with vencidas as (
    select m.id from public.config_messages m
     where m.created_at < now() - make_interval(days => v_dias)
     order by m.created_at
     limit v_limite
  )
  delete from public.config_messages m using vencidas v where m.id = v.id;
  get diagnostics v_n = row_count;
  v_apagadas := v_apagadas + v_n;

  -- config_threads órfãos (0698, existente — mantido)
  with orfas as (
    select t.id from public.config_threads t
     where t.created_at < now() - make_interval(days => v_dias)
       and not exists (select 1 from public.config_messages m where m.thread_id = t.id)
     order by t.created_at
     limit v_limite
  )
  delete from public.config_threads t using orfas o where t.id = o.id;
  get diagnostics v_n = row_count;
  v_apagadas := v_apagadas + v_n;

  -- config_proposals expiradas (F3, nova — proposta vencida nunca se aplica)
  with prop_vencidas as (
    select p.id from public.config_proposals p
     where p.expires_at < now() - make_interval(days => v_dias)
     order by p.expires_at
     limit v_limite
  )
  delete from public.config_proposals p using prop_vencidas v where p.id = v.id;
  get diagnostics v_n = row_count;
  v_apagadas := v_apagadas + v_n;

  -- config_snapshots além da retenção (F3, nova — retrato guarda evolução,
  -- mas não para sempre)
  with snaps_velhos as (
    select s.id from public.config_snapshots s
     where s.taken_at < now() - make_interval(days => v_dias)
     order by s.taken_at
     limit v_limite
  )
  delete from public.config_snapshots s using snaps_velhos v where s.id = v.id;
  get diagnostics v_n = row_count;
  v_apagadas := v_apagadas + v_n;

  return v_apagadas;
end;
$$;

-- As DUAS origens de EXECUTE (mesma razão da 0698: fechar ambas).
revoke all    on function public.fn_expurgar_config_assistente_vencida(int, int) from public, anon, authenticated;
grant  execute on function public.fn_expurgar_config_assistente_vencida(int, int) to service_role;

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
