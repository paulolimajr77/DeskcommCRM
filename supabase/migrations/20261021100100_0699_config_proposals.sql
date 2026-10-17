-- manifest: **Propostas de configuração do assistente interno, F2b (spec 2026-10-14-agente-interno-config-design §5/§7b).** Cria `config_proposals` (1 proposta = 1 artefato; propor não cria nada, o efeito nasce no `aplicar` depois do aprovar): 5 estados com coerência por CHECK, idempotência por turno, leitura e inserção só do admin pela sessão (update/delete exclusivos do servidor, na T20) e gatilho que só deixa `aplicar` sair de `aprovada`. Retenção = a do tenant, na MESMA dívida assumida de `fn_expurgar_config_assistente_vencida` (sem chamador até a F3). Idempotente; apêndice igual no `baseline.sql`.

-- ---- propostas de configuração do assistente (migration 0699) ----
-- Retenção (decisão §8.4 da spec, dívida assumida): `config_proposals` segue a
-- retenção operacional do tenant e entra na mesma dívida de
-- `fn_expurgar_config_assistente_vencida` — a função existe desde a F1 (migration
-- 0698) e NÃO tem chamador; a rota agendada que a chama entra na F3. Nenhuma
-- função de expurgo nova aqui, e a existente não é alterada.
create table if not exists public.config_proposals (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  -- A faxina de conversas não apaga o rastro da decisão: apagar a thread
  -- zera o vínculo, mas a proposta (quem pediu, o quê, o que foi decidido) fica.
  thread_id         uuid references public.config_threads(id) on delete set null,
  -- Turno do chat que gerou a proposta; null se veio de outro lugar. A
  -- idempotência do turno é o índice parcial abaixo, não esta coluna sozinha.
  turn_id           uuid,
  -- O que será mexido (1 proposta = 1 artefato). `critico` NÃO existe de
  -- propósito (spec §6/§7b: crítico não tem ferramenta de proposta — vira
  -- "PRECISO CONFIRMAR" da auditoria, com link para a tela onde o humano resolve).
  kind              text not null check (kind in ('roteador','conhecimento','memoria','modelo_auxiliares','funil')),
  risk              text not null check (risk in ('seguro','atencao')),
  -- Título para leigo (o que a tela mostra na fila) e o porquê da IA.
  resumo            text not null check (char_length(resumo) between 3 and 300),
  motivo            text not null check (char_length(motivo) between 3 and 2000),
  -- Retrato do estado atual para o "antes e depois"; null quando não há
  -- "antes" (criação).
  antes             jsonb,
  -- O que será aplicado. Objeto sempre: a T20 aplica chave a chave pelos
  -- handlers existentes, nunca SQL direto.
  payload           jsonb not null check (jsonb_typeof(payload) = 'object'),
  status            text not null default 'pendente' check (status in ('pendente','aprovada','aplicada','rejeitada','expirada')),
  -- Quem pediu a proposta; sem FK, como `created_by` da 0698 (a saída de uma
  -- pessoa não apaga o que foi pedido).
  requested_by      uuid not null,
  decided_by        uuid,
  decided_at        timestamptz,
  -- Motivo da rejeição com teto: vira insumo estruturado da F4 (laço de retorno).
  decision_reason   text check (decision_reason is null or char_length(decision_reason) <= 1000),
  applied_by        uuid,
  applied_at        timestamptz,
  -- O que foi criado/alterado: tipo + id do artefato.
  apply_result      jsonb,
  -- Proposta pendente sem decisão vira item visível com prazo — nunca some em
  -- silêncio (anti-morte do sistema-vivo).
  expires_at        timestamptz not null default (now() + interval '7 days'),
  created_at        timestamptz not null default now(),
  -- Coerência de estado: cada estado carrega os carimbos que o provam. `expirada`
  -- não exige nada extra de propósito: a expiração é passagem do tempo, não decisão.
  constraint config_proposals_estado_coerente check (
    (status = 'pendente' and decided_by is null and decided_at is null and decision_reason is null
      and applied_by is null and applied_at is null and apply_result is null)
    or (status = 'aprovada' and decided_by is not null and decided_at is not null and applied_at is null)
    or (status = 'aplicada' and decided_at is not null and applied_by is not null and applied_at is not null and apply_result is not null)
    or (status = 'rejeitada' and decided_by is not null and decided_at is not null)
    or (status = 'expirada')
  )
);

-- A fila na tela (propostas da org por estado, as mais novas primeiro).
create index if not exists config_proposals_fila_idx
  on public.config_proposals (organization_id, status, created_at desc);
create index if not exists config_proposals_thread_idx
  on public.config_proposals (organization_id, thread_id);
-- Reenvio do mesmo turno não duplica a proposta: o segundo insert do mesmo
-- (org, turno, kind) bate no único e a rota devolve a que já existe.
create unique index if not exists config_proposals_turno_unico
  on public.config_proposals (organization_id, turn_id, kind)
  where turn_id is not null;

alter table public.config_proposals enable row level security;

-- ── Privilégio: o login (sessão) só LÊ e INSERE ──────────────────────────
-- `revoke all` PRIMEIRO pelo mesmo motivo da 0698: o `ALTER DEFAULT
-- PRIVILEGES … GRANT ALL ON TABLES TO "authenticated"` do baseline vem ANTES
-- de toda tabela de apêndice. Sem o revoke, a tabela nasceria com
-- UPDATE/DELETE para `authenticated` e a policy seria a única coisa entre um
-- admin logado e o "aprovar a si mesmo". `update` e `delete` são exclusivos do
-- servidor (rotas que aprovam/aplicam/rejeitam, na T20): a ferramenta de propor
-- grava com a SESSÃO do admin (nunca service role), e nenhum cliente PostgREST
-- consegue aprovar ou aplicar sozinho.
revoke all on public.config_proposals from anon, authenticated;
grant select, insert on public.config_proposals to authenticated;
grant all on public.config_proposals to service_role;

-- ── RLS: organização + ADMIN, policy POR COMANDO ─────────────────────────
-- Só admin lê proposta (o payload pode ter prompt, texto de conhecimento e
-- memória). Decisão registrada: diferente do chat (0698), que é `viewer`+.
drop policy if exists tenant_isolation_config_proposals_select on public.config_proposals;
create policy tenant_isolation_config_proposals_select
  on public.config_proposals
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin')
  );
-- Inserir exige: ser da org, ser admin, assinar como quem pede (`requested_by`
-- = quem está logado) e nascer `pendente` sem nenhum carimbo de decisão ou
-- aplicação (carimbo sem passar pelo gatilho não nasce).
drop policy if exists tenant_isolation_config_proposals_insert on public.config_proposals;
create policy tenant_isolation_config_proposals_insert
  on public.config_proposals
  for insert to authenticated
  with check (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin')
    and requested_by = auth.uid()
    and status = 'pendente'
    and decided_by is null
    and decided_at is null
    and applied_by is null
    and applied_at is null
    and apply_result is null
  );

-- ── Gatilho de transição: "aplicar exige aprovada" ───────────────────────
-- A trava de verdade (spec §6.2). A rota da T20 confere antes; o gatilho
-- garante depois — nem o servidor aplica sem aprovar antes. Violação = 23514,
-- a mesma classe dos CHECKs: quem lê o erro trata igual.
create or replace function public.fn_config_proposals_transicao()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
-- transicoes: pendente>aprovada, pendente>rejeitada, pendente>expirada, aprovada>aplicada, aprovada>expirada
begin
  -- 1. IMUTÁVEIS depois de criada (qualquer mudança reprova): aprovou A, aplica
  -- A — nunca B. `decided_*`, `applied_*` e `decision_reason` ficam de fora de
  -- propósito: são os carimbos das transições abaixo, e a regra 2 decide quando
  -- cada um pode nascer.
  if old.organization_id is distinct from new.organization_id
    or old.thread_id is distinct from new.thread_id
    or old.turn_id is distinct from new.turn_id
    or old.kind is distinct from new.kind
    or old.risk is distinct from new.risk
    or old.resumo is distinct from new.resumo
    or old.motivo is distinct from new.motivo
    or old.antes is distinct from new.antes
    or old.payload is distinct from new.payload
    or old.requested_by is distinct from new.requested_by
    or old.expires_at is distinct from new.expires_at
    or old.created_at is distinct from new.created_at
  then
    raise exception 'config_proposals: o conteúdo da proposta é imutável depois de criada'
      using errcode = '23514';
  end if;

  -- Sem mudança nenhuma, trata como no-op (ex.: UPDATE que reescreve os mesmos
  -- valores). Qualquer mudança com o estado igual cai na regra 2 e reprova.
  if old is not distinct from new then
    return new;
  end if;

  -- 2. Só estas transições existem. Qualquer outra reprova — inclusive
  -- pendente>aplicada, qualquer saída de aplicada/rejeitada/expirada e
  -- aprovada>rejeitada.
  if not ((old.status = 'pendente' and new.status in ('aprovada', 'rejeitada', 'expirada'))
    or (old.status = 'aprovada' and new.status in ('aplicada', 'expirada'))) then
    raise exception 'config_proposals: transição de estado % para % não permitida', old.status, new.status
      using errcode = '23514';
  end if;

  -- 2b. O carimbo da decisão, depois de nascido, não se reescreve: quem decidiu,
  -- quando e por quê ficam como foram, inclusive na passagem aprovada>aplicada.
  if old.decided_at is not null
    and (old.decided_by is distinct from new.decided_by
      or old.decided_at is distinct from new.decided_at
      or old.decision_reason is distinct from new.decision_reason)
  then
    raise exception 'config_proposals: o carimbo da decisão é imutável depois de nascido'
      using errcode = '23514';
  end if;

  -- 3. Quem decide e quem aplica ficam carimbados na hora da transição.
  if new.status in ('aprovada', 'rejeitada')
    and (new.decided_by is null or new.decided_at is null) then
    raise exception 'config_proposals: aprovar ou rejeitar exige decided_by e decided_at'
      using errcode = '23514';
  end if;
  if new.status = 'aplicada'
    and (new.applied_by is null or new.applied_at is null or new.apply_result is null) then
    raise exception 'config_proposals: aplicar exige applied_by, applied_at e apply_result'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
-- As DUAS origens de EXECUTE, como na 0698: o `ALTER DEFAULT PRIVILEGES … GRANT
-- ALL ON FUNCTIONS TO anon` do baseline (que `revoke from public` não remove) e
-- o grant implícito a PUBLIC de toda função nova (que `revoke from anon` não
-- remove). Fechar uma só deixa a função exposta com o gate verde.
revoke all on function public.fn_config_proposals_transicao() from public, anon, authenticated;
grant execute on function public.fn_config_proposals_transicao() to service_role;

drop trigger if exists config_proposals_transicao_bu on public.config_proposals;
create trigger config_proposals_transicao_bu
  before update on public.config_proposals
  for each row execute function public.fn_config_proposals_transicao();

-- ── travas do suporte, depois de tabela nova (migration 0274) ────────────
-- A tabela concede `insert` a `authenticated`; sem chamar de novo aqui, a cadeia
-- de migrations/ (aplicada uma a uma, nunca reaplicando o arquivo inteiro como o
-- baseline.sql) não plantaria as três travas support_write_* nesta tabela.
-- Idempotente; no baseline.sql a função está definida bem antes deste bloco.
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
