# Proposta P0 — sai o preenchimento de campos do funil pela IA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Tirar do sistema a camada NOSSA em que a IA pergunta, anota e sugere campos do funil — e deixar os campos do funil exatamente como são na versão do Rafael: a equipe preenche à mão.

**Architecture:** A camada existe só na `vps/pljr-combinada` (nenhum arquivo dela está na `main` do upstream). Ela já saiu uma vez (commit `fbb6a28b3`, 22/09) e voltou (revert `ee6e0d86e`, 23/09); reverter o revert reaplica a remoção inteira do código sem conflito (medido). O que a remoção de 22/09 deixou para trás sai à mão: a "pergunta que o agente faz" em Configurações › Funis e a lista de campos obrigatórios em branco na passagem ao humano. O schema restaurado pela 0397 sai por uma migration nova, com a tripla (arquivo, baseline, MANIFEST).

**Tech Stack:** git revert, Next.js, Zod, Postgres (migration + baseline), Vitest.

**Spec:** nenhuma spec separada — este plano é autônomo. É uma remoção, não uma feature nova: **não é do subsistema de propostas** (esse é o assunto de `docs/superpowers/specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md`, que não cita nada disto); é do subsistema de campos personalizados do funil (CRM), tratado à parte por decisão do dono em 26/09/2026. Toda medição e decisão estão nas seções abaixo (Global Constraints, Review Focus) e no Self-Review, no lugar de números de decisão de outro documento.

## Como este plano é executado (opencode)

- **Base:** `vps/pljr-combinada` do fork — é a única branch que tem a camada (medido: `git branch -r --contains ee6e0d86e` devolve só `fork/vps/pljr-combinada`). Worktree própria (Task 0), **nunca** a pasta principal.
- **Medir antes de colar.** Todo trecho "Modify" traz o texto atual. Se não bater byte a byte, **pare e reporte**.
- **O que roda nesta máquina:** só `npx vitest run <arquivos>`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:channels` e `pnpm checar:colisao-de-migration`. Nada de `pnpm test:unit` inteiro, `pnpm test:db`, `pnpm test:e2e` ou `pnpm build` — são do CI do fork.
- **Sabotagem:** copie o arquivo antes (`cp arq "$TMP/arq.bak"`), sabote, rode, restaure **da cópia** — nunca com `git checkout --`.
- **Editar arquivo com script:** Python no Windows troca o fim de linha. Se usar Python, abra com `newline=''` na leitura E na escrita; prefira a ferramenta de edição.
- **Um commit por tarefa.** **Não empurre.**

## Global Constraints

- **Fica tudo o que é do Rafael:** `crm_update_lead` (a ferramenta que já existia, escolhível à mão em `tool_ids`), `camposDoFunil()` (`lib/leads/campos-do-funil.ts`), a tela de campos em Configurações › Funis (chave, rótulo, tipo, opções, obrigatório), o Kanban, os webhooks, as automações e o lembrete por data.
- **Ficam também quatro consertos nossos que não são "a IA preenche":** a anotação simultânea que não apaga a outra (0269), a etapa que afirma fato só por pessoa (`afirma_fato`), o negócio da conversa (`negocio-da-conversa.ts`) e a regra de que o agente não sobrescreve campo preenchido (Tarefa 4.3) — os quatro protegem dado da equipe contra QUALQUER escritor (humano pela tela, `crm_update_lead` à mão, automação) e não dependem da camada que sai.
- Nenhuma linha de `crm_leads.custom_fields` e nenhum `settings.fields` de funil é apagado. A chave `pergunta` já gravada em `settings.fields` fica no jsonb e passa a ser ignorada: `customFieldSchema` é `z.object` (descarta chave desconhecida, não recusa) — medido em `lib/schemas/settings.ts:157`.
- Migration idempotente, sem `BEGIN/COMMIT`, e o apêndice do baseline **não cria função** (cerca `tests/unit/varredura-anon-e-o-ultimo-bloco.test.ts`).

## Review Focus

- **Organização com aviso "sugestão de campo" aberto na Central** — o kind `lead_field_proposed` sai do vocabulário; as linhas existentes viram `other` ANTES de a constraint ser reconstruída, senão o `update.sh` quebra. Task 2 cobre (a atualização já existe no bloco único; a migration repete).
- **Versão de agente publicada com a chave ligada** — as colunas saem; a trava de imutabilidade da versão não pode continuar citando `new.lead_fields_enabled` (erro em todo UPDATE de versão). Task 2 edita a última definição da função no baseline e a recria na migration.
- **Funil com `pergunta` gravada** — abrir e salvar Configurações › Funis continua funcionando e a chave simplesmente some no próximo salvamento. Task 3 testa.
- **Passagem ao humano** — continua gravando a atividade, só sem `obrigatorios_em_branco`. Task 4 confere.
- **Agente que dependia de `crm_update_lead` injetado pela chave** — perde a ferramenta, a não ser que o dono a escolha à mão. É o comportamento da versão do Rafael e o da 1.43.1 do fork (CHANGELOG, linha 748).

---

### Task 0: Worktree de trabalho

- [ ] **Step 1: Conferir e criar**

```bash
cd "D:/PROJETOS VIBE CODING/DeskcommCRM"
git status --short                         # só "?? PLJR-Proposal-System-v1.1.0/" e arquivos de docs/superpowers
git fetch fork
git worktree add "../deskcomm-p0-campos" -b remove/campos-do-funil-pela-ia fork/vps/pljr-combinada
cd "../deskcomm-p0-campos"
pnpm install --frozen-lockfile
```

- [ ] **Step 2: Retrato de partida**

```bash
npx vitest run pacote catalogo knob vocabulario kind-check inbox escopo negocio prefixo lib/mcp/tools lib/ai/runtime lib/agent-engine/agent lib/leads app/app/ai/agents app/api/v1/leads app/api/v1/ai/agents lib/ai/agents lib/schemas app/app/settings/tenant/pipelines lib/ai/handoff > "$TMP/p0-antes.log" 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " "$TMP/p0-antes.log" | tail -3
grep -aE "^ *FAIL " "$TMP/p0-antes.log" | sed 's/ > .*//' | sort | uniq -c
```

Anote o rodapé e a lista de FAIL. É a régua: no fim, nada que estava verde pode ficar vermelho.

---

### Task 1: Reaplicar a remoção do código (reverter o revert)

**Files:** os 41 que `ee6e0d86e` tocou (12 apagados, 29 alterados), mais um fragmento.

**Interfaces:**
- Produces: o sistema sem `lead_fields_enabled`/`lead_fields_propose_new` no TypeScript, sem `crm_propose_lead_field`, sem o bloco de vocabulário no prefixo do agente, sem os interruptores na tela do agente e sem o kind `lead_field_proposed` em `InboxKind`/`KIND_LABEL`/`POLITICAS_DE_AVISO`.

- [ ] **Step 1: Reverter**

```bash
git revert --no-commit ee6e0d86e
git status --short | awk '{print $1}' | sort | uniq -c
git diff --name-only --diff-filter=U
```

Esperado (medido em 26/09 sobre `5d8f8437d`): `12 D` e `29 M`, e **nenhum** arquivo em conflito. Se aparecer conflito, **pare e reporte** a lista — a branch mudou depois da medição.

- [ ] **Step 2: O fragmento que anunciava a volta sai junto**

```bash
git rm -q .changes/o-agente-volta-a-preencher-os-campos-do-funil.md
```

Ele nasceu no commit de schema da volta (`29150a483`), e não no revert — por isso o Step 1 não o alcança. Os seis outros fragmentos da camada já saem no Step 1. Nenhum deles chegou a uma versão publicada (`grep -n -i "pergunta que o agente\|campo novo no funil" CHANGELOG.md` vazio); a última versão publicada já diz que o agente não preenche mais (CHANGELOG, linha 748). Por isso este plano **não** traz fragmento novo: não há nada a anunciar a quem opera a VPS que a versão publicada já não diga.

- [ ] **Step 3: Conferir resíduo**

```bash
for t in leadFieldsEnabled leadFieldsProposeNew crm_propose_lead_field proposta-de-campo-novo carregarCamposDoFunilDoAgente; do
  echo "## $t"; git grep -n "$t" -- . ':!supabase' ':!docs' ':!*.md'
done
```

Esperado: nenhuma linha. (Aparecem, e estão certas, só menções em comentário de `tests/unit/knob-da-versao-tem-porta.test.ts`, `tests/unit/migrations-nao-encolhem-vocabulario.test.ts` e `tests/unit/prefixo-cacheado-e-byte-identico.test.ts` quando o termo pesquisado é `lead_fields_enabled`, `lead_field_proposed` ou `campos-do-funil-do-agente` — por isso estes três não estão na lista acima.)

- [ ] **Step 4: Gates**

```bash
pnpm typecheck
pnpm lint
npx vitest run pacote catalogo knob vocabulario kind-check inbox escopo negocio prefixo lib/mcp/tools lib/ai/runtime lib/agent-engine/agent lib/leads app/app/ai/agents app/api/v1/leads app/api/v1/ai/agents lib/ai/agents > "$TMP/p0-t1.log" 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " "$TMP/p0-t1.log" | tail -3
grep -aE "^ *FAIL " "$TMP/p0-t1.log" | sed 's/ > .*//' | sort | uniq -c
```

Medido em 26/09 numa cópia descartável com o Step 1 aplicado: `typecheck` com **0** erros. O resultado dos testes medido no mesmo dia está no fim deste plano (seção "Medição da Task 1"). Esperado neste ponto: **um** FAIL, `tests/unit/knob-da-versao-tem-porta.test.ts` ("lead_fields_enabled / lead_fields_propose_new — falta em: ..."). A cerca lê as colunas do baseline e só esquece uma coluna quando vê o `drop column` DEPOIS do último `add column`; esse drop entra na Task 2, que fecha este vermelho. Qualquer outro FAIL que não esteja no retrato da Task 0: **pare e reporte**.

- [ ] **Step 5: Commit**

```bash
git commit -m "remove(agente): sai de novo o preenchimento de campos do funil pela IA (P0)

Reverte o revert ee6e0d86e: volta a remocao de fbb6a28b3/f9fed200f.
Decisao do dono em 26/09: fica so a versao do Rafael dos campos do funil."
```

---

### Task 2: O schema — as colunas, o kind e a função saem (migration + baseline + MANIFEST)

**Files:**
- Create: `supabase/migrations/20260926190000_NNNN_sai_o_preenchimento_de_campos_do_funil_pela_ia.sql`
- Modify: `supabase/baseline.sql` (dois trechos no meio e um bloco no fim)
- Modify: `supabase/migrations/MANIFEST.md`
- Modify: `tests/unit/migrations-nao-encolhem-vocabulario.test.ts`

- [ ] **Step 1: O número** — `NNNN` é o próximo livre:

```bash
ls supabase/migrations/ | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1
pnpm checar:colisao-de-migration
```

Medido em 26/09: o maior era `0423`, então este plano usa **`0424`**. O P5 (modelos da empresa) usa o seguinte. Se o maior já não for `0423`, use o próximo livre e troque `0424` por ele em todos os passos desta tarefa.

- [ ] **Step 2: A migration** — crie `supabase/migrations/20260926190000_0424_sai_o_preenchimento_de_campos_do_funil_pela_ia.sql`:

```sql
-- 0424 - sai DE NOVO o preenchimento de campos do funil pela IA.
--
-- Decisão do dono em 26/09/2026: fica só a versão dos campos do funil que
-- existe no upstream (a equipe preenche à mão). A 0395 tirou este schema, a
-- 0397 o restaurou; esta tira de novo, com a mesma forma da 0395 e o
-- vocabulário de hoje.
--
-- O QUE SAI: `ai_agent_versions.lead_fields_enabled` e
-- `.lead_fields_propose_new`, o kind `lead_field_proposed` e a
-- `fn_inbox_item_unico` (só aquela ferramenta a chamava).
--
-- O QUE FICA: `crm_update_lead`, `contact_field_proposals` (0270),
-- `fn_lead_anotar_campos` (0266), a anotação simultânea (0269) e
-- `crm_stages.afirma_fato` — nenhum deles é "a IA preenche".
alter table public.ai_agent_versions
  drop column if exists lead_fields_enabled;

alter table public.ai_agent_versions
  drop column if exists lead_fields_propose_new;

-- Corpo DERIVADO da última definição em vigor no baseline (a da 0397) menos
-- as duas linhas das colunas acima. Medido em 26/09: é byte a byte o corpo da
-- 0395, porque nenhuma coluna nova entrou na trava desde então.
create or replace function public.fn_ai_agent_version_content_immutable() returns trigger
language plpgsql as $fn$
begin
  if old.status <> 'draft' and (
       new.system_prompt          is distinct from old.system_prompt
    or new.provider               is distinct from old.provider
    or new.model                  is distinct from old.model
    or new.credential_id          is distinct from old.credential_id
    or new.tool_ids               is distinct from old.tool_ids
    or new.trigger_config         is distinct from old.trigger_config
    or new.channel_session_id     is distinct from old.channel_session_id
    or new.max_steps              is distinct from old.max_steps
    or new.token_budget           is distinct from old.token_budget
    or new.cost_budget_cents      is distinct from old.cost_budget_cents
    or new.history_message_window is distinct from old.history_message_window
    or new.history_token_window   is distinct from old.history_token_window
    or new.handoff_keywords       is distinct from old.handoff_keywords
    or new.handoff_tool_enabled   is distinct from old.handoff_tool_enabled
    or new.followup               is distinct from old.followup
    or new.multimodal_input       is distinct from old.multimodal_input
    or new.video_frames_enabled   is distinct from old.video_frames_enabled
    or new.split_messages         is distinct from old.split_messages
    or new.split_max_chars        is distinct from old.split_max_chars
    or new.cases_enabled          is distinct from old.cases_enabled
    or new.operator_enabled       is distinct from old.operator_enabled
    or new.operator_model         is distinct from old.operator_model
    or new.operator_tool_ids      is distinct from old.operator_tool_ids
    or new.pipeline_ids           is distinct from old.pipeline_ids
    or new.knowledge_source_ids   is distinct from old.knowledge_source_ids
    or new.version_number         is distinct from old.version_number
    or new.agent_id               is distinct from old.agent_id
    or new.organization_id        is distinct from old.organization_id
  ) then
  raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_ai_agent_versions_content_immutable on public.ai_agent_versions;
create trigger trg_ai_agent_versions_content_immutable
  before update on public.ai_agent_versions
  for each row execute function public.fn_ai_agent_version_content_immutable();

-- ⛔ ANTES de reconstruir: `add constraint` valida as linhas existentes, e o
-- clone com aviso de sugestão aberto quebraria no meio. `other` já está no
-- vocabulário; o aviso continua legível e resolvível na Central.
update public.agent_inbox_items
  set kind = 'other'
  where kind = 'lead_field_proposed';

-- A lista é a da 0423 (a última reconstrução) INTEIRA menos
-- `lead_field_proposed` — nunca um "remove" do valor: quem reconstrói assume
-- a lista toda, e `kind-check-migration-x-baseline.test.ts` a compara com o
-- bloco único do baseline.
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
    'proposta_travada',
    'passos_esgotados','laco_de_retorno_caiu',
    'proposta_pronta_para_revisao',
    'other'
  ));

-- Sem chamador desde que `crm_propose_lead_field` saiu. `if exists` para o
-- clone que nunca a aplicou.
drop function if exists public.fn_inbox_item_unico(uuid, text, text, text, text, text, uuid);

notify pgrst, 'reload schema';
```

- [ ] **Step 3: Baseline — o kind sai do bloco ÚNICO, in-place** — em `supabase/baseline.sql` (perto da linha 10070, dentro de `add constraint agent_inbox_items_kind_check check (kind in (`), apague estas seis linhas:

```sql
    -- (migration 0392 na vps/pljr-combinada) O agente sugere campo de funil
    -- que ainda não existe; volta com a restauração do preenchimento (tinha
    -- saído e voltado). Mantido no merge de 25/09/2026 com a proposta
    -- comercial — as duas features não têm relação, só compartilham esta
    -- constraint (bloco único, #159).
    'lead_field_proposed',
```

O `update ... set kind = 'other' where kind = 'lead_field_proposed';` logo ACIMA do bloco (perto da linha 9988, rotulado `-- (migration 0380) Saída de lead_field_proposed`) **fica**: é ele que protege o `update.sh` de quem tem aviso aberto.

- [ ] **Step 4: Baseline — a última definição da trava perde as duas linhas, in-place** — a ÚLTIMA `create or replace function public.fn_ai_agent_version_content_immutable` do arquivo (perto da linha 39867; ache com `grep -n "create or replace function public.fn_ai_agent_version_content_immutable" supabase/baseline.sql | tail -1`). Dentro DELA, apague:

```sql
    or new.lead_fields_enabled     is distinct from old.lead_fields_enabled
    or new.lead_fields_propose_new is distinct from old.lead_fields_propose_new
```

In-place, e não um `create function` novo no fim: o fim do arquivo é depois da varredura de `anon`, onde a cerca `varredura-anon-e-o-ultimo-bloco` proíbe criar função. As definições anteriores da mesma função (perto das linhas 26173 e 26546) ficam como estão — o arquivo é aplicado inteiro e a última vence.

- [ ] **Step 5: Baseline — o bloco do fim** — acrescente ao FIM de `supabase/baseline.sql`:

```sql

-- ---- sai de novo o preenchimento de campos do funil pela IA (migration 0424) ----
--
-- Espelho de supabase/migrations/20260926190000_0424_sai_o_preenchimento_de_campos_do_funil_pela_ia.sql
-- (o porquê está no cabeçalho de lá). Aqui só o que pode vir DEPOIS da
-- varredura de anon: nenhum `create function`. A trava de imutabilidade sem
-- as duas colunas mora na última definição dela, editada in-place; o kind saiu
-- do bloco único, também in-place.
alter table public.ai_agent_versions
  drop column if exists lead_fields_enabled;

alter table public.ai_agent_versions
  drop column if exists lead_fields_propose_new;

drop function if exists public.fn_inbox_item_unico(uuid, text, text, text, text, text, uuid);

notify pgrst, 'reload schema';
```

As colunas continuam sendo criadas mais acima (linhas perto de 26128, 26498 e 40969, de migrations antigas) e são derrubadas aqui no fim: em instalação nova elas nascem e morrem na mesma aplicação; em atualização, somem. É a mesma forma que a 0395 usou.

- [ ] **Step 6: MANIFEST** — acrescente como ÚLTIMA linha de `supabase/migrations/MANIFEST.md` (depois da linha da `0423_proposta_pronta_para_revisao`):

```markdown
| `20260926190000` | `0424_sai_o_preenchimento_de_campos_do_funil_pela_ia` | **Sai de novo o preenchimento de campos do funil pela IA (decisão do dono, 26/09/2026): fica só a versão do upstream, em que a equipe preenche.** Mesma forma da 0395 sobre o vocabulário de hoje: `ai_agent_versions` perde `lead_fields_enabled`/`lead_fields_propose_new`; `fn_ai_agent_version_content_immutable` é recriada do corpo em vigor menos as duas linhas (no baseline, in-place na última definição); `agent_inbox_items_kind_check` é reescrita INTEIRA a partir da 0423 menos `lead_field_proposed` (no baseline, in-place no bloco único), com as linhas do kind virando `other` antes; `fn_inbox_item_unico` é derrubada. Ficam `crm_update_lead`, `contact_field_proposals`, `fn_lead_anotar_campos`, a 0269 e `afirma_fato`. |
```

- [ ] **Step 7: Remoção deliberada de vocabulário** — em `tests/unit/migrations-nao-encolhem-vocabulario.test.ts`, dentro de `REMOCOES_DELIBERADAS`, logo depois da entrada `"20260922153110_0395_remove_preenchimento_de_campos_do_funil.sql::agent_inbox_items_kind_check": { ... },`, acrescente:

```typescript
  "20260926190000_0424_sai_o_preenchimento_de_campos_do_funil_pela_ia.sql::agent_inbox_items_kind_check": {
    valores: ["lead_field_proposed"],
    porque:
      "Remoção DELIBERADA, a segunda do mesmo valor: a 0395 o tirou, a 0397 o " +
      "restaurou por ordem revertida do dono, e em 26/09/2026 o dono decidiu tirar " +
      "de novo — fica só a versão do upstream dos campos do funil, que não tem " +
      "sugestão de campo pela IA. As linhas existentes viram `other` ANTES da " +
      "reconstrução, na própria migration e no bloco único do baseline.",
  },
```

- [ ] **Step 8: Rodar as cercas de schema**

```bash
npx vitest run tests/unit/kind-check-migration-x-baseline.test.ts tests/unit/migrations-nao-encolhem-vocabulario.test.ts tests/unit/baseline-constraint-reconstruida.test.ts tests/unit/varredura-anon-e-o-ultimo-bloco.test.ts tests/unit/manifest-x-migrations.test.ts tests/unit/manifest-cita-caminho-que-existe.test.ts tests/unit/knob-da-versao-tem-porta.test.ts
pnpm checar:colisao-de-migration
grep -c "lead_field_proposed" supabase/baseline.sql      # 5: comentário e update perto da 9984, e três textos de comentário (26491, 26502, 40983) — nenhum dentro de lista de kind
python -c "
s=open('supabase/baseline.sql',encoding='utf-8').read()
i=s.rfind('create or replace function public.fn_ai_agent_version_content_immutable'); j=s.index('\$fn\$;',i)
print('lead_fields na ultima trava:', 'lead_fields' in s[i:j])"      # False
```

Os seis arquivos existem (medido em 26/09). `knob-da-versao-tem-porta` tem de voltar ao verde aqui.

- [ ] **Step 9: Sabotar** — copie o baseline, devolva a linha `'lead_field_proposed',` ao bloco único, rode `kind-check-migration-x-baseline.test.ts`: tem de falhar (a migration 0424 e o baseline divergem). Restaure da cópia.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20260926190000_0424_sai_o_preenchimento_de_campos_do_funil_pela_ia.sql supabase/baseline.sql supabase/migrations/MANIFEST.md tests/unit/migrations-nao-encolhem-vocabulario.test.ts
git commit -m "feat(db): 0424 tira de novo o schema do preenchimento de campos do funil (P0)"
```

---

### Task 3: Sai "a pergunta que o agente faz" (Configurações › Funis)

A remoção de 22/09 esqueceu esta peça: a caixa continuou na tela, gravando uma chave que ninguém mais lia.

**Files:**
- Modify: `lib/schemas/settings.ts`
- Modify: `lib/schemas/settings.test.ts`
- Modify: `app/app/settings/tenant/pipelines/_client.tsx`
- Modify: `lib/i18n/dicionario.ts`

- [ ] **Step 1: O teste que a chave some sem quebrar** — em `lib/schemas/settings.test.ts`, troque o bloco inteiro:

```typescript
describe("customFieldSchema — a pergunta do dono", () => {
  const base = { key: "segmento", label: "Segmento", type: "text" as const };

  it("aceita campo SEM pergunta — e isto é o que protege o dado já gravado", () => {
    // `camposDoFunil()` roda `safeParse` por item e DESCARTA o que não valida.
    // Se `pergunta` fosse obrigatória, todo campo já gravado sumiria da ficha de
    // todo lead, em toda instalação, no primeiro deploy.
    expect(customFieldSchema.safeParse(base).success).toBe(true);
  });

  it("aceita a pergunta e a devolve", () => {
    const r = customFieldSchema.safeParse({ ...base, pergunta: "Convênio ou particular?" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.pergunta).toBe("Convênio ou particular?");
  });

  it("recusa acima de 200 caracteres — cabe pergunta, não cabe roteiro", () => {
    // Roteiro é `system_prompt`. Misturar os dois faria o prefixo do turno
    // crescer sem teto: cada campo do funil entra nele.
    expect(customFieldSchema.safeParse({ ...base, pergunta: "x".repeat(201) }).success).toBe(false);
    expect(customFieldSchema.safeParse({ ...base, pergunta: "x".repeat(200) }).success).toBe(true);
  });
});
```

por:

```typescript
describe("customFieldSchema — a chave `pergunta` saiu (P0 de 26/09)", () => {
  const base = { key: "segmento", label: "Segmento", type: "text" as const };

  it("campo gravado COM pergunta continua valendo, e a chave é descartada — nenhum campo some da ficha", () => {
    // Funis de clone que usou a caixa têm `pergunta` no jsonb. `camposDoFunil()`
    // descarta o item que não valida: se a chave velha reprovasse, o campo
    // inteiro sumiria da ficha de todo lead daquele funil.
    const r = customFieldSchema.safeParse({ ...base, pergunta: "Convênio ou particular?" });
    expect(r.success).toBe(true);
    expect(r.success && "pergunta" in r.data).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/schemas/settings.test.ts`
Expected: FAIL — `expected true to be false` (a chave ainda existe no schema).

- [ ] **Step 3: Tirar a chave do schema** — em `lib/schemas/settings.ts`, apague o bloco que começa em `  /**` + `   * A PERGUNTA QUE O AGENTE FAZ, escrita pelo dono.` e termina em `  pergunta: z.string().max(200).optional(),` (20 linhas), deixando o objeto terminar em:

```typescript
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .optional(),
});
export type CustomFieldDef = z.infer<typeof customFieldSchema>;
```

- [ ] **Step 4: Tirar a caixa da tela** — em `app/app/settings/tenant/pipelines/_client.tsx`, apague o bloco que começa em `            {/* A PERGUNTA QUE O AGENTE FAZ, na voz de quem conhece o cliente.` e termina no `            />` do `<Input ... value={f.pergunta ?? ""} .../>` (23 linhas), deixando:

```tsx
                }}
              />
            )}
          </div>
        ))}
        {fields.length < 50 && (
```

- [ ] **Step 5: Tirar as duas traduções** — em `lib/i18n/dicionario.ts`, apague:

```typescript
  "Pergunta que o agente faz": { es: "Pregunta que hace el agente" },
  "Pergunta que o agente faz (opcional) — ex.: você atende convênio ou particular?": {
    es: "Pregunta que hace el agente (opcional) — ej.: ¿atiendes por seguro médico o particular?",
  },
```

- [ ] **Step 6: Rodar e ver passar**

```bash
npx vitest run lib/schemas/settings.test.ts app/app/settings/tenant/pipelines tests/unit/i18n-espanhol-cobre-a-tela.test.ts
git grep -n "pergunta" -- lib/schemas/settings.ts app/app/settings/tenant/pipelines/_client.tsx   # vazio
pnpm typecheck && pnpm lint
```

- [ ] **Step 7: Commit**

```bash
git add lib/schemas/settings.ts lib/schemas/settings.test.ts app/app/settings/tenant/pipelines/_client.tsx lib/i18n/dicionario.ts
git commit -m "remove(funis): sai a pergunta que o agente faz — a caixa gravava o que ninguem le (P0)"
```

---

### Task 4: A passagem ao humano deixa de listar campos obrigatórios em branco

Sem a IA preenchendo, todo campo obrigatório está em branco na passagem, e a lista viraria ruído em toda conversa. Os dois arquivos voltam a ser o que são na versão do Rafael (o diff contra `origin/main` é só este acréscimo: `+47` e `+48`, zero linha removida).

**Files:**
- Modify: `lib/ai/handoff/orchestrator.ts`
- Modify: `lib/leads/campos-do-funil.ts`
- Delete: `lib/leads/campos-do-funil.obrigatorios.test.ts`

- [ ] **Step 1: `orchestrator.ts`** — apague a linha 3:

```typescript
import { camposDoFunil, obrigatoriosEmBranco, settingsDoEmbed } from "@/lib/leads/campos-do-funil";
```

Apague o bloco inteiro que começa em `      // ⛔ O QUE FALTA PREENCHER — DECLARADO, NUNCA COBRADO.` e termina em:

```typescript
        return Promise.race([leitura, semResposta]);
      })();

```

(o bloco fica entre `      await guard();` e `      const { error: actErr } = await admin.from("crm_lead_activities").insert({`; `await guard();` fica). E no `payload` da atividade, apague as três linhas:

```typescript
          // Só CHAVES. O valor não entra: este payload é renderizado na tela e
          // viaja em captura, exportação e ticket de suporte (§9).
          obrigatorios_em_branco: obrigatoriosEmBrancoDoLead,
```

- [ ] **Step 2: `campos-do-funil.ts`** — apague do fim do arquivo o bloco que começa em `/**` + ` * O QUE FALTA PREENCHER, por CHAVE — nunca por valor.` até o `}` que fecha `export function obrigatoriosEmBranco(...)` (48 linhas), e a linha em branco que o antecede. O arquivo termina em `  return settings as Record<string, unknown>;` + `}`.

- [ ] **Step 3: Apagar o teste da função que saiu**

```bash
git rm -q lib/leads/campos-do-funil.obrigatorios.test.ts
```

- [ ] **Step 4: Conferir que ficou igual ao upstream**

```bash
git fetch origin
git diff origin/main -- lib/ai/handoff/orchestrator.ts lib/leads/campos-do-funil.ts   # vazio
git grep -n "obrigatoriosEmBranco\|obrigatorios_em_branco" -- lib app components tests   # vazio
```

Se o primeiro `diff` não vier vazio, **pare e reporte** o que sobrou: alguém mexeu nesses arquivos depois de 26/09.

- [ ] **Step 5: Rodar**

```bash
npx vitest run lib/ai/handoff lib/leads tests/unit/passagem
pnpm typecheck && pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add lib/ai/handoff/orchestrator.ts lib/leads/campos-do-funil.ts
git commit -m "remove(handoff): a passagem deixa de listar campos obrigatorios em branco (P0)"
```

---

### Task 5: Fechamento

- [ ] **Step 1: Régua final contra o retrato da Task 0**

```bash
npx vitest run pacote catalogo knob vocabulario kind-check inbox escopo negocio prefixo lib/mcp/tools lib/ai/runtime lib/agent-engine/agent lib/leads app/app/ai/agents app/api/v1/leads app/api/v1/ai/agents lib/ai/agents lib/schemas app/app/settings/tenant/pipelines lib/ai/handoff > "$TMP/p0-depois.log" 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " "$TMP/p0-depois.log" | tail -3
grep -aE "^ *FAIL " "$TMP/p0-depois.log" | sed 's/ > .*//' | sort | uniq -c
pnpm typecheck && pnpm lint && pnpm lint:channels && pnpm release:conferir
```

O número de arquivos de teste CAI (os testes da camada foram apagados); o que importa é: nenhum FAIL que não estava no retrato.

- [ ] **Step 2: Relatório para a sessão Claude** — os commits, os rodapés antes/depois, a saída de `pnpm checar:colisao-de-migration`, o número de migration usado e a sabotagem da Task 2. **Não empurre.** Lembre no relatório que `test:db` (install e update do baseline com a 0424) só roda no CI (`invariants`).

## Roteiro de prova na tela (para o dono)

1. IA › Agentes › abrir um agente: os interruptores "Perguntar e preencher os campos do funil" e "Sugerir um campo novo quando faltar" não aparecem mais.
2. Configurações › Funis › um funil com campos: cada campo tem chave, rótulo, tipo e opções — sem a caixa "Pergunta que o agente faz". Salvar funciona.
3. Conversar com o agente no WhatsApp de teste: ele atende normalmente e não grava nada nos campos do negócio. Abrir o negócio e preencher um campo à mão: grava.
4. **Erro de propósito:** abrir a Central de avisos — um aviso antigo de "sugestão de campo" (se existia) aparece como aviso genérico e pode ser resolvido.

## Medição da Task 1 (26/09, cópia descartável de `5d8f8437d` com o Step 1 aplicado)

- `git revert --no-commit ee6e0d86e`: 12 D, 29 M, zero conflito.
- `tsc --noEmit -p tsconfig.typecheck.json`: 0 erros.
- Testes da área (o comando do Step 4): `Test Files 1 failed | 141 passed (142)`, `Tests 1 failed | 1620 passed (1621)`. O único FAIL é `knob-da-versao-tem-porta` (explicado no Step 4), que a Task 2 fecha.

## Self-Review

- Goal coberto: código (Task 1), schema (Task 2), a caixa órfã na tela de Funis (Task 3) e a leitura na passagem (Task 4) — as quatro pontas que a remoção de 22/09 deixou ou não alcançava.
- O que fica (Global Constraints) está listado e nenhuma tarefa toca esses arquivos.
- Tripla de migration na Task 2, no mesmo commit, com a remoção deliberada registrada na cerca de vocabulário.
- Nenhum `create function` depois da varredura de `anon`.
- Este plano não pertence à spec de propostas (`docs/superpowers/specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md`) e não deve ser citado nela — é assunto de CRM/funil, decidido na mesma conversa por coincidência de tema.
