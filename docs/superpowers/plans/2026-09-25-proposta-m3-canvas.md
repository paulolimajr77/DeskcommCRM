# Proposta M3 — Canvas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a Onda 3 ("canvas") da onda de modelos: o operador vê a proposta como o cliente vai ver (documento renderizado pela M2), edita o texto de qualquer seção à mão, e enxerga as pendências de envio na própria tela — tudo dentro do editor de proposta que já existe (`app/app/proposals/[id]/_client.tsx`).

**Architecture:** Uma coluna nova (`secoes_editadas jsonb`) guarda as sobrescritas manuais por seção. Uma rota nova (`GET`/`PATCH /api/v1/proposals/[id]/documento`) resolve o modelo (M0), monta os dados do briefing, renderiza (M2), aplica as sobrescritas e devolve também a prontidão (M1). Um componente novo (`DocumentoCanvas`) chama essa rota e vira a área principal do editor, acima do formulário de itens que já existe — a lateral com o chat IA (`AssistantPanel`) continua exatamente onde está, sem mudar (isso é o item 8 da spec, §13: canvas = área principal, chat = lateral).

**Tech Stack:** TypeScript, Next.js Route Handlers, React (client component), Supabase/Postgres, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-proposta-comercial-templates-design.md` (§11 — Onda 3; §13 — item 8 do dono, mockup do canvas). M0, M1 e M2 já estão mescladas em `feat/proposta-comercial`.

## Global Constraints

- **`renderer.ts` (M2) ganha um campo por seção, de forma aditiva.** `SecaoRenderizada` passa a ter `faltantes: string[]` (as variáveis que faltaram NAQUELA seção — hoje só existe o agregado `DocumentoRenderizado.variaveisFaltando`). É a peça que faltava para a Task 3 conseguir tirar uma seção da lista de pendências quando o operador a edita à mão. Mudança compatível: os testes existentes de `renderer.test.ts` usam `toMatchObject` (subconjunto), então continuam verdes sem alteração.
- **Sobrescrita manual (`secoes_editadas`) substitui o `body` INTEIRO da seção, sem passar de novo pelas variáveis** — o operador está escrevendo o texto final, não editando um template. Uma seção sobrescrita sai da lista de pendências (as variáveis que ela tinha viram irrelevantes — o operador já resolveu à mão).
- **`montarDadosDoDocumento` só usa `briefing_json`** (mais `numero: null`, reafirmando a regra do M2). Não inventamos uma estrutura de chaves (`client.name`, `project.objective`...) diferente do que os 8 modelos reais já usam — `briefing_json` é exatamente o insumo estruturado que a M1 desenhou para isso; quem preenche o conteúdo dele (a conversa de briefing) é onda futura (fora deste plano).
- **PATCH da seção é "último a escrever vence", sem controle de concorrência por `revision`.** É uma edição direta de texto, diferente do fluxo do `AssistantPanel` (que já usa `revision` porque aplica mudança estruturada da IA). Se dois gestores editarem a mesma seção ao mesmo tempo, um sobrescreve o outro — aceitável para v1, mesmo risco que editar `condicoes`/`titulo` já tem hoje no editor.
- **PATCH não valida `secaoId` contra o modelo resolvido** — só que é uma string não vazia. Guardar uma chave que não corresponde a nenhuma seção do modelo atual é inofensivo (fica sem efeito no `GET`, que só aplica overrides para seções que existem no documento renderizado).
- **Papel exigido:** `GET` = `viewer` (só leitura, como o resto do editor). `PATCH` = `manager` — decisão #10 da spec de 21/09 ("revisar/alterar proposta só manager+"), aplicada aqui porque esta rota nasce agora, sem legado para conciliar.
- **Toda string nova de tela precisa de entrada em espanhol** (`lib/i18n/dicionario.ts`, vigiado por `tests/unit/i18n-espanhol-cobre-a-tela`) — a Task 4 inclui as traduções junto com o componente, no mesmo commit.
- **Prova pela tela (Playwright) fica de FORA deste plano, de propósito.** Não existe nenhuma spec e2e do editor de propostas hoje (medido: `tests/e2e/` não tem nenhum arquivo `propos*`) — é dívida anterior a este plano, não algo que a M3 crie. Cobrir isso é decisão separada, a se tomar depois deste plano fechar, não uma tarefa escondida aqui.

## Review Focus

- **Proposta sem `template_slug`** (nunca escolheu um modelo) não pode quebrar o `GET` — devolve `secoes: []`, sem lançar. Task 3 testa.
- **Seção sobrescrita some da lista de pendências**, mesmo que a versão renderizada dela tivesse `[a definir]`. Task 3 testa.
- **`PATCH` com `secaoId` vazio ou `texto` ausente é recusado (422)**, não vira uma entrada `""` inútil no jsonb. Task 3 testa.
- **`agent` é barrado no `PATCH`** (403) — só `manager`+ edita seção. Task 3 testa.
- **O canvas não pode travar a tela quando a proposta ainda não tem nenhuma seção** (sem modelo escolhido) — mostra um aviso, não uma tela em branco nem erro. Task 4 testa (via mock do fetch).

---

### Task 1: Migration — `secoes_editadas` em `crm_proposals`

**Files:**
- Create: `supabase/migrations/20260925180000_0417_m3_secoes_editadas.sql`
- Modify: `supabase/baseline.sql` (apêndice, antes da `-- ---- VARREDURA anon ----`)
- Modify: `supabase/migrations/MANIFEST.md`

**Interfaces:**
- Produces: coluna `crm_proposals.secoes_editadas jsonb` (nullable, sem CHECK) — Task 3 lê e escreve nela.

- [ ] **Step 1: Escrever a migration**

```sql
-- 20260925180000_0417_m3_secoes_editadas.sql
-- M3 (onda de modelos, §11 — canvas) — edição manual por seção. jsonb
-- {secaoId: textoEditado}, nullable, sem CHECK (mapa livre, chave = id de
-- seção do modelo em uso; não há vocabulário fechado a validar no schema).
alter table public.crm_proposals add column if not exists secoes_editadas jsonb;
```

- [ ] **Step 2: Registrar no MANIFEST**

```
| `20260925180000` | `0417_m3_secoes_editadas` | **M3 (onda de modelos) — edição manual por seção do documento.** Coluna `secoes_editadas jsonb` nullable em `crm_proposals`: mapa `{secaoId: textoEditado}` que a rota `GET/PATCH /api/v1/proposals/[id]/documento` lê e escreve. Sem CHECK — chave é o id de seção do modelo em uso, vocabulário aberto. Sem backfill. |
```

- [ ] **Step 3: Apêndice no `baseline.sql`**

Achar o bloco mais recente de `crm_proposals` (grep por `-- ---- M1: briefing e motivo de revisão`) e adicionar logo depois, ANTES do bloco `-- ---- VARREDURA anon ----`:

```sql
-- ---- M3: edição manual por seção do documento (migration 0417) ----
alter table public.crm_proposals add column if not exists secoes_editadas jsonb;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260925180000_0417_m3_secoes_editadas.sql supabase/baseline.sql supabase/migrations/MANIFEST.md
git commit -m "feat(db): 0417 M3 — secoes_editadas em crm_proposals"
```

---

### Task 2: `renderer.ts` ganha `faltantes` por seção; `montar-dados.ts`

**Files:**
- Modify: `lib/propostas/documento/renderer.ts`
- Modify: `lib/propostas/documento/renderer.test.ts` (só adiciona 1 teste, não remove nenhum)
- Create: `lib/propostas/documento/montar-dados.ts`
- Create: `lib/propostas/documento/montar-dados.test.ts`

**Interfaces:**
- Produces: `SecaoRenderizada.faltantes: string[]` (novo campo); `montarDadosDoDocumento(proposta: { briefing_json: unknown }): Record<string, unknown>` — Task 3 consome os dois.

- [ ] **Step 1: Adicionar o teste do campo novo em `renderer.test.ts`**

Adicionar, dentro do `describe("renderizarDocumento", ...)` já existente:

```typescript
it("cada seção carrega as PRÓPRIAS variáveis faltando (não só o agregado)", () => {
  const doc = renderizarDocumento(MODELO, { project: { name: "X" } });
  const garantia = doc.secoes.find((s) => s.id === "obrigatoria_e_condicional");
  expect(garantia?.faltantes).toEqual(["warranty.days"]);
  const resumo = doc.secoes.find((s) => s.id === "resumo");
  expect(resumo?.faltantes).toEqual([]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/documento/renderer.test.ts`
Expected: FAIL — `garantia?.faltantes` é `undefined`, não `["warranty.days"]`

- [ ] **Step 3: Implementar**

Em `lib/propostas/documento/renderer.ts`, trocar a interface e o loop:

```typescript
export interface SecaoRenderizada {
  id: string;
  title: string;
  body: string;
  faltantes: string[];
}
```

```typescript
export function renderizarDocumento(modelo: ModeloBase, dados: Record<string, unknown>): DocumentoRenderizado {
  const porId = new Map(modelo.sections.map((s) => [s.id, s]));
  const secoes: SecaoRenderizada[] = [];
  const variaveisFaltando: string[] = [];

  for (const id of modelo.sectionOrder) {
    const secao = porId.get(id);
    if (!secao) continue;

    if (secao.conditional && !secao.required && !condicionalTemAlgumDado(secao, dados)) {
      continue;
    }

    const { textoRenderizado, faltantes } = substituirVariaveis(secao.body, dados);
    secoes.push({ id: secao.id, title: secao.title, body: textoRenderizado, faltantes });
    variaveisFaltando.push(...faltantes);
  }

  return { secoes, variaveisFaltando };
}
```

(Só a assinatura de `secoes.push` muda — o resto do arquivo, incluindo `condicionalTemAlgumDado` e os imports, fica igual.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/documento/renderer.test.ts`
Expected: PASS (8/8 — os 7 de antes + o novo)

- [ ] **Step 5: Escrever o teste de `montarDadosDoDocumento`**

```typescript
// lib/propostas/documento/montar-dados.test.ts
import { describe, expect, it } from "vitest";

import { montarDadosDoDocumento } from "./montar-dados";

describe("montarDadosDoDocumento", () => {
  it("espalha o briefing_json no resultado", () => {
    const dados = montarDadosDoDocumento({ briefing_json: { project: { name: "Site Catálogo" } } });
    expect(dados).toMatchObject({ project: { name: "Site Catálogo" } });
  });

  it("numero é sempre null (renderer reafirma, não confia — Global Constraint da M2)", () => {
    const dados = montarDadosDoDocumento({ briefing_json: { numero: 42 } });
    expect(dados.numero).toBeNull();
  });

  it("briefing_json null não lança, devolve objeto só com numero", () => {
    expect(() => montarDadosDoDocumento({ briefing_json: null })).not.toThrow();
    expect(montarDadosDoDocumento({ briefing_json: null })).toEqual({ numero: null });
  });

  it("briefing_json que não é objeto (array, string) é ignorado, não lança", () => {
    expect(montarDadosDoDocumento({ briefing_json: ["x"] })).toEqual({ numero: null });
    expect(montarDadosDoDocumento({ briefing_json: "texto solto" })).toEqual({ numero: null });
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/documento/montar-dados.test.ts`
Expected: FAIL — `Cannot find module './montar-dados'`

- [ ] **Step 7: Implementar**

```typescript
// lib/propostas/documento/montar-dados.ts
/**
 * Monta o objeto de dados que `renderizarDocumento` (M2) consome, a partir
 * do `briefing_json` da proposta. Não inventa estrutura própria — o
 * briefing É o insumo (spec de 21/09, M1). `numero` é sempre `null`: o
 * renderer reafirma a regra "número nunca aparece em rascunho" (M2 Global
 * Constraints) — quem chama decide, e este é o único chamador hoje.
 */
export function montarDadosDoDocumento(proposta: { briefing_json: unknown }): Record<string, unknown> {
  const briefing =
    proposta.briefing_json && typeof proposta.briefing_json === "object" && !Array.isArray(proposta.briefing_json)
      ? (proposta.briefing_json as Record<string, unknown>)
      : {};
  return { ...briefing, numero: null };
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run lib/propostas/documento/montar-dados.test.ts lib/propostas/documento/renderer.test.ts lib/propostas/documento/pdf-do-documento.test.ts`
Expected: PASS (4 + 8 + 2 = 14/14)

- [ ] **Step 9: Commit**

```bash
git add lib/propostas/documento/renderer.ts lib/propostas/documento/renderer.test.ts lib/propostas/documento/montar-dados.ts lib/propostas/documento/montar-dados.test.ts
git commit -m "feat(propostas): faltantes por seção + montarDadosDoDocumento (M3)"
```

---

### Task 3: `app/api/v1/proposals/[id]/documento/route.ts`

**Files:**
- Create: `app/api/v1/proposals/[id]/documento/route.ts`
- Create: `app/api/v1/proposals/[id]/documento/route.test.ts`

**Interfaces:**
- Consumes: `resolverModelo` (`@/lib/propostas/modelos/resolver`, M0), `montarDadosDoDocumento` e `renderizarDocumento` (Task 2), `montarEntradaDeProntidao` (`@/lib/propostas/prontidao-da-proposta`, M1), `gerarResumoComercial` (`@/lib/propostas/resumo-comercial`, M1).
- Produces: `GET` devolve `{ modeloSlug, secoes, variaveisFaltando, prontidao, resumoComercial }`; `PATCH` devolve `{ secoesEditadas }` — Task 4 consome os dois.

- [ ] **Step 1: Escrever o teste**

```typescript
// app/api/v1/proposals/[id]/documento/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks: Record<string, any> = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSupportWrite: vi.fn(),
  createAdminClient: vi.fn(),
  audit: vi.fn(),
  traduzir: vi.fn((txt: string) => txt),
  resolverModelo: vi.fn(),
}));

vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.requireSupportWrite }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/i18n/dicionario", () => ({ traduzir: mocks.traduzir }));
vi.mock("@/lib/propostas/modelos/resolver", () => ({ resolverModelo: mocks.resolverModelo }));

import { GET, PATCH } from "./route";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROPOSTA_ID = "11111111-1111-4111-8111-111111111111";
const ROLE_RANK: Record<string, number> = { viewer: 1, agent: 2, manager: 3, admin: 4 };

interface MundoOpts {
  papel?: keyof typeof ROLE_RANK;
  templateSlug?: string | null;
  secoesEditadas?: Record<string, string> | null;
  briefingJson?: Record<string, unknown> | null;
}

function montarMundo(opts: MundoOpts = {}) {
  const papel = opts.papel ?? "manager";
  const rank = ROLE_RANK[papel] ?? 0;
  mocks.requireRole.mockImplementation(async (minRole: keyof typeof ROLE_RANK) => {
    const minRank = ROLE_RANK[minRole] ?? 0;
    return rank < minRank
      ? { ok: false, response: new Response(JSON.stringify({ error: { code: "forbidden_role" } }), { status: 403 }) }
      : { ok: true, user: { id: "u1", idioma: "pt-BR" }, org: { orgId: ORG_ID } };
  });
  mocks.requireSupportWrite.mockResolvedValue(null);

  const propostaRow = {
    id: PROPOSTA_ID,
    organization_id: ORG_ID,
    template_slug: opts.templateSlug ?? null,
    briefing_json: opts.briefingJson ?? null,
    secoes_editadas: opts.secoesEditadas ?? null,
    pricing_status: "manual",
    contact_id: "contato-1",
    titulo: "Site catálogo",
    prazo_dias_uteis: 20,
    pagamento: "50_50",
    valid_until: "2026-12-31",
  };

  let secoesEditadasCapturadas: Record<string, unknown> | undefined;
  const admin = {
    from: vi.fn((tabela: string) => {
      if (tabela === "crm_proposals") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: propostaRow }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            secoesEditadasCapturadas = payload.secoes_editadas as Record<string, unknown>;
            return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
          },
        };
      }
      if (tabela === "crm_proposal_items") {
        return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ preco_unitario_cents: 1000 }] }) }) }) };
      }
      throw new Error(`tabela inesperada no mock: ${tabela}`);
    }),
  };
  mocks.createAdminClient.mockReturnValue(admin);

  mocks.resolverModelo.mockImplementation(async (_db: unknown, _org: string, slug: string) => {
    if (opts.templateSlug === null || opts.templateSlug === undefined) return null;
    return {
      slug,
      version: 1,
      sectionOrder: ["resumo"],
      sections: [{ id: "resumo", title: "Resumo", titleEs: null, body: "Projeto: {{project.name}}", bodyEs: null, required: true, conditional: false }],
      origem: "base",
    };
  });

  return { capturedSecoesEditadas: () => secoesEditadasCapturadas };
}

describe("GET /api/v1/proposals/[id]/documento", () => {
  beforeEach(() => vi.clearAllMocks());

  it("proposta sem template_slug devolve secoes vazias, sem lançar (Review Focus)", async () => {
    montarMundo({ templateSlug: null });
    const res = await GET(new Request("http://x") as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.secoes).toEqual([]);
  });

  it("com modelo resolvido, renderiza a seção com o dado do briefing", async () => {
    montarMundo({ templateSlug: "site_institucional", briefingJson: { project: { name: "Site Catálogo" } } });
    const res = await GET(new Request("http://x") as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
    const body = await res.json();
    expect(body.data.secoes[0]).toMatchObject({ id: "resumo", body: "Projeto: Site Catálogo" });
  });

  it("seção sobrescrita SOME da lista de pendências (Review Focus)", async () => {
    montarMundo({
      templateSlug: "site_institucional",
      briefingJson: {},
      secoesEditadas: { resumo: "Texto final escrito à mão." },
    });
    const res = await GET(new Request("http://x") as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
    const body = await res.json();
    expect(body.data.secoes[0].body).toBe("Texto final escrito à mão.");
    expect(body.data.variaveisFaltando).toEqual([]);
  });
});

describe("PATCH /api/v1/proposals/[id]/documento", () => {
  beforeEach(() => vi.clearAllMocks());

  it("manager grava a sobrescrita da seção", async () => {
    const { capturedSecoesEditadas } = montarMundo({ papel: "manager" });
    const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ secaoId: "resumo", texto: "Novo texto" }) });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
    expect(res.status).toBe(200);
    expect(capturedSecoesEditadas()).toMatchObject({ resumo: "Novo texto" });
  });

  it("agent é barrado (403) — só manager+ edita seção (Global Constraint)", async () => {
    montarMundo({ papel: "agent" });
    const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ secaoId: "resumo", texto: "x" }) });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
    expect(res.status).toBe(403);
  });

  it("secaoId vazio é recusado com 422 (Review Focus)", async () => {
    montarMundo({ papel: "manager" });
    const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ secaoId: "", texto: "x" }) });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
    expect(res.status).toBe(422);
  });

  it("texto ausente é recusado com 422", async () => {
    montarMundo({ papel: "manager" });
    const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ secaoId: "resumo" }) });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/api/v1/proposals/[id]/documento/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implementar**

```typescript
// app/api/v1/proposals/[id]/documento/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { montarDadosDoDocumento } from "@/lib/propostas/documento/montar-dados";
import { renderizarDocumento } from "@/lib/propostas/documento/renderer";
import { resolverModelo } from "@/lib/propostas/modelos/resolver";
import { montarEntradaDeProntidao } from "@/lib/propostas/prontidao-da-proposta";
import { sePropostasDesligadas } from "@/lib/propostas/porta";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ secaoId: z.string().min(1), texto: z.string() });

type Ctx = { params: Promise<{ id: string }> };

async function buscarProposta(admin: ReturnType<typeof createAdminClient>, orgId: string, id: string) {
  const { data } = await admin
    .from("crm_proposals")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data as
    | {
        id: string;
        organization_id: string;
        template_slug: string | null;
        briefing_json: unknown;
        secoes_editadas: Record<string, string> | null;
        pricing_status: "missing" | "catalog" | "manual" | "custom" | "approved";
        contact_id: string | null;
        titulo: string | null;
        prazo_dias_uteis: number | null;
        pagamento: string | null;
        valid_until: string | null;
      }
    | null;
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const proposta = await buscarProposta(admin, authz.org.orgId, id);
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  if (!proposta.template_slug) {
    return ok(
      { modeloSlug: null, secoes: [], variaveisFaltando: [] as string[], prontidao: null, resumoComercial: null },
      { requestId },
    );
  }

  const modelo = await resolverModelo(admin, authz.org.orgId, proposta.template_slug);
  if (!modelo) {
    return ok(
      { modeloSlug: proposta.template_slug, secoes: [], variaveisFaltando: [] as string[], prontidao: null, resumoComercial: null },
      { requestId },
    );
  }

  const dados = montarDadosDoDocumento(proposta);
  const documento = renderizarDocumento(modelo, dados);
  const overrides = proposta.secoes_editadas ?? {};

  const secoes = documento.secoes.map((s) =>
    overrides[s.id] !== undefined ? { ...s, body: overrides[s.id]!, faltantes: [] } : s,
  );
  const variaveisFaltando = secoes.flatMap((s) => s.faltantes);

  const { data: itens } = await admin
    .from("crm_proposal_items")
    .select("preco_unitario_cents")
    .eq("organization_id", authz.org.orgId)
    .eq("proposal_id", id);
  const temItensComPreco = (itens ?? []).length > 0 && (itens ?? []).every((it) => it.preco_unitario_cents !== null);

  const prontidao = montarEntradaDeProntidao(
    {
      contact_id: proposta.contact_id,
      titulo: proposta.titulo,
      pricing_status: proposta.pricing_status,
      prazo_dias_uteis: proposta.prazo_dias_uteis,
      pagamento: proposta.pagamento,
      valid_until: proposta.valid_until,
      briefing_json: proposta.briefing_json,
    },
    temItensComPreco,
  );

  return ok({ modeloSlug: modelo.slug, secoes, variaveisFaltando, prontidao, resumoComercial: null }, { requestId });
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });

  const admin = createAdminClient();
  const proposta = await buscarProposta(admin, authz.org.orgId, id);
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  const secoesEditadas = { ...(proposta.secoes_editadas ?? {}), [parsed.data.secaoId]: parsed.data.texto };

  const { error } = await admin
    .from("crm_proposals")
    .update({ secoes_editadas: secoesEditadas })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (error) return fail("internal_error", t("Falha ao salvar a seção."), 500, { requestId });

  void audit({
    action: "proposal.documento_editado",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_proposals",
    resourceId: id,
    requestId,
    metadata: { secaoId: parsed.data.secaoId },
  });

  return ok({ secoesEditadas }, { requestId });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "app/api/v1/proposals/[id]/documento/route.test.ts"`
Expected: PASS — 7/7

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/proposals/[id]/documento/route.ts" "app/api/v1/proposals/[id]/documento/route.test.ts"
git commit -m "feat(propostas): rota GET/PATCH do documento — resolve modelo, renderiza, aplica overrides (M3)"
```

---

### Task 4: `DocumentoCanvas.tsx` — a área principal do editor

**Files:**
- Create: `app/app/proposals/[id]/_components/DocumentoCanvas.tsx`
- Create: `app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx`
- Modify: `app/app/proposals/[id]/_client.tsx` (insere o componente logo depois do bloco `{erro && (...)}`, linha ~260, antes do bloco de "Condições")
- Modify: `lib/i18n/dicionario.ts` (traduções ES das strings novas)

**Interfaces:**
- Consumes: `GET /api/v1/proposals/[id]/documento` (Task 3).

- [ ] **Step 1: Escrever o teste**

```typescript
// app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentoCanvas } from "./DocumentoCanvas";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data: body }), { status })),
  );
}

describe("DocumentoCanvas", () => {
  it("sem modelo escolhido, mostra aviso em vez de tela vazia ou erro (Review Focus)", async () => {
    mockFetch({ modeloSlug: null, secoes: [], variaveisFaltando: [], prontidao: null, resumoComercial: null });
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText(/nenhum modelo escolhido/i)).toBeInTheDocument());
  });

  it("com seções, mostra o título e o corpo de cada uma", async () => {
    mockFetch({
      modeloSlug: "site_institucional",
      secoes: [{ id: "resumo", title: "Resumo", body: "Projeto: Site Catálogo", faltantes: [] }],
      variaveisFaltando: [],
      prontidao: { status: "pronta_para_envio", checklist: {} },
      resumoComercial: null,
    });
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText("Resumo")).toBeInTheDocument());
    expect(screen.getByText("Projeto: Site Catálogo")).toBeInTheDocument();
  });

  it("com pendências, mostra a lista do que falta", async () => {
    mockFetch({
      modeloSlug: "site_institucional",
      secoes: [{ id: "resumo", title: "Resumo", body: "Projeto: [a definir]", faltantes: ["project.name"] }],
      variaveisFaltando: ["project.name"],
      prontidao: { status: "incompleta", checklist: { cliente: false } },
      resumoComercial: null,
    });
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText(/1 pendência/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx"`
Expected: FAIL — `Cannot find module './DocumentoCanvas'`

- [ ] **Step 3: Implementar**

```typescript
// app/app/proposals/[id]/_components/DocumentoCanvas.tsx
"use client";

import { useEffect, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";

interface SecaoDocumento {
  id: string;
  title: string;
  body: string;
  faltantes: string[];
}

interface Documento {
  modeloSlug: string | null;
  secoes: SecaoDocumento[];
  variaveisFaltando: string[];
  prontidao: { status: string; checklist: Record<string, boolean> } | null;
  resumoComercial: string | null;
}

export function DocumentoCanvas({ propostaId }: { propostaId: string }) {
  const t = useT();
  const [doc, setDoc] = useState<Documento | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get<ApiSuccess<Documento>>(`/api/v1/proposals/${propostaId}/documento`, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setDoc(res.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showApiError(error);
      });
    return () => controller.abort();
  }, [propostaId]);

  if (!doc) return null;

  if (!doc.modeloSlug) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-gray-600">
        {t("Nenhum modelo escolhido para esta proposta ainda.")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      {doc.variaveisFaltando.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t("Não é possível enviar")} — {doc.variaveisFaltando.length} {t("pendência(s)")}
        </div>
      )}
      <div className="space-y-3">
        {doc.secoes.map((s) => (
          <div key={s.id}>
            <div className="text-sm font-semibold">{s.title}</div>
            <div className="text-sm whitespace-pre-wrap">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx"`
Expected: PASS (3/3)

- [ ] **Step 5: Adicionar as traduções ES**

Em `lib/i18n/dicionario.ts`, dentro do objeto `DICIONARIO`, adicionar (em qualquer ponto do objeto, seguindo o padrão das linhas vizinhas):

```typescript
  "Nenhum modelo escolhido para esta proposta ainda.": { es: "Ningún modelo elegido para esta propuesta todavía." },
  "Não é possível enviar": { es: "No es posible enviar" },
  "pendência(s)": { es: "pendiente(s)" },
```

- [ ] **Step 6: Rodar o gate de i18n**

Run: `npx vitest run tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: PASS (as 3 strings novas têm entrada em espanhol)

- [ ] **Step 7: Encaixar no editor**

Em `app/app/proposals/[id]/_client.tsx`:

1. Adicionar o import, junto aos outros de `./_components`:

```typescript
import { DocumentoCanvas } from "./_components/DocumentoCanvas";
```

2. Logo depois do bloco `{erro && (...)}` (por volta da linha 260) e antes do bloco `<div className="space-y-2">` de "Condições", inserir:

```typescript
      <DocumentoCanvas propostaId={id} />
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run "app/app/proposals/[id]/"`
Expected: PASS — inclui `DocumentoCanvas.test.tsx` e o `_client.test.tsx` que já existia (sem quebrar)

- [ ] **Step 9: Commit**

```bash
git add "app/app/proposals/[id]/_components/DocumentoCanvas.tsx" "app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx" "app/app/proposals/[id]/_client.tsx" lib/i18n/dicionario.ts
git commit -m "feat(propostas): canvas do documento no editor de proposta (M3)"
```

---

## Verificação final

- [ ] `npx vitest run lib/propostas/ "app/api/v1/proposals/" "app/app/proposals/"` — tudo verde.
- [ ] Push para `fork` e conferir os 4 checks (`ci`, `e2e`, `perf`, `Publicar imagem Docker`).
- [ ] **Não incluído neste plano, decisão separada:** prova pela tela via Playwright (ver Global Constraints) — perguntar ao Paulo depois deste plano fechar, se ele quer essa etapa agora ou depois.
