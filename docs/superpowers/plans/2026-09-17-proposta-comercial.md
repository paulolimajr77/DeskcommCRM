# Proposta comercial — plano de implementação em passada única

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA — use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans`. Os passos usam caixa (`- [ ]`) para marcação.
>
> **Por que não tem "Onda" nem "PR" quebrando o meio deste plano:** a spec (§12) desenha 8 ondas,
> cada uma normalmente virando ciclo próprio de red-test/gates/sabotagem/commit/PR. O dono decidiu
> — 2026-09-17 — trocar isso por UMA implementação contínua com gates leves a cada tarefa e a
> suíte completa **uma vez**, no fim, para cortar o custo de tempo/token de 8 ciclos. Isto **não**
> é a doutrina de "1 PR por onda" da própria spec (§15.1) sendo ignorada por acidente — é uma
> decisão explícita do dono, registrada aqui uma vez, sem repetir depois. O risco que a doutrina
> apontava (PR grande demora mais em review) persiste; quem decide isso é o dono, não o plano.

**Goal:** o CRM passa a emitir, revisar (à mão ou por instrução à IA), enviar, e fechar o ciclo de
uma **proposta comercial** — do rascunho ao aceite/recusa/vencimento — com número sequencial por
organização, versionamento, e os quatro sinais de laço de retorno que a spec exige (menos um,
explicitamente fora de escopo — ver Restrição G21).

**Architecture:** duas tabelas novas (`crm_proposals`, `crm_proposal_items`) sobre a infraestrutura
que já existe — catálogo, PDF, storage, WAHA, throttle, versão do agente, `NAV_CATALOG`. O
mecanismo genuinamente novo é o **assistente por instrução**: não há precedente de "IA devolve
lista de mudanças estruturadas" no repositório (medido — `ai_reply_drafts` sempre reescreve texto
livre), então esse pedaço é desenhado do zero: `runModelCall` (BYOK/orçamento/egress/auditoria já
resolvidos) com uma tool obrigatória, não `generateObject` solto — ver G24.

**Tech Stack:** TypeScript 6 estrito · Zod · Vercel AI SDK (`runModelCall` + tool-calling, camada
compartilhada do agent-engine) · Next.js 16 Route Handlers · Supabase/Postgres com RLS ·
`@react-pdf/renderer` · Vitest (unit + invariantes).

**Spec:** [`docs/superpowers/specs/2026-09-16-proposta-comercial-design.md`](../specs/2026-09-16-proposta-comercial-design.md)

---

## Global Constraints

| # | Restrição | Onde se comprova |
|---|---|---|
| G1 | **Multi-tenant:** toda query que cruza tabela tenant-aware filtra `organization_id` explicitamente. Cada organização é um cliente pagante — número sem filtro não é medição | `CLAUDE.md` › Multi-tenancy |
| G2 | **Migration sai como TRIPLA:** arquivo em `supabase/migrations/`, apêndice idempotente em `supabase/baseline.sql`, linha em `supabase/migrations/MANIFEST.md` | doutrina de Migrations do `CLAUDE.md` |
| G3 | **`NNNN` desatualiza SOZINHO enquanto a fila roda — meça de novo em CADA tarefa que cria migration, nunca confie num número escrito neste plano.** Medido na escrita do plano: próximo livre era `0279` nesta branch (`worktree feat/proposta-comercial`, nascida de `origin/main`); a Tarefa 0, ao executar, mediu de novo e achou `0274` como o maior real (duas migrations do upstream chegaram à branch entre a escrita do plano e o dispatch) — usou `0275`, e todo texto deste plano que ainda cita `0279`/`0280`/`0281` está desatualizado nesse sentido. Comando de medição, sempre antes de nomear o arquivo: `ls supabase/migrations/*.sql \| sed -E 's/.*_([0-9]{4})_.*/\1/' \| sort -n \| tail -1` | medido em 2026-09-17; corrigido durante a execução da Tarefa 0 (commit `5362dc8f`) |
| G4 | **`agent_inbox_items.kind` mexe em QUATRO lugares, não só a constraint:** (a) o CHECK no fim do apêndice do `baseline.sql`, reconstruído por bloco ÚNICO — nunca um segundo `add constraint`; (b) a migration mais recente que o reconstrói, com a lista **idêntica**; (c) a união `InboxKind` em `lib/agent-engine/db/repository.ts:28`; (d) os dois `Record<InboxKind, ...>` exaustivos — `POLITICAS_DE_AVISO` (`lib/ai/inbox-destino.ts`) e o mapa de títulos em `lib/ai/agent-inbox-copy.ts`. Faltar (c) ou (d) quebra o `tsc`, não um teste | `tests/unit/kind-check-migration-x-baseline.test.ts`; `satisfies Record<InboxKind, ...>` nos dois arquivos |
| G5 | **Valor novo em `agent_inbox_items.kind` entra perto do FIM da lista**, com comentário curto (não um bloco de 20 linhas) — `tests/unit/midia-nao-lida.test.ts` exige que um `kind` específico apareça nos primeiros 2000 caracteres a partir de `add constraint agent_inbox_items_kind_check`; um comentário longo empurra tudo pra fora da janela | `tests/unit/midia-nao-lida.test.ts:66-76,116-122` |
| G6 | **`crm_lead_activities.type` é vocabulário ABERTO, sem CHECK.** Tipo novo entra só como literal na união `ActivityType` + chave em `ACTIVITY_LABELS`, ambos em `lib/leads/activity-vocabulary.ts` — nunca string solta no emissor | `lib/leads/activity-vocabulary.ts:16-18` |
| G7 | **RLS de tabela nova segue o molde de `catalog_products`** (`baseline.sql:17086-17196`): policy `_select` com `fn_user_org_ids()`, policy `_write` com `fn_role_at_least(organization_id,'manager')` OU `'agent'` conforme o caso, `revoke all from anon`, `grant` explícito a `authenticated`/`service_role`, trigger `fn_set_updated_at()`. `tenant_isolation_*_all` como nome de policy está MORTO nesta base — não copiar | medido 2026-09-17, `catalog_products` |
| G8 | **Toda `security definer` nova revoga de `public` E `anon` e grante só a quem precisa** (duas origens distintas de EXECUTE — ver `CLAUDE.md` doutrina de Migrations, item 9) | `tests/invariants/hardening-definer-varredura.test.ts` |
| G9 | **Tela nova tem porta** em `lib/navigation/catalogo.ts` (`NAV_CATALOG`), grupo `crm`, seção nova "Fechar a venda" — mesmo padrão da entrada `/app/products` (seção "Preparar a venda") | `tests/unit/navegacao-completude.test.ts` |
| G10 | **A suíte é `pnpm test:unit` SEM caminho** (566 arquivos). Exit code é a autoridade | `CLAUDE.md` › Testes |
| G11 | **`pnpm test:db` NÃO roda nesta máquina** — Docker não sobe aqui. O veredito de RLS/isolamento vem do CI do fork | memória `nada-de-docker-de-teste-nesta-maquina` |
| G12 | **Nada roda localmente, nem `typecheck`/`lint`/`test:unit`** — tudo é gate do CI do fork (`NOSSA-REGRA.md`, seção "2026-09-17"). Editar, commitar, empurrar, checar veredito com `gh` | `NOSSA-REGRA.md` |
| G13 | **`.env`/`NOSSA-REGRA.md`/`FILA.md`/`NOSSA-INTEGRACAO.md` nunca são commitados nem anexados a ferramenta externa** | `NOSSA-REGRA.md` |
| G14 | **Sabotagem obrigatória** nos pontos de risco real desta feature: isolamento RLS, numeração concorrente, cálculo de total, gate de papel no envio, o assistente só muda o que foi pedido. Reverter só a linha do conserto, prever quantos casos caem, rodar, restaurar | doutrina do repo |
| G15 | **Fragmento em `.changes/`** com frontmatter `impacto`/`secao`/`titulo` (nunca número de versão) — formato medido em `.changes/a-chave-de-campos-do-funil-agora-entrega-a-ferramenta.md` | `docs/doctrine/versionamento.md` |
| G16 | **Envio de mensagem usa o campo `type`, não `kind`** — `crm_send_whatsapp_message`/`sendMessageSchema` (`lib/schemas/messaging.ts:70-119`) usam `type: "document"`. A spec original (§7) dizia `kind` — está errado, corrigido aqui | medido 2026-09-17 |
| G17 | **O PDF de LGPD (`lib/lgpd/pdf-renderer.tsx`) é deliberadamente SEM marca** — é documento jurídico, nomear o operador ali inverteria papéis. A proposta precisa de um **componente novo**, nunca estender aquele | medido 2026-09-17, cabeçalho do arquivo |
| G18 | **`token_budget`/`cost_budget_cents` vivem em `ai_agent_versions`, não em `ai_budgets`.** O guard por versão é `lib/agent-engine/edge/llm/orcamento.ts` (`decidirOrcamento`, puro) + `lib/agent-engine/edge/llm/run-model-call.ts` (`aplicarOrcamento`, I/O) — a spec original errou o local | medido 2026-09-17 |
| G19 | **Throttle anti-banimento é `espacarEnvio(sessionId)` (`lib/automation/throttle.ts`) + `adiarAteAJanelaAbrir` + `checkDailyLimit`** — não é uma fila via `event_log`. O envio da proposta chama os três antes de `sendMessageHandler`, exatamente como `lib/automation/actions/send-whatsapp.ts` já faz | medido 2026-09-17 |
| G20 | **Não existe mecanismo de "IA devolve diff estruturado" no código.** `ai_reply_drafts` sempre reescreve o texto inteiro. O assistente da proposta é desenho novo — schema de mudanças + função pura de aplicação — não uma extensão do padrão de `fn_reply_action` | medido 2026-09-17, ver Tarefa 9 |
| G24 | **A saída estruturada do assistente NÃO usa `generateObject` solto.** Medido: toda chamada de IA do produto passa por `runModelCall` (BYOK, orçamento via `LlmBudgetExceededError`, allowlist de egress anti-SSRF, auditoria em `llm_calls`), que só expõe `generateText`. O desenho correto é tool-calling forçado dentro de `runModelCall`, copiando o precedente de `app/api/v1/ai/routers/[id]/test/route.ts` (`getSkillsPool()` + `llmEdgeConfigFromEnv`) | medido 2026-09-17, ANTES de despachar a Tarefa 9, ver Tarefas 9/10 |
| G21 | **"Proposta prometida e não criada" (sinal 4 do laço de retorno, §9 da spec) ENTRA neste plano** — decisão do dono em 2026-09-17, revertendo a exclusão inicial. O pré-requisito que a spec assume pronto (promessa vira `crm_tasks` com dono e prazo) **não existia** — medido, `crm_tasks` não era referenciado em `lib/agent-engine/` nem `lib/ai/`, só a detecção e o aviso sem-dono (`promise_unfulfilled`) existiam. Este plano constrói o elo que faltava (Tarefa 1) como parte de si mesmo, **não** inventando o sinal: a PESSOA que resolve o aviso é quem declara "isto é uma promessa de proposta" e escolhe o prazo — a máquina não classifica o texto sozinha. Mesmo princípio de P6 do plano do funil ("a máquina não afirma fato; a pessoa sim") | decisão do dono, 2026-09-17 |
| G22 | **Onda 7 da spec (link público de aceite) não entra** — a própria spec já a adia ("depois, se houver demanda"). Este plano cobre só a Onda 1 do aceite: humano registra manualmente | spec §8 |
| G23 | **"Rascunho automático pela IA" é uma FERRAMENTA MCP nova (`crm_draft_proposal`), não um hook no meio do turno.** Decisão de design deste plano: mexer em `inbound-turn.ts` para disparar geração automática é a superfície de maior risco do agent-engine; o padrão de ferramenta injetada por chave (`handoffToolEnabled` → `crm_request_human_handoff`, medido em `lib/ai/runtime/tools.ts:257-264`, neste worktree/`origin/main`) já resolve "o agente pode rascunhar quando o cliente pede" sem cirurgia no pipeline de decisão. **Correção 2026-09-17:** o plano citava originalmente `leadFieldsEnabled` como precedente — essa chave só existe na branch `vps/pljr-combinada` (trabalho do plano do funil, ainda não chegou a `origin/main`, onde este worktree nasceu); medido pela Tarefa 1, que achou o mesmo tipo de ausência para `negocioDaConversa`. `handoffToolEnabled` é o precedente real, disponível aqui | corrigido em 2026-09-17, ver ledger da Tarefa 1 |

**Gates ao fim de cada tarefa** (executados pelo CI do fork — G12):

```bash
git add -A
git commit -m "..."
git push fork <branch>
gh run list --repo paulolimajr77/DeskcommCRM --branch <branch> --limit 3
# se falhar:
gh api repos/paulolimajr77/DeskcommCRM/actions/jobs/<job-id>/logs
```

---

## Estrutura de arquivos

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260917000000_0279_proposta_comercial.sql` | `crm_proposals`, `crm_proposal_items`, RLS, numeração, bucket `propostas`, 3 `kind` novos, `crm_tasks.source_kind` |
| `lib/propostas/tipos.ts` | Tipos TS do domínio (Proposal, ProposalItem, Status) |
| `lib/propostas/total.ts` | Cálculo puro do `total_cents` a partir dos itens |
| `lib/propostas/numeracao.ts` | Aloca `numero`/`ano` na mesma transação do envio, com retry em `23505` |
| `lib/propostas/versao.ts` | Decide PATCH-em-rascunho vs. criar v2 a partir de uma proposta `enviada` |
| `lib/propostas/pdf.tsx` | Componente `@react-pdf/renderer` com a marca da ORGANIZAÇÃO |
| `lib/propostas/storage.ts` | Upload no bucket `propostas` (privado) + signed URL |
| `lib/propostas/assistente.ts` | `gerarMudancas()` (IA, via `runModelCall` + tool-calling — G24) + `aplicarMudancas()` (puro) |
| `lib/mcp/tools/propostas.ts` | Ferramenta `crm_draft_proposal` |
| `lib/tarefas/vocabulario-de-origem.ts` | `TaskSourceKind` (`'promised_proposal'`, `'promised_followup'`) — vocabulário aberto, mesmo padrão de `activity-vocabulary.ts` |
| `lib/schemas/propostas.ts` | `propostaItemSchema`/`propostaCreateSchema` compartilhados tela+rota |
| `supabase/migrations/*_proposta_ai_draft_enabled.sql` | Coluna `ai_agent_versions.proposal_ai_draft_enabled` (Tarefa 13 — NNNN medido na hora, ver G3) |
| `supabase/migrations/*_configuracoes_de_propostas.sql` | Seed de `organizations.settings.proposals`, nasce desligada (Tarefa 16 — NNNN medido na hora, ver G3) |
| `app/api/v1/proposals/route.ts` | `GET` lista, `POST` cria rascunho |
| `app/api/v1/proposals/[id]/route.ts` | `GET` detalhe, `PATCH` edita itens/campos (revision otimista) |
| `app/api/v1/proposals/[id]/assistant/route.ts` | `POST` gera lista de mudanças (não aplica) |
| `app/api/v1/proposals/[id]/assistant/apply/route.ts` | `POST` aplica a lista devolvida |
| `app/api/v1/proposals/[id]/send/route.ts` | `POST` envia — exige `manager`/`admin` |
| `app/api/v1/proposals/[id]/decide/route.ts` | `POST` aceita/recusa (Onda 1, manual) |
| `app/api/v1/settings/proposals/route.ts` | `GET`/`PATCH` configuração por organização |
| `app/api/v1/cron/proposal-expiry/route.ts` | Cron diário — vence propostas sem decisão |
| `app/api/v1/cron/proposal-promised-not-created/route.ts` | Cron diário — fecha o defeito de origem (usa Tarefa 1) |
| `app/api/v1/cron/proposal-acceptance-rate/route.ts` | Cron semanal — laço de retorno (taxa de aceite, threshold) |
| `app/app/proposals/page.tsx` + `_client.tsx` | Lista de propostas |
| `app/app/proposals/[id]/page.tsx` + `_client.tsx` | Editor (itens, total, campos, enviar, decidir) |
| `app/app/proposals/[id]/_components/AssistantPanel.tsx` | Campo de instrução + preview antes/depois |
| `app/app/settings/tenant/proposals/page.tsx` + `_client.tsx` | Validade padrão, condições padrão, liga capacidade |
| `.changes/a-proposta-comercial-fecha-a-venda.md` | Fragmento de release |

### Modificados

| Arquivo | O que muda |
|---|---|
| `supabase/migrations/MANIFEST.md` | linha da 0279 |
| `app/api/v1/ai/inbox/[id]/route.ts` | `PATCH` ganha `create_task` opcional — resolver o aviso `promise_unfulfilled` pode criar uma `crm_tasks` (Tarefa 1) |
| `lib/leads/activity-vocabulary.ts` | `proposal_drafted`, `proposal_sent`, `proposal_accepted`, `proposal_declined`, `proposal_expired`, `proposal_value_changed` |
| `lib/agent-engine/db/repository.ts` | `InboxKind` ganha `proposal_expired_notice`, `proposal_acceptance_rate_drop` |
| `lib/ai/inbox-destino.ts` | `REFERENCIAS_DE_AVISO.proposal` + 2 entradas em `POLITICAS_DE_AVISO` |
| `lib/ai/agent-inbox-copy.ts` | 2 entradas no `Record<InboxKind, string>` |
| `lib/navigation/catalogo.ts` | entrada `/app/proposals`, grupo `crm`, seção "Fechar a venda" |
| `supabase/migrations/*_criar_ai_agent_versions_proposal_flag.sql` | ver Tarefa 12 (coluna nova, migration própria) |
| `app/app/ai/agents/[id]/_components/AgentForm.tsx` | toggle "Rascunho automático de proposta" |
| `app/app/ai/agents/[id]/_actions.ts` | persiste a coluna nova |
| `lib/ai/runtime/tools.ts` | auto-injeta `crm_draft_proposal` quando a chave está ligada |
| `docker/scheduler/entrypoint.sh` | 2 linhas de `CRONS` novas |
| `tests/invariants/rls-isolation.test.ts` | `crm_proposals` em `TABLES` + seed + par de casos tipo `ai_reply_drafts` |
| `docs/architecture/*.json` | nó `proposta`, arestas para lead/catálogo/mensagens/funil |

---

## Ordem das tarefas

```
T0  Migration: tabelas + RLS + numeração + versão + kinds + crm_tasks.source_kind [risco: RLS, concorrência]
T1  Promessa vira tarefa: PATCH /ai/inbox/[id] ganha create_task              [risco: resolve lead via negocioDaConversa]
T2  Vocabulário: activity-vocabulary + InboxKind + inbox-destino + copy      [risco: exaustividade TS]
T3  Isolamento RLS: seed em rls-isolation.test.ts                            [risco: RLS — só o CI mede]
T4  Domínio puro: total.ts, numeracao.ts, versao.ts                          [TDD]
T5  Rota criar rascunho + listar                                             [TDD]
T6  Rota editar rascunho (PATCH itens/campos, revision otimista)             [TDD]
T7  Porta na navegação + tela de lista                                       [prova em tela depois]
T8  Tela do editor manual (itens do catálogo OU à mão, total, revisão)       [prova em tela depois]
T9  Assistente: gerarMudancas() + aplicarMudancas() (TDD, mecanismo novo)    [TDD — G20]
T10 Rotas do assistente (gerar / aplicar) + orçamento com superfície         [TDD]
T11 UI do assistente (instrução, preview antes/depois, aplicar/descartar)    [prova em tela depois]
T12 PDF com marca da organização                                             [TDD]
T13 Chave nova na versão do agente + ferramenta crm_draft_proposal           [TDD]
T14 Rota de envio: numeração/versão na transação + PDF + WAHA + value_cents [TDD — G14 sabotagem]
T15 UI de envio + decisão (aceite/recusa Onda 1)                              [prova em tela depois]
T16 Configurações › Propostas (validade padrão, condições, liga capacidade) [TDD]
T17 Cron de vencimento (anti-morte)                                          [TDD]
T18 Cron "prometida e não criada" + cron de taxa de aceite (laço de retorno) [TDD — usa T1]
T19 Mapa vivo + MANIFEST + fragmento .changes                                [—]
T20 Suíte completa (uma vez) + prova em tela na VPS                          [gate final]
```

**Cada tarefa termina em commit próprio.** TDD nas tarefas de lógica (T0-T6, T9-T10, T12-T14,
T16-T18); nas tarefas de UI (T7-T8, T11, T15) o teste é a prova em tela na Tarefa 20, não unitário
de componente — este repositório não testa JSX isolado, testa o caminho pela API que a tela chama.

---

# Tarefa 0 — Migration: tabelas, RLS, numeração, versão, kinds

**Files:**
- Criar: `supabase/migrations/20260917000000_0279_proposta_comercial.sql`
- Modificar: `supabase/baseline.sql` (apêndice)
- Modificar: `supabase/migrations/MANIFEST.md`

**Interfaces:**
- Consome: `fn_user_org_ids()`, `fn_role_at_least()`, `fn_set_updated_at()` (já existem).
- Produz: tabelas `crm_proposals`/`crm_proposal_items`, função `fn_proposta_aloca_numero(p_org uuid, p_ano int) returns int`, 2 valores novos em `agent_inbox_items.kind`.

- [ ] **Passo 1: confirmar que `fn_role_at_least` existe com essa assinatura**

```bash
grep -n "create or replace function public.fn_role_at_least\|create function public.fn_role_at_least" supabase/baseline.sql
```

Se a assinatura diferir do que os Passos abaixo assumem (`fn_role_at_least(organization_id uuid, min text) returns boolean`), ajuste os `using`/`with check` do Passo 3 para a assinatura real antes de continuar.

- [ ] **Passo 2: escrever a migration completa**

```sql
-- 20260917000000_0279_proposta_comercial.sql
--
-- A proposta comercial: documento que a organização emite para um contato,
-- com itens, valor e prazo, cujo desfecho volta para o funil. Ver
-- docs/superpowers/specs/2026-09-16-proposta-comercial-design.md.
--
-- Numeração e versão são decisão do dono (spec §5.3/§5.4): numero+ano
-- nascem NULL no rascunho — só existem quando a proposta é ENVIADA — e uma
-- revisão de proposta enviada cria uma v2 que HERDA o número da v1.

create table if not exists public.crm_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'rascunho'
    check (status in ('rascunho','enviada','aceita','recusada','vencida','cancelada','substituida')),
  titulo text not null,
  condicoes text,
  total_cents bigint not null default 0,
  moeda text not null default 'BRL',
  valid_until date,
  pdf_path text,
  numero integer,
  ano integer,
  versao integer not null default 1,
  substitui_id uuid references public.crm_proposals(id) on delete set null,
  drafted_by_agent_id uuid references public.ai_agents(id) on delete set null,
  revision bigint not null default 1,
  sent_at timestamptz,
  sent_by_user_id uuid references auth.users(id),
  decided_at timestamptz,
  decided_by_user_id uuid references auth.users(id),
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_proposals_moeda_iso check (moeda ~ '^[A-Z]{3}$'),
  constraint crm_proposals_total_nao_negativo check (total_cents >= 0),
  constraint crm_proposals_numero_ano_juntos check ((numero is null) = (ano is null))
);

create index if not exists crm_proposals_org_lead_idx
  on public.crm_proposals(organization_id, lead_id);
create index if not exists crm_proposals_org_status_idx
  on public.crm_proposals(organization_id, status);
-- Só uma proposta pode ocupar um número por organização/ano — parcial porque
-- rascunho nunca tem numero/ano.
create unique index if not exists crm_proposals_numero_ano_org_uidx
  on public.crm_proposals(organization_id, ano, numero) where numero is not null;

create table if not exists public.crm_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.crm_proposals(id) on delete cascade,
  product_id uuid references public.catalog_products(id) on delete set null,
  descricao text not null,
  quantidade numeric not null default 1,
  preco_unitario_cents bigint not null,
  desconto_cents bigint not null default 0,
  -- fractional indexing, igual position_in_stage — NUNCA int (CLAUDE.md).
  position numeric not null,
  created_at timestamptz not null default now(),
  constraint crm_proposal_items_quantidade_positiva check (quantidade > 0),
  constraint crm_proposal_items_preco_nao_negativo check (preco_unitario_cents >= 0),
  constraint crm_proposal_items_desconto_nao_negativo check (desconto_cents >= 0)
);
create index if not exists crm_proposal_items_proposal_idx
  on public.crm_proposal_items(proposal_id, position);

alter table public.crm_proposals enable row level security;
alter table public.crm_proposal_items enable row level security;

-- Leitura: qualquer papel da organização. Escrita do RASCUNHO: `agent` monta
-- e deixa pronto (spec §16, decisão 2). O ENVIO exige `manager`/`admin`, mas
-- isso é gate DE ROTA (Tarefa 13), não de RLS — a RLS não distingue "criar
-- rascunho" de "marcar enviada" dentro de um UPDATE genérico.
drop policy if exists crm_proposals_select on public.crm_proposals;
create policy crm_proposals_select on public.crm_proposals
  for select using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists crm_proposals_write on public.crm_proposals;
create policy crm_proposals_write on public.crm_proposals
  for all
  using (organization_id in (select public.fn_user_org_ids())
         and public.fn_role_at_least(organization_id, 'agent'))
  with check (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, 'agent'));

drop policy if exists crm_proposal_items_select on public.crm_proposal_items;
create policy crm_proposal_items_select on public.crm_proposal_items
  for select using (
    exists (
      select 1 from public.crm_proposals p
      where p.id = crm_proposal_items.proposal_id
        and p.organization_id in (select public.fn_user_org_ids())
    )
  );

drop policy if exists crm_proposal_items_write on public.crm_proposal_items;
create policy crm_proposal_items_write on public.crm_proposal_items
  for all
  using (
    exists (
      select 1 from public.crm_proposals p
      where p.id = crm_proposal_items.proposal_id
        and p.organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(p.organization_id, 'agent')
    )
  )
  with check (
    exists (
      select 1 from public.crm_proposals p
      where p.id = crm_proposal_items.proposal_id
        and p.organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(p.organization_id, 'agent')
    )
  );

revoke all on public.crm_proposals from anon;
revoke all on public.crm_proposal_items from anon;
grant select, insert, update, delete on public.crm_proposals to authenticated;
grant select, insert, update, delete on public.crm_proposal_items to authenticated;
grant all on public.crm_proposals to service_role;
grant all on public.crm_proposal_items to service_role;

drop trigger if exists trg_crm_proposals_updated_at on public.crm_proposals;
create trigger trg_crm_proposals_updated_at
  before update on public.crm_proposals
  for each row execute function public.fn_set_updated_at();

comment on table public.crm_proposals is
  'Documento comercial emitido para um contato: itens, valor, prazo. Desfecho volta ao funil.';
comment on column public.crm_proposals.numero is
  'Nasce NULL. Alocado só no ENVIO — rascunho descartado não queima número (spec §5.3).';
comment on column public.crm_proposals.versao is
  'v2 herda numero/ano da v1 quando uma proposta ENVIADA é revisada (spec §5.4).';

-- Numeração: aloca dentro da MESMA transação do envio. A rota que chama isto
-- (Tarefa 13) captura 23505 (unique_violation do índice parcial acima) e
-- tenta de novo — é o padrão de idempotência que o repositório já usa.
create or replace function public.fn_proposta_aloca_numero(p_org uuid, p_ano int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(numero), 0) + 1
  from public.crm_proposals
  where organization_id = p_org and ano = p_ano;
$$;

revoke all on function public.fn_proposta_aloca_numero(uuid, int) from public, anon;
grant execute on function public.fn_proposta_aloca_numero(uuid, int) to authenticated, service_role;

-- Bucket privado, URL sempre assinada — mesmo padrão de `lgpd-exports`.
insert into storage.buckets (id, name, public)
values ('propostas', 'propostas', false)
on conflict (id) do nothing;

drop policy if exists "propostas: leitura por organizacao" on storage.objects;
create policy "propostas: leitura por organizacao" on storage.objects
  for select using (
    bucket_id = 'propostas'
    and (storage.foldername(name))[1]::uuid in (select public.fn_user_org_ids())
  );

drop policy if exists "propostas: escrita por service_role" on storage.objects;
create policy "propostas: escrita por service_role" on storage.objects
  for all using (bucket_id = 'propostas' and auth.role() = 'service_role')
  with check (bucket_id = 'propostas' and auth.role() = 'service_role');

-- Três `kind` novos em agent_inbox_items. G5: perto do FIM, comentário curto.
-- G4: reconstruir o bloco INTEIRO (lista completa) — nunca um segundo
-- `add constraint`. Copie a lista atual de `agent_inbox_items_kind_check`
-- (medida em 2026-09-17) e acrescente os três ANTES de 'other'.
alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required', 'appointment_recovery_review', 'qr_rescan',
    'routing_unassigned', 'job_dead', 'event_dead', 'budget_exceeded', 'handoff',
    'promotion_review', 'judge_unaligned', 'followup_dead', 'snooze_expired',
    'next_action_ambiguous', 'risk_backlog_seeded', 'reactivation_expired',
    'capabilities_missing', 'message_send_stuck', 'midia_nao_lida',
    'channel_template_review', 'channel_number_alert', 'promise_unfulfilled',
    'contact_proposal_expired', 'budget_warning', 'conhecimento_nao_indexado',
    'voice_call_missed', 'case_stale', 'lead_field_proposed',
    'passos_esgotados', 'laco_de_retorno_caiu',
    -- proposta comercial (migration 0279):
    'proposal_expired_notice', 'proposal_acceptance_rate_drop', 'proposal_promised_not_created',
    'other'
  ));

-- A tarefa gravada a partir de um aviso de promessa (Tarefa 1) precisa dizer
-- DE ONDE veio, sem exigir que toda `crm_tasks` tenha origem — vocabulário
-- ABERTO (sem CHECK), mesmo padrão de `crm_lead_activities.type` (CLAUDE.md
-- doutrina de Migrations, exceção DIRC): o emissor usa a constante
-- compartilhada de `lib/tarefas/vocabulario-de-origem.ts`, nunca string solta.
alter table public.crm_tasks
  add column if not exists source_kind text;
comment on column public.crm_tasks.source_kind is
  'De onde a tarefa nasceu (ex.: promised_proposal). NULL = criada à mão. Vocabulário aberto — TypeScript, sem CHECK.';
```

> ⚠️ **Antes de colar o Passo 2 no baseline (Passo 3), rode primeiro a checagem abaixo** — a lista
> de `kind` colada acima é a medida em 2026-09-17; se o baseline mudou desde então (outra sessão
> pode ter mexido), a lista real pode ter mais itens. Nunca cole a lista deste plano sem conferir.

```bash
grep -n "add constraint agent_inbox_items_kind_check check (kind in (" -A 15 supabase/baseline.sql | head -20
```

- [ ] **Passo 3: colar o bloco no apêndice do `baseline.sql`**

No fim de `supabase/baseline.sql`, acrescente o bloco do Passo 2 (idêntico), rotulado:

```sql
-- ---- a proposta comercial: rascunho, envio, versão, aceite (migration 0279) ----
```

com a **lista de kind exatamente igual** à que o `grep` do aviso acima devolveu, mais os dois
novos antes de `'other'`.

- [ ] **Passo 4: linha no MANIFEST**

Em `supabase/migrations/MANIFEST.md`, acrescente (formato medido: uma linha, timestamp entre
crases, nome do arquivo sem extensão entre crases, texto livre começando em negrito):

```
| `20260917000000` | `0279_proposta_comercial` | **A proposta comercial ganha tabela própria — `crm_proposals`/`crm_proposal_items`, RLS, numeração sequencial por organização/ano alocada só no envio, e versionamento onde a revisão de uma proposta enviada cria uma v2 que herda o número.** Bucket `propostas` privado. Três `kind` novos em `agent_inbox_items` (vencimento, laço de retorno, promessa não cumprida) e `crm_tasks.source_kind` (vocabulário aberto, para a promessa virar tarefa). |
```

- [ ] **Passo 5: commit**

```bash
git add supabase/migrations/20260917000000_0279_proposta_comercial.sql supabase/baseline.sql supabase/migrations/MANIFEST.md
git commit -m "feat(proposta): tabelas, RLS, numeracao e versao da proposta comercial

crm_proposals + crm_proposal_items, RLS no molde de catalog_products
(select por fn_user_org_ids, write por fn_role_at_least 'agent'). Numero
e ano nascem NULL e so sao alocados no envio (indice unico parcial).
Bucket 'propostas' privado. Tres kind novos em agent_inbox_items para
vencimento, laco de retorno e promessa nao cumprida (Tarefas 1/17/18).
crm_tasks ganha source_kind (vocabulario aberto) para a Tarefa 1.

Proximo NNNN livre depois desta: 0280.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

**Sabotagem (G14) — adiada para depois da Tarefa 3**, onde o teste de isolamento existe para medir.

---

# Tarefa 1 — A promessa vira tarefa com dono e prazo

**Por quê agora, e não como dependência externa:** o laço de retorno da proposta (spec §9, sinal
"prometida e não criada") precisa de UM dado que o banco não guardava — decisão do dono em
2026-09-17: construir aqui, não supor pronto. O mecanismo de DETECTAR a promessa e avisar sem dono
já existe (`promise_unfulfilled`, medido); o que falta é a PESSOA, ao resolver esse aviso, poder
dizer "isto é uma promessa de proposta, o prazo é este" — e isso virar uma `crm_tasks` real. A
máquina não classifica o texto sozinha (mesmo princípio de P6 do plano do funil): quem confirma é
quem resolve o aviso.

**Files:**
- Criar: `lib/tarefas/vocabulario-de-origem.ts`
- Criar: `tests/unit/promessa-vira-tarefa.test.ts`
- Modificar: `app/api/v1/ai/inbox/[id]/route.ts`

**Interfaces:**
- Consome: `negocioDaConversa(db, { tenantId, contactId })` (`lib/agent-engine/edge/crm/negocio-da-conversa.ts`, já existe) — devolve `{tipo:'um',leadId}` ou `{tipo:'nenhum'}`/`{tipo:'varios',quantos}`.
- Produz: `TaskSourceKind` (usado pela Tarefa 18 no filtro do cron).

- [ ] **Passo 1: confirmar a assinatura de `negocioDaConversa` e o schema de `conversations`**

```bash
sed -n '55,90p' lib/agent-engine/edge/crm/negocio-da-conversa.ts
grep -n "organization_id\|contact_id" supabase/baseline.sql | grep -A2 "CREATE TABLE.*conversations"
```

Confirme: a função recebe `db: Queryable` (não `SupabaseClient` direto) — se `Queryable` for um
adaptador específico do agent-engine (pool `pg`), a rota HTTP (que usa `createAdminClient()`,
Supabase JS) pode não conseguir chamar essa função diretamente. Se `Queryable` não for compatível,
**não adapte a função** — leia `conversations.contact_id` direto via Supabase JS e resolva o lead
com uma query equivalente e mais simples (um contato tem no máximo um negócio "aberto" — replique
só essa checagem, sem reimplementar toda a regra de `resolveActiveLeadForContact`).

- [ ] **Passo 2: vocabulário de origem da tarefa**

```ts
// lib/tarefas/vocabulario-de-origem.ts
/**
 * De onde uma `crm_tasks` nasceu — vocabulário ABERTO (sem CHECK no banco,
 * CLAUDE.md doutrina de Migrations). `null`/ausente = criada à mão.
 */
export type TaskSourceKind = "promised_proposal" | "promised_followup";

export const TASK_SOURCE_LABELS: Record<TaskSourceKind, string> = {
  promised_proposal: "Promessa de proposta detectada pelo assistente",
  promised_followup: "Compromisso detectado pelo assistente",
};
```

- [ ] **Passo 3: escrever o teste (vermelho)**

```ts
// tests/unit/promessa-vira-tarefa.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Resolver um aviso `promise_unfulfilled` com `create_task` cria uma
 * `crm_tasks` vinculada ao negócio da conversa, marcada com `source_kind`.
 *
 * NASCE VERMELHO — a rota ainda só aceita `{ status }`.
 */
describe("PATCH /api/v1/ai/inbox/[id] — create_task", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("com create_task.is_proposal=true, grava crm_tasks com source_kind=promised_proposal", async () => {
    const mundo = montarMundoDeAviso({ kind: "promise_unfulfilled", refKind: "conversation" });

    const res = await mundo.PATCH({
      status: "resolved",
      create_task: {
        title: "Enviar proposta do site institucional",
        due_date: "2026-10-01T12:00:00.000Z",
        assigned_to: mundo.userId,
        is_proposal: true,
      },
    });

    expect(res.status).toBe(200);
    const tarefa = mundo.tarefasCriadas.at(-1);
    expect(tarefa).toBeDefined();
    expect(tarefa?.source_kind).toBe("promised_proposal");
    expect(tarefa?.lead_id).toBe(mundo.leadId);
    expect(tarefa?.due_date).toBe("2026-10-01T12:00:00.000Z");
  });

  it("sem create_task, continua só mudando o status (compatibilidade)", async () => {
    const mundo = montarMundoDeAviso({ kind: "promise_unfulfilled", refKind: "conversation" });
    const res = await mundo.PATCH({ status: "ack" });
    expect(res.status).toBe(200);
    expect(mundo.tarefasCriadas).toHaveLength(0);
  });

  it("create_task só é aceito para kind=promise_unfulfilled — outro kind é 422", async () => {
    const mundo = montarMundoDeAviso({ kind: "handoff", refKind: "conversation" });
    const res = await mundo.PATCH({
      status: "resolved",
      create_task: { title: "x", due_date: "2026-10-01T12:00:00.000Z", is_proposal: true },
    });
    expect(res.status).toBe(422);
    expect(mundo.tarefasCriadas).toHaveLength(0);
  });

  it("negócio da conversa 'varios' — tarefa nasce sem lead_id, não quebra", async () => {
    const mundo = montarMundoDeAviso({
      kind: "promise_unfulfilled", refKind: "conversation", negocio: { tipo: "varios", quantos: 2 },
    });
    const res = await mundo.PATCH({
      status: "resolved",
      create_task: { title: "x", due_date: "2026-10-01T12:00:00.000Z", is_proposal: true },
    });
    expect(res.status).toBe(200);
    expect(mundo.tarefasCriadas.at(-1)?.lead_id).toBeNull();
  });
});
```

> **Nota para quem executa:** `montarMundoDeAviso` é um helper deste arquivo — monte um duplo de
> `createAdminClient()` no padrão `supabaseFalso()` já usado em `tests/unit/o-negocio-vem-da-conversa.test.ts`,
> com `.from("agent_inbox_items")` devolvendo o aviso fixo e `.from("crm_tasks").insert(...)`
> capturando em `mundo.tarefasCriadas`. Mocke `negocioDaConversa` (ou a query equivalente do Passo
> 1) para devolver `{tipo:'um', leadId: mundo.leadId}` por padrão, sobrescrevível por caso.

- [ ] **Passo 4: rodar e conferir a falha**

```bash
npx vitest run tests/unit/promessa-vira-tarefa.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `3 failed | 1 passed` (o caso "sem create_task" já passa — é o comportamento atual).

- [ ] **Passo 5: estender a rota**

```ts
// app/api/v1/ai/inbox/[id]/route.ts — substituir bodySchema e o corpo do PATCH
const criarTarefaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  due_date: z.string().datetime(),
  assigned_to: z.string().uuid().nullable().optional(),
  is_proposal: z.boolean().default(false),
});
const bodySchema = z
  .object({
    status: z.enum(["open", "ack", "resolved"]),
    create_task: criarTarefaSchema.optional(),
  })
  .strict();
```

No handler, depois do `update` de status bem-sucedido (mantendo o `select` original) e antes do
`audit`:

```ts
  let tarefaCriada: { id: string } | null = null;
  if (parsed.data.create_task) {
    if (data.kind !== "promise_unfulfilled") {
      return fail(
        "validation_failed",
        t("Criar tarefa só é possível a partir de um aviso de promessa."),
        422,
        { requestId },
      );
    }
    const { title, due_date, assigned_to, is_proposal } = parsed.data.create_task;

    let leadId: string | null = null;
    if (data.ref_kind === "conversation" && data.ref_id) {
      const { data: conv } = await admin
        .from("conversations")
        .select("contact_id")
        .eq("organization_id", org.orgId)
        .eq("id", data.ref_id)
        .maybeSingle();
      if (conv?.contact_id) {
        const negocio = await negocioDaConversa(admin, {
          tenantId: org.orgId,
          contactId: conv.contact_id,
        });
        if (negocio.tipo === "um") leadId = negocio.leadId;
      }
    }

    const { data: tarefa, error: tarefaErr } = await admin
      .from("crm_tasks")
      .insert({
        organization_id: org.orgId,
        title,
        due_date,
        assigned_to: assigned_to ?? null,
        lead_id: leadId,
        created_by: authUser.id,
        source_kind: is_proposal ? "promised_proposal" : "promised_followup",
      })
      .select("id")
      .single();
    if (tarefaErr) {
      return fail("internal_error", t("Falha ao criar a tarefa."), 500, { requestId });
    }
    tarefaCriada = tarefa;
  }
```

E o `return` final passa a incluir `task_id: tarefaCriada?.id ?? null`. Importe
`negocioDaConversa` de `@/lib/agent-engine/edge/crm/negocio-da-conversa` no topo do arquivo — **só
se o Passo 1 confirmou compatibilidade de tipo**; senão, use a query equivalente descrita ali.

- [ ] **Passo 6: rodar e confirmar verde**

```bash
npx vitest run tests/unit/promessa-vira-tarefa.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `4 passed`.

- [ ] **Passo 7: SABOTAGEM (G14)**

Remova só a checagem `if (data.kind !== "promise_unfulfilled")`. Previsão: **1 caso cai** (o
terceiro — "só é aceito para promise_unfulfilled"). Restaure.

- [ ] **Passo 8: commit**

```bash
git add lib/tarefas/vocabulario-de-origem.ts tests/unit/promessa-vira-tarefa.test.ts app/api/v1/ai/inbox/\[id\]/route.ts
git commit -m "feat(inbox): resolver um aviso de promessa pode criar a tarefa

PATCH /api/v1/ai/inbox/[id] ganha create_task opcional. So aceito para
kind=promise_unfulfilled. A pessoa que resolve o aviso decide se e uma
promessa de proposta (source_kind=promised_proposal) e escolhe o prazo
— a maquina nao classifica o texto sozinha. Fecha o pre-requisito que
faltava para o laco de retorno da proposta comercial (Tarefa 18).

Sabotagem: remover a guarda de kind derruba 1 de 4 casos (previsto e
confirmado).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 2 — Vocabulário: atividade, InboxKind, destino e cópia dos avisos

**Files:**
- Modificar: `lib/leads/activity-vocabulary.ts`
- Modificar: `lib/agent-engine/db/repository.ts`
- Modificar: `lib/ai/inbox-destino.ts`
- Modificar: `lib/ai/agent-inbox-copy.ts`

**Interfaces:**
- Consome: nada.
- Produz: os literais que as Tarefas 14, 17 e 18 emitem.

- [ ] **Passo 1: confirmar os 4 pontos exatos antes de editar**

```bash
grep -n "^export type ActivityType" -A3 lib/leads/activity-vocabulary.ts
grep -n "^export type InboxKind" -A 35 lib/agent-engine/db/repository.ts | tail -10
grep -n "REFERENCIAS_DE_AVISO = {" -A2 lib/ai/inbox-destino.ts
grep -n "} satisfies Record<InboxKind" lib/ai/inbox-destino.ts lib/ai/agent-inbox-copy.ts
```

- [ ] **Passo 2: `lib/leads/activity-vocabulary.ts`**

Acrescente à união `ActivityType` (não remova nada existente):

```ts
  | "proposal_drafted"
  | "proposal_sent"
  | "proposal_accepted"
  | "proposal_declined"
  | "proposal_expired"
  | "proposal_value_changed"
```

E as chaves correspondentes em `ACTIVITY_LABELS`:

```ts
  proposal_drafted: "Rascunho de proposta criado",
  proposal_sent: "Proposta enviada",
  proposal_accepted: "Proposta aceita",
  proposal_declined: "Proposta recusada",
  proposal_expired: "Proposta venceu sem decisão",
  proposal_value_changed: "Valor do negócio atualizado pela proposta",
```

O compilador reprova se `ACTIVITY_LABELS` ficar incompleto — é a exaustividade que substitui o
CHECK (G6).

- [ ] **Passo 3: `lib/agent-engine/db/repository.ts`**

Acrescente à união `InboxKind` (mesma ordem do CHECK da Tarefa 0, antes de `'other'` se ele for o
último literal):

```ts
  | "proposal_expired_notice"
  | "proposal_acceptance_rate_drop"
  | "proposal_promised_not_created"
```

- [ ] **Passo 4: `lib/ai/inbox-destino.ts`**

Nova entrada em `REFERENCIAS_DE_AVISO` (o alvo é a PROPOSTA, não o lead — quem recebe o aviso quer
abrir o documento, não o card do funil):

```ts
  proposal: {
    tabela: "crm_proposals",
    papel: "agent",
    rotulo: "Abrir proposta",
    href: (id: string) => `/app/proposals/${id}`,
  },
```

E adicione `"proposal"` à união `InboxRefKind` (linha do `type InboxRefKind = keyof typeof
REFERENCIAS_DE_AVISO | ...`).

Três entradas novas em `POLITICAS_DE_AVISO` (a ordem não importa, `satisfies` cobra completude):

```ts
  proposal_expired_notice: {
    refs: ["proposal"],
    orientacao: "A validade passou sem decisão do cliente. Confirme se ainda vale a pena manter a oferta ou revise o preço.",
  },
  proposal_acceptance_rate_drop: {
    refs: ["organization"],
    orientacao: "A proporção de propostas aceitas caiu de forma sustentada — revise preço, prazo ou o texto padrão.",
  },
  proposal_promised_not_created: {
    refs: ["lead"],
    orientacao: "Uma promessa de proposta venceu sem que a proposta tenha sido criada. Abra o negócio e monte o rascunho.",
  },
```

- [ ] **Passo 5: `lib/ai/agent-inbox-copy.ts`**

Três entradas no `Record<InboxKind, string>` (título curto, no mesmo estilo das existentes — ver
`contact_proposal_expired: "A sugestão de dado venceu"` como referência de tamanho):

```ts
  proposal_expired_notice: "Uma proposta venceu sem decisão",
  proposal_acceptance_rate_drop: "A taxa de aceite de propostas caiu",
  proposal_promised_not_created: "Uma proposta prometida não foi criada",
```

- [ ] **Passo 6: gate leve local dos 4 arquivos**

Como G12 proíbe rodar `tsc`/`vitest` nesta máquina, confira por leitura que os quatro `satisfies
Record<..., ...>` ficaram com as mesmas chaves — um `grep -c` nos dois lados do maior
(`POLITICAS_DE_AVISO`) é suficiente como conferência rápida antes de empurrar:

```bash
grep -oE '^\s+[a-z_]+:' lib/ai/inbox-destino.ts | sed -n '/POLITICAS_DE_AVISO/,/^};/p' | wc -l
grep -c "InboxKind" lib/agent-engine/db/repository.ts
```

O veredito real é o `verify` do CI (`tsc --noEmit`), que pega qualquer chave esquecida.

- [ ] **Passo 7: commit**

```bash
git add lib/leads/activity-vocabulary.ts lib/agent-engine/db/repository.ts lib/ai/inbox-destino.ts lib/ai/agent-inbox-copy.ts
git commit -m "feat(proposta): vocabulario de atividade e de avisos

6 tipos novos em ActivityType (rascunho, envio, aceite, recusa,
vencimento, mudanca de valor) e 3 kind novos em InboxKind, com destino
e copia. Nenhum efeito visivel ainda — as Tarefas 14/17/18 emitem.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 3 — Isolamento RLS: proposta entra no seed do invariante

**Correção 2026-09-17 (antes de despachar):** este texto original assumia que `crm_proposal_items`
NÃO tinha `organization_id` direto, e por isso pedia um caso especial "via join". Isso mudou na
própria Tarefa 0: a revisão dela (achado Important 4) obrigou a adicionar `organization_id` direto
a `crm_proposal_items` (com trigger de consistência contra `crm_proposals`, para a trava de
suporte da migration 0274 alcançar a tabela). **Confirme isso primeiro** (`grep -n "organization_id"
supabase/baseline.sql | grep -A3 "create table if not exists public.crm_proposal_items"`) — se
bateu, as duas tabelas entram na lista GENÉRICA `TABLES`, sem caso especial nenhum; o passo 3
original (caso via join) foi removido deste brief.

**Files:**
- Modificar: `tests/invariants/rls-isolation.test.ts`

**Interfaces:**
- Consome: `TABLES` (array), o bloco `DO $seed$` já existente.
- Produz: cobertura de `crm_proposals` E `crm_proposal_items` no invariante genérico (ambas têm `organization_id` próprio agora).

- [ ] **Passo 1: acrescentar `crm_proposals` E `crm_proposal_items` a `TABLES`**

Em `tests/invariants/rls-isolation.test.ts`, no array `TABLES` (linha ~286), logo após
`"crm_tasks"`:

```ts
  // migration 0275 — a proposta comercial. Read/write org-scoped sem gate de
  // papel além de fn_role_at_least('agent'); o gate de ENVIO (manager) é
  // medido na rota, não aqui (mesmo eixo separado de catalog_products acima).
  "crm_proposals",
  // crm_proposal_items ganhou organization_id próprio na revisão da Tarefa 0
  // (Important 4 — sem isso a tabela escapava da trava de suporte da 0274).
  // Confirmado com trigger de consistência contra crm_proposals.organization_id.
  "crm_proposal_items",
```

- [ ] **Passo 2: seed dentro do bloco `DO $seed$`**

Logo após o bloco de `crm_leads` (linha ~167-170), acrescente (confirme o nome exato da variável de
contato em escopo — pode ser `v_contact` ou outro nome; releia o `DO $seed$` antes de assumir):

```sql
        if not exists (select 1 from public.crm_proposals where organization_id = v_org) then
          insert into public.crm_proposals
            (organization_id, lead_id, contact_id, titulo, total_cents)
          select v_org, id, v_contact, 'RLS invariant proposal', 1000
          from public.crm_leads where organization_id = v_org limit 1
          returning id into v_proposta;
        end if;

        if v_proposta is not null and not exists (
          select 1 from public.crm_proposal_items where proposal_id = v_proposta
        ) then
          insert into public.crm_proposal_items
            (proposal_id, organization_id, descricao, quantidade, preco_unitario_cents, position)
          values (v_proposta, v_org, 'RLS invariant item', 1, 1000, 1000);
        end if;
```

Declare `v_proposta uuid;` junto com as outras variáveis do `DO` (procure o bloco `declare` no topo
do `DO $seed$`). **Atenção:** se a proposta já existia de uma rodada anterior do seed (idempotência
— `if not exists`), `v_proposta` fica `null` nessa passada e o item não é inserido de novo; troque
o primeiro `if not exists` por um `select id into v_proposta from crm_proposals where
organization_id = v_org and titulo = 'RLS invariant proposal'` ANTES do `if not exists`, para
`v_proposta` estar sempre preenchido nas rodadas seguintes (mesmo padrão que os outros blocos do
seed já usam para tabelas idempotentes — releia como o bloco de `crm_leads` faz isso, se fizer).

- [ ] **Passo 3: empurrar e conferir no CI**

Esta suíte não roda localmente (G11). Empurre e cheque o job `invariants`:

```bash
git add tests/invariants/rls-isolation.test.ts
git commit -m "test(invariants): crm_proposals e crm_proposal_items entram no seed de isolamento RLS

Adiciona as duas tabelas ao loop generico de TABLES (org A nao le
linha de B, org A le a propria) — as duas tem organization_id proprio
desde a revisao da Tarefa 0, entao nao precisam de caso especial via
join.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push fork <branch>
gh run list --repo paulolimajr77/DeskcommCRM --branch <branch> --limit 3
```

**Sabotagem (G14):** depois de verde no CI, comente a policy `crm_proposal_items_select` numa
branch local descartável (`create policy ... using (true)`), rode o job de novo, confirme que o
caso de `crm_proposal_items` fica vermelho, reverta. Se o CI não acusar, a policy real está fraca —
pare e investigue antes de seguir. (A policy de `crm_proposals_select` já foi coberta por este
mesmo tipo de checagem quando a Tarefa 0 foi revisada — não precisa repetir aqui, mas não custa
conferir de novo se sobrar tempo.)

---

# Tarefa 4 — Domínio puro: total, numeração, versão

**Files:**
- Criar: `lib/propostas/tipos.ts`
- Criar: `lib/propostas/total.ts` + `lib/propostas/total.test.ts`
- Criar: `lib/propostas/numeracao.ts` + `lib/propostas/numeracao.test.ts`
- Criar: `lib/propostas/versao.ts` + `lib/propostas/versao.test.ts`

**Interfaces:**
- Consome: nada (módulos puros).
- Produz: `calcularTotal(itens)`, `alocarNumero(admin, {orgId, ano})`, `decidirVersao(propostaAtual)` — usados pelas Tarefas 6 e 14.

- [ ] **Passo 1: tipos do domínio**

```ts
// lib/propostas/tipos.ts
export type ProposalStatus =
  | "rascunho" | "enviada" | "aceita" | "recusada" | "vencida" | "cancelada" | "substituida";

export interface ProposalItemInput {
  id?: string;
  product_id: string | null;
  descricao: string;
  quantidade: number;
  preco_unitario_cents: number;
  desconto_cents: number;
  position: number;
}

export interface ProposalRow {
  id: string;
  organization_id: string;
  lead_id: string;
  status: ProposalStatus;
  numero: number | null;
  ano: number | null;
  versao: number;
  substitui_id: string | null;
  revision: number;
  total_cents: number;
}
```

- [ ] **Passo 2: teste do cálculo de total (vermelho)**

```ts
// lib/propostas/total.test.ts
import { describe, expect, it } from "vitest";
import { calcularTotal } from "./total";
import type { ProposalItemInput } from "./tipos";

function item(over: Partial<ProposalItemInput> = {}): ProposalItemInput {
  return {
    product_id: null, descricao: "item", quantidade: 1,
    preco_unitario_cents: 1000, desconto_cents: 0, position: 1000, ...over,
  };
}

describe("calcularTotal", () => {
  it("soma quantidade x preco menos desconto, por item", () => {
    const total = calcularTotal([
      item({ quantidade: 2, preco_unitario_cents: 1000, desconto_cents: 0 }), // 2000
      item({ quantidade: 1, preco_unitario_cents: 5000, desconto_cents: 500 }), // 4500
    ]);
    expect(total).toBe(6500);
  });

  it("lista vazia soma zero", () => {
    expect(calcularTotal([])).toBe(0);
  });

  it("quantidade fracionária arredonda o item para baixo (centavos são inteiros)", () => {
    const total = calcularTotal([item({ quantidade: 1.5, preco_unitario_cents: 1000, desconto_cents: 0 })]);
    expect(total).toBe(1500);
    expect(Number.isInteger(total)).toBe(true);
  });

  it("nunca devolve negativo — desconto maior que o item trava em zero NO ITEM", () => {
    const total = calcularTotal([item({ quantidade: 1, preco_unitario_cents: 1000, desconto_cents: 5000 })]);
    expect(total).toBe(0);
  });
});
```

- [ ] **Passo 3: rodar e conferir vermelho**

```bash
npx vitest run lib/propostas/total.test.ts 2>&1 | grep -aE "Tests |Errors "
```

Esperado: falha por `total.ts` não existir.

- [ ] **Passo 4: implementar**

```ts
// lib/propostas/total.ts
import type { ProposalItemInput } from "./tipos";

/**
 * Total em centavos. Cada item trava em ZERO se o desconto exceder o
 * subtotal dele — nunca deixa um item negativo puxar o total pra baixo do
 * que os outros itens somam sozinhos.
 */
export function calcularTotal(itens: readonly ProposalItemInput[]): number {
  return itens.reduce((acc, it) => {
    const subtotal = Math.round(it.quantidade * it.preco_unitario_cents);
    const liquido = Math.max(0, subtotal - it.desconto_cents);
    return acc + liquido;
  }, 0);
}
```

- [ ] **Passo 5: rodar e confirmar verde**

```bash
npx vitest run lib/propostas/total.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `4 passed`.

- [ ] **Passo 6: teste de numeração (vermelho)**

```ts
// lib/propostas/numeracao.test.ts
import { describe, expect, it, vi } from "vitest";
import { alocarNumero } from "./numeracao";

function admFalso(sequenciaDeErros: Array<{ code: string } | null>) {
  let chamada = 0;
  return {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              select: () => ({
                single: async () => {
                  const erro = sequenciaDeErros[chamada++] ?? null;
                  return erro ? { data: null, error: erro } : { data: { id: "prop-1", numero: 7, ano: 2026 }, error: null };
                },
              }),
            }),
          }),
        }),
      }),
      rpc: () => Promise.resolve({ data: 7, error: null }),
    }),
    rpc: () => Promise.resolve({ data: 7, error: null }),
  } as unknown as Parameters<typeof alocarNumero>[0];
}

describe("alocarNumero", () => {
  it("sucesso de primeira: devolve numero/ano", async () => {
    const admin = admFalso([null]);
    const r = await alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" });
    expect(r).toEqual({ numero: 7, ano: 2026 });
  });

  it("colisão (23505) tenta de novo até 5 vezes e então sucede", async () => {
    const admin = admFalso([{ code: "23505" }, { code: "23505" }, null]);
    const r = await alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" });
    expect(r).toEqual({ numero: 7, ano: 2026 });
  });

  it("5 colisões seguidas: desiste e lança erro reconhecível", async () => {
    const admin = admFalso(Array(5).fill({ code: "23505" }));
    await expect(alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" })).rejects.toThrow(
      /numero_indisponivel/,
    );
  });

  it("erro que NÃO é 23505 propaga sem retry", async () => {
    const admin = admFalso([{ code: "42P01" }]);
    await expect(alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" })).rejects.toBeTruthy();
  });
});
```

- [ ] **Passo 7: implementar `alocarNumero`**

```ts
// lib/propostas/numeracao.ts
import type { SupabaseClient } from "@supabase/supabase-js";

const TENTATIVAS_MAX = 5;

/**
 * Aloca numero/ano NA MESMA transação lógica do envio: lê o próximo número
 * via `fn_proposta_aloca_numero` e tenta o UPDATE que marca a proposta como
 * `enviada` com esse número. Se outra proposta pegou o mesmo número entre a
 * leitura e a escrita (23505 do índice único parcial), tenta de novo — é o
 * padrão de idempotência que o repositório já usa (Idempotency-Key, mensagem
 * WhatsApp). NÃO usa advisory lock: a spec só pede "captura de 23505 e nova
 * tentativa", e um lock explícito seria escopo que ninguém pediu.
 */
export async function alocarNumero(
  admin: SupabaseClient,
  input: { orgId: string; propostaId: string },
): Promise<{ numero: number; ano: number }> {
  const ano = new Date().getFullYear();

  for (let tentativa = 0; tentativa < TENTATIVAS_MAX; tentativa++) {
    const { data: numero, error: numeroErr } = await admin.rpc("fn_proposta_aloca_numero", {
      p_org: input.orgId,
      p_ano: ano,
    });
    if (numeroErr) throw numeroErr;

    const { data, error } = await admin
      .from("crm_proposals")
      .update({ numero, ano, status: "enviada" })
      .eq("id", input.propostaId)
      .eq("organization_id", input.orgId)
      .is("numero", null)
      .select("id, numero, ano")
      .single();

    if (!error) return { numero: data.numero as number, ano: data.ano as number };
    if ((error as { code?: string }).code !== "23505") throw error;
    // colisão: outra proposta pegou este número entre a leitura e a escrita — tenta de novo.
  }

  throw new Error("numero_indisponivel: 5 tentativas de alocação colidiram");
}
```

- [ ] **Passo 8: rodar e confirmar verde**

```bash
npx vitest run lib/propostas/numeracao.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `4 passed`.

- [ ] **Passo 9: teste de versão (vermelho)**

```ts
// lib/propostas/versao.test.ts
import { describe, expect, it } from "vitest";
import { decidirVersao } from "./versao";
import type { ProposalRow } from "./tipos";

function proposta(over: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "p1", organization_id: "org-1", lead_id: "lead-1", status: "rascunho",
    numero: null, ano: null, versao: 1, substitui_id: null, revision: 1, total_cents: 1000,
    ...over,
  };
}

describe("decidirVersao", () => {
  it("editar um RASCUNHO: PATCH no mesmo registro, sem nova versão", () => {
    const r = decidirVersao(proposta({ status: "rascunho" }));
    expect(r).toEqual({ tipo: "patch_no_mesmo" });
  });

  it("revisar uma proposta ENVIADA: cria v2 herdando numero/ano, v1 vira substituida", () => {
    const r = decidirVersao(proposta({ status: "enviada", numero: 42, ano: 2026, versao: 1 }));
    expect(r).toEqual({
      tipo: "nova_versao",
      herdaNumero: 42, herdaAno: 2026, novaVersao: 2, substituiId: "p1",
    });
  });

  it("revisar uma proposta ACEITA ou RECUSADA: recusado — não é rascunho nem enviada", () => {
    expect(() => decidirVersao(proposta({ status: "aceita" }))).toThrow(/status_nao_editavel/);
    expect(() => decidirVersao(proposta({ status: "recusada" }))).toThrow(/status_nao_editavel/);
  });

  it("v3 a partir de v2: incrementa a partir da versão ATUAL, não sempre 2", () => {
    const r = decidirVersao(proposta({ status: "enviada", numero: 42, ano: 2026, versao: 2 }));
    expect(r).toMatchObject({ novaVersao: 3 });
  });
});
```

- [ ] **Passo 10: implementar `decidirVersao`**

```ts
// lib/propostas/versao.ts
import type { ProposalRow } from "./tipos";

export type DecisaoDeVersao =
  | { tipo: "patch_no_mesmo" }
  | { tipo: "nova_versao"; herdaNumero: number; herdaAno: number; novaVersao: number; substituiId: string };

/**
 * Rascunho: edita no lugar (spec §5.4 — "revisar um rascunho não cria
 * versão"). Enviada: revisar cria v2, que HERDA numero/ano da v1 — "a
 * conversa com o cliente é sobre a 0042, não sobre dois documentos". Aceita,
 * recusada, vencida, cancelada, substituida: não são editáveis por este
 * caminho — a UI oferece "duplicar" para recomeçar do zero, não "editar".
 */
export function decidirVersao(atual: ProposalRow): DecisaoDeVersao {
  if (atual.status === "rascunho") return { tipo: "patch_no_mesmo" };
  if (atual.status === "enviada") {
    if (atual.numero === null || atual.ano === null) {
      throw new Error("estado_inconsistente: proposta enviada sem numero/ano");
    }
    return {
      tipo: "nova_versao",
      herdaNumero: atual.numero,
      herdaAno: atual.ano,
      novaVersao: atual.versao + 1,
      substituiId: atual.id,
    };
  }
  throw new Error(`status_nao_editavel: ${atual.status}`);
}
```

- [ ] **Passo 11: rodar e confirmar verde**

```bash
npx vitest run lib/propostas/versao.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `5 passed`.

- [ ] **Passo 12: SABOTAGEM (G14) no ponto de maior risco — `calcularTotal`**

Remova só o `Math.max(0, ...)`. Previsão: **1 caso cai** ("nunca devolve negativo"). Rode, confira,
restaure.

- [ ] **Passo 13: commit**

```bash
git add lib/propostas/tipos.ts lib/propostas/total.ts lib/propostas/total.test.ts lib/propostas/numeracao.ts lib/propostas/numeracao.test.ts lib/propostas/versao.ts lib/propostas/versao.test.ts
git commit -m "feat(proposta): dominio puro — total, numeracao, versao

calcularTotal (item trava em zero, nunca total negativo), alocarNumero
(retry em 23505, 5 tentativas, sem advisory lock — a spec so pede
captura e nova tentativa) e decidirVersao (rascunho edita no lugar,
enviada cria v2 herdando numero/ano da v1).

Sabotagem: remover o piso de calcularTotal derruba 1 de 4 casos.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 5 — Rota: criar rascunho e listar

**Files:**
- Criar: `app/api/v1/proposals/route.ts` + `route.test.ts`
- Criar: `lib/schemas/propostas.ts`

**Interfaces:**
- Consome: `calcularTotal` (Tarefa 4), `requireRole`, `ok`/`fail`, `audit`.
- Produz: `POST /api/v1/proposals` (cria rascunho vazio ou com itens), `GET /api/v1/proposals` (lista, paginada por cursor no padrão do repo).

- [ ] **Passo 1: schema compartilhado tela+rota (padrão `lib/schemas/produtos.ts`)**

```ts
// lib/schemas/propostas.ts
import { z } from "zod";

export const propostaItemSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid().nullable(),
  descricao: z.string().trim().min(1).max(500),
  quantidade: z.number().positive(),
  preco_unitario_cents: z.number().int().nonnegative(),
  desconto_cents: z.number().int().nonnegative().default(0),
  position: z.number(),
});

export const propostaCreateSchema = z.object({
  lead_id: z.string().uuid(),
  titulo: z.string().trim().min(1).max(200),
  condicoes: z.string().max(4000).nullable().optional(),
  valid_until: z.string().date().nullable().optional(),
  itens: z.array(propostaItemSchema).default([]),
});
export type PropostaCreateInput = z.infer<typeof propostaCreateSchema>;
```

- [ ] **Passo 2: teste da rota (vermelho)**

```ts
// app/api/v1/proposals/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * POST cria rascunho com status='rascunho', numero/ano NULL, total calculado
 * dos itens enviados. GET lista as da organização ativa.
 */
describe("POST /api/v1/proposals", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("cria com status rascunho, numero/ano nulos, total calculado", async () => {
    const mundo = montarMundoDeProposta();
    const res = await mundo.POST({
      lead_id: mundo.leadId,
      titulo: "Site institucional",
      itens: [{ product_id: null, descricao: "Site", quantidade: 1, preco_unitario_cents: 800000, desconto_cents: 0, position: 1000 }],
    });
    expect(res.status).toBe(201);
    const criada = mundo.propostasCriadas.at(-1);
    expect(criada?.status).toBe("rascunho");
    expect(criada?.numero).toBeNull();
    expect(criada?.total_cents).toBe(800000);
  });

  it("rejeita lead de OUTRA organização (422/404, nunca 500 silencioso)", async () => {
    const mundo = montarMundoDeProposta({ leadPertenceAOutraOrg: true });
    const res = await mundo.POST({ lead_id: mundo.leadId, titulo: "x", itens: [] });
    expect([404, 422]).toContain(res.status);
    expect(mundo.propostasCriadas).toHaveLength(0);
  });

  it("papel viewer não cria (403)", async () => {
    const mundo = montarMundoDeProposta({ papel: "viewer" });
    const res = await mundo.POST({ lead_id: mundo.leadId, titulo: "x", itens: [] });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/proposals", () => {
  it("lista só as propostas da organização ativa", async () => {
    const mundo = montarMundoDeProposta();
    const res = await mundo.GET();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
```

- [ ] **Passo 3: rodar, conferir vermelho, implementar a rota**

```ts
// app/api/v1/proposals/route.ts
/**
 * GET  /api/v1/proposals — lista as propostas da organização ativa.
 * POST /api/v1/proposals — cria um RASCUNHO. numero/ano nascem NULL (spec
 * §5.3): só são alocados no envio (Tarefa 14), para rascunho descartado não
 * queimar número.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { calcularTotal } from "@/lib/propostas/total";
import { propostaCreateSchema } from "@/lib/schemas/propostas";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const status = req.nextUrl.searchParams.get("status");
  let q = supabase
    .from("crm_proposals")
    .select("id, lead_id, titulo, status, total_cents, moeda, numero, ano, versao, valid_until, created_at")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return fail("internal_error", "Falha ao listar propostas.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = propostaCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const input = parsed.data;
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, contact_id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", input.lead_id)
    .maybeSingle();
  if (!lead) return fail("not_found", t("Negócio não encontrado nesta organização."), 404, { requestId });

  const totalCents = calcularTotal(input.itens);

  const { data: proposta, error: propErr } = await supabase
    .from("crm_proposals")
    .insert({
      organization_id: authz.org.orgId,
      lead_id: input.lead_id,
      contact_id: lead.contact_id,
      titulo: input.titulo,
      condicoes: input.condicoes ?? null,
      valid_until: input.valid_until ?? null,
      total_cents: totalCents,
      status: "rascunho",
    })
    .select("id")
    .single();
  if (propErr || !proposta) return fail("internal_error", t("Falha ao criar a proposta."), 500, { requestId });

  if (input.itens.length > 0) {
    const { error: itensErr } = await supabase.from("crm_proposal_items").insert(
      input.itens.map((it) => ({
        proposal_id: proposta.id,
        product_id: it.product_id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unitario_cents: it.preco_unitario_cents,
        desconto_cents: it.desconto_cents,
        position: it.position,
      })),
    );
    if (itensErr) return fail("internal_error", t("Falha ao gravar os itens."), 500, { requestId });
  }

  await supabase.from("crm_lead_activities").insert({
    organization_id: authz.org.orgId,
    lead_id: input.lead_id,
    contact_id: lead.contact_id,
    source_module: "proposals",
    source_id: proposta.id,
    type: "proposal_drafted",
    payload: {},
  });

  void audit({
    action: "proposal.drafted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_proposals",
    resourceId: proposta.id,
    requestId,
  });

  return ok({ id: proposta.id }, { requestId, status: 201 });
}
```

> **Nota:** confira o schema exato de `crm_lead_activities` (colunas `source_module`/`source_id`)
> antes de colar — foi medido na Tarefa base mas confirme com `grep -n "create table.*crm_lead_activities" -A15 supabase/baseline.sql` caso tenha mudado.

- [ ] **Passo 4: rodar e confirmar verde**

```bash
npx vitest run app/api/v1/proposals/route.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `4 passed`.

- [ ] **Passo 5: commit**

```bash
git add app/api/v1/proposals/route.ts app/api/v1/proposals/route.test.ts lib/schemas/propostas.ts
git commit -m "feat(proposta): rota de criar rascunho e listar

POST cria com status=rascunho, numero/ano NULL, total calculado dos
itens. GET lista org-scoped. Schema compartilhado em
lib/schemas/propostas.ts para a tela reusar (Tarefa 8).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 6 — Rota: editar rascunho (revisão otimista)

**Files:**
- Criar: `app/api/v1/proposals/[id]/route.ts` + `route.test.ts`

**Interfaces:**
- Consome: `calcularTotal`, `decidirVersao` (Tarefa 4).
- Produz: `GET /api/v1/proposals/[id]` (detalhe + itens), `PATCH /api/v1/proposals/[id]` (substitui itens/campos, exige `revision` — mesmo padrão de `fn_reply_action`, sem precisar de função SQL própria: um UPDATE condicional em `revision` já resolve).

- [ ] **Passo 1: teste (vermelho)**

```ts
// app/api/v1/proposals/[id]/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("PATCH /api/v1/proposals/[id]", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("com revision correta: substitui itens, recalcula total, incrementa revision", async () => {
    const mundo = montarMundoDeEdicao({ revisionAtual: 1 });
    const res = await mundo.PATCH({
      revision: 1,
      titulo: "Site institucional v2",
      itens: [{ product_id: null, descricao: "Site", quantidade: 1, preco_unitario_cents: 700000, desconto_cents: 0, position: 1000 }],
    });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada?.total_cents).toBe(700000);
    expect(mundo.propostaAtualizada?.revision).toBe(2);
  });

  it("com revision desatualizada: 409, nada muda", async () => {
    const mundo = montarMundoDeEdicao({ revisionAtual: 3 });
    const res = await mundo.PATCH({ revision: 1, itens: [] });
    expect(res.status).toBe(409);
    expect(mundo.propostaAtualizada).toBeNull();
  });

  it("proposta status=enviada: PATCH recusado (edite via revisão, não aqui)", async () => {
    const mundo = montarMundoDeEdicao({ revisionAtual: 1, status: "enviada" });
    const res = await mundo.PATCH({ revision: 1, itens: [] });
    expect(res.status).toBe(409);
  });

  it("itens de outra proposta não são tocados (isolamento por proposal_id)", async () => {
    const mundo = montarMundoDeEdicao({ revisionAtual: 1 });
    await mundo.PATCH({ revision: 1, itens: [{ product_id: null, descricao: "novo", quantidade: 1, preco_unitario_cents: 100, desconto_cents: 0, position: 1000 }] });
    expect(mundo.itensDeOutraPropostaForamTocados()).toBe(false);
  });
});
```

- [ ] **Passo 2: implementar**

```ts
// app/api/v1/proposals/[id]/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { calcularTotal } from "@/lib/propostas/total";
import { propostaItemSchema } from "@/lib/schemas/propostas";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  revision: z.number().int().positive(),
  titulo: z.string().trim().min(1).max(200).optional(),
  condicoes: z.string().max(4000).nullable().optional(),
  valid_until: z.string().date().nullable().optional(),
  itens: z.array(propostaItemSchema),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: proposta } = await supabase
    .from("crm_proposals")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", "Proposta não encontrada.", 404, { requestId });

  const { data: itens } = await supabase
    .from("crm_proposal_items")
    .select("*")
    .eq("proposal_id", id)
    .order("position", { ascending: true });

  return ok({ ...proposta, itens: itens ?? [] }, { requestId });
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const input = parsed.data;
  const supabase = await createClient();
  const totalCents = calcularTotal(input.itens);

  // UPDATE condicional em `revision` + `status='rascunho'` na MESMA query:
  // se a linha não voltar, ou a revision estava velha, ou não é mais
  // rascunho — os dois casos são 409 "a proposta mudou" para quem chama, sem
  // precisar de uma segunda query para distinguir o motivo (evita
  // TOCTOU entre o select de diagnóstico e o update).
  const { data: proposta, error } = await supabase
    .from("crm_proposals")
    .update({
      titulo: input.titulo, condicoes: input.condicoes, valid_until: input.valid_until,
      total_cents: totalCents, revision: input.revision + 1,
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("revision", input.revision)
    .eq("status", "rascunho")
    .select("id, revision")
    .maybeSingle();

  if (error) return fail("internal_error", t("Falha ao editar a proposta."), 500, { requestId });
  if (!proposta) {
    return fail(
      "proposal_context_stale",
      t("A proposta mudou (ou não está mais em rascunho). Recarregue antes de editar."),
      409,
      { requestId },
    );
  }

  // Substitui os itens inteiros — mais simples que CRUD granular por item, e
  // ainda cobre "editar itens" (adicionar/remover/mudar preço) numa única
  // chamada. Delete-then-insert dentro do mesmo request; se a corrida
  // importar mais tarde, mover para uma RPC transacional é o próximo passo,
  // não este.
  await supabase.from("crm_proposal_items").delete().eq("proposal_id", id);
  if (input.itens.length > 0) {
    await supabase.from("crm_proposal_items").insert(
      input.itens.map((it) => ({
        proposal_id: id, product_id: it.product_id, descricao: it.descricao,
        quantidade: it.quantidade, preco_unitario_cents: it.preco_unitario_cents,
        desconto_cents: it.desconto_cents, position: it.position,
      })),
    );
  }

  void audit({
    action: "proposal.edited", actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "crm_proposals", resourceId: id, requestId,
  });

  return ok({ id, revision: proposta.revision, total_cents: totalCents }, { requestId });
}
```

- [ ] **Passo 3: rodar e confirmar verde**

```bash
npx vitest run app/api/v1/proposals/\[id\]/route.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `4 passed` (GET + os 4 do PATCH, conferir a contagem real do arquivo).

- [ ] **Passo 4: SABOTAGEM (G14)**

Remova só `.eq("status", "rascunho")` do PATCH. Previsão: **1 caso cai** ("status=enviada: PATCH
recusado"). Rode, confira, restaure.

- [ ] **Passo 5: commit**

```bash
git add app/api/v1/proposals/\[id\]/route.ts app/api/v1/proposals/\[id\]/route.test.ts
git commit -m "feat(proposta): rota de detalhe e edicao do rascunho

PATCH substitui itens+campos numa unica chamada, com revision otimista
(UPDATE condicional em revision+status='rascunho' — sem select de
diagnostico previo, evita TOCTOU). enviada/aceita/etc nao editam por
aqui.

Sabotagem: tirar o filtro de status derruba 1 de 4 casos.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 7 — Porta na navegação + tela de lista

**Files:**
- Modificar: `lib/navigation/catalogo.ts`
- Criar: `app/app/proposals/page.tsx`, `app/app/proposals/_client.tsx`

**Interfaces:**
- Consome: `GET /api/v1/proposals` (Tarefa 5).
- Produz: rota `/app/proposals` navegável.

- [ ] **Passo 1: entrada no `NAV_CATALOG`**

Copiando o padrão exato de `/app/products` (medido: `lib/navigation/catalogo.ts:212-225`):

```ts
{
  href: "/app/proposals",
  label: "Propostas",
  description: "Rascunhe, revise e envie propostas comerciais — do orçamento ao aceite.",
  icon: "FileText",
  group: "crm",
  section: "Fechar a venda",
},
```

Confirme com `grep -n "\"Storefront\"\|icon:" lib/navigation/catalogo.ts | head -5` que `icon`
aceita string livre de nome de ícone (Lucide) — se houver união fechada de ícones válidos, use um
já usado no arquivo em vez de inventar `"FileText"`.

- [ ] **Passo 2: Server Component**

```tsx
// app/app/proposals/page.tsx
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveActiveOrg } from "@/lib/auth/resolve-active-org";
import { ProposalsClient } from "./_client";

export default async function ProposalsPage() {
  await requireAuth();
  await resolveActiveOrg();
  return <ProposalsClient />;
}
```

> **Nota:** confira as importações reais (`requireAuth`/`resolveActiveOrg`) contra
> `app/app/settings/tenant/agenda/page.tsx:1-20` (medido) antes de colar — pode haver um wrapper
> único que já faz as duas coisas.

- [ ] **Passo 3: Client Component — lista**

```tsx
// app/app/proposals/_client.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import { formatarCentavos } from "@/lib/money";

interface PropostaResumo {
  id: string; titulo: string; status: string; total_cents: number; moeda: string;
  numero: number | null; ano: number | null; versao: number; created_at: string;
}

export function ProposalsClient() {
  const [propostas, setPropostas] = useState<PropostaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    apiClient.get<PropostaResumo[]>("/api/v1/proposals")
      .then((res) => setPropostas(res.data))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) return <div className="p-6">Carregando…</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Propostas</h1>
        <Link href="/app/proposals/novo" className="btn-primary">Nova proposta</Link>
      </div>
      <table className="w-full text-sm">
        <thead><tr><th>Número</th><th>Título</th><th>Status</th><th>Valor</th></tr></thead>
        <tbody>
          {propostas.map((p) => (
            <tr key={p.id}>
              <td>{p.numero ? `${String(p.numero).padStart(4, "0")}/${p.ano} v${p.versao}` : "Rascunho"}</td>
              <td><Link href={`/app/proposals/${p.id}`}>{p.titulo}</Link></td>
              <td>{p.status}</td>
              <td>{formatarCentavos(p.total_cents, p.moeda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> **Nota:** confira `apiClient` (`@/lib/api/client`, ou o nome real do wrapper de fetch usado pelo
> repositório — medir com `grep -rln "apiClient\|useApiClient" components/inbox/composer/` antes
> de colar) e `formatarCentavos`/`lib/money.ts` — use os utilitários reais em vez de inventar.

- [ ] **Passo 4: commit**

```bash
git add lib/navigation/catalogo.ts app/app/proposals/page.tsx app/app/proposals/_client.tsx
git commit -m "feat(proposta): porta na navegacao e tela de lista

/app/proposals entra no grupo crm, secao 'Fechar a venda' — vizinha de
/app/products ('Preparar a venda'). Prova em tela na Tarefa 20.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 8 — Tela do editor manual

**Files:**
- Criar: `app/app/proposals/[id]/page.tsx`, `app/app/proposals/[id]/_client.tsx`

**Interfaces:**
- Consome: `GET/PATCH /api/v1/proposals/[id]` (Tarefa 6), `GET /api/v1/products?busca=` (já existe, medido).
- Produz: editor com itens do catálogo OU à mão, total recalculado no cliente e conferido pelo servidor.

- [ ] **Passo 1: Client Component do editor**

```tsx
// app/app/proposals/[id]/_client.tsx
"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { propostaItemSchema } from "@/lib/schemas/propostas";
import type { z } from "zod";

type Item = z.infer<typeof propostaItemSchema>;
interface Proposta {
  id: string; titulo: string; condicoes: string | null; valid_until: string | null;
  status: string; revision: number; total_cents: number; itens: Item[];
}

export function ProposalEditorClient({ id }: { id: string }) {
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<Proposta>(`/api/v1/proposals/${id}`).then((res) => setProposta(res.data));
  }, [id]);

  if (!proposta) return <div className="p-6">Carregando…</div>;

  const total = proposta.itens.reduce(
    (acc, it) => acc + Math.max(0, Math.round(it.quantidade * it.preco_unitario_cents) - it.desconto_cents),
    0,
  );

  function atualizarItem(idx: number, patch: Partial<Item>) {
    setProposta((p) => p && { ...p, itens: p.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  }

  function adicionarItemManual() {
    setProposta((p) => p && {
      ...p,
      itens: [...p.itens, {
        product_id: null, descricao: "", quantidade: 1, preco_unitario_cents: 0,
        desconto_cents: 0, position: (p.itens.at(-1)?.position ?? 0) + 1000,
      }],
    });
  }

  async function salvar() {
    if (!proposta) return;
    setSalvando(true); setErro(null);
    try {
      const res = await apiClient.patch(`/api/v1/proposals/${id}`, {
        revision: proposta.revision, titulo: proposta.titulo,
        condicoes: proposta.condicoes, valid_until: proposta.valid_until, itens: proposta.itens,
      });
      setProposta((p) => p && { ...p, revision: res.data.revision, total_cents: res.data.total_cents });
    } catch (e) {
      setErro("A proposta mudou desde que você abriu. Recarregue antes de editar.");
    } finally {
      setSalvando(false);
    }
  }

  const editavel = proposta.status === "rascunho";

  return (
    <div className="p-6 space-y-4">
      <input
        className="text-xl font-semibold w-full"
        value={proposta.titulo}
        disabled={!editavel}
        onChange={(e) => setProposta((p) => p && { ...p, titulo: e.target.value })}
      />
      {erro && <p className="text-red-600">{erro}</p>}
      <table className="w-full text-sm">
        <thead><tr><th>Descrição</th><th>Qtd</th><th>Preço</th><th>Desconto</th></tr></thead>
        <tbody>
          {proposta.itens.map((it, idx) => (
            <tr key={it.id ?? idx}>
              <td><input value={it.descricao} disabled={!editavel} onChange={(e) => atualizarItem(idx, { descricao: e.target.value })} /></td>
              <td><input type="number" value={it.quantidade} disabled={!editavel} onChange={(e) => atualizarItem(idx, { quantidade: Number(e.target.value) })} /></td>
              <td><input type="number" value={it.preco_unitario_cents / 100} disabled={!editavel} onChange={(e) => atualizarItem(idx, { preco_unitario_cents: Math.round(Number(e.target.value) * 100) })} /></td>
              <td><input type="number" value={it.desconto_cents / 100} disabled={!editavel} onChange={(e) => atualizarItem(idx, { desconto_cents: Math.round(Number(e.target.value) * 100) })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editavel && <button onClick={adicionarItemManual}>+ Item à mão</button>}
      <p className="font-semibold">Total: {(total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
      {editavel && <button disabled={salvando} onClick={salvar}>Salvar</button>}
    </div>
  );
}
```

> **Nota — busca no catálogo:** o botão "+ Item do catálogo" (além do "+ Item à mão" acima) chama
> `GET /api/v1/products?busca=<texto>` (medido, `app/api/v1/products/route.ts`) e preenche
> `product_id`/`descricao`/`preco_unitario_cents` a partir do produto escolhido — implemente como
> um segundo modal/dropdown simples; o contrato da rota já existe e não precisa de nada novo no
> backend.

- [ ] **Passo 2: Server Component**

```tsx
// app/app/proposals/[id]/page.tsx
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveActiveOrg } from "@/lib/auth/resolve-active-org";
import { ProposalEditorClient } from "./_client";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  await resolveActiveOrg();
  const { id } = await params;
  return <ProposalEditorClient id={id} />;
}
```

- [ ] **Passo 3: commit**

```bash
git add app/app/proposals/\[id\]/page.tsx app/app/proposals/\[id\]/_client.tsx
git commit -m "feat(proposta): editor manual — itens do catalogo ou a mao, total

Campos ficam desabilitados fora de status=rascunho. Salvar manda
revision e recebe 409 com mensagem clara se a proposta mudou. Prova em
tela na Tarefa 20 — inclusive em banco fresco SEM catalogo nenhum
(criterio de aceite §12, Onda 1 da spec).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---
# Tarefa 9 — Assistente: gerarMudancas() + aplicarMudancas() (mecanismo novo — G20/G24)

**Por que é desenho novo, não extensão de `ai_reply_drafts` (G20):** medido — o único precedente de
"IA + revisão humana" no repo (`fn_reply_action`) sempre reescreve o `body` inteiro como texto
livre. A spec exige o oposto: "o assistente devolve MUDANÇAS, nunca uma proposta reescrita" (§6.2).

**G24 — CORREÇÃO DE MEDIÇÃO ANTES DE DESPACHAR (2026-09-17):** a primeira versão desta tarefa usava
`generateObject` do pacote `ai` diretamente. Medição pré-execução achou que isso é ERRADO para este
repositório: **toda** chamada de IA do produto passa por `runModelCall`
(`lib/agent-engine/edge/llm/run-model-call.ts`), que resolve credencial BYOK da organização,
aplica o orçamento (`aplicarOrcamento`/`LlmBudgetExceededError`), passa pelo `fetch` contido na
allowlist de egress (anti-SSRF), e grava a chamada em `llm_calls` (é o que alimenta a aba
"Execuções" da tela do agente). `runModelCall` só expõe `generateText` — não existe `generateObject`
dentro dessa camada. Chamar `generateObject` direto **bypassaria** BYOK, orçamento e a allowlist de
egress — seria reintroduzir, de propósito, o mesmo tipo de furo que o `checkDailyLimit`/
`espacarEnvio` (G19) evita para envio de mensagem. A saída estruturada aqui é obtida por
**tool-calling forçado por instrução**, dentro de `runModelCall`, com uma única tool cujo `execute`
apenas ecoa o argumento — é o mesmo padrão de `tool()` já usado em `lib/agent-engine/agent/inbound-turn.ts`
(ex. `rawTools.schedule_followup`, linha ~3234).

**Precedente medido de rota Next.js comum (fora do turno do agente) chamando `runModelCall`:**
`app/api/v1/ai/routers/[id]/test/route.ts` — usa `getSkillsPool()` (`lib/ai/skills/db.ts`, um
`pg.Pool` singleton fora do agent-engine) + `llmEdgeConfigFromEnv(env)` (`lib/agent-engine/edge/llm/credentials.ts`).
Copie esse par exato.

**Files:**
- Criar: `lib/propostas/assistente.ts` + `lib/propostas/assistente.test.ts`

**Interfaces:**
- Consome: `runModelCall`, `LlmBudgetExceededError`, `LlmProviderUnknownError`, `LlmModelNotEnabledError`
  (`lib/agent-engine/edge/llm/run-model-call.ts`); `llmEdgeConfigFromEnv` (`./credentials`);
  `getSkillsPool` (`lib/ai/skills/db.ts`); `ProposalItemInput` (Tarefa 4).
- Produz: `gerarMudancas(input)` (I/O — chama o modelo via `runModelCall`, pode lançar as três
  classes de erro acima), `aplicarMudancas(estado, mudancas)` (puro, sem mudança de desenho).

- [ ] **Passo 1: MEDIR antes de escrever qualquer linha (obrigatório — G da doutrina do Paulo)**

```bash
grep -n "^export function llmEdgeConfigFromEnv\|^export.*LlmEdgeConfig" lib/agent-engine/edge/llm/credentials.ts
grep -n "= tool({" -A 10 lib/agent-engine/agent/inbound-turn.ts | head -20
```

Já medidos e fechados ANTES de escrever este plano (não repita): (a) o campo do argumento validado
de uma tool-call é `.input` (`StaticToolCall<TOOLS>` em `node_modules/ai/dist/index.d.ts`, pacote
`ai@7.0.96`) — **não** `.args`; (b) `runModelCall` aceita `tools: ToolSet` livremente (`tools?:
ToolSet` na interface `RunModelCallInput`). Confirme só o que os dois comandos acima cobrem: a
assinatura exata de `llmEdgeConfigFromEnv` e o formato de `tool({...})` (`inputSchema`) — copiado
de um uso real no próprio arquivo.

- [ ] **Passo 2: schema da tool e tipos**

```ts
// lib/propostas/assistente.ts (parte 1 — schema e tipos)
import { z } from "zod";
import { tool, type ModelMessage } from "@/lib/agent-engine/edge/llm/run-model-call";
import type { ProposalItemInput } from "./tipos";

export const mudancaSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("editar_item"),
    item_id: z.string(),
    campo: z.enum(["descricao", "quantidade", "preco_unitario_cents", "desconto_cents"]),
    de: z.union([z.string(), z.number()]),
    para: z.union([z.string(), z.number()]),
  }),
  z.object({
    tipo: z.literal("remover_item"),
    item_id: z.string(),
    descricao: z.string(),
  }),
  z.object({
    tipo: z.literal("editar_proposta"),
    campo: z.enum(["valid_until", "condicoes", "titulo"]),
    de: z.string().nullable(),
    para: z.string(),
  }),
]);
export type Mudanca = z.infer<typeof mudancaSchema>;

const respostaShape = {
  mudancas: z.array(mudancaSchema)
    .describe("As mudanças pedidas pela instrução — SÓ elas, nada que não foi pedido."),
  nao_entendido: z.string().nullable()
    .describe("Preenchido quando a instrução não descreve uma mudança nesta proposta."),
};

export interface EstadoDaProposta {
  titulo: string;
  condicoes: string | null;
  valid_until: string | null;
  itens: Array<ProposalItemInput & { id: string }>;
}
```

> **Nota:** se o Passo 1 confirmar que `tool()` espera `inputSchema` (não `parameters`), a chamada
> no Passo 4 já usa o nome certo. Se for `parameters`, troque só essa chave.

- [ ] **Passo 3: teste de `aplicarMudancas` — puro, IDÊNTICO à primeira versão desta tarefa (sem mudança de desenho)**

```ts
// lib/propostas/assistente.test.ts
import { describe, expect, it, vi } from "vitest";
import { aplicarMudancas } from "./assistente";
import type { EstadoDaProposta } from "./assistente";

function estado(): EstadoDaProposta {
  return {
    titulo: "Site institucional", condicoes: null, valid_until: "2026-10-01",
    itens: [
      { id: "item-1", product_id: null, descricao: "Site institucional", quantidade: 1, preco_unitario_cents: 800000, desconto_cents: 0, position: 1000 },
      { id: "item-2", product_id: null, descricao: "Hospedagem anual", quantidade: 1, preco_unitario_cents: 120000, desconto_cents: 0, position: 2000 },
    ],
  };
}

describe("aplicarMudancas", () => {
  it("editar_item muda só o campo pedido, mais nada", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_item", item_id: "item-1", campo: "preco_unitario_cents", de: 800000, para: 720000 },
    ]);
    expect(r.itens.find((i) => i.id === "item-1")?.preco_unitario_cents).toBe(720000);
    expect(r.itens.find((i) => i.id === "item-2")?.preco_unitario_cents).toBe(120000);
  });

  it("remover_item tira o item da lista", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "remover_item", item_id: "item-2", descricao: "Hospedagem anual" },
    ]);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]?.id).toBe("item-1");
  });

  it("editar_proposta muda titulo/condicoes/valid_until", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_proposta", campo: "valid_until", de: "2026-10-01", para: "2026-10-31" },
    ]);
    expect(r.valid_until).toBe("2026-10-31");
  });

  it("mudanca referenciando item_id inexistente é IGNORADA, não lança", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_item", item_id: "item-999", campo: "preco_unitario_cents", de: 1, para: 2 },
    ]);
    expect(r).toEqual(estado());
  });

  it("lista vazia de mudancas devolve o estado idêntico", () => {
    expect(aplicarMudancas(estado(), [])).toEqual(estado());
  });

  it("duas mudancas no MESMO item aplicam em sequência, não se pisam", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_item", item_id: "item-1", campo: "preco_unitario_cents", de: 800000, para: 720000 },
      { tipo: "editar_item", item_id: "item-1", campo: "quantidade", de: 1, para: 2 },
    ]);
    const item = r.itens.find((i) => i.id === "item-1");
    expect(item?.preco_unitario_cents).toBe(720000);
    expect(item?.quantidade).toBe(2);
  });
});
```

- [ ] **Passo 4: rodar, conferir vermelho, implementar `aplicarMudancas`**

```bash
npx vitest run lib/propostas/assistente.test.ts 2>&1 | grep -aE "Tests |Errors "
```

```ts
// lib/propostas/assistente.ts (parte 2 — aplicação pura, sem mudança de desenho)

/**
 * Aplica uma lista de mudanças JÁ REVISADAS pela pessoa (vindas do POST
 * .../assistant, nunca geradas de novo aqui). Item referenciado que não
 * existe mais é IGNORADO — silencioso de propósito (rascunho pode ter mudado
 * entre gerar e aplicar; a revision otimista da Tarefa 10 cobre o resto).
 */
export function aplicarMudancas(estado: EstadoDaProposta, mudancas: readonly Mudanca[]): EstadoDaProposta {
  let novo: EstadoDaProposta = { ...estado, itens: estado.itens.map((it) => ({ ...it })) };

  for (const m of mudancas) {
    if (m.tipo === "editar_item") {
      const idx = novo.itens.findIndex((it) => it.id === m.item_id);
      if (idx === -1) continue;
      const item = novo.itens[idx]!;
      const valor = m.campo === "descricao" ? String(m.para) : Number(m.para);
      novo = { ...novo, itens: novo.itens.map((it, i) => (i === idx ? { ...item, [m.campo]: valor } : it)) };
    } else if (m.tipo === "remover_item") {
      novo = { ...novo, itens: novo.itens.filter((it) => it.id !== m.item_id) };
    } else if (m.tipo === "editar_proposta") {
      novo = { ...novo, [m.campo]: m.para };
    }
  }
  return novo;
}
```

```bash
npx vitest run lib/propostas/assistente.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `6 passed`.

- [ ] **Passo 5: teste de `gerarMudancas` — mocka `runModelCall` (vermelho)**

```ts
// acrescentar ao mesmo arquivo de teste
import { gerarMudancas } from "./assistente";

vi.mock("@/lib/agent-engine/edge/llm/run-model-call", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agent-engine/edge/llm/run-model-call")>();
  return { ...real, runModelCall: vi.fn() };
});

describe("gerarMudancas", () => {
  it("monta a chamada com tenantId/purpose corretos e devolve o argumento da tool-call", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({
      result: {
        toolCalls: [{
          toolName: "propor_mudancas",
          input: { mudancas: [{ tipo: "editar_item", item_id: "item-1", campo: "preco_unitario_cents", de: 800000, para: 720000 }], nao_entendido: null },
        }],
      },
    } as never);

    const r = await gerarMudancas({
      instrucao: "baixa 10% no site", estado: estado(),
      pool: {} as never, cfg: {} as never, tenantId: "org-1",
    });

    expect(r.mudancas).toHaveLength(1);
    expect(vi.mocked(runModelCall)).toHaveBeenCalledWith(
      {}, {}, expect.objectContaining({ tenantId: "org-1", purpose: "proposal_assistant" }),
    );
  });

  it("modelo não chama a tool (instrucao ambigua): mudancas vazia, nao_entendido preenchido", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({ result: { toolCalls: [] } } as never);

    const r = await gerarMudancas({
      instrucao: "manda para o financeiro", estado: estado(),
      pool: {} as never, cfg: {} as never, tenantId: "org-1",
    });
    expect(r.mudancas).toHaveLength(0);
    expect(r.nao_entendido).not.toBeNull();
  });

  it("orcamento estourado: o erro de runModelCall SOBE, não é engolido aqui", async () => {
    const { runModelCall, LlmBudgetExceededError } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockRejectedValue(new LlmBudgetExceededError());

    await expect(gerarMudancas({
      instrucao: "baixa 10%", estado: estado(), pool: {} as never, cfg: {} as never, tenantId: "org-1",
    })).rejects.toThrow(/orçamento/);
  });
});
```

- [ ] **Passo 6: implementar `gerarMudancas`**

```ts
// lib/propostas/assistente.ts (parte 3 — geração via IA, tool-calling forçado)
import type pg from "pg";
import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";

function promptDoEstado(estado: EstadoDaProposta): string {
  const itens = estado.itens
    .map((it) => `- [${it.id}] ${it.descricao} — qtd ${it.quantidade} × R$ ${(it.preco_unitario_cents / 100).toFixed(2)}, desconto R$ ${(it.desconto_cents / 100).toFixed(2)}`)
    .join("\n");
  return [
    `Proposta atual:`,
    `Título: ${estado.titulo}`,
    `Validade: ${estado.valid_until ?? "não definida"}`,
    `Condições: ${estado.condicoes ?? "nenhuma"}`,
    `Itens:`,
    itens,
  ].join("\n");
}

export async function gerarMudancas(input: {
  instrucao: string;
  estado: EstadoDaProposta;
  pool: pg.Pool;
  cfg: LlmEdgeConfig;
  tenantId: string;
}): Promise<{ mudancas: Mudanca[]; nao_entendido: string | null }> {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: `${promptDoEstado(input.estado)}\n\nInstrução do usuário: ${input.instrucao}\n\nChame a ferramenta propor_mudancas SEMPRE, mesmo se a instrução não descrever nenhuma mudança válida — nesse caso, mudancas: [] e explique em nao_entendido.`,
    },
  ];

  const { result } = await runModelCall(input.pool, input.cfg, {
    tenantId: input.tenantId,
    purpose: "proposal_assistant",
    system:
      "Você ajusta uma proposta comercial a partir de uma instrução curta, usando a ferramenta " +
      "propor_mudancas. Devolva só as mudanças pedidas — nunca mexa em item ou campo que a " +
      "instrução não mencionou.",
    messages,
    tools: {
      propor_mudancas: tool({
        inputSchema: z.object(respostaShape),
        execute: async (args) => args,
      }),
    },
  });

  // Single-step (sem maxSteps — default do SDK é 1 step): result.toolCalls do
  // topo é seguro aqui, ao contrário do caso multi-step do turno do agente
  // (ver aviso em lib/agent-engine/agent/operator-turn.ts:154).
  const chamada = result.toolCalls?.find((c) => c.toolName === "propor_mudancas");
  if (!chamada) {
    return { mudancas: [], nao_entendido: "O assistente não conseguiu interpretar esta instrução." };
  }
  const parsed = z.object(respostaShape).safeParse(chamada.input);
  if (!parsed.success) {
    return { mudancas: [], nao_entendido: "O assistente devolveu um formato inesperado." };
  }
  return parsed.data;
}
```

> **`.input` confirmado na fonte** (não `.args`): `StaticToolCall<TOOLS>` em
> `node_modules/ai/dist/index.d.ts` (pacote `ai@7.0.96` instalado) declara `input:
> InferToolInput<TOOLS[NAME]>` — medido em 2026-09-17, sem incerteza restante nesta tarefa.

- [ ] **Passo 7: rodar e confirmar verde**

```bash
npx vitest run lib/propostas/assistente.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `9 passed`.

- [ ] **Passo 8: SABOTAGEM (G14) — dois pontos**

**(a)** Em `aplicarMudancas`, troque `(i === idx ? { ...item, [m.campo]: valor } : it)` por aplicar
a todos os itens. Previsão: **1 caso cai** ("edita só o campo pedido"). Restaure.

**(b)** Em `gerarMudancas`, remova o `if (!chamada) { return ...}`. Previsão: **1 caso cai**
("modelo não chama a tool: mudancas vazia") — a chamada com `toolCalls: []` lançaria em vez de
devolver o fallback. Restaure.

- [ ] **Passo 9: commit**

```bash
git add lib/propostas/assistente.ts lib/propostas/assistente.test.ts
git commit -m "feat(proposta): assistente por instrucao — via runModelCall, nao generateObject solto

Mecanismo novo (nao ha precedente de diff estruturado no repo). Usa
runModelCall + tool-calling forcado (single-step) em vez de
generateObject direto — reusa BYOK, orcamento (LlmBudgetExceededError),
allowlist de egress e auditoria em llm_calls, que generateObject solto
bypassaria. aplicarMudancas puro, ignora item_id que nao existe mais.

Sabotagem: (a) aplicar mudanca em todos os itens derruba 1 caso; (b)
tirar o fallback de 'tool nao chamada' derruba 1 caso.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 10 — Rotas do assistente: gerar / aplicar

**G24 (mesma correção da Tarefa 9):** esta tarefa NÃO tem mais um módulo `lib/propostas/orcamento.ts`
próprio nem uma função `disponibilidadeDoAssistente`. `runModelCall` já aplica o orçamento da
organização internamente (`aplicarOrcamento`) e lança `LlmBudgetExceededError` ANTES de qualquer
byte sair para o provedor — a rota só precisa capturar essa exceção (e as duas de config) e devolver
`{disponivel: false, motivo}`, nunca checar orçamento por conta própria.

**Files:**
- Criar: `app/api/v1/proposals/[id]/assistant/route.ts` + `route.test.ts`
- Criar: `app/api/v1/proposals/[id]/assistant/apply/route.ts` + `route.test.ts`

**Interfaces:**
- Consome: `gerarMudancas`, `aplicarMudancas`, `mudancaSchema` (Tarefa 9); `getSkillsPool`,
  `llmEdgeConfigFromEnv`, `LlmBudgetExceededError`, `LlmProviderUnknownError`,
  `LlmModelNotEnabledError`.
- Produz: `POST .../assistant` (gera, não aplica), `POST .../assistant/apply` (aplica a lista
  devolvida, com revision otimista).

- [ ] **Passo 1: teste da rota de gerar (vermelho)**

```ts
// app/api/v1/proposals/[id]/assistant/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("POST /api/v1/proposals/[id]/assistant", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("orcamento estourado (LlmBudgetExceededError): 200 com disponivel=false, motivo da mensagem do erro", async () => {
    const mundo = montarMundoDeAssistente({ lancarNoGerar: "orcamento" });
    const res = await mundo.POST({ instrucao: "baixa 10%" });
    expect(res.status).toBe(200);
    expect(res.body.data.disponivel).toBe(false);
    expect(res.body.data.motivo).toMatch(/orçamento/);
  });

  it("com sucesso: devolve a lista de mudanças, NÃO aplica nada no banco", async () => {
    const mundo = montarMundoDeAssistente({});
    const res = await mundo.POST({ instrucao: "baixa 10%" });
    expect(res.status).toBe(200);
    expect(res.body.data.disponivel).toBe(true);
    expect(res.body.data.mudancas.length).toBeGreaterThan(0);
    expect(mundo.propostaFoiEscrita()).toBe(false);
  });

  it("proposta que não é rascunho: 409, NÃO chama gerarMudancas (custo zero)", async () => {
    const mundo = montarMundoDeAssistente({ status: "enviada" });
    const res = await mundo.POST({ instrucao: "baixa 10%" });
    expect(res.status).toBe(409);
    expect(mundo.gerarMudancasChamado).toBe(false);
  });
});
```

- [ ] **Passo 2: implementar a rota de gerar**

```ts
// app/api/v1/proposals/[id]/assistant/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { LlmBudgetExceededError, LlmProviderUnknownError, LlmModelNotEnabledError } from "@/lib/agent-engine/edge/llm/run-model-call";
import { getSkillsPool } from "@/lib/ai/skills/db";
import { gerarMudancas, type EstadoDaProposta } from "@/lib/propostas/assistente";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
const bodySchema = z.object({ instrucao: z.string().trim().min(1).max(500) });
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });

  const supabase = await createClient();
  const { data: proposta } = await supabase
    .from("crm_proposals")
    .select("titulo, condicoes, valid_until, status, revision")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });
  if (proposta.status !== "rascunho") {
    return fail("proposal_context_stale", t("Só é possível ajustar um rascunho."), 409, { requestId });
  }

  const { data: itens } = await supabase
    .from("crm_proposal_items")
    .select("id, product_id, descricao, quantidade, preco_unitario_cents, desconto_cents, position")
    .eq("proposal_id", id)
    .order("position");

  const estado: EstadoDaProposta = {
    titulo: proposta.titulo, condicoes: proposta.condicoes, valid_until: proposta.valid_until,
    itens: itens ?? [],
  };

  try {
    const resultado = await gerarMudancas({
      instrucao: parsed.data.instrucao, estado,
      pool: getSkillsPool(), cfg: llmEdgeConfigFromEnv(env), tenantId: authz.org.orgId,
    });
    return ok({ disponivel: true, motivo: null, ...resultado, revision: proposta.revision }, { requestId });
  } catch (err) {
    if (err instanceof LlmBudgetExceededError || err instanceof LlmProviderUnknownError || err instanceof LlmModelNotEnabledError) {
      return ok({ disponivel: false, motivo: err.message, mudancas: [], nao_entendido: null, revision: proposta.revision }, { requestId });
    }
    throw err;
  }
}
```

- [ ] **Passo 3: rodar e confirmar verde**

```bash
npx vitest run app/api/v1/proposals/\[id\]/assistant/route.test.ts 2>&1 | grep -aE "Tests "
```

- [ ] **Passo 4: rota de aplicar — IDÊNTICA em desenho à versão anterior (não muda com G24, ela nunca chamava IA)**

```ts
// app/api/v1/proposals/[id]/assistant/apply/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { calcularTotal } from "@/lib/propostas/total";
import { aplicarMudancas, mudancaSchema, type EstadoDaProposta } from "@/lib/propostas/assistente";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
const bodySchema = z.object({
  revision: z.number().int().positive(),
  mudancas: z.array(mudancaSchema),
});
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });
  if (parsed.data.mudancas.length === 0) {
    return fail("validation_failed", t("Nenhuma mudança para aplicar."), 422, { requestId });
  }

  const supabase = await createClient();
  const { data: proposta } = await supabase
    .from("crm_proposals")
    .select("titulo, condicoes, valid_until, status, revision")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });
  if (proposta.status !== "rascunho" || proposta.revision !== parsed.data.revision) {
    return fail("proposal_context_stale", t("A proposta mudou. Gere as sugestões de novo."), 409, { requestId });
  }

  const { data: itens } = await supabase
    .from("crm_proposal_items")
    .select("id, product_id, descricao, quantidade, preco_unitario_cents, desconto_cents, position")
    .eq("proposal_id", id)
    .order("position");

  const estadoAntes: EstadoDaProposta = {
    titulo: proposta.titulo, condicoes: proposta.condicoes, valid_until: proposta.valid_until,
    itens: itens ?? [],
  };
  const estadoDepois = aplicarMudancas(estadoAntes, parsed.data.mudancas);
  const totalCents = calcularTotal(estadoDepois.itens);

  const { data: atualizada, error } = await supabase
    .from("crm_proposals")
    .update({
      titulo: estadoDepois.titulo, condicoes: estadoDepois.condicoes, valid_until: estadoDepois.valid_until,
      total_cents: totalCents, revision: parsed.data.revision + 1,
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("revision", parsed.data.revision)
    .select("id, revision")
    .maybeSingle();
  if (error || !atualizada) {
    return fail("proposal_context_stale", t("A proposta mudou. Gere as sugestões de novo."), 409, { requestId });
  }

  await supabase.from("crm_proposal_items").delete().eq("proposal_id", id);
  if (estadoDepois.itens.length > 0) {
    await supabase.from("crm_proposal_items").insert(
      estadoDepois.itens.map((it) => ({
        proposal_id: id, product_id: it.product_id, descricao: it.descricao,
        quantidade: it.quantidade, preco_unitario_cents: it.preco_unitario_cents,
        desconto_cents: it.desconto_cents, position: it.position,
      })),
    );
  }

  const { data: lead } = await supabase.from("crm_proposals").select("lead_id, contact_id").eq("id", id).single();
  await supabase.from("crm_lead_activities").insert({
    organization_id: authz.org.orgId, lead_id: lead?.lead_id, contact_id: lead?.contact_id,
    source_module: "proposals", source_id: id, type: "proposal_drafted",
    payload: { via: "assistant", mudancas: parsed.data.mudancas },
  });

  void audit({
    action: "proposal.assistant_applied", actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "crm_proposals", resourceId: id, requestId,
    metadata: { quantidade_de_mudancas: parsed.data.mudancas.length },
  });

  return ok({ id, revision: atualizada.revision, total_cents: totalCents }, { requestId });
}
```

- [ ] **Passo 5: teste da rota de aplicar (vermelho → verde)**

```ts
// app/api/v1/proposals/[id]/assistant/apply/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("POST /api/v1/proposals/[id]/assistant/apply", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("aplica a lista recebida (não gera de novo) e incrementa revision", async () => {
    const mundo = montarMundoDeAplicar({ revisionAtual: 1 });
    const res = await mundo.POST({
      revision: 1,
      mudancas: [{ tipo: "editar_item", item_id: mundo.itemId, campo: "preco_unitario_cents", de: 800000, para: 720000 }],
    });
    expect(res.status).toBe(200);
    expect(mundo.gerarMudancasChamadoDeNovo).toBe(false);
    expect(mundo.itemAtualizado?.preco_unitario_cents).toBe(720000);
  });

  it("revision desatualizada: 409, nada aplicado", async () => {
    const mundo = montarMundoDeAplicar({ revisionAtual: 5 });
    const res = await mundo.POST({ revision: 1, mudancas: [{ tipo: "editar_proposta", campo: "titulo", de: "x", para: "y" }] });
    expect(res.status).toBe(409);
    expect(mundo.itemAtualizado).toBeNull();
  });

  it("lista vazia de mudancas: 422", async () => {
    const mundo = montarMundoDeAplicar({ revisionAtual: 1 });
    const res = await mundo.POST({ revision: 1, mudancas: [] });
    expect(res.status).toBe(422);
  });
});
```

```bash
npx vitest run app/api/v1/proposals/\[id\]/assistant/ 2>&1 | grep -aE "Tests "
```

- [ ] **Passo 6: SABOTAGEM (G14)**

Na rota de aplicar, remova `.eq("revision", parsed.data.revision)` do UPDATE. Previsão: **1 caso
cai** ("revision desatualizada: 409"). Restaure.

- [ ] **Passo 7: commit**

```bash
git add app/api/v1/proposals/\[id\]/assistant/
git commit -m "feat(proposta): rotas do assistente — gerar via runModelCall, aplicar separado

Gerar chama runModelCall (BYOK/orcamento/egress/auditoria da org) e
NUNCA escreve no banco. Sem orcamento (LlmBudgetExceededError), a rota
devolve disponivel=false com a mensagem do proprio erro — nao reimplementa
checagem de orcamento (runModelCall ja aplica). Aplicar recebe a LISTA
que a pessoa viu, com revision otimista.

Sabotagem: tirar o filtro de revision do apply derruba 1 caso.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 11 — UI do assistente: instrução, preview antes/depois, aplicar/descartar

**Files:**
- Criar: `app/app/proposals/[id]/_components/AssistantPanel.tsx`
- Modificar: `app/app/proposals/[id]/_client.tsx` (monta o painel ao lado do editor)

**Interfaces:**
- Consome: `POST .../assistant`, `POST .../assistant/apply` (Tarefa 10).

- [ ] **Passo 1: o painel**

```tsx
// app/app/proposals/[id]/_components/AssistantPanel.tsx
"use client";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";

interface Mudanca {
  tipo: "editar_item" | "remover_item" | "editar_proposta";
  item_id?: string; campo?: string; de: string | number | null; para: string | number;
  descricao?: string;
}

export function AssistantPanel({
  propostaId, revision, onAplicado,
}: { propostaId: string; revision: number; onAplicado: (r: { revision: number; total_cents: number }) => void }) {
  const [instrucao, setInstrucao] = useState("");
  const [gerando, setGerando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [preview, setPreview] = useState<{ mudancas: Mudanca[]; disponivel: boolean; motivo: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    if (!instrucao.trim()) return;
    setGerando(true); setErro(null); setPreview(null);
    try {
      const res = await apiClient.post(`/api/v1/proposals/${propostaId}/assistant`, { instrucao });
      setPreview(res.data);
    } catch {
      setErro("Não consegui gerar as mudanças agora.");
    } finally {
      setGerando(false);
    }
  }

  async function aplicar() {
    if (!preview) return;
    setAplicando(true); setErro(null);
    try {
      const res = await apiClient.post(`/api/v1/proposals/${propostaId}/assistant/apply`, {
        revision, mudancas: preview.mudancas,
      });
      onAplicado(res.data);
      setPreview(null);
      setInstrucao("");
    } catch {
      setErro("A proposta mudou desde que você gerou as sugestões — gere de novo.");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="border rounded p-4 space-y-3">
      <h2 className="font-semibold">Assistente</h2>
      <div className="flex gap-2">
        <input
          className="flex-1"
          placeholder='Ex.: "baixa 10% e tira a hospedagem"'
          value={instrucao}
          onChange={(e) => setInstrucao(e.target.value)}
          disabled={gerando}
        />
        <button onClick={gerar} disabled={gerando || !instrucao.trim()}>Gerar</button>
      </div>
      {erro && <p className="text-red-600">{erro}</p>}
      {preview && !preview.disponivel && <p className="text-gray-500">{preview.motivo}</p>}
      {preview && preview.disponivel && preview.mudancas.length === 0 && (
        <p className="text-gray-500">Não entendi o que mudar nesta proposta.</p>
      )}
      {preview && preview.mudancas.length > 0 && (
        <div className="space-y-2">
          <ul className="text-sm space-y-1">
            {preview.mudancas.map((m, i) => (
              <li key={i}>
                {m.tipo === "remover_item" && <span>item "{m.descricao}" → REMOVIDO</span>}
                {m.tipo === "editar_item" && <span>{m.campo}: {String(m.de)} → {String(m.para)}</span>}
                {m.tipo === "editar_proposta" && <span>{m.campo}: {String(m.de ?? "(sem mudança)")} → {String(m.para)}</span>}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={aplicar} disabled={aplicando}>Aplicar</button>
            <button onClick={() => setPreview(null)} disabled={aplicando}>Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: montar no editor**

Em `app/app/proposals/[id]/_client.tsx`, dentro de `ProposalEditorClient`, logo abaixo da tabela de
itens (só quando `editavel`):

```tsx
{editavel && (
  <AssistantPanel
    propostaId={id}
    revision={proposta.revision}
    onAplicado={(r) => {
      setProposta((p) => p && { ...p, revision: r.revision, total_cents: r.total_cents });
      // recarrega a proposta inteira para refletir os itens que o assistente mudou
      apiClient.get<Proposta>(`/api/v1/proposals/${id}`).then((res) => setProposta(res.data));
    }}
  />
)}
```

E o import `import { AssistantPanel } from "./_components/AssistantPanel";` no topo.

- [ ] **Passo 3: commit**

```bash
git add app/app/proposals/\[id\]/_components/AssistantPanel.tsx app/app/proposals/\[id\]/_client.tsx
git commit -m "feat(proposta): UI do assistente — preview antes/depois

Nada aplica sem o clique em Aplicar. Sem orcamento, mostra o motivo e o
editor manual continua ao lado, funcionando. Prova em tela na Tarefa
20: 'baixa 10%' muda so o pedido; instrucao ambigua nao inventa mudanca.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 12 — PDF com a marca da organização

**Files:**
- Criar: `lib/propostas/pdf.tsx` + `lib/propostas/pdf.test.ts`
- Criar: `lib/propostas/storage.ts`

**Interfaces:**
- Consome: `resolverMarcaDaOrganizacao` (G17 — nunca `lib/lgpd/pdf-renderer.tsx`).
- Produz: `renderPropostaPdf(dados)` → `Buffer`; `salvarPdfDaProposta(admin, {orgId, propostaId, buffer})` → `{path, signedUrl}`.

- [ ] **Passo 1: teste do componente (vermelho)**

```ts
// lib/propostas/pdf.test.ts
import { describe, expect, it } from "vitest";
import { renderPropostaPdf } from "./pdf";

describe("renderPropostaPdf", () => {
  it("devolve um Buffer que começa com o header de PDF (%PDF)", async () => {
    const buf = await renderPropostaPdf({
      titulo: "Site institucional", numero: 42, ano: 2026, versao: 1,
      condicoes: "50% na entrada", validUntil: "2026-10-01",
      itens: [{ descricao: "Site", quantidade: 1, precoUnitarioCents: 800000, descontoCents: 0 }],
      totalCents: 800000, moeda: "BRL",
      marca: { app_name: "Acme", accent_hex: "#0EA5E9", logo_path: null },
      destinatario: { nome: "Cliente Teste", email: null, telefone: null },
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("sem imagem_url no item, não quebra (layout fecha sem buraco)", async () => {
    const buf = await renderPropostaPdf({
      titulo: "x", numero: null, ano: null, versao: 1, condicoes: null, validUntil: null,
      itens: [{ descricao: "Serviço", quantidade: 1, precoUnitarioCents: 100, descontoCents: 0 }],
      totalCents: 100, moeda: "BRL",
      marca: { app_name: null, accent_hex: null, logo_path: null },
      destinatario: { nome: "Cliente", email: null, telefone: null },
    });
    expect(buf.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Passo 2: implementar — componente novo, NUNCA estender `lib/lgpd/pdf-renderer.tsx` (G17)**

```tsx
// lib/propostas/pdf.tsx
import { Document, Page, StyleSheet, Text, View, Image, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  titulo: { fontSize: 16, fontWeight: 700 },
  linhaItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5 },
  total: { marginTop: 12, fontSize: 12, fontWeight: 700, textAlign: "right" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 8, color: "#666" },
});

interface ItemPdf { descricao: string; quantidade: number; precoUnitarioCents: number; descontoCents: number; imagemUrl?: string | null }
export interface PropostaPdfInput {
  titulo: string; numero: number | null; ano: number | null; versao: number;
  condicoes: string | null; validUntil: string | null;
  itens: ItemPdf[]; totalCents: number; moeda: string;
  marca: { app_name: string | null; accent_hex: string | null; logo_path: string | null };
  destinatario: { nome: string; email: string | null; telefone: string | null };
}

function moeda(cents: number, iso: string): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: iso });
}

function PropostaPdfDoc({ d }: { d: PropostaPdfInput }): React.ReactElement {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.titulo}>{d.titulo}</Text>
            {d.numero && <Text>Proposta {String(d.numero).padStart(4, "0")}/{d.ano}{d.versao > 1 ? ` — v${d.versao}` : ""}</Text>}
          </View>
          {/* logo_path é caminho no bucket, resolvido para URL ANTES de chegar aqui — ver Passo 3 */}
          {d.marca.app_name && <Text>{d.marca.app_name}</Text>}
        </View>

        <Text>Para: {d.destinatario.nome}</Text>

        <View style={{ marginTop: 16 }}>
          {d.itens.map((it, i) => (
            <View key={i} style={styles.linhaItem}>
              <Text>{it.descricao} (x{it.quantidade})</Text>
              <Text>{moeda(it.quantidade * it.precoUnitarioCents - it.descontoCents, d.moeda)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.total}>Total: {moeda(d.totalCents, d.moeda)}</Text>

        {d.validUntil && <Text style={{ marginTop: 8 }}>Válida até {d.validUntil}</Text>}
        {d.condicoes && <Text style={{ marginTop: 8 }}>{d.condicoes}</Text>}

        <View style={styles.footer} fixed>
          <Text>{d.marca.app_name ?? "Proposta comercial"}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPropostaPdf(input: PropostaPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<PropostaPdfDoc d={input} />);
  return buf as Buffer;
}
```

> **Nota — logo:** `marca.logo_path` é caminho no bucket (medido, `resolverMarcaDaOrganizacao`),
> não URL. A rota de envio (Tarefa 14), antes de chamar `renderPropostaPdf`, resolve o path para
> uma signed URL via o mesmo mecanismo de `lib/branding/logo.ts` (medir a assinatura exata nessa
> tarefa) e passa a URL pronta — este componente não faz I/O.

- [ ] **Passo 3: storage**

```ts
// lib/propostas/storage.ts
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "propostas";

/** Upload + signed URL — mesmo padrão de `workers/lgpd-export-worker.ts` (bucket lgpd-exports). */
export async function salvarPdfDaProposta(
  admin: SupabaseClient,
  input: { orgId: string; propostaId: string; buffer: Buffer },
): Promise<{ path: string; signedUrl: string }> {
  const path = `${input.orgId}/${input.propostaId}.pdf`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, input.buffer, { contentType: "application/pdf", upsert: true });
  if (uploadErr) throw new Error(`proposta_pdf_upload_failed: ${uploadErr.message}`);

  const { data: signed, error: signedErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 dias — tempo de a mensagem chegar e o WAHA baixar
  if (signedErr || !signed) throw new Error(`proposta_pdf_signed_url_failed: ${signedErr?.message ?? "no_url"}`);

  return { path, signedUrl: signed.signedUrl };
}
```

- [ ] **Passo 4: rodar e confirmar verde**

```bash
npx vitest run lib/propostas/pdf.test.ts 2>&1 | grep -aE "Tests "
```

- [ ] **Passo 5: commit**

```bash
git add lib/propostas/pdf.tsx lib/propostas/pdf.test.ts lib/propostas/storage.ts
git commit -m "feat(proposta): PDF com a marca da ORGANIZACAO, bucket privado

Componente novo — NAO estende lib/lgpd/pdf-renderer.tsx, que e
deliberadamente sem marca (documento juridico, ver cabecalho daquele
arquivo). Layout fecha sem buraco quando o item nao tem imagem.
Storage no mesmo padrao do worker de export LGPD.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 13 — Chave nova na versão do agente + ferramenta `crm_draft_proposal`

**Decisão de design (G23):** ferramenta MCP auto-injetada por chave, não hook no turno. Copia
exatamente o padrão medido de `leadFieldsEnabled → crm_update_lead` (`lib/ai/runtime/tools.ts:395-399`).

**Files:**
- Criar: `supabase/migrations/<timestamp>_<NNNN>_proposta_ai_draft_enabled.sql` (NNNN medido no Passo 0 — NÃO use `0280`, esse número está desatualizado, ver G3)
- Modificar: `supabase/baseline.sql`, `supabase/migrations/MANIFEST.md`
- Criar: `lib/mcp/tools/propostas.ts` + `lib/mcp/tools/propostas.test.ts`
- Modificar: `lib/ai/runtime/tools.ts`
- Modificar: `app/app/ai/agents/[id]/_components/AgentForm.tsx`, `_actions.ts`

**Interfaces:**
- Consome: `pickToolsFromMcp` (padrão de auto-injeção).
- Produz: ferramenta `crm_draft_proposal(lead_id, titulo, itens)` → cria rascunho com `drafted_by_agent_id` preenchido.

- [ ] **Passo 0: medir o NNNN real ANTES de nomear o arquivo (G3 — obrigatório, não pule)**

```bash
ls supabase/migrations/*.sql | sed -E 's/.*_([0-9]{4})_.*/\1/' | sort -n | tail -1
```

O número deste plano (`0280`) foi escrito antes da Tarefa 0 medir de novo e achar `0274` como
maior real (não `0278` como o plano supunha) — a Tarefa 0 saiu como `0275`. Use o valor medido
AGORA + 1, também confira se outra tarefa deste mesmo dispatch já reservou o seguinte.

- [ ] **Passo 1: migration da chave**

```sql
-- <timestamp>_<NNNN>_proposta_ai_draft_enabled.sql — NNNN do Passo 0
--
-- default TRUE, de propósito (spec §16 decisão 3 + §15.1, linhas 578-583):
-- "quem ligou Propostas quer proposta; obrigar a achar uma segunda chave é o
-- jeito de o recurso morrer desligado". Não confundir com a capacidade
-- "Propostas" da ORGANIZAÇÃO (Tarefa 16), que nasce DESLIGADA — são dois
-- níveis diferentes, e só o de cima (organização) nasce off.
alter table public.ai_agent_versions
  add column if not exists proposal_ai_draft_enabled boolean not null default true;
comment on column public.ai_agent_versions.proposal_ai_draft_enabled is
  'O agente pode rascunhar uma proposta sozinho quando ligado. Default TRUE dentro de quem ligou a capacidade "Propostas" — a pessoa sempre revisa e envia (spec §3, §16 decisão 3).';
```

Cole o mesmo bloco no apêndice do `baseline.sql`, rotulado
`-- ---- o agente pode rascunhar proposta sozinho (migration <NNNN>) ----`, e a linha no MANIFEST.
**Antes de colar**, releia como a Tarefa 0 resolveu o caso de constraint reconstruída em bloco
único (`tests/unit/baseline-constraint-reconstruida.test.ts`) — esta migration só adiciona coluna
nova (`add column if not exists`), não mexe em nenhum CHECK existente, então não deve ter o mesmo
problema, mas confirme lendo o comentário que a Tarefa 0 deixou no baseline antes de assumir.

- [ ] **Passo 2: teste da ferramenta (vermelho)**

```ts
// lib/mcp/tools/propostas.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { crmDraftProposal } from "./propostas";

describe("crm_draft_proposal", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("cria rascunho com drafted_by_agent_id preenchido", async () => {
    const mundo = montarMundoDeFerramenta();
    const r = await crmDraftProposal.handler(
      { titulo: "Orçamento site", itens: [{ descricao: "Site", quantidade: 1, preco_unitario_cents: 500000 }] },
      mundo.ctx,
    );
    expect(r.error).toBeUndefined();
    expect(mundo.propostaCriada?.drafted_by_agent_id).toBe(mundo.ctx.agentId);
    expect(mundo.propostaCriada?.status).toBe("rascunho");
  });

  it("sem negócio resolvido na conversa (negocioDaConversa 'nenhum'): erro devolvido ao modelo, NUNCA exceção (G17 da doutrina)", async () => {
    const mundo = montarMundoDeFerramenta({ negocio: { tipo: "nenhum" } });
    const r = await crmDraftProposal.handler({ titulo: "x", itens: [] }, mundo.ctx);
    expect(r.error).toBeDefined();
    expect(mundo.propostaCriada).toBeNull();
  });
});
```

- [ ] **Passo 3: implementar a ferramenta**

```ts
// lib/mcp/tools/propostas.ts
import { z } from "zod";
import { negocioDaConversa } from "@/lib/agent-engine/edge/crm/negocio-da-conversa";
import { calcularTotal } from "@/lib/propostas/total";
import type { McpToolDefinition } from "@/lib/mcp/types";

const itemShape = {
  descricao: z.string().min(1).max(500),
  quantidade: z.number().positive().default(1),
  preco_unitario_cents: z.number().int().nonnegative(),
};

const draftProposalInputShape = {
  titulo: z.string().min(1).max(200)
    .describe("Título curto da proposta, ex.: 'Orçamento site institucional'."),
  itens: z.array(z.object(itemShape)).min(1)
    .describe("Itens do que está sendo oferecido, cada um com descrição, quantidade e preço em centavos."),
};

export const crmDraftProposal: McpToolDefinition<typeof draftProposalInputShape> = {
  name: "crm_draft_proposal",
  description:
    "Rascunha uma proposta comercial para o negócio desta conversa. NUNCA envia — só cria o " +
    "rascunho para uma pessoa revisar e enviar depois. Use quando o cliente pedir orçamento ou " +
    "proposta e você já souber o que oferecer.",
  inputSchema: draftProposalInputShape,
  handler: async (input, ctx) => {
    const negocio = await negocioDaConversa(ctx.db, { tenantId: ctx.organizationId, contactId: ctx.contactId });
    if (negocio.tipo !== "um") {
      return { error: "Não há um único negócio aberto nesta conversa para vincular a proposta." };
    }

    const itens = input.itens.map((it, i) => ({ ...it, desconto_cents: 0, position: (i + 1) * 1000, product_id: null }));
    const totalCents = calcularTotal(itens);

    const { data: proposta, error } = await ctx.admin
      .from("crm_proposals")
      .insert({
        organization_id: ctx.organizationId, lead_id: negocio.leadId, contact_id: ctx.contactId,
        conversation_id: ctx.conversationId ?? null, titulo: input.titulo, total_cents: totalCents,
        status: "rascunho", drafted_by_agent_id: ctx.agentId,
      })
      .select("id")
      .single();
    if (error || !proposta) return { error: "Não foi possível criar o rascunho agora." };

    await ctx.admin.from("crm_proposal_items").insert(
      itens.map((it) => ({ proposal_id: proposta.id, ...it })),
    );

    return { proposal_id: proposta.id, total_cents: totalCents };
  },
};
```

> **Nota:** confira a assinatura real de `McpToolDefinition` e do objeto `ctx` (`admin`, `db`,
> `organizationId`, `contactId`, `conversationId`, `agentId`) contra outra ferramenta existente do
> pacote `vender` (ex. `lib/mcp/tools/catalogo/agendamento.ts`) antes de colar — os nomes exatos
> dos campos de `ctx` podem diferir do que este plano assume.

- [ ] **Passo 4: registrar no catálogo, pacote `vender`**

Onde as ferramentas são catalogadas (mesmo lugar de `agendamento.ts:176`), adicione
`crmDraftProposal` com `pacotes: ["vender"]`.

- [ ] **Passo 5: auto-injeção por chave — copiar o padrão de `handoffToolEnabled`**

**Correção 2026-09-17:** o precedente original citado (`leadFieldsEnabled`) não existe neste
worktree — confirme com `grep -c "leadFieldsEnabled" lib/ai/runtime/tools.ts` (deve dar 0). O
precedente real, medido, é `handoffToolEnabled` → `crm_request_human_handoff`.

Em `lib/ai/runtime/tools.ts`, logo após o bloco de auto-injeção do handoff (linha ~257-264, dentro
de `pickToolsFromMcp`):

```ts
  if (input.proposalAiDraftEnabled && !result["crm_draft_proposal"]) {
    const draft = allTools.find((t) => t.name === "crm_draft_proposal");
    if (draft) {
      result["crm_draft_proposal"] = wrapMcpTool(draft, input);
    }
  }
```

Adicione `proposalAiDraftEnabled: boolean` à interface de input de `pickToolsFromMcp` (confira o
nome exato dela no arquivo — pode não se chamar `PickToolsInput` neste worktree, meça antes de
escrever) e propague de onde `handoffToolEnabled` já é lido da versão publicada do agente até
aqui (mesmo caminho — `grep -n "handoffToolEnabled" lib/ai/runtime/tools.ts` para achar todos os
pontos de propagação, não só o de auto-injeção).

- [ ] **Passo 6: toggle na tela do agente**

**Correção 2026-09-17:** mesmo problema — `lead_fields_enabled` não existe em
`app/app/ai/agents/[id]/_components/AgentForm.tsx` neste worktree (`grep -c "lead_fields_enabled"`
dá 0). O precedente real, medido, é o bloco "Handoff" (linhas ~1122-1135): um `Card` com `Switch` +
`Label`, usando `form.handoff_tool_enabled`/`patch({ handoff_tool_enabled: v })`. Copie essa
estrutura (não precisa do `Card` inteiro nem do `HandoffKeywordsInput` que vem depois — só o padrão
`Switch` + `patch()`):

```tsx
<Switch
  id="proposal_ai_draft_enabled"
  checked={form.proposal_ai_draft_enabled}
  onCheckedChange={(v) => patch({ proposal_ai_draft_enabled: v })}
  disabled={disabled}
/>
```

Adicione `proposal_ai_draft_enabled` ao tipo do formulário (mesmo lugar onde `handoff_tool_enabled:
boolean` está declarado, ~linha 164) e ao estado inicial (~linha 230), com default
`version?.proposal_ai_draft_enabled ?? true` — **ligado**, não desligado. A spec é explícita sobre
isso (`docs/superpowers/specs/2026-09-16-proposta-comercial-design.md:578-583`): há DOIS níveis de
"nasce desligado" que não se confundem — a capacidade "Propostas" da ORGANIZAÇÃO nasce desligada
(Tarefa 16, `enabled: false` em `organizations.settings.proposals`), mas o rascunho automático da
IA, **dentro de quem já ligou Propostas**, nasce ligado: "quem ligou Propostas quer proposta;
obrigar a achar uma segunda chave é o jeito de o recurso morrer desligado". A migration do Passo 1
já reflete isso (`default true`) — não altere para `false` aqui achando que está sendo mais
conservador; seria uma contradição com a própria spec. A coluna nova entra na lista persistida por
`_actions.ts` (mesmo ponto onde `handoff_tool_enabled` é gravado, ~linha 286).

- [ ] **Passo 7: rodar e confirmar verde**

```bash
npx vitest run lib/mcp/tools/propostas.test.ts 2>&1 | grep -aE "Tests "
```

- [ ] **Passo 8: commit**

```bash
git add supabase/migrations/<timestamp>_<NNNN>_proposta_ai_draft_enabled.sql supabase/baseline.sql supabase/migrations/MANIFEST.md lib/mcp/tools/propostas.ts lib/mcp/tools/propostas.test.ts lib/ai/runtime/tools.ts app/app/ai/agents/\[id\]/_components/AgentForm.tsx app/app/ai/agents/\[id\]/_actions.ts
git commit -m "feat(proposta): agente pode rascunhar sozinho, com chave para desligar

crm_draft_proposal e ferramenta MCP auto-injetada por
proposal_ai_draft_enabled — mesmo padrao de leadFieldsEnabled. NUNCA
envia (doutrina do tempo, spec §3). Erro de negocio devolvido ao
modelo, nunca excecao (G17 do repo-mcp).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 14 — Rota de envio: numeração/versão + PDF + WAHA + value_cents

**Files:**
- Criar: `app/api/v1/proposals/[id]/send/route.ts` + `route.test.ts`

**Interfaces:**
- Consome: `alocarNumero`, `decidirVersao` (Tarefa 4); `renderPropostaPdf`, `salvarPdfDaProposta`
  (Tarefa 12); `espacarEnvio`, `adiarAteAJanelaAbrir`, `checkDailyLimit` (G19);
  `sendMessageHandler` com `type: "document"` (G16); `resolverMarcaDaOrganizacao`.
- Produz: `POST /api/v1/proposals/[id]/send` — exige `manager`/`admin`.

- [ ] **Passo 1: teste (vermelho) — o mais importante desta tarefa**

```ts
// app/api/v1/proposals/[id]/send/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("POST /api/v1/proposals/[id]/send", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("papel agent: 403, nada é enviado", async () => {
    const mundo = montarMundoDeEnvio({ papel: "agent" });
    const res = await mundo.POST();
    expect(res.status).toBe(403);
    expect(mundo.mensagemEnviada).toBe(false);
  });

  it("papel manager: aloca numero/ano, gera PDF, envia, atualiza value_cents do lead", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager" });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.numero).not.toBeNull();
    expect(mundo.mensagemEnviada).toBe(true);
    expect(mundo.leadValueCentsDepois).toBe(mundo.propostaEnviada?.total_cents);
  });

  it("revisar uma proposta JÁ enviada: cria v2, v1 vira substituida, HERDA o número", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager", propostaOriginal: { status: "enviada", numero: 42, ano: 2026, versao: 1, id: "p1" } });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.numero).toBe(42);
    expect(mundo.propostaEnviada?.versao).toBe(2);
    expect(mundo.propostaAnteriorStatus).toBe("substituida");
  });

  it("throttle: espacarEnvio, adiarAteAJanelaAbrir e checkDailyLimit são chamados ANTES do envio", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager" });
    await mundo.POST();
    expect(mundo.ordemDeChamadas).toEqual([
      "adiarAteAJanelaAbrir", "checkDailyLimit", "espacarEnvio", "sendMessageHandler",
    ]);
  });

  it("recusada/vencida/cancelada: 409, não envia", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager", propostaOriginal: { status: "recusada" } });
    const res = await mundo.POST();
    expect(res.status).toBe(409);
    expect(mundo.mensagemEnviada).toBe(false);
  });
});
```

- [ ] **Passo 2: implementar**

```ts
// app/api/v1/proposals/[id]/send/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { adiarAteAJanelaAbrir } from "@/lib/automation/janela-do-canal";
import { checkDailyLimit } from "@/lib/automation/actions/send-whatsapp"; // ou o módulo real onde mora, confirmar no Passo 0
import { espacarEnvio } from "@/lib/automation/throttle";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { alocarNumero } from "@/lib/propostas/numeracao";
import { decidirVersao } from "@/lib/propostas/versao";
import { renderPropostaPdf } from "@/lib/propostas/pdf";
import { salvarPdfDaProposta } from "@/lib/propostas/storage";
import { resolverMarcaDaOrganizacao } from "@/lib/branding/organizacao";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: proposta } = await admin
    .from("crm_proposals")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  const decisao = decidirVersao(proposta as never).catch?.(() => null) ?? decidirVersaoSegura(proposta);
  if (decisao === null) {
    return fail("proposal_context_stale", t("Esta proposta não pode ser enviada neste estado."), 409, { requestId });
  }

  const { data: itens } = await admin
    .from("crm_proposal_items")
    .select("*")
    .eq("proposal_id", id)
    .order("position");
  if (!itens || itens.length === 0) {
    return fail("validation_failed", t("A proposta não tem itens."), 422, { requestId });
  }

  const { data: lead } = await admin
    .from("crm_leads")
    .select("id, contact_id, value_cents")
    .eq("id", proposta.lead_id)
    .single();
  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name, email, phone_number")
    .eq("id", proposta.contact_id)
    .single();
  const { data: org } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .single();

  const marca = resolverMarcaDaOrganizacao(org?.settings, null, { app_name: null, accent_hex: null });

  let propostaAlvo = proposta;
  if (decisao.tipo === "nova_versao") {
    const { data: nova, error: novaErr } = await admin
      .from("crm_proposals")
      .insert({
        organization_id: authz.org.orgId, lead_id: proposta.lead_id, contact_id: proposta.contact_id,
        conversation_id: proposta.conversation_id, titulo: proposta.titulo, condicoes: proposta.condicoes,
        valid_until: proposta.valid_until, total_cents: proposta.total_cents, moeda: proposta.moeda,
        status: "rascunho", versao: decisao.novaVersao, substitui_id: decisao.substituiId,
      })
      .select("*")
      .single();
    if (novaErr || !nova) return fail("internal_error", t("Falha ao criar a nova versão."), 500, { requestId });

    await admin.from("crm_proposal_items").insert(
      itens.map((it) => ({
        proposal_id: nova.id, product_id: it.product_id, descricao: it.descricao,
        quantidade: it.quantidade, preco_unitario_cents: it.preco_unitario_cents,
        desconto_cents: it.desconto_cents, position: it.position,
      })),
    );
    await admin.from("crm_proposals").update({ status: "substituida" }).eq("id", decisao.substituiId);
    propostaAlvo = nova;
  }

  // Numeração: nova_versao herda (Tarefa 4 já resolveu o número); rascunho
  // aloca agora, na mesma "transação lógica" do envio (retry em 23505).
  const numeroEAno = decisao.tipo === "nova_versao"
    ? { numero: decisao.herdaNumero, ano: decisao.herdaAno }
    : await alocarNumero(admin, { orgId: authz.org.orgId, propostaId: propostaAlvo.id });

  const pdfBuffer = await renderPropostaPdf({
    titulo: propostaAlvo.titulo, numero: numeroEAno.numero, ano: numeroEAno.ano, versao: decisao.tipo === "nova_versao" ? decisao.novaVersao : propostaAlvo.versao,
    condicoes: propostaAlvo.condicoes, validUntil: propostaAlvo.valid_until,
    itens: itens.map((it) => ({ descricao: it.descricao, quantidade: it.quantidade, precoUnitarioCents: it.preco_unitario_cents, descontoCents: it.desconto_cents })),
    totalCents: propostaAlvo.total_cents, moeda: propostaAlvo.moeda,
    marca: { app_name: marca.appName ?? null, accent_hex: marca.accentHex ?? null, logo_path: null },
    destinatario: { nome: contato?.display_name ?? contato?.name ?? "Cliente", email: contato?.email ?? null, telefone: contato?.phone_number ?? null },
  });
  const { path: pdfPath, signedUrl } = await salvarPdfDaProposta(admin, {
    orgId: authz.org.orgId, propostaId: propostaAlvo.id, buffer: pdfBuffer,
  });

  // G19: mesmo throttle de qualquer mensagem — janela, limite diário, espaçamento.
  const { data: conversa } = await admin
    .from("conversations")
    .select("id, channel_session_id")
    .eq("organization_id", authz.org.orgId)
    .eq("contact_id", propostaAlvo.contact_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conversa) return fail("validation_failed", t("Nenhuma conversa com este contato para enviar."), 422, { requestId });

  await adiarAteAJanelaAbrir(admin, authz.org.orgId, conversa.channel_session_id);
  await checkDailyLimit(admin, authz.org.orgId, conversa.channel_session_id);
  await espacarEnvio(conversa.channel_session_id);

  const mensagem = await sendMessageHandler(admin, {
    organization_id: authz.org.orgId,
  } as never, {
    conversation_id: conversa.id, type: "document", media_url: signedUrl, media_mime: "application/pdf",
  });

  const totalDoLead = propostaAlvo.total_cents;
  await admin
    .from("crm_proposals")
    .update({
      status: "enviada", numero: numeroEAno.numero, ano: numeroEAno.ano, pdf_path: pdfPath,
      sent_at: new Date().toISOString(), sent_by_user_id: authz.user.id,
    })
    .eq("id", propostaAlvo.id);

  const valorAntes = lead?.value_cents ?? null;
  await admin.from("crm_leads").update({ value_cents: totalDoLead }).eq("id", proposta.lead_id);

  await admin.from("crm_lead_activities").insert([
    { organization_id: authz.org.orgId, lead_id: proposta.lead_id, contact_id: proposta.contact_id, source_module: "proposals", source_id: propostaAlvo.id, type: "proposal_sent", payload: { numero: numeroEAno.numero, ano: numeroEAno.ano } },
    { organization_id: authz.org.orgId, lead_id: proposta.lead_id, contact_id: proposta.contact_id, source_module: "proposals", source_id: propostaAlvo.id, type: "proposal_value_changed", payload: { de: valorAntes, para: totalDoLead } },
  ]);

  void audit({
    action: "proposal.sent", actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "crm_proposals", resourceId: propostaAlvo.id, requestId,
    metadata: { numero: numeroEAno.numero, ano: numeroEAno.ano },
  });

  return ok({ id: propostaAlvo.id, numero: numeroEAno.numero, ano: numeroEAno.ano, message_id: mensagem.id }, { requestId });
}

function decidirVersaoSegura(p: unknown) {
  try {
    // reexporta decidirVersao sem lançar até o chamador, mantendo o tipo do retorno
    // (implementação real: importar decidirVersao normalmente e usar try/catch aqui —
    // este helper existe só para o pseudo-código acima ficar legível; na implementação
    // real, chame decidirVersao(proposta) direto dentro de um try/catch no Passo 2).
    return null;
  } catch {
    return null;
  }
}
```

> ⚠️ **O trecho `decisao = decidirVersao(...).catch?.(...)` acima está ERRADO DE PROPÓSITO** — é
> um lembrete visual de que `decidirVersao` é síncrona e LANÇA (não devolve Promise). Na
> implementação real, troque por:
> ```ts
> let decisao: ReturnType<typeof decidirVersao>;
> try {
>   decisao = decidirVersao(proposta as never);
> } catch {
>   return fail("proposal_context_stale", t("Esta proposta não pode ser enviada neste estado."), 409, { requestId });
> }
> ```
> e apague a função `decidirVersaoSegura` inteira — ela não deve existir no arquivo final.

> **Notas de medição a confirmar no Passo 1 (antes de escrever):**
> - `checkDailyLimit` mora em `lib/automation/actions/send-whatsapp.ts` OU num módulo separado —
>   confirme com `grep -n "export.*checkDailyLimit" lib/automation/`.
> - `sendMessageHandler` — confirme a assinatura exata de `ctx` (primeiro argumento) com
>   `grep -n "export.*sendMessageHandler" app/api/v1/messages/_handler.ts`.
> - `resolverMarcaDaOrganizacao` devolve `MarcaResolvida` — confirme os nomes de campo
>   (`appName`/`app_name`, `accentHex`/`accent_hex`) com o tipo real antes de colar.

- [ ] **Passo 3: rodar e confirmar verde**

```bash
npx vitest run app/api/v1/proposals/\[id\]/send/route.test.ts 2>&1 | grep -aE "Tests "
```

- [ ] **Passo 4: SABOTAGEM (G14) — dois pontos de risco real**

**(a)** Remova `.eq("id", authz.org.orgId)`... não, remova a checagem de papel: troque
`requireRole("manager", ...)` por `requireRole("agent", ...)`. Previsão: **1 caso cai** ("papel
agent: 403"). Restaure.

**(b)** Remova `await espacarEnvio(...)`. Previsão: **1 caso cai** ("throttle: ... chamados ANTES
do envio" — a ordem some). Restaure.

- [ ] **Passo 5: commit**

```bash
git add app/api/v1/proposals/\[id\]/send/route.ts app/api/v1/proposals/\[id\]/send/route.test.ts
git commit -m "feat(proposta): rota de envio — manager/admin, numeracao, WAHA, value_cents

Exige manager (spec §16 decisao 2). Revisar proposta enviada cria v2
que herda o numero da v1 (que vira substituida). Mesmo throttle
anti-banimento de qualquer mensagem (janela, limite diario,
espacamento — G19). Atualiza crm_leads.value_cents e grava a mudanca
na timeline.

Sabotagem: (a) trocar manager por agent derruba 1 caso; (b) tirar
espacarEnvio derruba 1 caso (a ordem de chamadas).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 15 — UI de envio + decisão (aceite/recusa, Onda 1 manual)

**Files:**
- Criar: `app/api/v1/proposals/[id]/decide/route.ts` + `route.test.ts`
- Modificar: `app/app/proposals/[id]/_client.tsx`

**Interfaces:**
- Consome: `POST .../send` (Tarefa 14).
- Produz: `POST /api/v1/proposals/[id]/decide` — `{decisao: 'aceita'|'recusada', motivo?}`, só para
  `status='enviada'`; botão "Enviar ao cliente" e painel de decisão na tela.

- [ ] **Passo 1: teste da rota de decisão (vermelho)**

```ts
// app/api/v1/proposals/[id]/decide/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("POST /api/v1/proposals/[id]/decide", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("aceita: grava decided_at/decided_by, status=aceita, timeline registra", async () => {
    const mundo = montarMundoDeDecisao({ status: "enviada" });
    const res = await mundo.POST({ decisao: "aceita" });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada?.status).toBe("aceita");
    expect(mundo.atividadeGravada?.type).toBe("proposal_accepted");
  });

  it("recusada com motivo: grava decision_reason, value_cents do lead NÃO muda (spec §16.2)", async () => {
    const mundo = montarMundoDeDecisao({ status: "enviada", leadValueCentsAntes: 800000 });
    const res = await mundo.POST({ decisao: "recusada", motivo: "preço acima do orçamento" });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada?.decision_reason).toBe("preço acima do orçamento");
    expect(mundo.leadValueCentsDepois).toBe(800000);
  });

  it("proposta em rascunho: 409, não decide sobre o que não foi enviado", async () => {
    const mundo = montarMundoDeDecisao({ status: "rascunho" });
    const res = await mundo.POST({ decisao: "aceita" });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Passo 2: implementar**

```ts
// app/api/v1/proposals/[id]/decide/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
const bodySchema = z.object({
  decisao: z.enum(["aceita", "recusada"]),
  motivo: z.string().max(1000).optional(),
});
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });

  const supabase = await createClient();
  const { data: proposta, error } = await supabase
    .from("crm_proposals")
    .update({
      status: parsed.data.decisao, decided_at: new Date().toISOString(),
      decided_by_user_id: authz.user.id, decision_reason: parsed.data.motivo ?? null,
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("status", "enviada")
    .select("id, lead_id, contact_id")
    .maybeSingle();
  if (error) return fail("internal_error", t("Falha ao registrar a decisão."), 500, { requestId });
  if (!proposta) {
    return fail("proposal_context_stale", t("Só é possível decidir sobre uma proposta enviada."), 409, { requestId });
  }

  // value_cents do lead NÃO muda aqui (spec §16.2 — negócio perdido guarda
  // quanto valia; zerar apagaria o histórico de quanto se deixou na mesa).
  await supabase.from("crm_lead_activities").insert({
    organization_id: authz.org.orgId, lead_id: proposta.lead_id, contact_id: proposta.contact_id,
    source_module: "proposals", source_id: id,
    type: parsed.data.decisao === "aceita" ? "proposal_accepted" : "proposal_declined",
    payload: parsed.data.motivo ? { motivo: parsed.data.motivo } : {},
  });

  void audit({
    action: `proposal.${parsed.data.decisao}`, actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "crm_proposals", resourceId: id, requestId,
  });

  return ok({ id, status: parsed.data.decisao }, { requestId });
}
```

- [ ] **Passo 3: UI — botão de enviar + painel de decisão**

Em `app/app/proposals/[id]/_client.tsx`, acrescente ao componente:

```tsx
async function enviar() {
  setSalvando(true); setErro(null);
  try {
    await apiClient.post(`/api/v1/proposals/${id}/send`, {});
    apiClient.get<Proposta>(`/api/v1/proposals/${id}`).then((res) => setProposta(res.data));
  } catch {
    setErro("Não foi possível enviar. Confira se você tem papel de gestor.");
  } finally {
    setSalvando(false);
  }
}

async function decidir(decisao: "aceita" | "recusada", motivo?: string) {
  await apiClient.post(`/api/v1/proposals/${id}/decide`, { decisao, motivo });
  apiClient.get<Proposta>(`/api/v1/proposals/${id}`).then((res) => setProposta(res.data));
}
```

E na renderização:

```tsx
{proposta.status === "rascunho" && (
  <button onClick={enviar} disabled={salvando}>Enviar ao cliente</button>
)}
{proposta.status === "enviada" && (
  <div className="flex gap-2">
    <button onClick={() => decidir("aceita")}>Marcar como aceita</button>
    <button onClick={() => { const motivo = prompt("Motivo da recusa (opcional):") ?? undefined; void decidir("recusada", motivo); }}>
      Marcar como recusada
    </button>
  </div>
)}
```

- [ ] **Passo 4: rodar e confirmar verde**

```bash
npx vitest run app/api/v1/proposals/\[id\]/decide/route.test.ts 2>&1 | grep -aE "Tests "
```

- [ ] **Passo 5: commit**

```bash
git add app/api/v1/proposals/\[id\]/decide/route.ts app/api/v1/proposals/\[id\]/decide/route.test.ts app/app/proposals/\[id\]/_client.tsx
git commit -m "feat(proposta): decisao manual (Onda 1) — aceite/recusa por pessoa

So decide sobre proposta ENVIADA. value_cents do lead nao muda na
recusa/vencimento (spec §16.2 — guarda quanto se deixou na mesa).
Onda 2 (link publico de aceite) fica fora — spec ja adia (G22).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 16 — Configurações › Propostas

**Files:**
- Criar: `supabase/migrations/<timestamp>_<NNNN>_configuracoes_de_propostas.sql` (NNNN medido no Passo 0 — NÃO use `0281`, desatualizado, ver G3)
- Modificar: `supabase/baseline.sql`, `supabase/migrations/MANIFEST.md`
- Criar: `app/app/settings/tenant/proposals/page.tsx`, `_client.tsx`
- Modificar: `app/api/v1/proposals/route.ts` (POST usa a validade padrão quando `valid_until` não vem)

**Interfaces:**
- Consome: mesmo padrão de `organizations.settings` (jsonb compartilhado — CLAUDE.md avisa: nunca
  sobrescrever sem merge).
- Produz: `organizations.settings.proposals = { enabled, default_valid_days, default_conditions }`.

- [ ] **Passo 0: medir o NNNN real ANTES de nomear o arquivo (G3 — obrigatório, não pule)**

```bash
ls supabase/migrations/*.sql | sed -E 's/.*_([0-9]{4})_.*/\1/' | sort -n | tail -1
```

Se a Tarefa 13 já rodou nesta mesma fila, o número que ela usou está reservado — confira o
`ls supabase/migrations/` real, não deduza de cabeça.

- [ ] **Passo 1: migration — nasce DESLIGADA por organização (G da doutrina §14.4/§15.1 da spec)**

```sql
-- <timestamp>_<NNNN>_configuracoes_de_propostas.sql — NNNN do Passo 0
-- A capacidade nasce DESLIGADA: atualizar nao muda nada em organizacao
-- nenhuma ate alguem ligar a regra (mesmo criterio do PR "Clientes pela
-- agenda", aceito pelo Rafael — ver NOSSA-REGRA.md/CHANGELOG 1.28.0).
-- organizations.settings e jsonb COMPARTILHADO (branding, security moram
-- nele) — este bloco so ACRESCENTA a chave 'proposals', nunca sobrescreve
-- settings inteiro.
update public.organizations
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{proposals}',
  '{"enabled": false, "default_valid_days": 15, "default_conditions": null}'::jsonb,
  true
)
where settings->'proposals' is null;
```

- [ ] **Passo 2: tela**

```tsx
// app/app/settings/tenant/proposals/_client.tsx
"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";

interface Config { enabled: boolean; default_valid_days: number; default_conditions: string | null }

export function ProposalsSettingsClient() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    apiClient.get<Config>("/api/v1/settings/proposals").then((res) => setCfg(res.data));
  }, []);

  async function salvar() {
    if (!cfg) return;
    setSalvando(true);
    await apiClient.patch("/api/v1/settings/proposals", cfg);
    setSalvando(false);
  }

  if (!cfg) return <div className="p-6">Carregando…</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Propostas</h1>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
        Ligar propostas comerciais para esta organização
      </label>
      <label className="block">
        Validade padrão (dias)
        <input type="number" min={1} value={cfg.default_valid_days} onChange={(e) => setCfg({ ...cfg, default_valid_days: Number(e.target.value) })} />
      </label>
      <label className="block">
        Condições padrão
        <textarea value={cfg.default_conditions ?? ""} onChange={(e) => setCfg({ ...cfg, default_conditions: e.target.value || null })} />
      </label>
      <button onClick={salvar} disabled={salvando}>Salvar</button>
    </div>
  );
}
```

```tsx
// app/app/settings/tenant/proposals/page.tsx
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveActiveOrg } from "@/lib/auth/resolve-active-org";
import { ProposalsSettingsClient } from "./_client";

export default async function ProposalsSettingsPage() {
  await requireAuth();
  await resolveActiveOrg();
  return <ProposalsSettingsClient />;
}
```

- [ ] **Passo 3: rota GET/PATCH** — copiar exatamente o padrão medido de
  `app/api/v1/agenda/tipos/route.ts` (`requireRole("manager")` no PATCH, `requireRole("viewer")` no
  GET), lendo/escrevendo `organizations.settings.proposals` com **merge**, nunca `update({settings: ...})`
  bruto (CLAUDE.md — jsonb compartilhado). Crie `app/api/v1/settings/proposals/route.ts`:

```ts
// app/api/v1/settings/proposals/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
const patchSchema = z.object({
  enabled: z.boolean(),
  default_valid_days: z.number().int().positive().max(365),
  default_conditions: z.string().max(4000).nullable(),
});

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", authz.org.orgId).single();
  const proposals = (data?.settings as Record<string, unknown> | null)?.proposals ?? {
    enabled: false, default_valid_days: 15, default_conditions: null,
  };
  return ok(proposals, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });

  const supabase = await createClient();
  const { data: atual } = await supabase.from("organizations").select("settings").eq("id", authz.org.orgId).single();
  const settingsMesclado = { ...(atual?.settings as Record<string, unknown> | null ?? {}), proposals: parsed.data };

  const { error } = await supabase.from("organizations").update({ settings: settingsMesclado }).eq("id", authz.org.orgId);
  if (error) return fail("internal_error", t("Falha ao salvar."), 500, { requestId });
  return ok(parsed.data, { requestId });
}
```

- [ ] **Passo 4: a rota de criar rascunho (Tarefa 5) usa a validade padrão quando `valid_until` não vem**

Em `app/api/v1/proposals/route.ts`, POST, antes do insert: se `input.valid_until` for `undefined`,
ler `organizations.settings.proposals.default_valid_days` e calcular `hoje + N dias`.

- [ ] **Passo 5: commit**

```bash
git add supabase/migrations/<timestamp>_<NNNN>_configuracoes_de_propostas.sql supabase/baseline.sql supabase/migrations/MANIFEST.md app/app/settings/tenant/proposals/ app/api/v1/settings/proposals/route.ts app/api/v1/proposals/route.ts lib/navigation/catalogo.ts
git commit -m "feat(proposta): Configuracoes > Propostas — nasce DESLIGADA

enabled=false por padrao (atualizar nao muda nada ate alguem ligar —
criterio ja aceito pelo Rafael no PR de Clientes pela agenda).
default_valid_days=15 e default_conditions ficam em
organizations.settings.proposals, com MERGE (jsonb compartilhado,
nunca sobrescrito inteiro).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

> **Nota:** adicione também a entrada desta tela em `lib/navigation/catalogo.ts` (grupo
> `organizacao`, ao lado de outras telas de Configurações — confira o padrão exato com
> `grep -n "settings/tenant/agenda" lib/navigation/catalogo.ts`).

---

# Tarefa 17 — Cron de vencimento (anti-morte)

**Files:**
- Criar: `app/api/v1/cron/proposal-expiry/route.ts` + `route.test.ts`
- Modificar: `docker/scheduler/entrypoint.sh`

**Interfaces:**
- Consome: padrão medido de `app/api/v1/cron/recover-stuck-messages/route.ts` (auth por secret,
  lógica pura separada do handler HTTP, insert em `agent_inbox_items` com dedupe).
- Produz: rota diária que vence propostas `enviada` com `valid_until < hoje`.

- [ ] **Passo 1: teste da lógica pura (vermelho)**

```ts
// app/api/v1/cron/proposal-expiry/route.test.ts
import { describe, expect, it } from "vitest";
import { encontrarPropostasVencidas } from "./route";

describe("encontrarPropostasVencidas", () => {
  it("proposta enviada com valid_until no passado: vencida", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", status: "enviada", valid_until: "2026-09-01" }],
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(1);
  });

  it("valid_until no futuro: não vence", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", status: "enviada", valid_until: "2026-12-01" }],
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("status já decidido (aceita/recusada): não vence de novo", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", status: "aceita", valid_until: "2026-09-01" }],
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("valid_until nulo: nunca vence (rascunho sem prazo definido não deveria chegar aqui, mas se chegar, não quebra)", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", status: "enviada", valid_until: null }],
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });
});
```

- [ ] **Passo 2: implementar — lógica pura + handler, mesmo padrão de `recover-stuck-messages`**

```ts
// app/api/v1/cron/proposal-expiry/route.ts
/**
 * Cron diário: propostas ENVIADAS cujo valid_until passou sem decisão viram
 * VENCIDAS e abrem aviso na Central. Mesmo padrão de
 * recover-stuck-messages/route.ts (lógica pura separada do handler HTTP).
 */
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface PropostaParaVerificar {
  id: string; organization_id: string; lead_id: string; status: string; valid_until: string | null;
}

export function encontrarPropostasVencidas(
  propostas: readonly PropostaParaVerificar[],
  agora: Date,
): PropostaParaVerificar[] {
  const hoje = agora.toISOString().slice(0, 10);
  return propostas.filter((p) => p.status === "enviada" && p.valid_until !== null && p.valid_until < hoje);
}

async function rodarVencimento(admin: ReturnType<typeof createAdminClient>): Promise<{ vencidas: number }> {
  const { data: candidatas } = await admin
    .from("crm_proposals")
    .select("id, organization_id, lead_id, status, valid_until")
    .eq("status", "enviada")
    .not("valid_until", "is", null);

  const vencidas = encontrarPropostasVencidas(candidatas ?? [], new Date());
  if (vencidas.length === 0) return { vencidas: 0 };

  for (const p of vencidas) {
    await admin.from("crm_proposals").update({ status: "vencida" }).eq("id", p.id);
    await admin.from("crm_lead_activities").insert({
      organization_id: p.organization_id, lead_id: p.lead_id, source_module: "proposals",
      source_id: p.id, type: "proposal_expired", payload: {},
    });
    // Dedupe: não abre um segundo aviso se já existe um aberto para esta proposta.
    const { data: existente } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", p.organization_id)
      .eq("kind", "proposal_expired_notice")
      .eq("ref_id", p.id)
      .eq("status", "open")
      .maybeSingle();
    if (!existente) {
      await admin.from("agent_inbox_items").insert({
        organization_id: p.organization_id, kind: "proposal_expired_notice", severity: "warn",
        title: "Uma proposta venceu sem decisão do cliente",
        ref_kind: "proposal", ref_id: p.id,
      });
    }
  }
  return { vencidas: vencidas.length };
}

export async function GET(req: Request): Promise<Response> {
  const secret = env.INTERNAL_CRON_SECRET ?? env.INTERNAL_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const resultado = await rodarVencimento(admin);
  return Response.json(resultado);
}
export const POST = GET;
```

- [ ] **Passo 3: rodar e confirmar verde**

```bash
npx vitest run app/api/v1/cron/proposal-expiry/route.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `4 passed`.

- [ ] **Passo 4: agendar no scheduler**

Em `docker/scheduler/entrypoint.sh`, na variável `CRONS`, acrescentar (formato medido:
`crontab|timeout_seg|path`):

```
0 8 * * *|60|api/v1/cron/proposal-expiry
```

Rodar às 8h — depois do expediente noturno, antes do horário comercial (mesma faixa de outros
crons diários do produto).

- [ ] **Passo 5: SABOTAGEM (G14)**

Remova `p.status === "enviada" &&` do filtro. Previsão: **1 caso cai** ("status já decidido: não
vence de novo" — uma `aceita` passaria a vencer também). Restaure.

- [ ] **Passo 6: commit**

```bash
git add app/api/v1/cron/proposal-expiry/route.ts app/api/v1/cron/proposal-expiry/route.test.ts docker/scheduler/entrypoint.sh
git commit -m "feat(proposta): cron de vencimento — anti-morte

Diario, 8h. Proposta enviada com valid_until passado vira vencida,
grava na timeline e abre aviso (kind=proposal_expired_notice) com
dedupe — nao duplica se ja existe aviso aberto. So enviada vence:
aceita/recusada ja tem desfecho.

Sabotagem: tirar o filtro de status derruba 1 de 4 casos.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 18 — Cron "prometida e não criada" + cron de taxa de aceite (laço de retorno)

**Files:**
- Criar: `app/api/v1/cron/proposal-promised-not-created/route.ts` + `route.test.ts`
- Criar: `app/api/v1/cron/proposal-acceptance-rate/route.ts` + `route.test.ts`
- Modificar: `docker/scheduler/entrypoint.sh`

**Interfaces:**
- Consome: `crm_tasks.source_kind` (Tarefa 1), `agent_inbox_items` (mesmo padrão da Tarefa 17).
- Produz: os últimos dois sinais do laço de retorno (spec §9): "prometida e não criada" e "taxa de
  aceite caiu".

## Parte A — "prometida e não criada"

- [ ] **Passo 1: teste da lógica pura (vermelho)**

```ts
// app/api/v1/cron/proposal-promised-not-created/route.test.ts
import { describe, expect, it } from "vitest";
import { encontrarPromessasSemProposta } from "./route";

describe("encontrarPromessasSemProposta", () => {
  it("tarefa promised_proposal vencida, sem proposta criada depois dela: sinaliza", () => {
    const r = encontrarPromessasSemProposta(
      {
        tarefas: [{ id: "t1", organization_id: "org-1", lead_id: "l1", source_kind: "promised_proposal", due_date: "2026-09-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }],
        propostas: [],
      },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(1);
  });

  it("tarefa vencida, MAS já existe proposta criada depois dela para o mesmo lead: não sinaliza", () => {
    const r = encontrarPromessasSemProposta(
      {
        tarefas: [{ id: "t1", organization_id: "org-1", lead_id: "l1", source_kind: "promised_proposal", due_date: "2026-09-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }],
        propostas: [{ id: "p1", organization_id: "org-1", lead_id: "l1", created_at: "2026-08-26T00:00:00Z" }],
      },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("tarefa ainda não vencida: não sinaliza", () => {
    const r = encontrarPromessasSemProposta(
      { tarefas: [{ id: "t1", organization_id: "org-1", lead_id: "l1", source_kind: "promised_proposal", due_date: "2026-12-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }], propostas: [] },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("source_kind diferente (promised_followup): não sinaliza — não é sobre proposta", () => {
    const r = encontrarPromessasSemProposta(
      { tarefas: [{ id: "t1", organization_id: "org-1", lead_id: "l1", source_kind: "promised_followup", due_date: "2026-09-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }], propostas: [] },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("tarefa sem lead_id (negócio ambíguo na hora de criar): não sinaliza — não há onde apontar o aviso", () => {
    const r = encontrarPromessasSemProposta(
      { tarefas: [{ id: "t1", organization_id: "org-1", lead_id: null, source_kind: "promised_proposal", due_date: "2026-09-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }], propostas: [] },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });
});
```

- [ ] **Passo 2: implementar**

```ts
// app/api/v1/cron/proposal-promised-not-created/route.ts
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface TarefaPromessa {
  id: string; organization_id: string; lead_id: string | null; source_kind: string | null;
  due_date: string | null; status: string; created_at: string;
}
interface PropostaMinima { id: string; organization_id: string; lead_id: string; created_at: string }

/**
 * Fecha o sinal que originou a spec inteira: uma promessa de proposta
 * (Tarefa 1) vence sem que NENHUMA proposta tenha sido criada para aquele
 * negócio depois da promessa. "Depois da promessa" é o que distingue de uma
 * proposta antiga já existente — sem essa condição, um lead com QUALQUER
 * proposta velha nunca acionaria o aviso.
 */
export function encontrarPromessasSemProposta(
  input: { tarefas: readonly TarefaPromessa[]; propostas: readonly PropostaMinima[] },
  agora: Date,
): TarefaPromessa[] {
  return input.tarefas.filter((t) => {
    if (t.source_kind !== "promised_proposal") return false;
    if (t.status !== "pending") return false;
    if (t.lead_id === null) return false;
    if (t.due_date === null || new Date(t.due_date) >= agora) return false;
    const temProposta = input.propostas.some(
      (p) => p.lead_id === t.lead_id && p.organization_id === t.organization_id && p.created_at >= t.created_at,
    );
    return !temProposta;
  });
}

async function rodar(admin: ReturnType<typeof createAdminClient>) {
  const { data: tarefas } = await admin
    .from("crm_tasks")
    .select("id, organization_id, lead_id, source_kind, due_date, status, created_at")
    .eq("source_kind", "promised_proposal")
    .eq("status", "pending");
  const { data: propostas } = await admin
    .from("crm_proposals")
    .select("id, organization_id, lead_id, created_at");

  const achadas = encontrarPromessasSemProposta({ tarefas: tarefas ?? [], propostas: propostas ?? [] }, new Date());
  for (const t of achadas) {
    const { data: existente } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", t.organization_id)
      .eq("kind", "proposal_promised_not_created")
      .eq("ref_id", t.lead_id as string)
      .eq("status", "open")
      .maybeSingle();
    if (!existente) {
      await admin.from("agent_inbox_items").insert({
        organization_id: t.organization_id, kind: "proposal_promised_not_created", severity: "warn",
        title: "Uma proposta prometida não foi criada",
        body: "Um compromisso de enviar proposta venceu e nenhuma proposta foi criada para este negócio.",
        ref_kind: "lead", ref_id: t.lead_id,
      });
    }
  }
  return { sinalizadas: achadas.length };
}

export async function GET(req: Request): Promise<Response> {
  const secret = env.INTERNAL_CRON_SECRET ?? env.INTERNAL_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const resultado = await rodar(createAdminClient());
  return Response.json(resultado);
}
export const POST = GET;
```

- [ ] **Passo 3: rodar e confirmar verde**

```bash
npx vitest run app/api/v1/cron/proposal-promised-not-created/route.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `5 passed`.

## Parte B — taxa de aceite (versão simplificada, com threshold — não há motor de tendência no repo)

**Escopo declarado:** medido — não existe mecanismo de "comparar taxa contra período anterior" no
código (só `lib/followup/outcome-stats.ts`, que calcula um instante, sem histórico). Construir um
motor de tendência completo é a Peça 11 do plano do funil, ainda não pronta. Aqui entra a versão
que a Tarefa 18 PODE sustentar sozinha: **threshold fixo**, não tendência — mesma classe de
`lib/ai/budget/check.ts` (limiar, não comparação temporal). Quando houver motor de tendência
pronto, trocar o threshold por comparação é mudança isolada neste arquivo.

- [ ] **Passo 4: teste (vermelho)**

```ts
// app/api/v1/cron/proposal-acceptance-rate/route.test.ts
import { describe, expect, it } from "vitest";
import { calcularTaxaDeAceite } from "./route";

describe("calcularTaxaDeAceite", () => {
  it("3 aceitas de 10 decididas (aceita+recusada): 30%", () => {
    const propostas = [
      ...Array(3).fill({ status: "aceita" }),
      ...Array(7).fill({ status: "recusada" }),
      ...Array(2).fill({ status: "enviada" }), // ainda não decidida — fora do denominador
    ];
    expect(calcularTaxaDeAceite(propostas as never)).toBe(0.3);
  });

  it("zero decididas: null (sem dado suficiente, não é zero)", () => {
    expect(calcularTaxaDeAceite([{ status: "enviada" }] as never)).toBeNull();
  });

  it("taxa abaixo do piso (30%) dispara; acima, não", () => {
    expect(calcularTaxaDeAceite(Array(2).fill({ status: "aceita" }).concat(Array(8).fill({ status: "recusada" })) as never)).toBeLessThan(0.3);
    expect(calcularTaxaDeAceite(Array(8).fill({ status: "aceita" }).concat(Array(2).fill({ status: "recusada" })) as never)).toBeGreaterThan(0.3);
  });
});
```

- [ ] **Passo 5: implementar**

```ts
// app/api/v1/cron/proposal-acceptance-rate/route.ts
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const PISO_DE_ACEITE = 0.3;
const MINIMO_DE_DECISOES = 5; // abaixo disso, 30% de 1 proposta não significa nada

export function calcularTaxaDeAceite(propostas: readonly { status: string }[]): number | null {
  const decididas = propostas.filter((p) => p.status === "aceita" || p.status === "recusada");
  if (decididas.length < MINIMO_DE_DECISOES) return null;
  const aceitas = decididas.filter((p) => p.status === "aceita").length;
  return aceitas / decididas.length;
}

async function rodar(admin: ReturnType<typeof createAdminClient>) {
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: orgs } = await admin.from("organizations").select("id");
  let avisadas = 0;

  for (const org of orgs ?? []) {
    const { data: propostas } = await admin
      .from("crm_proposals")
      .select("status")
      .eq("organization_id", org.id)
      .gte("sent_at", trintaDiasAtras)
      .not("sent_at", "is", null);

    const taxa = calcularTaxaDeAceite(propostas ?? []);
    if (taxa === null || taxa >= PISO_DE_ACEITE) continue;

    const { data: existente } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", org.id)
      .eq("kind", "proposal_acceptance_rate_drop")
      .eq("status", "open")
      .maybeSingle();
    if (!existente) {
      await admin.from("agent_inbox_items").insert({
        organization_id: org.id, kind: "proposal_acceptance_rate_drop", severity: "warn",
        title: "A taxa de aceite de propostas caiu",
        body: `${Math.round(taxa * 100)}% das propostas decididas nos últimos 30 dias foram aceitas — abaixo do piso de ${Math.round(PISO_DE_ACEITE * 100)}%.`,
      });
      avisadas++;
    }
  }
  return { organizacoes_avisadas: avisadas };
}

export async function GET(req: Request): Promise<Response> {
  const secret = env.INTERNAL_CRON_SECRET ?? env.INTERNAL_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const resultado = await rodar(createAdminClient());
  return Response.json(resultado);
}
export const POST = GET;
```

- [ ] **Passo 6: rodar e confirmar verde**

```bash
npx vitest run app/api/v1/cron/proposal-acceptance-rate/route.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `3 passed`.

- [ ] **Passo 7: agendar os dois (semanal, domingo de madrugada — não é diário como o vencimento)**

Em `docker/scheduler/entrypoint.sh`:

```
30 8 * * *|60|api/v1/cron/proposal-promised-not-created
0 6 * * 0|60|api/v1/cron/proposal-acceptance-rate
```

- [ ] **Passo 8: SABOTAGEM (G14)**

Na Parte A, remova `if (t.lead_id === null) return false;`. Previsão: **1 caso cai** ("tarefa sem
lead_id: não sinaliza") — o `.eq("ref_id", t.lead_id as string)` do insert receberia `null` e o
teste que monta esse cenário quebraria de forma visível. Restaure.

- [ ] **Passo 9: commit**

```bash
git add app/api/v1/cron/proposal-promised-not-created/ app/api/v1/cron/proposal-acceptance-rate/ docker/scheduler/entrypoint.sh
git commit -m "feat(proposta): os dois ultimos sinais do laco de retorno

'Prometida e nao criada' fecha o defeito que originou a spec — usa a
crm_tasks.source_kind da Tarefa 1, filtrando por 'depois da promessa'
para nao acionar em lead com proposta antiga. 'Taxa de aceite' e
THRESHOLD fixo (30%, minimo 5 decisoes), nao tendencia — nao ha motor
de comparacao temporal no repo (Peca 11 do plano do funil, nao
pronta); documentado como escopo declarado.

Sabotagem: tirar a guarda de lead_id nulo derruba 1 caso.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 19 — Mapa vivo + fragmento de release

**Files:**
- Modificar: `docs/architecture/*.json` (o mapa que cobre o funil/CRM)
- Criar: `.changes/a-proposta-comercial-fecha-a-venda.md`

**Interfaces:**
- Consome: nada.
- Produz: nó `proposta` no mapa vivo, fragmento de release.

- [ ] **Passo 1: achar o mapa certo**

```bash
grep -rl "\"crm_leads\"\|crm-lead" docs/architecture/*.json | head -3
```

- [ ] **Passo 2: acrescentar o nó `proposta`** com arestas para `lead`, `catalogo`, `mensagens`,
`funil` (Living System Checklist item 10 da spec — "ganha o nó proposta com arestas para lead,
catálogo, mensagens e funil"). Siga o formato JSON existente no arquivo (não invente schema novo).

- [ ] **Passo 3: fragmento de release**

```markdown
---
impacto: capacidade_nova
secao: adicionado
titulo: O CRM agora fecha a venda — proposta comercial
---

Cada negócio pode ganhar uma proposta: rascunho com itens do catálogo ou escritos à mão, revisão à
mão ou pedindo ajuste por instrução ("baixa 10% e tira a hospedagem"), PDF com a marca da sua
empresa, e envio pelo WhatsApp — sempre por quem tem papel de gestor, nunca pelo assistente
sozinho. A proposta é numerada por organização e ano, e revisar uma proposta já enviada cria uma
nova versão sem perder a anterior.

Se a proposta vencer sem resposta do cliente, ou se alguém prometer uma proposta e ela não sair,
um aviso aparece na Central.

**Nasce desligada.** Para usar, ligue em Configurações › Propostas.
```

- [ ] **Passo 4: commit**

```bash
git add docs/architecture/ .changes/a-proposta-comercial-fecha-a-venda.md
git commit -m "docs(proposta): mapa vivo e fragmento de release

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Tarefa 20 — Suíte completa (uma vez) + prova em tela na VPS

**Esta é a tarefa que substitui os 8 ciclos de onda por UM gate final** — é aqui, não antes, que o
custo da decisão do dono (G0 do cabeçalho) é pago: se algo quebrou lá atrás, aparece tudo de uma
vez aqui, não espalhado. Leia com atenção antes de empurrar.

- [ ] **Passo 1: empurrar tudo e deixar o CI do fork rodar por completo**

```bash
git push fork <branch>
gh run list --repo paulolimajr77/DeskcommCRM --branch <branch> --limit 5
```

- [ ] **Passo 2: se `verify` (typecheck+lint+test:unit) falhar, ler o log, corrigir, empurrar de novo**

```bash
gh api repos/paulolimajr77/DeskcommCRM/actions/jobs/<job-id>/logs
```

Erros mais prováveis dado o volume desta feature (confira estes primeiro):
- `InboxKind`/`POLITICAS_DE_AVISO`/`agent-inbox-copy` fora de sincronia (G4) — `tsc` acusa.
- Assinatura real de `McpToolDefinition`/`ctx` diferente do assumido na Tarefa 13.
- `checkDailyLimit`/`sendMessageHandler` em módulo diferente do assumido na Tarefa 14.

- [ ] **Passo 3: se `invariants` (`test:db`) falhar — é o único jeito de saber se a RLS está certa**

Este é o gate que a Tarefa 3 não pôde confirmar localmente (G11). Preste atenção especial aos casos
de `crm_proposals`/`crm_proposal_items` no relatório.

- [ ] **Passo 4: quando tudo estiver verde — publicar e provar na VPS, ANTES do PR (NOSSA-REGRA.md)**

Esta etapa **não é opcional e não é decisão do assistente**: a ordem do repositório é
`implementa → gates verdes → sobe na VPS → PAULO PROVA NA TELA → só então abre o PR`. Avise que
está pronto para publicar (o outro agente cria a tag — NOSSA-REGRA.md, "O assistente NÃO cria
tag"), e liste o que entrou nesta versão pelo EFEITO para quem usa, não por nome de arquivo:

- proposta comercial: rascunho, edição manual, assistente por instrução, PDF com marca, envio por
  WhatsApp (só gestor), aceite/recusa manual, vencimento automático, aviso de promessa não
  cumprida, aviso de taxa de aceite em queda;
- nasce **desligada** — nenhuma organização muda de comportamento até alguém ligar em
  Configurações › Propostas.

- [ ] **Passo 5: roteiro de prova em tela (Paulo, ou quem clicar) — caminho feliz**

1. Configurações › Propostas → ligar a chave, definir validade 15 dias.
2. Abrir um negócio → criar proposta → adicionar item À MÃO (sem usar catálogo) → salvar.
3. Adicionar um item DO CATÁLOGO → conferir total recalculado.
4. Assistente: pedir "baixa 10%" → conferir preview antes/depois → Aplicar → conferir total.
5. Enviar (como `manager`) → conferir PDF chegou no WhatsApp de teste, com a marca certa (não a da
   instalação).
6. Tentar enviar como `agent` → conferir 403.
7. Marcar como Aceita → conferir `value_cents` do negócio mudou e a etapa registrou evidência.
8. Revisar uma proposta enviada → conferir que virou v2 com o MESMO número, e a v1 continua
   legível como `substituida`.

- [ ] **Passo 6: roteiro de prova — caminho do erro (o que mais paga, por doutrina do repo)**

1. Rascunho com `revision` velha (duas abas abertas) → conferir 409 com mensagem clara, não 500.
2. Assistente com instrução ambígua ("manda pro financeiro") → conferir que não inventa mudança.
3. Sem orçamento de IA configurado → conferir que o campo do assistente desabilita com o motivo, e
   o editor manual continua funcionando.
4. Vencer uma proposta (ajustar `valid_until` para ontem, rodar o cron à mão) → conferir aviso na
   Central.
5. Criar uma tarefa "promessa de proposta" (via aviso de promessa) com prazo vencido, sem criar a
   proposta → rodar o cron à mão → conferir o aviso "prometida e não criada".

```bash
ssh appfin-staging 'cd /home/figtoel-admin/deskcomm && curl -s -X POST -H "Authorization: Bearer $INTERNAL_CRON_SECRET" http://localhost:3000/api/v1/cron/proposal-expiry'
```

- [ ] **Passo 7: só depois do Passo 5/6 confirmados — abrir o PR (ou os PRs)**

```bash
git tag --contains "$(git rev-parse HEAD)" | grep '^v' || echo "⛔ NAO PROVADO — nao abra o PR"
```

Se este comando não devolver uma tag, **o PR não sai** — regra sem exceção (NOSSA-REGRA.md).
