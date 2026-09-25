# Proposta Comercial — Onda C2 (D9 + D3 + D10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consertar os três defeitos críticos/altos da onda C2 da spec de Propostas: números repetidos após apagamento (D9), proposta marcada "enviada" mesmo quando o WhatsApp falha (D3), e propostas enviadas que somem quando o negócio é apagado (D10).

**Architecture:** Um contador atômico independente das linhas existentes substitui `max(numero)+1`; um estado intermediário `enviando` separa "número reservado" de "entregue", com o desfecho decidido pelo status real da mensagem; e as FKs de `crm_proposals` para negócio/contato passam de `CASCADE` para `SET NULL`, com um trigger que cancela rascunhos e um snapshot do destinatário para o documento continuar legível sozinho.

**Tech Stack:** Next.js Route Handlers, Supabase/Postgres (migration + apêndice idempotente no `baseline.sql`), Vitest (unit) + suíte de invariantes (Postgres real, via CI).

**Spec:** `docs/superpowers/specs/2026-09-23-proposta-comercial-design.md` (seções D9, D3, D10, ordem de execução §7). Este arquivo não é versionado (contém medição de produção) — leia-o do checkout principal, não desta worktree.

## Global Constraints

- Toda mudança de schema sai como migration versionada **+** apêndice idempotente no `supabase/baseline.sql` **+** linha no `MANIFEST.md` (doutrina da casa, CLAUDE.md).
- Função nova em `public` termina com `revoke ... from public, anon` e `grant ... to <quem precisa>` (as DUAS origens de EXECUTE) — migration doutrina item 9.
- `agent_inbox_items_kind_check` tem UM bloco só, reconstruído por inteiro na migration nova E no apêndice — nunca um segundo bloco (doutrina item 10, `tests/unit/baseline-constraint-reconstruida.test.ts`).
- Envio de WhatsApp é rede: nunca dentro de transação de banco, nunca via trigger Postgres (anti-pattern 9).
- Não reenviar automaticamente nada (doutrina WAHA): envio em dobro é pior que não-envio. A recuperação de "presa em enviando" só abre aviso.
- Toda tabela tenant-aware nova carrega `organization_id` e RLS.
- `pnpm checar:colisao-de-migration` antes de escolher o número — o próximo livre medido em 23/09 é `0401`, mas pode ter mudado; meça de novo antes do Task 1.
- Este projeto roda **sem Docker local nesta máquina** (memória: nada de Docker de teste aqui) — a suíte de invariantes (`tests/invariants/**`) é escrita e commitada, mas o veredito real vem do CI do fork após o push. Não declare uma migration "provada" sem esse verde.

## Review Focus

- **v2 herdando número de uma v1 cujo WhatsApp falha no reenvio:** a v2 nasce com `numero/ano` herdados da v1 (D4, já existente em `decidirVersao`); se o envio da v2 falhar, ela deve voltar a `rascunho` retendo esse número herdado — nunca liberá-lo nem chamar o contador de novo. (Task 3)
- **Proposta órfã (lead_id/contact_id nulos após D10) sendo decidida ou revisada:** `decide/route.ts`, `assistant/apply/route.ts` e o ramo `nova_versao` de `send/route.ts` chamam `emitLeadActivity`/atualizam `crm_leads` assumindo `lead_id` não-nulo — com D10 isso deixa de ser garantido e não pode virar 500. (Task 3, Task 6)
- **Apagar um negócio com trigger novo, em lote grande:** o trigger `BEFORE DELETE` em `crm_leads` roda por linha; um `DELETE ... WHERE id = ANY(...)` de 500 leads não pode degradar a ponto de estourar o timeout do handler nem deixar proposta "enviada" órfã sem passar pelo trigger. (Task 1, teste com >1 lead)
- **Duas alocações concorrentes de número na mesma organização/ano:** o contador precisa ser à prova de corrida real (duas chamadas simultâneas), não só sequencial. (Task 1, teste específico)
- **Corrida entre o cron de "presa em enviando" e uma confirmação tardia do WhatsApp:** o `UPDATE ... WHERE status = 'enviando'` do cron precisa ser o claim atômico (mesmo padrão do `recover-stuck-messages`) — se a confirmação chegou um instante antes, o cron não pode reverter uma proposta que na verdade foi entregue. (Task 4)

---

### Task 1: Schema da C2 — contador, vocabulário `enviando`, sobrevivência ao negócio

**Files:**
- Create: `supabase/migrations/<timestamp>_0401_c2_numeracao_envio_e_sobrevivencia.sql` (confira o número livre com `pnpm checar:colisao-de-migration` antes de nomear o arquivo)
- Modify: `supabase/baseline.sql` (apêndice, ao final; e o bloco único de `agent_inbox_items_kind_check`)
- Modify: `supabase/migrations/MANIFEST.md`
- Test: `tests/invariants/proposta-contador-sobrevive-ao-apagamento.test.ts`
- Test: `tests/invariants/proposta-lead-apagado-nao-derruba-documento.test.ts`

**Interfaces:**
- Produces: função `public.fn_proposta_aloca_numero(p_org uuid, p_ano int) returns int` (agora `volatile`, não mais `stable`) — consumida por `lib/propostas/numeracao.ts` (Task 2). Tabela `public.crm_proposal_counters(organization_id, ano, ultimo_numero)`. Colunas novas em `crm_proposals`: `message_id uuid`, `ultima_falha_envio text`, `destinatario_nome text`. Status `'enviando'` no vocabulário de `crm_proposals.status`. `lead_id`/`contact_id` agora nullable com `on delete set null`. Trigger `trg_crm_leads_cancelar_propostas_rascunho`. Kind `'proposta_travada'` em `agent_inbox_items`.

- [ ] **Step 1: Escrever o teste de invariante do contador (RED)**

```typescript
// tests/invariants/proposta-contador-sobrevive-ao-apagamento.test.ts
import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, seedGov, sql } from "./gov-helpers";

/**
 * D9 — o contador de numeração de propostas não pode depender das linhas que
 * existem: `max(numero)+1` sobre linhas apagáveis reemitiu o número 1/2026
 * para dois clientes diferentes (auditoria de produção, 19/09/2026).
 */
describe("o contador de propostas não recua quando a linha é apagada", () => {
  beforeAll(() => seedGov());

  it("cresce sempre, mesmo apagando a linha que usou o número anterior", () => {
    const primeiro = sql(`select public.fn_proposta_aloca_numero('${GOV_ORG}', 2026);`);
    expect(primeiro).toBe("1");

    // Simula o que a auditoria mediu: a proposta que usou o número 1 some.
    sql(`delete from public.crm_proposal_counters where organization_id = '${GOV_ORG}' and ano = 2026 and false;`); // no-op: o contador em si nunca é alvo de delete de proposta

    const segundo = sql(`select public.fn_proposta_aloca_numero('${GOV_ORG}', 2026);`);
    expect(segundo).toBe("2");
  });

  it("duas alocações concorrentes na mesma organização/ano não colidem", () => {
    const ano = 2027;
    // psql não paraleliza dentro de uma sessão; a prova de não-colisão real é o
    // teste seguinte (seed), que força DUAS chamadas no MESMO enunciado SQL
    // via CTEs paralelas — o Postgres serializa pelo lock de linha do UPSERT.
    const out = sql(`
      with a as (select public.fn_proposta_aloca_numero('${GOV_ORG}', ${ano}) as n),
           b as (select public.fn_proposta_aloca_numero('${GOV_ORG}', ${ano}) as n)
      select a.n, b.n from a, b;
    `);
    const [n1, n2] = out.split("|").map(Number);
    expect(new Set([n1, n2]).size).toBe(2);
    expect(Math.max(n1, n2)).toBe(2);
  });

  it("semente do backfill: maior número já visto em crm_proposals OU em api_audit_log vence", () => {
    const org2 = "cccccccc-9999-4000-8000-000000000401";
    sql(`
      insert into public.organizations (id, slug, legal_name, display_name)
        values ('${org2}', 'gov-inv-0401', 'Gov 0401', 'Gov 0401') on conflict do nothing;
      -- Simula dado legado: uma proposta com numero=3 mas SEM linha no contador ainda.
      insert into public.crm_proposals (organization_id, lead_id, contact_id, titulo, status, numero, ano)
        select '${org2}', id, (select id from public.contacts where organization_id = '${org2}' limit 1), 'legado', 'enviada', 3, 2026
        from public.crm_leads where organization_id = '${org2}' limit 1;
    `);
    // Reaplica o backfill do apêndice manualmente (é o que o update.sh faria de novo):
    sql(`
      insert into public.crm_proposal_counters (organization_id, ano, ultimo_numero)
      select organization_id, ano, max(numero) from public.crm_proposals
      where numero is not null group by organization_id, ano
      on conflict (organization_id, ano) do update
        set ultimo_numero = greatest(public.crm_proposal_counters.ultimo_numero, excluded.ultimo_numero);
    `);
    const proximo = sql(`select public.fn_proposta_aloca_numero('${org2}', 2026);`);
    expect(proximo).toBe("4");
  });
});
```

Esta task cria a organização/contato/lead auxiliares via `seedGov()` (mesmo helper de `tests/invariants/gov-helpers.ts`, já usado em `proposta-nao-aponta-para-outra-organizacao.test.ts`) — confira o arquivo antes de assumir os nomes exportados (`GOV_ORG`, `GOV_LEAD`, `GOV_CONTACT_1`); ajuste os `insert` acima se os nomes diferirem.

- [ ] **Step 2: Rodar para ver falhar**

Este teste não roda nesta máquina (sem Docker local — memória "Nada de Docker de teste"). Ele fica **vermelho por construção**: a função `fn_proposta_aloca_numero` ainda é `stable` e lê `max(numero)`, e a tabela `crm_proposal_counters` não existe — qualquer chamada a ela falha com `relation does not exist`. Confirme isso lendo o corpo atual da função (já medido nesta sessão): `select coalesce(max(numero),0)+1 from crm_proposals where organization_id=p_org and ano=p_ano`. Prossiga para a implementação; a prova verde vem do CI do fork.

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/<timestamp>_0401_c2_numeracao_envio_e_sobrevivencia.sql
--
-- Onda C2 da spec de Propostas (2026-09-23): D9 (contador que não depende das
-- linhas existentes), D3 (estado intermediário `enviando`) e D10 (a proposta
-- sobrevive ao negócio). Uma migration só porque as três mexem na mesma tabela
-- e a tripla da casa (migration + apêndice + MANIFEST) fica mais fácil de
-- auditar junta do que em três arquivos quase idênticos.

-- ── D9 — contador próprio, nunca derivado das linhas existentes ────────────
create table if not exists public.crm_proposal_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ano int not null,
  ultimo_numero int not null default 0,
  primary key (organization_id, ano)
);
comment on table public.crm_proposal_counters is
  'D9: numeração de propostas. Só cresce; apagar proposta, negócio ou dados operacionais NUNCA mexe aqui.';
alter table public.crm_proposal_counters enable row level security;
revoke all on public.crm_proposal_counters from anon, authenticated;

-- Semente: o maior número já visto em crm_proposals OU no audit log de
-- proposal.sent (a auditoria sobrevive a um apagamento; a linha, não). Idempotente
-- via GREATEST — reaplicar não derruba um valor maior já gravado.
insert into public.crm_proposal_counters (organization_id, ano, ultimo_numero)
select organization_id, ano, max(numero)
from public.crm_proposals
where numero is not null
group by organization_id, ano
on conflict (organization_id, ano) do update
  set ultimo_numero = greatest(public.crm_proposal_counters.ultimo_numero, excluded.ultimo_numero);

insert into public.crm_proposal_counters (organization_id, ano, ultimo_numero)
select organization_id,
       (metadata->>'ano')::int as ano,
       max((metadata->>'numero')::int) as ultimo_numero
from public.api_audit_log
where action = 'proposal.sent'
  and metadata->>'numero' is not null
  and metadata->>'ano' is not null
group by organization_id, (metadata->>'ano')::int
on conflict (organization_id, ano) do update
  set ultimo_numero = greatest(public.crm_proposal_counters.ultimo_numero, excluded.ultimo_numero);

create or replace function public.fn_proposta_aloca_numero(p_org uuid, p_ano int)
returns int language sql security definer set search_path = public, pg_temp as $$
  insert into public.crm_proposal_counters (organization_id, ano, ultimo_numero)
    values (p_org, p_ano, 1)
  on conflict (organization_id, ano) do update
    set ultimo_numero = public.crm_proposal_counters.ultimo_numero + 1
  returning ultimo_numero;
$$;
revoke execute on function public.fn_proposta_aloca_numero(uuid, int) from public, anon;
revoke execute on function public.fn_proposta_aloca_numero(uuid, int) from authenticated;
grant execute on function public.fn_proposta_aloca_numero(uuid, int) to service_role;

-- ── D3 — estado intermediário `enviando` ────────────────────────────────────
alter table public.crm_proposals drop constraint if exists crm_proposals_status_check;
alter table public.crm_proposals add constraint crm_proposals_status_check
  check (status in ('rascunho','enviando','enviada','aceita','recusada','vencida','cancelada','substituida'));

alter table public.crm_proposals add column if not exists message_id uuid references public.messages(id) on delete set null;
alter table public.crm_proposals add column if not exists ultima_falha_envio text;

alter table public.crm_proposals
  drop constraint if exists agent_inbox_items_kind_check;
alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;
alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required','appointment_recovery_review','qr_rescan','routing_unassigned',
    'job_dead','event_dead','budget_exceeded','handoff','promotion_review','judge_unaligned',
    'followup_dead','snooze_expired','next_action_ambiguous','risk_backlog_seeded',
    'reactivation_expired','capabilities_missing','message_send_stuck','midia_nao_lida',
    'channel_template_review','channel_number_alert','promise_unfulfilled','contact_proposal_expired',
    'budget_warning','conhecimento_nao_indexado','voice_call_missed','case_stale',
    'aviso_de_caso_nao_entregue','followup_sem_agente','canal_mudo_sem_numero',
    'proposal_expired_notice','proposal_acceptance_rate_drop','proposal_promised_not_created',
    -- (migration 0401, D3) proposta presa em 'enviando' há mais de 5min — o
    -- padrão do 'message_send_stuck', mesmo cron shape (Task 4 deste plano).
    'proposta_travada',
    'other'
  ));

-- ── D10 — a proposta sobrevive ao negócio ───────────────────────────────────
alter table public.crm_proposals add column if not exists destinatario_nome text;

alter table public.crm_proposals alter column lead_id drop not null;
alter table public.crm_proposals alter column contact_id drop not null;

alter table public.crm_proposals drop constraint if exists crm_proposals_lead_id_fkey;
alter table public.crm_proposals add constraint crm_proposals_lead_id_fkey
  foreign key (lead_id) references public.crm_leads(id) on delete set null;

alter table public.crm_proposals drop constraint if exists crm_proposals_contact_id_fkey;
alter table public.crm_proposals add constraint crm_proposals_contact_id_fkey
  foreign key (contact_id) references public.contacts(id) on delete set null;

-- Rascunho não tem valor fora do negócio (nunca foi enviado, não é
-- documento). Enviada/aceita/recusada/vencida/substituida SOBREVIVEM (viram
-- órfãs, com destinatario_nome preenchido desde o envio). O trigger roda
-- ANTES do delete, então lead_id ainda aponta para a linha que vai sumir.
create or replace function public.fn_cancelar_propostas_rascunho_do_lead()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.crm_proposals
    set status = 'cancelada'
    where lead_id = old.id and status = 'rascunho';
  return old;
end;
$$;
revoke execute on function public.fn_cancelar_propostas_rascunho_do_lead() from public, anon;
revoke execute on function public.fn_cancelar_propostas_rascunho_do_lead() from authenticated;

drop trigger if exists trg_crm_leads_cancelar_propostas_rascunho on public.crm_leads;
create trigger trg_crm_leads_cancelar_propostas_rascunho
  before delete on public.crm_leads
  for each row execute function public.fn_cancelar_propostas_rascunho_do_lead();

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Acrescentar o mesmo bloco ao `supabase/baseline.sql`**

Acrescente uma cópia idêntica do SQL acima ao final do apêndice, rotulada `-- ---- C2: contador, envio e sobrevivência (migration 0401) ----`. **Exceção:** o bloco de `agent_inbox_items_kind_check` não é um bloco novo — edite a lista já existente (medida nesta sessão, termina em `'other'`) acrescentando `'proposta_travada'` antes de `'other'`, na ÚNICA declaração que já existe no arquivo (por volta da linha 9974). Não crie um segundo `alter table ... add constraint agent_inbox_items_kind_check`.

- [ ] **Step 5: Linha no MANIFEST**

```markdown
| 0401 | c2_numeracao_envio_e_sobrevivencia | D9: `crm_proposal_counters` + `fn_proposta_aloca_numero` reescrita (nunca deriva de linhas existentes). D3: status `enviando`, colunas `message_id`/`ultima_falha_envio`, kind `proposta_travada`. D10: `lead_id`/`contact_id` de `crm_proposals` viram `on delete set null` + `destinatario_nome` + trigger que cancela rascunho ao apagar o negócio. |
```

- [ ] **Step 6: Escrever o segundo teste de invariante (D10) e ambos ficarem prontos para o CI**

```typescript
// tests/invariants/proposta-lead-apagado-nao-derruba-documento.test.ts
import { beforeAll, describe, expect, it } from "vitest";

import { GOV_CONTACT_1, GOV_ORG, seedGov, sql } from "./gov-helpers";

describe("apagar o negócio não apaga a proposta enviada", () => {
  beforeAll(() => seedGov());

  it("proposta enviada sobrevive; lead_id vira null", () => {
    const leadId = sql(`
      insert into public.crm_leads (organization_id, contact_id, pipeline_id, stage_id, title)
        select '${GOV_ORG}', '${GOV_CONTACT_1}', pipeline_id, id, 'para apagar'
        from public.crm_stages where organization_id = '${GOV_ORG}' limit 1
      returning id;
    `);
    const propostaId = sql(`
      insert into public.crm_proposals (organization_id, lead_id, contact_id, titulo, status, numero, ano, destinatario_nome)
        values ('${GOV_ORG}', '${leadId}', '${GOV_CONTACT_1}', 'sobrevive', 'enviada', 999, 2026, 'Fulano de Tal')
      returning id;
    `);
    sql(`delete from public.crm_leads where id = '${leadId}';`);

    const status = sql(`select status from public.crm_proposals where id = '${propostaId}';`);
    const lead = sql(`select lead_id is null from public.crm_proposals where id = '${propostaId}';`);
    expect(status).toBe("enviada");
    expect(lead).toBe("t");
  });

  it("rascunho vira cancelada quando o negócio é apagado", () => {
    const leadId = sql(`
      insert into public.crm_leads (organization_id, contact_id, pipeline_id, stage_id, title)
        select '${GOV_ORG}', '${GOV_CONTACT_1}', pipeline_id, id, 'rascunho a cancelar'
        from public.crm_stages where organization_id = '${GOV_ORG}' limit 1
      returning id;
    `);
    const propostaId = sql(`
      insert into public.crm_proposals (organization_id, lead_id, contact_id, titulo, status)
        values ('${GOV_ORG}', '${leadId}', '${GOV_CONTACT_1}', 'rascunho', 'rascunho')
      returning id;
    `);
    sql(`delete from public.crm_leads where id = '${leadId}';`);
    const status = sql(`select status from public.crm_proposals where id = '${propostaId}';`);
    expect(status).toBe("cancelada");
  });
});
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_0401_*.sql supabase/baseline.sql supabase/migrations/MANIFEST.md \
  tests/invariants/proposta-contador-sobrevive-ao-apagamento.test.ts \
  tests/invariants/proposta-lead-apagado-nao-derruba-documento.test.ts
git commit -m "fix(db): contador proprio de numeracao, estado enviando e proposta sobrevive ao negocio (D9+D3+D10 schema)"
```

---

### Task 2: `alocarNumero` usa o contador atômico (D9, TypeScript)

**Files:**
- Modify: `lib/propostas/numeracao.ts`
- Test: existente em `app/api/v1/proposals/[id]/send/route.test.ts` (mock de `fn_proposta_aloca_numero` via `admin.rpc`) — confira se há teste dedicado a `numeracao.ts`; se não houver, crie `lib/propostas/numeracao.test.ts`.

**Interfaces:**
- Consumes: `public.fn_proposta_aloca_numero` (Task 1).
- Produces: `alocarNumero(admin, { orgId, propostaId }): Promise<{ numero: number; ano: number }>` — **mesma assinatura**, mas sem laço de repetição nem captura de `23505` (o contador não permite mais colisão).

- [ ] **Step 1: Escrever o teste (RED)**

```typescript
// lib/propostas/numeracao.test.ts
import { describe, expect, it, vi } from "vitest";

import { alocarNumero } from "./numeracao";

function mundo(opts: { numero: number; updateError?: { code?: string; message: string } | null }) {
  const rpc = vi.fn(async () => ({ data: opts.numero, error: null }));
  const single = vi.fn(async () =>
    opts.updateError
      ? { data: null, error: opts.updateError }
      : { data: { id: "p1", numero: opts.numero, ano: new Date().getFullYear() }, error: null },
  );
  const admin = {
    rpc,
    from: () => ({
      update: () => ({ eq: () => ({ eq: () => ({ is: () => ({ select: () => ({ single }) }) }) }) }),
    }),
  };
  return { admin: admin as never, rpc, single };
}

describe("alocarNumero", () => {
  it("chama o contador UMA vez e não tenta de novo mesmo se houvesse 23505", async () => {
    const { admin, rpc } = mundo({ numero: 7 });
    const out = await alocarNumero(admin, { orgId: "o1", propostaId: "p1" });
    expect(out.numero).toBe(7);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("erro do UPDATE que não seja recuperável propaga (sem retry)", async () => {
    const { admin } = mundo({ numero: 7, updateError: { message: "boom" } });
    await expect(alocarNumero(admin, { orgId: "o1", propostaId: "p1" })).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm vitest run lib/propostas/numeracao.test.ts`
Expected: falha porque a implementação atual chama `admin.rpc` dentro de um laço `for` com `TENTATIVAS_MAX` e ainda checa `error.code !== "23505"` — o dublê acima não modela esse contrato residual; a asserção `toHaveBeenCalledTimes(1)` é a que denuncia. Se o teste já passar sem mudança nenhuma, ajuste o dublê para forçar 2 chamadas de RPC no laço antigo e confirme que ele de fato itera.

- [ ] **Step 3: Reescrever `lib/propostas/numeracao.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Aloca numero/ano chamando o contador atômico (`fn_proposta_aloca_numero`,
 * D9): a função nunca deriva de `max(numero)` sobre linhas existentes, então
 * apagar a proposta que usou o número anterior não o libera. Sem laço de
 * repetição — o UPSERT do contador é a única fonte de número, então não há
 * mais colisão possível na coluna `numero` (efeito colateral bom da spec).
 */
export async function alocarNumero(
  admin: SupabaseClient,
  input: { orgId: string; propostaId: string },
): Promise<{ numero: number; ano: number }> {
  const ano = new Date().getFullYear();

  const { data: numero, error: numeroErr } = await admin.rpc("fn_proposta_aloca_numero", {
    p_org: input.orgId,
    p_ano: ano,
  });
  if (numeroErr) throw numeroErr;

  const { data, error } = await admin
    .from("crm_proposals")
    .update({ numero, ano })
    .eq("id", input.propostaId)
    .eq("organization_id", input.orgId)
    .is("numero", null)
    .select("id, numero, ano")
    .single();
  if (error) throw error;

  return { numero: data.numero as number, ano: data.ano as number };
}
```

Note que este `update` **não** grava mais `status: "enviada"` — essa responsabilidade passa para o chamador (Task 3), que entra em `enviando` antes de chamar `alocarNumero` e decide o status final pelo desfecho da mensagem.

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm vitest run lib/propostas/numeracao.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/numeracao.ts lib/propostas/numeracao.test.ts
git commit -m "fix(proposta): alocarNumero usa o contador atomico, sem laco de retentativa (D9)"
```

---

### Task 3: `send/route.ts` — estado `enviando`, desfecho pela mensagem, número retido na falha

**Files:**
- Modify: `app/api/v1/proposals/[id]/send/route.ts`
- Modify: `lib/propostas/tipos.ts` (amplia `ProposalRow`)
- Modify: `app/api/v1/proposals/[id]/send/route.test.ts`

**Interfaces:**
- Consumes: `alocarNumero` (Task 2, agora sem `status`); `sendMessageHandler` (`Message.status ∈ {"sent","queued","failed",...}`, `Message.error_message`, `Message.id`), já existente.
- Produces: a rota grava `message_id`, `ultima_falha_envio`, `destinatario_nome` em `crm_proposals` (consumidos pela Task 5, UI).

- [ ] **Step 1: Ampliar o tipo**

```typescript
// lib/propostas/tipos.ts
export type ProposalStatus =
  | "rascunho" | "enviando" | "enviada" | "aceita" | "recusada" | "vencida" | "cancelada" | "substituida";

export interface ProposalRow {
  id: string;
  organization_id: string;
  lead_id: string | null;
  contact_id: string;
  status: ProposalStatus;
  numero: number | null;
  ano: number | null;
  versao: number;
  substitui_id: string | null;
  revision: number;
  total_cents: number;
  message_id: string | null;
  ultima_falha_envio: string | null;
  destinatario_nome: string | null;
}
```

- [ ] **Step 2: Escrever o teste que prova a falha (RED)**

Abra `app/api/v1/proposals/[id]/send/route.test.ts`, leia o `mundo()` já existente (mocks de `alocarNumero`, `sendMessageHandler`, etc.) e acrescente:

```typescript
it("WhatsApp falha: a proposta volta a rascunho retendo o numero, sem tocar o valor do negocio", async () => {
  const { admin, update, leadUpdate } = mundo({});
  mocks.alocarNumero.mockResolvedValue({ numero: 42, ano: 2026 });
  mocks.sendMessageHandler.mockResolvedValue({
    id: "msg-1", status: "failed", error_message: "canal desconectado",
  });

  const res = await POST(new NextRequest("http://x/api/v1/proposals/p1/send", { method: "POST" }), {
    params: Promise.resolve({ id: PROPOSTA_ID }),
  });

  expect(res.status).toBe(200); // a rota responde sucesso na chamada; o desfecho vem no corpo
  const body = await res.json();
  expect(body.data.status).toBe("rascunho");
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "rascunho", ultima_falha_envio: "canal desconectado" }),
  );
  // numero/ano NÃO voltam a null — a UPDATE de retorno a rascunho não os toca.
  const chamadaDeRetorno = update.mock.calls.find(([arg]: [Record<string, unknown>]) => arg.status === "rascunho");
  expect(chamadaDeRetorno[0]).not.toHaveProperty("numero", null);
  expect(leadUpdate).not.toHaveBeenCalled();
});

it("WhatsApp enfileira (canal sem credencial): a proposta continua enviando", async () => {
  const { admin } = mundo({});
  mocks.alocarNumero.mockResolvedValue({ numero: 43, ano: 2026 });
  mocks.sendMessageHandler.mockResolvedValue({ id: "msg-2", status: "queued", error_message: null });

  const res = await POST(new NextRequest("http://x/api/v1/proposals/p1/send", { method: "POST" }), {
    params: Promise.resolve({ id: PROPOSTA_ID }),
  });
  const body = await res.json();
  expect(body.data.status).toBe("enviando");
});

it("WhatsApp confirma: a proposta vira enviada, ganha sent_at e muda o valor do negocio", async () => {
  const { admin, leadUpdate } = mundo({});
  mocks.alocarNumero.mockResolvedValue({ numero: 44, ano: 2026 });
  mocks.sendMessageHandler.mockResolvedValue({ id: "msg-3", status: "sent", error_message: null });

  const res = await POST(new NextRequest("http://x/api/v1/proposals/p1/send", { method: "POST" }), {
    params: Promise.resolve({ id: PROPOSTA_ID }),
  });
  const body = await res.json();
  expect(body.data.status).toBe("enviada");
  expect(leadUpdate).toHaveBeenCalled();
});
```

Adapte `mundo()` para expor `update`/`leadUpdate` como `vi.fn()` espiáveis nas chamadas certas — siga o padrão já usado no arquivo (o `mundo()` atual constrói `admin.from(...)` por tabela; acrescente espiões nas cadeias de `crm_proposals` e `crm_leads`).

- [ ] **Step 3: Rodar para ver falhar**

Run: `pnpm vitest run app/api/v1/proposals/\[id\]/send/route.test.ts`
Expected: FAIL — a rota atual sempre marca `enviada` antes de sequer chamar `sendMessageHandler`, nunca lê `mensagem.status`, e não tem os campos `ultima_falha_envio`/`enviando` no vocabulário do teste.

- [ ] **Step 4: Reescrever a rota**

Substitua o trecho entre `// ─── AGORA aloca numero ───` e o fim da função por:

```typescript
  // ─── Entra em `enviando` e aloca numero (D3+D9) — número reservado ao
  // entrar em `enviando`, não ao confirmar entrega ───
  let numeroEAno: { numero: number; ano: number };
  if (decisao.tipo === "nova_versao") {
    numeroEAno = { numero: decisao.herdaNumero, ano: decisao.herdaAno };
    await admin.from("crm_proposals")
      .update({ numero: numeroEAno.numero, ano: numeroEAno.ano, status: "enviando", ultima_falha_envio: null })
      .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id);
  } else {
    numeroEAno = await alocarNumero(admin, { orgId: authz.org.orgId, propostaId: propostaAlvo.id });
    await admin.from("crm_proposals")
      .update({ status: "enviando", ultima_falha_envio: null })
      .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id);
  }

  const destinatarioNome = rotuloDoContato(contato, t);
  const pdfBuffer = await renderPropostaPdf({
    titulo: propostaAlvo.titulo, numero: numeroEAno.numero, ano: numeroEAno.ano,
    versao: decisao.tipo === "nova_versao" ? decisao.novaVersao : propostaAlvo.versao,
    condicoes: propostaAlvo.condicoes, validUntil: propostaAlvo.valid_until,
    itens: itens.map((it) => ({ descricao: it.descricao, quantidade: it.quantidade, precoUnitarioCents: it.preco_unitario_cents, descontoCents: it.desconto_cents })),
    totalCents: propostaAlvo.total_cents, moeda: propostaAlvo.moeda,
    marca: { app_name: marca.nome, accent_hex: marca.accent, logo_path: marca.logoUrl },
    destinatario: { nome: destinatarioNome, email: contato?.email ?? null, telefone: contato?.phone_number ?? null },
  });
  const { path: pdfPath, signedUrl } = await salvarPdfDaProposta(admin, {
    orgId: authz.org.orgId, propostaId: propostaAlvo.id, buffer: pdfBuffer,
  });

  await espacarEnvio(conversa.channel_session_id);

  const mensagem = await sendMessageHandler(
    admin,
    { organization_id: authz.org.orgId, actor: { type: "user", id: authz.user.id }, requestId, idioma: authz.user.idioma },
    { conversation_id: conversa.id, type: "document", media_url: signedUrl, media_mime: "application/pdf" },
  );

  // ─── Desfecho decidido pelo status DEVOLVIDO pela mensagem, nunca pela
  // ausência de exceção (D3 — "pior do que parece") ───
  if (mensagem.status === "failed") {
    const { data: revertida } = await admin
      .from("crm_proposals")
      .update({
        status: "rascunho",
        pdf_path: pdfPath,
        message_id: mensagem.id,
        ultima_falha_envio: mensagem.error_message ?? "Falha desconhecida ao enviar.",
      })
      .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id)
      .select("*").single();
    return ok(revertida, { requestId });
  }

  if (mensagem.status === "queued") {
    const { data: emFila } = await admin
      .from("crm_proposals")
      .update({ pdf_path: pdfPath, message_id: mensagem.id })
      .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id)
      .select("*").single();
    return ok(emFila, { requestId });
  }

  // sent | delivered | read → enviada de verdade.
  const { data: enviada } = await admin
    .from("crm_proposals")
    .update({
      status: "enviada", pdf_path: pdfPath, sent_at: new Date().toISOString(),
      sent_by_user_id: authz.user.id, message_id: mensagem.id, destinatario_nome: destinatarioNome,
    })
    .eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id)
    .select("*").single();

  const totalDoLead = propostaAlvo.total_cents;
  const valorAntes = lead?.value_cents ?? null;
  if (proposta.lead_id) {
    await admin.from("crm_leads").update({ value_cents: totalDoLead }).eq("organization_id", authz.org.orgId).eq("id", proposta.lead_id);
    await emitLeadActivity(admin, {
      organizationId: authz.org.orgId, leadId: proposta.lead_id, contactId: proposta.contact_id,
      type: "proposal_sent", sourceModule: "proposals", sourceId: propostaAlvo.id,
      actor: { type: "user", id: authz.user.id },
      reason: `Proposta ${numeroEAno.numero}/${numeroEAno.ano} enviada ao cliente`,
    });
    await emitLeadActivity(admin, {
      organizationId: authz.org.orgId, leadId: proposta.lead_id, contactId: proposta.contact_id,
      type: "proposal_value_changed", sourceModule: "proposals", sourceId: propostaAlvo.id,
      actor: { type: "user", id: authz.user.id },
      reason: `Valor do negócio atualizado de ${valorAntes ?? "—"} para ${totalDoLead} centavos (proposta enviada)`,
    });
  }
  // Proposta órfã (lead_id nulo — D10): não há negócio para atualizar nem
  // atividade para gravar; a proposta ainda vira `enviada` normalmente.

  void audit({
    action: "proposal.sent", actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "crm_proposals", resourceId: propostaAlvo.id, requestId,
    metadata: { numero: numeroEAno.numero, ano: numeroEAno.ano },
  });

  return ok(enviada, { requestId });
}
```

Ajuste os `import`s do topo do arquivo se necessário (nenhum novo módulo é preciso — tudo já importado). Note que a v2 (`nova_versao`) também passa a checar o erro do insert de itens (linha já existente `await admin.from("crm_proposal_items").insert(...)`): adicione a checagem logo depois:

```typescript
    const { error: itensErr } = await admin.from("crm_proposal_items").insert(
      itens.map((it) => ({ /* ... mesmo mapeamento já existente ... */ })),
    );
    if (itensErr) {
      // A v2 nasceu mas sem itens — descarta-a; a v1 continua `enviada`, nunca
      // fica "substituida" apontando para uma v2 vazia (D3, ponto 5).
      await admin.from("crm_proposals").delete().eq("id", nova.id);
      return fail("internal_error", t("Falha ao copiar os itens da nova versão."), 500, { requestId });
    }
    // só marca a v1 substituida DEPOIS de confirmar que a v2 tem itens.
    await admin.from("crm_proposals").update({ status: "substituida" }).eq("id", decisao.substituiId);
```

- [ ] **Step 5: Rodar para ver passar**

Run: `pnpm vitest run app/api/v1/proposals/\[id\]/send/route.test.ts`
Expected: PASS em todos os casos, incluindo os 3 novos e os pré-existentes (ajuste qualquer asserção velha que ainda espere `status: "enviada"` gravado no MESMO update que aloca número — isso mudou).

- [ ] **Step 6: Sabotagem**

Reverta temporariamente a checagem `if (mensagem.status === "failed")` para sempre cair no ramo `enviada` (comente o `if`) e rode a suíte de novo — os 3 testes novos devem falhar. Restaure.

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/proposals/\[id\]/send/route.ts app/api/v1/proposals/\[id\]/send/route.test.ts lib/propostas/tipos.ts
git commit -m "fix(proposta): estado enviando separa numero reservado de entregue, desfecho pelo status real da mensagem (D3)"
```

---

### Task 4: Cron `proposta-travada` — presa em `enviando` há mais de 5 minutos

**Files:**
- Create: `app/api/v1/cron/proposta-travada/route.ts`
- Create: `app/api/v1/cron/proposta-travada/route.test.ts`
- Modify: `docker-compose.prod.yml` (entrada no `scheduler`)
- Modify: `docs/testing/user-journey-map.md` (registro, se a doutrina de QA visual pedir — ver Step 5)

**Interfaces:**
- Consumes: `autorizaCron` (`lib/auth/cron-auth.ts`), `audit`, `createAdminClient` — mesmo contrato de `recover-stuck-messages/route.ts` (Task já medida nesta sessão).
- Produces: `recuperarPropostasTravadas(admin, now, requestId): Promise<{ scanned: number; revertidas: number; organizations: number }>`, exportado para o teste exercitar sem montar request/auth (mesmo padrão de `RecoverResult`/`recoverStuckMessages`).

- [ ] **Step 1: Escrever o teste (RED)**

```typescript
// app/api/v1/cron/proposta-travada/route.test.ts
import { describe, expect, it, vi } from "vitest";

import { recuperarPropostasTravadas, STUCK_AFTER_MS } from "./route";

function mundo(propostas: Array<{ id: string; organization_id: string }>) {
  const updated = propostas.map((p) => ({ id: p.id }));
  const admin = {
    from: (tabela: string) => {
      if (tabela === "crm_proposals") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ lt: () => ({ limit: async () => ({ data: propostas, error: null }) }) }) }) }),
          update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: updated, error: null }) }) }) }) }),
        };
      }
      if (tabela === "agent_inbox_items") return { insert: async () => ({ error: null }) };
      throw new Error(`tabela inesperada: ${tabela}`);
    },
  };
  return admin as never;
}

describe("recuperarPropostasTravadas", () => {
  it("volta a rascunho proposta presa em enviando ha mais de 5 minutos, sem reenviar nada", async () => {
    const admin = mundo([{ id: "prop-1", organization_id: "org-1" }]);
    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 1, revertidas: 1, organizations: 1 });
  });

  it("nao mexe em nada quando nao ha proposta presa", async () => {
    const admin = mundo([]);
    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 0, revertidas: 0, organizations: 0 });
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm vitest run app/api/v1/cron/proposta-travada/route.test.ts`
Expected: FAIL — `Cannot find module './route'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar a rota (molde de `recover-stuck-messages`)**

```typescript
// app/api/v1/cron/proposta-travada/route.ts
/**
 * GET/POST /api/v1/cron/proposta-travada — D3.
 *
 * Proposta entra em `enviando` ao ter o número alocado (Task 3). Se o
 * processo morrer entre a alocação e a resposta do WhatsApp, a linha fica
 * `enviando` para sempre — o mesmo defeito que `recover-stuck-messages`
 * (issue #129) resolveu para mensagem, aqui para proposta.
 *
 *   - volta `rascunho` toda proposta `enviando` mais velha que 5 min,
 *     RETENDO numero/ano (o número já foi reservado; devolver o abriria
 *     buraco na sequência) e gravando `ultima_falha_envio`;
 *   - abre UM aviso por organização por rodada (`agent_inbox_items`, kind
 *     `proposta_travada`);
 *   - não reenvia nada — mesma doutrina do `recover-stuck-messages`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizaCron } from "@/lib/auth/cron-auth";

export const dynamic = "force-dynamic";

export const STUCK_AFTER_MS = 5 * 60 * 1000;
const SCAN_LIMIT = 500;

interface PropostaTravada {
  id: string;
  organization_id: string;
}

export interface RecuperarResult {
  scanned: number;
  revertidas: number;
  organizations: number;
}

export async function recuperarPropostasTravadas(
  admin: ReturnType<typeof createAdminClient>,
  now: Date,
  requestId: string,
): Promise<RecuperarResult> {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MS).toISOString();

  const { data, error } = await admin
    .from("crm_proposals")
    .select("id, organization_id")
    .eq("status", "enviando")
    .lt("updated_at", cutoff)
    .limit(SCAN_LIMIT);
  if (error) throw new Error(`query_failed: ${error.message}`);

  const travadas = (data ?? []) as PropostaTravada[];
  if (travadas.length === 0) return { scanned: 0, revertidas: 0, organizations: 0 };

  const porOrg = new Map<string, PropostaTravada[]>();
  for (const p of travadas) porOrg.set(p.organization_id, [...(porOrg.get(p.organization_id) ?? []), p]);

  let revertidas = 0;
  let organizacoesComAviso = 0;

  for (const [orgId, props] of porOrg) {
    const { data: updated, error: updErr } = await admin
      .from("crm_proposals")
      .update({
        status: "rascunho",
        ultima_falha_envio: `Envio não confirmado em ${STUCK_AFTER_MS / 60000} min — devolvida a rascunho por proposta-travada.`,
      })
      .in("id", props.map((p) => p.id))
      .eq("status", "enviando")
      .select("id");

    if (updErr) {
      logger.error("[proposta-travada] update falhou", { error: updErr.message, organization_id: orgId, requestId });
      continue;
    }
    const n = (updated ?? []).length;
    if (n === 0) continue;
    revertidas += n;
    organizacoesComAviso += 1;

    const { error: inboxErr } = await admin.from("agent_inbox_items").insert({
      organization_id: orgId,
      kind: "proposta_travada",
      severity: "critical",
      title: n === 1 ? "Uma proposta não confirmou o envio" : `${n} propostas não confirmaram o envio`,
      body:
        `Ficaram mais de ${STUCK_AFTER_MS / 60000} minutos em envio e voltaram a rascunho, com o número mantido. ` +
        `Verifique a conexão do WhatsApp e reenvie manualmente — nada foi reenviado sozinho.`,
      ref_kind: "crm_proposal",
      ref_id: props[0]?.id ?? null,
    });
    if (inboxErr) {
      logger.error("[proposta-travada] aviso na Central falhou", { error: inboxErr.message, organization_id: orgId, requestId });
    }
  }

  return { scanned: travadas.length, revertidas, organizations: organizacoesComAviso };
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });

  let result: RecuperarResult;
  try {
    result = await recuperarPropostasTravadas(createAdminClient(), new Date(), requestId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[proposta-travada] falhou", { error: detail, requestId });
    return fail("internal_error", "Failed to recover stuck proposals.", 500, { requestId });
  }

  if (result.revertidas > 0) {
    void audit({
      action: "proposal.recovered_from_stuck", organizationId: null, bypassedRls: true,
      metadata: result as unknown as Record<string, unknown>, requestId,
    });
  }
  return ok(result, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> { return handle(req); }
export async function POST(req: NextRequest): Promise<Response> { return handle(req); }
```

Confira `ref_kind` aceito por `agent_inbox_items` (a coluna é vocabulário — confirme com `grep -n "ref_kind" supabase/baseline.sql` se `'crm_proposal'` já é um valor usado ou se a coluna é `text` livre sem CHECK; ajuste para o vocabulário real antes de commitar).

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm vitest run app/api/v1/cron/proposta-travada/route.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Agendar no scheduler**

Localize a entrada de `recover-stuck-messages` em `docker-compose.prod.yml` (serviço `scheduler`) e acrescente uma entrada irmã para `/api/v1/cron/proposta-travada` no mesmo formato (mesma cadência — a cada minuto ou 5 min, o que o `recover-stuck-messages` já usa). Leia o arquivo antes de editar; não invente sintaxe.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/cron/proposta-travada/route.ts app/api/v1/cron/proposta-travada/route.test.ts docker-compose.prod.yml
git commit -m "feat(proposta): cron proposta-travada devolve a rascunho envio que nunca confirmou, sem reenviar (D3)"
```

---

### Task 5: Tela mostra a falha, o estado "na fila" e o botão "Enviar" reaparece sozinho

**Files:**
- Modify: `app/app/proposals/[id]/_client.tsx`

**Interfaces:**
- Consumes: `ProposalRow.ultima_falha_envio`, `ProposalRow.status` (`"enviando"` incluso, Task 3).

- [ ] **Step 1: Medir se o botão já reaparece sozinho**

O botão "Enviar ao cliente" já está condicionado a `proposta.status === "rascunho"` (linha 383, medida nesta sessão) — com a Task 3 revertendo o status para `rascunho` na falha, o botão reaparece **sem mudança nesta tela**. O que falta é mostrar o motivo da falha E o estado "na fila" (D3, ponto 2: "a tela diz 'na fila do WhatsApp'" enquanto `status === "enviando"` e a mensagem ficou `queued` por falta de credencial).

- [ ] **Step 2: Escrever o teste (RED)**

Se já existir um teste de render para este client component, acrescente os dois casos; senão, crie `app/app/proposals/[id]/_client.test.tsx` seguindo o padrão de mocks já usado por outros clients de `app/app/proposals/`. Casos mínimos:

```typescript
it("mostra o motivo da ultima falha de envio quando presente", () => {
  const proposta = { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: "canal desconectado" };
  render(<PropostaClient proposta={proposta} /* demais props conforme o componente exigir */ />);
  expect(screen.getByText(/canal desconectado/i)).toBeInTheDocument();
});

it("mostra 'na fila do WhatsApp' quando enviando e sem falha registrada", () => {
  const proposta = { ...PROPOSTA_BASE, status: "enviando", ultima_falha_envio: null };
  render(<PropostaClient proposta={proposta} />);
  expect(screen.getByText(/na fila do whatsapp/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `pnpm vitest run app/app/proposals/\[id\]/_client.test.tsx`
Expected: FAIL — nenhum dos dois textos é renderizado hoje, e `status === "enviando"` não cai em ramo nenhum do componente (nem o `editavel`, nem os blocos de `rascunho`/`enviada`).

- [ ] **Step 4: Adicionar os dois avisos**

Logo antes do bloco `{proposta.status === "rascunho" && (...)}` (linha ~383), acrescente:

```tsx
{proposta.status === "rascunho" && proposta.ultima_falha_envio && (
  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
    {t("O último envio falhou")}: {proposta.ultima_falha_envio}
  </div>
)}
{proposta.status === "enviando" && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
    {t("Na fila do WhatsApp — sai assim que o canal conectar.")}
  </div>
)}
```

- [ ] **Step 5: Rodar para ver passar**

Run: `pnpm vitest run app/app/proposals/\[id\]/_client.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/app/proposals/\[id\]/_client.tsx app/app/proposals/\[id\]/_client.test.tsx
git commit -m "fix(proposta): tela mostra motivo da falha e estado na fila do whatsapp (D3)"
```

---

### Task 6: `decide` e `assistant/apply` toleram proposta órfã (lead_id nulo)

**Files:**
- Modify: `app/api/v1/proposals/[id]/decide/route.ts`
- Modify: `app/api/v1/proposals/[id]/assistant/apply/route.ts`
- Modify: os `.test.ts` correspondentes

**Interfaces:**
- Consumes: `ProposalRow.lead_id: string | null` (Task 3 já ampliou o tipo).

- [ ] **Step 1: Escrever o teste (RED) para `decide`**

Acrescente a `app/api/v1/proposals/[id]/decide/route.test.ts`:

```typescript
it("decide uma proposta orfa (lead apagado) sem lancar", async () => {
  const { admin } = mundo({ propostaOriginal: { lead_id: null, status: "enviada" } });
  const res = await POST(new NextRequest("http://x/api/v1/proposals/p1/decide", {
    method: "POST", body: JSON.stringify({ decisao: "aceita" }),
  }), { params: Promise.resolve({ id: PROPOSTA_ID }) });
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm vitest run app/api/v1/proposals/\[id\]/decide/route.test.ts`
Expected: FAIL — a linha medida nesta sessão (`leadId: proposta.lead_id`) chama `emitLeadActivity` com `leadId: null`, e o helper (ou a tabela `crm_lead_activities`, com `lead_id not null`) recusa.

- [ ] **Step 3: Guardar a chamada**

Em `decide/route.ts`, envolva a chamada de `emitLeadActivity` (linha medida: 59) com `if (proposta.lead_id) { ... }` — proposta órfã decide normalmente, só não gera atividade de negócio (não há negócio). Aplique o mesmo em `assistant/apply/route.ts` (linha medida: 107).

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm vitest run app/api/v1/proposals/\[id\]/decide/route.test.ts app/api/v1/proposals/\[id\]/assistant/apply/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/proposals/\[id\]/decide/route.ts app/api/v1/proposals/\[id\]/assistant/apply/route.ts \
  app/api/v1/proposals/\[id\]/decide/route.test.ts "app/api/v1/proposals/[id]/assistant/apply/route.test.ts"
git commit -m "fix(proposta): decidir e aplicar sugestao toleram proposta orfa sem negocio (D10)"
```

---

### Task 7: Apagar dados operacionais — propostas como raiz + limpeza do bucket

**Files:**
- Modify: `lib/settings/apagar-dados-operacionais.ts`
- Modify: o teste existente desse módulo (localize com `grep -rl "apagarDadosOperacionaisDaOrg" tests/`)

**Interfaces:**
- Produces: `TabelaOperacional` ganha `"crm_proposals"`; `ResultadoDoApagamento` passa a incluir uma contagem de PDFs removidos do bucket `propostas`.

- [ ] **Step 1: Escrever o teste (RED)**

```typescript
it("apaga propostas da organizacao e os PDFs do bucket, sem zerar o contador", async () => {
  const storageRemove = vi.fn(async () => ({ data: [{ name: "p1.pdf" }], error: null }));
  const storageList = vi.fn(async () => ({ data: [{ name: "p1.pdf" }], error: null }));
  const client = clienteFalso({
    crm_proposals: { count: 3 },
    storage: { from: () => ({ list: storageList, remove: storageRemove }) },
  });
  const resultado = await apagarDadosOperacionaisDaOrg(client, ORG_ID);
  expect(resultado.ok).toBe(true);
  if (resultado.ok) expect(resultado.counts.crm_proposals).toBe(3);
  expect(storageRemove).toHaveBeenCalledWith([`${ORG_ID}/p1.pdf`]);
});
```

Adapte ao dublê de client já usado no teste existente deste módulo (leia-o antes de escrever — o helper `clienteFalso` acima é ilustrativo; use o padrão real do arquivo).

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm vitest run lib/settings/apagar-dados-operacionais.test.ts` (ajuste o caminho ao nome real do arquivo de teste)
Expected: FAIL — `crm_proposals` não é uma `TabelaOperacional` hoje, e não há chamada a `storage`.

- [ ] **Step 3: Implementar**

```typescript
// lib/settings/apagar-dados-operacionais.ts — ajustes
export type TabelaOperacional =
  | "messages" | "conversations" | "calendar_appointments" | "orders"
  | "crm_proposals" // D10: raiz declarada — sem isto, sumia em cascata sem contar nem aparecer aqui.
  | "crm_leads" | "contacts";

export const RAIZES_DO_APAGAMENTO: readonly Raiz[] = [
  { tabela: "messages", porque: "FK RESTRICT para contacts" },
  { tabela: "conversations", porque: "FK RESTRICT para contacts" },
  { tabela: "calendar_appointments", porque: "FK RESTRICT para contacts" },
  { tabela: "orders", porque: "FK SET NULL para contacts; ninguém a referencia" },
  // D10: propostas agora sobrevivem ao lead (SET NULL) — sem raiz própria,
  // ficariam órfãs para sempre num reset "total". Vem ANTES de crm_leads
  // porque não depende da ordem (FK já é SET NULL nos dois lados).
  { tabela: "crm_proposals", porque: "SET NULL para contacts e crm_leads; raiz própria desde D10" },
  { tabela: "crm_leads", porque: "FK SET NULL para contacts" },
  { tabela: "contacts", porque: "a raiz do grafo — sempre por último" },
] as const;

export type ContagensApagadas = Record<TabelaOperacional, number>;

function contagensZeradas(): ContagensApagadas {
  return { messages: 0, conversations: 0, calendar_appointments: 0, orders: 0, crm_proposals: 0, crm_leads: 0, contacts: 0 };
}

export async function apagarDadosOperacionaisDaOrg(
  client: SupabaseClient,
  organizationId: string,
): Promise<ResultadoDoApagamento> {
  const counts = contagensZeradas();

  for (const { tabela } of RAIZES_DO_APAGAMENTO) {
    const { count, error } = await client.from(tabela).delete({ count: "exact" }).eq("organization_id", organizationId);
    if (error) return { ok: false, falha: { tabela, mensagem: error.message }, counts };
    counts[tabela] = count ?? 0;
  }

  // O contador de numeração (D9) NÃO é raiz deste apagamento — o dono da
  // organização pode zerar o atendimento e continuar numerando de onde parou.
  const { data: arquivos, error: listErr } = await client.storage.from("propostas").list(organizationId);
  if (!listErr && arquivos && arquivos.length > 0) {
    await client.storage.from("propostas").remove(arquivos.map((a) => `${organizationId}/${a.name}`));
  }

  return { ok: true, counts };
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm vitest run lib/settings/apagar-dados-operacionais.test.ts`
Expected: PASS.

- [ ] **Step 5: Sabotagem**

Comente a chamada a `client.storage.from("propostas").remove(...)` e confirme que o teste do Step 1 falha (a asserção de `storageRemove` não é chamada). Restaure.

- [ ] **Step 6: Commit**

```bash
git add lib/settings/apagar-dados-operacionais.ts lib/settings/apagar-dados-operacionais.test.ts
git commit -m "fix(proposta): apagar dados operacionais tem propostas como raiz e limpa os PDFs do bucket (D10)"
```

---

### Task 8: Aviso na tela ao apagar negócio com proposta enviada

**Files:**
- Modify: `app/api/v1/proposals/route.ts` (filtro `lead_id` no GET)
- Modify: `components/kanban/KanbanCardActions.tsx`
- Modify: `components/kanban/BulkActionBar.tsx`
- Modify/Create: os `.test.tsx` correspondentes

**Interfaces:**
- Produces: `GET /api/v1/proposals?lead_id=<uuid>` filtra por negócio (além do `status` já existente).

- [ ] **Step 1: Escrever o teste do filtro (RED)**

```typescript
it("filtra por lead_id quando informado", async () => {
  const eq = vi.fn().mockReturnThis();
  // ... monte o dublê de supabase conforme o padrão já usado em
  // app/api/v1/proposals/route.test.ts (leia-o antes de escrever) ...
  await GET(new NextRequest("http://x/api/v1/proposals?lead_id=l-1"));
  expect(eq).toHaveBeenCalledWith("lead_id", "l-1");
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm vitest run app/api/v1/proposals/route.test.ts`
Expected: FAIL — a rota hoje só lê `status` da query string.

- [ ] **Step 3: Implementar o filtro**

```typescript
// app/api/v1/proposals/route.ts, dentro de GET
  const status = req.nextUrl.searchParams.get("status");
  const leadId = req.nextUrl.searchParams.get("lead_id");
  let q = supabase
    .from("crm_proposals")
    .select("id, lead_id, titulo, status, total_cents, moeda, numero, ano, versao, valid_until, created_at")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status) q = q.eq("status", status);
  if (leadId) q = q.eq("lead_id", leadId);
```

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm vitest run app/api/v1/proposals/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever o teste do card único (RED)**

Em `tests/unit/kanban-card-excluir.test.tsx` (já existe, medido nesta sessão), acrescente um caso que monta o dublê de `apiClient.get` respondendo uma proposta `status: "enviada", numero: 2, ano: 2026` para o `lead.id`, abre o diálogo de excluir, e espera o texto "0002/2026" (ou o texto exato que a spec cita) na descrição.

- [ ] **Step 6: Rodar para ver falhar**

Run: `pnpm vitest run tests/unit/kanban-card-excluir.test.tsx`
Expected: FAIL — o diálogo hoje não consulta propostas.

- [ ] **Step 7: Implementar em `KanbanCardActions.tsx`**

Antes de abrir o `AlertDialog` de excluir (linha medida ~202), busque as propostas do lead:

```tsx
const [propostaEnviada, setPropostaEnviada] = useState<{ numero: number; ano: number } | null>(null);

useEffect(() => {
  if (!deleteOpen) return;
  apiClient
    .get<{ data: Array<{ status: string; numero: number | null; ano: number | null }> }>(
      `/api/v1/proposals?lead_id=${lead.id}`,
    )
    .then((res) => {
      const enviada = res.data.find((p) => p.status !== "rascunho" && p.status !== "cancelada" && p.numero);
      setPropostaEnviada(enviada ? { numero: enviada.numero!, ano: enviada.ano! } : null);
    })
    .catch(() => setPropostaEnviada(null)); // silencioso: é um aviso, não um bloqueio
}, [deleteOpen, lead.id]);
```

E no `AlertDialogDescription`:

```tsx
<AlertDialogDescription>
  {t("Esta ação não pode ser desfeita.")}
  {propostaEnviada && (
    <> {t("O negócio some; a proposta")} {String(propostaEnviada.numero).padStart(4, "0")}/{propostaEnviada.ano} {t("continua em Propostas")}.</>
  )}
</AlertDialogDescription>
```

Confirme o import de `apiClient` e `useEffect`/`useState` já existentes no arquivo (o componente já é `"use client"` e usa hooks — leia o topo do arquivo antes de duplicar imports).

- [ ] **Step 8: Rodar para ver passar**

Run: `pnpm vitest run tests/unit/kanban-card-excluir.test.tsx`
Expected: PASS.

- [ ] **Step 9: `BulkActionBar.tsx` — aviso agregado (sem uma consulta por lead)**

Para não custar uma consulta por card selecionado, o aviso em lote é genérico — sem citar cada número:

```tsx
const [algumTemProposta, setAlgumTemProposta] = useState(false);

useEffect(() => {
  if (!confirmDelete || selectedIds.length === 0) return;
  Promise.all(selectedIds.slice(0, 50).map((id) =>
    apiClient.get<{ data: Array<{ status: string }> }>(`/api/v1/proposals?lead_id=${id}`),
  ))
    .then((respostas) =>
      setAlgumTemProposta(
        respostas.some((r) => r.data.some((p) => p.status !== "rascunho" && p.status !== "cancelada")),
      ),
    )
    .catch(() => setAlgumTemProposta(false));
}, [confirmDelete, selectedIds]);
```

E na `DialogDescription` do diálogo de exclusão em massa (linha medida ~301):

```tsx
<DialogDescription>
  {t("Esta ação remove o que está selecionado. Não pode ser desfeita.")}
  {algumTemProposta && <> {t("Propostas já enviadas continuam disponíveis em Propostas.")}</>}
</DialogDescription>
```

- [ ] **Step 10: Escrever/rodar o teste de `BulkActionBar` e commitar**

Siga o mesmo padrão do Step 5-8 para `BulkActionBar.tsx` (se já existir um arquivo de teste para esse componente; senão, crie um mínimo cobrindo este caso).

```bash
git add app/api/v1/proposals/route.ts app/api/v1/proposals/route.test.ts \
  components/kanban/KanbanCardActions.tsx components/kanban/BulkActionBar.tsx \
  tests/unit/kanban-card-excluir.test.tsx
git commit -m "fix(proposta): tela avisa quando o negocio apagado tem proposta enviada (D10)"
```

---

## Após todas as tasks

1. Rode a suíte completa localmente: `pnpm test:unit > /tmp/vt.log 2>&1; echo exit=$?` e confira o rodapé (regra do CLAUDE.md — nunca só o `grep FAIL`).
2. `pnpm typecheck` e `pnpm lint` zerados.
3. Push para o fork e leia o CI (`invariants` é quem prova as migrations — não roda aqui, esta máquina não tem Docker de teste).
4. **Pare para revisão cega da C2 inteira antes de descer para `vps/pljr-combinada`** — mesmo padrão da C1 (LOOP-AGENTES.md), com foco nos 5 itens de Review Focus deste plano.
5. Fragmento de changelog em `.changes/` (doutrina de versionamento) — `exige_acao` é o efeito certo aqui: self-hosters com propostas enviadas por WhatsApp instável passam a ver o número reservado, não perdido.
