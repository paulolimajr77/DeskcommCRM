-- 0457 (renumerada de 0404 -> 0414 -> 0438 -> 0457: 0404, 0414 e 0438 já
-- estavam tomados por migrations diferentes — o último, 0438, pelo
-- 0438_aviso_de_caso_ignora_conexao_arquivada do upstream)
-- — Onda E1 (N2): a proposta ENVIADA agenda um retorno automático
-- (lib/followup/retorno-crm.ts). Precisamos guardar QUAL retorno, para
-- cancelá-lo se o cliente decidir (aceita/recusada) antes da data marcada —
-- senão o follow-up dispara sozinho para uma proposta já resolvida.
alter table public.crm_proposals add column if not exists retorno_id uuid
  references public.cron_jobs(id) on delete set null;
comment on column public.crm_proposals.retorno_id is
  'N2: id do retorno automático agendado ao enviar (cron_jobs). NULL = nenhum agendado (falha ao agendar não bloqueia o envio) ou já cancelado/disparado.';

notify pgrst, 'reload schema';
