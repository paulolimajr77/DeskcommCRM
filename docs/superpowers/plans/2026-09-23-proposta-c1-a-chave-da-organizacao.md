# Proposta — C1: a chave "Propostas" passa a valer · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer `organizations.settings.proposals.enabled` desligar de verdade a proposta comercial (menu, telas, rotas, rotinas e a ferramenta da IA) e fazer a chave do agente `proposal_ai_draft_enabled` tirar a ferramenta de rascunho também quando ela vem pelo pacote `vender`.

**Architecture:** um único leitor puro da configuração da organização (`capacidadesLigadas(settings)`), no molde de `clientePelaAgendaLigado` (`lib/schemas/settings.ts`), mais um leitor assíncrono que nunca lança e falha fechado. A ferramenta de IA declara `capacidade: "propostas"` no catálogo e é filtrada nos mesmos três lugares que já filtram `modulo` (turno do agente, MCP externo, catálogo servido à tela), e o handler recusa sozinho. As rotas e a tela respondem 404, no molde de `app/api/v1/external-db/_falha.ts`. O menu ganha o filtro `capacidade`, irmão do filtro `modulo`.

**Tech Stack:** Next.js 16 (App Router), TypeScript 6 estrito, Supabase JS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-proposta-comercial-design.md` no checkout principal (branch `vps/pljr-combinada`, arquivo **não versionado de propósito**: contém medições do banco de produção e não pode ir para a branch que vira PR). Itens D1 e D2 da §2.

## Global Constraints

- Nada de schema: a chave já existe (`settings.proposals.enabled`, migration 0313) e a coluna do agente também (`proposal_ai_draft_enabled`, migration 0346). **Nenhuma migration neste plano.**
- Leitor nunca lança e **falha fechado**: configuração ausente, malformada ou erro de banco = desligada (mesmo contrato de `modulosLigados()` em `lib/instalacao/modulos.ts`).
- A tela **Configurações › Propostas** (`/app/settings/tenant/proposals` e `/api/v1/settings/proposals`) continua acessível com a chave desligada — é onde se liga.
- O cron `proposal-expiry` **continua rodando** para organização desligada (spec D1: nenhuma proposta enviada morre sem desfecho). Só `proposal-acceptance-rate` e `proposal-promised-not-created` pulam.
- Desligar não apaga nem altera proposta existente.
- Resposta de rota desligada: `fail("not_found", "Not found.", 404, { requestId })` — igual a `seModuloDesligado`.
- Texto de tela novo precisa de espanhol no `lib/i18n/dicionario.ts` (gate `tests/unit/i18n-espanhol-cobre-a-tela.test.ts`).
- Gates locais só: `pnpm typecheck`, `pnpm lint`, os testes dos arquivos mexidos. Suíte inteira, `test:db` e `e2e` são do CI do fork (PR de rascunho #2 em `paulolimajr77/DeskcommCRM`).
- Cada tarefa: teste vermelho → implementação → verde → **sabotagem** (desfazer a linha que conserta e ver o teste ficar vermelho) → commit.

## Review Focus

1. **Organização com `settings.proposals` ausente** (clone que nunca aplicou a 0313): tudo desligado, nada lança — coberto na Tarefa 1.
2. **`settings.proposals.enabled` como string `"true"`** (jsonb escrito à mão): continua desligado; só o booleano `true` liga — coberto na Tarefa 1.
3. **Agente com a ferramenta marcada numa versão publicada ANTES de a organização desligar**: a ferramenta não chega ao turno — coberto na Tarefa 2 (caso "tool_ids contém a ferramenta").
4. **Cliente MCP externo com token válido** chamando `crm_draft_proposal` direto, sem passar pela lista: o handler recusa — coberto na Tarefa 2.
5. **Link direto para `/app/proposals/<id>` com a chave desligada** (favorito, aviso antigo da Central): 404, não tela quebrada — coberto na Tarefa 3.

---

### Task 0: A proposta não aponta para negócio, contato ou conversa de outra organização (D12)

Achado da revisão cega do merge (23/09): `crm_proposal_items` tem a trava
`fn_verificar_org_do_item_da_proposta`, `crm_lead_activities` tem
`trg_validate_activity_lead_org`, e `crm_proposals` **não tem nenhuma**. A RLS de
escrita só confere o `organization_id` da própria linha; um usuário logado da
organização A consegue gravar, pela API do banco, uma proposta de A com `lead_id`
ou `contact_id` de B. As rotas e a ferramenta da IA já conferem o negócio na
organização (medido: `app/api/v1/proposals/route.ts` e `lib/mcp/tools/propostas.ts`
filtram `organization_id`), então não há vazamento de leitura — o defeito é o
vínculo cruzado gravável, e a cascata `on delete` que deixaria B apagar dado de A.

**Esta tarefa É a exceção à linha "Nenhuma migration" das Global Constraints.**

**Files:**
- Create: `supabase/migrations/20260923190000_0398_a_proposta_nao_aponta_para_outra_organizacao.sql`
- Modify: `supabase/baseline.sql` (bloco novo no apêndice, logo depois do bloco `(migration 0313)` da proposta — que fica imediatamente ANTES do bloco `VARREDURA anon ... (migration 0116)`; nenhuma função pode ser criada depois da varredura, regra vigiada por `tests/unit/varredura-anon-e-o-ultimo-bloco.test.ts`)
- Modify: `supabase/migrations/MANIFEST.md`
- Modify: `tests/invariants/rls-isolation.test.ts` (comentários "migration 0275" → "migration 0394")
- Test: `tests/invariants/proposta-nao-aponta-para-outra-organizacao.test.ts`

**Interfaces:**
- Produces: `public.fn_verificar_org_da_proposta()` (função de trigger, `security invoker`) e o trigger `trg_crm_proposals_org_consistente`.

- [ ] **Step 1: Confirmar o número livre**

Run: `pnpm checar:colisao-de-migration`
Expected: a última linha diz `Próximo livre ... NNNN=0398`. Se disser outro número, use-o no nome do arquivo e em todos os rótulos desta tarefa.

- [ ] **Step 2: Write the failing test**

```ts
// tests/invariants/proposta-nao-aponta-para-outra-organizacao.test.ts
import { beforeAll, describe, expect, it } from "vitest";

import { GOV_CONTACT_1, GOV_LEAD, GOV_ORG, lastLine, seedGov, sql } from "./gov-helpers";

/**
 * Uma proposta de uma organização não pode apontar para negócio, contato ou
 * conversa de outra (migration 0398). A RLS confere só o `organization_id` da
 * PRÓPRIA linha; sem o trigger, um usuário da organização vizinha gravava pela
 * API do banco uma proposta dela com o negócio desta.
 */
const ORG_VIZINHA = "cccccccc-9999-4000-8000-000000000398";
const CONTATO_VIZINHO = "cccccccc-9999-4000-8000-000000000399";

function inserir(org: string, lead: string, contato: string): string {
  // Embrulhado num SELECT: com `psql -tA` um INSERT...RETURNING cru imprime
  // também a tag "INSERT 0 1", e `lastLine` leria a tag em vez do id.
  return sql(`
    with p as (
      insert into public.crm_proposals (organization_id, lead_id, contact_id, titulo)
        values ('${org}', '${lead}', '${contato}', 'invariante 0398')
        returning id
    )
    select id from p;
  `);
}

beforeAll(() => {
  seedGov();
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_VIZINHA}', 'gov-inv-0398', 'Gov 0398', 'Gov 0398')
      on conflict do nothing;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO_VIZINHO}', '${ORG_VIZINHA}', 'Vizinho 0398')
      on conflict do nothing;
    delete from public.crm_proposals where titulo = 'invariante 0398';
  `);
});

describe("a proposta não atravessa a organização", () => {
  it("controle positivo: negócio e contato da própria organização gravam", () => {
    const id = lastLine(inserir(GOV_ORG, GOV_LEAD, GOV_CONTACT_1));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    sql(`delete from public.crm_proposals where id = '${id}';`);
  });

  it("negócio de outra organização: recusado", () => {
    expect(() => inserir(ORG_VIZINHA, GOV_LEAD, CONTATO_VIZINHO)).toThrow(/crm_proposal_lead_org_mismatch/);
  });

  it("contato de outra organização: recusado", () => {
    expect(() => inserir(GOV_ORG, GOV_LEAD, CONTATO_VIZINHO)).toThrow(/crm_proposal_contact_org_mismatch/);
  });

  it("UPDATE que troca o negócio por um de outra organização: recusado", () => {
    const id = lastLine(inserir(GOV_ORG, GOV_LEAD, GOV_CONTACT_1));
    try {
      expect(() =>
        sql(`update public.crm_proposals set organization_id = '${ORG_VIZINHA}' where id = '${id}';`),
      ).toThrow(/crm_proposal_lead_org_mismatch/);
    } finally {
      sql(`delete from public.crm_proposals where id = '${id}';`);
    }
  });
});
```

(As colunas de `contacts` e `organizations` são as mesmas que `seedGov()` usa em `tests/invariants/gov-helpers.ts:164-177`.)

- [ ] **Step 3: Run test to verify it fails**

Este teste precisa de Postgres (`pnpm test:db`), que **não roda nesta máquina**. O vermelho é provado no CI: empurre o commit do teste **sozinho** primeiro (Step 4 só depois do CI vermelho no job `invariants`, nos três casos de recusa). Se a janela de CI for cara demais, registre no commit que o vermelho foi provado pela sabotagem do Step 8 em vez disso.

- [ ] **Step 4: A migration**

```sql
-- 20260923190000_0398_a_proposta_nao_aponta_para_outra_organizacao.sql
--
-- Uma proposta não aponta para negócio, contato ou conversa de OUTRA
-- organização. A RLS de `crm_proposals` só confere o `organization_id` da
-- própria linha; sem esta trava, um usuário de A gravava pela API do banco
-- uma proposta de A com o `lead_id` de B — vínculo cruzado que a `on delete
-- cascade` do lead transformaria em B apagando dado de A.
--
-- Mesmo molde de `fn_verificar_org_do_item_da_proposta` (0394) e de
-- `fn_validate_activity_lead_org`. `security invoker`: lê só a linha que o
-- comando já está gravando e as tabelas que quem grava já enxerga.
--
-- Referência NULA passa: `conversation_id` é opcional hoje, e o conserto
-- "a proposta enviada sobrevive ao negócio" (spec D10) vai tornar `lead_id` e
-- `contact_id` anuláveis por `on delete set null` — o UPDATE que a FK dispara
-- nessa hora não pode ser recusado aqui.
--
-- Só vale para escrita NOVA: linha antiga não é revalidada, então o
-- `update.sh` de nenhum clone quebra por dado legado.

create or replace function public.fn_verificar_org_da_proposta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.lead_id is not null and not exists (
    select 1 from public.crm_leads where id = new.lead_id and organization_id = new.organization_id
  ) then
    raise exception 'crm_proposal_lead_org_mismatch' using errcode = '23514';
  end if;
  if new.contact_id is not null and not exists (
    select 1 from public.contacts where id = new.contact_id and organization_id = new.organization_id
  ) then
    raise exception 'crm_proposal_contact_org_mismatch' using errcode = '23514';
  end if;
  if new.conversation_id is not null and not exists (
    select 1 from public.conversations where id = new.conversation_id and organization_id = new.organization_id
  ) then
    raise exception 'crm_proposal_conversation_org_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_verificar_org_da_proposta() from public, anon;

drop trigger if exists trg_crm_proposals_org_consistente on public.crm_proposals;
create trigger trg_crm_proposals_org_consistente
  before insert or update of organization_id, lead_id, contact_id, conversation_id
  on public.crm_proposals
  for each row execute function public.fn_verificar_org_da_proposta();
```

- [ ] **Step 5: O apêndice do baseline e o MANIFEST**

No `supabase/baseline.sql`, imediatamente antes da linha `-- ---- VARREDURA anon: função nova nasce exposta em quem ATUALIZA (migration 0116) ----`, cole o corpo da migration acima (da linha `create or replace function` até o `create trigger`, inclusive), precedido do rótulo:

```sql
-- ---- a proposta não aponta para outra organização (migration 0398) ----
```

No `supabase/migrations/MANIFEST.md`, logo depois da linha `0394_proposta_comercial`:

```
| `20260923190000` | `0398_a_proposta_nao_aponta_para_outra_organizacao` | **Trigger `trg_crm_proposals_org_consistente`: a proposta não grava `lead_id`, `contact_id` nem `conversation_id` de outra organização** — a RLS só conferia o `organization_id` da própria linha. Molde de `fn_verificar_org_do_item_da_proposta`. Referência nula passa (a spec D10 vai tornar `lead_id`/`contact_id` anuláveis); só escrita nova é validada, então o `update.sh` de clone com dado legado não quebra. |
```

Em `tests/invariants/rls-isolation.test.ts`, troque as duas ocorrências de `migration 0275` que se referem a `crm_proposals`/`crm_proposal_items` por `migration 0394` (`grep -n "0275" tests/invariants/rls-isolation.test.ts`).

- [ ] **Step 6: Gates locais**

Run: `pnpm checar:colisao-de-migration && npx vitest run $(ls tests/unit/*.test.ts | grep -iE "baseline|manifest|migration|varredura|kind-check|constraint")`
Expected: sem colisão; PASS em todas — `varredura-anon-e-o-ultimo-bloco` inclusive (foi a cerca que a seleção por nome deixou de fora no merge).

- [ ] **Step 7: CI**

Empurre para o fork e leia o job `invariants` do PR de rascunho #2: o arquivo novo tem de passar nos quatro casos, em install e update.

- [ ] **Step 8: Sabotagem**

Numa rodada de CI descartável (commit de sabotagem que não fica na branch), comente o `raise exception 'crm_proposal_lead_org_mismatch'`: os casos "negócio de outra organização" e "UPDATE" têm de ficar vermelhos no job `invariants`. Reverta o commit de sabotagem.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260923190000_0398_a_proposta_nao_aponta_para_outra_organizacao.sql supabase/baseline.sql supabase/migrations/MANIFEST.md tests/invariants/proposta-nao-aponta-para-outra-organizacao.test.ts tests/invariants/rls-isolation.test.ts
git commit -m "fix(db): a proposta nao aponta para negocio, contato ou conversa de outra organizacao"
```

---

### Task 1: O leitor da capacidade da organização

**Files:**
- Create: `lib/organizacao/capacidades.ts`
- Test: `lib/organizacao/capacidades.test.ts`

**Interfaces:**
- Produces:
  - `export const CAPACIDADES_DA_ORGANIZACAO = ["propostas"] as const;`
  - `export type CapacidadeDaOrganizacao = (typeof CAPACIDADES_DA_ORGANIZACAO)[number];`
  - `export function capacidadesLigadas(settings: unknown): CapacidadeDaOrganizacao[]`
  - `export async function capacidadesDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<CapacidadeDaOrganizacao[]>`

- [ ] **Step 1: Write the failing test**

```ts
// lib/organizacao/capacidades.test.ts
import { describe, expect, it, vi } from "vitest";

import { capacidadesDaOrganizacao, capacidadesLigadas } from "./capacidades";

describe("capacidadesLigadas — só o booleano true liga", () => {
  it("proposals.enabled === true liga propostas", () => {
    expect(capacidadesLigadas({ proposals: { enabled: true } })).toEqual(["propostas"]);
  });
  it("false, ausente, string e lixo: desligado, sem lançar", () => {
    for (const s of [
      { proposals: { enabled: false } },
      { proposals: {} },
      {},
      null,
      undefined,
      "x",
      [],
      { proposals: { enabled: "true" } },
      { proposals: "ligado" },
    ]) {
      expect(capacidadesLigadas(s), JSON.stringify(s)).toEqual([]);
    }
  });
});

function dbQueDevolve(resultado: { data: unknown; error: unknown } | Error) {
  const maybeSingle = vi.fn(async () => {
    if (resultado instanceof Error) throw resultado;
    return resultado;
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { db: { from } as never, from, select, eq };
}

describe("capacidadesDaOrganizacao — falha fechada", () => {
  it("lê a linha da própria organização", async () => {
    const { db, from, eq } = dbQueDevolve({ data: { settings: { proposals: { enabled: true } } }, error: null });
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual(["propostas"]);
    expect(from).toHaveBeenCalledWith("organizations");
    expect(eq).toHaveBeenCalledWith("id", "org-1");
  });
  it("erro do banco = nenhuma capacidade", async () => {
    const { db } = dbQueDevolve({ data: null, error: { message: "boom" } });
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual([]);
  });
  it("exceção = nenhuma capacidade, sem relançar", async () => {
    const { db } = dbQueDevolve(new Error("rede"));
    await expect(capacidadesDaOrganizacao(db, "org-1")).resolves.toEqual([]);
  });
  it("organização inexistente = nenhuma", async () => {
    const { db } = dbQueDevolve({ data: null, error: null });
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/organizacao/capacidades.test.ts`
Expected: FAIL — `Failed to resolve import "./capacidades"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/organizacao/capacidades.ts
/**
 * AS CAPACIDADES DA ORGANIZAÇÃO — o que ESTA empresa ligou para si.
 *
 * Irmã de `lib/instalacao/modulos.ts`, em outro nível: módulo opcional é
 * decisão da INSTALAÇÃO (o dono do servidor); capacidade é decisão da
 * ORGANIZAÇÃO (o administrador da empresa). A doutrina de extensões diz a
 * mesma coisa: "a instância decide o pacote; a organização decide o uso".
 *
 * Só o booleano `true` liga. Ausente, malformado, string ou erro de banco =
 * desligado: falha fechada, como `modulosLigados()`. Nunca lança — roda no
 * layout de `/app` e no turno do agente, e um throw ali derruba a tela ou o
 * atendimento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export const CAPACIDADES_DA_ORGANIZACAO = ["propostas"] as const;
export type CapacidadeDaOrganizacao = (typeof CAPACIDADES_DA_ORGANIZACAO)[number];

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** `organizations.settings` → as capacidades ligadas. Pura; nunca lança. */
export function capacidadesLigadas(settings: unknown): CapacidadeDaOrganizacao[] {
  const propostas = objeto(objeto(settings)?.proposals);
  return propostas?.enabled === true ? ["propostas"] : [];
}

/** Lê a linha da organização. Nunca lança: erro = nenhuma capacidade. */
export async function capacidadesDaOrganizacao(
  db: SupabaseClient,
  organizationId: string,
): Promise<CapacidadeDaOrganizacao[]> {
  try {
    const { data, error } = await db
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .maybeSingle();
    if (error) {
      logger.warn("capacidades da organização: leitura recusada — tratando todas como desligadas", {
        organization_id: organizationId,
        detalhe: (error as { message?: string }).message,
      });
      return [];
    }
    return capacidadesLigadas((data as { settings?: unknown } | null)?.settings);
  } catch (erro) {
    logger.warn("capacidades da organização: leitura falhou — tratando todas como desligadas", {
      organization_id: organizationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/organizacao/capacidades.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Sabotagem**

Troque `propostas?.enabled === true` por `!!propostas?.enabled` e rode de novo: o caso `{ enabled: "true" }` tem de ficar vermelho. Desfaça.

- [ ] **Step 6: Commit**

```bash
git add lib/organizacao/capacidades.ts lib/organizacao/capacidades.test.ts
git commit -m "feat(organizacao): leitor das capacidades ligadas pela organizacao, falha fechada"
```

---

### Task 2: A ferramenta de rascunho respeita as duas chaves (D1 na IA + D2)

**Files:**
- Modify: `lib/mcp/tools/catalogo/tipos.ts` (campo `capacidade` ao lado de `modulo`)
- Modify: `lib/mcp/tools/catalogo/comercio.ts` (entrada `crm_draft_proposal` ganha `capacidade: "propostas"`)
- Modify: `lib/mcp/tools/catalogo/index.ts` (função `deCapacidadeDesligada`)
- Modify: `lib/mcp/tools/catalog.ts` (reexporta `deCapacidadeDesligada`)
- Modify: `lib/ai/runtime/tools.ts` (`PickToolsInput.capacidadesLigadas`; filtro no laço; auto-injeção condicionada; D2)
- Modify: `lib/ai/runtime/agent.ts` (passa `capacidadesLigadas`)
- Modify: `lib/agent-engine/edge/crm/mcp-tools.ts` (passa `capacidadesLigadas`)
- Modify: `lib/mcp/server.ts` (`createMcpServer` ganha o 4º parâmetro)
- Modify: `app/api/mcp/route.ts` (passa as capacidades da organização do token)
- Modify: `app/api/v1/mcp/tools/route.ts` (não oferece à tela a capacidade desligada)
- Modify: `lib/mcp/tools/propostas.ts` (handler recusa com a organização desligada)
- Test: `tests/unit/propostas-a-ferramenta-respeita-as-chaves.test.ts`

**Interfaces:**
- Consumes: `CapacidadeDaOrganizacao`, `capacidadesDaOrganizacao(db, orgId)` da Tarefa 1.
- Produces:
  - `McpToolCatalogEntry.capacidade?: CapacidadeDaOrganizacao`
  - `export function deCapacidadeDesligada(name: string, ligadas: readonly CapacidadeDaOrganizacao[]): boolean`
  - `PickToolsInput.capacidadesLigadas?: readonly CapacidadeDaOrganizacao[]` — **ausente vale como nenhuma** (mesma direção de `modulosLigados`)
  - `createMcpServer(auth, requestId, modulosLigados = [], capacidadesLigadas: readonly CapacidadeDaOrganizacao[] = [])`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/propostas-a-ferramenta-respeita-as-chaves.test.ts
/**
 * A ferramenta `crm_draft_proposal` só chega ao turno com as DUAS chaves
 * ligadas: a da ORGANIZAÇÃO (`settings.proposals.enabled`, D1) e a da VERSÃO
 * DO AGENTE (`proposal_ai_draft_enabled`, D2). Antes, a da organização não era
 * lida por ninguém, e a do agente só impedia o ACRÉSCIMO automático — vinda
 * pelo pacote `vender`, a ferramenta passava com a chave desligada.
 */
import { describe, expect, it, vi } from "vitest";

import { pickToolsFromMcp } from "@/lib/ai/runtime/tools";
import { deCapacidadeDesligada, catalogEntry } from "@/lib/mcp/tools/catalog";
import type { McpAuthResult } from "@/lib/mcp/auth";
import type { McpContext } from "@/lib/mcp/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const DRAFT = "crm_draft_proposal";

function contexto() {
  const ctx = {
    organizationId: ORG,
    role: "ai_operator",
    actor: { type: "ai_agent", id: "agente-1", role: "ai_operator" },
    apiTokenId: "tok-1",
    requestId: "run-1",
    supabase: {} as never,
  } as unknown as McpContext;
  const auth = {
    organizationId: ORG,
    role: "ai_operator",
    actor: ctx.actor,
    apiTokenId: "tok-1",
    scopes: ["mcp:read", "mcp:write", "actor:ai_agent", "role:ai_operator"],
  } as unknown as McpAuthResult;
  return { ctx, auth };
}

function montar(opts: { toolIds: string[]; draft?: boolean; capacidades?: ("propostas")[] }) {
  const { ctx, auth } = contexto();
  return pickToolsFromMcp({
    supabase: ctx.supabase,
    ctx,
    auth,
    toolIds: opts.toolIds,
    handoffToolEnabled: false,
    proposalAiDraftEnabled: opts.draft,
    capacidadesLigadas: opts.capacidades,
    handoffSignal: { triggered: false },
  });
}

describe("o catálogo declara a capacidade", () => {
  it("crm_draft_proposal pertence à capacidade propostas", () => {
    expect(catalogEntry(DRAFT)?.capacidade).toBe("propostas");
  });
  it("deCapacidadeDesligada: desligada sem a capacidade, ligada com ela, neutra para quem não declara", () => {
    expect(deCapacidadeDesligada(DRAFT, [])).toBe(true);
    expect(deCapacidadeDesligada(DRAFT, ["propostas"])).toBe(false);
    expect(deCapacidadeDesligada("crm_search_contacts", [])).toBe(false);
  });
});

describe("o turno do agente", () => {
  it("as duas chaves ligadas: a ferramenta chega (controle positivo)", () => {
    expect(montar({ toolIds: [], draft: true, capacidades: ["propostas"] })).toHaveProperty(DRAFT);
  });
  it("organização desligada: não chega, nem pelo acréscimo automático", () => {
    expect(montar({ toolIds: [], draft: true, capacidades: [] })).not.toHaveProperty(DRAFT);
  });
  it("organização desligada: não chega nem marcada na versão publicada", () => {
    expect(montar({ toolIds: [DRAFT], draft: true, capacidades: [] })).not.toHaveProperty(DRAFT);
  });
  it("capacidades AUSENTES valem como nenhuma", () => {
    expect(montar({ toolIds: [DRAFT], draft: true })).not.toHaveProperty(DRAFT);
  });
  it("D2: chave do agente desligada tira a ferramenta vinda do pacote", () => {
    expect(montar({ toolIds: [DRAFT], draft: false, capacidades: ["propostas"] })).not.toHaveProperty(DRAFT);
  });
  it("D2: chave do agente ausente também tira", () => {
    expect(montar({ toolIds: [DRAFT], capacidades: ["propostas"] })).not.toHaveProperty(DRAFT);
  });
  it("as outras ferramentas não são afetadas", () => {
    expect(montar({ toolIds: ["crm_search_contacts"], capacidades: [] })).toHaveProperty("crm_search_contacts");
  });
});

describe("o handler recusa sozinho (cliente MCP externo que chama direto)", () => {
  it("organização desligada: devolve erro e não escreve", async () => {
    const { crmDraftProposal } = await import("@/lib/mcp/tools/propostas");
    const insert = vi.fn();
    const supabase = {
      from: vi.fn((tabela: string) => {
        if (tabela === "organizations") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { settings: { proposals: { enabled: false } } }, error: null }) }) }),
          };
        }
        return { insert, select: vi.fn(), eq: vi.fn() };
      }),
    };
    const { ctx } = contexto();
    const r = await crmDraftProposal.handler(
      { lead_id: "22222222-2222-4222-8222-222222222222", titulo: "X", itens: [{ descricao: "a", quantidade: 1, preco_unitario_cents: 100 }] },
      { ...ctx, supabase } as never,
    );
    expect(r).toEqual({ error: "Propostas estão desligadas nesta organização." });
    expect(insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/propostas-a-ferramenta-respeita-as-chaves.test.ts`
Expected: FAIL — `deCapacidadeDesligada` não é exportado; `catalogEntry(...).capacidade` é `undefined`.

- [ ] **Step 3: O catálogo ganha `capacidade`**

Em `lib/mcp/tools/catalogo/tipos.ts`, logo depois do campo `modulo?: ModuloOpcional;` (e do comentário dele), acrescente:

```ts
  /**
   * Capacidade que a ORGANIZAÇÃO liga para si (`lib/organizacao/capacidades.ts`).
   * Desligada, a ferramenta não é oferecida a ninguém daquela organização —
   * nem ao agente, nem ao cliente MCP externo, nem à tela que escolhe
   * capacidades — e o handler recusa por conta própria. Ver
   * `deCapacidadeDesligada` em `./index.ts`.
   */
  capacidade?: CapacidadeDaOrganizacao;
```

e no topo do arquivo, junto do import de `ModuloOpcional`:

```ts
import type { CapacidadeDaOrganizacao } from "@/lib/organizacao/capacidades";
```

Em `lib/mcp/tools/catalogo/comercio.ts`, na entrada `name: "crm_draft_proposal"`, acrescente a linha `capacidade: "propostas",` logo depois de `pacotes: ["vender"],`.

Em `lib/mcp/tools/catalogo/index.ts`, logo depois de `deModuloDesligado`:

```ts
/**
 * A capacidade é de algo que a ORGANIZAÇÃO desligou? Então, para ela, a
 * ferramenta não existe. `ligadas` vem de `capacidadesDaOrganizacao()`. Os
 * mesmos três lugares de `deModuloDesligado` passam por aqui.
 */
export function deCapacidadeDesligada(
  name: string,
  ligadas: readonly CapacidadeDaOrganizacao[],
): boolean {
  const capacidade = catalogEntry(name)?.capacidade;
  return capacidade !== undefined && !ligadas.includes(capacidade);
}
```

com `import type { CapacidadeDaOrganizacao } from "@/lib/organizacao/capacidades";` no topo. Em `lib/mcp/tools/catalog.ts`, acrescente `deCapacidadeDesligada,` à lista de reexportação de `./catalogo`.

- [ ] **Step 4: O turno do agente aplica as duas chaves**

Em `lib/ai/runtime/tools.ts`:

1. Import: `import { catalogEntry, deCapacidadeDesligada, deModuloDesligado } from "@/lib/mcp/tools/catalog";` e `import type { CapacidadeDaOrganizacao } from "@/lib/organizacao/capacidades";`.
2. Em `PickToolsInput`, logo depois de `modulosLigados?`:

```ts
  /**
   * Capacidades que a ORGANIZAÇÃO ligou (`capacidadesDaOrganizacao()`). Ausente
   * vale como nenhuma, pela mesma razão de `modulosLigados`.
   */
  capacidadesLigadas?: readonly CapacidadeDaOrganizacao[];
```

3. No laço de `pickToolsFromMcp`, logo depois da linha `if (deModuloDesligado(def.name, input.modulosLigados ?? [])) continue;`:

```ts
    // Capacidade que a ORGANIZAÇÃO desligou (spec da proposta, D1).
    if (deCapacidadeDesligada(def.name, input.capacidadesLigadas ?? [])) continue;

    // A chave da VERSÃO DO AGENTE manda nos dois sentidos (spec, D2): antes ela
    // só impedia o acréscimo automático, e a ferramenta vinda do pacote
    // `vender` passava com a chave desligada.
    if (def.name === DRAFT_PROPOSAL_TOOL_NAME && !input.proposalAiDraftEnabled) continue;
```

4. Troque a condição do acréscimo automático de

```ts
  if (input.proposalAiDraftEnabled && !result[DRAFT_PROPOSAL_TOOL_NAME]) {
```

para

```ts
  if (
    input.proposalAiDraftEnabled &&
    !deCapacidadeDesligada(DRAFT_PROPOSAL_TOOL_NAME, input.capacidadesLigadas ?? []) &&
    !result[DRAFT_PROPOSAL_TOOL_NAME]
  ) {
```

- [ ] **Step 5: Os dois chamadores do turno passam as capacidades**

Em `lib/ai/runtime/agent.ts`: import `import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";` e, na chamada `pickToolsFromMcp({ ... })`, logo depois de `modulosLigados: await modulosLigados(admin),`:

```ts
      capacidadesLigadas: await capacidadesDaOrganizacao(admin, run.organization_id),
```

Em `lib/agent-engine/edge/crm/mcp-tools.ts`: import `import { capacidadesDaOrganizacao } from '@/lib/organizacao/capacidades';` e, logo depois de `modulosLigados: await modulosLigados(cfg.supabase),`:

```ts
    capacidadesLigadas: await capacidadesDaOrganizacao(cfg.supabase, ids.organizationId),
```

- [ ] **Step 6: O MCP externo e a tela**

Em `lib/mcp/server.ts`: import `deCapacidadeDesligada` junto de `deModuloDesligado` e o tipo `CapacidadeDaOrganizacao`; a assinatura vira

```ts
export function createMcpServer(
  auth: McpAuthResult,
  requestId: string,
  modulosLigados: readonly ModuloOpcional[] = [],
  capacidadesLigadas: readonly CapacidadeDaOrganizacao[] = [],
): McpServer {
```

e no laço, logo depois de `if (deModuloDesligado(tool.name, modulosLigados)) continue;`:

```ts
    if (deCapacidadeDesligada(tool.name, capacidadesLigadas)) continue;
```

Em `app/api/mcp/route.ts`: import `capacidadesDaOrganizacao` e troque a linha de criação por

```ts
  const admin = createAdminClient();
  const server = createMcpServer(
    auth,
    requestId,
    await modulosLigados(admin),
    await capacidadesDaOrganizacao(admin, auth.organizationId),
  );
```

Em `app/api/v1/mcp/tools/route.ts`: import `deCapacidadeDesligada` (de `@/lib/mcp/tools/catalog`) e `capacidadesDaOrganizacao`; troque

```ts
  const ligados = await modulosLigados(createAdminClient());
```

por

```ts
  const admin = createAdminClient();
  const ligados = await modulosLigados(admin);
  const capacidades = await capacidadesDaOrganizacao(admin, activeOrg.orgId);
```

e o filtro `servidas.filter((c) => !deModuloDesligado(c.id, ligados))` por

```ts
servidas.filter((c) => !deModuloDesligado(c.id, ligados) && !deCapacidadeDesligada(c.id, capacidades))
```

- [ ] **Step 7: O handler recusa sozinho**

Em `lib/mcp/tools/propostas.ts`: import `import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";` e, como PRIMEIRA linha do `handler`:

```ts
    // A lista já não oferece a ferramenta com a organização desligada; isto é
    // para quem chama DIRETO (cliente MCP externo, versão antiga em cache).
    if (!(await capacidadesDaOrganizacao(ctx.supabase, ctx.organizationId)).includes("propostas")) {
      return { error: "Propostas estão desligadas nesta organização." };
    }
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run tests/unit/propostas-a-ferramenta-respeita-as-chaves.test.ts tests/unit/ponte-nao-monta-apenas-humano.test.ts tests/unit/catalogo-servido.test.ts tests/unit/capacidade-alcancavel-pelo-agente.test.ts lib/mcp/tools/propostas.test.ts tests/unit/ponte-do-agente-passa-o-escopo.test.ts tests/unit/mcp-retencao-tools.test.ts`
Expected: `lib/mcp/tools/propostas.test.ts` FALHA nos casos de caminho feliz: o supabase falso dele cai no objeto genérico `query` para a tabela `organizations`, o `maybeSingle` devolve o lead (sem `settings`), e o handler novo recusa. É o esperado — o teste antigo mede o caminho feliz, que agora exige a organização ligada. Conserte o falso: em `montarMundoDeFerramenta`, dentro de `supabase.from(table)`, antes de `if (table === "crm_leads")`, acrescente

```ts
      if (table === "organizations") {
        return {
          select: vi.fn(function (this: any) {
            return this;
          }),
          eq: vi.fn(function (this: any) {
            return this;
          }),
          maybeSingle: vi.fn(async () => ({
            data: { settings: { proposals: { enabled: true } } },
            error: null,
          })),
        };
      }
```

e rode de novo. Expected: PASS em todos.

- [ ] **Step 9: Sabotagem**

Apague a linha `if (deCapacidadeDesligada(def.name, input.capacidadesLigadas ?? [])) continue;` e rode o teste novo: o caso "não chega nem marcada na versão publicada" tem de ficar vermelho. Depois apague a linha do D2: os dois casos "D2" têm de ficar vermelhos. Desfaça as duas.

- [ ] **Step 10: typecheck e commit**

Run: `pnpm typecheck` — Expected: sem erro.

```bash
git add lib/mcp/tools/catalogo/tipos.ts lib/mcp/tools/catalogo/comercio.ts lib/mcp/tools/catalogo/index.ts lib/mcp/tools/catalog.ts lib/ai/runtime/tools.ts lib/ai/runtime/agent.ts lib/agent-engine/edge/crm/mcp-tools.ts lib/mcp/server.ts app/api/mcp/route.ts app/api/v1/mcp/tools/route.ts lib/mcp/tools/propostas.ts lib/mcp/tools/propostas.test.ts tests/unit/propostas-a-ferramenta-respeita-as-chaves.test.ts
git commit -m "fix(proposta): a ferramenta de rascunho respeita a chave da organizacao e a do agente"
```

---

### Task 3: As rotas e a tela de propostas respondem 404 com a chave desligada

**Files:**
- Create: `lib/propostas/porta.ts`
- Create: `app/app/proposals/layout.tsx`
- Modify: `app/api/v1/proposals/route.ts` (GET, POST)
- Modify: `app/api/v1/proposals/[id]/route.ts` (GET, PATCH)
- Modify: `app/api/v1/proposals/[id]/send/route.ts`, `.../decide/route.ts`, `.../assistant/route.ts`, `.../assistant/apply/route.ts`
- Modify (mock novo): os seis `route.test.ts` dessas rotas
- Test: `lib/propostas/porta.test.ts`

**Interfaces:**
- Consumes: `capacidadesDaOrganizacao` (Tarefa 1).
- Produces: `export async function sePropostasDesligadas(organizationId: string, requestId: string): Promise<NextResponse<ApiError> | null>`

- [ ] **Step 1: Write the failing test**

```ts
// lib/propostas/porta.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ capacidades: vi.fn() }));
vi.mock("@/lib/organizacao/capacidades", () => ({ capacidadesDaOrganizacao: mocks.capacidades }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { sePropostasDesligadas } from "./porta";

describe("sePropostasDesligadas", () => {
  beforeEach(() => mocks.capacidades.mockReset());

  it("ligada: deixa passar (null)", async () => {
    mocks.capacidades.mockResolvedValue(["propostas"]);
    expect(await sePropostasDesligadas("org-1", "req-1")).toBeNull();
    expect(mocks.capacidades).toHaveBeenCalledWith(expect.anything(), "org-1");
  });

  it("desligada: 404 not_found, como módulo desligado", async () => {
    mocks.capacidades.mockResolvedValue([]);
    const r = await sePropostasDesligadas("org-1", "req-1");
    expect(r?.status).toBe(404);
    expect(await r?.json()).toMatchObject({ error: { code: "not_found" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/propostas/porta.test.ts`
Expected: FAIL — `Failed to resolve import "./porta"`.

- [ ] **Step 3: Implementação da porta**

```ts
// lib/propostas/porta.ts
/**
 * A porta das rotas de proposta: com a capacidade desligada na organização, a
 * rota não existe para ela — 404, o mesmo desfecho de `seModuloDesligado`
 * (`app/api/v1/external-db/_falha.ts`). Configurações › Propostas NÃO passa
 * por aqui: é onde se liga.
 */
import type { NextResponse } from "next/server";

import { fail, type ApiError } from "@/lib/api/wrappers";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sePropostasDesligadas(
  organizationId: string,
  requestId: string,
): Promise<NextResponse<ApiError> | null> {
  const ligadas = await capacidadesDaOrganizacao(createAdminClient(), organizationId);
  if (ligadas.includes("propostas")) return null;
  return fail("not_found", "Not found.", 404, { requestId });
}
```

- [ ] **Step 4: As oito entradas das rotas**

Em cada um dos seis arquivos, acrescente o import

```ts
import { sePropostasDesligadas } from "@/lib/propostas/porta";
```

e, em CADA função exportada (GET/POST/PATCH — oito ao todo), logo depois da linha `if (!authz.ok) return authz.response;`:

```ts
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
```

- [ ] **Step 5: Os testes de rota existentes ganham o mock da porta**

Em cada um dos seis `route.test.ts` (`app/api/v1/proposals/route.test.ts`, `app/api/v1/proposals/[id]/route.test.ts`, `.../send/route.test.ts`, `.../decide/route.test.ts`, `.../assistant/route.test.ts`, `.../assistant/apply/route.test.ts`), junto dos outros `vi.mock` do topo:

```ts
vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
```

E em `app/api/v1/proposals/route.test.ts`, um caso novo que prova a porta na rota. No topo, junto dos imports de `@/lib/auth/require-role` e `@/lib/supabase/server`:

```ts
import { sePropostasDesligadas } from "@/lib/propostas/porta";
```

e, no fim do arquivo, usando o `montarMundoDeProposta()` que o arquivo já tem (ele prepara `requireRole` com a organização `ORG_ID`):

```ts
describe("GET /api/v1/proposals — capacidade desligada", () => {
  it("organização com propostas desligadas: 404, sem listar nada", async () => {
    const mundo = montarMundoDeProposta();
    vi.mocked(sePropostasDesligadas).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "not_found", message: "Not found." } }), {
        status: 404,
      }) as never,
    );
    const res = await mundo.GET();
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "not_found" } });
  });
});
```

(O `beforeEach(() => vi.restoreAllMocks())` do arquivo não desfaz o mock de fábrica no Vitest 4.1 — `restoreAllMocks` só restaura `vi.spyOn`.)

- [ ] **Step 6: A tela**

```tsx
// app/app/proposals/layout.tsx
/**
 * Com a capacidade "Propostas" desligada na organização, a lista, o editor e a
 * tela de nova proposta não existem para ela — 404, como a tela de módulo
 * desligado (`app/app/integracao-dados/layout.tsx`). Link antigo, favorito e
 * aviso velho da Central caem aqui em vez de numa tela que quebra no primeiro
 * fetch.
 */
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PropostasLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const ligadas = await capacidadesDaOrganizacao(createAdminClient(), activeOrg.orgId);
  if (!ligadas.includes("propostas")) notFound();
  return <>{children}</>;
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run lib/propostas/porta.test.ts app/api/v1/proposals`
Expected: PASS em todos.

- [ ] **Step 8: Sabotagem**

Troque o `return null` de `sePropostasDesligadas` para ser incondicional e rode `lib/propostas/porta.test.ts`: o caso "desligada: 404" tem de ficar vermelho. Desfaça.

- [ ] **Step 9: typecheck e commit**

Run: `pnpm typecheck` — Expected: sem erro.

```bash
git add lib/propostas/porta.ts lib/propostas/porta.test.ts app/app/proposals/layout.tsx app/api/v1/proposals
git commit -m "fix(proposta): rotas e telas de proposta respondem 404 com a capacidade desligada"
```

---

### Task 4: O menu some com a chave desligada

**Files:**
- Modify: `lib/navigation/catalogo.ts` (`NavMetadata.capacidade`; entrada `/app/proposals` com `capacidade: "propostas"`)
- Modify: `lib/navigation/interface.ts` (`permitidos`, `destinosDaInterface` ganham `capacidades?`)
- Modify: `lib/navigation/registry.ts` (`sidebarGroups`, `hubSections`, `searchable` repassam `capacidades?`)
- Modify: `lib/auth/types.ts` (`ActiveOrg.capacidades_ligadas?`)
- Modify: `app/app/layout.tsx` (preenche `capacidades_ligadas` com a mesma linha de `settings` já lida)
- Modify: `components/shell/Sidebar.tsx`, `components/shell/CommandPalette.tsx` (passam `activeOrg?.capacidades_ligadas ?? []`)
- Modify: `components/shell/NavHub.tsx` (prop `capacidadesLigadas`)
- Modify: `app/app/crm/page.tsx` (lê e passa as capacidades)
- Test: `tests/unit/nav-hub.test.tsx` (caso novo)

**Interfaces:**
- Consumes: `CapacidadeDaOrganizacao`, `capacidadesLigadas(settings)`, `capacidadesDaOrganizacao(db, orgId)` (Tarefa 1).
- Produces: `NavMetadata.capacidade?: CapacidadeDaOrganizacao`; parâmetro final `capacidades?: readonly CapacidadeDaOrganizacao[]` em `permitidos`, `destinosDaInterface`, `sidebarGroups`, `hubSections`, `searchable`; `NavHubProps.capacidadesLigadas?`; `ActiveOrg.capacidades_ligadas?`.

**Regra do filtro (a mesma do módulo):** `capacidades` **ausente = não filtra** — quem desenha menu (sidebar, hub, ⌘K) passa a lista; quem só pergunta "sobra alguma porta?" não precisa. É apresentação: quem recusa é a rota e a tela (Tarefa 3).

- [ ] **Step 1: Write the failing test**

Em `tests/unit/nav-hub.test.tsx`, dentro do mesmo `describe` do caso de "Dados externos":

```tsx
  it("a porta de Propostas no hub do CRM some com a capacidade desligada e volta ligada", () => {
    render(
      <NavHub group="crm" isPlatformAdmin={false} role="admin" title="CRM" subtitle="" capacidadesLigadas={[]} />,
    );
    expect(screen.queryByRole("link", { name: /Propostas/ })).toBeNull();
    cleanup();

    render(
      <NavHub
        group="crm"
        isPlatformAdmin={false}
        role="admin"
        title="CRM"
        subtitle=""
        capacidadesLigadas={["propostas"]}
      />,
    );
    expect(screen.getByRole("link", { name: /Propostas/ })).toHaveAttribute("href", "/app/proposals");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/nav-hub.test.tsx`
Expected: FAIL — o link "Propostas" aparece com `capacidadesLigadas={[]}` (e o TypeScript do teste reclama da prop desconhecida).

- [ ] **Step 3: Catálogo e filtro**

`lib/navigation/catalogo.ts`: import `import type { CapacidadeDaOrganizacao } from "@/lib/organizacao/capacidades";` e em `NavMetadata`, logo depois de `modulo?: ModuloOpcional;`:

```ts
  /**
   * A porta de uma CAPACIDADE que a organização liga para si
   * (`lib/organizacao/capacidades.ts`). Desligada, some do menu, do hub e do
   * ⌘K. Apresentação, como `modulo`: quem recusa é a tela e a rota.
   */
  capacidade?: CapacidadeDaOrganizacao;
```

Na entrada `href: "/app/proposals"`, acrescente `capacidade: "propostas",` depois de `section: "Fechar a venda",`.

`lib/navigation/interface.ts`: import o tipo; `permitidos` vira

```ts
export function permitidos(
  platform: boolean,
  role: Role | null,
  modulos?: readonly ModuloOpcional[],
  capacidades?: readonly CapacidadeDaOrganizacao[],
): NavMetadata[] {
  return (NAV_CATALOG as readonly NavMetadata[]).filter(
    (d) =>
      canSee(d, platform, role) &&
      (!modulos || !d.modulo || modulos.includes(d.modulo)) &&
      (!capacidades || !d.capacidade || capacidades.includes(d.capacidade)),
  );
}
```

e `destinosDaInterface` ganha o parâmetro final `capacidades?: readonly CapacidadeDaOrganizacao[]`, repassado em `permitidos(platform, role, modulos, capacidades)`.

`lib/navigation/registry.ts`: em `sidebarGroups`, `hubSections` e `searchable`, acrescente o parâmetro final `capacidades?: readonly CapacidadeDaOrganizacao[]` e repasse-o como último argumento de `destinosDaInterface(settings, isPlatformAdmin, role, modulos, capacidades)`.

- [ ] **Step 4: A organização ativa carrega as capacidades**

`lib/auth/types.ts`, em `ActiveOrg`, logo depois de `modulos_ligados?`:

```ts
  /**
   * Capacidades que ESTA organização ligou (`lib/organizacao/capacidades.ts`).
   * Só o layout de `/app` preenche; ausente vale como nenhuma no menu.
   */
  capacidades_ligadas?: readonly CapacidadeDaOrganizacao[];
```

(com `import type { CapacidadeDaOrganizacao } from "@/lib/organizacao/capacidades";`).

`app/app/layout.tsx`: import `import { capacidadesLigadas } from "@/lib/organizacao/capacidades";` e, no objeto `activeOrg = { ...activeOrg, ... }`, logo depois de `modulos_ligados: modulos,`:

```ts
      // Mesma linha de `settings` já lida acima — nenhuma consulta a mais.
      capacidades_ligadas: capacidadesLigadas(orgRow?.settings),
```

- [ ] **Step 5: Quem desenha o menu passa a lista**

`components/shell/Sidebar.tsx`: na chamada `sidebarGroups(...)`, acrescente como último argumento `activeOrg?.capacidades_ligadas ?? [],`.

`components/shell/CommandPalette.tsx`: na chamada `searchable(...)`, acrescente como último argumento `activeOrg?.capacidades_ligadas ?? [],` e acrescente `activeOrg?.capacidades_ligadas,` à lista de dependências do `useMemo`.

`components/shell/NavHub.tsx`: em `NavHubProps`, `capacidadesLigadas?: readonly CapacidadeDaOrganizacao[];`; na desestruturação, `capacidadesLigadas,`; e a chamada vira `hubSections(group, isPlatformAdmin, role, interfaceSettings, modulosLigados, capacidadesLigadas)`.

`app/app/crm/page.tsx`: imports `import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";` e `import { createAdminClient } from "@/lib/supabase/admin";`; antes do `return`:

```ts
  const capacidadesLigadas = activeOrg
    ? await capacidadesDaOrganizacao(createAdminClient(), activeOrg.orgId)
    : [];
```

e no `<NavHub ...>`, a prop `capacidadesLigadas={capacidadesLigadas}`.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/nav-hub.test.tsx tests/unit/navegacao-registry.test.ts tests/unit/navegacao-completude.test.ts tests/unit/i18n-catalogo-do-menu.test.ts`
Expected: PASS.

- [ ] **Step 7: Sabotagem**

Apague a linha `(!capacidades || !d.capacidade || capacidades.includes(d.capacidade))` de `permitidos` (deixando o `&&` anterior fechar a expressão) e rode `tests/unit/nav-hub.test.tsx`: o caso novo tem de ficar vermelho. Desfaça.

- [ ] **Step 8: typecheck, lint e commit**

Run: `pnpm typecheck` e `pnpm lint` — Expected: sem erro.

```bash
git add lib/navigation lib/auth/types.ts app/app/layout.tsx components/shell/Sidebar.tsx components/shell/CommandPalette.tsx components/shell/NavHub.tsx app/app/crm/page.tsx tests/unit/nav-hub.test.tsx
git commit -m "fix(proposta): a porta de Propostas no menu segue a capacidade da organizacao"
```

---

### Task 5: As rotinas de laço de retorno pulam a organização desligada

**Files:**
- Modify: `app/api/v1/cron/proposal-acceptance-rate/route.ts`
- Modify: `app/api/v1/cron/proposal-promised-not-created/route.ts`
- Test: `app/api/v1/cron/proposal-acceptance-rate/route.test.ts`, `app/api/v1/cron/proposal-promised-not-created/route.test.ts`

**Interfaces:**
- Consumes: `capacidadesLigadas(settings)` (Tarefa 1).
- Produces:
  - em `proposal-acceptance-rate/route.ts`: `export function organizacoesComPropostas(orgs: { id: string; settings: unknown }[]): string[]`
  - em `proposal-promised-not-created/route.ts`: `encontrarPromessasSemProposta` ganha o campo `orgsLigadas: ReadonlySet<string>` no primeiro argumento.

**`proposal-expiry` NÃO muda** (Global Constraints).

- [ ] **Step 1: Write the failing tests**

Em `app/api/v1/cron/proposal-acceptance-rate/route.test.ts` (importe `organizacoesComPropostas` junto de `calcularTaxaDeAceite`):

```ts
describe("organizacoesComPropostas", () => {
  it("só as organizações com a capacidade ligada entram na rodada", () => {
    expect(
      organizacoesComPropostas([
        { id: "a", settings: { proposals: { enabled: true } } },
        { id: "b", settings: { proposals: { enabled: false } } },
        { id: "c", settings: null },
      ]),
    ).toEqual(["a"]);
  });
});
```

Em `app/api/v1/cron/proposal-promised-not-created/route.test.ts`, um caso novo (reaproveite a mesma tarefa vencida do primeiro caso do arquivo, que hoje "sinaliza"):

```ts
  it("organização com propostas desligadas: não sinaliza, mesmo vencida", () => {
    const tarefa = {
      id: "t1", organization_id: "org-off", lead_id: "l1", source_kind: "promised_proposal",
      due_date: "2026-01-01", status: "pending", created_at: "2026-01-01T00:00:00Z",
    };
    const r = encontrarPromessasSemProposta(
      { tarefas: [tarefa], propostas: [], orgsLigadas: new Set(["org-on"]) },
      new Date("2026-02-01T00:00:00Z"),
    );
    expect(r).toEqual([]);
  });
```

e acrescente `orgsLigadas: new Set([<a organization_id que o caso usa>])` aos objetos já passados a `encontrarPromessasSemProposta` nos casos existentes, para que eles continuem medindo o que mediam.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/v1/cron/proposal-acceptance-rate app/api/v1/cron/proposal-promised-not-created`
Expected: FAIL — `organizacoesComPropostas` não existe; o caso "org-off" sinaliza.

- [ ] **Step 3: Implementação**

`proposal-acceptance-rate/route.ts`: import `capacidadesLigadas`; acrescente

```ts
export function organizacoesComPropostas(orgs: { id: string; settings: unknown }[]): string[] {
  return orgs.filter((o) => capacidadesLigadas(o.settings).includes("propostas")).map((o) => o.id);
}
```

e em `rodar`, troque `.select("id")` por `.select("id, settings")` e o laço `for (const org of orgs ?? [])` por

```ts
  for (const orgId of organizacoesComPropostas(orgs ?? [])) {
    const org = { id: orgId };
```

(o resto do corpo do laço continua usando `org.id`).

`proposal-promised-not-created/route.ts`: import `capacidadesLigadas`; na assinatura de `encontrarPromessasSemProposta`, o primeiro argumento ganha `orgsLigadas: ReadonlySet<string>`, e a primeira condição do filtro das tarefas passa a ser `input.orgsLigadas.has(t.organization_id) &&` (antes das demais). Em `rodar`, antes de chamar a função:

```ts
  const { data: orgs, error: orgsErr } = await admin.from("organizations").select("id, settings");
  if (orgsErr) throw new Error(`query_orgs_failed: ${orgsErr.message}`);
  const orgsLigadas = new Set(
    (orgs ?? []).filter((o) => capacidadesLigadas(o.settings).includes("propostas")).map((o) => o.id),
  );
```

e passe `orgsLigadas` no objeto.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/v1/cron/proposal-acceptance-rate app/api/v1/cron/proposal-promised-not-created tests/unit/cron-audita-so-quando-ha-efeito.test.ts`
Expected: PASS.

- [ ] **Step 5: Sabotagem**

Tire `input.orgsLigadas.has(t.organization_id) &&` do filtro: o caso "org-off" tem de ficar vermelho. Desfaça.

- [ ] **Step 6: typecheck e commit**

```bash
git add app/api/v1/cron/proposal-acceptance-rate app/api/v1/cron/proposal-promised-not-created
git commit -m "fix(proposta): rotinas de laco de retorno pulam organizacao com propostas desligadas"
```

---

### Task 6: Revisão cega, CI e descida para a combinada

- [ ] **Step 1:** revisão cega (subagente de contexto limpo, sem este plano) sobre `git diff <base da C1>..HEAD`, procurando: rota de proposta sem a porta; chamador de `pickToolsFromMcp`/`createMcpServer` sem as capacidades; texto de tela sem espanhol.
- [ ] **Step 2:** `git push fork feat/proposta-comercial`; aguardar o CI do PR de rascunho #2 do fork verde nos cinco checks.
- [ ] **Step 3:** descer para a `vps/pljr-combinada` por merge; nela, fragmento `.changes/` com `impacto: exige_acao`: *"A chave Propostas passa a valer: organização que usa propostas precisa ligá-la em Configurações › Propostas — até agora ela ficava desligada sem efeito."* (O fragmento **não** vai na branch da feature: lá a feature inteira é nova, e o fragmento dela já diz "nasce desligada".)
- [ ] **Step 4:** tag no fork; o Paulo atualiza a VPS; **roteiro de prova na tela** entregue a ele:
  1. com a chave desligada, o menu CRM não mostra Propostas e `/app/proposals` dá "página não encontrada";
  2. liga em Configurações › Propostas → o menu mostra, a lista abre;
  3. no agente, desliga "rascunhar sozinho" e pede uma proposta numa conversa de teste → o agente não cria rascunho; liga → cria.
