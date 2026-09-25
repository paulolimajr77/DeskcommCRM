# Onda M0 — Fundamento de Modelos de Proposta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o alicerce de schema da "onda de modelos" de Propostas Comerciais —
a tabela de modelos por organização, os campos de ligação em `crm_proposals`, o
resolvedor (cópia da organização → base do código) e o cálculo puro de prontidão —
sem UI, sem renderer e sem depender do conteúdo dos 8 modelos-piloto, que ainda não
existem no repositório.

**Architecture:** Uma tabela nova (`proposal_templates`) guarda só **cópias por
organização** — a base da plataforma mora no **código** (`MODELOS_BASE`, hoje vazio de
propósito), nunca no banco com `organization_id` nulo (decisão da spec-mãe, §6.1,
que resolveu uma contradição da spec de 21/09). `crm_proposals` ganha 4 colunas
nullable e aditivas para referenciar o modelo usado e congelar o que foi enviado.
Um resolvedor puro decide entre cópia e base; um calculador puro decide a
prontidão a partir de booleanos já computados — nenhum dos dois depende do
conteúdo real dos modelos-piloto para ser testado.

**Tech Stack:** Postgres/Supabase (RLS), TypeScript, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-proposta-comercial-design.md` (spec-mãe,
seção 6 — corrige a spec de 21/09) e `docs/superpowers/specs/2026-09-21-proposta-comercial-templates-design.md`
(spec de modelos, seções 5, 7, 11 — histórico; vale onde a spec-mãe não corrigiu).

## Global Constraints

- `organization_id uuid not null references organizations(id) on delete cascade`
  em `proposal_templates` — RLS `tenant_isolation_proposal_templates_all` via
  `fn_user_org_ids()`, igual a toda tabela tenant-aware da casa.
- **A base da plataforma mora no código, não no banco.** `proposal_templates` só
  guarda cópias de organização (`organization_id` sempre preenchido). Nenhuma
  linha nasce com `organization_id` nulo — a spec de 21/09 pedia isso e a
  spec-mãe cortou por violar "toda tabela tenant-aware tem dono" (CLAUDE.md).
- **Sem CHECK fechado de `slug` nesta onda.** A spec de 21/09 pedia CHECK dos 8
  tipos piloto; nenhum dos 8 existe no repositório (medido: `find` não achou
  nenhum `template.json` fora dos 3 anexos desta spec, que são OUTRO conteúdo).
  Inventar slugs agora seria suposição, não medição. `slug` é `text not null`
  validado por Zod na camada de aplicação; o CHECK entra numa migration futura
  quando o piloto de 3 modelos for definido.
- `pricing_status`, item sem preço (`preco_unitario_cents` nullable) e o índice
  de rascunho único **já existem** (C3, migration 0402) — esta onda não os toca.
- Toda migration de schema em tripla: arquivo em `supabase/migrations/` +
  apêndice idempotente no `baseline.sql` + linha no `MANIFEST.md`.
- `tests/invariants/**` (RLS real) não roda nesta máquina (`pnpm test:db`
  depende de Postgres efêmero, indisponível aqui) — o teste é escrito e fica
  vermelho-esperado até o CI do fork rodar; nunca se afirma "RLS provada" sem
  essa rodada.
- Nenhuma tela nova nesta onda — é fundamento de schema. `template_slug` etc.
  ficam de fora do `select("*")` das telas hoje só porque `select("*")` já
  traz colunas novas automaticamente; nenhuma tela precisa mudar para não
  quebrar (colunas nullable, aditivas).

## Review Focus

- **Organização A não enxerga nem referencia modelo de organização B** — nem
  por engano na consulta do resolvedor, nem pelo `crm_proposals.template_slug`
  de uma proposta lida com client errado.
- **Duas organizações podem ter modelos com o MESMO `slug`** (ex.: as duas
  personalizam "institucional") sem colidir — o unique é composto
  `(organization_id, slug)`, nunca só `slug`.
- **Duas versões ativas do mesmo modelo na mesma organização** nunca coexistem
  — o índice parcial único garante isso, e o teste prova a colisão.
- **`resolverModelo` para um slug que não existe nem na organização nem no
  código devolve `null` sem lançar** — quem chama decide o que fazer (mostrar
  "modelo não encontrado"), o resolvedor não decide isso por eles.
- **`calcularProntidao` nunca promove a `pronta_para_envio` só porque um campo
  isolado está ok** — a spec exige TODOS os itens do checklist antes de
  liberar envio; um teste prova que um único item faltando barra o status
  final, não só o item específico.

---

### Task 1: Migration — tabela `proposal_templates`

**Files:**
- Create: `supabase/migrations/<TIMESTAMP>_0409_m0_tabela_de_modelos.sql`
  (confirme `pnpm checar:colisao-de-migration` no momento de codar — o número
  livre muda com o tempo; ao escrever este plano era `0409`)
- Modify: `supabase/baseline.sql` (apêndice, antes da `-- ---- VARREDURA anon`)
- Modify: `supabase/migrations/MANIFEST.md`
- Create: `tests/invariants/proposta-templates-isolamento-entre-organizacoes.test.ts`

**Interfaces:**
- Produces: tabela `public.proposal_templates` com colunas
  `id uuid pk`, `organization_id uuid not null`, `slug text not null`,
  `version int not null default 1`, `sections jsonb not null default '[]'::jsonb`,
  `section_order text[] not null default '{}'`, `is_active boolean not null default true`,
  `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
  Índice único parcial `(organization_id, slug) where is_active`; único
  `(organization_id, slug, version)`.

- [ ] **Step 1: Escrever o arquivo de migration**

```sql
-- <NNNN> — Onda M0 (fundamento de modelos): proposal_templates guarda só
-- CÓPIAS por organização (decisão da spec-mãe §6.1: a base da plataforma mora
-- no código, MODELOS_BASE, nunca no banco com organization_id nulo — a spec
-- de 21/09 pedia base+cópia no mesmo banco, e isso violaria "toda tabela
-- tenant-aware tem organization_id not null" da casa).
--
-- SEM CHECK fechado de slug: os 8 modelos-piloto da spec de 21/09 não estão
-- no repositório (medido em 24/09/2026 — nenhum template.json além dos 3
-- anexos desta spec, que são conteúdo diferente). Inventar o vocabulário
-- agora seria suposição. Validação de slug fica no Zod da aplicação até o
-- piloto de 3 modelos ser definido e uma migration futura fechar o CHECK.
create table if not exists public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  version int not null default 1,
  sections jsonb not null default '[]'::jsonb,
  section_order text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.proposal_templates is
  'Cópia por organização de um modelo de proposta. A base da plataforma (os modelos-piloto) mora no código (MODELOS_BASE), nunca aqui com organization_id nulo — ver spec-mãe §6.1.';

-- Só uma versão ATIVA por slug por organização.
create unique index if not exists proposal_templates_ativo_por_slug_org_uidx
  on public.proposal_templates (organization_id, slug)
  where is_active;

-- Duas linhas não disputam o mesmo número de versão do mesmo slug/organização.
create unique index if not exists proposal_templates_slug_versao_org_uidx
  on public.proposal_templates (organization_id, slug, version);

create index if not exists proposal_templates_org_idx
  on public.proposal_templates (organization_id);

alter table public.proposal_templates enable row level security;

drop policy if exists tenant_isolation_proposal_templates_all on public.proposal_templates;
create policy tenant_isolation_proposal_templates_all on public.proposal_templates
  for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));
```

- [ ] **Step 2: Escrever o invariante de isolamento (vermelho esperado — não roda nesta máquina)**

```typescript
// tests/invariants/proposta-templates-isolamento-entre-organizacoes.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { GOV_ORG, seedGov, sql } from "./gov-helpers";

/**
 * M0 — proposal_templates guarda cópia por organização. Sem RLS provada
 * contra Postgres real, "organization_id filtra" é afirmação, não fato.
 */

const ORG_B = "dddddddd-8888-4000-8000-000000000001";
const TPL_A = "eeeeeeee-8888-4000-8000-000000000011";
const TPL_B = "eeeeeeee-8888-4000-8000-000000000012";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

afterAll(async () => {
  await pool.end();
});

beforeAll(() => {
  seedGov();
  sql(`insert into public.organizations (id, name) values ('${ORG_B}', 'Org B teste') on conflict (id) do nothing;`);
  sql(`delete from public.proposal_templates where id in ('${TPL_A}', '${TPL_B}');`);
  sql(`
    insert into public.proposal_templates (id, organization_id, slug, version)
      values ('${TPL_A}', '${GOV_ORG}', 'institucional', 1);
    insert into public.proposal_templates (id, organization_id, slug, version)
      values ('${TPL_B}', '${ORG_B}', 'institucional', 1);
  `);
});

describe("proposal_templates — isolamento entre organizações (RLS)", () => {
  it("as duas organizações podem ter o MESMO slug sem colidir (unique é composto)", () => {
    const total = sql(`select count(*) from public.proposal_templates where slug = 'institucional' and id in ('${TPL_A}', '${TPL_B}');`);
    expect(total).toBe("2");
  });

  it("sob RLS da organização A, um select* não devolve a linha da organização B", async () => {
    await expect(
      pool.query(`set local role authenticated; set local request.jwt.claims = '{"org_ids":["${GOV_ORG}"]}';
        select * from public.proposal_templates where id = '${TPL_B}';`),
    ).resolves.toMatchObject({ rowCount: 0 });
  });

  it("duas versões ATIVAS do mesmo slug na MESMA organização: 23505", async () => {
    await expect(
      pool.query(`
        insert into public.proposal_templates (organization_id, slug, version, is_active)
          values ('${GOV_ORG}', 'institucional', 2, true);
      `),
    ).rejects.toMatchObject({ code: "23505", constraint: "proposal_templates_ativo_por_slug_org_uidx" });
  });
});
```

- [ ] **Step 3: Rodar (vermelho esperado — sem Postgres nesta máquina)**

Run: `pnpm test:db tests/invariants/proposta-templates-isolamento-entre-organizacoes.test.ts`
Expected: não roda localmente (sem Docker de teste nesta máquina, per memória
da casa). Fica registrado como pendente de confirmação no CI do fork — NÃO se
afirma "RLS provada" até essa rodada acontecer.

- [ ] **Step 4: Atualizar `baseline.sql` e `MANIFEST.md`**

Apêndice idêntico ao corpo da migration, rotulado
`-- ---- M0: tabela de modelos de proposta (migration <NNNN>) ----`, inserido
antes de `-- ---- VARREDURA anon`. Linha no MANIFEST descrevendo o quê/porquê
(mesmo texto do comentário da migration, resumido).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<TIMESTAMP>_<NNNN>_m0_tabela_de_modelos.sql \
  supabase/baseline.sql supabase/migrations/MANIFEST.md \
  tests/invariants/proposta-templates-isolamento-entre-organizacoes.test.ts
git commit -m "feat(db): proposal_templates — cópia de modelo por organização (M0)"
```

---

### Task 2: Tipos e catálogo-base (código)

**Files:**
- Create: `lib/propostas/modelos/tipos.ts`
- Create: `lib/propostas/modelos/catalogo-base.ts`
- Create: `lib/propostas/modelos/catalogo-base.test.ts`

**Interfaces:**
- Produces: `SecaoDoModelo`, `ModeloBase`, `MODELOS_BASE: Record<string, ModeloBase>`
- Consumes: nada desta onda.

- [ ] **Step 1: Escrever o teste (RED)**

```typescript
// lib/propostas/modelos/catalogo-base.test.ts
import { describe, expect, it } from "vitest";
import { MODELOS_BASE } from "./catalogo-base";

describe("MODELOS_BASE — catálogo de modelos da plataforma (código, não banco)", () => {
  it("nasce vazio: os 8 modelos-piloto ainda não foram trazidos ao repositório (spec §6.4)", () => {
    expect(Object.keys(MODELOS_BASE)).toEqual([]);
  });

  it("é um objeto congelado — ninguém muta o catálogo em runtime", () => {
    expect(Object.isFrozen(MODELOS_BASE)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/propostas/modelos/catalogo-base.test.ts`
Expected: FAIL — `Cannot find module './catalogo-base'`

- [ ] **Step 3: Escrever os tipos e o catálogo**

```typescript
// lib/propostas/modelos/tipos.ts
export interface SecaoDoModelo {
  id: string;
  title: string;
  titleEs: string | null;
  body: string;
  bodyEs: string | null;
  required: boolean;
  conditional: boolean;
}

export interface ModeloBase {
  slug: string;
  version: number;
  sections: SecaoDoModelo[];
  sectionOrder: string[];
}
```

```typescript
// lib/propostas/modelos/catalogo-base.ts
import type { ModeloBase } from "./tipos";

/**
 * A base da plataforma mora AQUI, no código — nunca no banco com
 * organization_id nulo (spec-mãe §6.1). `proposal_templates` só guarda cópias
 * por organização; quem nunca personalizou usa o que está neste objeto.
 *
 * VAZIO DE PROPÓSITO: os 8 modelos-piloto de web design (institucional,
 * landing page, e-commerce, catálogo imobiliário, site profissional, sistema
 * web, automação, projeto personalizado) não estão no repositório — medido
 * em 24/09/2026, nenhum template.json encontrado além dos 3 anexos da spec
 * de 21/09 (clínica, curso, serviços gerais — CONTEÚDO DIFERENTE, não estes
 * 8). Trazê-los é decisão do dono (spec §6.4); quando chegarem, entram aqui
 * numa migration de CÓDIGO (não de banco — isto não é uma tabela).
 */
export const MODELOS_BASE: Readonly<Record<string, ModeloBase>> = Object.freeze({});
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/propostas/modelos/catalogo-base.test.ts`
Expected: PASS 2/2

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/modelos/tipos.ts lib/propostas/modelos/catalogo-base.ts lib/propostas/modelos/catalogo-base.test.ts
git commit -m "feat(propostas): tipos de modelo + catálogo-base vazio de propósito (M0)"
```

---

### Task 3: Resolvedor de modelo (cópia da organização → base do código)

**Files:**
- Create: `lib/propostas/modelos/resolver.ts`
- Create: `lib/propostas/modelos/resolver.test.ts`

**Interfaces:**
- Consumes: `MODELOS_BASE` (Task 2), tabela `proposal_templates` (Task 1)
- Produces: `resolverModelo(db, organizationId, slug): Promise<ModeloResolvido | null>`,
  `ModeloResolvido = ModeloBase & { origem: "organizacao" | "base" }`

- [ ] **Step 1: Escrever o teste (RED)**

```typescript
// lib/propostas/modelos/resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolverModelo } from "./resolver";

function dbFalso(linha: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: linha, error: null }),
            }),
          }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("resolverModelo — cópia da organização vence; sem cópia, cai no código; sem os dois, null", () => {
  it("organização tem cópia ativa: devolve a cópia, origem 'organizacao'", async () => {
    const db = dbFalso({
      slug: "institucional",
      version: 3,
      sections: [{ id: "s1", title: "Resumo", title_es: null, body: "...", body_es: null, required: true, conditional: false }],
      section_order: ["s1"],
    });
    const modelo = await resolverModelo(db, "org-1", "institucional");
    expect(modelo).toMatchObject({ slug: "institucional", version: 3, origem: "organizacao" });
  });

  it("organização sem cópia e slug fora do MODELOS_BASE (vazio hoje): devolve null, não lança", async () => {
    const db = dbFalso(null);
    const modelo = await resolverModelo(db, "org-1", "institucional");
    expect(modelo).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/propostas/modelos/resolver.test.ts`
Expected: FAIL — `Cannot find module './resolver'`

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/modelos/resolver.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { MODELOS_BASE } from "./catalogo-base";
import type { ModeloBase, SecaoDoModelo } from "./tipos";

export type ModeloResolvido = ModeloBase & { origem: "organizacao" | "base" };

interface LinhaDeModelo {
  slug: string;
  version: number;
  sections: Array<{
    id: string;
    title: string;
    title_es: string | null;
    body: string;
    body_es: string | null;
    required: boolean;
    conditional: boolean;
  }>;
  section_order: string[];
}

function mapeiaSecoes(linhas: LinhaDeModelo["sections"]): SecaoDoModelo[] {
  return linhas.map((s) => ({
    id: s.id,
    title: s.title,
    titleEs: s.title_es,
    body: s.body,
    bodyEs: s.body_es,
    required: s.required,
    conditional: s.conditional,
  }));
}

/**
 * A cópia da organização SEMPRE vence quando existe (decisão #15 da spec de
 * modelos: cópia nunca auto-atualiza a partir da base). Sem cópia, cai no
 * catálogo do código. Sem os dois, `null` — quem chama decide o que mostrar;
 * este resolvedor não lança para "modelo não encontrado", que não é erro de
 * sistema.
 */
export async function resolverModelo(
  db: SupabaseClient,
  organizationId: string,
  slug: string,
): Promise<ModeloResolvido | null> {
  const { data } = await db
    .from("proposal_templates")
    .select("slug, version, sections, section_order")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (data) {
    const linha = data as LinhaDeModelo;
    return {
      slug: linha.slug,
      version: linha.version,
      sections: mapeiaSecoes(linha.sections),
      sectionOrder: linha.section_order,
      origem: "organizacao",
    };
  }

  const base = MODELOS_BASE[slug];
  if (!base) return null;
  return { ...base, origem: "base" };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/propostas/modelos/resolver.test.ts`
Expected: PASS 2/2

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/modelos/resolver.ts lib/propostas/modelos/resolver.test.ts
git commit -m "feat(propostas): resolverModelo — cópia da organização vence, senão cai no código (M0)"
```

---

### Task 4: Migration — `crm_proposals` ganha as colunas de ligação com o modelo

**Files:**
- Create: `supabase/migrations/<TIMESTAMP>_<NNNN+1>_m0_proposta_referencia_modelo.sql`
- Modify: `supabase/baseline.sql`
- Modify: `supabase/migrations/MANIFEST.md`

**Interfaces:**
- Consumes: nada de código desta onda (colunas ficam sem leitor de aplicação
  até a Onda M1 — ver nota "nada é ilha" abaixo).
- Produces: `crm_proposals.template_slug text null`,
  `template_version int null`, `template_snapshot jsonb null`,
  `rendered_snapshot jsonb null`.

- [ ] **Step 1: Escrever a migration**

```sql
-- <NNNN+1> — Onda M0: a proposta pode referenciar o modelo usado.
-- Nullable e aditiva: proposta sem modelo (todo o histórico de hoje) convive
-- sem migração de dado nenhuma. `template_snapshot`/`rendered_snapshot`
-- ficam vazios até a Onda M5 (envio) — a Onda M0 só abre o lugar; quem
-- escreve neles é o fluxo de envio, que ainda não existe para modelos.
--
-- CHECK de consistência: os dois campos de "qual modelo" nascem e morrem
-- juntos — proposta não referencia versão sem slug, nem slug sem versão.
alter table public.crm_proposals add column if not exists template_slug text;
alter table public.crm_proposals add column if not exists template_version int;
alter table public.crm_proposals add column if not exists template_snapshot jsonb;
alter table public.crm_proposals add column if not exists rendered_snapshot jsonb;

alter table public.crm_proposals drop constraint if exists crm_proposals_template_slug_versao_juntos_check;
alter table public.crm_proposals add constraint crm_proposals_template_slug_versao_juntos_check
  check ((template_slug is null) = (template_version is null));
```

- [ ] **Step 2: Escrever o teste de consistência**

```typescript
// supabase/migrations/<NNNN+1>_m0_proposta_referencia_modelo.test.ts
// (arquivo local ao invariante — roda via test:db, mesma ressalva da Task 1)
```

Na prática, o mesmo arquivo de invariante da Task 1 ganha um caso a mais — não
crie arquivo novo, edite `tests/invariants/proposta-templates-isolamento-entre-organizacoes.test.ts`:

```typescript
  it("template_slug sem template_version (ou vice-versa) é recusado pelo CHECK", async () => {
    await expect(
      pool.query(`
        update public.crm_proposals set template_slug = 'institucional', template_version = null
          where organization_id = '${GOV_ORG}' limit 1;
      `),
    ).rejects.toMatchObject({ code: "23514" });
  });
```

- [ ] **Step 3: Rodar (vermelho esperado — sem Postgres nesta máquina)**

Run: `pnpm test:db tests/invariants/proposta-templates-isolamento-entre-organizacoes.test.ts`
Expected: não roda localmente, mesma ressalva da Task 1.

- [ ] **Step 4: Atualizar `baseline.sql` e `MANIFEST.md`**

Apêndice rotulado `-- ---- M0: proposta referencia modelo (migration <NNNN+1>) ----`.

- [ ] **Step 5: Confirmar que nenhuma tela quebrou (living system — nada é ilha)**

Run: `npx vitest run app/app/proposals`
Expected: PASS, mesma contagem de antes desta task — colunas novas nullable
não mudam nenhum contrato existente. Isto NÃO substitui a Onda M1, que é
quem vai de fato LER/ESCREVER estas colunas pela tela; aqui só se prova que
abrir o lugar não quebra o que já anda.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<TIMESTAMP>_<NNNN+1>_m0_proposta_referencia_modelo.sql \
  supabase/baseline.sql supabase/migrations/MANIFEST.md \
  tests/invariants/proposta-templates-isolamento-entre-organizacoes.test.ts
git commit -m "feat(db): crm_proposals referencia o modelo usado (M0)"
```

---

### Task 5: Prontidão (readiness) — cálculo puro

**Files:**
- Create: `lib/propostas/prontidao.ts`
- Create: `lib/propostas/prontidao.test.ts`

**Interfaces:**
- Consumes: nada (função pura — quem lê `crm_proposals`/itens e monta o
  `EntradaDeProntidao` é trabalho da Onda M1, fora deste plano).
- Produces: `calcularProntidao(entrada: EntradaDeProntidao): Prontidao`,
  `StatusDeProntidao = "incompleta" | "pronta_para_revisao" | "pronta_para_envio"`

- [ ] **Step 1: Escrever o teste (RED)**

```typescript
// lib/propostas/prontidao.test.ts
import { describe, expect, it } from "vitest";
import { calcularProntidao, type EntradaDeProntidao } from "./prontidao";

const TUDO_OK: EntradaDeProntidao = {
  temContato: true,
  temEscopo: true,
  temPrazo: true,
  temPrecoDefinido: true,
  temPagamento: true,
  temValidade: true,
  temConteudoCompleto: true,
};

describe("calcularProntidao — nunca promove a pronta_para_envio faltando um item", () => {
  it("tudo presente: pronta_para_envio, checklist inteiro true", () => {
    const r = calcularProntidao(TUDO_OK);
    expect(r.status).toBe("pronta_para_envio");
    expect(Object.values(r.checklist).every(Boolean)).toBe(true);
  });

  it("falta só o prazo: NÃO fica pronta_para_envio (Review Focus — um item barra o total)", () => {
    const r = calcularProntidao({ ...TUDO_OK, temPrazo: false });
    expect(r.status).not.toBe("pronta_para_envio");
    expect(r.checklist.prazo).toBe(false);
  });

  it("falta contato ou escopo (o básico): incompleta, não pronta_para_revisao", () => {
    expect(calcularProntidao({ ...TUDO_OK, temContato: false }).status).toBe("incompleta");
    expect(calcularProntidao({ ...TUDO_OK, temEscopo: false }).status).toBe("incompleta");
  });

  it("tem o básico (contato+escopo) mas falta algo de envio: pronta_para_revisao", () => {
    const r = calcularProntidao({ ...TUDO_OK, temPagamento: false });
    expect(r.status).toBe("pronta_para_revisao");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/propostas/prontidao.test.ts`
Expected: FAIL — `Cannot find module './prontidao'`

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/prontidao.ts

/**
 * Prontidão da proposta (spec de modelos §7.8/§13) — cálculo PURO. Quem monta
 * `EntradaDeProntidao` a partir de `crm_proposals`/itens/briefing é trabalho
 * da Onda M1 (ainda não fiada aqui): esta função só decide o status a partir
 * de booleanos já resolvidos, para poder ser testada sem depender do
 * conteúdo real dos modelos-piloto, que não existe nesta onda.
 */
export interface EntradaDeProntidao {
  temContato: boolean;
  temEscopo: boolean;
  temPrazo: boolean;
  temPrecoDefinido: boolean;
  temPagamento: boolean;
  temValidade: boolean;
  temConteudoCompleto: boolean;
}

export type StatusDeProntidao = "incompleta" | "pronta_para_revisao" | "pronta_para_envio";

export interface ChecklistDeProntidao {
  cliente: boolean;
  escopo: boolean;
  prazo: boolean;
  investimento: boolean;
  pagamento: boolean;
  validade: boolean;
  conteudo: boolean;
}

export interface Prontidao {
  status: StatusDeProntidao;
  checklist: ChecklistDeProntidao;
}

export function calcularProntidao(entrada: EntradaDeProntidao): Prontidao {
  const checklist: ChecklistDeProntidao = {
    cliente: entrada.temContato,
    escopo: entrada.temEscopo,
    prazo: entrada.temPrazo,
    investimento: entrada.temPrecoDefinido,
    pagamento: entrada.temPagamento,
    validade: entrada.temValidade,
    conteudo: entrada.temConteudoCompleto,
  };

  const basico = checklist.cliente && checklist.escopo;
  const tudo = Object.values(checklist).every(Boolean);

  const status: StatusDeProntidao = !basico ? "incompleta" : tudo ? "pronta_para_envio" : "pronta_para_revisao";

  return { status, checklist };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/propostas/prontidao.test.ts`
Expected: PASS 4/4

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/prontidao.ts lib/propostas/prontidao.test.ts
git commit -m "feat(propostas): calcularProntidao — cálculo puro do status de prontidão (M0)"
```

---

### Task 6: Rodar tudo e confirmar

**Files:** nenhum novo — verificação.

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: 0 erros.

- [ ] **Step 2: Suíte completa**

Run: `pnpm test:unit > /tmp/vt-m0.log 2>&1; echo "exit=$?"; grep -aE "Test Files|^ *Tests |^ *Errors " /tmp/vt-m0.log`
Expected: mesmos 13 arquivos vermelhos conhecidos (WSL/bash "cerca", pdfjs-dist
Windows) de antes desta onda, mais os testes novos desta onda (Tasks 2, 3, 5)
passando. Nenhum arquivo novo vermelho.

- [ ] **Step 3: Checar colisão de migration**

Run: `pnpm checar:colisao-de-migration`
Expected: sem erro para os dois NNNN novos desta onda (podem sair avisos de
"também está em PR aberto" — não reprovam, quem mescla primeiro fica).

- [ ] **Step 4: Commit final (se sobrar algo solto)**

```bash
git status --porcelain
# se limpo, nada a commitar — as Tasks 1-5 já commitaram tudo
```

---

## Nota de escopo — o que esta onda DELIBERADAMENTE não faz

- **Nenhuma tela.** `proposal_templates` não tem rota CRUD nem editor — isso é
  Onda M3 (canvas). As colunas novas em `crm_proposals` não aparecem em
  nenhuma tela ainda.
- **Nenhum uso pelo agente de IA.** `briefing_json`, `tipo_projeto`,
  `prazo_dias_uteis`, `pagamento`, `resumo_comercial` (§5.2 da spec de
  modelos) ficam para a Onda M1 — não fazem parte deste plano.
- **Nenhum renderer/PDF de modelo.** A pergunta "o `@react-pdf/renderer`
  aguenta 15 seções de texto longo sem quebrar layout" segue sem medir — só
  bloqueia a Onda M2, não esta.
- **`calcularProntidao` não está fiado a lugar nenhum.** É função pura,
  testada com fixture. Ligá-la a `crm_proposals` de verdade é Onda M1.

Isto é intencional: o objetivo desta onda é o alicerce de schema, testável
sem depender do conteúdo dos 8 modelos-piloto (que não existe) nem de uma
decisão de motor de PDF (que não foi medida). Ligar os pontos vem nas ondas
seguintes, uma prova na tela de cada vez — como todas as anteriores.
