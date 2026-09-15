-- 0271 — o agente PROPÕE um campo de funil, e a Central avisa.
--
-- ─── O que muda ─────────────────────────────────────────────────────────────
--
-- O agente ouve algo que a empresa ainda não declarou em Configurações › Funis
-- — "vocês anotam de onde o cliente veio?" — e propõe o campo. Um `kind` novo
-- na Central: `lead_field_proposed`.
--
-- ─── ⛔ POR QUE NA CENTRAL, E NÃO NUMA TABELA PRÓPRIA ───────────────────────
--
-- Isto é proposta de CONFIGURAÇÃO, não de dado. Preencher e corrigir são do
-- lead (e vivem em `contact_field_proposals`, com destino desde a 0270); criar
-- campo muda a tela de TODOS os leads daquele funil, para sempre — é decisão de
-- quem administra, não de quem atende uma conversa.
--
-- E tudo o que ela precisa já existe aqui: fila de decisão humana, prazo, quem
-- resolveu, e uma tela que as pessoas já abrem todo dia. Uma tabela irmã
-- duplicaria o worker de vencimento, a RLS e a tela — e as duas divergiriam no
-- primeiro conserto feito de um lado só. É o mesmo argumento que a 0270 já fez
-- para não criar uma tabela de proposta de campo do funil.
--
-- ─── ⛔ POR QUE A CONSTRAINT INTEIRA É REESCRITA AQUI ───────────────────────
--
-- `tests/unit/kind-check-migration-x-baseline.test.ts` existe porque a 0129
-- reconstruiu esta constraint com 15 valores quando o vocabulário vigente tinha
-- 18 — apagando `contact_proposal_expired`, criado pela migration imediatamente
-- anterior. O sintoma é mudo do jeito pior: em quem aplica migrations
-- incrementalmente, os INSERTs de aviso passam a violar a constraint e o
-- `catch` fire-and-forget engole o erro. O aviso simplesmente não aparece.
--
-- Por isso a lista abaixo é a COMPLETA, não um `add` do valor novo: quem
-- reconstrói uma constraint de vocabulário assume a lista inteira.
alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;
alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required',
    'appointment_recovery_review',
    'qr_rescan',
    'routing_unassigned',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    'message_send_stuck',
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    'promise_unfulfilled',
    'contact_proposal_expired',
    'budget_warning',
    'conhecimento_nao_indexado',
    'voice_call_missed',
    'case_stale',
    'lead_field_proposed',
    'other'
  ));

notify pgrst, 'reload schema';

-- ─── A CHAVE VOLTA, E AGORA TEM QUEM A LEIA ─────────────────────────────────
--
-- `lead_fields_propose_new` foi RETIRADA em 2026-09-15, antes de existir, e o
-- motivo está no cabeçalho da 0261: o mecanismo que a usaria não tinha sido
-- construído, e ela nascia sem ninguém que a lesse — um interruptor que o dono
-- liga, que a tela grava, e que o motor ignora. Quem pegou foi
-- `tests/unit/knobs-da-versao-publicada-sao-aplicados.test.ts`, cuja régua é
-- exatamente essa: todo campo carregado da versão publicada precisa ter quem o
-- aplique.
--
-- O mecanismo é esta migration. A chave volta junto com ele, como prometido.
--
-- Nasce DESLIGADA pela mesma razão das irmãs: propor campo custa chamada de
-- modelo na chave de quem se auto-hospeda, e quem paga a conta é o dono da VPS.
-- Capacidade que gasta dinheiro de terceiro não se liga por migration.
alter table public.ai_agent_versions
  add column if not exists lead_fields_propose_new boolean not null default false;

comment on column public.ai_agent_versions.lead_fields_propose_new is
  'O agente PROPÕE campo de funil que ainda não existe — proposta de '
  'CONFIGURAÇÃO, que vai para a Central (kind lead_field_proposed) e não para a '
  'ficha do lead. Nasce desligado. Exige lead_fields_enabled para fazer '
  'sentido: quem não recebe a definição dos campos não sabe o que já existe, e '
  'proporia o que a empresa já declarou.';

-- ⚠️ CONSERTO OBRIGATÓRIO NO MESMO ARQUIVO — a mesma razão da 0261.
--
-- `fn_ai_agent_version_content_immutable` ENUMERA as colunas congeladas depois
-- de publicada. Coluna nova fora da lista fica editável numa versão PUBLICADA,
-- sem virar versão nova e sem deixar trilha — justamente a promessa que a chave
-- faz ao morar na versão em vez de em `ai_agents.config`.
--
-- O corpo abaixo é DERIVADO do que está em vigor (a 0261): recriá-lo de um
-- corpo antigo apagaria as colunas que entraram depois, e no baseline isso vira
-- remoção de proteção no `update.sh` de quem já rodava.
create or replace function public.fn_ai_agent_version_content_immutable() returns trigger
language plpgsql as $fn$
begin
  if old.status <> 'draft' and (
       new.system_prompt          is distinct from old.system_prompt
    or new.provider               is distinct from old.provider
    or new.model                  is distinct from old.model
    or new.credential_id          is distinct from old.credential_id
    or new.tool_ids               is distinct from old.tool_ids
    or new.trigger_config         is distinct from old.trigger_config
    or new.channel_session_id     is distinct from old.channel_session_id
    or new.max_steps              is distinct from old.max_steps
    or new.token_budget           is distinct from old.token_budget
    or new.cost_budget_cents      is distinct from old.cost_budget_cents
    or new.history_message_window is distinct from old.history_message_window
    or new.history_token_window   is distinct from old.history_token_window
    or new.handoff_keywords       is distinct from old.handoff_keywords
    or new.handoff_tool_enabled   is distinct from old.handoff_tool_enabled
    or new.followup               is distinct from old.followup
    or new.multimodal_input       is distinct from old.multimodal_input
    or new.video_frames_enabled   is distinct from old.video_frames_enabled
    or new.split_messages         is distinct from old.split_messages
    or new.split_max_chars        is distinct from old.split_max_chars
    or new.cases_enabled          is distinct from old.cases_enabled
    or new.operator_enabled       is distinct from old.operator_enabled
    or new.operator_model         is distinct from old.operator_model
    or new.operator_tool_ids      is distinct from old.operator_tool_ids
    or new.pipeline_ids           is distinct from old.pipeline_ids
    or new.knowledge_source_ids   is distinct from old.knowledge_source_ids
    or new.lead_fields_enabled     is distinct from old.lead_fields_enabled
    or new.lead_fields_propose_new is distinct from old.lead_fields_propose_new
    or new.version_number         is distinct from old.version_number
    or new.agent_id               is distinct from old.agent_id
    or new.organization_id        is distinct from old.organization_id
  ) then
    raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_ai_agent_versions_content_immutable on public.ai_agent_versions;
create trigger trg_ai_agent_versions_content_immutable
  before update on public.ai_agent_versions
  for each row execute function public.fn_ai_agent_version_content_immutable();

notify pgrst, 'reload schema';

-- ─── O AVISO NASCE UMA VEZ, E QUEM GARANTE ISSO É O BANCO ───────────────────
--
-- O agente vai propor o mesmo campo a cada turno em que o assunto voltar. Um
-- `select` antes do `insert` no aplicativo seria check-then-act: dois turnos
-- concorrentes passam pela janela e a Central ganha o aviso em dobro.
--
-- Duas propostas de campos DIFERENTES no mesmo funil são decisões diferentes e
-- PRECISAM conviver — por isso a chave da idempotência é (org, kind, ref_id,
-- title), e o título carrega o rótulo proposto. Comparar só por funil engoliria
-- a segunda sugestão em silêncio, que é o defeito que a 0270 evitou do outro
-- lado.
--
-- `security definer` porque o chamador é a sessão do agente (MCP), que não tem
-- INSERT direto em `agent_inbox_items` — e não deve ter: um aviso é do sistema,
-- não do tenant.
create or replace function public.fn_inbox_item_unico(
  p_org uuid, p_kind text, p_severity text, p_title text, p_body text,
  p_ref_kind text default null, p_ref_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_id uuid;
begin
  insert into public.agent_inbox_items
    (organization_id, kind, severity, title, body, ref_kind, ref_id)
  select p_org, p_kind, p_severity, p_title, p_body, p_ref_kind, p_ref_id
   where not exists (
     select 1 from public.agent_inbox_items
      where organization_id = p_org and kind = p_kind and status = 'open'
        and title = p_title
        and ref_id is not distinct from p_ref_id
   )
  returning id into v_id;
  -- `null` quando já existia: quem chama distingue "criei" de "já estava lá"
  -- sem precisar contar linhas nem confiar em exceção.
  return v_id;
end $fn$;

-- Função nova em `public` NASCE EXPOSTA, e são TRÊS origens de EXECUTE: o
-- `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS` do corpo do baseline para
-- anon, authenticated e service_role (linhas 4877-4879), mais o grant a PUBLIC
-- que o Postgres dá a qualquer função ao criá-la. Esquecer `authenticated`
-- deixaria uma função que ESCREVE ao alcance de qualquer usuário logado de
-- qualquer tenant — foi o vermelho que a 0269 pagou.
revoke all on function public.fn_inbox_item_unico(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_inbox_item_unico(uuid, text, text, text, text, text, uuid)
  to service_role;

notify pgrst, 'reload schema';
