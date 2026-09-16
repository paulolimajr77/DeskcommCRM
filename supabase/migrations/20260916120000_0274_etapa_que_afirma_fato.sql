-- 0274 — a etapa que AFIRMA um fato (e a que só descreve um passo).
--
-- ─── O DEFEITO, MEDIDO EM PRODUÇÃO (2026-09-16) ─────────────────────────────
--
-- Às 09:45 o negócio foi movido de "Entendendo a necessidade" para "Proposta
-- enviada" a partir da mensagem em que o agente PROMETEU a proposta. Ninguém
-- enviou proposta nenhuma. O classificador leu INTENÇÃO como FATO.
--
-- No quadro, o negócio agora aparece ADIANTADO — e isso é pior que aparecer
-- parado. Um negócio em "Proposta enviada" não chama a atenção de ninguém;
-- quem olha o funil confia no carimbo. O Radar de Risco só alcançaria o caso
-- dias depois, quando o cliente já tivesse desistido — tempo que, num card
-- parado em "Entendendo a necessidade", seria gasto com alguém agindo.
--
-- E não existe proposta nenhuma no produto: medido no `information_schema`,
-- NÃO HÁ tabela de proposta, orçamento ou quote. "Proposta enviada" é o nome
-- de uma COLUNA DO QUADRO, nada mais. O sistema tratou como fato uma frase
-- sobre o futuro, usando como régua o texto que o dono escolheu para rotular
-- uma etapa.
--
-- ─── ⛔ POR QUE UMA COLUNA, E NÃO UMA LISTA DE NOMES ────────────────────────
--
-- A tentação era reconhecer por nome: "se a etapa se chama 'Proposta enviada',
-- então..." — e ela é errada por construção. A lista de etapas é escrita pelo
-- DONO, no vocabulário do NEGÓCIO dele: "Proposta enviada", "Contrato
-- assinado", "Pagamento recebido", "Laudo entregue", "Chaves entregues",
-- "Consulta realizada". Cada nicho tem as suas, e o mesmo substantivo
-- significa coisas diferentes em empresas diferentes. Uma lista de nomes no
-- código acerta uma empresa e erra todas as outras — e a que ela acerta é a
-- que foi medida, não a que vai existir amanhã.
--
-- A regra não pode olhar o nome. Quem sabe se a etapa afirma um FATO é quem
-- configurou o funil: a etapa "Proposta enviada" só é um fato quando, para
-- aquela empresa, a proposta já saiu de fato. O dono marca quais etapas
-- afirmam fato — uma caixa por etapa, DESLIGADA por padrão.
--
-- "Desligada por padrão" é parte do desenho, não descuido: quem já opera não
-- percebe mudança nenhuma até decidir marcar. Nenhuma etapa existente passa a
-- afirmar fato sozinha, e o comportamento que o dono já conhece fica igual até
-- ele dizer o contrário.
--
-- ─── O PRECEDENTE, E ELE ESTÁ NO MESMO LUGAR ────────────────────────────────
--
-- `crm_stages.requires_human` (`boolean DEFAULT false NOT NULL`) já declara uma
-- característica da etapa que o motor lê e que o dono liga por caixa. Esta
-- coluna é a mesma forma, ao lado dela, pelo mesmo motivo: um fato sobre a
-- etapa que a automação precisa saber, e que só quem administra pode dizer.
alter table public.crm_stages
  add column if not exists afirma_fato boolean not null default false;

comment on column public.crm_stages.afirma_fato is
  'A etapa afirma que um FATO JÁ ACONTECEU — e dá para conferir se aconteceu: '
  '"proposta enviada", "contrato assinado", "pagamento recebido", "chaves '
  'entregues", "consulta realizada". NÃO afirma fato a etapa cujo nome descreve '
  'um ESTADO ou uma FASE, sem alegar evento nenhum: "negociando", "em '
  'qualificação", "aguardando retorno", "novo contato". O motor lê esta marca '
  'para NÃO adiantar o card a partir de uma promessa: quem prometeu "vou enviar '
  'a proposta" declarou intenção, e intenção não vira carimbo — a etapa '
  '"proposta enviada" só é fato quando a proposta de fato saiu. Nasce '
  'DESLIGADA para toda etapa — quem já opera não percebe mudança nenhuma até '
  'marcar a caixa na própria etapa, no vocabulário do nicho dele.';
