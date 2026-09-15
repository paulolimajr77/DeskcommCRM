-- 0269 — duas anotações ao mesmo tempo não apagam uma à outra.
--
-- ─── O defeito, medido em 2026-09-14 ────────────────────────────────────────
--
-- `app/api/v1/leads/_handler.ts` mesclava `custom_fields` NO APLICATIVO:
--
--     const prev = existing.custom_fields …        -- lido no SELECT, lá em cima
--     patch.custom_fields = { ...prev, ...input.custom_fields };
--
-- `existing` vem de uma leitura anterior. Duas escritas simultâneas com chaves
-- DIFERENTES perdem uma: a segunda leu `prev` antes de a primeira gravar, e
-- sobrescreve a coluna inteira com a versão velha mais a chave dela. Ninguém
-- recebe erro. O dado some.
--
-- ─── Por que agora ──────────────────────────────────────────────────────────
--
-- Hoje `custom_fields` é escrito raramente, à mão. Com o agente perguntando e
-- preenchendo os campos que a empresa declarou em Configurações › Funis, ele
-- passa a escrever VÁRIAS VEZES POR CONVERSA — enquanto quem atende pode estar
-- editando a mesma ficha na tela. A regra de precedência protege contra o
-- agente DECIDIR sobrescrever; esta corrida perde a escrita do humano por outra
-- porta, sem decisão nenhuma.
--
-- ─── Por que uma função, e não uma linha no handler ─────────────────────────
--
-- O handler grava pelo PostgREST (`supabase.update()`), e ele não sabe dizer
-- `custom_fields = coalesce(custom_fields,'{}'::jsonb) || $1::jsonb` — só sabe
-- mandar um VALOR pronto, que é justamente o valor calculado a partir de uma
-- leitura velha. O merge atômico tem de acontecer onde a trava de linha existe:
-- dentro do banco.
--
-- `for update` antes do `update` não é redundante com o `update`: ele é o que
-- faz a segunda transação ESPERAR e RELER o que a primeira gravou, em vez de
-- decidir com o que leu antes. Sem ele, duas chamadas concorrentes leem a mesma
-- versão e a última concatena em cima de dado vencido.
--
-- ─── O que esta função NÃO faz ──────────────────────────────────────────────
--
-- Ela não decide QUEM pode escrever o quê: precedência (humano x agente) é a
-- Tarefa 4.3, e vive no código que a chama. Aqui só se garante que nenhuma
-- escrita apague a outra por acidente de relógio. Misturar as duas coisas faria
-- uma função que ninguém consegue auditar.
--
-- `||` em `jsonb` é raso de propósito: campo de funil é chave→valor, sem
-- aninhamento. Merge profundo mudaria o significado de "apagar um campo".

create or replace function public.fn_lead_anotar_campos(
  p_org uuid, p_lead uuid, p_campos jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  resultado jsonb;
begin
  if p_campos is null or jsonb_typeof(p_campos) <> 'object' then
    raise exception 'campos_precisa_ser_objeto' using errcode = '22023';
  end if;

  -- A TRAVA É O CONSERTO. Quem chega depois espera aqui e relê o que o
  -- primeiro gravou; sem isto os dois concatenariam em cima da mesma versão
  -- velha e a última escrita venceria sozinha.
  perform 1 from public.crm_leads
   where organization_id = p_org and id = p_lead
   for update;
  if not found then
    -- Silêncio de propósito: quem pede um lead que não é da organização dele
    -- não recebe confirmação de que ele existe em outro lugar.
    return null;
  end if;

  update public.crm_leads
     set custom_fields = coalesce(custom_fields, '{}'::jsonb) || p_campos
   where organization_id = p_org and id = p_lead
   returning custom_fields into resultado;

  return resultado;
end $fn$;

-- Função nova em `public` NASCE EXPOSTA, e são DUAS origens de EXECUTE: o
-- `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO anon` do corpo do
-- baseline (que alcança toda função criada depois dele) e o grant a PUBLIC que
-- o Postgres dá a qualquer função ao criá-la. Tratar só uma deixa a função
-- alcançável pela anon key, que vai para o browser.
-- ⛔ `authenticated` ENTRA NA LISTA, e esquecê-lo custou um vermelho no CI.
-- O corpo do baseline faz `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS`
-- para anon, authenticated E service_role (linhas 4877-4879). Revogar só de
-- `public, anon` deixa esta funcao — que ESCREVE — executavel por qualquer
-- usuario logado de QUALQUER tenant. Foi o que
-- `tests/invariants/hardening-definer-varredura.test.ts` acusou.
revoke all on function public.fn_lead_anotar_campos(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_lead_anotar_campos(uuid, uuid, jsonb) to service_role;

comment on function public.fn_lead_anotar_campos(uuid, uuid, jsonb) is
  'Mescla campos personalizados no lead DENTRO do banco, sob trava de linha. '
  'Existe porque o merge no aplicativo perdia escrita concorrente em silêncio. '
  'Não decide precedência entre humano e agente — isso é de quem chama.';

notify pgrst, 'reload schema';
