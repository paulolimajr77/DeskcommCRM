-- manifest: **Propostas do tipo ação (F2b/T4).** Acrescenta `'acao'` ao CHECK de `kind` de `config_proposals` e divide o índice de idempotência por turno: `config_proposals_turno_unico` passa a valer só para `kind <> 'acao'` (duas ações diferentes no mesmo turno podem coexistir), e `config_proposals_acao_turno_unico` impede a mesma ação repetida no mesmo turno (mesmo `md5(payload::text)`). Idempotente; apêndice igual no `baseline.sql`.

-- ---- config_proposals acao (migration 9006) ----

-- O CHECK de kind é inline (sem nome explícito na 9002): o Postgres batiza `config_proposals_kind_check`. Trocamos para incluir 'acao'.
alter table public.config_proposals drop constraint if exists config_proposals_kind_check;
alter table public.config_proposals add constraint config_proposals_kind_check check (kind in ('roteador','conhecimento','memoria','modelo_auxiliares','funil','acao'));

-- O índice de turno único vale só para kinds que não são 'acao': duas propostas de ação diferentes no mesmo turno podem coexistir.
drop index if exists config_proposals_turno_unico;
create unique index if not exists config_proposals_turno_unico
  on public.config_proposals (organization_id, turn_id, kind)
  where turn_id is not null and kind <> 'acao';

-- Mesmo ação repetida no mesmo turno: o md5 do payload é a impressão digital da ação.
create unique index if not exists config_proposals_acao_turno_unico
  on public.config_proposals (organization_id, turn_id, md5(payload::text))
  where turn_id is not null and kind = 'acao';
