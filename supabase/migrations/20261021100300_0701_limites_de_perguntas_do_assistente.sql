-- manifest: **Limites de perguntas do assistente interno, definidos pelo administrador (spec 2026-10-14-agente-interno-planos, T6).** Duas colunas em `ai_budgets` — `assistant_questions_per_user_day` (padrão 60) e `assistant_questions_per_org_day` (null = sem limite) — com CHECK de faixa, e o índice `config_messages_contagem_idx` (organization_id, created_at) que sustenta a contagem das últimas 24 h. Escrita só pela rota `PATCH ai/budget` (service role). Idempotente; apêndice igual no `baseline.sql`.

-- ---- limites de perguntas do assistente interno (migration 0701) ----
-- Duas colunas, e a decisão de cada uma:
--   * por pessoa, por dia: NOT NULL com padrão 60. As linhas que já existem
--     ganham 60 no mesmo comando (o Postgres preenche o padrão), então não há
--     backfill a fazer nem linha nula para o código tratar.
--   * por organização, por dia: NULL = sem limite. Só o administrador cria um;
--     o teto em dinheiro do mesmo cartão já cobre a organização inteira.
-- Quem lê e quem escreve: `lib/assistente/limites.ts` lê; só a rota
-- `PATCH /api/v1/ai/budget` escreve (service role, `organization_id` do JWT) —
-- a tabela segue sem policy de escrita para `authenticated`, como na 0160.
alter table public.ai_budgets
  add column if not exists assistant_questions_per_user_day integer not null default 60;
alter table public.ai_budgets
  add column if not exists assistant_questions_per_org_day integer;

-- A faixa é do banco além de ser da rota: um valor fora dela escrito por outro
-- caminho (SQL à mão, script) não pode nascer. O Postgres não aceita `if not exists`
-- em constraint; drop + add é o que torna a REGRA idempotente. Os dados já
-- satisfazem: 60 e null.
alter table public.ai_budgets
  drop constraint if exists ai_budgets_assistant_per_user_day_check;
alter table public.ai_budgets
  add constraint ai_budgets_assistant_per_user_day_check
  check (assistant_questions_per_user_day between 1 and 10000);

alter table public.ai_budgets
  drop constraint if exists ai_budgets_assistant_per_org_day_check;
alter table public.ai_budgets
  add constraint ai_budgets_assistant_per_org_day_check
  check (assistant_questions_per_org_day is null or assistant_questions_per_org_day between 1 and 100000);

comment on column public.ai_budgets.assistant_questions_per_user_day is
  'Quantas perguntas ao assistente interno CADA pessoa pode fazer nas últimas 24 h. Padrão 60; 1..10000. Passou disso: 429 com a orientação de pedir a um administrador.';
comment on column public.ai_budgets.assistant_questions_per_org_day is
  'Quantas perguntas ao assistente interno a organização inteira pode fazer nas últimas 24 h. NULL = sem limite (o teto em dinheiro continua valendo); 1..100000.';

-- A contagem é "perguntas humanas da organização nas últimas 24 h" (e, para o
-- limite por pessoa, só as da pessoa). O índice existente de `config_messages`
-- começa por (organization_id, thread_id) e não serve a um filtro por janela de
-- tempo sem thread; este serve, e a janela de 24 h toca poucas linhas.
create index if not exists config_messages_contagem_idx
  on public.config_messages (organization_id, created_at);
