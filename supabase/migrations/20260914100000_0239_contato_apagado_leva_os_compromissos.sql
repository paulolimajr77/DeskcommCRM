-- 0239 — apagar um contato leva os compromissos dele junto
--
-- O DEFEITO, medido numa instalação real
-- ------------------------------------------------------------------------
-- Excluir um contato pela tela respondia 409 `state_conflict`:
--
--     "Não foi possível excluir: o contato ainda tem registros vinculados."
--
-- Três FKs apontam para `contacts` com regra que IMPEDE o delete —
-- `conversations.contact_id`, `messages.contact_id` e
-- `calendar_appointments.contact_id`. O handler de exclusão
-- (`app/api/v1/contacts/_handler.ts`) contorna as duas primeiras apagando as
-- linhas à mão, e **nunca soube da terceira**.
--
-- POR QUE NINGUÉM VIU
-- ------------------------------------------------------------------------
-- O comentário escrito ao lado desta FK, na 0177, afirma que `conversations` e
-- `messages` são "as duas únicas FKs RESTRICT do schema". A frase era falsa no
-- instante em que foi escrita: o commit que a escreveu estava criando a
-- terceira. Quem conferisse depois leria "são duas", veria o handler cuidando
-- de duas, e fecharia a conta. Este arquivo corrige a afirmação junto com o
-- comportamento (CLAUDE.md, item 16 do Definition of Done).
--
-- POR QUE NÃO DÁ PARA CONTORNAR PELA TELA
-- ------------------------------------------------------------------------
-- **Cancelar não apaga.** O cancelamento é um `update status='cancelled'`
-- (`app/api/v1/agenda/agendamentos/_handler.ts`); a linha continua no banco,
-- ainda amarrada ao contato. E **nenhuma rota do produto apaga um compromisso**
-- — varrido o repositório, o único `.delete()` em `calendar_appointments` vive
-- num arquivo de teste. Quem tem compromisso na agenda, mesmo cancelado, mesmo
-- de meses atrás, fica com o contato **preso para sempre**, sem ação possível
-- pela interface.
--
-- A DECISÃO: `cascade`, que é o padrão da própria tabela de destino
-- ------------------------------------------------------------------------
-- Das 25 FKs que apontam para `contacts`, 12 já são `cascade` e 10 são
-- `set null`. As 3 `restrict` são a exceção — e duas delas já são desfeitas na
-- mão pelo código de exclusão. O compromisso é **dado pessoal do contato**: ele
-- entra na exportação de LGPD daquela pessoa (`lib/lgpd/export-collector.ts`) e
-- nenhum relatório o consome. Compromisso sem contato é fantasma na agenda.
--
-- O argumento do `restrict` — *"apagar um contato não pode apagar o histórico
-- dele"* — não descreve o produto que existe: o botão "Excluir contato" já
-- destrói todas as mensagens e todas as conversas daquele contato. O cinto só
-- segurava onde ninguém construiu a fivela.
--
-- O QUE ESTA MIGRATION NÃO RESOLVE SOZINHA
-- ------------------------------------------------------------------------
-- `google_event_id` mora NESTA tabela, e o envio para o Google Agenda é feito
-- pelo cron lendo a linha (`app/api/v1/cron/agenda-google-push`). Apagar a
-- linha de um compromisso AINDA ABERTO e sincronizado deixaria o evento órfão
-- no calendário de quem atende. Por isso o handler de exclusão passa a
-- **desmarcar antes de apagar** — o cancelamento avisa o Google pelo caminho
-- normal. Compromisso já cancelado ou concluído não tem esse problema.

do $$
declare
  nome_da_fk text;
  coluna     smallint;
begin
  if to_regclass('public.calendar_appointments') is null then
    return;
  end if;

  select attnum into coluna
    from pg_attribute
   where attrelid = 'public.calendar_appointments'::regclass
     and attname  = 'contact_id'
     and not attisdropped;

  if coluna is null then
    return;
  end if;

  -- Descobre a FK pela FORMA (coluna + tabela de destino), não pelo nome: um
  -- clone antigo pode tê-la com outro nome, e um `drop constraint <nome>`
  -- errado deixaria a regra velha de pé com esta migration reportando sucesso.
  select conname into nome_da_fk
    from pg_constraint
   where conrelid  = 'public.calendar_appointments'::regclass
     and confrelid = 'public.contacts'::regclass
     and contype   = 'f'
     and conkey    = array[coluna];

  if nome_da_fk is not null then
    execute format(
      'alter table public.calendar_appointments drop constraint %I', nome_da_fk);
  end if;

  execute '
    alter table public.calendar_appointments
      add constraint calendar_appointments_contact_id_fkey
      foreign key (contact_id) references public.contacts(id) on delete cascade';
end $$;

notify pgrst, 'reload schema';
