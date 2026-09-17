-- 20260917160000_0275_proposta_comercial.sql
--
-- A organização emite para um contato, com itens, valor e prazo, cujo desfecho volta para o funil. Ver
-- docs/superpowers/specs/2026-09-16-proposta-comercial-design.md.
--
-- Numeração e versão são decisão do dono (spec §5.3/§5.4): numero+ano
-- nascem NULL no rascunho — só existem quando a proposta é ENVIADA — e uma
-- revisão de proposta enviada cria uma v2 que HERDA o número da v1.

create table if not exists public.crm_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'rascunho'
    check (status in ('rascunho','enviada','aceita','recusada','vencida','cancelada','substituida')),
  titulo text not null,
  condicoes text,
  total_cents bigint not null default 0,
  moeda text not null default 'BRL',
  valid_until date,
  pdf_path text,
  numero integer,
  ano integer,
  versao integer not null default 1,
  substitui_id uuid references public.crm_proposals(id) on delete set null,
  drafted_by_agent_id uuid references public.ai_agents(id) on delete set null,
  revision bigint not null default 1,
  sent_at timestamptz,
  sent_by_user_id uuid references auth.users(id),
  decided_at timestamptz,
  decided_by_user_id uuid references auth.users(id),
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_proposals_moeda_iso check (moeda ~ '^[A-Z]{3}$'),
  constraint crm_proposals_total_nao_negativo check (total_cents >= 0),
  constraint crm_proposals_numero_ano_juntos check ((numero is null) = (ano is null))
);

create index if not exists crm_proposals_org_lead_idx
  on public.crm_proposals(organization_id, lead_id);
create index if not exists crm_proposals_org_status_idx
  on public.crm_proposals(organization_id, status);
-- Só uma proposta pode ocupar um número por organização/ano — parcial porque
-- rascunho nunca tem numero/ano.
create unique index if not exists crm_proposals_numero_ano_org_uidx
  on public.crm_proposals(organization_id, ano, numero) where numero is not null;

create table if not exists public.crm_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.crm_proposals(id) on delete cascade,
  product_id uuid references public.catalog_products(id) on delete set null,
  descricao text not null,
  quantidade numeric not null default 1,
  preco_unitario_cents bigint not null,
  desconto_cents bigint not null default 0,
  -- fractional indexing, igual position_in_stage — NUNCA int (CLAUDE.md).
  position numeric not null,
  created_at timestamptz not null default now(),
  constraint crm_proposal_items_quantidade_positiva check (quantidade > 0),
  constraint crm_proposal_items_preco_nao_negativo check (preco_unitario_cents >= 0),
  constraint crm_proposal_items_desconto_nao_negativo check (desconto_cents >= 0)
);
create index if not exists crm_proposal_items_proposal_idx
  on public.crm_proposal_items(proposal_id, position);

alter table public.crm_proposals enable row level security;
alter table public.crm_proposal_items enable row level security;

-- Leitura: qualquer papel da organização. Escrita do RASCUNHO: `agent` monta
-- e deixa pronto (spec §16, decisão 2). O ENVIO exige `manager`/`admin`, mas
-- isso é gate DE ROTA (Tarefa 14), não de RLS — a RLS não distingue "criar
-- rascunho" de "marcar enviada" dentro de um UPDATE genérico.
drop policy if exists crm_proposals_select on public.crm_proposals;
create policy crm_proposals_select on public.crm_proposals
  for select using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists crm_proposals_write on public.crm_proposals;
create policy crm_proposals_write on public.crm_proposals
  for all
  using (organization_id in (select public.fn_user_org_ids())
         and public.fn_role_at_least(organization_id, 'agent'))
  with check (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, 'agent'));

drop policy if exists crm_proposal_items_select on public.crm_proposal_items;
create policy crm_proposal_items_select on public.crm_proposal_items
  for select using (
    exists (
      select 1 from public.crm_proposals p
      where p.id = crm_proposal_items.proposal_id
        and p.organization_id in (select public.fn_user_org_ids())
    )
  );

drop policy if exists crm_proposal_items_write on public.crm_proposal_items;
create policy crm_proposal_items_write on public.crm_proposal_items
  for all
  using (
    exists (
      select 1 from public.crm_proposals p
      where p.id = crm_proposal_items.proposal_id
        and p.organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(p.organization_id, 'agent')
    )
  )
  with check (
    exists (
      select 1 from public.crm_proposals p
      where p.id = crm_proposal_items.proposal_id
        and p.organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(p.organization_id, 'agent')
    )
  );

revoke all on public.crm_proposals from anon;
revoke all on public.crm_proposal_items from anon;
grant select, insert, update, delete on public.crm_proposals to authenticated;
grant select, insert, update, delete on public.crm_proposal_items to authenticated;
grant all on public.crm_proposals to service_role;
grant all on public.crm_proposal_items to service_role;

drop trigger if exists trg_crm_proposals_updated_at on public.crm_proposals;
create trigger trg_crm_proposals_updated_at
  before update on public.crm_proposals
  for each row execute function public.fn_set_updated_at();

comment on table public.crm_proposals is
  'Documento comercial emitido para um contato: itens, valor, prazo. Desfecho volta ao funil.';
comment on column public.crm_proposals.numero is
  'Nasce NULL. Alocado só no ENVIO — rascunho descartado não queima número (spec §5.3).';
comment on column public.crm_proposals.versao is
  'v2 herda numero/ano da v1 quando uma proposta ENVIADA é revisada (spec §5.4).';

-- Numeração: aloca dentro da MESMA transação do envio. A rota que chama isto
-- (Tarefa 14) captura 23505 (unique_violation do índice parcial acima) e
-- tenta de novo — é o padrão de idempotência que o repositório já usa.
create or replace function public.fn_proposta_aloca_numero(p_org uuid, p_ano int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(numero), 0) + 1
  from public.crm_proposals
  where organization_id = p_org and ano = p_ano;
$$;

revoke all on function public.fn_proposta_aloca_numero(uuid, int) from public, anon;
grant execute on function public.fn_proposta_aloca_numero(uuid, int) to authenticated, service_role;

-- Bucket privado, URL sempre assinada — mesmo padrão de `lgpd-exports`.
insert into storage.buckets (id, name, public)
values ('propostas', 'propostas', false)
on conflict (id) do nothing;

drop policy if exists "propostas: leitura por organizacao" on storage.objects;
create policy "propostas: leitura por organizacao" on storage.objects
  for select using (
    bucket_id = 'propostas'
    and (storage.foldername(name))[1]::uuid in (select public.fn_user_org_ids())
  );

drop policy if exists "propostas: escrita por service_role" on storage.objects;
create policy "propostas: escrita por service_role" on storage.objects
  for all using (bucket_id = 'propostas' and auth.role() = 'service_role')
  with check (bucket_id = 'propostas' and auth.role() = 'service_role');

-- Três `kind` novos em agent_inbox_items. Medido em 2026-09-17 contra
-- supabase/baseline.sql: `agent_inbox_items_kind_check` reconstruída aqui com
-- a lista COMPLETA (26 valores vigentes + os 3 novos + 'other') porque esta é
-- a última migration da cadeia a tocar essa constraint — a cadeia
-- (`supabase db push`) não tem o "bloco único" do apêndice do baseline.sql, e
-- `tests/unit/kind-check-migration-x-baseline.test.ts` cobra que a ÚLTIMA
-- migration que a reconstrói bata, valor a valor, com o baseline.
alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required', 'appointment_recovery_review', 'qr_rescan',
    'routing_unassigned', 'job_dead', 'event_dead', 'budget_exceeded', 'handoff',
    'promotion_review', 'judge_unaligned', 'followup_dead', 'snooze_expired',
    'next_action_ambiguous', 'risk_backlog_seeded', 'reactivation_expired',
    'capabilities_missing', 'message_send_stuck', 'midia_nao_lida',
    'channel_template_review', 'channel_number_alert', 'promise_unfulfilled',
    'contact_proposal_expired', 'budget_warning', 'conhecimento_nao_indexado',
    'voice_call_missed', 'case_stale',
    -- proposta comercial (migration 0275):
    'proposal_expired_notice', 'proposal_acceptance_rate_drop', 'proposal_promised_not_created',
    'other'
  ));

-- A tarefa gravada a partir de um aviso de promessa (Tarefa 1) precisa dizer
-- DE ONDE veio, sem exigir que toda `crm_tasks` tenha origem — vocabulário
-- ABERTO (sem CHECK), mesmo padrão de `crm_lead_activities.type` (CLAUDE.md
-- doutrina de Migrations, exceção DIRC): o emissor usa a constante
-- compartilhada de `lib/tarefas/vocabulario-de-origem.ts`, nunca string solta.
alter table public.crm_tasks
  add column if not exists source_kind text;
comment on column public.crm_tasks.source_kind is
  'De onde a tarefa nasceu (ex.: promised_proposal). NULL = criada à mão. Vocabulário aberto — TypeScript, sem CHECK.';
