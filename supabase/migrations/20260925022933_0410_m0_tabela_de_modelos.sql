-- 0410 — Onda M0 (fundamento de modelos): proposal_templates guarda só
-- CÓPIAS por organização (decisão da spec-mãe §6.1: a base da plataforma mora
-- no código, MODELOS_BASE, nunca no banco com organization_id nulo — a spec
-- de 21/09 pedia base+cópia no mesmo banco, e isso violaria "toda tabela
-- tenant-aware tem organization_id not null" da casa).
--
-- SEM CHECK fechado de slug: os 8 modelos-piloto da spec de 21/09 não estão
-- no repositório (medido em 24/09/2026 — nenhum template.json além dos 3
-- anexos desta spec, que são conteúdo diferente). Inventar o vocabulário
-- agora seria suposição. Validação de slug fica no Zod da aplicação até o
-- piloto de 3 modelos ser definido e uma migration futura fechar o CHECK.
create table if not exists public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  version int not null default 1,
  sections jsonb not null default '[]'::jsonb,
  section_order text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.proposal_templates is
  'Cópia por organização de um modelo de proposta. A base da plataforma (os modelos-piloto) mora no código (MODELOS_BASE), nunca aqui com organization_id nulo — ver spec-mãe §6.1.';

-- Só uma versão ATIVA por slug por organização.
create unique index if not exists proposal_templates_ativo_por_slug_org_uidx
  on public.proposal_templates (organization_id, slug)
  where is_active;

-- Duas linhas não disputam o mesmo número de versão do mesmo slug/organização.
create unique index if not exists proposal_templates_slug_versao_org_uidx
  on public.proposal_templates (organization_id, slug, version);

create index if not exists proposal_templates_org_idx
  on public.proposal_templates (organization_id);

alter table public.proposal_templates enable row level security;

drop policy if exists tenant_isolation_proposal_templates_all on public.proposal_templates;
create policy tenant_isolation_proposal_templates_all on public.proposal_templates
  for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

notify pgrst, 'reload schema';
