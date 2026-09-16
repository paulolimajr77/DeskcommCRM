-- 0275 — o sino passa a contar o que NINGUÉM OLHOU, não o acervo.
--
-- ─── PREVENÇÃO, E A MEDIÇÃO DIZ POR QUÊ ─────────────────────────────────────
--
-- Medido: a Central desta organização tem ZERO avisos abertos hoje. Não foi
-- isto que escondeu o episódio de 2026-09-16 — o canal estava funcionando e
-- não tinha o que transmitir (nada foi emitido). Esta migration não conserta
-- um incidente; ela impede o próximo, que só aparece com volume.
--
-- ─── O DEFEITO QUE O VOLUME PRODUZ ──────────────────────────────────────────
--
-- `agent_inbox_items` não tem coluna de "lido"/"visto"/"novo". O sino do
-- header conta `status = 'open'`, que é ACERVO: oito avisos antigos e um
-- crítico novo produzem o mesmo "9" de ontem, e quem olha aprende a não
-- olhar. Um contador que nunca distingue novidade de rotina ensina a ignorar
-- exatamente o dia em que importa.
--
-- ─── POR QUE É COLUNA NOVA, E NÃO REUSAR `status = 'ack'` ───────────────────
--
-- `status` é ESTADO DE TRABALHO (open/ack/resolved): alguém assumiu o aviso,
-- ou decidiu que ele está encerrado. "Visto" é outra coisa — só diz que
-- ALGUÉM abriu a Central depois que o aviso nasceu. Um aviso pode estar
-- `open` (ninguém assumiu) e já ter sido visto (alguém olhou e decidiu não
-- agir ainda); gravar isso em `status` confundiria "ninguém está cuidando"
-- com "ninguém olhou", que são perguntas diferentes.
--
-- ─── O ACERVO CONTINUA NA TELA DA CENTRAL ───────────────────────────────────
--
-- Esta coluna muda só o SINO. A lista de "Abertos" na Central continua
-- contando e mostrando todo `status = 'open'`, visto ou não — esconder o
-- acervo não é o conserto, é trocar um ruído por uma omissão.
alter table public.agent_inbox_items
  add column if not exists seen_at timestamptz;

comment on column public.agent_inbox_items.seen_at is
  'Quando alguém da organização abriu a Central depois deste aviso nascer. '
  'NULL = ninguém olhou ainda. Independente de `status`: um aviso pode estar '
  '`open` e já visto (alguém decidiu não agir ainda), ou `resolved` sem nunca '
  'ter sido visto (resolvido por um processo automático). O sino do header '
  'conta `status = ''open'' and seen_at is null` — o que ninguém olhou —, '
  'nunca o acervo inteiro, que continua na tela da Central.';

create index if not exists idx_agent_inbox_items_nao_vistos
  on public.agent_inbox_items (organization_id, created_at desc)
  where status = 'open' and seen_at is null;
