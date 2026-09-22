-- 0390 - sai o preenchimento de campos do funil pelo agente.
--
-- O QUE SAI: as duas colunas que a 0272/0387 puseram em `ai_agent_versions`
-- (`lead_fields_enabled`, `lead_fields_propose_new`), o `kind`
-- `lead_field_proposed` da Central e a `fn_inbox_item_unico`, que nasceu na
-- 0387 para servir SÓ aquela ferramenta e ficou sem chamador.
--
-- O QUE FICA, de propósito:
--   - `crm_update_lead` (ferramenta preexistente; o dono ainda pode escolhê-la
--     à mão em `tool_ids`, e o turno a monta como qualquer outra);
--   - `contact_field_proposals` + `lead_id` (0270): tabela compartilhada com o
--     fluxo de proposta de dado de CONTATO, que continua vivo;
--   - `fn_lead_anotar_campos` (0266) + o merge de `custom_fields` no REST: é o
--     seam de escrita da tela do dossiê e do quadro (J4.36);
--   - `camposDoFunil()` (`lib/leads/campos-do-funil.ts`): infra compartilhada
--     (Funis, Kanban, webhooks, handoff) — anterior à feature;
--   - `passos_esgotados` e `laco_de_retorno_caiu`: kinds da 0388, de outro
--     mecanismo (avisos do turno sobre si mesmo).
--
-- Sem backfill e sem CHECK novo: `drop column if exists` não toca em linha
-- nenhuma, então nenhum clone quebra ao aplicar.
alter table public.ai_agent_versions
  drop column if exists lead_fields_enabled;

alter table public.ai_agent_versions
  drop column if exists lead_fields_propose_new;

-- O corpo abaixo é DERIVADO do que está em vigor (o da 0387, em
-- supabase/baseline.sql): recriá-lo de um corpo antigo apagaria as colunas que
-- entraram depois, e no baseline isso vira remoção de proteção no `update.sh`
-- de quem já rodava. Saem SÓ as duas linhas das colunas acima.
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

-- A lista abaixo é a COMPLETA menos `lead_field_proposed`, não um `add` do
-- valor removido: quem reconstrói uma constraint de vocabulário assume a lista
-- inteira (`kind-check-migration-x-baseline.test.ts` reprova divergência com o
-- baseline). Derivada da 0389, que era a última a tocar esta constraint.
--
-- ⛔ ANTES de reconstruir: as linhas que já usam o kind. `add constraint`
-- valida as linhas EXISTENTES — sem isto, o clone que tem aviso de sugestão
-- aberto quebra no meio do `update.sh`. O destino é `other` (genérico, já no
-- vocabulário): o aviso continua legível e resolvível na Central (título e
-- corpo intactos, destino de Funis preservado via `ref_kind='pipeline'`) —
-- só perde o rótulo e a orientação específicos.
update public.agent_inbox_items
  set kind = 'other'
  where kind = 'lead_field_proposed';
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
    'passos_esgotados', 'laco_de_retorno_caiu',
    -- proposta comercial (migration 0349):
    'proposal_expired_notice', 'proposal_acceptance_rate_drop', 'proposal_promised_not_created',
    'aviso_de_caso_nao_entregue',
    'followup_sem_agente',
    'canal_mudo_sem_numero',
    'other'
  ));

-- Sem chamador desde a saída de `crm_propose_lead_field`: nasceu na 0387 para
-- servir SÓ aquela ferramenta. `if exists` para o clone que nunca a aplicou.
drop function if exists public.fn_inbox_item_unico(uuid, text, text, text, text, text, uuid);

notify pgrst, 'reload schema';
