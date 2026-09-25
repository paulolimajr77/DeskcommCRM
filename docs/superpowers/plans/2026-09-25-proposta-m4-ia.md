# Proposta M4 — IA (briefing pela conversa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a Onda 4 ("IA") da onda de modelos. Medido antes de escrever: chat → prévia de mudanças → aplicar → auditoria **já existem** (`lib/propostas/assistente.ts` + `app/api/v1/proposals/[id]/assistant/*` + `AssistantPanel.tsx`, da spec-mãe) — a tabela §13 da spec de 21/09 já marcava isso como "Sim". O que falta, medido: esse assistente edita título/condições/validade/itens, mas **não tem como preencher o `briefing_json`** que a M1 criou e que a M2/M3 leem para montar o documento. Sem isso, o fluxo §4 da spec ("[1] briefing na conversa") não fecha — o operador teria que editar o briefing por fora do chat. Esta onda é EXATAMENTE esse fechamento: um 4º tipo de mudança, `editar_briefing`, na mesma máquina que já existe.

**Architecture:** Estende o vocabulário de `Mudanca` (união discriminada por `tipo`) com `editar_briefing`, que grava por caminho pontuado (`project.name`, `client.company_or_name`) dentro do `briefing_json` — os MESMOS nomes que os 8 modelos usam em `{{project.name}}` (M2), então o que a IA preenche aparece direto no documento, sem tradução no meio. `aplicarMudancas` (pura) ganha um setter imutável de caminho pontuado. As duas rotas que já existem (`assistant` e `assistant/apply`) passam a ler e gravar `briefing_json` também. O painel (`AssistantPanel.tsx`) ganha mais um `case` de exibição no diff.

**Tech Stack:** TypeScript, Zod, Vitest, React (client component).

**Spec:** `docs/superpowers/specs/2026-09-21-proposta-comercial-templates-design.md` (§4 — fluxo; §11 — Onda 4; §13 — tabela do item 8, linha "caixa de conversa com o LLM"). M0-M3 já mescladas em `feat/proposta-comercial`.

## Global Constraints

- **Não se reconstrói o chat, a prévia, o botão aplicar nem a auditoria** — tudo isso já existe e já funciona (medido nos arquivos citados acima). Esta onda só acrescenta um tipo de mudança ao que já existe.
- **O nome do campo (`campo: "project.name"`) segue o MESMO vocabulário pontuado que `{{project.name}}` usa nos 8 modelos reais** (medido em `PLJR-Proposal-System-v1.1.0/templates/*/template.json`) — é isso que faz a IA preencher o briefing e o documento (M2/M3) já aparecer resolvido, sem ninguém traduzir nome de campo no meio.
- **`de`/`para` de `editar_briefing` são sempre `string`** (`de` pode ser `null` quando o campo nunca foi preenchido) — mesmo formato de `editar_proposta`, que já existe. Não se guarda número/boolean no briefing por este caminho (o briefing é texto de conversa; preço e datas continuam nos campos próprios da proposta, já cobertos pelos outros tipos de mudança).
- **`aplicarMudancas` continua pura** — o setter de caminho pontuado não faz I/O, só monta um objeto novo.
- Nenhuma migration nesta onda — `briefing_json` já existe (M1).

## Review Focus

- **`editar_briefing` em um caminho aninhado não pode apagar os campos IRMÃOS já preenchidos.** Ex.: briefing já tem `project.objective`; a IA muda só `project.name` — `project.objective` continua lá. Task 1 testa.
- **Duas mudanças `editar_briefing` na mesma chamada, uma depois da outra, não se pisam** (mesma classe de teste que já existe para `editar_item`). Task 1 testa.
- **`briefing_json` nulo no banco (proposta antiga, criada antes da M1) não pode quebrar o preview nem o apply** — vira `{}` antes de entrar em `aplicarMudancas`. Task 2 e Task 3 testam.
- **A prévia (`assistant` GET) NUNCA grava nada** — só a rota `apply` persiste. Isso já vale para os outros 3 tipos e continua valendo para `editar_briefing` (nenhuma mudança de código na rota de preview além de LER o briefing atual para mostrar ao modelo).
- **O painel mostra `editar_briefing` sem quebrar quando `de` é `null`** (campo nunca preenchido) — mesmo cuidado que `editar_proposta` já tem (`t("(sem valor)")`). Task 4 testa.

---

### Task 1: `lib/propostas/assistente.ts` — o tipo `editar_briefing`

**Files:**
- Modify: `lib/propostas/assistente.ts`
- Modify: `lib/propostas/assistente.test.ts`

**Interfaces:**
- Produces: `Mudanca` inclui a variante `{ tipo: "editar_briefing"; campo: string; de: string | null; para: string }`; `EstadoDaProposta.briefing: Record<string, unknown>` — Task 2 e Task 3 passam a montar esse campo ao chamar `gerarMudancas`/`aplicarMudancas`.

- [ ] **Step 1: Atualizar o helper `estado()` e escrever os testes novos**

Em `lib/propostas/assistente.test.ts`, atualizar a função `estado()` (topo do arquivo) para incluir o campo novo:

```typescript
function estado(): EstadoDaProposta {
  return {
    titulo: "Site institucional", condicoes: null, valid_until: "2026-10-01",
    briefing: { project: { objective: "vender mais apartamentos" } },
    itens: [
      { id: "item-1", product_id: null, descricao: "Site institucional", quantidade: 1, preco_unitario_cents: 800000, desconto_cents: 0, position: 1000 },
      { id: "item-2", product_id: null, descricao: "Hospedagem anual", quantidade: 1, preco_unitario_cents: 120000, desconto_cents: 0, position: 2000 },
    ],
  };
}
```

Adicionar, dentro do `describe("aplicarMudancas", ...)` já existente:

```typescript
it("editar_briefing grava no caminho pontuado, dentro de EstadoDaProposta.briefing", () => {
  const r = aplicarMudancas(estado(), [
    { tipo: "editar_briefing", campo: "project.name", de: null, para: "Site Catálogo Imobiliário" },
  ]);
  expect(r.briefing).toMatchObject({ project: { name: "Site Catálogo Imobiliário" } });
});

it("editar_briefing NÃO apaga campo irmão já preenchido no mesmo objeto pai (Review Focus)", () => {
  const r = aplicarMudancas(estado(), [
    { tipo: "editar_briefing", campo: "project.name", de: null, para: "Site Catálogo Imobiliário" },
  ]);
  expect(r.briefing).toMatchObject({
    project: { name: "Site Catálogo Imobiliário", objective: "vender mais apartamentos" },
  });
});

it("duas mudancas editar_briefing em sequência não se pisam (Review Focus)", () => {
  const r = aplicarMudancas(estado(), [
    { tipo: "editar_briefing", campo: "project.name", de: null, para: "Site Catálogo" },
    { tipo: "editar_briefing", campo: "client.company_or_name", de: null, para: "Imobiliária Acme" },
  ]);
  expect(r.briefing).toMatchObject({
    project: { name: "Site Catálogo", objective: "vender mais apartamentos" },
    client: { company_or_name: "Imobiliária Acme" },
  });
});

it("editar_briefing num caminho de 1 nível só (sem ponto) também funciona", () => {
  const r = aplicarMudancas(estado(), [{ tipo: "editar_briefing", campo: "segmento", de: null, para: "imobiliário" }]);
  expect(r.briefing.segmento).toBe("imobiliário");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/assistente.test.ts`
Expected: FAIL — `Type '"editar_briefing"' is not assignable...` (erro de tipo/schema) ou `briefing` ausente em `EstadoDaProposta`

- [ ] **Step 3: Implementar**

Em `lib/propostas/assistente.ts`:

1. Adicionar a variante ao `mudancaSchema` (dentro do array do `z.discriminatedUnion`, junto às outras 3):

```typescript
  z.object({
    tipo: z.literal("editar_briefing"),
    campo: z.string().min(1),
    de: z.string().nullable(),
    para: z.string(),
  }),
```

2. Adicionar `briefing` à interface:

```typescript
export interface EstadoDaProposta {
  titulo: string;
  condicoes: string | null;
  valid_until: string | null;
  itens: Array<ProposalItemInput & { id: string }>;
  briefing: Record<string, unknown>;
}
```

3. Adicionar o setter de caminho pontuado (antes de `aplicarMudancas`):

```typescript
/** Grava `valor` em `caminho` (dot path) dentro de `obj`, sem apagar chaves
 * irmãs — clona só os níveis no caminho, o resto do objeto é preservado. */
function definirCaminho(obj: Record<string, unknown>, caminho: string, valor: string): Record<string, unknown> {
  const [primeira, ...resto] = caminho.split(".");
  if (resto.length === 0) {
    return { ...obj, [primeira!]: valor };
  }
  const atual = obj[primeira!];
  const sub = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Record<string, unknown>) : {};
  return { ...obj, [primeira!]: definirCaminho(sub, resto.join("."), valor) };
}
```

4. Adicionar o `case` em `aplicarMudancas` (dentro do `for (const m of mudancas)`, junto aos outros `else if`):

```typescript
    } else if (m.tipo === "editar_briefing") {
      novo = { ...novo, briefing: definirCaminho(novo.briefing, m.campo, m.para) };
    }
```

5. Estender `promptDoEstado` para mostrar o briefing atual ao modelo (adicionar uma linha, sem remover as existentes):

```typescript
function promptDoEstado(estado: EstadoDaProposta): string {
  const itens = estado.itens
    .map((it) => `- [${it.id}] ${it.descricao} — qtd ${it.quantidade} × ${it.preco_unitario_cents === null ? "a definir" : `R$ ${(it.preco_unitario_cents / 100).toFixed(2)}`}, desconto R$ ${(it.desconto_cents / 100).toFixed(2)}`)
    .join("\n");
  return [
    `Proposta atual:`,
    `Título: ${estado.titulo}`,
    `Validade: ${estado.valid_until ?? "não definida"}`,
    `Condições: ${estado.condicoes ?? "nenhuma"}`,
    `Briefing atual (jsonb): ${JSON.stringify(estado.briefing)}`,
    `Itens:`,
    itens,
  ].join("\n");
}
```

6. Estender o `system` de `gerarMudancas` para ensinar o vocabulário pontuado (trocar a string do `system`, mantendo as duas frases existentes e acrescentando a terceira):

```typescript
    system:
      "Você ajusta uma proposta comercial a partir de uma instrução curta, usando a ferramenta " +
      "propor_mudancas. Devolva só as mudanças pedidas — nunca mexa em item ou campo que a " +
      "instrução não mencionou. Para informação de briefing (segmento, serviço, estágio, " +
      "identidade, público, objetivo do projeto), use tipo 'editar_briefing' com 'campo' em " +
      "caminho pontuado (ex.: project.name, project.objective, client.company_or_name, " +
      "scope.pages_list) — são os MESMOS nomes que o documento final usa, então o valor " +
      "aparece direto na proposta.",
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/assistente.test.ts`
Expected: PASS (10/10 — os 6 de antes + os 4 novos)

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/assistente.ts lib/propostas/assistente.test.ts
git commit -m "feat(propostas): assistente ganha editar_briefing — a IA preenche o insumo do documento (M4)"
```

---

### Task 2: `assistant/route.ts` lê o briefing atual para a prévia

**Files:**
- Modify: `app/api/v1/proposals/[id]/assistant/route.ts`
- Modify: `app/api/v1/proposals/[id]/assistant/route.test.ts`

**Interfaces:**
- Consumes: `EstadoDaProposta.briefing` (Task 1).

- [ ] **Step 1: Escrever o teste**

No `montarMundoDeAssistente` de `route.test.ts`, adicionar `briefing_json` ao objeto `proposta` mockado (perto de `valid_until`):

```typescript
  const proposta = {
    id: PROPOSAL_ID,
    titulo: "Proposta Teste",
    condicoes: "30 dias",
    valid_until: "2026-12-31",
    briefing_json: opts.briefingJson ?? null,
    status: opts.status ?? "rascunho",
    revision: 1,
  };
```

Adicionar `briefingJson?: Record<string, unknown> | null;` a `MundoOpts`.

Adicionar os testes (junto aos `describe`/`it` existentes):

```typescript
it("passa o briefing_json atual para gerarMudancas, como Record vazio quando é null (Review Focus)", async () => {
  montarMundoDeAssistente({});
  const res = await POST(pedido({ instrucao: "muda o prazo" }), { params: Promise.resolve({ id: PROPOSAL_ID }) });
  expect(res.status).toBe(200);
  const chamada = vi.mocked(gerarMudancas).mock.calls[0]?.[0];
  expect(chamada?.estado.briefing).toEqual({});
});

it("passa o briefing_json atual quando ele já tem conteúdo", async () => {
  montarMundoDeAssistente({ briefingJson: { project: { name: "Site Catálogo" } } });
  const res = await POST(pedido({ instrucao: "muda o prazo" }), { params: Promise.resolve({ id: PROPOSAL_ID }) });
  expect(res.status).toBe(200);
  const chamada = vi.mocked(gerarMudancas).mock.calls[0]?.[0];
  expect(chamada?.estado.briefing).toEqual({ project: { name: "Site Catálogo" } });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/api/v1/proposals/[id]/assistant/route.test.ts"`
Expected: FAIL — `chamada?.estado.briefing` é `undefined`

- [ ] **Step 3: Implementar**

Em `app/api/v1/proposals/[id]/assistant/route.ts`:

1. Acrescentar `briefing_json` ao `.select(...)` da linha ~39:

```typescript
    .select("titulo, condicoes, valid_until, briefing_json, status, revision")
```

2. Montar `briefing` ao construir `estado`:

```typescript
  const briefing =
    proposta.briefing_json && typeof proposta.briefing_json === "object" && !Array.isArray(proposta.briefing_json)
      ? (proposta.briefing_json as Record<string, unknown>)
      : {};

  const estado: EstadoDaProposta = {
    titulo: proposta.titulo,
    condicoes: proposta.condicoes,
    valid_until: proposta.valid_until,
    briefing,
    itens: itens ?? [],
  };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "app/api/v1/proposals/[id]/assistant/route.test.ts"`
Expected: PASS — todos os casos, os 2 novos e os pré-existentes

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/proposals/[id]/assistant/route.ts" "app/api/v1/proposals/[id]/assistant/route.test.ts"
git commit -m "feat(propostas): rota de prévia do assistente lê o briefing atual (M4)"
```

---

### Task 3: `assistant/apply/route.ts` grava o briefing atualizado

**Files:**
- Modify: `app/api/v1/proposals/[id]/assistant/apply/route.ts`
- Modify: `app/api/v1/proposals/[id]/assistant/apply/route.test.ts`

**Interfaces:**
- Consumes: `EstadoDaProposta.briefing`, `aplicarMudancas` (Task 1).

- [ ] **Step 1: Escrever o teste**

Ler o `montarMundoDeAplicar` (ou nome equivalente) em `apply/route.test.ts` e adicionar `briefing_json: opts.briefingJson ?? null` ao objeto `proposta` mockado, mais o campo `briefingJson?: Record<string, unknown> | null;` nas opções — mesmo padrão da Task 2, adaptado ao helper deste arquivo (o nome exato do helper e da função que captura o `.update(...)` está no arquivo; usar o mesmo padrão que os testes de sucesso já existentes usam para conferir o payload do `.update`).

Adicionar os testes:

```typescript
it("editar_briefing aplicado grava briefing_json atualizado no update (M4)", async () => {
  const { capturedUpdate } = montarMundoDeAplicar({ briefingJson: { project: { objective: "vender mais" } } });
  const req = pedido({
    revision: 1,
    mudancas: [{ tipo: "editar_briefing", campo: "project.name", de: null, para: "Site Catálogo" }],
  });
  const res = await POST(req, { params: Promise.resolve({ id: PROPOSAL_ID }) });
  expect(res.status).toBe(200);
  expect(capturedUpdate()).toMatchObject({
    briefing_json: { project: { name: "Site Catálogo", objective: "vender mais" } },
  });
});

it("sem mudança de briefing, briefing_json do update é o MESMO que já estava (não vira null à toa)", async () => {
  const { capturedUpdate } = montarMundoDeAplicar({ briefingJson: { project: { name: "Já preenchido" } } });
  const req = pedido({
    revision: 1,
    mudancas: [{ tipo: "editar_proposta", campo: "titulo", de: "Proposta Teste", para: "Novo título" }],
  });
  const res = await POST(req, { params: Promise.resolve({ id: PROPOSAL_ID }) });
  expect(res.status).toBe(200);
  expect(capturedUpdate()).toMatchObject({ briefing_json: { project: { name: "Já preenchido" } } });
});
```

(Se o arquivo já tiver um helper `pedido`/nome de request diferente do usado na Task 2, seguir o que já existe NESTE arquivo — não copiar o nome de outro arquivo por engano.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/api/v1/proposals/[id]/assistant/apply/route.test.ts"`
Expected: FAIL — `capturedUpdate()` não tem `briefing_json`, ou `undefined`

- [ ] **Step 3: Implementar**

Em `app/api/v1/proposals/[id]/assistant/apply/route.ts`:

1. Acrescentar `briefing_json` ao `.select(...)` (linha ~46):

```typescript
    .select("lead_id, contact_id, titulo, condicoes, valid_until, briefing_json, status, revision, moeda")
```

2. Montar `briefing` e incluir em `estadoAntes`:

```typescript
  const briefing =
    proposta.briefing_json && typeof proposta.briefing_json === "object" && !Array.isArray(proposta.briefing_json)
      ? (proposta.briefing_json as Record<string, unknown>)
      : {};

  const estadoAntes: EstadoDaProposta = {
    titulo: proposta.titulo,
    condicoes: proposta.condicoes,
    valid_until: proposta.valid_until,
    briefing,
    itens: itens ?? [],
  };
```

3. Incluir `briefing_json: estadoDepois.briefing` no objeto do `.update(...)` (junto aos outros campos que já são atualizados, por volta da linha 87-94):

```typescript
    .update({
      titulo: estadoDepois.titulo,
      condicoes: estadoDepois.condicoes,
      valid_until: estadoDepois.valid_until,
      briefing_json: estadoDepois.briefing,
      total_cents: resolvido.totalCents,
      pricing_status: resolvido.pricingStatus,
      revision: parsed.data.revision + 1,
    })
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "app/api/v1/proposals/[id]/assistant/apply/route.test.ts"`
Expected: PASS — todos os casos, os 2 novos e os pré-existentes

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/proposals/[id]/assistant/apply/route.ts" "app/api/v1/proposals/[id]/assistant/apply/route.test.ts"
git commit -m "feat(propostas): assistente grava o briefing atualizado ao aplicar (M4)"
```

---

### Task 4: `AssistantPanel.tsx` mostra `editar_briefing` na prévia

**Files:**
- Modify: `app/app/proposals/[id]/_components/AssistantPanel.tsx`
- Modify: `app/app/proposals/[id]/_components/AssistantPanel.test.tsx`

**Interfaces:**
- Consumes: `Mudanca` com `tipo: "editar_briefing"` (Task 1).

- [ ] **Step 1: Escrever o teste**

Ler `AssistantPanel.test.tsx` para achar como os testes existentes de `editar_proposta`/`editar_item` montam o mock de `preview.mudancas` (via `fetch`/`apiClient` mockado) e replicar o MESMO padrão para o caso novo:

```typescript
it("mostra editar_briefing na prévia, com 'de' null virando '(sem valor)'", async () => {
  // usar o mesmo helper/mock de fetch que os testes de editar_proposta já usam neste arquivo,
  // trocando só o corpo da resposta de preview para:
  // mudancas: [{ tipo: "editar_briefing", campo: "project.name", de: null, para: "Site Catálogo" }]
  // e então:
  // expect(screen.getByText(/project.name/)).toBeInTheDocument();
  // expect(screen.getByText(/Site Catálogo/)).toBeInTheDocument();
});
```

(O corpo exato do teste depende do helper de mock já existente no arquivo — replicar a estrutura do teste de `editar_proposta` que já está lá, trocando só `tipo`/`campo`/`de`/`para`, sem inventar um helper novo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/app/proposals/[id]/_components/AssistantPanel.test.tsx"`
Expected: FAIL — o texto `project.name`/`Site Catálogo` não aparece na tela (nenhum `case` trata `editar_briefing`, o `<li>` fica vazio)

- [ ] **Step 3: Implementar**

Em `AssistantPanel.tsx`, dentro do `<ul>` que lista `preview.mudancas.map(...)`, adicionar um 4º bloco condicional, logo depois do de `editar_proposta`:

```typescript
                {m.tipo === "editar_briefing" && (
                  <span>
                    {m.campo}: {String(m.de ?? t("(sem valor)"))} → {String(m.para)}
                  </span>
                )}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "app/app/proposals/[id]/_components/AssistantPanel.test.tsx"`
Expected: PASS — todos os casos, o novo e os pré-existentes

- [ ] **Step 5: Commit**

```bash
git add "app/app/proposals/[id]/_components/AssistantPanel.tsx" "app/app/proposals/[id]/_components/AssistantPanel.test.tsx"
git commit -m "feat(propostas): painel do assistente mostra editar_briefing na prévia (M4)"
```

---

## Verificação final

- [ ] `npx vitest run lib/propostas/ "app/api/v1/proposals/" "app/app/proposals/"` — tudo verde.
- [ ] Push para `fork` e conferir os 4 checks (`ci`, `e2e`, `perf`, `Publicar imagem Docker`).
