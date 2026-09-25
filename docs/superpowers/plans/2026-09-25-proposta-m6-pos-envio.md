# Proposta M6 — Pós-envio (v2 herda as seções editadas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a Onda 6 ("pós-envio") da onda de modelos. Medido antes de escrever: aceita/recusada (`decide/route.ts`), vencida (`app/api/v1/cron/proposal-expiry/route.ts`) e a criação da v2 (`revise/route.ts`) **já existem** — é o próprio fluxo §4 da spec ("[8] aceita/recusada/vencida → volta ao funil ← existe"), das ondas C2/D4. O único gap medido, criado pelas ondas M0-M5 e nunca fechado: `revise/route.ts` já copia `template_slug`/`template_version`/`template_snapshot`/`briefing_json` da v1 para a v2 (fix da M1), mas **não copia `secoes_editadas`** (criado pela M3, depois daquele fix). Resultado: um gestor que editou o texto de uma seção à mão na v1, ao revisar, vê a v2 nascer com o texto do MODELO de novo — o trabalho de edição manual se perde silenciosamente.

**Architecture:** Uma linha a mais no mesmo `.insert(...)` que já copia os outros campos do modelo/briefing, em `app/api/v1/proposals/[id]/revise/route.ts`.

**Tech Stack:** TypeScript, Next.js Route Handlers, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-proposta-comercial-templates-design.md` (§11 — Onda 6). M0-M5 já mescladas em `feat/proposta-comercial`.

## Global Constraints

- **`template_snapshot`/`rendered_snapshot` CONTINUAM sem ser copiados para a v2** — são o registro do que foi EFETIVAMENTE enviado (spec §5.5); a v2 ainda não foi enviada, e a M5 já os recalcula do zero no envio dela. Copiar isso seria dado morto, não um gap.
- **Achado à parte, medido, NÃO corrigido neste plano (fora de escopo, para não mexer em mais uma rota sem necessidade):** `PATCH .../documento` (M3) não confere `status = 'rascunho'` antes de aceitar uma edição de seção — hoje dá pra editar seção de uma proposta já `enviada`. Isso não corrompe o que já foi mandado (o PDF e o `rendered_snapshot` da v1 já estão congelados, imutáveis), mas deixa o CANVAS de uma proposta enviada mostrando um texto que diverge do que o cliente recebeu. É um achado menor — perguntar ao Paulo se quer um plano à parte pra isso.

## Review Focus

- **v1 sem nenhuma seção editada (`secoes_editadas` null) não pode virar erro na v2** — a v2 nasce com `secoes_editadas: null` também, sem lançar. Task 1 testa.
- **v1 com seções editadas: a v2 nasce com o MESMO mapa**, não uma cópia parcial nem vazia. Task 1 testa.

---

### Task 1: `revise/route.ts` — a v2 herda `secoes_editadas` da v1

**Files:**
- Modify: `app/api/v1/proposals/[id]/revise/route.ts`
- Modify: `app/api/v1/proposals/[id]/revise/route.test.ts`

- [ ] **Step 1: Escrever os testes**

No `montarMundoDeRevisao` de `route.test.ts`, adicionar `secoes_editadas: opts.secoesEditadas ?? null` ao objeto `proposta` mockado (perto de `briefing_json`, se já existir dessa Task da M1 — senão, perto de `template_slug`), e `secoesEditadas?: Record<string, string> | null;` a `MundoOpts`.

Adicionar os testes:

```typescript
it("a v2 herda secoes_editadas da v1 (M6 — sem isto, edição manual de seção se perde ao revisar)", async () => {
  const { capturedInsert } = montarMundoDeRevisao({
    secoesEditadas: { resumo: "Texto escrito à mão pelo gestor." },
  });
  const res = await POST(new Request("http://x", { method: "POST" }) as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
  expect(res.status).toBe(201);
  expect(capturedInsert()).toMatchObject({
    secoes_editadas: { resumo: "Texto escrito à mão pelo gestor." },
  });
});

it("v1 sem nenhuma seção editada: a v2 nasce com secoes_editadas null, sem lançar (Review Focus)", async () => {
  montarMundoDeRevisao({ secoesEditadas: null });
  const res = await POST(new Request("http://x", { method: "POST" }) as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
  expect(res.status).toBe(201);
});
```

(Usar o mesmo `capturedInsert`/helper de mock que os testes de `template_slug`/`briefing_json` da M1 já usam neste arquivo — não inventar um novo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/api/v1/proposals/[id]/revise/route.test.ts"`
Expected: FAIL — `capturedInsert()` não tem `secoes_editadas`

- [ ] **Step 3: Implementar**

Em `app/api/v1/proposals/[id]/revise/route.ts`, no `.insert(...)` da v2, acrescentar a linha logo depois de `briefing_json: proposta.briefing_json,`:

```typescript
      secoes_editadas: proposta.secoes_editadas,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "app/api/v1/proposals/[id]/revise/route.test.ts"`
Expected: PASS — os 2 casos novos e todos os pré-existentes

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/proposals/[id]/revise/route.ts" "app/api/v1/proposals/[id]/revise/route.test.ts"
git commit -m "fix(propostas): revisão herda secoes_editadas da v1 (M6)"
```

---

## Verificação final

- [ ] `npx vitest run lib/propostas/ "app/api/v1/proposals/"` — tudo verde.
- [ ] Push para `fork` e conferir os 4 checks (`ci`, `e2e`, `perf`, `Publicar imagem Docker`).
- [ ] **Achado à parte, não corrigido aqui:** `PATCH .../documento` aceita edição em proposta não-rascunho (ver Global Constraints) — perguntar ao Paulo se quer um plano pra isso.
