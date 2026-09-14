-- O dono liga os campos do funil no agente — DUAS chaves, na VERSÃO.
--
-- O QUE: `ai_agent_versions.lead_fields_enabled` (o agente pergunta e preenche
-- os campos personalizados que a empresa declarou em Configurações › Funis) e
-- `ai_agent_versions.lead_fields_propose_new` (o agente PROPÕE campo que ainda
-- não existe). As duas nascem `false`.
--
-- POR QUE NASCEM DESLIGADAS. Cada uma custa chamada de modelo na chave de quem
-- se auto-hospeda, e o que paga a conta é o dono da VPS — não nós. Capacidade
-- que gasta dinheiro de terceiro não se liga por migration; liga-se na tela,
-- por quem vai pagar. É o mesmo argumento que `operator_enabled` (0111) já
-- registra: o padrão é o comportamento determinístico, e o que se ganha ao
-- ligar é julgamento — não o funcionamento básico. Aplicar esta migration não
-- muda o comportamento de nenhuma instalação existente.
--
-- POR QUE SÃO COLUNAS DA VERSÃO, E NÃO CHAVE EM `ai_agents.config`. `config`
-- pertence ao AGENTE; estas duas descrevem COMO o agente se comporta numa
-- conversa, que é exatamente o que a versão publica. Em `config` a chave seria
-- mutável a qualquer momento, ficaria fora do diff entre versões e fora do
-- versionamento inteiro: ninguém saberia quando a IA começou a preencher campo
-- de lead, nem como voltar atrás. Em `ai_agent_versions`, ligar é publicar
-- versão nova e desligar é mover o ponteiro para a anterior — o mecanismo de
-- rollback que o produto já tem. Mesmo molde de `cases_enabled` (0110),
-- `multimodal_input` e `operator_enabled` (0111).
--
-- POR QUE SÃO DUAS E NÃO UMA. São capacidades de tamanhos diferentes:
-- preencher um campo que a empresa declarou é escrever DADO no vocabulário que
-- ela mesma definiu; propor campo novo é mexer na ESTRUTURA do funil. Quase
-- todo mundo quer a primeira e não quer a segunda — uma chave só obrigaria a
-- recusar as duas para recusar a estrutura. `lead_fields_propose_new` não tem
-- efeito nenhum enquanto `lead_fields_enabled` for `false`: a segunda é
-- refinamento da primeira, e o runtime lê nessa ordem.
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
  'O agente PROPÕE campo que ainda não existe no funil. Inerte enquanto '
  '`lead_fields_enabled` for false. Separado dela de propósito: preencher campo '
  'declarado é escrever dado; propor campo é mexer na estrutura do funil, e quase '
  'ninguém quer a segunda junto com a primeira.';

-- ⚠️ CONSERTO OBRIGATÓRIO NO MESMO ARQUIVO — não é limpeza de brinde.
--
-- `fn_ai_agent_version_content_immutable` ENUMERA as colunas que não podem
-- mudar depois de publicada. Coluna nova que não entra na lista fica editável
-- em produção, numa versão PUBLICADA, sem virar versão nova e sem deixar
-- trilha — e é justamente a promessa que estas duas colunas fazem ao morar na
-- versão em vez de em `config`. Acrescentá-las sem isto seria vender
-- versionamento e entregar chave solta.
--
-- Mesma decisão que a 0125 (`pipeline_ids`) e a 0181 (`knowledge_source_ids`)
-- já tomaram, pelo mesmo motivo. O corpo abaixo é DERIVADO da versão em vigor
-- (a da 0181): recriá-lo a partir de um corpo antigo apagaria as colunas que
-- entraram depois, e no baseline isso vira remoção de proteção no `update.sh`
-- de quem já rodava.
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
