-- 0248 — o rascunho da IA para de trancar a mensagem
--
-- O DEFEITO, medido numa instalação real (2026-09-14)
-- ------------------------------------------------------------------------
-- Excluir um contato respondia 409 `state_conflict` — "o contato ainda tem
-- registros vinculados" — mesmo depois da 0247, que tirou a agenda do caminho.
-- A trava era outra, e um salto ABAIXO de onde a 0247 olhou:
--
--     contacts   <- conversations      RESTRICT   (o handler apaga à mão)
--     contacts   <- messages           RESTRICT   (o handler apaga à mão)
--     messages   <- ai_reply_drafts    NO ACTION  <-- ninguém tratava
--
-- `deleteContactHandler` apaga as MENSAGENS do contato antes de apagar a ficha.
-- Se alguma dessas mensagens tem um rascunho de resposta da IA apontando para
-- ela, o `delete` das mensagens é recusado — e o erro sai como se o problema
-- fosse o contato.
--
-- POR QUE NINGUÉM VIU: `ai_reply_drafts.message_id` nasceu na 0227 escrito
-- `references public.messages(id)`, sem `on delete`. O default do Postgres é
-- NO ACTION, que trava igual a RESTRICT — só não está escrito em lugar nenhum.
-- Uma varredura que procure a palavra `restrict` não encontra esta.
--
-- E o laço fecha sozinho: `ai_reply_drafts.contact_id` JÁ é `on delete cascade`.
-- Apagar o contato removeria o rascunho — mas para chegar ao contato é preciso
-- apagar as mensagens antes, e é o rascunho que impede. Cada metade espera a
-- outra.
--
-- A DECISÃO: `set null`, e não `cascade`
-- ------------------------------------------------------------------------
-- `message_id` é "a mensagem que saiu deste rascunho", preenchida quando o
-- envio conclui. Perder a mensagem não apaga o fato de a IA ter redigido e o
-- humano ter aprovado — apaga só o ponteiro.
--
-- E é o que o schema já faz com o mesmo tipo de ponteiro noutra tabela:
-- `message_id uuid references public.messages(id) on delete set null`. Seguir
-- o vizinho custa nada e evita inventar regra nova para caso conhecido.
--
-- No caminho que motivou esta migration nada fica órfão: apagar o contato
-- continua levando o rascunho junto, pela cascade de `contact_id` que já
-- existe.

do $$
declare
  nome_da_fk text;
  coluna     smallint;
begin
  if to_regclass('public.ai_reply_drafts') is null then
    return;
  end if;

  select attnum into coluna
    from pg_attribute
   where attrelid = 'public.ai_reply_drafts'::regclass
     and attname  = 'message_id'
     and not attisdropped;

  if coluna is null then
    return;
  end if;

  -- Pela FORMA (coluna + destino), nunca pelo nome: um clone antigo pode tê-la
  -- com outro nome, e um `drop constraint <nome errado>` deixaria a regra velha
  -- de pé com este bloco reportando sucesso.
  select conname into nome_da_fk
    from pg_constraint
   where conrelid  = 'public.ai_reply_drafts'::regclass
     and confrelid = 'public.messages'::regclass
     and contype   = 'f'
     and conkey    = array[coluna];

  if nome_da_fk is not null then
    execute format(
      'alter table public.ai_reply_drafts drop constraint %I', nome_da_fk);
  end if;

  -- O Postgres não tem `add constraint if not exists`: a forma idempotente é
  -- `drop constraint if exists` + `add`, que torna idempotente a REGRA e não só
  -- a criação.
  execute 'alter table public.ai_reply_drafts
             drop constraint if exists ai_reply_drafts_message_id_fkey';
  execute 'alter table public.ai_reply_drafts
             add constraint ai_reply_drafts_message_id_fkey
             foreign key (message_id) references public.messages(id) on delete set null';
end $$;

notify pgrst, 'reload schema';
