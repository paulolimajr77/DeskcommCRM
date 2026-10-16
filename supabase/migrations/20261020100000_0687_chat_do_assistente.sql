-- manifest: **Chat do assistente interno, F1 leitura (spec 2026-10-14-agente-interno-config-design).** Cria `config_threads` + `config_messages` (histórico do chat de leitura do assistente). Leitura RLS por org + papel `viewer` (dúvida e leitura valem para qualquer papel) + DONO da conversa (created_by = auth.uid(): a resposta carrega números de métricas com papel mínimo); escrita SÓ via service_role nas rotas (revoke fecha o PostgREST); idempotência por `turn_id`; expurgo com piso. Sem `contact_id` de propósito: o chat fala de configuração e agregados, nunca de titular — a cascata de LGPD não é tocada. Idempotente; apêndice igual no `baseline.sql`.

-- ---- chat do assistente interno: config_threads/messages (migration 0687) ----
create table if not exists public.config_threads (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  kind              text not null default 'leitura'
    check (kind in ('leitura')),
  created_by        uuid,
  last_message_at   timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists public.config_messages (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references public.config_threads(id) on delete cascade,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  -- Agrupa pergunta + resposta. GERADO NO CLIENTE: dá a idempotência do POST
  -- sem copiar corpo em `idempotency_keys` (fora da cascata de LGPD).
  turn_id           uuid not null,
  author_kind       text not null check (author_kind in ('human', 'ai')),
  -- `on delete set null`: a saída de uma pessoa não apaga o que ela perguntou.
  author_user_id    uuid,
  -- null quando a resposta falhou. Sem coluna `status`: seria a segunda
  -- representação do mesmo fato.
  body              text,
  error_code        text,
  created_at        timestamptz not null default now(),
  constraint config_messages_turno_unico
    unique (organization_id, thread_id, turn_id, author_kind)
);

create index if not exists config_threads_org_idx
  on public.config_threads (organization_id, created_at);
create index if not exists config_messages_thread_idx
  on public.config_messages (organization_id, thread_id, created_at);
-- O expurgo ordena por `created_at`.
create index if not exists config_messages_purga_idx
  on public.config_messages (created_at);

alter table public.config_threads enable row level security;
alter table public.config_messages enable row level security;

-- ── Privilégio: leitura pelo login, escrita SÓ pelo servidor ───────────────
-- `revoke all` PRIMEIRO porque o `ALTER DEFAULT PRIVILEGES … GRANT ALL ON
-- TABLES TO "authenticated"` do baseline vem ANTES de toda tabela de apêndice:
-- sem o revoke, a tabela nasce com INSERT/UPDATE/DELETE para `authenticated` e
-- a policy seria a única coisa entre um `viewer` e a escrita. Mesmo desenho da
-- 0281 (`agent_case_chat_messages`).
revoke all    on public.config_threads from anon, authenticated;
grant  select on public.config_threads to authenticated;
grant  all    on public.config_threads to service_role;
revoke all    on public.config_messages from anon, authenticated;
grant  select on public.config_messages to authenticated;
grant  all    on public.config_messages to service_role;

-- ── RLS: organização + papel + DONO ────────────────────────────────────────
-- Policy POR COMANDO (`for select`), nunca `for all`: não existe caminho de
-- escrita pelo PostgREST, porque o `revoke` acima o fechou. Leitura exige
-- papel `viewer` ou acima (o chat de leitura e de dúvidas vale para qualquer papel)
-- E ser o DONO da conversa (`created_by = auth.uid()`): a resposta do assistente
-- carrega números de métricas que têm papel mínimo (financeiro, conversões, desempenho),
-- e a trava de papel só vale na hora da consulta. Sem o dono, um `viewer` leria, pela
-- tela ou direto pelo PostgREST, o que um gerente perguntou e o assistente respondeu.
drop policy if exists tenant_isolation_config_threads_select on public.config_threads;
create policy tenant_isolation_config_threads_select
  on public.config_threads
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'viewer')
    and created_by = auth.uid()
  );
drop policy if exists tenant_isolation_config_messages_select on public.config_messages;
create policy tenant_isolation_config_messages_select
  on public.config_messages
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'viewer')
    and exists (
      select 1 from public.config_threads t
      where t.id = config_messages.thread_id
        and t.organization_id = config_messages.organization_id
        and t.created_by = auth.uid()
    )
  );

-- ── Retenção: a tabela nasce com dono de piso ──────────────────────────────
-- Piso 90 no corpo (não no argumento): knob não vira apagador de rastro
-- recente. Segue a retenção operacional do tenant (decisão §8.4 da spec);
-- o chamador (cron) passa `p_retencao_dias` do tenant.
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
  with vencidas as (
    select m.id from public.config_messages m
     where m.created_at < now() - make_interval(days => v_dias)
     order by m.created_at
     limit v_limite
  )
  delete from public.config_messages m using vencidas v where m.id = v.id;
  get diagnostics v_n = row_count;
  v_apagadas := v_apagadas + v_n;
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
  return v_apagadas;
end;
$$;
-- As DUAS origens de EXECUTE: o `ALTER DEFAULT PRIVILEGES … GRANT ALL ON
-- FUNCTIONS TO anon` do baseline (que `revoke from public` não remove) e o
-- grant implícito a PUBLIC de toda função nova (que `revoke from anon` não
-- remove). Fechar uma só deixa a função exposta com o gate verde.
revoke all    on function public.fn_expurgar_config_assistente_vencida(int, int) from public, anon, authenticated;
grant  execute on function public.fn_expurgar_config_assistente_vencida(int, int) to service_role;
