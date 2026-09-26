# Documento da proposta: preço, briefing e bloqueio de envio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar 4 buracos medidos no fluxo de proposta comercial: o documento nunca mostra o
investimento/prazo mesmo com preço certo no banco; a IA não consegue vincular um item ao catálogo
sem um UUID que ela nunca recebe; a IA não tem como registrar o briefing que ouviu na conversa; e
o envio deixa passar uma proposta com campo do documento sem preencher, mesmo com a tela avisando
que não pode.

**Architecture:** `montarDadosDoDocumento` deixa de só espalhar `briefing_json` — passa a receber
a proposta inteira e o contato, e monta `investment`/`schedule`/`commercial_terms`/`client` a partir
de colunas já existentes (nunca inventadas). `crm_draft_proposal` ganha dois campos de entrada
novos e independentes: `produto_codigo` por item (resolve `product_id` pelo código do catálogo,
mesmo campo que o agente já usa para fotos) e `briefing` (o jsonb que veio da conversa). A rota de
envio passa a rodar o MESMO cálculo de `variaveisFaltando` que a tela já mostra, e recusa enviar
se sobrar pendência — hoje ela só verifica preço.

**Tech Stack:** Next.js Route Handlers, Supabase (Postgres), Zod, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-21-proposta-comercial-templates-design.md`](../../superpowers/specs/2026-09-21-proposta-comercial-templates-design.md)
— §7 item 1 ("Substitui `{{caminho}}` pelos dados: `briefing_json` + proposta + cliente"), §7 item 2
("envio bloqueado com a lista do que falta"), §4 ("1 briefing na conversa, capturado pela IA").

## Global Constraints

- Preço, prazo e validade **nunca** vêm do `briefing_json` — são calculados a partir de colunas já
  gravadas (`total_cents`, `moeda`, `prazo_dias_uteis`, `valid_until`, `created_at`). A IA não
  inventa número que o banco já sabe.
- `formatCents(cents, moeda)` de `@/lib/money.ts` é o ÚNICO formatador de dinheiro — não escrever
  `Intl.NumberFormat` novo em lugar nenhum deste plano (é o defeito que essa função já substituiu
  seis vezes no repo).
- Toda mensagem de erro/aviso nova sai de `t(...)` (`@/lib/i18n/dicionario`) e precisa de entrada
  em espanhol no MESMO commit — ver Review Focus.
- `product_id` de item de proposta continua resolvendo preço SOMENTE a partir do catálogo
  (`resolverItensDaProposta`/`buscarPrecoDoCatalogo`) — `produto_codigo` é só uma forma alternativa
  de a IA informar QUAL produto, nunca um caminho que pula essa resolução.
- Toda mutação de rota (`PATCH`/`POST`) já auditada continua auditada; nenhuma task remove uma
  chamada de `audit(...)` existente.

## Review Focus

- **Proposta sem `contact_id`** (proposta manual antiga, órfã — o próprio `send/route.ts` já trata
  esse caso com `maybeSingle`) — `montarDadosDoDocumento` não pode lançar quando o contato não
  existe; `client.name` cai para o que estiver em `briefing_json`, e se não houver nada, para
  `null` (o renderer já sabe transformar `null` em "[a definir]").
- **`produto_codigo` que não existe na organização** — recusa o rascunho inteiro com mensagem que
  cita o código digitado (mesmo padrão de `product_id` inválido em `resolverItensDaProposta`),
  nunca cria proposta com item "meio resolvido".
- **`produto_codigo` E `product_id` mandados juntos no mesmo item** — `product_id` explícito vence
  (é o campo mais específico); `produto_codigo` só resolve quando `product_id` está ausente.
- **Envio de proposta SEM modelo escolhido (`template_slug` null)** — o bloqueio novo não pode
  soltar erro nenhum nesse caso (a tela também não mostra o aviso quando não há modelo — `doc.secoes`
  vem vazio e `variaveisFaltando` vem `[]`); confirmar que o teste cobre esse caminho.
- **`secoes_editadas` cobrindo TODAS as pendências** — se a pessoa já editou manualmente as seções
  que tinham `[a definir]`, o envio não pode recusar por uma pendência que já foi coberta (mesma
  regra que `documento/route.ts` já aplica: override zera `faltantes` daquela seção).

---

### Task 1: `montarDadosDoDocumento` calcula investimento, prazo, validade e cliente

**Files:**
- Modify: `lib/propostas/documento/montar-dados.ts`
- Modify: `lib/propostas/documento/montar-dados.test.ts`
- Modify: `app/api/v1/proposals/[id]/documento/route.ts:24-46,62,80` (busca o contato; tipo de
  `buscarProposta` ganha `total_cents`, `moeda`, `created_at`)
- Modify: `app/api/v1/proposals/[id]/send/route.ts:219-233` (chamada de `montarDadosDoDocumento`
  passa a levar o `contato` que a rota já busca na linha 178)

**Interfaces:**
- Consumes: `formatCents(cents: number, moeda: string): string` de `@/lib/money.ts` (já existe).
- Produces: `montarDadosDoDocumento(proposta: DadosDaPropostaParaDocumento, contato: ContatoParaDocumento | null): Record<string, unknown>` —
  assinatura nova, os dois tipos exportados do próprio arquivo `montar-dados.ts` para os dois call
  sites importarem.

- [ ] **Step 1: Escrever os testes que faltam (falhando)**

```typescript
// lib/propostas/documento/montar-dados.test.ts — ACRESCENTAR ao arquivo existente
import { describe, expect, it } from "vitest";
import { montarDadosDoDocumento } from "./montar-dados";

const PROPOSTA_BASE = {
  briefing_json: null,
  total_cents: 250000,
  moeda: "BRL",
  prazo_dias_uteis: 20,
  valid_until: "2026-10-16T00:00:00.000Z",
  created_at: "2026-09-26T00:00:00.000Z",
};

describe("montarDadosDoDocumento — preço, prazo e validade (nunca vêm do briefing)", () => {
  it("investment.total_formatted vem de total_cents + moeda, formatado por formatCents", () => {
    const dados = montarDadosDoDocumento(PROPOSTA_BASE, null);
    expect(dados.investment).toMatchObject({ total_formatted: "R$ 2.500,00" });
  });

  it("schedule.estimated_days vem de prazo_dias_uteis, mesmo se o briefing tentar mandar outro valor", () => {
    const dados = montarDadosDoDocumento(
      { ...PROPOSTA_BASE, briefing_json: { schedule: { estimated_days: 999 } } },
      null,
    );
    expect(dados.schedule).toMatchObject({ estimated_days: 20 });
  });

  it("commercial_terms.validity_days é a diferença em dias entre valid_until e created_at", () => {
    const dados = montarDadosDoDocumento(PROPOSTA_BASE, null);
    expect(dados.commercial_terms).toMatchObject({ validity_days: 20 });
  });

  it("commercial_terms.validity_days é null quando a proposta não tem valid_until", () => {
    const dados = montarDadosDoDocumento({ ...PROPOSTA_BASE, valid_until: null }, null);
    expect(dados.commercial_terms).toMatchObject({ validity_days: null });
  });

  it("client.name vem do contato (display_name antes de name); client.company vem do briefing", () => {
    const dados = montarDadosDoDocumento(
      { ...PROPOSTA_BASE, briefing_json: { client: { company: "Imobiliária Rio" } } },
      { name: "João da Silva", display_name: "João" },
    );
    expect(dados.client).toMatchObject({
      name: "João",
      company: "Imobiliária Rio",
      company_or_name: "Imobiliária Rio",
    });
  });

  it("client.company_or_name cai para o nome do contato quando não há company no briefing", () => {
    const dados = montarDadosDoDocumento(PROPOSTA_BASE, { name: "João da Silva", display_name: null });
    expect(dados.client).toMatchObject({ name: "João da Silva", company_or_name: "João da Silva" });
  });

  it("contato null não lança — client.name cai para o que o briefing tiver, ou null", () => {
    expect(() => montarDadosDoDocumento(PROPOSTA_BASE, null)).not.toThrow();
    const dados = montarDadosDoDocumento(PROPOSTA_BASE, null);
    expect(dados.client).toMatchObject({ name: null, company_or_name: null });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/propostas/documento/montar-dados.test.ts`
Expected: FAIL — os testes novos leem `dados.investment`/`dados.schedule`/`dados.commercial_terms`/
`dados.client`, que hoje só existem se vierem do `briefing_json` (não vêm, no cenário do teste).

- [ ] **Step 3: Reescrever `montar-dados.ts`**

```typescript
// lib/propostas/documento/montar-dados.ts
import { formatCents } from "@/lib/money";

export interface DadosDaPropostaParaDocumento {
  briefing_json: unknown;
  total_cents: number;
  moeda: string;
  prazo_dias_uteis: number | null;
  valid_until: string | null;
  created_at: string;
}

export interface ContatoParaDocumento {
  name: string | null;
  display_name: string | null;
}

function diasEntre(inicio: string, fim: string): number {
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000);
}

/**
 * Monta o objeto de dados que `renderizarDocumento` (M2) consome — spec §7
 * item 1: "briefing_json + proposta + cliente", as três fontes juntas.
 * `investment`, `schedule`, `commercial_terms.validity_days` e `client.name`
 * SEMPRE vêm de coluna gravada (nunca do briefing) — são fato do negócio, não
 * algo que a IA deva inventar ou repetir por conta própria. `numero` continua
 * sempre `null`: o renderer reafirma a regra "número nunca aparece em
 * rascunho" (M2 Global Constraints).
 */
export function montarDadosDoDocumento(
  proposta: DadosDaPropostaParaDocumento,
  contato: ContatoParaDocumento | null,
): Record<string, unknown> {
  const briefing =
    proposta.briefing_json && typeof proposta.briefing_json === "object" && !Array.isArray(proposta.briefing_json)
      ? (proposta.briefing_json as Record<string, unknown>)
      : {};
  const briefingClient = (briefing.client && typeof briefing.client === "object" ? briefing.client : {}) as Record<
    string,
    unknown
  >;
  const briefingCommercialTerms = (briefing.commercial_terms && typeof briefing.commercial_terms === "object"
    ? briefing.commercial_terms
    : {}) as Record<string, unknown>;

  const nomeDoContato = contato?.display_name || contato?.name || null;
  const company = (briefingClient.company as string | undefined) ?? null;
  const nomeDoBriefing = (briefingClient.name as string | undefined) ?? null;

  return {
    ...briefing,
    numero: null,
    client: {
      ...briefingClient,
      name: nomeDoContato ?? nomeDoBriefing ?? null,
      company,
      company_or_name: company ?? nomeDoContato ?? nomeDoBriefing ?? null,
    },
    investment: { total_formatted: formatCents(proposta.total_cents, proposta.moeda) },
    schedule: { estimated_days: proposta.prazo_dias_uteis },
    commercial_terms: {
      ...briefingCommercialTerms,
      validity_days: proposta.valid_until ? diasEntre(proposta.created_at, proposta.valid_until) : null,
    },
  };
}
```

- [ ] **Step 4: Rodar e confirmar que os testes novos E os antigos passam**

Run: `npx vitest run lib/propostas/documento/montar-dados.test.ts`
Expected: PASS — inclusive os 4 testes que já existiam (espalha `briefing_json`, `numero` null,
`briefing_json` null/não-objeto): eles chamam `montarDadosDoDocumento({...}, undefined)` hoje sem
segundo argumento — ajuste as chamadas dos 4 testes antigos para passar `null` como segundo
argumento e para os objetos de entrada incluírem as 5 chaves novas de `DadosDaPropostaParaDocumento`
(reaproveite `PROPOSTA_BASE` acima nos testes antigos, sobrescrevendo só `briefing_json`).

- [ ] **Step 5: Atualizar os dois call sites**

Em `app/api/v1/proposals/[id]/documento/route.ts`:
- No tipo de retorno de `buscarProposta` (linhas 31-46), acrescente `total_cents: number`,
  `moeda: string`, `created_at: string`.
- Logo antes da linha `const dados = montarDadosDoDocumento(proposta);` (linha 80), busque o
  contato:

```typescript
  const { data: contato } = proposta.contact_id
    ? await admin
        .from("contacts")
        .select("name, display_name")
        .eq("organization_id", authz.org.orgId)
        .eq("id", proposta.contact_id)
        .maybeSingle()
    : { data: null };

  const dados = montarDadosDoDocumento(proposta, contato);
```

Em `app/api/v1/proposals/[id]/send/route.ts`, na linha 225, troque:

```typescript
        const dados = montarDadosDoDocumento(propostaAlvo as { briefing_json: unknown });
```

por:

```typescript
        const dados = montarDadosDoDocumento(propostaAlvo as never, contato ?? null);
```

(`contato` já é buscado nesta rota na linha 178-183, mais acima no mesmo handler — reaproveite,
não busque de novo.)

- [ ] **Step 6: Rodar a suíte destes dois arquivos e confirmar verde**

Run: `npx vitest run app/api/v1/proposals/[id]/documento/route.test.ts app/api/v1/proposals/[id]/send/route.test.ts lib/propostas/documento/montar-dados.test.ts`
Expected: PASS — se algum teste existente destes dois `route.test.ts` mockava
`montarDadosDoDocumento` com 1 argumento, ajuste o mock/assert para 2 argumentos.

- [ ] **Step 7: Commit**

```bash
git add lib/propostas/documento/montar-dados.ts lib/propostas/documento/montar-dados.test.ts \
  app/api/v1/proposals/[id]/documento/route.ts app/api/v1/proposals/[id]/send/route.ts
git commit -m "fix(propostas): documento calcula investimento, prazo e validade da proposta (nunca do briefing)"
```

---

### Task 2: `crm_draft_proposal` aceita `produto_codigo` e resolve o item pelo catálogo

**Files:**
- Modify: `lib/mcp/tools/propostas.ts`
- Modify: `lib/mcp/tools/propostas.test.ts` (ou crie `lib/mcp/tools/propostas.test.ts` se não
  existir com esse nome exato — confirme com `git log --follow -- 'lib/mcp/tools/propostas*'` antes
  de criar um arquivo novo por engano)

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `itemShape` ganha `produto_codigo?: string`; o handler resolve `product_id` a partir
  dele ANTES de chamar `resolverItensDaProposta` (Task 3 não depende disto).

- [ ] **Step 1: Escrever o teste que falta (falhando)**

```typescript
// lib/mcp/tools/propostas.test.ts — teste novo no describe existente do crmDraftProposal
it("resolve product_id a partir de produto_codigo quando product_id não foi mandado", async () => {
  // monte o ctx.supabase mock deste arquivo com uma linha em catalog_products:
  // { id: "<uuid-do-produto>", organization_id: ORG_ID, codigo: "SITE-BASICO" }
  // e chame crmDraftProposal.handler com itens: [{ descricao: "Site", quantidade: 1, produto_codigo: "SITE-BASICO" }]
  const resultado = await crmDraftProposal.handler(
    { lead_id: LEAD_ID, conversation_id: CONV_ID, titulo: "Proposta", itens: [
      { descricao: "Site institucional", quantidade: 1, produto_codigo: "SITE-BASICO" },
    ] },
    ctx,
  );
  expect(resultado).toMatchObject({ pricing_status: "catalog" }); // preço veio do catálogo, não "a definir"
});

it("recusa produto_codigo que não existe na organização, com o código na mensagem", async () => {
  const resultado = await crmDraftProposal.handler(
    { lead_id: LEAD_ID, conversation_id: CONV_ID, titulo: "Proposta", itens: [
      { descricao: "Site institucional", quantidade: 1, produto_codigo: "NAO-EXISTE" },
    ] },
    ctx,
  );
  expect(resultado).toMatchObject({ error: expect.stringContaining("NAO-EXISTE") });
});

it("product_id explícito vence quando os dois vêm juntos no mesmo item", async () => {
  const resultado = await crmDraftProposal.handler(
    { lead_id: LEAD_ID, conversation_id: CONV_ID, titulo: "Proposta", itens: [
      { descricao: "Site institucional", quantidade: 1, product_id: PRODUTO_ID, produto_codigo: "OUTRO-CODIGO" },
    ] },
    ctx,
  );
  // não deve nem consultar catalog_products por código — product_id já resolve
  expect(resultado).toMatchObject({ pricing_status: "catalog" });
});
```

Adapte os três ao estilo de mock/fixture já usado neste arquivo de teste (leia o arquivo inteiro
antes de escrever — ele já tem `ctx.supabase` mockado para `crm_leads`/`conversations`/
`crm_proposals`/`crm_proposal_items`; acrescente `catalog_products` ao mesmo mock).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/mcp/tools/propostas.test.ts`
Expected: FAIL — `produto_codigo` não existe no schema (Zod recusa o campo extra, ou o handler
ignora e o item nasce sem `product_id`).

- [ ] **Step 3: Implementar**

Em `lib/mcp/tools/propostas.ts`, no `itemShape` (linha 15-25), acrescente:

```typescript
  produto_codigo: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Código do produto do catálogo — o MESMO campo que você já usa em `produto_codigo` no " +
        "send_message para mandar foto. Use quando souber o código mas não tiver o product_id. " +
        "Se os dois vierem juntos, product_id vale.",
    ),
```

No handler, logo antes de `const itensNormalizados = ...` (linha 129), resolva os códigos:

```typescript
    const codigosParaResolver = [
      ...new Set(
        input.itens
          .filter((it) => !it.product_id && it.produto_codigo)
          .map((it) => it.produto_codigo!),
      ),
    ];
    const produtoIdPorCodigo = new Map<string, string>();
    if (codigosParaResolver.length > 0) {
      const { data: produtosPorCodigo } = await ctx.supabase
        .from("catalog_products")
        .select("id, codigo")
        .eq("organization_id", ctx.organizationId)
        .in("codigo", codigosParaResolver);
      for (const p of (produtosPorCodigo ?? []) as Array<{ id: string; codigo: string }>) {
        produtoIdPorCodigo.set(p.codigo, p.id);
      }
      const naoEncontrado = codigosParaResolver.find((c) => !produtoIdPorCodigo.has(c));
      if (naoEncontrado) {
        return { error: `Produto com código "${naoEncontrado}" não encontrado no catálogo desta organização.` };
      }
    }
```

E troque a linha de `product_id: it.product_id ?? null,` dentro do `.map` de
`itensNormalizados` (linha 130) por:

```typescript
      product_id: it.product_id ?? (it.produto_codigo ? (produtoIdPorCodigo.get(it.produto_codigo) ?? null) : null),
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/mcp/tools/propostas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/tools/propostas.ts lib/mcp/tools/propostas.test.ts
git commit -m "feat(propostas): IA vincula item ao catálogo por produto_codigo (sem precisar do UUID)"
```

---

### Task 3: `crm_draft_proposal` aceita o briefing capturado na conversa

**Files:**
- Modify: `lib/mcp/tools/propostas.ts`
- Modify: `lib/mcp/tools/propostas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `draftProposalInputShape` ganha `briefing?: Record<string, unknown>`, gravado direto em
  `crm_proposals.briefing_json` na criação.

- [ ] **Step 1: Escrever o teste que falta (falhando)**

```typescript
it("grava o briefing recebido em briefing_json ao criar o rascunho", async () => {
  const insertSpy = vi.fn(/* ... capture o payload do insert em crm_proposals, como os outros testes deste arquivo já fazem ... */);
  await crmDraftProposal.handler(
    {
      lead_id: LEAD_ID,
      conversation_id: CONV_ID,
      titulo: "Proposta",
      itens: [{ descricao: "Site institucional", quantidade: 1 }],
      briefing: { project: { name: "Site da Imobiliária Rio" }, client: { company: "Imobiliária Rio" } },
    },
    ctx,
  );
  expect(insertSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      briefing_json: { project: { name: "Site da Imobiliária Rio" }, client: { company: "Imobiliária Rio" } },
    }),
  );
});

it("briefing é opcional — rascunho sem ele grava briefing_json null (comportamento de hoje)", async () => {
  const insertSpy = vi.fn(/* ... */);
  await crmDraftProposal.handler(
    { lead_id: LEAD_ID, conversation_id: CONV_ID, titulo: "Proposta", itens: [{ descricao: "Site", quantidade: 1 }] },
    ctx,
  );
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ briefing_json: null }));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/mcp/tools/propostas.test.ts`
Expected: FAIL — `briefing` não é campo aceito, e `crm_proposals.insert` de hoje nem tem
`briefing_json` no payload.

- [ ] **Step 3: Implementar**

Em `draftProposalInputShape` (depois de `template_slug_sugerido`, linha 49-58), acrescente:

```typescript
  briefing: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "O que você entendeu da conversa até agora, para preencher o documento: nome/empresa do " +
        "cliente, objetivo do projeto, escopo (páginas, funcionalidades, integrações...), o que " +
        "está incluído e o que não está. Use as MESMAS chaves que o documento usa — ex.: " +
        '{"project":{"name":"..."},"client":{"company":"..."},"scope":{"pages_list":"Home, Sobre, Contato"},' +
        '"included":{"list":"..."},"excluded":{"list":"..."}}. Preço, prazo e validade NÃO entram ' +
        "aqui — o sistema já sabe e calcula sozinho.",
    ),
```

No `.insert(...)` de `crm_proposals` (linha 149-165), acrescente ao payload:

```typescript
        briefing_json: input.briefing ?? null,
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/mcp/tools/propostas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/tools/propostas.ts lib/mcp/tools/propostas.test.ts
git commit -m "feat(propostas): IA grava o briefing da conversa ao rascunhar a proposta"
```

---

### Task 4: Envio recusa proposta com pendência no documento

**Files:**
- Modify: `app/api/v1/proposals/[id]/send/route.ts`
- Modify: `app/api/v1/proposals/[id]/send/route.test.ts`
- Modify: `lib/i18n/dicionario.ts` (nova frase em espanhol — ver Review Focus geral do repo sobre
  cercas de i18n, abaixo)

**Interfaces:**
- Consumes: `montarDadosDoDocumento` e `renderizarDocumento` (já importados neste arquivo — Task 1
  já ajustou a chamada de `montarDadosDoDocumento` mais abaixo no mesmo arquivo).
- Produces: nada que outra task consuma.

- [ ] **Step 1: Escrever os testes que faltam (falhando)**

```typescript
it("recusa enviar proposta com modelo escolhido e campo do documento sem preencher", async () => {
  // monte o mundo deste arquivo de teste com uma proposta com template_slug definido e
  // briefing_json vazio/incompleto (o modelo real tem {{project.name}} etc. sem valor)
  const res = await POST(reqSend(), ctx(PROPOSTA_ID));
  expect(res.status).toBe(422);
});

it("permite enviar quando as seções com pendência foram todas cobertas por secoes_editadas", async () => {
  // mesma proposta acima, mas com secoes_editadas cobrindo TODAS as seções que tinham faltante
  const res = await POST(reqSend(), ctx(PROPOSTA_ID));
  expect(res.status).not.toBe(422);
});

it("não recusa por pendência quando a proposta não tem modelo escolhido (template_slug null)", async () => {
  const res = await POST(reqSend(), ctx(PROPOSTA_SEM_MODELO_ID));
  expect(res.status).not.toBe(422);
});
```

Leia `app/api/v1/proposals/[id]/send/route.test.ts` inteiro antes de escrever — ele já tem o mundo
mockado (`admin.from(...)` por tabela) que os testes de preço ausente (`pricing_status === "missing"`)
usam; siga o mesmo padrão para `template_slug`/`secoes_editadas`/`resolverModelo`.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run app/api/v1/proposals/[id]/send/route.test.ts`
Expected: FAIL — hoje o `POST` nunca devolve 422 por pendência de documento, só por item sem preço.

- [ ] **Step 3: Implementar**

Em `app/api/v1/proposals/[id]/send/route.ts`, logo depois do bloco de `pricing_status === "missing"`
(linha 99, antes da busca de `conversa`), acrescente:

```typescript
  // §7 item 2 da spec — enviar com o documento cheio de "[a definir]" é pior
  // que não enviar: o cliente recebe o PDF com a pendência que a tela já
  // avisava e ninguém tinha bloqueado.
  if (proposta.template_slug) {
    const modelo = await resolverModelo(admin, authz.org.orgId, proposta.template_slug as string);
    if (modelo) {
      const { data: contatoParaDoc } = proposta.contact_id
        ? await admin
            .from("contacts")
            .select("name, display_name")
            .eq("organization_id", authz.org.orgId)
            .eq("id", proposta.contact_id)
            .maybeSingle()
        : { data: null };
      const dados = montarDadosDoDocumento(proposta as never, contatoParaDoc ?? null);
      const documento = renderizarDocumento(modelo, dados);
      const overrides = (proposta.secoes_editadas as Record<string, string> | null) ?? {};
      const pendencias = documento.secoes.flatMap((s) => (overrides[s.id] !== undefined ? [] : s.faltantes));
      if (pendencias.length > 0) {
        return fail(
          "validation_failed",
          t(`Faltam ${pendencias.length} campo(s) do documento antes de enviar. Abra a proposta e revise.`),
          422,
          { requestId },
        );
      }
    }
  }
```

Confira os imports do topo do arquivo: `resolverModelo`, `montarDadosDoDocumento` e
`renderizarDocumento` já estão importados (usados mais abaixo, no bloco do snapshot M5) — não
duplique o import.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run app/api/v1/proposals/[id]/send/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Adicionar a tradução em espanhol**

Em `lib/i18n/dicionario.ts`, acrescente ao dicionário (mesma seção das outras frases de propostas):

```typescript
  "Faltam {n} campo(s) do documento antes de enviar. Abra a proposta e revise.": {
    es: "Faltan {n} campo(s) del documento antes de enviar. Abra la propuesta y revise.",
  },
```

Ajuste a chave para bater exatamente com a string interpolada que o Step 3 gerou (o dicionário
casa por texto literal — confira `traduzir()` em `lib/i18n/dicionario.ts` para o formato exato de
chave com placeholder que este arquivo já usa em frases parecidas, ex. a de item sem preço na
mesma rota, e siga o MESMO formato, não invente um novo).

- [ ] **Step 6: Rodar a suíte de i18n inteira, não só o arquivo que você tocou**

Run: `npx vitest run tests/unit/i18n-espanhol-cobre-a-tela.test.ts lib/ai/inbox-destino.test.ts`
Expected: PASS. Esta dupla já pegou 3 traduções esquecidas nesta mesma feature em sessões
anteriores — nenhuma delas aparece rodando só o arquivo da rota. Se o formato de chave com
placeholder do Step 5 estiver errado, é aqui que aparece.

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/proposals/[id]/send/route.ts app/api/v1/proposals/[id]/send/route.test.ts lib/i18n/dicionario.ts
git commit -m "fix(propostas): recusa enviar proposta com pendência de documento (§7 item 2 da spec)"
```

---

## Depois das 4 tasks — antes de considerar pronto

Rode a suíte inteira, não só os arquivos tocados (ver `CLAUDE.md` §Testes — `vitest run` sem
caminho é o script `pnpm test:unit`, e ele alcança 566 arquivos, não só `tests/unit/`):

```bash
pnpm typecheck
pnpm test:unit > /tmp/vt.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests " /tmp/vt.log | tail -2
```

Não abra PR nem avise "pronto" com esse comando vermelho. `pnpm test:db` fica para a sessão humana
rodar (o ambiente de banco não existe nesta máquina) — não tente instalar Postgres nem Docker aqui.
