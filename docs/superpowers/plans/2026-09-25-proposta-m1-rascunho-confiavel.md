# Proposta M1 — Rascunho Confiável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a Onda 1 ("rascunho confiável") da onda de modelos: capturar o briefing estruturado no rascunho, gerar o resumo comercial que o cliente lê primeiro, montar a prontidão real (não mais só a função pura) e corrigir a revisão (v2) para herdar modelo/briefing da v1 (achado M5, deferido da revisão do M0).

**Architecture:** Cinco colunas novas em `crm_proposals` (nullable, sem CHECK fechado — texto/jsonb livres por doutrina DIRC). Duas funções puras novas (`gerarResumoComercial`, `montarEntradaDeProntidao`) que só recebem dados já resolvidos — nada de I/O dentro delas, testáveis sem banco. Uma função de formatação de moeda extraída de `lib/propostas/pdf.tsx` para um módulo compartilhado (evita duplicar o `Intl.NumberFormat`). Uma correção pontual em `app/api/v1/proposals/[id]/revise/route.ts` para copiar os campos do modelo e aceitar `motivo` da revisão.

**Tech Stack:** TypeScript, Next.js Route Handlers, Supabase/Postgres, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-proposta-comercial-templates-design.md` (§4, §5.2, §11 — Onda 1) e `docs/superpowers/specs/2026-09-23-proposta-comercial-design.md` (§7, linha M0–M6). Este plano executa APENAS a Onda 1 (M1); a Onda 0 (M0 — fundamento de modelos) já está mesclada em `feat/proposta-comercial` (migrations 0410/0411/0415, `lib/propostas/modelos/*`, `lib/propostas/prontidao.ts`).

## Global Constraints

- `MODELOS_BASE` continua `Object.freeze({})` (nenhum dos 8 modelos-piloto chegou ainda) — nenhuma tarefa deste plano depende de conteúdo de modelo. Briefing, resumo comercial e prontidão funcionam com ou sem modelo escolhido.
- `pricing_status`, o índice de dedup (`crm_proposals_rascunho_unico_por_negocio_uidx`, migration 0402) e a resolução de preço do catálogo (`lib/propostas/preco-do-catalogo.ts`, `lib/propostas/precificacao.ts`) **já existem** (onda C3) — nenhuma tarefa deste plano os recria.
- `template_slug`, `template_version`, `template_snapshot`, `rendered_snapshot` **já existem** em `crm_proposals` (migration 0411, onda M0). **Ruling desta sessão:** o `tipo_projeto` que a spec de 21/09 (§5.2) descreve como "texto curto do briefing... Referenciar o vocabulário do modelo" é o MESMO conceito que `template_slug` já cobre — não se cria coluna nova para isso. Custo se errado: se algum dia o briefing precisar registrar um tipo de projeto ANTES de um modelo ser escolhido (ex.: leigo ainda não decidiu qual modelo), o valor mora dentro de `briefing_json.tipo_projeto` (é jsonb, cabe), sem migration nova.
- Próximo número de migration livre, medido nesta árvore: `0416` (o maior hoje é `0415_m0_tabela_de_modelos`). Timestamp `20260925140000` (depois do `20260925130300` da 0415). **Nada roda nesta máquina** (doutrina `NOSSA-REGRA.md`) — a prova de que a migration aplica é o CI do fork (`ci`, `invariants`), não uma rodada local de `pnpm test:db`.
- Toda coluna nova é nullable, sem CHECK fechado (nenhuma delas tem vocabulário fechado na spec).
- Tripla da casa em toda mudança de schema: migration versionada + apêndice idempotente no `baseline.sql` (antes do bloco "VARREDURA anon") + linha em `supabase/migrations/MANIFEST.md`.

## Review Focus

- **Revisão (v2) nasce sem o modelo da v1.** Hoje `revise/route.ts` copia `titulo`/`condicoes`/`valid_until`/itens mas NUNCA `template_slug`/`template_version`/`template_snapshot`/`briefing_json` — quem revisa uma proposta com modelo escolhido perde o modelo na v2, sem aviso. É o achado M5 deferido na revisão do M0. Task 4 fecha isto.
- **`resumo_comercial` com `pricing_status = 'missing'` não pode mostrar "R$ 0,00".** A spec-mãe (§5.1) é explícita: preço sem fonte é "A definir", nunca zero disfarçado de preço. Task 2 testa esse caso.
- **`motivo` ausente no POST de revisão não pode quebrar revisões existentes.** O campo é novo e opcional — toda revisão que hoje funciona sem corpo (ou com corpo vazio) continua funcionando. Task 4 testa o corpo ausente.
- **`prazo_dias_uteis` zero ou negativo não conta como "tem prazo".** A UI mostraria "Prazo: 0 dias úteis", que não é uma resposta válida ao cliente. Task 3 testa o limite.
- **`briefing_json` nulo ou com formato antigo/inesperado não pode lançar.** Toda proposta criada antes deste plano tem `briefing_json = null` — `montarEntradaDeProntidao` é chamada em produção para propostas velhas e novas; precisa degradar para "sem briefing" em vez de estourar. Task 3 testa `null` e um objeto vazio.

---

### Task 1: Migration — colunas do briefing e da revisão em `crm_proposals`

**Files:**
- Create: `supabase/migrations/20260925140000_0416_m1_briefing_e_revisao.sql`
- Modify: `supabase/baseline.sql` (apêndice, antes do bloco `-- ---- VARREDURA anon ----`)
- Modify: `supabase/migrations/MANIFEST.md` (nova linha na tabela "Applied")
- Test: `tests/invariants/rls-completude-varredura.test.ts` não muda (as 5 colunas são de uma tabela já coberta) — nenhuma tarefa de teste de banco aqui além da prova de schema abaixo

**Interfaces:**
- Produces: colunas `crm_proposals.briefing_json jsonb`, `crm_proposals.prazo_dias_uteis int`, `crm_proposals.pagamento text`, `crm_proposals.resumo_comercial text`, `crm_proposals.version_reason text` — todas nullable, sem CHECK. Tasks 2–4 leem/escrevem nelas pelo nome exato.

- [ ] **Step 1: Escrever a migration**

```sql
-- 20260925140000_0416_m1_briefing_e_revisao.sql
-- M1 (onda de modelos, §5.2 da spec de 21/09) — rascunho confiável.
-- Cinco colunas novas em crm_proposals, todas nullable e sem CHECK fechado
-- (nenhuma tem vocabulário fechado na spec):
--   briefing_json    — insumo estruturado do briefing (segmento, serviço,
--                       estágio, identidade, textos, fotos) — auditável.
--   prazo_dias_uteis — prazo confirmado/autorizado, nunca inferido.
--   pagamento        — texto curto (ex.: "50_50") ou livre validado.
--   resumo_comercial — gerado na emissão (lib/propostas/resumo-comercial.ts),
--                       nunca digitado à mão.
--   version_reason   — motivo da revisão (POST .../revise), opcional.
alter table public.crm_proposals add column if not exists briefing_json jsonb;
alter table public.crm_proposals add column if not exists prazo_dias_uteis int;
alter table public.crm_proposals add column if not exists pagamento text;
alter table public.crm_proposals add column if not exists resumo_comercial text;
alter table public.crm_proposals add column if not exists version_reason text;
```

- [ ] **Step 2: Registrar no MANIFEST**

Adicionar linha na tabela "Applied" de `supabase/migrations/MANIFEST.md`:

```
| `20260925140000` | `0416_m1_briefing_e_revisao` | **M1 (onda de modelos) — o rascunho ganha briefing e motivo de revisão.** Cinco colunas nullable em `crm_proposals`: `briefing_json` (insumo estruturado do briefing, auditável), `prazo_dias_uteis`, `pagamento`, `resumo_comercial` (gerado na emissão, nunca digitado), `version_reason` (motivo da revisão). Sem CHECK — nenhuma tem vocabulário fechado na spec de 21/09 (§5.2). Sem backfill: proposta existente fica com as cinco `null`. |
```

- [ ] **Step 3: Apêndice idempotente no `baseline.sql`**

Abrir `supabase/baseline.sql`, achar o bloco mais recente de `crm_proposals` (grep por `alter table public.crm_proposals add column if not exists template_slug`, migration 0411/0415) e adicionar logo depois, ainda ANTES do bloco `-- ---- VARREDURA anon ----`:

```sql
-- ---- M1: briefing e motivo de revisão (migration 0416) ----
alter table public.crm_proposals add column if not exists briefing_json jsonb;
alter table public.crm_proposals add column if not exists prazo_dias_uteis int;
alter table public.crm_proposals add column if not exists pagamento text;
alter table public.crm_proposals add column if not exists resumo_comercial text;
alter table public.crm_proposals add column if not exists version_reason text;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260925140000_0416_m1_briefing_e_revisao.sql supabase/baseline.sql supabase/migrations/MANIFEST.md
git commit -m "feat(db): 0416 M1 — briefing e motivo de revisão em crm_proposals"
```

A prova desta task é o CI do fork (`ci`, `invariants`) depois do push — nada roda localmente.

---

### Task 2: `lib/propostas/moeda.ts` + `lib/propostas/resumo-comercial.ts`

**Files:**
- Create: `lib/propostas/moeda.ts`
- Create: `lib/propostas/moeda.test.ts`
- Create: `lib/propostas/resumo-comercial.ts`
- Create: `lib/propostas/resumo-comercial.test.ts`
- Modify: `lib/propostas/pdf.tsx:37-39` (usa a função extraída em vez da local)

**Interfaces:**
- Consumes: nada (funções puras).
- Produces: `formatarMoeda(cents: number, iso: string): string` (de `lib/propostas/moeda.ts`); `gerarResumoComercial(entrada: ResumoComercialEntrada): string` (de `lib/propostas/resumo-comercial.ts`) — Task 4 (revise/route.ts, indiretamente pela rota de criação/PATCH) e uma tarefa futura de M2 (documento) vão chamar `gerarResumoComercial`.

- [ ] **Step 1: Escrever o teste de `formatarMoeda`**

```typescript
// lib/propostas/moeda.test.ts
import { describe, expect, it } from "vitest";

import { formatarMoeda } from "./moeda";

describe("formatarMoeda", () => {
  it("formata centavos em real", () => {
    expect(formatarMoeda(150000, "BRL")).toBe(
      (150000 / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    );
  });

  it("formata centavos em outra moeda (D11 — moeda da organização)", () => {
    expect(formatarMoeda(150000, "USD")).toBe(
      (150000 / 100).toLocaleString("pt-BR", { style: "currency", currency: "USD" }),
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/moeda.test.ts`
Expected: FAIL — `Cannot find module './moeda'`

- [ ] **Step 3: Extrair a função de `pdf.tsx`**

```typescript
// lib/propostas/moeda.ts
export function formatarMoeda(cents: number, iso: string): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: iso });
}
```

Em `lib/propostas/pdf.tsx`, remover a função local `moeda` (linhas 37-39) e trocar as duas chamadas por `formatarMoeda`, com o import:

```typescript
import { formatarMoeda } from "./moeda";
```

E substituir `moeda(` por `formatarMoeda(` em todos os usos dentro do arquivo (`git grep -n "moeda(" lib/propostas/pdf.tsx` para achar os pontos).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/moeda.test.ts lib/propostas/pdf.test.ts`
Expected: PASS — inclusive `pdf.test.ts`, que não deve ter mudado de comportamento (mesma formatação, função só mudou de lugar)

- [ ] **Step 5: Escrever o teste de `gerarResumoComercial`**

```typescript
// lib/propostas/resumo-comercial.test.ts
import { describe, expect, it } from "vitest";

import { gerarResumoComercial } from "./resumo-comercial";

const BASE = {
  tituloProjeto: "Site catálogo de imóveis",
  totalCents: 500000,
  moeda: "BRL",
  prazoDiasUteis: 20,
  pagamento: "50_50",
  validUntil: "2026-12-31",
  pricingStatus: "manual" as const,
};

describe("gerarResumoComercial", () => {
  it("monta projeto + investimento + prazo + pagamento + validade", () => {
    const resumo = gerarResumoComercial(BASE);
    expect(resumo).toContain("Site catálogo de imóveis");
    expect(resumo).toContain("20 dias úteis");
    expect(resumo).toContain("50_50");
    expect(resumo).toContain("31/12/2026");
  });

  it("preço 'A definir' quando pricingStatus é missing — NUNCA R$ 0,00 (spec-mãe §5.1)", () => {
    const resumo = gerarResumoComercial({ ...BASE, pricingStatus: "missing", totalCents: 0 });
    expect(resumo).toContain("A definir");
    expect(resumo).not.toContain("R$ 0,00");
  });

  it("prazo ausente não aparece como '0 dias úteis'", () => {
    const resumo = gerarResumoComercial({ ...BASE, prazoDiasUteis: null });
    expect(resumo).not.toContain("0 dias úteis");
    expect(resumo).toContain("Prazo: a combinar");
  });

  it("pagamento ausente mostra placeholder, não string vazia solta", () => {
    const resumo = gerarResumoComercial({ ...BASE, pagamento: null });
    expect(resumo).toContain("Pagamento: a combinar");
  });

  it("validade ausente mostra placeholder", () => {
    const resumo = gerarResumoComercial({ ...BASE, validUntil: null });
    expect(resumo).toContain("Validade: a combinar");
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/resumo-comercial.test.ts`
Expected: FAIL — `Cannot find module './resumo-comercial'`

- [ ] **Step 7: Implementar**

```typescript
// lib/propostas/resumo-comercial.ts
import { formatarMoeda } from "./moeda";

export interface ResumoComercialEntrada {
  tituloProjeto: string;
  totalCents: number;
  moeda: string;
  prazoDiasUteis: number | null;
  pagamento: string | null;
  /** ISO 8601 (YYYY-MM-DD) ou null. */
  validUntil: string | null;
  pricingStatus: "missing" | "catalog" | "manual" | "custom" | "approved";
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * O bloco que o cliente lê primeiro (spec de 21/09 §5.2/§6.1). Pura: quem
 * monta a entrada resolve preço/prazo/pagamento/validade antes de chamar.
 */
export function gerarResumoComercial(entrada: ResumoComercialEntrada): string {
  const investimento =
    entrada.pricingStatus === "missing" ? "A definir" : formatarMoeda(entrada.totalCents, entrada.moeda);
  const prazo =
    entrada.prazoDiasUteis !== null && entrada.prazoDiasUteis > 0
      ? `${entrada.prazoDiasUteis} dias úteis`
      : "a combinar";
  const pagamento = entrada.pagamento ?? "a combinar";
  const validade = entrada.validUntil ? formatarData(entrada.validUntil) : "a combinar";

  return [
    `Projeto: ${entrada.tituloProjeto}`,
    `Investimento: ${investimento}`,
    `Prazo: ${prazo}`,
    `Pagamento: ${pagamento}`,
    `Validade: ${validade}`,
  ].join("\n");
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run lib/propostas/resumo-comercial.test.ts`
Expected: PASS (5/5)

- [ ] **Step 9: Commit**

```bash
git add lib/propostas/moeda.ts lib/propostas/moeda.test.ts lib/propostas/resumo-comercial.ts lib/propostas/resumo-comercial.test.ts lib/propostas/pdf.tsx
git commit -m "feat(propostas): resumo comercial e formatarMoeda compartilhada (M1)"
```

---

### Task 3: `lib/propostas/prontidao-da-proposta.ts` — monta `EntradaDeProntidao` de dados reais

**Files:**
- Create: `lib/propostas/prontidao-da-proposta.ts`
- Create: `lib/propostas/prontidao-da-proposta.test.ts`
- Modify: nenhum (a função fica pronta para o próximo consumidor — a tela do editor, Onda M2/M3 — sem I/O nesta task, só a montagem pura)

**Interfaces:**
- Consumes: `calcularProntidao`, `EntradaDeProntidao`, `Prontidao` de `lib/propostas/prontidao.ts` (já existem, M0).
- Produces: `montarEntradaDeProntidao(proposta: PropostaParaProntidao, temItensComPreco: boolean): Prontidao` — assinatura que a Onda M2 (documento) e a tela do editor vão chamar.

- [ ] **Step 1: Escrever o teste**

```typescript
// lib/propostas/prontidao-da-proposta.test.ts
import { describe, expect, it } from "vitest";

import { montarEntradaDeProntidao, type PropostaParaProntidao } from "./prontidao-da-proposta";

const BASE: PropostaParaProntidao = {
  contact_id: "contato-1",
  titulo: "Site catálogo",
  pricing_status: "manual",
  prazo_dias_uteis: 20,
  pagamento: "50_50",
  valid_until: "2026-12-31",
  briefing_json: { escopo: "catálogo de imóveis com filtros" },
};

describe("montarEntradaDeProntidao", () => {
  it("proposta completa fica pronta_para_envio", () => {
    const prontidao = montarEntradaDeProntidao(BASE, true);
    expect(prontidao.status).toBe("pronta_para_envio");
  });

  it("sem contato fica incompleta, mesmo com o resto preenchido", () => {
    const prontidao = montarEntradaDeProntidao({ ...BASE, contact_id: null }, true);
    expect(prontidao.status).toBe("incompleta");
    expect(prontidao.checklist.cliente).toBe(false);
  });

  it("prazo zero NÃO conta como prazo definido (Review Focus)", () => {
    const prontidao = montarEntradaDeProntidao({ ...BASE, prazo_dias_uteis: 0 }, true);
    expect(prontidao.checklist.prazo).toBe(false);
  });

  it("prazo negativo NÃO conta como prazo definido", () => {
    const prontidao = montarEntradaDeProntidao({ ...BASE, prazo_dias_uteis: -5 }, true);
    expect(prontidao.checklist.prazo).toBe(false);
  });

  it("briefing_json null não lança e conta como escopo ausente (Review Focus)", () => {
    expect(() => montarEntradaDeProntidao({ ...BASE, briefing_json: null }, true)).not.toThrow();
    const prontidao = montarEntradaDeProntidao({ ...BASE, briefing_json: null }, true);
    expect(prontidao.checklist.escopo).toBe(false);
  });

  it("briefing_json objeto vazio não lança e conta como escopo ausente", () => {
    expect(() => montarEntradaDeProntidao({ ...BASE, briefing_json: {} }, true)).not.toThrow();
    const prontidao = montarEntradaDeProntidao({ ...BASE, briefing_json: {} }, true);
    expect(prontidao.checklist.escopo).toBe(false);
  });

  it("pricing_status missing conta como preço não definido", () => {
    const prontidao = montarEntradaDeProntidao({ ...BASE, pricing_status: "missing" }, true);
    expect(prontidao.checklist.investimento).toBe(false);
  });

  it("sem itens com preço conta como conteúdo incompleto", () => {
    const prontidao = montarEntradaDeProntidao(BASE, false);
    expect(prontidao.checklist.conteudo).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/prontidao-da-proposta.test.ts`
Expected: FAIL — `Cannot find module './prontidao-da-proposta'`

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/prontidao-da-proposta.ts
import { calcularProntidao, type Prontidao } from "./prontidao";

export interface PropostaParaProntidao {
  contact_id: string | null;
  titulo: string | null;
  pricing_status: "missing" | "catalog" | "manual" | "custom" | "approved";
  prazo_dias_uteis: number | null;
  pagamento: string | null;
  valid_until: string | null;
  /** Pode vir `null` (proposta anterior a este plano) ou `{}` (briefing vazio). */
  briefing_json: unknown;
}

function temEscopo(briefingJson: unknown): boolean {
  if (briefingJson === null || typeof briefingJson !== "object" || Array.isArray(briefingJson)) return false;
  const escopo = (briefingJson as Record<string, unknown>).escopo;
  return typeof escopo === "string" && escopo.trim().length > 0;
}

/**
 * Monta `EntradaDeProntidao` a partir de uma linha de `crm_proposals` (mais
 * o booleano, já resolvido por quem chama, de "todo item tem preço"). É a
 * peça que faltava depois da Onda M0 (ver comentário em `prontidao.ts`).
 */
export function montarEntradaDeProntidao(proposta: PropostaParaProntidao, temItensComPreco: boolean): Prontidao {
  return calcularProntidao({
    temContato: proposta.contact_id !== null,
    temEscopo: temEscopo(proposta.briefing_json),
    temPrazo: proposta.prazo_dias_uteis !== null && proposta.prazo_dias_uteis > 0,
    temPrecoDefinido: proposta.pricing_status !== "missing",
    temPagamento: proposta.pagamento !== null && proposta.pagamento.trim().length > 0,
    temValidade: proposta.valid_until !== null,
    temConteudoCompleto: temItensComPreco,
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/prontidao-da-proposta.test.ts`
Expected: PASS (8/8)

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/prontidao-da-proposta.ts lib/propostas/prontidao-da-proposta.test.ts
git commit -m "feat(propostas): monta prontidão real a partir da linha de crm_proposals (M1)"
```

---

### Task 4: `revise/route.ts` herda modelo e briefing da v1; aceita `motivo`

**Files:**
- Modify: `app/api/v1/proposals/[id]/revise/route.ts`
- Modify: `app/api/v1/proposals/[id]/revise/route.test.ts`

**Interfaces:**
- Consumes: nenhuma função nova — só campos já existentes na linha (`template_slug`, `template_version`, `template_snapshot`, `briefing_json`) e o novo `version_reason` (Task 1).
- Produces: nada para tasks futuras — fecha o achado M5.

- [ ] **Step 1: Escrever o teste que reproduz o achado M5**

Adicionar ao `montarMundoDeRevisao` em `route.test.ts` os campos que faltam no objeto `proposta` mockado (linha 67-84): `template_slug: opts.templateSlug ?? null`, `template_version: opts.templateVersion ?? null`, `template_snapshot: opts.templateSnapshot ?? null`, `briefing_json: opts.briefingJson ?? null`, e no `MundoOpts` (linha 30-54) os quatro campos opcionais correspondentes (`templateSlug?: string | null`, `templateVersion?: number | null`, `templateSnapshot?: Record<string, unknown> | null`, `briefingJson?: Record<string, unknown> | null`).

Depois, adicionar os testes (no `describe` existente, ao lado dos outros casos de sucesso):

```typescript
it("a v2 herda template_slug/template_version/template_snapshot/briefing_json da v1 (M5 — achado da revisão do M0)", async () => {
  const { admin, capturedInsert } = montarMundoDeRevisao({
    templateSlug: "catalogo_imobiliario",
    templateVersion: 3,
    templateSnapshot: { titulo: "Catálogo Imobiliário" },
    briefingJson: { escopo: "catálogo com filtros" },
  });
  const res = await POST(new Request("http://x", { method: "POST" }) as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
  expect(res.status).toBe(201);
  expect(capturedInsert()).toMatchObject({
    template_slug: "catalogo_imobiliario",
    template_version: 3,
    template_snapshot: { titulo: "Catálogo Imobiliário" },
    briefing_json: { escopo: "catálogo com filtros" },
  });
});

it("v1 sem modelo (template_slug null) — a v2 também nasce sem modelo, sem lançar", async () => {
  montarMundoDeRevisao({ templateSlug: null });
  const res = await POST(new Request("http://x", { method: "POST" }) as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
  expect(res.status).toBe(201);
});

it("aceita `motivo` no corpo e grava em version_reason", async () => {
  const { capturedInsert } = montarMundoDeRevisao();
  const req = new Request("http://x", { method: "POST", body: JSON.stringify({ motivo: "cliente pediu novo prazo" }) });
  const res = await POST(req as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
  expect(res.status).toBe(201);
  expect(capturedInsert()).toMatchObject({ version_reason: "cliente pediu novo prazo" });
});

it("corpo ausente continua funcionando — version_reason fica null (Review Focus)", async () => {
  const { capturedInsert } = montarMundoDeRevisao();
  const res = await POST(new Request("http://x", { method: "POST" }) as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
  expect(res.status).toBe(201);
  expect(capturedInsert()).toMatchObject({ version_reason: null });
});
```

O helper `montarMundoDeRevisao` precisa devolver `capturedInsert` — uma função que lê o objeto passado ao `.insert(...)` do `crm_proposals` mockado (o teste já mocka `createAdminClient`; ver como os testes de sucesso existentes verificam o insert hoje, mais abaixo no mesmo arquivo, e replicar o mesmo padrão de captura, sem duplicar o mock inteiro).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run app/api/v1/proposals/[id]/revise/route.test.ts`
Expected: FAIL — os 4 casos novos falham porque a rota não lê `template_slug`/`template_version`/`template_snapshot`/`briefing_json`/`motivo`

- [ ] **Step 3: Implementar**

Em `app/api/v1/proposals/[id]/revise/route.ts`:

1. Adicionar o import do Zod e o schema do corpo, logo após os imports existentes:

```typescript
import { z } from "zod";

const bodySchema = z.object({ motivo: z.string().max(1000).optional() });
```

2. Depois de resolver `{ id }` (linha 34) e antes de criar o `admin` client, ler o corpo (aceitando corpo ausente, igual ao padrão de `decide/route.ts`):

```typescript
const parsedBody = bodySchema.safeParse(await _req.json().catch(() => ({})));
const motivo = parsedBody.success ? (parsedBody.data.motivo ?? null) : null;
```

Trocar a assinatura de `POST(_req: NextRequest, ...)` para `POST(req: NextRequest, ...)` (o parâmetro já existe, só não era lido) e usar `req.json()` no lugar de `_req.json()`.

3. No objeto do `.insert(...)` da v2 (linhas 88-104), adicionar os campos herdados:

```typescript
      template_slug: proposta.template_slug,
      template_version: proposta.template_version,
      template_snapshot: proposta.template_snapshot,
      briefing_json: proposta.briefing_json,
      version_reason: motivo,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run app/api/v1/proposals/[id]/revise/route.test.ts`
Expected: PASS — todos os casos, os 4 novos e os pré-existentes

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/proposals/[id]/revise/route.ts app/api/v1/proposals/[id]/revise/route.test.ts
git commit -m "fix(propostas): revisão herda modelo/briefing da v1 e aceita motivo (M5, M1)"
```

---

## Verificação final

- [ ] `npx vitest run lib/propostas/ app/api/v1/proposals/` — tudo verde (não substitui `pnpm test:unit` completo, que é a prova real; ver `NOSSA-REGRA.md`: nada roda nesta máquina além do que o CI já confirma).
- [ ] Push para `fork` e conferir os 4 checks (`ci`, `e2e`, `perf`, `Publicar imagem Docker`) — a prova de schema (`0416` aplicando limpo em fresh install e em update) só existe no CI, nunca localmente.
