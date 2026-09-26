# Propostas N2 — aviso na Central quando a proposta precisa de revisão

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** A spec original já previa isto (§4, item [4]-[5]): quando a IA rascunha uma proposta sem preço de catálogo, "abre o aviso interno" e "Entra na Central (não some com o alerta) e acompanha a proposta até ter valor". Isso nunca foi construído. Com o plano N1 (a IA sugere modelo, uma pessoa confirma), toda proposta rascunhada por IA nasce precisando de pelo menos uma confirmação humana — então o aviso passa a cobrir os dois motivos: falta confirmar o modelo, falta precificar. **Depende do plano N1 já aplicado** (usa a rota `PATCH /api/v1/proposals/[id]/modelo` que o N1 cria).

**Architecture:** Um `kind` novo em `agent_inbox_items` (`proposta_pronta_para_revisao`), aberto quando `crm_draft_proposal` cria o rascunho, e fechado (`status = 'resolved'`) assim que a proposta deixa de precisar de revisão — modelo confirmado E preço resolvido — ou quando ela é enviada/descartada. Uma função utilitária central (`lib/propostas/aviso-de-revisao.ts`) concentra abrir/fechar, chamada dos quatro pontos que mudam esse estado, para a lógica de "está pronta?" existir em um lugar só.

**Tech Stack:** Supabase JS client (mesmo client que as rotas/tools já usam — não é o `pg.Pool` do agent-engine), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-proposta-comercial-templates-design.md` (§4, itens [4]-[5]: "abre o aviso interno"; "Entra na Central (...) e acompanha a proposta até ter valor"). Este plano estende a régua da spec (que falava só de preço) para cobrir também "falta confirmar modelo", por decisão do dono do produto em 25/09/2026: "IA sugere, você confirma" implica que toda sugestão pendente é, por si, motivo de aviso.

## Global Constraints

- `InboxKind` (`lib/agent-engine/db/repository.ts`) é um `type` usado por `satisfies Record<InboxKind, ...>` em `lib/ai/inbox-destino.ts` e `lib/ai/agent-inbox-copy.ts` — **os três arquivos mudam juntos**, ou o TypeScript reprova a build inteira (é a cerca deliberada contra "vocabulário do banco sem o TypeScript saber", `tests/invariants/vocabulario-banco-x-typescript.test.ts`).
- O CHECK `agent_inbox_items_kind_check` só tem **um bloco** no `baseline.sql` (edição in-place) — nunca crie um segundo bloco. A nova migration é a que passa a ser a **última da cadeia a reconstruir a constraint**: ela precisa repetir TODOS os valores atuais (`migrations-nao-encolhem-vocabulario.test.ts` reprova se faltar um).
- Emissão de aviso usa o padrão Supabase já em uso em `app/api/v1/cron/proposal-promised-not-created/route.ts`: checar existente com `.eq("status", "open")` antes de inserir — nunca o helper `insertInboxItem` de `lib/agent-engine/db/repository.ts`, que é para o `pg.Pool` cru do agent-engine, não para o client Supabase das rotas/tools MCP.
- `ref_kind: "proposal"` já existe em `REFERENCIAS_DE_AVISO` (`lib/ai/inbox-destino.ts`) apontando para `/app/proposals/${id}` — reuse, não crie um novo.
- Toda emissão/resolução de aviso é fire-and-forget (nunca derruba a resposta principal da rota/tool) — mesmo padrão de `emitLeadActivity` já usado em `crm_draft_proposal`.
- Próximo número de migration livre: confira de novo com `pnpm checar:colisao-de-migration` antes de aplicar (o N1 já usa `0422`; este plano usa `0423`, mas pode ter mudado se outro trabalho entrou no meio).

## Review Focus

- Duas propostas do mesmo negócio, uma resolvida e uma nova aberta depois — o dedupe é por `(kind, status='open', ref_id)`, então resolver a antiga não pode impedir abrir aviso para a nova (dedupe é sobre `status='open'`, não sobre o par kind+ref para sempre).
- A proposta é **descartada** (DELETE) ainda com aviso aberto — o aviso tem que ser resolvido, senão fica um aviso apontando para uma proposta que não existe mais.
- A proposta ganha modelo confirmado mas **ainda falta preço** (ou vice-versa) — o aviso **não pode fechar sozinho** só porque uma das duas pendências sumiu; a função de resolução confere as duas condições, não uma.
- `pricing_status` chega como `'manual'` (preço digitado à mão, sem catálogo) — isso conta como "resolvido" para este aviso (a spec diz "até ter valor", e manual tem valor); só `'missing'` é pendência de preço.
- Uma organização sem a capacidade "propostas" ligada não deve nunca ver este aviso — mas como `crm_draft_proposal` já recusa a chamada inteira nesse caso (linha 65-67 do arquivo), não há caminho para o aviso nascer órfão; um teste documenta essa garantia por trás em vez de reimplementar a checagem.

---

### Task 1: Migration — novo `kind` no vocabulário de avisos

**Files:**
- Create: `supabase/migrations/20260925230000_0423_proposta_pronta_para_revisao.sql`
- Modify: `supabase/baseline.sql` (o único bloco de `agent_inbox_items_kind_check`)
- Modify: `supabase/migrations/MANIFEST.md`

**Interfaces:**
- Produces: valor `'proposta_pronta_para_revisao'` aceito por `agent_inbox_items.kind`.

- [ ] **Step 1: Medir a lista COMPLETA atual antes de escrever a migration**

```bash
python3 -c "
s=open('supabase/baseline.sql', encoding='utf-8').read()
i = s.find('add constraint agent_inbox_items_kind_check')
j = s.find('));', i)
print(s[i:j+3])
"
```

Copie a lista exata que aparece — ela é a base da Task, e **não** deve ser digitada de memória (o `CLAUDE.md` documenta que confiar em uma cópia anterior já causou perda de vocabulário nesta mesma branch).

- [ ] **Step 2: Escrever a migration**

Monte o arquivo reconstruindo o CHECK com a lista medida no Step 1 **mais** o valor novo. Estrutura (substitua `<LISTA MEDIDA>` pelo texto exato copiado no Step 1, sem tirar nem adicionar nenhum outro valor):

```sql
-- 0423 — a Central avisa quando uma proposta rascunhada pela IA precisa de
-- revisão humana: falta confirmar o modelo sugerido (plano N1) ou falta
-- preço de catálogo (§4 da spec de modelos, item [4]-[5] — "abre o aviso
-- interno... acompanha a proposta até ter valor"). Nasce ao rascunhar
-- (lib/mcp/tools/propostas.ts) e se resolve sozinho quando as duas
-- pendências somem, ou quando a proposta é enviada ou descartada
-- (lib/propostas/aviso-de-revisao.ts).
alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;
alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    <LISTA MEDIDA, uma por linha, EXATAMENTE como veio do Step 1>,
    'proposta_pronta_para_revisao',
    'other'
  ));
```

⚠️ O `'other'` já está na lista medida — não duplique. Ajuste a lista final para ter cada valor uma única vez, com `'proposta_pronta_para_revisao'` inserida antes de `'other'` (convenção do arquivo: `'other'` sempre por último).

- [ ] **Step 3: Espelhar no apêndice do `baseline.sql`**

O CHECK do baseline é **um bloco só** (doutrina "migrations não encolhem vocabulário"). Edite in-place o `add constraint agent_inbox_items_kind_check check (kind in (...))` encontrado no Step 1, acrescentando `'proposta_pronta_para_revisao',` antes de `'other'` — não crie um segundo bloco, não duplique o `create constraint`.

- [ ] **Step 4: Rodar as cercas de vocabulário localmente**

```bash
npx vitest run tests/unit/check-do-baseline-nao-diverge-da-cadeia.test.ts tests/unit/migrations-nao-encolhem-vocabulario.test.ts tests/unit/kind-check-migration-x-baseline.test.ts
```

Expected: PASS nos três (é a mesma cerca que reprovou o CI mais cedo nesta sessão — ela existe exatamente para este tipo de mudança).

- [ ] **Step 5: Linha no MANIFEST**

Adicione a linha no formato das vizinhas.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260925230000_0423_proposta_pronta_para_revisao.sql supabase/baseline.sql supabase/migrations/MANIFEST.md
git commit -m "feat(db): novo kind proposta_pronta_para_revisao (N2)"
```

---

### Task 2: `InboxKind`, rótulo e roteamento

**Files:**
- Modify: `lib/agent-engine/db/repository.ts`
- Modify: `lib/ai/agent-inbox-copy.ts`
- Modify: `lib/ai/inbox-destino.ts`

**Interfaces:**
- Produces: `InboxKind` inclui `'proposta_pronta_para_revisao'`; `TITULO_DO_KIND`/`POLITICAS_DE_AVISO` (nomes exatos — confira no arquivo, podem ter nome diferente do que a memória sugere) cobrem o valor novo.

- [ ] **Step 1: `InboxKind`**

Em `lib/agent-engine/db/repository.ts`, no union `InboxKind`, acrescente (respeitando o padrão de comentário de proveniência das linhas vizinhas):

```typescript
  // (migration 0423) A proposta rascunhada pela IA falta confirmar o modelo
  // (plano N1) ou falta preço de catálogo — a Central acompanha até resolver.
  | 'proposta_pronta_para_revisao'
```

Insira antes de `| 'other';` (última linha do union).

- [ ] **Step 2: Rótulo em `agent-inbox-copy.ts`**

Localize o objeto `satisfies Record<InboxKind, string>` (o de títulos — confira o nome exato da constante no arquivo antes de editar, ex. algo como `TITULO_DO_KIND`). Acrescente, antes da entrada `other:`:

```typescript
  proposta_pronta_para_revisao: "Uma proposta está pronta para revisão",
```

- [ ] **Step 3: Roteamento em `inbox-destino.ts`**

No objeto `POLITICAS_DE_AVISO` (`satisfies Record<InboxKind, Politica>`), acrescente, antes de `other:`:

```typescript
  proposta_pronta_para_revisao: {
    refs: ["proposal"],
    orientacao: "A IA rascunhou esta proposta — confirme o modelo sugerido (ou escolha outro) e confira se todos os itens têm preço antes de enviar.",
  },
```

- [ ] **Step 4: Rodar o typecheck**

Run: `npx tsc --noEmit -p tsconfig.typecheck.json`
Expected: sem erro em nenhum dos três arquivos (o `satisfies` reprovaria em compile-time se faltasse alguma entrada).

- [ ] **Step 5: Rodar o invariante de vocabulário banco×TypeScript**

```bash
npx vitest run tests/invariants/vocabulario-banco-x-typescript.test.ts
```

Expected: PASS. Se este projeto exigir Postgres real e não rodar localmente (confira `CLAUDE.md`, seção de testes — pode precisar de `pnpm test:db`), pule este step localmente e confie no CI (`invariants`), documentando isso no commit.

- [ ] **Step 6: Commit**

```bash
git add lib/agent-engine/db/repository.ts lib/ai/agent-inbox-copy.ts lib/ai/inbox-destino.ts
git commit -m "feat(propostas): vocabulário TypeScript do novo aviso (N2)"
```

---

### Task 3: Função central de abrir/fechar o aviso

**Files:**
- Create: `lib/propostas/aviso-de-revisao.ts`
- Create: `lib/propostas/aviso-de-revisao.test.ts`

**Interfaces:**
- Produces:
  - `avisarQuePropostaPrecisaDeRevisao(supabase, organizationId, propostaId): Promise<void>` — fire-and-forget, nunca lança.
  - `resolverAvisoDeRevisaoSeProntaOuEncerrada(supabase, organizationId, propostaId, opts?: { forcar?: boolean }): Promise<void>` — fire-and-forget, nunca lança. `forcar: true` resolve incondicionalmente (usado por enviar/descartar); sem `forcar`, só resolve se `template_slug` não é nulo E `pricing_status !== 'missing'`.
- Consumes: nenhuma dependência nova — usa só o client Supabase já injetado por quem chama.

- [ ] **Step 1: Escrever o teste que falha primeiro**

```typescript
// lib/propostas/aviso-de-revisao.test.ts
import { describe, expect, it, vi } from "vitest";
import { avisarQuePropostaPrecisaDeRevisao, resolverAvisoDeRevisaoSeProntaOuEncerrada } from "./aviso-de-revisao";

function montarSupabaseMock(opts: {
  avisoAbertoExistente?: boolean;
  proposta?: { template_slug: string | null; pricing_status: string };
}) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.update = (patch: Record<string, unknown>) => {
      updates.push({ table, patch });
      return chain;
    };
    chain.insert = (row: Record<string, unknown>) => {
      inserts.push(row);
      return chain;
    };
    chain.maybeSingle = async () => {
      if (table === "agent_inbox_items") return { data: opts.avisoAbertoExistente ? { id: "aviso-1" } : null, error: null };
      if (table === "crm_proposals") return { data: opts.proposta ?? null, error: null };
      return { data: null, error: null };
    };
    return chain;
  };
  return { from, inserts, updates };
}

describe("avisarQuePropostaPrecisaDeRevisao", () => {
  it("insere um aviso quando não há um já aberto para esta proposta", async () => {
    const db = montarSupabaseMock({ avisoAbertoExistente: false });
    await avisarQuePropostaPrecisaDeRevisao(db as never, "org-1", "prop-1");
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({
      organization_id: "org-1",
      kind: "proposta_pronta_para_revisao",
      ref_kind: "proposal",
      ref_id: "prop-1",
      status: "open",
    });
  });

  it("não insere de novo quando já há um aviso aberto para esta proposta", async () => {
    const db = montarSupabaseMock({ avisoAbertoExistente: true });
    await avisarQuePropostaPrecisaDeRevisao(db as never, "org-1", "prop-1");
    expect(db.inserts).toHaveLength(0);
  });
});

describe("resolverAvisoDeRevisaoSeProntaOuEncerrada", () => {
  it("resolve quando modelo confirmado E preço não está 'missing'", async () => {
    const db = montarSupabaseMock({ proposta: { template_slug: "site_institucional", pricing_status: "catalog" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]!.patch).toMatchObject({ status: "resolved" });
  });

  it("NÃO resolve quando falta modelo, mesmo com preço ok", async () => {
    const db = montarSupabaseMock({ proposta: { template_slug: null, pricing_status: "catalog" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toHaveLength(0);
  });

  it("NÃO resolve quando falta preço, mesmo com modelo confirmado", async () => {
    const db = montarSupabaseMock({ proposta: { template_slug: "site_institucional", pricing_status: "missing" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toHaveLength(0);
  });

  it("com forcar: true, resolve mesmo faltando as duas pendências (envio/descarte)", async () => {
    const db = montarSupabaseMock({ proposta: { template_slug: null, pricing_status: "missing" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1", { forcar: true });
    expect(db.updates).toHaveLength(1);
  });

  it("preço 'manual' (digitado à mão, sem catálogo) conta como resolvido — só 'missing' é pendência", async () => {
    const db = montarSupabaseMock({ proposta: { template_slug: "site_institucional", pricing_status: "manual" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]!.patch).toMatchObject({ status: "resolved" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/aviso-de-revisao.test.ts`
Expected: FAIL — `Cannot find module './aviso-de-revisao'`.

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/aviso-de-revisao.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Abre o aviso "proposta pronta para revisão" na Central quando a IA rascunha
 * uma proposta — ela sempre nasce sem modelo confirmado (plano N1) e pode
 * nascer sem preço de catálogo. Fire-and-forget: erro aqui nunca derruba a
 * criação do rascunho, mesmo padrão de `emitLeadActivity`.
 */
export async function avisarQuePropostaPrecisaDeRevisao(
  supabase: SupabaseClient,
  organizationId: string,
  propostaId: string,
): Promise<void> {
  try {
    const { data: existente } = await supabase
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("kind", "proposta_pronta_para_revisao")
      .eq("ref_id", propostaId)
      .eq("status", "open")
      .maybeSingle();
    if (existente) return;

    const { error } = await supabase.from("agent_inbox_items").insert({
      organization_id: organizationId,
      kind: "proposta_pronta_para_revisao",
      severity: "info",
      title: "Uma proposta está pronta para revisão",
      body: "A IA rascunhou uma proposta. Confirme o modelo sugerido (ou escolha outro) e confira o preço antes de enviar.",
      ref_kind: "proposal",
      ref_id: propostaId,
      status: "open",
    });
    if (error) {
      logger.error("[aviso-de-revisao] falha ao abrir aviso na Central", { error: error.message, propostaId });
    }
  } catch (e) {
    logger.error("[aviso-de-revisao] falha inesperada ao abrir aviso", { error: String(e), propostaId });
  }
}

/**
 * Fecha o aviso quando a proposta deixa de precisar de revisão — modelo
 * confirmado E preço resolvido (`pricing_status !== 'missing'`) — ou,
 * com `forcar: true`, incondicionalmente (proposta enviada ou descartada:
 * não faz mais sentido revisar o que não está mais em rascunho).
 */
export async function resolverAvisoDeRevisaoSeProntaOuEncerrada(
  supabase: SupabaseClient,
  organizationId: string,
  propostaId: string,
  opts: { forcar?: boolean } = {},
): Promise<void> {
  try {
    if (!opts.forcar) {
      const { data: proposta } = await supabase
        .from("crm_proposals")
        .select("template_slug, pricing_status")
        .eq("organization_id", organizationId)
        .eq("id", propostaId)
        .maybeSingle();
      const p = proposta as { template_slug: string | null; pricing_status: string } | null;
      const pronta = p !== null && p.template_slug !== null && p.pricing_status !== "missing";
      if (!pronta) return;
    }

    const { error } = await supabase
      .from("agent_inbox_items")
      .update({ status: "resolved" })
      .eq("organization_id", organizationId)
      .eq("kind", "proposta_pronta_para_revisao")
      .eq("ref_id", propostaId)
      .eq("status", "open");
    if (error) {
      logger.error("[aviso-de-revisao] falha ao resolver aviso na Central", { error: error.message, propostaId });
    }
  } catch (e) {
    logger.error("[aviso-de-revisao] falha inesperada ao resolver aviso", { error: String(e), propostaId });
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/aviso-de-revisao.test.ts`
Expected: PASS 7/7

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/aviso-de-revisao.ts lib/propostas/aviso-de-revisao.test.ts
git commit -m "feat(propostas): função central de abrir/fechar o aviso de revisão (N2)"
```

---

### Task 4: Ligar a emissão e a resolução nos 4 pontos que mudam o estado

**Files:**
- Modify: `lib/mcp/tools/propostas.ts` (abre)
- Modify: `app/api/v1/proposals/[id]/modelo/route.ts` (resolve se pronta — depende do plano N1 já aplicado)
- Modify: `app/api/v1/proposals/[id]/route.ts` (resolve se pronta, no PATCH de itens)
- Modify: `app/api/v1/proposals/[id]/send/route.ts` (resolve com `forcar: true`)
- Modify: `app/api/v1/proposals/[id]/route.ts` (resolve com `forcar: true`, no DELETE)
- Modify os `.test.ts` correspondentes de cada arquivo acima.

**Interfaces:**
- Consumes: `avisarQuePropostaPrecisaDeRevisao`, `resolverAvisoDeRevisaoSeProntaOuEncerrada` (Task 3).

- [ ] **Step 1: Teste — `crm_draft_proposal` abre o aviso**

Em `lib/mcp/tools/propostas.test.ts`, acrescente:

```typescript
it("abre o aviso de revisão na Central ao criar o rascunho", async () => {
  // mock avisarQuePropostaPrecisaDeRevisao via vi.mock("@/lib/propostas/aviso-de-revisao", ...)
  await crmDraftProposal.handler({ lead_id: LEAD_ID, conversation_id: CONVERSATION_ID, titulo: "Orçamento", itens: [{ descricao: "Item", quantidade: 1 }] }, ctx);
  expect(avisarQuePropostaPrecisaDeRevisaoMock).toHaveBeenCalledWith(ctx.supabase, ctx.organizationId, expect.any(String));
});
```

Adicione `vi.mock("@/lib/propostas/aviso-de-revisao", () => ({ avisarQuePropostaPrecisaDeRevisao: vi.fn(async () => undefined) }));` no topo do arquivo, e importe o mock para a asserção (padrão `import { avisarQuePropostaPrecisaDeRevisao as avisarQuePropostaPrecisaDeRevisaoMock } from "@/lib/propostas/aviso-de-revisao";`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/mcp/tools/propostas.test.ts`
Expected: FAIL — a função nunca é chamada.

- [ ] **Step 3: Implementar em `crm_draft_proposal`**

Em `lib/mcp/tools/propostas.ts`, adicione o import:

```typescript
import { avisarQuePropostaPrecisaDeRevisao } from "@/lib/propostas/aviso-de-revisao";
```

Logo após o bloco de `emitLeadActivity` (antes do `void audit(...)`), acrescente:

```typescript
    void avisarQuePropostaPrecisaDeRevisao(ctx.supabase, ctx.organizationId, proposta.id);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/mcp/tools/propostas.test.ts`
Expected: PASS

- [ ] **Step 5: Teste — confirmar modelo tenta resolver**

Em `app/api/v1/proposals/[id]/modelo/route.test.ts` (do plano N1), acrescente:

```typescript
it("ao confirmar modelo com preço já ok, resolve o aviso de revisão", async () => {
  // proposta com pricing_status: "catalog" (preço já ok), sem template_slug
  const res = await PATCH(reqComBody({ template_slug: "landing_page" }), ctx("prop-1"));
  expect(res.status).toBe(200);
  expect(resolverAvisoDeRevisaoSeProntaOuEncerradaMock).toHaveBeenCalledWith(expect.anything(), authzOrgId, "prop-1");
});
```

- [ ] **Step 6: Rodar e ver falhar, então implementar**

Em `app/api/v1/proposals/[id]/modelo/route.ts`, importe `resolverAvisoDeRevisaoSeProntaOuEncerrada` e chame-a (fire-and-forget) logo após o `.update({...})` que confirma o modelo, antes do `void audit(...)`:

```typescript
  void resolverAvisoDeRevisaoSeProntaOuEncerrada(admin, authz.org.orgId, id);
```

Run: `npx vitest run app/api/v1/proposals/[id]/modelo/route.test.ts` → Expected: PASS.

- [ ] **Step 7: Teste — PATCH de itens tenta resolver**

Em `app/api/v1/proposals/[id]/route.test.ts` (crie o arquivo se não existir, seguindo o padrão de outro teste de rota do diretório), acrescente um caso equivalente ao Step 5, mas disparando o `PATCH` principal (edição de itens) com itens que resultam em `pricing_status` diferente de `missing`.

- [ ] **Step 8: Implementar no PATCH principal**

Em `app/api/v1/proposals/[id]/route.ts`, importe `resolverAvisoDeRevisaoSeProntaOuEncerrada` e chame-a (fire-and-forget) depois do `.update(...)` que grava os itens/pricing_status resolvidos, antes de devolver a resposta.

- [ ] **Step 9: Teste + implementação — `send` resolve com `forcar: true`**

Em `app/api/v1/proposals/[id]/send/route.test.ts`, acrescente um caso: ao enviar com sucesso, `resolverAvisoDeRevisaoSeProntaOuEncerradaMock` foi chamado com `{ forcar: true }`.

Em `app/api/v1/proposals/[id]/send/route.ts`, importe a função e chame-a (fire-and-forget) depois que o envio é confirmado com sucesso:

```typescript
  void resolverAvisoDeRevisaoSeProntaOuEncerrada(admin, authz.org.orgId, id, { forcar: true });
```

- [ ] **Step 10: Teste + implementação — `DELETE` resolve com `forcar: true`**

No `DELETE` de `app/api/v1/proposals/[id]/route.ts`, mesmo padrão do Step 9: chame `resolverAvisoDeRevisaoSeProntaOuEncerrada(supabase, authz.org.orgId, id, { forcar: true })` (fire-and-forget) após o delete bem-sucedido, e o teste correspondente confirmando a chamada.

- [ ] **Step 11: Rodar a suíte inteira dos arquivos tocados**

```bash
npx vitest run lib/mcp/tools/propostas.test.ts "app/api/v1/proposals/[id]/modelo/route.test.ts" "app/api/v1/proposals/[id]/route.test.ts" "app/api/v1/proposals/[id]/send/route.test.ts"
```

Expected: PASS em todos.

- [ ] **Step 12: Commit**

```bash
git add lib/mcp/tools/propostas.ts "app/api/v1/proposals/[id]/modelo/route.ts" "app/api/v1/proposals/[id]/route.ts" "app/api/v1/proposals/[id]/send/route.ts" lib/mcp/tools/propostas.test.ts "app/api/v1/proposals/[id]/modelo/route.test.ts" "app/api/v1/proposals/[id]/route.test.ts" "app/api/v1/proposals/[id]/send/route.test.ts"
git commit -m "feat(propostas): abre e fecha o aviso de revisão nos 4 pontos que mudam o estado (N2)"
```

---

## Self-Review (já aplicado ao escrever este plano)

1. **Cobertura da spec:** abrir (Task 4, Step 1-4) e fechar por completude (Task 4, Steps 5-10) e por encerramento (envio/descarte, Steps 9-10) — os dois motivos da spec (modelo e preço) na mesma função de decisão (Task 3).
2. **Placeholders:** nenhum — todo passo tem código completo, exceto o texto da lista medida na Task 1 Step 2, que é medição obrigatória (nunca hardcode).
3. **Consistência de tipos:** `resolverAvisoDeRevisaoSeProntaOuEncerrada(supabase, organizationId, propostaId, opts?)` usado com a MESMA assinatura nos 4 call sites da Task 4.
4. **Review Focus:** as 5 linhas do topo têm teste dedicado — dedupe por status aberto (Task 3, teste "não insere de novo..."), delete resolve com `forcar: true` (Task 4, Step 10), as duas condições independentes (Task 3, testes "NÃO resolve quando falta..."), `pricing_status: manual` conta como resolvido (Task 3, teste dedicado "preço 'manual'..."), capacidade desligada não é caminho alcançável (documentado na constraint do handler de `crm_draft_proposal`, não testado de novo aqui).
