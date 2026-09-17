-- 0276 — dois avisos que o sistema precisa saber emitir sobre SI MESMO.
--
-- ─── `passos_esgotados` ─────────────────────────────────────────────────────
--
-- `inbound-turn.ts` chama o modelo com um teto de passos
-- (`stopWhen: stepCountIs(maxSteps)`, em `run-model-call.ts`). Quando o modelo
-- bate nele NO MEIO de uma tarefa — ainda queria chamar ferramenta, não
-- terminou naturalmente — o AI SDK simplesmente para de gerar passos, e o
-- código, medido, NUNCA verifica isso: zero leitura de `steps.length` /
-- `finishReason` no arquivo inteiro antes desta migration.
--
-- O cliente vê a conversa terminar sem resposta útil e ninguém no sistema sabe
-- que a causa foi o teto. Este kind é o registro que faltava: o dono vê na
-- Central de avisos que o assistente parou no meio, e o motivo aparece onde
-- gente olha — não num log de worker em VPS que ninguém lê.
--
-- ─── `laco_de_retorno_caiu` ─────────────────────────────────────────────────
--
-- Reservado para uma tarefa futura (Peça 11, invariante 7): medir se as duas
-- contagens do laço de retorno da organização caíram de forma sustentada —
-- perguntas de campo feitas x campos gravados, ou pedidos de agendamento x
-- compromissos criados. A constraint aceita o valor desde já; ninguém o emite
-- ainda. O valor entra agora, na mesma migration, para que a próxima tarefa
-- não precise reconstruir a constraint de novo.
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
-- Por isso a lista abaixo é a COMPLETA, não um `add` dos valores novos: quem
-- reconstrói uma constraint de vocabulário assume a lista inteira. Mesma
-- disciplina da 0271.
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
    -- (migration 0276) O turno bateu no teto de passos e parou no meio. Antes
    -- disto era um `return` mudo: o cliente via a conversa terminar sem resposta
    -- e ninguém no sistema sabia que o teto tinha sido a causa.
    'passos_esgotados',
    -- (migration 0276) Uma das duas contagens do laço de retorno caiu de forma
    -- sustentada nesta organização: perguntas de campo feitas x campos gravados,
    -- ou pedidos de agendamento x compromissos criados. Emitido por uma tarefa
    -- futura (Peça 11) — a constraint aceita o valor desde já.
    'laco_de_retorno_caiu',
    'other'
  ));

notify pgrst, 'reload schema';
