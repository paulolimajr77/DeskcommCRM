-- 0429 - sai DE NOVO o preenchimento de campos do funil pela IA.
--
-- Decisão do dono em 26/09/2026: fica só a versão dos campos do funil que
-- existe no upstream (a equipe preenche à mão). A 0395 tirou este schema, a
-- 0397 o restaurou; esta tira de novo, com a mesma forma da 0395 e o
-- vocabulário de hoje.
--
-- O QUE SAI: `ai_agent_versions.lead_fields_enabled` e
-- `.lead_fields_propose_new`, o kind `lead_field_proposed` e a
-- `fn_inbox_item_unico` (só aquela ferramenta a chamava).
--
-- O QUE FICA: `crm_update_lead`, `contact_field_proposals` (0270),
-- `fn_lead_anotar_campos` (0266), a anotação simultânea (0269) e
-- `crm_stages.afirma_fato` — nenhum deles é "a IA preenche".
alter table public.ai_agent_versions
  drop column if exists lead_fields_enabled;

alter table public.ai_agent_versions
  drop column if exists lead_fields_propose_new;

-- Corpo DERIVADO da última definição em vigor no baseline (a da 0397) menos
-- as duas linhas das colunas acima. Medido em 26/09: é byte a byte o corpo da
-- 0395, porque nenhuma coluna nova entrou na trava desde então.
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

-- ⛔ ANTES de reconstruir: `add constraint` valida as linhas existentes, e o
-- clone com aviso de sugestão aberto quebraria no meio. `other` já está no
-- vocabulário; o aviso continua legível e resolvível na Central.
update public.agent_inbox_items
  set kind = 'other'
  where kind = 'lead_field_proposed';

-- A lista é a da 0423 (a última reconstrução) INTEIRA menos
-- `lead_field_proposed` — nunca um "remove" do valor: quem reconstrói assume
-- a lista toda, e `kind-check-migration-x-baseline.test.ts` a compara com o
-- bloco único do baseline.
alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;
alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required','appointment_recovery_review','qr_rescan','routing_unassigned',
    'job_dead','event_dead','budget_exceeded','handoff','promotion_review','judge_unaligned',
    'followup_dead','snooze_expired','next_action_ambiguous','risk_backlog_seeded',
    'reactivation_expired','capabilities_missing','message_send_stuck','midia_nao_lida',
    'channel_template_review','channel_number_alert','promise_unfulfilled','contact_proposal_expired',
    'budget_warning','conhecimento_nao_indexado','voice_call_missed','case_stale',
    'aviso_de_caso_nao_entregue','followup_sem_agente','canal_mudo_sem_numero',
    'proposal_expired_notice','proposal_acceptance_rate_drop','proposal_promised_not_created',
    'proposta_travada',
    'passos_esgotados','laco_de_retorno_caiu',
    'proposta_pronta_para_revisao',
    'other'
  ));

-- Sem chamador desde que `crm_propose_lead_field` saiu. `if exists` para o
-- clone que nunca a aplicou.
drop function if exists public.fn_inbox_item_unico(uuid, text, text, text, text, text, uuid);

notify pgrst, 'reload schema';
