-- 0270 — a proposta de dado ganha DESTINO: contato ou campo do funil.
--
-- ─── Por que a mesma tabela ─────────────────────────────────────────────────
--
-- `contact_field_proposals` nasceu para dado do CONTATO — a IA ouve um e-mail
-- na conversa e propõe; uma pessoa confirma. Com o agente preenchendo os campos
-- que a empresa declara em `pipeline.settings.fields`, aparece uma proposta com
-- a MESMA natureza: valor ouvido, prazo, confirmação humana, motivo de recusa,
-- laço de retorno. Tudo o que a tabela já faz.
--
-- Uma tabela irmã duplicaria o worker de vencimento, a tela da Central, a
-- auditoria e as políticas de RLS — e as duas divergiriam no primeiro conserto
-- feito só de um lado. O que muda entre as duas é UMA coisa: para onde a
-- confirmação escreve. Isso é uma coluna, não uma tabela.
--
-- ─── ⛔ O ÍNDICE DE IDEMPOTÊNCIA, E POR QUE `coalesce` ──────────────────────
--
-- A idempotência é:
--
--     unique (organization_id, contact_id, campo) where status = 'pending'
--
-- É ela que impede a IA de repropor o mesmo dado a cada turno e encher a tela.
--
-- Acrescentar `lead_id` NULÁVEL à lista de colunas a DESARMA para o caso
-- antigo: em índice único do Postgres, `NULL` é distinto de `NULL`. Duas linhas
-- `(org, contato, 'email', NULL)` passariam a conviver, e a proposta de contato
-- voltaria a duplicar — sem erro, sem aviso, e sem ninguém procurando ali,
-- porque o sintoma aparece na TELA, semanas depois, como ruído.
--
-- Por isso o índice indexa `coalesce(lead_id, <uuid zero>)`. Com um valor no
-- lugar do nulo, proposta de contato volta a colidir como antes, e proposta de
-- funil colide por lead. `nulls not distinct` resolveria também e é mais
-- bonito, mas é PG15+ — e `coalesce` não tem piso de versão nenhum, o que
-- importa num produto que outras pessoas instalam.
--
-- ─── O CHECK deixa de ser lista e passa a ser regra sobre o PAR ─────────────
--
-- O vocabulário de campo de funil é ABERTO: cada empresa inventa o seu em
-- Configurações › Funis. Vocabulário aberto não entra em CHECK — a doutrina
-- deste repositório é explícita, e uma constraint aqui quebraria o `update.sh`
-- de qualquer clone que já tenha um campo com nome diferente.
--
-- Mas o DESTINO entra, e é ele que importa: sem destino, só o vocabulário
-- fechado do contato; com destino, qualquer chave — validada no servidor, na
-- ACEITAÇÃO, contra `settings.fields` daquele funil. Conferir só na proposta
-- deixaria passar o caso em que o dono apaga o campo entre propor e confirmar.
--
-- Sem backfill: toda linha existente tem `lead_id` nulo e campo do contato, que
-- é exatamente o lado antigo da regra. `add column if not exists` não toca em
-- clone que já aplicou.

alter table public.contact_field_proposals
  add column if not exists lead_id uuid references public.crm_leads(id) on delete cascade;

comment on column public.contact_field_proposals.lead_id is
  'Para ONDE a confirmação escreve. Nulo = campo do contato (email/name/'
  'phone_number, vocabulário fechado). Preenchido = uma chave dentro de '
  'crm_leads.custom_fields daquele negócio, validada contra pipeline.settings.'
  'fields na ACEITAÇÃO — nunca só na proposta.';

-- O índice velho sai pelo nome: recriá-lo com a mesma assinatura e conteúdo
-- diferente não é possível, e deixar os dois faria o antigo continuar barrando
-- proposta de funil legítima.
drop index if exists public.uq_contact_field_proposals_uma_viva;
create unique index if not exists uq_contact_field_proposals_uma_viva
  on public.contact_field_proposals
     (organization_id, contact_id, campo,
      coalesce(lead_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

-- Quem decide na Central lista por lead; sem isto a tela varre a tabela.
create index if not exists idx_contact_field_proposals_por_lead
  on public.contact_field_proposals (organization_id, lead_id)
  where status = 'pending' and lead_id is not null;

alter table public.contact_field_proposals
  drop constraint if exists contact_field_proposals_campo_check;
alter table public.contact_field_proposals
  add constraint contact_field_proposals_campo_check check (
    (lead_id is null and campo = any (array['email', 'name', 'phone_number']::text[]))
    or (lead_id is not null and length(btrim(campo)) between 1 and 64)
  );

notify pgrst, 'reload schema';
