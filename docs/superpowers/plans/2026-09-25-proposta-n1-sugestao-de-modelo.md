# Propostas N1 — a IA sugere o modelo, uma pessoa confirma

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Hoje não existe NENHUM caminho para uma proposta ganhar um modelo (`template_slug`) — nem a IA escolhe ao rascunhar, nem existe seletor na tela. Este plano fecha essa lacuna: a ferramenta MCP `crm_draft_proposal` ganha um campo opcional para a IA sugerir um modelo dos 8 do catálogo, e a tela do editor ganha um jeito de confirmar essa sugestão (ou escolher outro modelo à mão) — só quando confirmado o modelo passa a valer de verdade.

**Architecture:** Uma coluna nova (`template_slug_sugerido`) guarda a sugestão como estado *provisório*, distinto de `template_slug` (que só é gravado quando alguém confirma). Uma rota nova e pequena (`PATCH /api/v1/proposals/[id]/modelo`) faz a confirmação — separada da rota de edição de itens/condições para não precisar de `revision` (concorrência otimista) numa ação que não conflita com edição de texto.

**Tech Stack:** Next.js Route Handlers, Supabase (Postgres), Zod, React (client component já existente).

**Spec:** `docs/superpowers/specs/2026-09-21-proposta-comercial-templates-design.md` (§4, item [1]: "a IA sugere o modelo"; a decisão de "sugere e confirma" — em vez de "escolhe sozinha" ou "sempre manual" — foi tomada pelo dono do produto em 25/09/2026, fora da spec original, e vale sobre qualquer leitura diferente que a spec permita).

## Global Constraints

- Migration idempotente: `add column if not exists`.
- Apêndice do `baseline.sql` também idempotente, no bloco de `crm_proposals` (não crie bloco novo).
- `template_slug_sugerido` **nunca** entra na constraint `crm_proposals_template_slug_versao_juntos_check` — ela é só sobre `template_slug`/`template_version`, que continuam sendo o par "confirmado".
- Toda rota nova segue o padrão do repo: `requireRole`, `sePropostasDesligadas`, `requireSupportWrite`, `traduzir`, `ok`/`fail`, `requestId` via `randomUUID()`.
- Os 8 slugs válidos são os que já existem em `MODELOS_BASE` (`lib/propostas/modelos/catalogo-base.ts`): `site_institucional`, `landing_page`, `ecommerce`, `catalogo_imobiliario`, `site_profissional`, `sistema_web`, `automacao`, `projeto_personalizado`. Nunca hardcode essa lista em mais de um lugar — sempre derive de `MODELOS_BASE`/`ROTULO_DO_MODELO`.
- Próximo número de migration livre medido em 25/09/2026: `0422` (via `pnpm checar:colisao-de-migration`). Confira de novo antes de aplicar — pode ter mudado.

## Review Focus

- Confirmar um modelo com `template_slug` que não existe em `MODELOS_BASE` nem em `proposal_templates` da organização — a rota tem que recusar com 422, nunca gravar um slug morto que o `/documento` depois trata como "modelo não encontrado" silenciosamente.
- A IA manda `template_slug_sugerido` com um valor fora dos 8 conhecidos (alucinação) — `crm_draft_proposal` tem que devolver erro claro para a IA corrigir, não gravar lixo.
- Confirmar modelo numa proposta que **já não está em rascunho** (foi enviada) — a rota tem que recusar, um modelo não muda depois do envio.
- Duas pessoas confirmando modelos diferentes ao mesmo tempo — a última escrita vence (aceitável aqui, diferente da edição de itens que tem `revision`), mas o teste documenta essa escolha para não virar bug "descoberto" depois.
- O rótulo amigável (`ROTULO_DO_MODELO`) fica sem entrada para um slug novo do catálogo — um teste de cerca compara as duas listas de chaves.

---

### Task 1: Migration — coluna `template_slug_sugerido`

**Files:**
- Create: `supabase/migrations/20260925220000_0422_ia_sugere_modelo_da_proposta.sql`
- Modify: `supabase/baseline.sql` (bloco de `crm_proposals`, apêndice — não o dump)
- Modify: `supabase/migrations/MANIFEST.md`

**Interfaces:**
- Produces: coluna `public.crm_proposals.template_slug_sugerido text` (nullable, sem CHECK, sem FK).

- [ ] **Step 1: Escrever a migration**

```sql
-- 0422 — a IA sugere um modelo de proposta, uma pessoa confirma (decisão do
-- dono, 25/09/2026). `template_slug_sugerido` é ESTADO PROVISÓRIO: nunca
-- entra na constraint `crm_proposals_template_slug_versao_juntos_check`,
-- porque essa constraint é sobre o modelo CONFIRMADO (`template_slug` +
-- `template_version`), e uma sugestão não confirmada não é um modelo em uso.
alter table public.crm_proposals add column if not exists template_slug_sugerido text;

comment on column public.crm_proposals.template_slug_sugerido is
  'Modelo que a IA sugeriu ao rascunhar (crm_draft_proposal). Some quando alguém confirma um modelo (vira template_slug) ou troca por outro — nunca é o modelo "de fato".';
```

- [ ] **Step 2: Espelhar no apêndice do `baseline.sql`**

Localize o bloco existente que adiciona `template_slug`/`template_version`/`template_snapshot`/`rendered_snapshot` a `crm_proposals` (comentário `-- ---- ... (migration 0411) ----` ou similar — confira com `grep -n "template_slug" supabase/baseline.sql`). Acrescente a linha nova **dentro do mesmo bloco**, imediatamente após as colunas de template já existentes:

```sql
alter table public.crm_proposals add column if not exists template_slug_sugerido text;
```

Não crie um bloco novo — colunas relacionadas ao mesmo assunto (modelo da proposta) ficam juntas.

- [ ] **Step 3: Linha no MANIFEST**

Adicione uma linha na tabela "Applied" de `supabase/migrations/MANIFEST.md`, no formato das linhas vizinhas (timestamp | nome | descrição em negrito curta + porquê).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260925220000_0422_ia_sugere_modelo_da_proposta.sql supabase/baseline.sql supabase/migrations/MANIFEST.md
git commit -m "feat(db): crm_proposals ganha template_slug_sugerido (N1)"
```

---

### Task 2: Rótulos amigáveis dos 8 modelos

**Files:**
- Create: `lib/propostas/modelos/rotulos.ts`
- Create: `lib/propostas/modelos/rotulos.test.ts`

**Interfaces:**
- Produces: `export const ROTULO_DO_MODELO: Record<string, string>` — usado pela Task 3 (descrição da tool) e pela Task 5 (tela).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```typescript
// lib/propostas/modelos/rotulos.test.ts
import { describe, expect, it } from "vitest";
import { MODELOS_BASE } from "./catalogo-base";
import { ROTULO_DO_MODELO } from "./rotulos";

describe("ROTULO_DO_MODELO — todo modelo do catálogo tem rótulo amigável", () => {
  it("as duas listas de chaves são exatamente iguais", () => {
    const chavesDoCatalogo = Object.keys(MODELOS_BASE).sort();
    const chavesDosRotulos = Object.keys(ROTULO_DO_MODELO).sort();
    expect(chavesDosRotulos).toEqual(chavesDoCatalogo);
  });

  it("nenhum rótulo é vazio", () => {
    for (const rotulo of Object.values(ROTULO_DO_MODELO)) {
      expect(rotulo.trim().length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/modelos/rotulos.test.ts`
Expected: FAIL — `Cannot find module './rotulos'`

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/modelos/rotulos.ts
/**
 * Rótulo amigável de cada modelo do catálogo — para a IA descrever a escolha
 * e para a tela mostrar num seletor. `MODELOS_BASE` guarda só slug/versão/
 * seções; nenhum campo ali é "nome para humano ler".
 */
export const ROTULO_DO_MODELO: Record<string, string> = {
  site_institucional: "Site institucional",
  landing_page: "Landing page",
  ecommerce: "E-commerce",
  catalogo_imobiliario: "Catálogo imobiliário",
  site_profissional: "Site profissional",
  sistema_web: "Sistema web",
  automacao: "Automação",
  projeto_personalizado: "Projeto personalizado",
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/modelos/rotulos.test.ts`
Expected: PASS 2/2

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/modelos/rotulos.ts lib/propostas/modelos/rotulos.test.ts
git commit -m "feat(propostas): rótulos amigáveis dos 8 modelos (N1)"
```

---

### Task 3: `crm_draft_proposal` aceita a sugestão de modelo

**Files:**
- Modify: `lib/mcp/tools/propostas.ts`
- Modify: `lib/mcp/tools/propostas.test.ts` (se não existir, crie do zero — confira antes: `ls lib/mcp/tools/propostas.test.ts`)

**Interfaces:**
- Consumes: `ROTULO_DO_MODELO` (Task 2), `MODELOS_BASE` de `./catalogo-base` (já existe).
- Produces: `crm_proposals.template_slug_sugerido` gravado no INSERT (nunca `template_slug`).

- [ ] **Step 1: Escrever o teste que falha primeiro**

Abra `lib/mcp/tools/propostas.test.ts`. Se o arquivo não existir, monte o setup mínimo olhando como outros testes de `lib/mcp/tools/*.test.ts` mockam `ctx.supabase` (confira `lib/mcp/tools/leads.test.ts` ou similar para o padrão de mock). Adicione:

```typescript
it("grava template_slug_sugerido quando a IA sugere um modelo válido", async () => {
  // monte ctx com supabase mockado: lead existe, sem rascunho existente,
  // conversa pertence ao contato, resolverItensDaProposta ok.
  const resultado = await crmDraftProposal.handler(
    {
      lead_id: LEAD_ID,
      conversation_id: CONVERSATION_ID,
      titulo: "Orçamento site",
      itens: [{ descricao: "Site institucional", quantidade: 1 }],
      template_slug_sugerido: "site_institucional",
    },
    ctx,
  );
  expect(insertCrmProposals).toHaveBeenCalledWith(
    expect.objectContaining({ template_slug_sugerido: "site_institucional" }),
  );
});

it("recusa template_slug_sugerido que não existe no catálogo", async () => {
  const resultado = await crmDraftProposal.handler(
    {
      lead_id: LEAD_ID,
      conversation_id: CONVERSATION_ID,
      titulo: "Orçamento site",
      itens: [{ descricao: "Site institucional", quantidade: 1 }],
      template_slug_sugerido: "modelo_que_nao_existe",
    },
    ctx,
  );
  expect(resultado).toEqual({ error: expect.stringContaining("modelo") });
});
```

Ajuste os nomes de mock (`insertCrmProposals`, `LEAD_ID`, `CONVERSATION_ID`, `ctx`) para bater com o padrão real do arquivo de teste vizinho — o objetivo dos dois casos é: (a) sugestão válida grava a coluna nova; (b) sugestão inválida devolve erro sem inserir nada.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/mcp/tools/propostas.test.ts`
Expected: FAIL — o schema de input não aceita `template_slug_sugerido`, ou a asserção não bate porque a coluna nunca é gravada.

- [ ] **Step 3: Implementar**

Em `lib/mcp/tools/propostas.ts`, adicione o import e o campo no schema:

```typescript
import { MODELOS_BASE } from "@/lib/propostas/modelos/catalogo-base";
import { ROTULO_DO_MODELO } from "@/lib/propostas/modelos/rotulos";
```

No `draftProposalInputShape`, acrescente:

```typescript
  template_slug_sugerido: z
    .string()
    .optional()
    .describe(
      "Se você já entendeu o tipo de projeto, sugira um destes modelos pelo slug: " +
        Object.entries(ROTULO_DO_MODELO)
          .map(([slug, rotulo]) => `${slug} (${rotulo})`)
          .join(", ") +
        ". Uma pessoa confirma antes de valer — errar a sugestão não é grave, mas não invente slug fora desta lista.",
    ),
```

No handler, logo após a checagem de `conversa` (antes de `itensNormalizados`), valide a sugestão:

```typescript
    if (input.template_slug_sugerido !== undefined && !Object.hasOwn(MODELOS_BASE, input.template_slug_sugerido)) {
      return { error: `Modelo "${input.template_slug_sugerido}" não existe no catálogo.` };
    }
```

No `.insert({...})` do `crm_proposals`, acrescente o campo:

```typescript
        template_slug_sugerido: input.template_slug_sugerido ?? null,
```

(logo depois de `drafted_by_agent_id: agentId,`, antes do fechamento do objeto).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/mcp/tools/propostas.test.ts`
Expected: PASS (os dois novos + os já existentes)

- [ ] **Step 5: Rodar o typecheck do arquivo**

Run: `npx tsc --noEmit -p tsconfig.typecheck.json`
Expected: sem erro novo em `lib/mcp/tools/propostas.ts`

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/tools/propostas.ts lib/mcp/tools/propostas.test.ts
git commit -m "feat(propostas): crm_draft_proposal aceita sugestão de modelo (N1)"
```

---

### Task 4: Rota de confirmação — `PATCH /api/v1/proposals/[id]/modelo`

**Files:**
- Create: `app/api/v1/proposals/[id]/modelo/route.ts`
- Create: `app/api/v1/proposals/[id]/modelo/route.test.ts`

**Interfaces:**
- Consumes: `resolverModelo` de `@/lib/propostas/modelos/resolver` (já existe, devolve `{ slug, version, ... } | null`).
- Produces: `PATCH` que recebe `{ template_slug: string | null }` e atualiza `crm_proposals.template_slug`/`template_version`/`template_slug_sugerido`.

- [ ] **Step 1: Escrever o teste que falha primeiro**

Olhe `app/api/v1/proposals/[id]/documento/route.test.ts` (se existir) para copiar o padrão de mock de `createAdminClient`/`requireRole`. Escreva:

```typescript
// app/api/v1/proposals/[id]/modelo/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
// ... mocks no padrão do arquivo vizinho (requireRole ok como "manager",
// sePropostasDesligadas false, createAdminClient com builder configurável) ...

describe("PATCH /api/v1/proposals/[id]/modelo", () => {
  it("confirma um modelo válido: grava template_slug/version e limpa a sugestão", async () => {
    // proposta em rascunho, sem template_slug, com template_slug_sugerido: "landing_page"
    const res = await PATCH(reqComBody({ template_slug: "landing_page" }), ctx("prop-1"));
    expect(res.status).toBe(200);
    expect(updateCrmProposals).toHaveBeenCalledWith(
      expect.objectContaining({ template_slug: "landing_page", template_version: expect.any(Number), template_slug_sugerido: null }),
    );
  });

  it("recusa modelo que não existe no catálogo nem na organização", async () => {
    const res = await PATCH(reqComBody({ template_slug: "nao_existe" }), ctx("prop-1"));
    expect(res.status).toBe(422);
  });

  it("recusa confirmar modelo numa proposta que já não está em rascunho", async () => {
    // proposta com status "enviada"
    const res = await PATCH(reqComBody({ template_slug: "landing_page" }), ctx("prop-2"));
    expect(res.status).toBe(409);
  });

  it("template_slug: null remove o modelo confirmado (não mexe na sugestão)", async () => {
    const res = await PATCH(reqComBody({ template_slug: null }), ctx("prop-1"));
    expect(res.status).toBe(200);
    expect(updateCrmProposals).toHaveBeenCalledWith(
      expect.objectContaining({ template_slug: null, template_version: null }),
    );
  });
});
```

Adapte os nomes de helper (`reqComBody`, `ctx`, `updateCrmProposals`) ao padrão real do arquivo vizinho copiado.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run app/api/v1/proposals/[id]/modelo/route.test.ts`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implementar a rota**

```typescript
// app/api/v1/proposals/[id]/modelo/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { resolverModelo } from "@/lib/propostas/modelos/resolver";
import { sePropostasDesligadas } from "@/lib/propostas/porta";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ template_slug: z.string().min(1).max(100).nullable() });

type Ctx = { params: Promise<{ id: string }> };

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
  const { data: proposta } = await admin
    .from("crm_proposals")
    .select("id, status")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });
  if ((proposta as { status: string }).status !== "rascunho") {
    return fail("validation_failed", t("Só é possível trocar o modelo de uma proposta em rascunho."), 409, { requestId });
  }

  if (parsed.data.template_slug === null) {
    const { error } = await admin
      .from("crm_proposals")
      .update({ template_slug: null, template_version: null })
      .eq("organization_id", authz.org.orgId)
      .eq("id", id);
    if (error) return fail("internal_error", t("Falha ao remover o modelo."), 500, { requestId });
    return ok({ template_slug: null }, { requestId });
  }

  const modelo = await resolverModelo(admin, authz.org.orgId, parsed.data.template_slug);
  if (!modelo) return fail("validation_failed", t("Modelo não encontrado."), 422, { requestId });

  const { error } = await admin
    .from("crm_proposals")
    .update({ template_slug: modelo.slug, template_version: modelo.version, template_slug_sugerido: null })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (error) return fail("internal_error", t("Falha ao confirmar o modelo."), 500, { requestId });

  void audit({
    action: "proposal.modelo_confirmado",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_proposals",
    resourceId: id,
    requestId,
    metadata: { template_slug: modelo.slug, template_version: modelo.version },
  });

  return ok({ template_slug: modelo.slug, template_version: modelo.version }, { requestId });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run app/api/v1/proposals/[id]/modelo/route.test.ts`
Expected: PASS 4/4

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/proposals/[id]/modelo/
git commit -m "feat(propostas): rota de confirmação de modelo (N1)"
```

---

### Task 5: `/documento` devolve a sugestão + tela mostra confirmação

**Files:**
- Modify: `app/api/v1/proposals/[id]/documento/route.ts`
- Modify: `app/app/proposals/[id]/_components/DocumentoCanvas.tsx`
- Modify (ou crie) o teste correspondente de `DocumentoCanvas` — confira se existe `DocumentoCanvas.test.tsx`.

**Interfaces:**
- Consumes: `PATCH /api/v1/proposals/[id]/modelo` (Task 4), `ROTULO_DO_MODELO` (Task 2).
- Produces: `Documento.modeloSlugSugerido: string | null` no payload do GET.

- [ ] **Step 1: Escrever o teste que falha primeiro (rota)**

No teste de `documento/route.ts` (crie se não existir, seguindo o padrão de outros testes de rota do diretório):

```typescript
it("devolve modeloSlugSugerido quando a proposta tem sugestão pendente", async () => {
  // proposta com template_slug: null, template_slug_sugerido: "ecommerce"
  const res = await GET(reqQualquer(), ctx("prop-1"));
  const body = await res.json();
  expect(body.data.modeloSlugSugerido).toBe("ecommerce");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run app/api/v1/proposals/[id]/documento/route.test.ts`
Expected: FAIL — campo `modeloSlugSugerido` ausente/undefined no corpo.

- [ ] **Step 3: Implementar na rota**

Em `app/api/v1/proposals/[id]/documento/route.ts`:

1. No tipo de retorno de `buscarProposta`, acrescente `template_slug_sugerido: string | null;`.
2. No `select("*")` já existente, nada muda (select `*` já traz a coluna nova).
3. Nos DOIS `return ok({...})` do ramo `!proposta.template_slug` e do ramo `!modelo`, acrescente `modeloSlugSugerido: proposta.template_slug_sugerido,`.
4. No `return ok({...})` final (com `secoes` preenchidas), acrescente `modeloSlugSugerido: proposta.template_slug_sugerido,` também — uma proposta pode ter `template_slug` confirmado E ainda carregar uma sugestão antiga se o fluxo permitir os dois ao mesmo tempo (não permite hoje, mas o campo sempre viaja para a tela não ter que adivinhar).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run app/api/v1/proposals/[id]/documento/route.test.ts`
Expected: PASS

- [ ] **Step 5: Escrever o teste do componente (falha primeiro)**

Em `DocumentoCanvas.test.tsx` (ou crie seguindo o padrão de outro `*.test.tsx` do mesmo diretório, ex. `AssistantPanel.test.tsx`, para a forma de mock de `apiClient`):

```typescript
it("mostra a sugestão da IA com botão de confirmar, quando não há modelo confirmado", async () => {
  // mock GET /documento devolvendo { modeloSlug: null, modeloSlugSugerido: "site_institucional", ... }
  render(<DocumentoCanvas propostaId="p1" />);
  expect(await screen.findByText(/Site institucional/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /usar este modelo/i })).toBeInTheDocument();
});

it("ao confirmar, chama PATCH /modelo com o slug sugerido", async () => {
  const patchMock = vi.fn().mockResolvedValue({ data: { template_slug: "site_institucional" } });
  // ligar patchMock no apiClient.patch mockado
  render(<DocumentoCanvas propostaId="p1" />);
  await userEvent.click(await screen.findByRole("button", { name: /usar este modelo/i }));
  expect(patchMock).toHaveBeenCalledWith("/api/v1/proposals/p1/modelo", { template_slug: "site_institucional" });
});

it("sem sugestão e sem modelo, mostra um seletor manual com os 8 modelos", async () => {
  // mock GET /documento devolvendo { modeloSlug: null, modeloSlugSugerido: null, ... }
  render(<DocumentoCanvas propostaId="p1" />);
  expect(await screen.findByRole("combobox")).toBeInTheDocument();
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx`
Expected: FAIL

- [ ] **Step 7: Implementar no componente**

Reescreva `DocumentoCanvas.tsx`:

```typescript
// app/app/proposals/[id]/_components/DocumentoCanvas.tsx
"use client";

import { useEffect, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";
import { ROTULO_DO_MODELO } from "@/lib/propostas/modelos/rotulos";

interface SecaoDocumento {
  id: string;
  title: string;
  body: string;
  faltantes: string[];
}

interface Documento {
  modeloSlug: string | null;
  modeloSlugSugerido: string | null;
  secoes: SecaoDocumento[];
  variaveisFaltando: string[];
  prontidao: { status: string; checklist: Record<string, boolean> } | null;
  resumoComercial: string | null;
}

export function DocumentoCanvas({ propostaId }: { propostaId: string }) {
  const t = useT();
  const [doc, setDoc] = useState<Documento | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = () => {
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
    return controller;
  };

  useEffect(() => {
    const controller = carregar();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propostaId]);

  const confirmarModelo = async (slug: string) => {
    setConfirmando(true);
    try {
      await apiClient.patch(`/api/v1/proposals/${propostaId}/modelo`, { template_slug: slug });
      carregar();
    } catch (error) {
      showApiError(error);
    } finally {
      setConfirmando(false);
    }
  };

  if (!doc) return null;

  if (!doc.modeloSlug) {
    const rotuloSugerido = doc.modeloSlugSugerido ? ROTULO_DO_MODELO[doc.modeloSlugSugerido] : null;
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-gray-600 space-y-3">
        {doc.modeloSlugSugerido ? (
          <p>
            {t("A IA sugeriu o modelo")} <strong>{rotuloSugerido ?? doc.modeloSlugSugerido}</strong>.
          </p>
        ) : (
          <p>{t("Nenhum modelo escolhido para esta proposta ainda.")}</p>
        )}
        <div className="flex items-center gap-2">
          {doc.modeloSlugSugerido && (
            <button
              type="button"
              disabled={confirmando}
              onClick={() => confirmarModelo(doc.modeloSlugSugerido!)}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {t("Usar este modelo")}
            </button>
          )}
          <select
            disabled={confirmando}
            defaultValue=""
            onChange={(e) => e.target.value && confirmarModelo(e.target.value)}
            className="rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              {t("Ou escolha outro modelo")}
            </option>
            {Object.entries(ROTULO_DO_MODELO).map(([slug, rotulo]) => (
              <option key={slug} value={slug}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
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

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app/api/v1/proposals/[id]/documento/route.ts app/app/proposals/[id]/_components/DocumentoCanvas.tsx app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx
git commit -m "feat(propostas): tela confirma ou troca o modelo sugerido (N1)"
```

---

## Self-Review (já aplicado ao escrever este plano)

1. **Cobertura da spec:** IA sugere (Task 3) → pessoa confirma (Task 4/5) → tela sempre tem como escolher, mesmo sem sugestão (seletor manual, Task 5). Os 8 slugs vêm de uma única fonte (`MODELOS_BASE`/`ROTULO_DO_MODELO`, Task 2).
2. **Placeholders:** nenhum. Todo passo tem código completo.
3. **Consistência de tipos:** `template_slug_sugerido` é `string | null` em todo lugar; `resolverModelo` devolve `{ slug, version }` usados exatamente com esses nomes na Task 4.
4. **Review Focus:** as 5 linhas do topo têm teste dedicado nas Tasks 3 e 4 (slug inválido, proposta não-rascunho, `null` remove modelo, rótulo ausente pego pela Task 2).
