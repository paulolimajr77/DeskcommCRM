-- 0397 - restaura o preenchimento de campos do funil pelo agente.
--
-- A 0395 derrubou (ordem do dono, revertida): as colunas
-- `lead_fields_enabled`/`lead_fields_propose_new`, o kind
-- `lead_field_proposed` e a `fn_inbox_item_unico`. O código voltou por revert
-- do commit de remoção; aqui volta o schema, na mesma disciplina: colunas
-- `if not exists` (nascem desligadas, como sempre), constraint reescrita
-- INTEIRA com a lista vigente + o kind de volta, trigger recriado do corpo
-- em vigor + as duas linhas, função recriada com revoke/grant.
alter table public.ai_agent_versions
  add column if not exists lead_fields_enabled boolean not null default false;

alter table public.ai_agent_versions
  add column if not exists lead_fields_propose_new boolean not null default false;

comment on column public.ai_agent_versions.lead_fields_enabled is
  'O agente pergunta e preenche os campos personalizados do funil (o vocabulário '
  'que a organização declara em `pipeline.settings.fields`). false = ele conversa '
  'normalmente e não toca em `crm_leads.custom_fields`; o que se perde é o '
  'preenchimento, nunca o atendimento. Nasce desligado porque cada turno custa '
  'chamada de modelo na chave de quem se auto-hospeda.';

comment on column public.ai_agent_versions.lead_fields_propose_new is
  'O agente PROPÕE campo de funil que ainda não existe — proposta de '
  'CONFIGURAÇÃO, que vai para a Central (kind lead_field_proposed) e não para a '
  'ficha do lead. Nasce desligado. Exige lead_fields_enabled para fazer '
  'sentido: quem não recebe a definição dos campos não sabe o que já existe, e '
  'proporia o que a empresa já declarou.';

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
    'midia_nao_lida',
    'budget_warning',
    'conhecimento_nao_indexado',
    'voice_call_missed',
    'case_stale',
    'lead_field_proposed',
    'passos_esgotados',
    'laco_de_retorno_caiu',
    'proposal_expired_notice',
    'proposal_acceptance_rate_drop',
    'proposal_promised_not_created',
    'aviso_de_caso_nao_entregue',
    'followup_sem_agente',
    'canal_mudo_sem_numero',
    'other'
  ));

notify pgrst, 'reload schema';

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

revoke all on function public.fn_inbox_item_unico(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_inbox_item_unico(uuid, text, text, text, text, text, uuid)
  to service_role;

notify pgrst, 'reload schema';
