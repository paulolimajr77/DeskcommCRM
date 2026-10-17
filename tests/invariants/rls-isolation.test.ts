import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * G1-02 — RLS isolation invariant.
 *
 * Runs against the ephemeral Postgres container started by scripts/test-db.sh
 * (baseline.sql already applied). Seeds 2 orgs + 1 user each, then proves that
 * a user of org A sees ZERO rows of org B in conversations / messages /
 * contacts / crm_leads under RLS, with JWT claims simulated via
 * set_config('request.jwt.claims', ...) — the same auth.uid() /
 * fn_user_org_ids() path production policies use.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — run this suite via `pnpm test:db` (scripts/test-db.sh)",
  );
}
const containerName: string = container;

/** Runs a SQL script in ONE psql session inside the container; returns stdout (tuples-only). */
function sql(script: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-f",
      "-",
    ],
    { input: script, encoding: "utf8" },
  ).trim();
}

// Fixed UUIDs make the seed idempotent (on conflict do nothing).
const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const USER_A = "aaaaaaaa-1111-4000-8000-000000000001";
const USER_B = "bbbbbbbb-1111-4000-8000-000000000002";
const SESS_A = "aaaaaaaa-2222-4000-8000-000000000001";
const SESS_B = "bbbbbbbb-2222-4000-8000-000000000002";

/**
 * Runs SELECTs as the `authenticated` role with the given user's JWT claims,
 * exactly how PostgREST/Supabase set them: session role + request.jwt.claims.
 */
function countAs(userId: string, countQuery: string): number {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${countQuery}
  `);
  // Output lines: set_config echo, then the count (last line).
  const lines = out.split("\n");
  const last = lines[lines.length - 1];
  if (last === undefined || !/^\d+$/.test(last)) {
    throw new Error(`unexpected psql output: ${out}`);
  }
  return Number(last);
}

function seedOrg(org: string, user: string, sess: string, tag: string): string {
  // No real PII: synthetic emails/names only (LGPD).
  return `
    insert into auth.users (id, email) values ('${user}', 'rls-${tag}@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${org}', 'rls-inv-${tag}', 'RLS Invariant ${tag}', 'RLS ${tag}')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${user}', '${org}', 'agent', now())
      on conflict do nothing;
    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
      values ('${sess}', '${org}', 'rls-inv-${tag}', '\\x00'::bytea)
      on conflict (id) do nothing;
  `;
}

beforeAll(() => {
  // O módulo financeiro INSTALADO antes de semear (#1907, item 3): as cinco
  // tabelas da comanda saíram do `baseline.sql` e nascem na provisionadora
  // (ADR-0002 D2/D3). Sem esta chamada as linhas de `sales`/`sale_items` do
  // seed morrem com `relation "sales" does not exist` — e a D8 manda a
  // varredura rodar num banco COM o módulo, não perder a cobertura.
  sql("select public.fn_financeiro_provisionar();");
  sql(seedOrg(ORG_A, USER_A, SESS_A, "a") + seedOrg(ORG_B, USER_B, SESS_B, "b"));
  // Contact → conversation → message + pipeline → stage → lead, per org.
  sql(`
    do $seed$
    declare
      v_org uuid;
      v_sess uuid;
      v_contact uuid;
      v_conv uuid;
      v_pipe uuid;
      v_stage uuid;
      v_agent uuid;
      v_version uuid;
      v_case uuid;
      v_boundary jsonb;
      v_proposta uuid;
      v_attendant uuid;
      v_account uuid;
      v_method uuid;
      v_event_type uuid;
      v_sale uuid;
      v_camp    uuid;
      v_sale_item uuid;
      v_empresa uuid;
      v_pessoa uuid;
      v_lote uuid;
      v_thread uuid;
      v_thread_alheia uuid;
      v_regra uuid;
    begin
      foreach v_org in array array['${ORG_A}'::uuid, '${ORG_B}'::uuid] loop
        select id into v_sess from public.channel_sessions where organization_id = v_org limit 1;

        select id into v_contact from public.contacts
          where organization_id = v_org and display_name = 'RLS Invariant Contact';
        if v_contact is null then
          insert into public.contacts (organization_id, display_name)
            values (v_org, 'RLS Invariant Contact') returning id into v_contact;
        end if;

        select id into v_conv from public.conversations
          where organization_id = v_org and contact_id = v_contact;
        if v_conv is null then
          insert into public.conversations (organization_id, contact_id, channel_session_id)
            values (v_org, v_contact, v_sess) returning id into v_conv;
        end if;

        if not exists (select 1 from public.messages where organization_id = v_org) then
          insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
            values (v_org, v_conv, v_sess, v_contact, 'text', 'inbound', 'rls invariant probe');
        end if;

        -- migration 0419 — o rascunho sugerido por integração (#1611): o TEXTO
        -- que outro sistema escreveu para esta pessoa, guardado ANTES de alguém
        -- clicar em enviar. Vazar a linha entregaria ao vizinho a mensagem que a
        -- empresa ainda não mandou — e a leitura da inbox é pela sessão do
        -- atendente, por isso a policy precisa valer nos dois sentidos.
        if not exists (select 1 from public.conversation_drafts where organization_id = v_org) then
          insert into public.conversation_drafts
            (organization_id, conversation_id, body, source, expires_at)
          values (v_org, v_conv, 'RLS invariant rascunho sugerido', 'erp', now() + interval '24 hours');
        end if;

        -- 0227: sugestões contêm texto privado da conversa. Os dois tenants
        -- recebem uma linha real, com todos os FKs e a fronteira canônica.
        -- A prova abaixo usa JWT authenticated; não é só inspeção de policy.
        if not exists (select 1 from public.ai_reply_drafts where organization_id = v_org) then
          v_boundary := public.fn_service_begin(v_org, v_contact);
          v_conv := (v_boundary->>'conversation_id')::uuid;
          insert into public.ai_agents (organization_id, name, system_prompt, operation_mode)
            values (v_org, 'RLS Invariant Assistant', 'RLS invariant private prompt', 'assisted')
            returning id into v_agent;
          insert into public.ai_agent_versions
            (organization_id, agent_id, version_number, system_prompt, provider, model, channel_session_id, status)
            values (v_org, v_agent, 1, 'RLS invariant private prompt', 'anthropic', 'rls-test-model', v_sess, 'published')
            returning id into v_version;
          update public.ai_agents set published_version_id = v_version
            where organization_id = v_org and id = v_agent;
          insert into public.ai_reply_drafts
            (organization_id, conversation_id, contact_id, agent_id, agent_version_id,
             channel_session_id, service_boundary, context_revision, operation_revision,
             status, original_body)
            values (v_org, v_conv, v_contact, v_agent, v_version, v_sess, v_boundary,
              (select reply_context_revision from public.conversations where organization_id = v_org and id = v_conv),
              (select operation_revision from public.ai_agents where organization_id = v_org and id = v_agent),
              'pending', 'RLS invariant private reply');
        end if;

        -- 0665 (#2796): o vínculo versão↔número. O agente passa a declarar em
        -- quais números atende; o número PRINCIPAL segue em
        -- ai_agent_versions.channel_session_id. A linha abaixo vincula a versão
        -- publicada acima ao número da organização, para o caso de isolamento
        -- desta lista (o agent semeado é controle positivo legítimo: a leitura
        -- é org-scoped sem gate de papel).
        if not exists (select 1 from public.ai_agent_version_channels where organization_id = v_org) then
          insert into public.ai_agent_version_channels
            (organization_id, agent_version_id, channel_session_id)
          select v_org, v.id, v_sess
            from public.ai_agent_versions v
           where v.organization_id = v_org
           order by v.version_number desc
           limit 1;
        end if;

        -- 0281: a conversa INTERNA da equipe com a IA sobre um caso. Guarda o
        -- texto que a pessoa perguntou e a resposta que a IA deu sobre um
        -- contato identificável — vazar entre organizações entregaria ao
        -- vizinho a deliberação inteira sobre um cliente que não é dele.
        --
        -- ⚠️ ARMADILHA DESTA SEMENTE, escrita para o próximo não cair nela: o
        -- controle positivo só passa porque a conversa semeada tem
        -- 'assigned_to_user_id' NULO e o default de 'visibility_mode' é
        -- 'own_and_unassigned'. A policy desta tabela chama
        -- 'fn_can_view_conversation', e o usuário semeado aqui é 'agent' — quem
        -- atribuir a conversa a OUTRA pessoa neste seed deixa o caso vermelho
        -- por ACERTO, e a "correção" natural seria afrouxar a policy. O eixo de
        -- visibilidade (que é a razão de a tabela existir com 'conversation_id'
        -- dentro) é medido em 'conversa-do-caso-visibilidade.test.ts', com
        -- organização em 'visibility_mode = 'own'' e dois atendentes.
        if not exists (select 1 from public.agent_case_chat_messages where organization_id = v_org) then
          select id into v_case from public.agent_cases
            where organization_id = v_org and conversation_id = v_conv limit 1;
          if v_case is null then
            insert into public.agent_cases (organization_id, conversation_id, title, summary, blocker)
              values (v_org, v_conv, 'RLS Invariant Case', 'RLS invariant private summary',
                      'RLS invariant private blocker')
              returning id into v_case;
          end if;
          insert into public.agent_case_chat_messages
            (organization_id, case_id, conversation_id, contact_id, turn_id, author_kind, body)
          values
            (v_org, v_case, v_conv, v_contact, gen_random_uuid(), 'human',
             'RLS invariant private question');
        end if;

        -- 0291: a passagem do atendimento para uma pessoa. A coluna body é a
        -- narrativa que a IA escreveu sobre o cliente, e notes são as palavras
        -- literais dele — vazar entre organizações entrega ao vizinho o
        -- atendimento inteiro de alguém que não é cliente dele.
        -- (sem crase nesta prosa: o bloco inteiro é um template literal de JS.)
        --
        -- ⚠️ A MESMA ARMADILHA da semente acima: o controle positivo só passa
        -- porque 'v_conv' está SEM dono e o default de 'visibility_mode' é
        -- 'own_and_unassigned'. Atribuir a conversa aqui deixa o caso vermelho
        -- por ACERTO, e a "correção" natural seria afrouxar a policy.
        if not exists (select 1 from public.passagens_de_atendimento where organization_id = v_org) then
          insert into public.passagens_de_atendimento
            (organization_id, contact_id, conversation_id, motor, origem, motivo_codigo, body, notes)
          values
            (v_org, v_contact, v_conv, 'engine', 'pedido_explicito', 'requested_human',
             'RLS invariant private briefing', 'RLS invariant literal words');
        end if;

        select id into v_pipe from public.crm_pipelines
          where organization_id = v_org and slug = 'rls-inv';
        if v_pipe is null then
          insert into public.crm_pipelines (organization_id, name, slug)
            values (v_org, 'RLS Invariant', 'rls-inv') returning id into v_pipe;
        end if;

        select id into v_stage from public.crm_stages
          where organization_id = v_org and pipeline_id = v_pipe and slug = 'novo';
        if v_stage is null then
          insert into public.crm_stages (organization_id, pipeline_id, name, slug, position)
            values (v_org, v_pipe, 'Novo', 'novo', 1000) returning id into v_stage;
        end if;

        if not exists (select 1 from public.crm_leads where organization_id = v_org) then
          insert into public.crm_leads (organization_id, pipeline_id, stage_id, title)
            values (v_org, v_pipe, v_stage, 'RLS invariant lead');
        end if;

        -- crm_proposals/crm_proposal_items (migration 0464): a proposta comercial.
        -- crm_proposal_items tem organization_id próprio, com trigger de
        -- consistência contra crm_proposals.organization_id
        -- (fn_verificar_org_do_item_da_proposta) — o insert abaixo usa v_org nos
        -- dois lados de propósito, para não bater na trava. Select-then-if-null-
        -- insert, mesmo padrão de v_pipe/v_stage acima: precisa de v_proposta
        -- preenchido em toda passada do loop (o seed roda 2x, uma por org), não
        -- só na primeira.
        select id into v_proposta from public.crm_proposals
          where organization_id = v_org and titulo = 'RLS invariant proposal';
        if v_proposta is null then
          insert into public.crm_proposals
            (organization_id, lead_id, contact_id, titulo, total_cents)
          select v_org, id, v_contact, 'RLS invariant proposal', 1000
          from public.crm_leads where organization_id = v_org limit 1
          returning id into v_proposta;
        end if;

        if not exists (
          select 1 from public.crm_proposal_items where proposal_id = v_proposta
        ) then
          insert into public.crm_proposal_items
            (proposal_id, organization_id, descricao, quantidade, preco_unitario_cents, position)
          values (v_proposta, v_org, 'RLS invariant item', 1, 1000, 1000);
        end if;

        if not exists (select 1 from public.org_guardrail_layers where organization_id = v_org) then
          insert into public.org_guardrail_layers (organization_id, layer, enabled)
            values (v_org, 'jailbreak', true);
        end if;

        if not exists (select 1 from public.org_memory_versions where organization_id = v_org) then
          insert into public.org_memory_versions (organization_id, version_number, content)
            values (v_org, 1, 'RLS invariant memory doc');
        end if;

        if not exists (select 1 from public.org_memory_entries where organization_id = v_org) then
          insert into public.org_memory_entries (organization_id, title, body, source)
            values (v_org, 'RLS invariant entry', 'RLS invariant body', 'manual');
        end if;

        if not exists (select 1 from public.skill_activations where organization_id = v_org) then
          insert into public.skill_activations (organization_id, skill_name, trigger)
            values (v_org, 's', 'hard');
        end if;

        if not exists (select 1 from public.ai_routers where organization_id = v_org) then
          insert into public.ai_routers (organization_id, name, channel_session_id)
            values (v_org, 'RLS Invariant Router', v_sess);
        end if;

        if not exists (select 1 from public.ai_router_decisions where organization_id = v_org) then
          insert into public.ai_router_decisions (organization_id, outcome)
            values (v_org, 'no_match');
        end if;

        if not exists (select 1 from public.knowledge_searches where organization_id = v_org) then
          insert into public.knowledge_searches (organization_id, hits, top_score, threshold)
            values (v_org, 1, 0.81, 0.72);
        end if;

        -- contact_field_proposals (migration 0123): a fila guarda e-mail e
        -- telefone que o cliente DITOU na conversa — PII crua, e a tabela nasce
        -- com CRUD inteiro para "authenticated" (o ALTER DEFAULT PRIVILEGES do
        -- baseline vale para todo objeto criado no apêndice). A única coisa
        -- entre o tenant A e o e-mail do cliente do tenant B é a policy.
        if not exists (select 1 from public.contact_field_proposals where organization_id = v_org) then
          insert into public.contact_field_proposals
            (organization_id, contact_id, campo, valor_proposto, expires_at)
            values (v_org, v_contact, 'email', 'rls-invariant@exemplo.test', now() + interval '7 days');
        end if;

        if not exists (select 1 from public.catalog_products where organization_id = v_org) then
          insert into public.catalog_products
            (organization_id, codigo, nome, preco_cents)
            values (v_org, 'RLS-' || v_org::text, 'Produto de invariante', 100);
        end if;

        -- crm_tasks (migration 0210): o que o time combinou fazer, com prazo.
        -- Entra COM o vínculo de lead porque a tarefa presa a um negócio é o
        -- caso que cruza duas tabelas tenant-aware — se a policy vazasse, o
        -- vizinho leria o combinado E o ponteiro para o funil dele.
        -- (sem crase nesta prosa: o bloco inteiro é um template literal de JS.)
        if not exists (select 1 from public.crm_tasks where organization_id = v_org) then
          insert into public.crm_tasks (organization_id, title, lead_id)
            values (v_org, 'RLS invariant task',
                    (select id from public.crm_leads where organization_id = v_org limit 1));
        end if;

        -- voice_calls (0232): a chamada pendurada na sessão de canal da org.
        -- O wacalls_call_id varia por organizacao porque a tabela tem
        -- unique (organization_id, wacalls_call_id) — mesmo cuidado do endpoint
        -- de push_subscriptions logo abaixo.
        -- (sem crase nesta prosa: o bloco inteiro é um template literal de JS.)
        if not exists (select 1 from public.voice_calls where organization_id = v_org) then
          insert into public.voice_calls
            (organization_id, channel_session_id, contact_id, wacalls_call_id,
             direction, peer_phone, status)
            values (v_org, v_sess, v_contact, 'rls-' || v_org::text,
                    'inbound', '5511900000000', 'ended');
        end if;

        -- org_voice_calls (0236): o opt-in da chamada de voz, uma linha por
        -- organizacao. A PK e o proprio organization_id, entao a semente e
        -- idempotente por construcao — mas o if not exists fica pelo mesmo
        -- motivo das vizinhas: o seed roda duas vezes, uma por org.
        if not exists (select 1 from public.org_voice_calls where organization_id = v_org) then
          insert into public.org_voice_calls (organization_id, enabled)
            values (v_org, false);
        end if;

        if not exists (select 1 from public.push_subscriptions where organization_id = v_org) then
          insert into public.push_subscriptions
            (organization_id, user_id, endpoint, p256dh, auth)
            values (
              v_org,
              case when v_org = '${ORG_A}'::uuid then '${USER_A}'::uuid else '${USER_B}'::uuid end,
              'https://push.example.test/rls-' || v_org::text,
              'p256dh-rls',
              'auth-rls'
            );
        end if;

        -- voip_trunk_settings (migration 0349): credenciais do trunk SIP da
        -- organizacao. PK e o proprio organization_id (um trunk por org), e a
        -- senha cifrada tem o MESMO esquema de ai_provider_credentials -- os
        -- bytea aqui sao so preenchimento minimo pra satisfazer os NOT NULL,
        -- nunca material real.
        if not exists (select 1 from public.voip_trunk_settings where organization_id = v_org) then
          insert into public.voip_trunk_settings
            (organization_id, host, username, password_encrypted, password_iv, password_tag, password_last4, endpoint_name)
            values (v_org, 'sip.rls-invariant.test', 'rls-user', '\\x00'::bytea, '\\x00'::bytea, '\\x00'::bytea, '0000', 'org-' || v_org::text || '-trunk-endpoint');
        end if;

        -- phone_numbers (SIP module, #677): numeros (DID) que a org cadastrou
        -- pra receber ligacoes. 'number' e UNIQUE global, entao cada org
        -- precisa de um valor distinto -- sufixado pelo proprio v_org.
        if not exists (select 1 from public.phone_numbers where organization_id = v_org) then
          insert into public.phone_numbers (organization_id, number, trunk_endpoint)
            values (v_org, 'rls-' || v_org::text, 'trunk-endpoint');
        end if;

        if not exists (select 1 from public.ai_provider_credentials where organization_id = v_org) then
          insert into public.ai_provider_credentials
            (organization_id, provider, label, api_key_encrypted, api_key_iv, api_key_tag, api_key_last4)
            values (v_org, 'anthropic', 'rls-invariant', '\\x00'::bytea, '\\x00'::bytea, '\\x00'::bytea, '0000');
        end if;

        -- ─── o módulo financeiro (migrations 0350-0357) ──────────────────
        --
        -- Dez tabelas que guardam o que a organização fatura, para quem, por
        -- quanto, e quanto cada pessoa levou de comissão. Vazar qualquer uma
        -- entrega ao vizinho o faturamento inteiro: quanto a clínica ao lado
        -- cobra por consulta, quanto o atendente dela ganha, e quais clientes
        -- pagaram. A LEITURA das dez é org-scoped SEM gate de papel (o 'agent'
        -- semeado aqui é controle positivo válido); a ESCRITA exige 'manager'
        -- no catálogo e 'agent' na comanda, e esse segundo eixo NÃO é medido
        -- aqui. (sem crase nesta prosa: o bloco inteiro é um template literal
        -- de JS.)
        select user_id into v_attendant from public.user_organizations
          where organization_id = v_org limit 1;

        if not exists (select 1 from public.financial_accounts where organization_id = v_org) then
          insert into public.financial_accounts (organization_id, name, kind)
            values (v_org, 'RLS Invariant Caixa', 'cash');
        end if;
        select id into v_account from public.financial_accounts
          where organization_id = v_org limit 1;

        if not exists (select 1 from public.account_plans where organization_id = v_org) then
          insert into public.account_plans (organization_id, name, direction)
            values (v_org, 'RLS Invariant Servicos', 'in');
        end if;

        if not exists (select 1 from public.payment_methods where organization_id = v_org) then
          insert into public.payment_methods (organization_id, name, account_id)
            values (v_org, 'RLS Invariant Dinheiro', v_account);
        end if;
        select id into v_method from public.payment_methods
          where organization_id = v_org limit 1;

        -- O tipo de evento é o catálogo de serviços deste produto, e é o alvo
        -- da regra de comissão e do item da comanda.
        select id into v_event_type from public.calendar_event_types
          where organization_id = v_org and slug = 'rls-inv';
        if v_event_type is null then
          insert into public.calendar_event_types (organization_id, name, slug, duration_minutes)
            values (v_org, 'RLS Invariant Servico', 'rls-inv', 30)
            returning id into v_event_type;
        end if;

        if not exists (select 1 from public.commission_rules where organization_id = v_org) then
          insert into public.commission_rules
            (organization_id, attendant_user_id, event_type_id, percent)
            values (v_org, v_attendant, v_event_type, 10);
        end if;

        if not exists (select 1 from public.recurring_entries where organization_id = v_org) then
          insert into public.recurring_entries
            (organization_id, name, account_id, direction, amount_cents, day_of_month)
            values (v_org, 'RLS Invariant Aluguel', v_account, 'out', 100000, 5);
        end if;

        -- A comanda e o que pende dela. Inserida DIRETO, e não por
        -- fn_finalizar_comanda: o que se prova aqui é a cerca da LINHA, e
        -- passar pela função amarraria esta semente ao comportamento dela.
        if not exists (select 1 from public.sales where organization_id = v_org) then
          insert into public.sales
            (organization_id, number, contact_id, attendant_user_id, payment_method_id,
             status, total_cents)
            values (v_org, 1, v_contact, v_attendant, v_method, 'open', 5000);
        end if;
        select id into v_sale from public.sales where organization_id = v_org limit 1;

        if not exists (select 1 from public.sale_items where organization_id = v_org) then
          insert into public.sale_items
            (organization_id, sale_id, event_type_id, description, attendant_user_id,
             unit_price_cents, total_cents, commission_percent)
            values (v_org, v_sale, v_event_type, 'RLS Invariant Servico', v_attendant,
                    5000, 5000, 10);
        end if;
        select id into v_sale_item from public.sale_items where organization_id = v_org limit 1;

        if not exists (select 1 from public.commissions where organization_id = v_org) then
          insert into public.commissions
            (organization_id, sale_item_id, attendant_user_id, percent, amount_cents)
            values (v_org, v_sale_item, v_attendant, 10, 500);
        end if;

        if not exists (select 1 from public.financial_entries where organization_id = v_org) then
          insert into public.financial_entries
            (organization_id, account_id, sale_id, direction, amount_cents, description, origin)
            values (v_org, v_account, v_sale, 'in', 5000, 'RLS invariant recebimento', 'sale');
        end if;

        if not exists (select 1 from public.loyalty_ledger where organization_id = v_org) then
          insert into public.loyalty_ledger
            (organization_id, contact_id, points, reason, sale_id)
            values (v_org, v_contact, 5, 'RLS invariant ponto', v_sale);
        end if;

        -- migration 0372 — a conexão com o PostgreSQL externo. As três colunas
        -- de senha são bytea not null e a cifra é do APP (AES-GCM), não do
        -- banco: aqui vai um envelope QUALQUER, porque o que se mede é a cerca
        -- de organização, não a cifra. O SELECT lido pelo caso abaixo é o da
        -- TABELA-base; a view _safe é security_invoker e herda esta mesma
        -- RLS, então provar a base prova as duas.
        if not exists (select 1 from public.external_db_connections where organization_id = v_org) then
          insert into public.external_db_connections
            (organization_id, label, host, port, database_name, username,
             password_encrypted, password_iv, password_tag)
            values (v_org, 'RLS invariant fonte externa', 'db.invariante.interno', 5432,
                    'outro_crm', 'leitor',
                    '\\x00'::bytea, '\\x000000000000000000000000'::bytea,
                    '\\x00000000000000000000000000000000'::bytea);
        end if;

        -- migrations 0374/0375 -- a campanha e quem ela alcancou. A tabela
        -- campaigns NAO entra na lista de TABLES porque nao tem FK para
        -- contacts; as duas que guardam pessoa, sim. channel_session_id e
        -- obrigatorio e reusa a sessao que esta semente ja criou.
        if not exists (select 1 from public.campaigns where organization_id = v_org) then
          -- um id por ORGANIZACAO: o loop roda para as duas, e um uuid sorteado
          -- na declaracao seria o MESMO nas duas voltas (campaigns_pkey).
          v_camp := gen_random_uuid();
          insert into public.campaigns
            (id, organization_id, name, channel_session_id, base_legal, lia_ref)
            values (v_camp, v_org, 'RLS invariant campanha', v_sess,
                    'legitimate_interest', 'LIA-RLS-INVARIANTE');

          insert into public.campaign_recipients
            (organization_id, campaign_id, contact_id, recipient_address, rendered_body)
            values (v_org, v_camp, v_contact, '+5500000000000', 'RLS invariant mensagem');

          insert into public.campaign_suppressions
            (organization_id, contact_id, recipient_address_hash, address_tail, reason)
            values (v_org, v_contact, md5(v_org::text || 'rls-invariante'), '0000', 'RLS invariant');

          -- o texto salvo e o pool de numeros da campanha: as duas sao
          -- tenant-aware e entram na lista abaixo pelo mesmo motivo.
          insert into public.campaign_templates
            (organization_id, name, body)
            values (v_org, 'RLS invariant modelo', 'RLS invariant corpo');

          insert into public.campaign_channel_sessions
            (organization_id, campaign_id, channel_session_id)
            values (v_org, v_camp, v_sess);
        end if;
        -- migration 0448 (metade B2B do #1621): empresa, pessoa que decide, o
        -- vínculo entre as duas e o lote de planilha com a sua linha. A linha
        -- importada guarda o texto cru da planilha (nome e telefone de gente),
        -- e a pessoa é gente: vazar qualquer uma entrega ao vizinho a carteira
        -- de clientes B2B da organização. Select-then-insert: o seed roda uma
        -- vez por organização e cada passada precisa das próprias ids.
        select id into v_empresa from public.companies
          where organization_id = v_org and trade_name = 'RLS invariant empresa';
        if v_empresa is null then
          insert into public.companies (organization_id, trade_name)
            values (v_org, 'RLS invariant empresa') returning id into v_empresa;
        end if;
        select id into v_pessoa from public.people
          where organization_id = v_org and full_name = 'RLS invariant pessoa';
        if v_pessoa is null then
          insert into public.people (organization_id, full_name)
            values (v_org, 'RLS invariant pessoa') returning id into v_pessoa;
        end if;
        insert into public.company_people (organization_id, company_id, person_id)
          values (v_org, v_empresa, v_pessoa)
          on conflict (company_id, person_id) do nothing;
        select id into v_lote from public.import_batches
          where organization_id = v_org and filename = 'rls-invariant.csv';
        if v_lote is null then
          insert into public.import_batches (organization_id, filename)
            values (v_org, 'rls-invariant.csv') returning id into v_lote;
        end if;
        insert into public.import_rows (organization_id, batch_id, row_number, raw_data)
          values (v_org, v_lote, 2, '{"nome": "RLS invariant"}'::jsonb)
          on conflict (batch_id, row_number) do nothing;

        -- migration 0626 (#2388): a janela de manutencao de conexoes. Vazar a
        -- linha entrega ao vizinho os horarios em que o outro vai mexer nas
        -- conexoes dele e o canal alvo da janela — e a retomada programada
        -- passaria a ser do vizinho. Select-then-insert, como as irmas acima.
        if not exists (select 1 from public.channel_schedules where organization_id = v_org) then
          insert into public.channel_schedules
            (organization_id, channel_session_id, starts_at, ends_at)
          values
            (v_org, v_sess, timestamptz '2030-01-01 03:00:00+00', timestamptz '2030-01-01 05:00:00+00');
        end if;

        -- migration 0687 — o histórico do chat do assistente interno. Guarda o
        -- que a pessoa perguntou sobre a operação e o que o assistente
        -- respondeu: sem contact_id de propósito (config + agregados, nunca
        -- titular), então vazar a linha entrega ao vizinho a deliberação sobre
        -- a operação dele, não dado de cliente. Leitura é o único comando que
        -- a tabela concede a authenticated (papel viewer ou acima); a
        -- escrita é do servidor. Select-then-insert, como as irmãs acima: o
        -- controle positivo precisa da thread semeada nesta passada do loop.
        select id into v_thread from public.config_threads
          where organization_id = v_org
            and created_by = case when v_org = '${ORG_A}'::uuid then '${USER_A}'::uuid else '${USER_B}'::uuid end
          limit 1;
        -- A conversa é do DONO (created_by = auth.uid()): a semente da organização é
        -- do usuário dela, senão o controle positivo falharia por ACERTO.
        if v_thread is null then
          insert into public.config_threads (organization_id, kind, created_by)
            values (v_org, 'leitura',
                    case when v_org = '${ORG_A}'::uuid then '${USER_A}'::uuid else '${USER_B}'::uuid end)
            returning id into v_thread;
        end if;
        if not exists (select 1 from public.config_messages where thread_id = v_thread) then
          insert into public.config_messages
            (thread_id, organization_id, turn_id, author_kind, body)
          values
            (v_thread, v_org, gen_random_uuid(), 'human',
             'RLS invariant config question');
        end if;
        -- Uma conversa de OUTRA pessoa da MESMA organização (id que não é de ninguém
        -- semeado aqui): o usuário da organização não pode ler nem a conversa nem as mensagens.
        select id into v_thread_alheia from public.config_threads
          where organization_id = v_org and created_by = 'cccccccc-1111-4000-8000-000000000003'::uuid limit 1;
        if v_thread_alheia is null then
          insert into public.config_threads (organization_id, kind, created_by)
            values (v_org, 'leitura', 'cccccccc-1111-4000-8000-000000000003'::uuid)
            returning id into v_thread_alheia;
        end if;
        if not exists (select 1 from public.config_messages where thread_id = v_thread_alheia) then
          insert into public.config_messages
            (thread_id, organization_id, turn_id, author_kind, body)
          values
            (v_thread_alheia, v_org, gen_random_uuid(), 'ai',
             'RLS invariant resposta de outra pessoa da mesma organização');
        end if;

        -- migration 0696 — o retrato da auditoria da empresa (F3): estado de cada
        -- verificação e a contagem de pendências. Leitura org-flat (qualquer
        -- membro; o agent semeado é controle positivo legítimo); a escrita pela
        -- sessão é só do admin e é medida no describe dedicado
        -- ("config_snapshots (migration 0696)"). Select-then-insert, como as irmãs.
        if not exists (select 1 from public.config_snapshots where organization_id = v_org) then
          insert into public.config_snapshots (organization_id, resultado, pendencias)
          values (v_org, '{"itens":[]}'::jsonb, 0);
        end if;

        -- migration 0692 (#2041): o historico do rodizio da acao assign_owner.
        -- Semeado pelo ESCRITOR de producao (a funcao), com uma regra cuja fila
        -- e o usuario semeado (agent, elegivel). A leitura e org-scoped sem gate
        -- de papel, entao o agent e controle positivo legitimo; a escrita nao e
        -- concedida a authenticated (medido em rodizio-da-acao-atribuir.test.ts).
        if not exists (select 1 from public.automation_rodizio_atribuicoes where organization_id = v_org) then
          insert into public.automation_rules (organization_id, name, trigger_event, actions)
          select v_org, 'RLS invariant rodizio', 'lead.created',
                 jsonb_build_array(jsonb_build_object('type', 'assign_owner', 'config',
                   jsonb_build_object('modo', 'rodizio', 'fila',
                     jsonb_build_array(jsonb_build_object('user_id', uo.user_id, 'pausado', false)))))
            from public.user_organizations uo
           where uo.organization_id = v_org
           limit 1
          returning id into v_regra;
          perform public.fn_automation_rodizio_atribuir(v_org, v_regra,
            (select id from public.crm_leads where organization_id = v_org limit 1));
        end if;
      end loop;
    end
    $seed$;
  `);
});

/**
 * ⚠️ LISTA FIXA — tabela tenant-aware nova que NÃO entrar aqui passa verde sem
 * RLS. Não existe varredura genérica do tipo "toda tabela com organization_id
 * tem relrowsecurity = true"; quem cria tabela nova acrescenta a linha aqui, no
 * MESMO commit da migration.
 *
 * E conferir o catálogo (`relrowsecurity`, `pg_policy` contendo o nome da
 * função) NÃO substitui este percurso: policy que diga
 * `organization_id in (select fn_user_org_ids()) or true` satisfaz as duas
 * checagens de catálogo e devolve a org inteira do vizinho. Medido — ver o
 * cabeçalho do caso de `contact_field_proposals` abaixo.
 */
export const TABLES = [
  "conversations",
  "messages",
  "contacts",
  "crm_leads",
  "org_memory_versions",
  "org_memory_entries",
  "skill_activations",
  "ai_routers",
  "ai_router_decisions",
  "knowledge_searches",
  // migration 0123 (spec 17 §4b) — guarda e-mail/telefone ditos na conversa.
  "contact_field_proposals",
  // migration 0142 — a escolha de camadas de segurança da organização. Entrou aqui
  // depois de uma auditoria medir que ela NÃO tinha prova comportamental nenhuma:
  // o teste de schema dela conecta como `postgres` (rolbypassrls = t), e com a policy
  // sabotada para `... or true` a suíte seguia 31/31 verde num banco em que o vizinho
  // lia e escrevia. É o modo de falha que o aviso acima descreve, encontrado vivo.
  "org_guardrail_layers",
  "push_subscriptions",
  // migration 0204 — o catálogo de produtos da loja. A leitura é org-scoped sem
  // gate de papel (o `agent` semeado aqui precisa ler para atender), e a ESCRITA
  // exige `manager` — esse segundo eixo é medido em
  // `tests/invariants/catalogo-so-gestor-muda-preco.test.ts`, não aqui.
  "catalog_products",
  // migration 0210 — as tarefas do CRM. A leitura é org-scoped sem gate de papel
  // (o `viewer` precisa ver o que o time combinou); a ESCRITA exige `agent`, e
  // esse segundo eixo NÃO é medido aqui — o usuário semeado é `agent`, então o
  // controle positivo passaria por acerto. Quem mede a escrita é a rota, em
  // `tests/unit/tarefas-rota-nao-tem-porta-dos-fundos.test.ts`.
  "crm_tasks",
  // migration 0464 — a proposta comercial. Read/write org-scoped sem gate de
  // papel além de fn_role_at_least('agent'); o gate de ENVIO (manager) é
  // medido na rota, não aqui (mesmo eixo separado de catalog_products acima).
  "crm_proposals",
  // crm_proposal_items tem organization_id próprio, com trigger de
  // consistência contra crm_proposals.organization_id. Confirmado com o
  // insert do seed acima, que usa a mesma org nos dois lados.
  "crm_proposal_items",
  // 0227 — texto de sugestões: org + visibilidade da conversa por authenticated.
  "ai_reply_drafts",
  // migration 0349 — credenciais do trunk SIP por organizacao. Leitura e
  // qualquer membro da org (a tela de originar chamada precisa saber SE
  // existe trunk configurado); a ESCRITA exige admin (mesmo nivel de
  // ai_provider_credentials) e NAO e medida aqui.
  "voip_trunk_settings",
  // phone_numbers (SIP module, #677): numeros (DID) que recebem ligacao.
  // Leitura/escrita org-scoped (sem segundo eixo medido aqui -- ver a nota
  // de DIVIDA_RBAC_CONHECIDA em rbac-config-ia-canais.test.ts).
  "phone_numbers",
  // 0232/0235 — chamada de voz. Guarda `peer_phone` (telefone da outra ponta) e
  // `owner_user_id` (quem atendeu): vazar a linha entrega ao vizinho com quem a
  // organização falou, quando, por quanto tempo e por meio de quem. A policy
  // nasceu SEM o `for all` explícito, e o comportamento casava com o nome
  // `_all` por default do Postgres, não por declaração — a 0235 a reescreve e
  // este é o caso que mede a reescrita pelo desfecho.
  "voice_calls",
  // migration 0236 — o opt-in por organizacao da chamada de voz. Guarda quem
  // aceitou o risco do segundo aparelho vinculado: vazar entre organizacoes
  // diria a uma empresa quem, na outra, ligou a feature e quando.
  "org_voice_calls",
  // migration 0207 — as credenciais de IA da organização. A 0150 apagou a policy
  // de leitura por organização sem que nada acusasse, e a 0207 a restaurou; esta
  // linha é o que passa a acusar se ela sumir de novo (issue #545). A leitura é
  // org-scoped sem gate de papel, então o `agent` semeado serve de controle
  // positivo. O SELECT de `authenticated` é por COLUNA, sem as colunas cifradas:
  // a contagem abaixo usa só `organization_id` e mede o que um membro enxerga.
  "ai_provider_credentials",
  // migration 0281 — a conversa interna da equipe com a IA sobre um caso. `body`
  // é texto livre que descreve uma pessoa identificável do OUTRO tenant, e a
  // leitura é o único comando que a tabela concede a `authenticated` (a escrita
  // é do servidor). Ver a armadilha do seed, escrita ao lado da semente: o
  // controle positivo depende de a conversa semeada estar SEM dono.
  "agent_case_chat_messages",
  // migration 0291 — a passagem do atendimento para uma pessoa. `body` é a
  // narrativa que a IA escreveu sobre um cliente identificável do OUTRO tenant,
  // e `notes` guarda as palavras LITERAIS dele. Mesmo desenho da vizinha acima:
  // leitura é o único comando concedido a `authenticated`, a escrita é do
  // servidor, e a MESMA armadilha de seed vale aqui — o controle positivo só
  // passa porque a conversa semeada está sem dono e o default de
  // `visibility_mode` é `own_and_unassigned`. O eixo de visibilidade entre
  // atendentes da MESMA organização é medido em
  // `passagem-isolamento-e-visibilidade.test.ts`, com `visibility_mode = 'own'`.
  "passagens_de_atendimento",
  // migrations 0350-0357 — o módulo financeiro. As dez guardam o faturamento
  // da organização: quanto ela cobra, de quem recebeu, quem atendeu e quanto
  // cada pessoa levou de comissão. Vazar uma linha entrega ao vizinho o preço
  // praticado e a carteira de clientes — é o dado comercial mais sensível que
  // este produto grava, e o único dos dois lados (dinheiro E pessoa).
  //
  // A LEITURA das dez é org-scoped sem gate de papel, então o `agent` semeado
  // aqui é controle positivo legítimo. A ESCRITA tem um segundo eixo que NÃO é
  // medido nesta lista: `manager` no catálogo (0350/0357) e `agent` na comanda
  // (0351). Quem for medir a escrita precisa de um usuário `viewer`, que este
  // seed não tem.
  "financial_accounts",
  "payment_methods",
  "account_plans",
  "sales",
  "sale_items",
  "commission_rules",
  "commissions",
  "financial_entries",
  "loyalty_ledger",
  "recurring_entries",
  // migration 0372 — a conexão com um PostgreSQL de OUTRO sistema (recorte do
  // PR #1130, de @vgamkt). Vazar a linha entrega ao vizinho o host, a porta, o
  // banco e o USUÁRIO do sistema interno dele: metade de uma credencial, e o
  // mapa de por onde entrar. A senha em si não sai nem para o dono (as três
  // colunas cifradas só existem na tabela-base; a tela lê a view `_safe`).
  //
  // Cabe neste molde porque a policy de SELECT é org-scoped SEM gate de papel
  // — qualquer membro vê a lista, decisão do dono —, então o `agent` semeado
  // aqui é controle positivo legítimo. A ESCRITA tem um segundo eixo que este
  // seed NÃO mede: a policy `for all` exige `fn_role_at_least(org,'admin')`, e
  // provar isso pediria um usuário abaixo de admin escrevendo. Fica declarado
  // em vez de parecer coberto.
  "external_db_connections",
  // ⚠️ `webhook_lead_captures` (migration 0174) NÃO entra nesta lista, e a
  // ausência é deliberada: a policy dela exige `manager`, e o usuário semeado
  // aqui é `agent` — o controle positivo falharia por ACERTO, e a "correção"
  // natural seria afrouxar a policy para caber no molde. A prova dela vive em
  // `tests/invariants/historico-de-captacao-rls.test.ts`, que mede as duas
  // direções MAIS o gate de papel (o `viewer` que não lê o formulário).
  // migrations 0374/0375 — a campanha guarda o que foi DITO à pessoa
  // (`rendered_body`) e o endereço para onde foi. Entram aqui no MESMO commit
  // da migration, como a nota acima exige.
  "campaign_recipients",
  "campaign_suppressions",
  "campaigns",
  "campaign_templates",
  "campaign_channel_sessions",
  // migration 0419 (issue #1611) — o rascunho sugerido por integração. Guarda o
  // TEXTO que um outro sistema escreveu sobre uma pessoa da conversa, antes de
  // alguém clicar em enviar: vazar a linha entregaria ao vizinho a mensagem que
  // a empresa ainda não mandou. A leitura é da SESSÃO do atendente (a caixa de
  // entrada abre por `?rascunho=`), então o `agent` semeado aqui é controle
  // positivo legítimo e a policy `for all` cobre também o UPDATE do consumo.
  "conversation_drafts",
  // migration 0448 (metade B2B do #1621) — as cinco tabelas do módulo de
  // empresas. Leitura org-flat; a escrita por papel (manager cria, agent
  // edita) é medida em tests/invariants/companies-people-rls.test.ts.
  "companies",
  "people",
  "company_people",
  "import_batches",
  "import_rows",
  // migration 0626 (#2388) — a janela de manutenção de conexões: horários e
  // canal alvo. Leitura org-flat (o dono enxerga as próprias janelas na tela
  // de Conexões); a escrita é do admin e do servidor, e o cron aplica pela
  // RPC. Vazar a linha entrega ao vizinho quando o outro vai mexer nas
  // conexões dele — e a retomada programada passaria a ser do vizinho.
  "channel_schedules",
  // migration 0687 — o histórico do chat do assistente interno (F1). Leitura
  // org-scoped com gate de papel `viewer` (o usuário semeado aqui é `agent`,
  // então é controle positivo legítimo); a ESCRITA é do servidor e não é
  // medida aqui — quem mede a escrita são as rotas, em teste de rota.
  "config_threads",
  "config_messages",
  // migration 0696 — o retrato da auditoria da empresa (F3). Org-flat: o agent
  // semeado lê o da própria organização (controle positivo) e zero o da outra.
  "config_snapshots",
  // migration 0665 (#2796, fatia 1) — o vínculo versão↔número: em quais números
  // uma versão de agente atende. A LEITURA é org-scoped pela policy `select`
  // (fn_user_org_ids) sem gate de papel, então o `agent` semeado é controle
  // positivo legítimo; a ESCRITA é `for all` com fn_role_at_least(admin),
  // medida em vinculo-do-agente-ao-numero.test.ts. O número PRINCIPAL segue em
  // ai_agent_versions.channel_session_id — esta tabela só acrescenta vínculos.
  "ai_agent_version_channels",
  // migration 0692 (#2041) — o histórico do rodízio da ação "Atribuir a um
  // atendente": quem recebeu cada lead e em que posição da fila. Vazar a linha
  // entrega ao vizinho quem atende qual negócio e o ritmo de distribuição da
  // equipe. A LEITURA é org-scoped sem gate de papel (o `agent` semeado é
  // controle positivo legítimo); a ESCRITA não é concedida a `authenticated` —
  // só a função `fn_automation_rodizio_atribuir`, com service_role, grava. Esse
  // segundo eixo é medido em rodizio-da-acao-atribuir.test.ts.
  "automation_rodizio_atribuicoes",
  // ⚠️ `cobranca_assinaturas` (migration 0583) NÃO entra nesta lista, pelo mesmo
  // motivo de `webhook_lead_captures`: a leitura é só do `admin` e o usuário
  // semeado aqui é `agent`, então o controle positivo falharia por ACERTO. A
  // prova vive em `tests/invariants/cobranca-isolamento.test.ts`.
  // ⚠️ `config_proposals` (migration 0690) também NÃO entra, pelo mesmo motivo: o
  // payload da proposta pode carregar prompt, texto de conhecimento e memória, então
  // a leitura é só do `admin` (diferente do chat, que é `viewer`+) e o `agent`
  // semeado aqui leria ZERO. A prova vive no `describe` dedicado mais abaixo
  // ("config_proposals (migration 0690)"), neste mesmo arquivo, e a tabela está
  // declarada em PROVA_PROPRIA de rls-completude-varredura.test.ts.
] as const;

describe("RLS tenant isolation (fn_user_org_ids pattern)", () => {
  for (const table of TABLES) {
    it(`user of org A reads 0 rows of org B in ${table}`, () => {
      const crossTenant = countAs(
        USER_A,
        `select count(*) from public.${table} where organization_id = '${ORG_B}';`,
      );
      expect(crossTenant).toBe(0);
    });

    it(`user of org A still reads their own org rows in ${table} (positive control)`, () => {
      const ownRows = countAs(
        USER_A,
        `select count(*) from public.${table} where organization_id = '${ORG_A}';`,
      );
      expect(ownRows).toBeGreaterThanOrEqual(1);
    });
  }

  it("ai_reply_drafts: org B lê sua sugestão e não lê a de A (direção inversa)", () => {
    expect(countAs(USER_B,
      `select count(*) from public.ai_reply_drafts where organization_id = '${ORG_B}';`,
    )).toBeGreaterThanOrEqual(1);
    expect(countAs(USER_B,
      `select count(*) from public.ai_reply_drafts where organization_id = '${ORG_A}';`,
    )).toBe(0);
  });

  it("ai_reply_drafts: os dois tenants têm linhas antes de testar as cercas", () => {
    expect(Number(sql(
      `select count(distinct organization_id) from public.ai_reply_drafts where organization_id in ('${ORG_A}','${ORG_B}');`,
    ))).toBe(2);
  });

  // O histórico do assistente é do DONO: a resposta carrega números de métricas com papel
  // mínimo, e a trava de papel só vale na hora da consulta. Duas conversas existem em cada
  // organização (a do usuário semeado e a de outra pessoa da MESMA organização); o usuário lê
  // só a sua, e as mensagens seguem a conversa.
  it("config_threads/config_messages: dentro da MESMA organização só o dono lê a conversa", () => {
    for (const [user, org] of [[USER_A, ORG_A], [USER_B, ORG_B]] as const) {
      expect(Number(sql(
        `select count(*) from public.config_threads where organization_id = '${org}';`,
      ))).toBe(2);
      expect(countAs(user,
        `select count(*) from public.config_threads where organization_id = '${org}';`,
      )).toBe(1);
      expect(Number(sql(
        `select count(*) from public.config_messages where organization_id = '${org}';`,
      ))).toBe(2);
      expect(countAs(user,
        `select count(*) from public.config_messages where organization_id = '${org}';`,
      )).toBe(1);
      expect(countAs(user,
        `select count(*) from public.config_messages where organization_id = '${org}' and author_kind = 'ai';`,
      )).toBe(0);
    }
  });

  it("superuser sees both orgs (seed sanity: cross-tenant rows really exist)", () => {
    const total = Number(
      sql(
        `select count(distinct organization_id) from public.contacts where organization_id in ('${ORG_A}','${ORG_B}');`,
      ),
    );
    expect(total).toBe(2);
  });
});

/**
 * config_proposals (migration 0690) — as propostas de configuração do assistente.
 *
 * Fora de `TABLES` de propósito (ver o comentário no fim dela): a leitura é só do
 * `admin`, e o usuário semeado lá é `agent`. Aqui há dois tenants com um usuário de
 * cada papel em A (admin, manager, agent, viewer) e um admin em B.
 *
 * Três coisas são medidas: o isolamento e o gate de papel (leitura e inserção),
 * o privilégio (a sessão NUNCA atualiza nem apaga — aprovar e aplicar são do
 * servidor) e o gatilho de transição ("aplicar exige aprovada", conteúdo imutável).
 */
describe("config_proposals (migration 0690)", () => {
  const P = "c0690000-0000-4000-8000";
  const u = (n: number) => `${P}-${String(n).padStart(12, "0")}`;
  const ADMIN_A = u(11);
  const MANAGER_A = u(12);
  const VIEWER_A = u(13);
  const ADMIN_B = u(14);
  // O `agent` de A é o USER_A semeado no topo do arquivo.
  const PROP_A = u(101); // semeada, pendente, org A
  const PROP_B = u(102); // semeada, pendente, org B
  const PROP_INSERIDA = u(103); // inserida pela SESSÃO do admin de A
  const PROP_T1 = u(111); // pendente -> aplicada (recusada)
  const PROP_T2 = u(112); // pendente -> aprovada -> aplicada (passa); depois aplicada -> pendente (recusada)
  const PROP_T3 = u(113); // mudar o payload (recusado)
  const PROP_T4 = u(114); // aprovada -> rejeitada (recusada)
  const PROP_T5 = u(115); // aprovada -> aplicada trocando decided_by (recusada)

  /** stderr do psql com SQLSTATE (VERBOSITY verbose), ou "" se o script passou. */
  function erroDe(script: string): string {
    try {
      sql(`\\set VERBOSITY verbose\n${script}`);
      return "";
    } catch (err) {
      return String((err as { stderr?: string }).stderr ?? err);
    }
  }

  function comoUsuario(user: string, comando: string): string {
    return `set role authenticated;
select set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', false);
${comando};`;
  }

  function comoServidor(comando: string): string {
    return `set role service_role;
${comando};`;
  }

  /** Semente pelo dono do banco (ignora RLS), idempotente. */
  function semear(id: string, org: string, pedidoPor: string): string {
    return `insert into public.config_proposals
        (id, organization_id, kind, risk, resumo, motivo, payload, requested_by)
      values ('${id}', '${org}', 'memoria', 'seguro', 'Resumo de teste', 'Motivo de teste',
              '{"texto":"original"}'::jsonb, '${pedidoPor}')
      on conflict (id) do nothing;`;
  }

  /** Insert pela SESSÃO, sem RETURNING (RETURNING exigiria também a policy de leitura). */
  function inserirComoSessao(id: string, org: string, pedidoPor: string): string {
    return `insert into public.config_proposals
        (id, organization_id, kind, risk, resumo, motivo, payload, requested_by)
      values ('${id}', '${org}', 'memoria', 'seguro', 'Resumo de teste', 'Motivo de teste',
              '{"texto":"x"}'::jsonb, '${pedidoPor}')`;
  }

  function estado(id: string): string {
    return sql(`select status from public.config_proposals where id = '${id}';`);
  }

  beforeAll(() => {
    sql(`
      insert into auth.users (id, email) values
        ('${ADMIN_A}', 'prop-admin-a@invariant.test'),
        ('${MANAGER_A}', 'prop-manager-a@invariant.test'),
        ('${VIEWER_A}', 'prop-viewer-a@invariant.test'),
        ('${ADMIN_B}', 'prop-admin-b@invariant.test')
      on conflict (id) do nothing;
      insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
        ('${ADMIN_A}', '${ORG_A}', 'admin', now()),
        ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
        ('${VIEWER_A}', '${ORG_A}', 'viewer', now()),
        ('${ADMIN_B}', '${ORG_B}', 'admin', now())
      on conflict do nothing;
      ${semear(PROP_A, ORG_A, ADMIN_A)}
      ${semear(PROP_B, ORG_B, ADMIN_B)}
      ${semear(PROP_T1, ORG_A, ADMIN_A)}
      ${semear(PROP_T2, ORG_A, ADMIN_A)}
      ${semear(PROP_T3, ORG_A, ADMIN_A)}
      ${semear(PROP_T4, ORG_A, ADMIN_A)}
      ${semear(PROP_T5, ORG_A, ADMIN_A)}
    `);
  });

  it("controle: as duas organizações têm proposta semeada", () => {
    expect(Number(sql(
      `select count(distinct organization_id) from public.config_proposals where organization_id in ('${ORG_A}','${ORG_B}');`,
    ))).toBe(2);
  });

  // (i) + (iii)
  it("o admin de A lê só as propostas de A e zero as de B", () => {
    const todasDeA = Number(sql(`select count(*) from public.config_proposals where organization_id = '${ORG_A}';`));
    expect(todasDeA).toBeGreaterThanOrEqual(5);
    expect(countAs(ADMIN_A, `select count(*) from public.config_proposals where organization_id = '${ORG_A}';`)).toBe(todasDeA);
    expect(countAs(ADMIN_A, `select count(*) from public.config_proposals where organization_id = '${ORG_B}';`)).toBe(0);
    // Sem filtro de organização: a RLS sozinha limita ao que é de A.
    expect(countAs(ADMIN_A, `select count(*) from public.config_proposals;`)).toBe(todasDeA);
  });

  it("o admin de B lê a de B e zero as de A (direção inversa)", () => {
    expect(countAs(ADMIN_B, `select count(*) from public.config_proposals where organization_id = '${ORG_B}';`)).toBeGreaterThanOrEqual(1);
    expect(countAs(ADMIN_B, `select count(*) from public.config_proposals where organization_id = '${ORG_A}';`)).toBe(0);
  });

  // (ii)
  it("manager, agent e viewer de A não leem nenhuma proposta, nem as da própria organização", () => {
    for (const user of [MANAGER_A, USER_A, VIEWER_A]) {
      expect(countAs(user, `select count(*) from public.config_proposals where organization_id = '${ORG_A}';`), user).toBe(0);
      expect(countAs(user, `select count(*) from public.config_proposals;`), user).toBe(0);
    }
  });

  // (iv)
  it("o admin de A insere proposta pendente da própria organização, assinando como ele mesmo", () => {
    expect(erroDe(comoUsuario(ADMIN_A, inserirComoSessao(PROP_INSERIDA, ORG_A, ADMIN_A)))).toBe("");
    expect(estado(PROP_INSERIDA)).toBe("pendente");
  });

  it("o admin de A NÃO insere para a organização B", () => {
    const e = erroDe(comoUsuario(ADMIN_A, inserirComoSessao(u(121), ORG_B, ADMIN_A)));
    expect(e).toContain("42501");
    expect(e).toContain("row-level security");
    expect(Number(sql(`select count(*) from public.config_proposals where id = '${u(121)}';`))).toBe(0);
  });

  it("o admin de A NÃO insere já aprovada (nem com os carimbos coerentes)", () => {
    const e = erroDe(comoUsuario(ADMIN_A, `insert into public.config_proposals
        (id, organization_id, kind, risk, resumo, motivo, payload, requested_by, status, decided_by, decided_at)
      values ('${u(122)}', '${ORG_A}', 'memoria', 'seguro', 'Resumo de teste', 'Motivo de teste',
              '{"texto":"x"}'::jsonb, '${ADMIN_A}', 'aprovada', '${ADMIN_A}', now())`));
    expect(e).toContain("42501");
    expect(e).toContain("row-level security");
    expect(Number(sql(`select count(*) from public.config_proposals where id = '${u(122)}';`))).toBe(0);
  });

  it("o admin de A NÃO insere assinando como outra pessoa (requested_by alheio)", () => {
    const e = erroDe(comoUsuario(ADMIN_A, inserirComoSessao(u(123), ORG_A, ADMIN_B)));
    expect(e).toContain("42501");
    expect(e).toContain("row-level security");
    expect(Number(sql(`select count(*) from public.config_proposals where id = '${u(123)}';`))).toBe(0);
  });

  it("manager, agent e viewer de A NÃO inserem proposta (o papel mínimo é admin)", () => {
    let n = 130;
    for (const user of [MANAGER_A, USER_A, VIEWER_A]) {
      const id = u(n++);
      const e = erroDe(comoUsuario(user, inserirComoSessao(id, ORG_A, user)));
      expect(e, user).toContain("42501");
      expect(Number(sql(`select count(*) from public.config_proposals where id = '${id}';`)), user).toBe(0);
    }
  });

  // (v)
  it("authenticated NÃO atualiza nem apaga (privilégio revogado, nem o admin da própria proposta)", () => {
    for (const comando of [
      `update public.config_proposals set status = 'aprovada', decided_by = '${ADMIN_A}', decided_at = now() where id = '${PROP_A}'`,
      `delete from public.config_proposals where id = '${PROP_A}'`,
    ]) {
      const e = erroDe(comoUsuario(ADMIN_A, comando));
      expect(e, comando).toContain("42501");
      expect(e, comando).toContain("permission denied for table config_proposals");
    }
    expect(estado(PROP_A)).toBe("pendente");
  });

  it("anon não lê a tabela", () => {
    const e = erroDe(`set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select count(*) from public.config_proposals;`);
    expect(e).toContain("permission denied for table config_proposals");
  });

  // (vi)
  it("pendente -> aplicada é recusada pelo gatilho (23514), mesmo com todos os carimbos", () => {
    const e = erroDe(comoServidor(`update public.config_proposals
        set status = 'aplicada', decided_by = '${ADMIN_A}', decided_at = now(),
            applied_by = '${ADMIN_A}', applied_at = now(), apply_result = '{"tipo":"memoria"}'::jsonb
      where id = '${PROP_T1}'`));
    expect(e).toContain("23514");
    expect(e).toContain("pendente para aplicada");
    expect(estado(PROP_T1)).toBe("pendente");
  });

  it("pendente -> aprovada -> aplicada passa; depois aplicada -> pendente é recusada", () => {
    expect(erroDe(comoServidor(`update public.config_proposals
        set status = 'aprovada', decided_by = '${ADMIN_A}', decided_at = now()
      where id = '${PROP_T2}'`))).toBe("");
    expect(estado(PROP_T2)).toBe("aprovada");

    expect(erroDe(comoServidor(`update public.config_proposals
        set status = 'aplicada', applied_by = '${ADMIN_A}', applied_at = now(),
            apply_result = '{"tipo":"memoria","id":"x"}'::jsonb
      where id = '${PROP_T2}'`))).toBe("");
    expect(estado(PROP_T2)).toBe("aplicada");

    const volta = erroDe(comoServidor(`update public.config_proposals
        set status = 'pendente', decided_by = null, decided_at = null,
            applied_by = null, applied_at = null, apply_result = null
      where id = '${PROP_T2}'`));
    expect(volta).toContain("23514");
    expect(volta).toContain("aplicada para pendente");
    expect(estado(PROP_T2)).toBe("aplicada");
  });

  it("mudar o payload de uma proposta existente é recusado (aprovou A, não aplica B)", () => {
    const e = erroDe(comoServidor(`update public.config_proposals
        set payload = '{"texto":"outro"}'::jsonb
      where id = '${PROP_T3}'`));
    expect(e).toContain("23514");
    expect(sql(`select payload->>'texto' from public.config_proposals where id = '${PROP_T3}';`)).toBe("original");
  });

  it("aprovada -> rejeitada é recusada (a decisão não se desfaz)", () => {
    expect(erroDe(comoServidor(`update public.config_proposals
        set status = 'aprovada', decided_by = '${ADMIN_A}', decided_at = now()
      where id = '${PROP_T4}'`))).toBe("");
    const e = erroDe(comoServidor(`update public.config_proposals
        set status = 'rejeitada', decided_by = '${ADMIN_A}', decided_at = now()
      where id = '${PROP_T4}'`));
    expect(e).toContain("23514");
    expect(e).toContain("aprovada para rejeitada");
    expect(estado(PROP_T4)).toBe("aprovada");
  });

  it("o carimbo da decisão é imutável: aprovada -> aplicada trocando decided_by é recusada", () => {
    expect(erroDe(comoServidor(`update public.config_proposals
        set status = 'aprovada', decided_by = '${ADMIN_A}', decided_at = now()
      where id = '${PROP_T5}'`))).toBe("");
    const e = erroDe(comoServidor(`update public.config_proposals
        set status = 'aplicada', decided_by = '${ADMIN_B}', applied_by = '${ADMIN_A}',
            applied_at = now(), apply_result = '{"tipo":"memoria"}'::jsonb
      where id = '${PROP_T5}'`));
    expect(e).toContain("23514");
    expect(e).toContain("carimbo da decis");
    expect(estado(PROP_T5)).toBe("aprovada");
    expect(sql(`select decided_by from public.config_proposals where id = '${PROP_T5}';`)).toBe(ADMIN_A);
  });

  it("pendente é estrita: nasce sem decided_by, decision_reason nem applied_by", () => {
    for (const [n, coluna, valor] of [
      [161, "decided_by", `'${ADMIN_A}'`],
      [162, "decision_reason", `'motivo qualquer'`],
      [163, "applied_by", `'${ADMIN_A}'`],
    ] as const) {
      const e = erroDe(`insert into public.config_proposals
          (id, organization_id, kind, risk, resumo, motivo, payload, requested_by, ${coluna})
        values ('${u(n)}', '${ORG_A}', 'memoria', 'seguro', 'Resumo de teste', 'Motivo de teste',
                '{"x":1}'::jsonb, '${ADMIN_A}', ${valor});`);
      expect(e, coluna).toContain("23514");
      expect(e, coluna).toContain("config_proposals_estado_coerente");
      expect(Number(sql(`select count(*) from public.config_proposals where id = '${u(n)}';`)), coluna).toBe(0);
    }
  });

  it("a função do gatilho não é executável por anon nem por authenticated", () => {
    expect(sql(`select has_function_privilege('anon', 'public.fn_config_proposals_transicao()', 'execute');`)).toBe("f");
    expect(sql(`select has_function_privilege('authenticated', 'public.fn_config_proposals_transicao()', 'execute');`)).toBe("f");
    expect(sql(`select has_function_privilege('service_role', 'public.fn_config_proposals_transicao()', 'execute');`)).toBe("t");
  });

  it("reenvio do mesmo turno não duplica: único parcial (org, turno, tipo); sem turno, não há trava", () => {
    const turno = u(901);
    const base = (id: string, kind: string, turn: string) => `insert into public.config_proposals
        (id, organization_id, turn_id, kind, risk, resumo, motivo, payload, requested_by)
      values ('${id}', '${ORG_A}', ${turn}, '${kind}', 'seguro', 'Resumo de teste', 'Motivo de teste',
              '{"x":1}'::jsonb, '${ADMIN_A}')`;
    expect(erroDe(`${base(u(141), "memoria", `'${turno}'`)};`)).toBe("");
    const dobro = erroDe(`${base(u(142), "memoria", `'${turno}'`)};`);
    expect(dobro).toContain("23505");
    expect(dobro).toContain("config_proposals_turno_unico");
    // Outro tipo no mesmo turno é outra proposta; sem turn_id duas iguais convivem.
    expect(erroDe(`${base(u(143), "funil", `'${turno}'`)};`)).toBe("");
    expect(erroDe(`${base(u(144), "memoria", "null")};`)).toBe("");
    expect(erroDe(`${base(u(145), "memoria", "null")};`)).toBe("");
  });

  it("a coerência de estado é do banco: aplicada sem carimbo de aplicação não nasce", () => {
    const e = erroDe(`insert into public.config_proposals
        (id, organization_id, kind, risk, resumo, motivo, payload, requested_by, status, decided_by, decided_at)
      values ('${u(151)}', '${ORG_A}', 'memoria', 'seguro', 'Resumo de teste', 'Motivo de teste',
              '{"x":1}'::jsonb, '${ADMIN_A}', 'aplicada', '${ADMIN_A}', now());`);
    expect(e).toContain("23514");
    expect(e).toContain("config_proposals_estado_coerente");
  });
});

/**
 * config_snapshots (migration 0696) — o retrato da auditoria da empresa.
 *
 * Medidos aqui: o isolamento nas duas direções (com controle positivo), a escrita
 * pela sessão (só o admin da PRÓPRIA organização, assinando como ele mesmo), o
 * privilégio (authenticated nunca atualiza nem apaga; anon não lê) e o expurgo
 * (a função apaga o retrato velho, preserva o recente e só o service_role a executa).
 */
describe("config_snapshots (migration 0696)", () => {
  const P = "c0696000-0000-4000-8000";
  const u = (n: number) => `${P}-${String(n).padStart(12, "0")}`;
  const ADMIN_A = u(11);
  const MANAGER_A = u(12);
  const ADMIN_B = u(14);
  const SNAP_VELHO = u(201);
  const SNAP_RECENTE = u(202);
  const SNAP_INSERIDO = u(203);

  function erroDe(script: string): string {
    try {
      sql(`\\set VERBOSITY verbose\n${script}`);
      return "";
    } catch (err) {
      return String((err as { stderr?: string }).stderr ?? err);
    }
  }
  function comoUsuario(user: string, comando: string): string {
    return `set role authenticated;
select set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', false);
${comando};`;
  }
  function inserirComoSessao(id: string, org: string, tomadoPor: string): string {
    return `insert into public.config_snapshots (id, organization_id, taken_by, resultado, pendencias)
      values ('${id}', '${org}', '${tomadoPor}', '{"itens":[]}'::jsonb, 1)`;
  }

  beforeAll(() => {
    sql(`
      insert into auth.users (id, email) values
        ('${ADMIN_A}', 'snap-admin-a@invariant.test'),
        ('${MANAGER_A}', 'snap-manager-a@invariant.test'),
        ('${ADMIN_B}', 'snap-admin-b@invariant.test')
      on conflict (id) do nothing;
      insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
        ('${ADMIN_A}', '${ORG_A}', 'admin', now()),
        ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
        ('${ADMIN_B}', '${ORG_B}', 'admin', now())
      on conflict do nothing;
      insert into public.config_snapshots (id, organization_id, taken_at, resultado, pendencias) values
        ('${SNAP_VELHO}', '${ORG_A}', now() - interval '400 days', '{"itens":[]}'::jsonb, 4),
        ('${SNAP_RECENTE}', '${ORG_A}', now() - interval '1 day', '{"itens":[]}'::jsonb, 2)
      on conflict (id) do nothing;
    `);
  });

  it("controle: as duas organizações têm retrato", () => {
    expect(Number(sql(
      `select count(distinct organization_id) from public.config_snapshots where organization_id in ('${ORG_A}','${ORG_B}');`,
    ))).toBe(2);
  });

  it("B lê os próprios retratos e zero os de A; A lê os de A e zero os de B", () => {
    expect(countAs(ADMIN_B, `select count(*) from public.config_snapshots where organization_id = '${ORG_B}';`)).toBeGreaterThanOrEqual(1);
    expect(countAs(ADMIN_B, `select count(*) from public.config_snapshots where organization_id = '${ORG_A}';`)).toBe(0);
    expect(countAs(ADMIN_B, `select count(*) from public.config_snapshots;`)).toBe(
      countAs(ADMIN_B, `select count(*) from public.config_snapshots where organization_id = '${ORG_B}';`),
    );
    expect(countAs(ADMIN_A, `select count(*) from public.config_snapshots where organization_id = '${ORG_A}';`)).toBeGreaterThanOrEqual(3);
    expect(countAs(ADMIN_A, `select count(*) from public.config_snapshots where organization_id = '${ORG_B}';`)).toBe(0);
  });

  it("o admin de A insere retrato da própria organização, assinando como ele mesmo", () => {
    expect(erroDe(comoUsuario(ADMIN_A, inserirComoSessao(SNAP_INSERIDO, ORG_A, ADMIN_A)))).toBe("");
    expect(Number(sql(`select count(*) from public.config_snapshots where id = '${SNAP_INSERIDO}';`))).toBe(1);
  });

  it("o admin de A NÃO insere para a organização B nem assinando como outra pessoa", () => {
    for (const [n, org, quem] of [[211, ORG_B, ADMIN_A], [212, ORG_A, ADMIN_B]] as const) {
      const e = erroDe(comoUsuario(ADMIN_A, inserirComoSessao(u(n), org, quem)));
      expect(e, String(n)).toContain("42501");
      expect(Number(sql(`select count(*) from public.config_snapshots where id = '${u(n)}';`)), String(n)).toBe(0);
    }
  });

  it("manager e agent de A NÃO inserem retrato (o papel mínimo é admin)", () => {
    let n = 220;
    for (const user of [MANAGER_A, USER_A]) {
      const id = u(n++);
      const e = erroDe(comoUsuario(user, inserirComoSessao(id, ORG_A, user)));
      expect(e, user).toContain("42501");
      expect(Number(sql(`select count(*) from public.config_snapshots where id = '${id}';`)), user).toBe(0);
    }
  });

  it("authenticated NÃO atualiza nem apaga (nem o admin do próprio retrato)", () => {
    for (const comando of [
      `update public.config_snapshots set pendencias = 99 where id = '${SNAP_RECENTE}'`,
      `delete from public.config_snapshots where id = '${SNAP_RECENTE}'`,
    ]) {
      const e = erroDe(comoUsuario(ADMIN_A, comando));
      expect(e, comando).toContain("42501");
      expect(e, comando).toContain("permission denied for table config_snapshots");
    }
    expect(sql(`select pendencias from public.config_snapshots where id = '${SNAP_RECENTE}';`)).toBe("2");
  });

  it("anon não lê a tabela", () => {
    const e = erroDe(`set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select count(*) from public.config_snapshots;`);
    expect(e).toContain("permission denied for table config_snapshots");
  });

  it("o expurgo apaga o retrato além da retenção, preserva o recente, e só o service_role o executa", () => {
    expect(sql(`select has_function_privilege('anon', 'public.fn_expurgar_config_assistente_vencida(int,int)', 'execute');`)).toBe("f");
    expect(sql(`select has_function_privilege('authenticated', 'public.fn_expurgar_config_assistente_vencida(int,int)', 'execute');`)).toBe("f");
    expect(sql(`select has_function_privilege('service_role', 'public.fn_expurgar_config_assistente_vencida(int,int)', 'execute');`)).toBe("t");
    expect(Number(sql(`select count(*) from public.config_snapshots where id = '${SNAP_VELHO}';`))).toBe(1);
    sql(`set role service_role; select public.fn_expurgar_config_assistente_vencida(365, 1000);`);
    expect(Number(sql(`select count(*) from public.config_snapshots where id = '${SNAP_VELHO}';`))).toBe(0);
    expect(Number(sql(`select count(*) from public.config_snapshots where id = '${SNAP_RECENTE}';`))).toBe(1);
  });
});
