# Onda C3b + E1 da proposta comercial — Implementation Plan

> **Para quem for executar isto fora do Claude Code (ex.: `opencode run`):** este
> plano é autossuficiente e cobre SETE itens da spec de uma vez (D11, e N1,
> N2, N3, N4, N5, N7 — N6 fica de fora, é uma decisão já registrada sem ação
> de código). É o maior plano da série C1-C4, C3b, E1 até aqui: **execute tarefa por
> tarefa, na ordem, e não pule verificação nenhuma**. Medido contra o HEAD
> `32e83a7f3` (C1+C2+C3 parcial já aplicadas; C4 pode já ter entrado quando
> você chegar aqui — **confira antes de editar**: se um trecho citado não
> bater linha por linha, pare e relate a divergência em vez de adivinhar).
>
> Regras não-negociáveis (as mesmas de C3/C4, valem sempre):
>
> 1. **TDD de verdade**: teste primeiro, RODE e confirme que falha pelo
>    motivo certo, só então implemente, rode e confirme verde.
> 2. **Toda mudança de schema é uma migration versionada** em
>    `supabase/migrations/` + apêndice idempotente em `supabase/baseline.sql`
>    (antes de `-- ---- VARREDURA anon`) + linha em
>    `supabase/migrations/MANIFEST.md`. As três juntas, sempre.
> 3. Antes de nomear a migration, rode `pnpm checar:colisao-de-migration` —
>    o número livre no momento em que este plano foi escrito era `0404`, mas
>    as ondas C3/C4 rodando em paralelo podem já ter tomado esse número.
> 4. Depois de cada task: `pnpm typecheck` + os testes do arquivo tocado. No
>    fim de todas: `pnpm test:unit > /tmp/vt.log 2>&1; echo "exit=$?"` e leia
>    o RODAPÉ, nunca só `grep FAIL`.
> 5. `tests/invariants/**` não roda nesta máquina (sem Docker) — escreva os
>    testes mesmo assim, verifique só com `pnpm typecheck`.
> 6. `git status` antes de mexer em qualquer branch/worktree; nunca
>    `reset --hard`/force.
> 7. **Antes de aceitar como fato qualquer lista que este plano enumera**
>    ("os TRÊS lugares que gravam item de proposta", "só esta rota chama Y")
>    — **reconfira com `git grep` você mesmo antes de codar a task que
>    depende dela**. A revisão final da C3 achou um QUARTO lugar que gravava
>    item de proposta (`assistant/apply/route.ts`) que a medição daquela
>    onda não tinha achado. Uma lista de consumidores no plano é o PONTO DE
>    PARTIDA da sua busca, nunca o fim dela.
> 8. **Toda referência tipo FK que chega como INPUT EXTERNO (ferramenta MCP,
>    corpo de request) e é gravada com o client admin/service-role precisa
>    ser validada contra o DONO e a ORGANIZAÇÃO antes do INSERT/UPDATE** —
>    nunca confie que um id "parece certo" só porque o schema aceita
>    qualquer UUID.
> 9. **Quando uma task adiciona uma invariante nova** (aqui: "item com
>    `product_id` cuja moeda diverge da proposta é recusado", D11) —
>    **procure TODO INSERT/UPDATE existente em `crm_proposal_items`** (não
>    só o que a Task 1 está mexendo) e confirme que cada um passa pela
>    checagem de moeda nova, inclusive os que já existiam ANTES desta onda
>    (a ferramenta MCP, a rota `/revise` da C4, a rota do assistente de IA).
>    A revisão da C3 achou esse mesmo padrão duas vezes: um INSERT que já
>    existia não foi revisitado quando a invariante nasceu.
> 10. **Autoauditoria obrigatória antes de declarar a onda pronta** — não é
>    opcional e não é o mesmo que "rodei os testes". Antes do commit da
>    Task 12, execute os comandos de `git grep` da seção "Autoauditoria"
>    dentro de "Verificação final da onda inteira" (abaixo) e resolva
>    qualquer divergência que aparecer — ou registre por que não é caso de
>    conserto. Não relate a onda como concluída sem ter rodado esses
>    comandos e sem ter colado a saída deles no seu relato final.
> 11. Ao final: não abra PR, não faça push. Pare depois do commit da última
>    task e devolva o resultado para revisão.
>
> **A Task 12 pede uma verificação extra ANTES de codar** (correção desta
> revisão: a versão anterior desta nota dizia "Tasks 5 e 9", e nenhuma das
> duas tem esse aviso — só a 12 tem), porque a medição que baseou este plano
> não conseguiu confirmar 100% um detalhe (o grant/assinatura exata de uma
> função de banco, `fn_gasto_de_ia_do_mes`). Leia o aviso dentro dela antes
> de escrever qualquer linha.

**Goal:** Entregar D11 (proposta nasce na moeda da organização, item de
catálogo em moeda diferente é recusado) + N1 (seção "Propostas" no dossiê do
negócio) + N2 (envio agenda follow-up automático; decisão cancela) + N3
(proposta vencida sem retomada entra no Radar de Risco) + N4 (rascunho avisa
quando o preço do catálogo mudou desde que o item foi adicionado) + N5
(assistente da IA nasce desabilitado com motivo, antes do clique, quando não
há orçamento) + N7 (o agente sabe, no contexto do turno, qual foi o desfecho
da última proposta do lead).

**Architecture:** Sete features quase independentes entre si (compartilham
só a tabela `crm_proposals` como pano de fundo), organizadas em 12 tasks
menores em vez de uma arquitetura só. Cada task entrega um pedaço testável
sozinho. A ordem abaixo agrupa por dependência real: D11 primeiro (mexe na
escrita da proposta, que as outras leem); depois N1/N3/N7 (só leitura, sem
risco de quebrar o que já existe); depois N2 (escreve numa tabela externa,
`cron_jobs`, via helper já existente); depois N4 (leitura + UI); N5 por
último (a mais arriscada, por não ter precedente no produto).

**Tech Stack:** Next.js Route Handlers, Supabase (Postgres + RLS), React
Query (hooks de `hooks/kanban/`), Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-proposta-comercial-design.md`
(seções "D11" e "3. Prometido pela spec-mãe e não entregue", itens N1, N2,
N3, N4, N5, N7). Medição completa contra `32e83a7f3`, com `arquivo:linha`,
registrada nas tasks.

## Global Constraints

- **Os nomes de código de erro do follow-up que a spec cita estão errados —
  use os reais.** A spec fala em `promised_at_out_of_window`/`already_pending`;
  o código (`lib/followup/retorno.ts`) usa `instante_fora_da_janela` e
  `ja_existe_retorno`. Todo teste e mensagem desta onda usa os nomes REAIS.
- Toda query nova filtra `organization_id` explicitamente — sem exceção,
  mesmo em helpers de leitura "inofensivos" (Radar de Risco, contexto da IA).
- `moeda-da-org.ts` (`lib/catalogo/moeda-da-org.ts`) já existe e é reusado
  tal como está — nenhuma task desta onda o reescreve, só o importa.
- Item de proposta com `product_id` cujo `catalog_products.moeda` diverge da
  moeda da proposta é **recusado com mensagem**, nunca convertido nem
  silenciosamente aceito (D11).
- N5 e N7 tocam código do lado do agente/orçamento de IA, que é sensível e
  não tem precedente de UI equivalente no produto (medido — ver Task 9) —
  ambas as tasks são as que mais provavelmente precisam de uma Ruling durante
  a implementação; documente qualquer desvio no ledger.
- Nenhuma task desta onda apaga dado. N2 cancela retorno (não apaga a
  proposta nem o negócio); N4 é só leitura + um PATCH que já existe.

## Review Focus

1. **Follow-up automático (N2) num negócio já apagado (D10 — proposta
   sobrevive órfã)**: `proposta.lead_id` pode ser `null` numa proposta
   enviada cujo negócio foi apagado depois. `agendaRetornoNoCrm` exige um
   `leadId` OU `contactId` — a proposta órfã ainda tem `contact_id`
   (D10 mantém isso via `destinatario_nome` + o contato original, quando
   ele também não foi apagado). Um envio nunca pode lançar por falta de
   alvo — cai calado (fire-and-forget, como o resto de follow-up) quando
   nem lead nem contato resolvem. Coberto na Task 6.
2. **Radar de Risco (N3) com proposta vencida cujo negócio JÁ TEM uma
   proposta mais nova `enviada`/`aceita`** (o cliente já recebeu uma segunda
   proposta depois da vencida): a spec exige "sem proposta mais nova" —
   contar só o vencimento sem checar isso reabriria um alerta para um negócio
   que já andou. Coberto na Task 7.
3. **Item de catálogo cujo `product_id` mudou de moeda DEPOIS que o item já
   estava na proposta** (ex.: item adicionado quando o produto era BRL, o
   produto foi editado para USD antes do envio): a spec (D11) fala em
   "recusado" na criação/edição — o comportamento no ENVIO de um item que já
   tinha sido aceito e cuja moeda mudou depois não está descrito. Trate como
   "recusar no próximo PATCH/edição que tocar aquele item" (mesma trava),
   nunca no envio silenciosamente — documentar como Ruling se a
   implementação achar um caminho onde o envio precisaria da mesma checagem.
4. **N4: item MANUAL (sem `product_id`) não pode disparar aviso de "preço
   mudou no catálogo"** — só itens com `product_id` participam da comparação;
   a spec já é clara nisso, mas é fácil escrever a query sem o filtro e
   comparar preço de item manual contra `null`. Coberto na Task 10 com um
   teste dedicado.
5. **N7: proposta em `rascunho` não é "desfecho"** — o resumo que o agente lê
   deve mostrar a ÚLTIMA proposta com desfecho real (`enviada`, `aceita`,
   `recusada`, `vencida`), nunca um rascunho aberto (que pode ser o rascunho
   que o próprio agente acabou de criar, sem sentido "ofereça de novo o que
   já foi recusado" para algo que nem foi enviado). Coberto na Task 11.

---

### Task 1: D11 — proposta nasce na moeda da organização; item de moeda diferente é recusado

**Files:**
- Modify: `lib/propostas/preco-do-catalogo.ts` (também devolve `moeda`)
- Modify: `lib/propostas/preco-do-catalogo.test.ts`
- Modify: `lib/propostas/itens.ts` (recebe a moeda da proposta, recusa
  divergência)
- Modify: `lib/propostas/itens.test.ts`
- Modify: `app/api/v1/proposals/route.ts` (grava `moeda` via
  `moedaDaOrganizacao`)
- Modify: `app/api/v1/proposals/route.test.ts`
- Modify: `lib/mcp/tools/propostas.ts` (idem)
- Modify: `lib/mcp/tools/propostas.test.ts`
- Modify: `app/api/v1/proposals/[id]/route.ts` (PATCH também recusa item de
  moeda diferente — reusa `resolverItensDaProposta`)
- Modify: `app/api/v1/proposals/[id]/route.test.ts`
- Modify: `app/api/v1/proposals/[id]/assistant/apply/route.ts` (4º chamador —
  **não existia quando este plano foi medido contra `32e83a7f3`**; entrou na
  C3 (a rota já existia) mas só passou a chamar `resolverItensDaProposta` no
  fix pass da revisão final da C3. Reconfira com `git grep` — regra 7 — antes
  de assumir que são só 3 chamadores.)
- Modify: `app/api/v1/proposals/[id]/assistant/apply/route.test.ts`
- Modify: `app/api/v1/proposals/[id]/revise/route.ts` (5º chamador — entrou
  na C4, fix pass do achado Importante I4. Copia `proposta.moeda` da v1, já
  disponível no registro que a rota já lê.)
- Modify: `app/api/v1/proposals/[id]/revise/route.test.ts`

**Interfaces:**
- Produces: `buscarPrecoDoCatalogo` passa a devolver
  `{ preco_cents: number; moeda: string } | null`;
  `resolverItensDaProposta(db, organizationId, itens, moedaDaProposta)` ganha
  um 4º parâmetro obrigatório e recusa item cujo `catalog_products.moeda`
  diverge de `moedaDaProposta`.
- Consumes: `moedaDaOrganizacao` (`lib/catalogo/moeda-da-org.ts`, já
  existente, não modificado).

- [ ] **Step 1: Escrever os testes de `preco-do-catalogo.ts` (falhando)**

Adicione ao arquivo existente (preserve os 2 testes já lá, ajustando a
asserção de retorno para incluir `moeda`):

```typescript
  it("devolve também a moeda do produto (D11)", async () => {
    const chain = {
      select: vi.fn(function (this: typeof chain) { return this; }),
      eq: vi.fn(function (this: typeof chain) { return this; }),
      maybeSingle: vi.fn(async () => ({ data: { preco_cents: 5000, moeda: "USD" }, error: null })),
    };
    const db = { from: vi.fn(() => chain) } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const r = await buscarPrecoDoCatalogo(db, "org-1", "prod-1");
    expect(r).toEqual({ preco_cents: 5000, moeda: "USD" });
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run lib/propostas/preco-do-catalogo.test.ts`
Expected: FAIL — o `select` de hoje não pede `moeda`; o retorno não a inclui.

- [ ] **Step 3: Implementar**

Troque, em `lib/propostas/preco-do-catalogo.ts`:

```typescript
export interface PrecoDoCatalogo {
  preco_cents: number;
}
...
  const { data } = await db
    .from("catalog_products")
    .select("preco_cents")
    .eq("organization_id", organizationId)
    .eq("id", productId)
    .eq("ativo", true)
    .maybeSingle();
  return data ? { preco_cents: (data as { preco_cents: number }).preco_cents } : null;
```

por:

```typescript
export interface PrecoDoCatalogo {
  preco_cents: number;
  moeda: string;
}
...
  const { data } = await db
    .from("catalog_products")
    .select("preco_cents, moeda")
    .eq("organization_id", organizationId)
    .eq("id", productId)
    .eq("ativo", true)
    .maybeSingle();
  return data ? (data as PrecoDoCatalogo) : null;
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run lib/propostas/preco-do-catalogo.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Escrever os testes de `itens.ts` que faltam (falhando)**

Leia o arquivo de teste inteiro primeiro (a assinatura de
`resolverItensDaProposta` muda — todo teste existente precisa ganhar o 4º
argumento; ajuste-os todos passando `"BRL"`, que é o comportamento de hoje).
Adicione:

```typescript
  it("item de catálogo em moeda DIFERENTE da proposta: recusado com mensagem clara (D11)", async () => {
    const db = montarSupabase(5000, "USD"); // ajuste o helper de mock para aceitar (preco, moeda)
    const r = await resolverItensDaProposta(db, "org-1", [itemDoCatalogo()], "BRL");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("moeda");
  });

  it("item de catálogo na MESMA moeda da proposta: aceito normalmente", async () => {
    const db = montarSupabase(5000, "BRL");
    const r = await resolverItensDaProposta(db, "org-1", [itemDoCatalogo()], "BRL");
    expect(r.ok).toBe(true);
  });
```

Ajuste o helper `montarSupabase` do arquivo (hoje aceita só `precoDoCatalogo:
number | null`) para aceitar também a moeda, mantendo compatibilidade com os
testes existentes (parâmetro opcional com default `"BRL"`).

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `pnpm vitest run lib/propostas/itens.test.ts`
Expected: FAIL — `resolverItensDaProposta` não recebe/checa moeda ainda.

- [ ] **Step 7: Implementar**

```typescript
// lib/propostas/itens.ts
export async function resolverItensDaProposta(
  db: SupabaseClient,
  organizationId: string,
  itens: readonly ProposalItemInput[],
  moedaDaProposta: string,
): Promise<ResolverItensResultado> {
  const resolvidos: ItemResolvido[] = [];
  for (const it of itens) {
    if (it.product_id) {
      const doCatalogo = await buscarPrecoDoCatalogo(db, organizationId, it.product_id);
      if (!doCatalogo) {
        return {
          ok: false,
          motivo: `Produto do item "${it.descricao}" não encontrado no catálogo desta organização.`,
        };
      }
      // D11 — nunca converte, recusa. Uma conversão silenciosa mudaria o
      // valor que a pessoa viu no catálogo sem ela perceber.
      if (doCatalogo.moeda !== moedaDaProposta) {
        return {
          ok: false,
          motivo: `Produto do item "${it.descricao}" está em ${doCatalogo.moeda}, mas esta proposta é em ${moedaDaProposta}.`,
        };
      }
      resolvidos.push({
        product_id: it.product_id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unitario_cents: doCatalogo.preco_cents,
        desconto_cents: it.desconto_cents,
        position: it.position,
      });
    } else {
      resolvidos.push({
        product_id: null,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unitario_cents: it.preco_unitario_cents,
        desconto_cents: it.desconto_cents,
        position: it.position,
      });
    }
  }
  return {
    ok: true,
    itens: resolvidos,
    totalCents: calcularTotal(resolvidos),
    pricingStatus: calcularPricingStatus(resolvidos),
  };
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `pnpm vitest run lib/propostas/itens.test.ts`
Expected: PASS (todos, incluindo os ajustados).

Run: `pnpm typecheck`
Expected: **FALHA esperada** nos 3 chamadores (`route.ts` POST, `[id]/route.ts`
PATCH, `lib/mcp/tools/propostas.ts`) — todos passam só 3 argumentos hoje.
Resolvido nos próximos steps.

- [ ] **Step 9: `app/api/v1/proposals/route.ts` — grava a moeda e passa ao resolver**

Adicione o import:

```typescript
import { moedaDaOrganizacao } from "@/lib/catalogo/moeda-da-org";
```

Antes da chamada a `resolverItensDaProposta`, resolva a moeda:

```typescript
  const moeda = await moedaDaOrganizacao(supabase, authz.org.orgId);
  const resolvido = await resolverItensDaProposta(supabase, authz.org.orgId, input.itens, moeda);
```

E no `.insert(...)` da proposta, adicione `moeda,` ao objeto gravado.

Escreva o teste (falhando antes, passando depois):

```typescript
  it("grava a MOEDA DA ORGANIZAÇÃO na proposta, não sempre BRL (D11)", async () => {
    // mock moedaDaOrganizacao devolvendo "USD" (via mock de organizations.currency)
    const res = await POST(montarRequest({ lead_id: LEAD_ID, titulo: "x", itens: [] }));
    expect(res.status).toBe(201);
    expect(mockInsertCrmProposals).toHaveBeenCalledWith(expect.objectContaining({ moeda: "USD" }));
  });

  it("item de catálogo em moeda diferente da organização: 422, nada gravado", async () => {
    // mock catalog_products.moeda = "USD", organizations.currency = "BRL"
    const res = await POST(montarRequest({ lead_id: LEAD_ID, titulo: "x", itens: [{ product_id: PRODUCT_ID, descricao: "x", quantidade: 1 }] }));
    expect(res.status).toBe(422);
    expect(mockInsertCrmProposals).not.toHaveBeenCalled();
  });
```

- [ ] **Step 10: `lib/mcp/tools/propostas.ts` — mesma regra**

Adicione o import e, antes de `resolverItensDaProposta`, resolva a moeda com
`ctx.supabase`/`ctx.organizationId`; passe ao `resolverItensDaProposta` e ao
`.insert(...)` da proposta (`moeda,`). Escreva o teste equivalente em
`lib/mcp/tools/propostas.test.ts` (mesmo padrão do Step 9, adaptado ao
`montarMundoDeFerramenta`).

- [ ] **Step 11: `app/api/v1/proposals/[id]/route.ts` (PATCH) — mesma regra**

A PATCH não recebe `moeda` no body (edição não muda a moeda de uma proposta
já criada — fora de escopo mudar moeda no meio do processo). Busque a moeda
ATUAL da proposta antes de resolver os itens:

```typescript
  const { data: propostaAtual } = await supabase
    .from("crm_proposals")
    .select("moeda")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!propostaAtual) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  const resolvido = await resolverItensDaProposta(supabase, authz.org.orgId, input.itens, propostaAtual.moeda);
```

(o restante do fluxo de PATCH já existente continua igual — este SELECT
extra substitui a necessidade de assumir "BRL"; note que o `.update(...)`
mais abaixo já filtra por `id`/`organization_id`/`revision`/`status`, então
uma segunda leitura aqui não introduz corrida nova relevante.)

Escreva o teste equivalente (item de moeda diferente da proposta já
existente → 422, itens antigos não tocados).

- [ ] **Step 12: `app/api/v1/proposals/[id]/assistant/apply/route.ts` — mesma regra**

Este caminho já existe e já chama `resolverItensDaProposta` (fix pass da
revisão final da C3) — mas o `select` de hoje não traz `moeda`, então este
step é PURO ajuste de assinatura, não feature nova. Adicione `moeda` ao
`select` da proposta:

```typescript
  const { data: proposta } = await supabase
    .from("crm_proposals")
    .select("lead_id, contact_id, titulo, condicoes, valid_until, status, revision, moeda")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
```

E passe `proposta.moeda` como 4º argumento:

```typescript
  const resolvido = await resolverItensDaProposta(supabase, authz.org.orgId, estadoDepois.itens, proposta.moeda);
```

Escreva o teste (falhando antes, passando depois): item de catálogo em moeda
diferente da proposta → 422, a mudança da IA não é aplicada.

Run: `pnpm vitest run "app/api/v1/proposals/[id]/assistant/apply/route.test.ts"`
Expected: FAIL antes do ajuste (assinatura nova sem o 4º argumento não
compila/o mock não resolve moeda), PASS depois.

- [ ] **Step 13: `app/api/v1/proposals/[id]/revise/route.ts` — mesma regra**

Este caminho também já existe e já chama `resolverItensDaProposta` (fix pass
do achado Importante I4 da revisão final da C4) — a v1 já é lida por inteiro
(`select("*")`), então `proposta.moeda` já está disponível sem query extra.
Passe como 4º argumento:

```typescript
  const resolvido = await resolverItensDaProposta(
    admin,
    authz.org.orgId,
    (itensDaV1 ?? []).map((it) => ({ ... })),
    proposta.moeda,
  );
```

Escreva o teste (falhando antes, passando depois): a v1 é em USD, o produto
do catálogo mudou para BRL desde então → 422 ao revisar (a v2 não nasce com
item que já não bate a moeda da cadeia).

Run: `pnpm vitest run "app/api/v1/proposals/[id]/revise/route.test.ts"`
Expected: FAIL antes do ajuste, PASS depois.

- [ ] **Step 14: Rodar tudo e confirmar**

Run: `pnpm vitest run lib/propostas/preco-do-catalogo.test.ts lib/propostas/itens.test.ts app/api/v1/proposals/route.test.ts "app/api/v1/proposals/[id]/route.test.ts" lib/mcp/tools/propostas.test.ts "app/api/v1/proposals/[id]/assistant/apply/route.test.ts" "app/api/v1/proposals/[id]/revise/route.test.ts"`
Expected: PASS em todos.

Run: `pnpm typecheck`
Expected: 0 erros. **Se ainda sobrar erro de assinatura em algum arquivo, é
sinal de um 6º chamador que nem esta revisão achou — rode o `git grep` da
regra 7 de novo antes de "corrigir" o tipo por fora.**

- [ ] **Step 15: Commit**

```bash
git add lib/propostas/preco-do-catalogo.ts lib/propostas/preco-do-catalogo.test.ts lib/propostas/itens.ts lib/propostas/itens.test.ts "app/api/v1/proposals/route.ts" "app/api/v1/proposals/route.test.ts" lib/mcp/tools/propostas.ts lib/mcp/tools/propostas.test.ts "app/api/v1/proposals/[id]/route.ts" "app/api/v1/proposals/[id]/route.test.ts" "app/api/v1/proposals/[id]/assistant/apply/route.ts" "app/api/v1/proposals/[id]/assistant/apply/route.test.ts" "app/api/v1/proposals/[id]/revise/route.ts" "app/api/v1/proposals/[id]/revise/route.test.ts"
git commit -m "feat(propostas): nasce na moeda da organização; item de catálogo em moeda diferente é recusado (D11)"
```

---

### Task 2: `hooks/kanban/usePropostasDoLead.ts` — hook novo, lista completa (N1)

**Files:**
- Create: `hooks/kanban/usePropostasDoLead.ts`
- Create: `hooks/kanban/usePropostasDoLead.test.ts`

**Interfaces:**
- Produces: `usePropostasDoLead(leadId, enabled = true)` → lista de
  `{ id, titulo, status, total_cents, moeda, numero, ano, versao, valid_until, created_at }`,
  reusando a MESMA rota (`GET /api/v1/proposals?lead_id=...`) e a MESMA
  `queryKey` (`["proposals", "por-lead", leadId]`) já usadas por
  `usePropostaEnviadaDoLead` — React Query dedupe/compartilha o cache entre
  os dois hooks automaticamente.

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// hooks/kanban/usePropostasDoLead.test.ts
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { usePropostasDoLead } from "./usePropostasDoLead";

vi.mock("@/lib/api/client");

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("usePropostasDoLead", () => {
  it("busca /api/v1/proposals?lead_id=... e devolve a lista INTEIRA (não filtra como usePropostaEnviadaDoLead)", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        { id: "p1", titulo: "A", status: "rascunho", total_cents: 100, moeda: "BRL", numero: null, ano: null, versao: 1, valid_until: null, created_at: "2026-01-01" },
        { id: "p2", titulo: "B", status: "enviada", total_cents: 200, moeda: "BRL", numero: 1, ano: 2026, versao: 1, valid_until: "2026-02-01", created_at: "2026-01-02" },
      ],
    } as never);
    const { result } = renderHook(() => usePropostasDoLead("lead-1"), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(apiClient.get).toHaveBeenCalledWith("/api/v1/proposals?lead_id=lead-1");
  });

  it("enabled=false: não busca", () => {
    renderHook(() => usePropostasDoLead("lead-1", false), { wrapper });
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run hooks/kanban/usePropostasDoLead.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
// hooks/kanban/usePropostasDoLead.ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface PropostaDoLead {
  id: string;
  titulo: string;
  status: string;
  total_cents: number;
  moeda: string;
  numero: number | null;
  ano: number | null;
  versao: number;
  valid_until: string | null;
  created_at: string;
}

/**
 * N1 — lista COMPLETA das propostas de um negócio, para a seção "Propostas"
 * do dossiê. Mesma rota e mesma queryKey de `usePropostaEnviadaDoLead`
 * (D10) — o React Query compartilha o cache entre os dois hooks quando
 * ambos estão montados ao mesmo tempo (dossiê aberto + diálogo de excluir).
 */
export function usePropostasDoLead(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ["proposals", "por-lead", leadId],
    queryFn: async () => apiClient.get<{ data: PropostaDoLead[] }>(`/api/v1/proposals?lead_id=${leadId}`),
    enabled,
    select: (res) => res.data,
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run hooks/kanban/usePropostasDoLead.test.ts`
Expected: PASS 2/2.

- [ ] **Step 5: Commit**

```bash
git add hooks/kanban/usePropostasDoLead.ts hooks/kanban/usePropostasDoLead.test.ts
git commit -m "feat(propostas): hook usePropostasDoLead — lista completa para o dossiê (N1)"
```

---

### Task 3: Seção "Propostas" no dossiê do negócio (N1)

**Files:**
- Create: `components/kanban/PropostasDoNegocio.tsx`
- Create: `components/kanban/PropostasDoNegocio.test.tsx`
- Modify: `components/kanban/LeadDossier.tsx` (insere a seção nova)
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: `usePropostasDoLead` (Task 2).
- Produces: nada para outras tasks.

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// components/kanban/PropostasDoNegocio.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropostasDoNegocio } from "./PropostasDoNegocio";
import { apiClient } from "@/lib/api/client";

vi.mock("@/lib/api/client");

function renderComQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("PropostasDoNegocio", () => {
  it("lista as propostas com número/versão/status/total/validade", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [{ id: "p1", titulo: "Site", status: "enviada", total_cents: 500000, moeda: "BRL", numero: 42, ano: 2026, versao: 1, valid_until: "2026-10-01", created_at: "2026-09-01" }],
    } as never);
    renderComQuery(<PropostasDoNegocio leadId="lead-1" pipelineId="pipe-1" />);
    expect(await screen.findByText(/0042\/2026/)).toBeInTheDocument();
  });

  it("sem propostas: mostra o atalho 'Nova proposta', nunca uma lista vazia muda (manager+)", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    renderComQuery(<PropostasDoNegocio leadId="lead-1" pipelineId="pipe-1" podeCriar />);
    expect(await screen.findByRole("link", { name: /nova proposta/i })).toBeInTheDocument();
  });

  it("papel sem permissão de criar: não mostra o atalho", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    renderComQuery(<PropostasDoNegocio leadId="lead-1" pipelineId="pipe-1" podeCriar={false} />);
    expect(screen.queryByRole("link", { name: /nova proposta/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run components/kanban/PropostasDoNegocio.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar**

```tsx
// components/kanban/PropostasDoNegocio.tsx
"use client";
import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";
import { usePropostasDoLead } from "@/hooks/kanban/usePropostasDoLead";
import { formatCents } from "@/lib/money";

const ROTULO_DE_STATUS: Record<string, string> = {
  rascunho: "Rascunho", enviando: "Enviando", enviada: "Enviada", aceita: "Aceita",
  recusada: "Recusada", vencida: "Vencida", cancelada: "Cancelada", substituida: "Substituída",
};

interface Props {
  leadId: string;
  pipelineId: string;
  /** N1 — o atalho "Nova proposta" é `manager`+; o dossiê já sabe o papel de quem está vendo. */
  podeCriar?: boolean;
}

/** N1 — seção "Propostas" do dossiê, depois de "Dados do negócio". */
export function PropostasDoNegocio({ leadId, podeCriar = false }: Props): React.ReactElement {
  const { t } = useT();
  const { data: propostas, isLoading } = usePropostasDoLead(leadId);

  return (
    <div className="border-t border-border pt-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">{t("Propostas")}</h3>
      {isLoading && <p className="text-xs text-text-muted">{t("Carregando…")}</p>}
      {!isLoading && (propostas?.length ?? 0) === 0 && (
        <p className="text-xs text-text-muted">{t("Nenhuma proposta ainda.")}</p>
      )}
      {!isLoading && propostas && propostas.length > 0 && (
        <ul className="space-y-1">
          {propostas.map((p) => (
            <li key={p.id}>
              <Link href={`/app/proposals/${p.id}`} className="flex items-center justify-between text-xs hover:underline">
                <span>
                  {p.numero ? `${String(p.numero).padStart(4, "0")}/${p.ano}` : t("Rascunho")}
                  {p.versao > 1 ? ` — v${p.versao}` : ""} · {t(ROTULO_DE_STATUS[p.status] ?? p.status)}
                </span>
                <span>{formatCents(p.total_cents, p.moeda)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {podeCriar && (
        <Link
          href={`/app/proposals/new?lead_id=${leadId}`}
          className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
        >
          {t("Nova proposta")}
        </Link>
      )}
    </div>
  );
}
```

(confira se existe mesmo uma rota `/app/proposals/new?lead_id=...` — se a
criação de proposta hoje só acontece por outro fluxo, ajuste o `href` para o
que já existir; não invente uma rota nova nesta task, ela não está no
escopo do N1.)

- [ ] **Step 4: Inserir no `LeadDossier.tsx`**

Depois da seção "Dados do negócio" (linha ~164 medida, logo após o
`</div>` de fechamento dela, antes de `</SheetContent>`):

```tsx
              <PropostasDoNegocio
                leadId={lead.id}
                pipelineId={pipelineId}
                podeCriar={/* mesma expressão de papel que o resto do dossiê já usa para manager+ — confira e reuse, não invente uma nova checagem de role */}
              />
```

Some quando a capacidade "propostas" está desligada na organização — confira
se `LeadDossier.tsx` já tem acesso a alguma flag de capacidades (senão, o
componente `PropostasDoNegocio` pode checar sozinho e devolver `null` — mas
prefira reusar um sinal já existente no dossiê a fazer uma chamada de rede
extra só para isso; se não achar nada pronto, documente como Ruling e faça
o componente devolver `null` silenciosamente quando o `GET` de propostas
vier 404 — que é exatamente o que a rota já devolve com capacidade
desligada, `sePropostasDesligadas`).

Adicione o import de `PropostasDoNegocio` no topo do arquivo.

- [ ] **Step 5: Strings novas no dicionário**

```typescript
  "Propostas": { es: "Propuestas" },
  "Nenhuma proposta ainda.": { es: "Ninguna propuesta todavía." },
  "Nova proposta": { es: "Nueva propuesta" },
  "Rascunho": { es: "Borrador" },
  "Enviando": { es: "Enviando" },
  "Enviada": { es: "Enviada" },
  "Aceita": { es: "Aceptada" },
  "Recusada": { es: "Rechazada" },
  "Vencida": { es: "Vencida" },
  "Cancelada": { es: "Cancelada" },
  "Substituída": { es: "Sustituida" },
```

(confira duplicatas antes de colar — algumas dessas chaves de status já
podem existir em `app/app/proposals/_client.tsx`/`_client.tsx` da onda C1;
se já existirem, NÃO duplique a chave, só reaproveite.)

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pnpm vitest run components/kanban/PropostasDoNegocio.test.tsx`
Expected: PASS.

Run: `pnpm vitest run tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: PASS (ou aponta a chave exata faltando — resolva até verde).

- [ ] **Step 7: Commit**

```bash
git add components/kanban/PropostasDoNegocio.tsx components/kanban/PropostasDoNegocio.test.tsx components/kanban/LeadDossier.tsx lib/i18n/dicionario.ts
git commit -m "feat(propostas): seção 'Propostas' no dossiê do negócio (N1)"
```

---

### Task 4: Schema — `crm_proposals.retorno_id` + knob de follow-up padrão (N2)

**Files:**
- Create: `supabase/migrations/<timestamp>_0404_c5_followup_e_orcamento.sql`
  (confira `pnpm checar:colisao-de-migration` antes de nomear)
- Modify: `supabase/baseline.sql`
- Modify: `supabase/migrations/MANIFEST.md`

**Interfaces:**
- Produces: `crm_proposals.retorno_id uuid references cron_jobs(id) on delete set null`
  — guarda o id do retorno agendado no envio, para o cancelamento em
  `decide/route.ts` (Task 6) saber o que desmarcar.
- Consumes: nada.

- [ ] **Step 1: Escrever o SQL**

```sql
-- 0404 — Onda E1 (N2): a proposta ENVIADA agenda um retorno automático
-- (lib/followup/retorno-crm.ts). Precisamos guardar QUAL retorno, para
-- cancelá-lo se o cliente decidir (aceita/recusada) antes da data marcada —
-- senão o follow-up dispara sozinho para uma proposta já resolvida.
alter table public.crm_proposals add column if not exists retorno_id uuid
  references public.cron_jobs(id) on delete set null;
comment on column public.crm_proposals.retorno_id is
  'N2: id do retorno automático agendado ao enviar (cron_jobs). NULL = nenhum agendado (falha ao agendar não bloqueia o envio) ou já cancelado/disparado.';

notify pgrst, 'reload schema';
```

Confira, antes de escrever este arquivo, se `cron_jobs` é mesmo o nome da
tabela que guarda os retornos (a medição indicou que `agendaRetornoNoCrm`
grava ali via `criaRetornoDbSupabase` — confirme lendo
`lib/followup/retorno-crm.ts`/`lib/followup/retorno.ts` na função que
efetivamente faz o INSERT, e ajuste o nome da tabela referenciada no FK se
divergir do que está medido acima).

- [ ] **Step 2: Apêndice no `baseline.sql` + MANIFEST**

Mesma técnica das ondas anteriores (marcador
`-- ---- E1: followup automatico ao enviar (migration 0404) ----`, antes de
`-- ---- VARREDURA anon`, script Python com `newline="\n"` explícito).
Adicione a linha em `MANIFEST.md`.

- [ ] **Step 3: Verificar**

Run: `pnpm typecheck` → 0 erros.
Run: `pnpm checar:colisao-de-migration` → sem colisão.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*0404*.sql supabase/baseline.sql supabase/migrations/MANIFEST.md
git commit -m "feat(db): crm_proposals.retorno_id — guarda o follow-up automático do envio (N2)"
```

---

### Task 5: knob "dias para o follow-up automático" em Configurações › Propostas (N2)

**Files:**
- Modify: `app/api/v1/settings/proposals/route.ts`
- Modify: `app/api/v1/settings/proposals/route.test.ts`
- Modify: `lib/propostas/padroes-da-organizacao.ts` (ganha `followupDias`)
- Modify: `lib/propostas/padroes-da-organizacao.test.ts`

**Interfaces:**
- Produces: `resolverPadroesDaProposta` devolve também `followupDias: number`
  (default 3, nunca maior que a validade — a spec pede "nunca depois da
  validade"; a trava exata de "nunca depois" é aplicada no PONTO DE USO —
  Task 6 —, porque só lá se sabe a validade DAQUELA proposta).
- Consumes: nada novo.

- [ ] **Step 1: Escrever os testes de `padroes-da-organizacao.ts` (falhando)**

```typescript
  it("followup_dias ausente: default 3", () => {
    expect(resolverPadroesDaProposta(null).followupDias).toBe(3);
  });

  it("followup_dias configurado: usa o valor", () => {
    expect(resolverPadroesDaProposta({ proposals: { followup_dias: 7 } }).followupDias).toBe(7);
  });

  it("followup_dias inválido (negativo/string): degrada para o default", () => {
    expect(resolverPadroesDaProposta({ proposals: { followup_dias: -1 } }).followupDias).toBe(3);
    expect(resolverPadroesDaProposta({ proposals: { followup_dias: "sete" } }).followupDias).toBe(3);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run lib/propostas/padroes-da-organizacao.test.ts`
Expected: FAIL — `followupDias` não existe no retorno.

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/padroes-da-organizacao.ts
const PADRAO_DIAS_DE_VALIDADE = 15;
const PADRAO_DIAS_DE_FOLLOWUP = 3;

export interface PadroesDaProposta {
  defaultValidDays: number;
  defaultConditions: string | null;
  followupDias: number;
}

export function resolverPadroesDaProposta(settings: unknown): PadroesDaProposta {
  const propostas = objeto(objeto(settings)?.proposals);
  const dias = propostas?.default_valid_days;
  const condicoes = propostas?.default_conditions;
  const followup = propostas?.followup_dias;
  return {
    defaultValidDays: typeof dias === "number" && dias > 0 ? dias : PADRAO_DIAS_DE_VALIDADE,
    defaultConditions: typeof condicoes === "string" ? condicoes : null,
    followupDias: typeof followup === "number" && followup > 0 ? followup : PADRAO_DIAS_DE_FOLLOWUP,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run lib/propostas/padroes-da-organizacao.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Expor na rota de settings**

Em `app/api/v1/settings/proposals/route.ts`, troque:

```typescript
const patchSchema = z.object({
  enabled: z.boolean(),
  default_valid_days: z.number().int().positive().max(365),
  default_conditions: z.string().max(4000).nullable(),
});
```

por:

```typescript
const patchSchema = z.object({
  enabled: z.boolean(),
  default_valid_days: z.number().int().positive().max(365),
  default_conditions: z.string().max(4000).nullable(),
  followup_dias: z.number().int().positive().max(365),
});
```

E no fallback do `GET`:

```typescript
  const proposals = (data?.settings as Record<string, unknown> | null)?.proposals ?? {
    enabled: false, default_valid_days: 15, default_conditions: null, followup_dias: 3,
  };
```

Escreva o teste (falhando antes, passando depois) de PATCH gravando
`followup_dias` e do GET devolvendo o default `3` quando ausente.

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pnpm vitest run app/api/v1/settings/proposals/route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/propostas/padroes-da-organizacao.ts lib/propostas/padroes-da-organizacao.test.ts "app/api/v1/settings/proposals/route.ts" "app/api/v1/settings/proposals/route.test.ts"
git commit -m "feat(propostas): knob de dias para o follow-up automático em Configurações (N2)"
```

---

### Task 6: `send/route.ts` agenda o follow-up; `decide/route.ts` cancela (N2)

**Files:**
- Modify: `app/api/v1/proposals/[id]/send/route.ts`
- Modify: `app/api/v1/proposals/[id]/send/route.test.ts`
- Modify: `app/api/v1/proposals/[id]/decide/route.ts`
- Modify: `app/api/v1/proposals/[id]/decide/route.test.ts`

**Interfaces:**
- Consumes: `agendaRetornoNoCrm`/`cancelaRetornoNoCrm`
  (`lib/followup/retorno-crm.ts`, já existentes), `buscarPadroesDaOrganizacao`
  (já existente, agora também devolve `followupDias`).
- Produces: nada para outras tasks.

- [ ] **Step 1: Escrever os testes que faltam em `send/route.test.ts` (falhando)**

```typescript
  it("proposta enviada com sucesso: agenda o retorno automático em N dias e grava retorno_id (N2)", async () => {
    // mock agendaRetornoNoCrm devolvendo { ok: true, retorno: { id: "retorno-1", quando: "..." } }
    const res = await POST(new Request("http://x") as never, ctxComId(PROPOSTA_ID));
    expect(res.status).toBe(200);
    expect(mockAgendaRetornoNoCrm).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1" }),
      { leadId: LEAD_ID },
      expect.objectContaining({ motivo: expect.stringContaining("retomar a proposta") }),
    );
    expect(mockUpdateCrmProposals).toHaveBeenCalledWith(expect.objectContaining({ retorno_id: "retorno-1" }));
  });

  it("agendamento recusado por 'ja_existe_retorno': NÃO é erro — o envio segue normalmente, sem gravar retorno_id", async () => {
    // mock agendaRetornoNoCrm devolvendo { ok: false, codigo: "ja_existe_retorno" }
    const res = await POST(new Request("http://x") as never, ctxComId(PROPOSTA_ID));
    expect(res.status).toBe(200); // o envio não falha por causa disso
  });

  it("agendamento fora da janela ('instante_fora_da_janela') OU sem lead/contato: envio segue, log/timeline registra que não agendou, nunca em silêncio total nem lançando", async () => {
    // mock agendaRetornoNoCrm devolvendo { ok: false, codigo: "instante_fora_da_janela" }
    const res = await POST(new Request("http://x") as never, ctxComId(PROPOSTA_ID));
    expect(res.status).toBe(200);
  });

  it("proposta órfã (lead_id nulo, D10): não tenta agendar retorno (não há negócio para retomar)", async () => {
    // mock proposta.lead_id = null
    const res = await POST(new Request("http://x") as never, ctxComId(PROPOSTA_ID));
    expect(res.status).toBe(200);
    expect(mockAgendaRetornoNoCrm).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run "app/api/v1/proposals/[id]/send/route.test.ts"`
Expected: FAIL nos 4 casos novos.

- [ ] **Step 3: Implementar em `send/route.ts`**

Adicione os imports:

```typescript
import { agendaRetornoNoCrm } from "@/lib/followup/retorno-crm";
import { buscarPadroesDaOrganizacao } from "@/lib/propostas/padroes-da-organizacao";
```

**Sem import de fuso aqui de propósito** (ajuste desta revisão: a versão
anterior deste step importava `somarDiasNoFuso`/`fusoDaOrganizacao` e nunca
os chamava — `no-unused-vars` reprovaria o lint). "Retomar em N dias" é um
deslocamento RELATIVO a partir de agora (`Date.now() + N dias`), que dá a
mesma hora-do-relógio N dias depois **em qualquer fuso** — não precisa
converter nada. O módulo de fuso da C4 (`lib/propostas/data-no-fuso.ts`, já
mesclado nesta branch) só importa quando a conta é "que dia é hoje/que ano é
este NO FUSO da organização" (numeração, vencimento) — não é o caso aqui.

Dentro do `if (proposta.lead_id) { ... }` já existente (depois dos dois
`emitLeadActivity`, antes do `void audit(...)` final — releia o trecho
medido para confirmar a posição exata), adicione:

```typescript
    // N2 — ao enviar, agenda o retorno automático (nunca bloqueia o envio:
    // qualquer recusa/erro do agendamento é fire-and-forget).
    const padroes = await buscarPadroesDaOrganizacao(admin, authz.org.orgId);
    const promessa = `Retomar a proposta ${numeroEAno.numero}/${numeroEAno.ano}`;
    const prometidoPara = new Date(Date.now() + padroes.followupDias * 24 * 60 * 60 * 1000).toISOString();
    // nunca depois da validade da proposta.
    const dentroDaValidade = !propostaAlvo.valid_until || prometidoPara.slice(0, 10) <= propostaAlvo.valid_until;
    if (dentroDaValidade) {
      const resultado = await agendaRetornoNoCrm(
        { admin, orgId: authz.org.orgId, actor: { type: "api_token", id: "proposal:send" } },
        { leadId: proposta.lead_id },
        { motivo: promessa, prometidoPara, promessa },
      );
      if (resultado.ok) {
        await admin.from("crm_proposals").update({ retorno_id: resultado.retorno.id }).eq("organization_id", authz.org.orgId).eq("id", propostaAlvo.id);
      }
      // `ja_existe_retorno`/`instante_fora_da_janela`/qualquer outra recusa:
      // o negócio já tem retorno (serve) ou a janela não fechou — nenhum dos
      // dois é erro do envio. Não loga como falha; `agendaRetornoNoCrm` já
      // registra a atividade própria quando tem sucesso.
    }
```

**Atualização desta revisão**: a C4 já está mesclada nesta branch (fix pass
`ac9015b95`) — `send/route.ts` já importa `marcaDaOrganizacaoParaPdf` e já
monta `numeroEAno` como no trecho acima; o bloco `if (proposta.lead_id)`
onde este step insere código é o mesmo, sem conflito. Não há mais ordem a
reconciliar.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run "app/api/v1/proposals/[id]/send/route.test.ts"`
Expected: PASS (novos + pré-existentes).

- [ ] **Step 5: Escrever os testes de `decide/route.test.ts` que faltam (falhando)**

```typescript
  it("decidir aceita/recusada: CANCELA o retorno automático quando a proposta tinha um agendado (N2)", async () => {
    // mock proposta.retorno_id = "retorno-1" (SELECT do UPDATE precisa devolver essa coluna também)
    const res = await POST(montarRequest({ decisao: "aceita" }), ctxComId(PROPOSTA_ID));
    expect(res.status).toBe(200);
    expect(mockCancelaRetornoNoCrm).toHaveBeenCalledWith(expect.anything(), "retorno-1", expect.objectContaining({ motivo: expect.any(String) }));
  });

  it("proposta sem retorno_id (nunca teve, ou falhou ao agendar): não tenta cancelar, não lança", async () => {
    // mock proposta.retorno_id = null
    const res = await POST(montarRequest({ decisao: "recusada" }), ctxComId(PROPOSTA_ID));
    expect(res.status).toBe(200);
    expect(mockCancelaRetornoNoCrm).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `pnpm vitest run "app/api/v1/proposals/[id]/decide/route.test.ts"`
Expected: FAIL nos 2 casos novos.

- [ ] **Step 7: Implementar em `decide/route.ts`**

Adicione `retorno_id` ao `.select(...)` do `.update(...)` existente (hoje
`select("id, lead_id, contact_id")` — vira
`select("id, lead_id, contact_id, retorno_id")`), e depois do bloco
`if (proposta.lead_id) { ... emitLeadActivity ... }`, adicione:

```typescript
  if (proposta.retorno_id) {
    await cancelaRetornoNoCrm(
      { admin: supabase, orgId: authz.org.orgId, actor: { type: "user", id: authz.user.id } },
      proposta.retorno_id,
      { motivo: `Proposta ${parsed.data.decisao} — retorno automático não é mais necessário` },
    );
  }
```

Adicione o import: `import { cancelaRetornoNoCrm } from "@/lib/followup/retorno-crm";`.

(confira se `decide/route.ts` usa `admin`/`createAdminClient()` ou
`supabase`/`createClient()` — a medição mostrou `supabase`; ajuste o nome da
variável no `deps.admin` da chamada acima para o cliente que a rota
realmente usa.)

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `pnpm vitest run "app/api/v1/proposals/[id]/decide/route.test.ts"`
Expected: PASS (novos + pré-existentes).

- [ ] **Step 9: Commit**

```bash
git add "app/api/v1/proposals/[id]/send/route.ts" "app/api/v1/proposals/[id]/send/route.test.ts" "app/api/v1/proposals/[id]/decide/route.ts" "app/api/v1/proposals/[id]/decide/route.test.ts"
git commit -m "feat(propostas): envio agenda follow-up automático; decidir cancela (N2)"
```

---

### Task 7: Radar de Risco — proposta vencida sem retomada (N3)

**Files:**
- Modify: `lib/leads/radar-de-risco.ts`
- Modify: `lib/leads/radar-de-risco.test.ts`

**Interfaces:**
- Produces: `RadarDeRisco` ganha uma lista paralela nova
  `propostas_vencidas_sem_retomada: PropostaVencidaSemRetomada[]` (mesmo
  padrão estrutural de `sem_proximo_passo`, que já é uma lista paralela, não
  misturada em `items`).
- Consumes: nada novo.

- [ ] **Step 1: Escrever os testes (falhando)**

Leia o arquivo de teste existente inteiro primeiro (para replicar o padrão
de mock de banco já usado nele — provavelmente um builder de query fake
específico deste arquivo). Adicione:

```typescript
  it("negócio com proposta VENCIDA e SEM proposta mais nova: entra em propostas_vencidas_sem_retomada", async () => {
    // mock crm_proposals: uma linha { lead_id: "lead-1", status: "vencida", numero: 1, ano: 2026, valid_until: "2026-01-01" }
    const radar = await carregaRadarDeRisco(admin, opts);
    expect(radar.propostas_vencidas_sem_retomada.map((p) => p.lead_id)).toContain("lead-1");
  });

  it("negócio com proposta vencida MAS já tem proposta mais nova enviada/aceita: NÃO entra (Review Focus 2)", async () => {
    // mock crm_proposals: duas linhas do mesmo lead_id — uma vencida (versao 1), outra enviada (versao 2, mais nova)
    const radar = await carregaRadarDeRisco(admin, opts);
    expect(radar.propostas_vencidas_sem_retomada.map((p) => p.lead_id)).not.toContain("lead-1");
  });

  it("todas as consultas filtram organization_id (isolamento)", async () => {
    // confirme, inspecionando os args do mock de .eq("organization_id", ...), que a query nova também filtra
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run lib/leads/radar-de-risco.test.ts`
Expected: FAIL — `propostas_vencidas_sem_retomada` não existe no retorno.

- [ ] **Step 3: Implementar**

Adicione a interface e o campo ao tipo de retorno:

```typescript
export interface PropostaVencidaSemRetomada {
  lead_id: string;
  proposal_id: string;
  numero: number | null;
  ano: number | null;
  valid_until: string | null;
}

export interface RadarDeRisco {
  items: AtRiskLead[];
  counts: { critico: number; em_risco: number; em_voo: number };
  total: number;
  sem_proximo_passo: DemandaSemProximoPasso[];
  total_sem_proximo_passo: number;
  propostas_vencidas_sem_retomada: PropostaVencidaSemRetomada[];
}
```

Dentro de `carregaRadarDeRisco`, no mesmo lugar em que `sem_proximo_passo` é
montado (uma consulta paralela, sem misturar com `items`), adicione:

```typescript
  const { data: todasAsPropostas } = await admin
    .from("crm_proposals")
    .select("id, lead_id, status, numero, ano, valid_until, versao, created_at")
    .eq("organization_id", organizationId)
    .not("lead_id", "is", null)
    .order("lead_id", { ascending: true })
    .order("versao", { ascending: false });

  const maisRecentePorLead = new Map<string, (typeof todasAsPropostas)[number]>();
  for (const p of todasAsPropostas ?? []) {
    // já ordenado por versao desc — a primeira ocorrência de cada lead_id É a mais recente.
    if (!maisRecentePorLead.has(p.lead_id as string)) maisRecentePorLead.set(p.lead_id as string, p);
  }
  const propostas_vencidas_sem_retomada: PropostaVencidaSemRetomada[] = [...maisRecentePorLead.values()]
    .filter((p) => p.status === "vencida")
    .map((p) => ({ lead_id: p.lead_id as string, proposal_id: p.id as string, numero: p.numero as number | null, ano: p.ano as number | null, valid_until: p.valid_until as string | null }));
```

E inclua `propostas_vencidas_sem_retomada` no objeto de retorno da função.

**Nota de correção do teste do Step 3 (Review Focus 2):** "a mais nova" aqui
é decidida por `versao` desc, não por `created_at` — duas linhas do mesmo
`lead_id` só coexistem hoje quando são da MESMA cadeia (v1/v2 da D4), então
`versao` é a régua certa. Se a organização tiver duas propostas
INDEPENDENTES para o mesmo negócio (ex.: negócio reaberto depois de
cancelado), ambas têm `versao: 1` e a ordenação secundária por
`created_at desc` (adicione ao `.order(...)` acima) desempata para a mais
recente por data.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run lib/leads/radar-de-risco.test.ts`
Expected: PASS (novos + pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add lib/leads/radar-de-risco.ts lib/leads/radar-de-risco.test.ts
git commit -m "feat(propostas): Radar de Risco ganha 'proposta vencida sem retomada' (N3)"
```

---

### Task 8: UI do Radar de Risco mostra a lista nova (N3)

**Files:**
- Modify: o componente/tela que já renderiza `sem_proximo_passo` (localize
  via `grep -rln "sem_proximo_passo" app/ components/` antes de editar — não
  medido nesta rodada de exploração; leia o arquivo encontrado e replique
  exatamente o padrão visual já usado para a lista paralela existente)
- Modify: o arquivo de teste correspondente
- Modify: `lib/i18n/dicionario.ts` se strings novas entrarem

**Interfaces:**
- Consumes: `radar.propostas_vencidas_sem_retomada` (Task 7).

- [ ] **Step 1: Localizar o consumidor de UI**

```bash
grep -rln "sem_proximo_passo" app/ components/
```

Leia o arquivo encontrado inteiro. Se ele renderiza `sem_proximo_passo` como
uma seção/lista com título e itens clicáveis, replique a MESMA estrutura
para `propostas_vencidas_sem_retomada` (título "Propostas vencidas sem
retomada", cada item linkando para `/app/proposals/{proposal_id}`).

- [ ] **Step 2: Escrever o teste (falhando)**

Adapte ao padrão de teste já existente naquele arquivo — um caso mostrando a
seção nova quando a lista vem populada, outro escondendo-a quando vazia.

- [ ] **Step 3: Rodar e confirmar que falha, implementar, rodar de novo**

Siga o ciclo RED-GREEN normal.

- [ ] **Step 4: Commit**

```bash
git add -A -- <arquivos tocados nesta task>
git commit -m "feat(propostas): tela do Radar de Risco mostra propostas vencidas sem retomada (N3)"
```

---

### Task 9: `GET /api/v1/proposals/[id]` devolve o drift de preço do catálogo (N4)

**Files:**
- Modify: `app/api/v1/proposals/[id]/route.ts` (GET)
- Modify: `app/api/v1/proposals/[id]/route.test.ts`

**Interfaces:**
- Produces: cada item devolvido pelo GET ganha
  `preco_catalogo_atual_cents: number | null` (só preenchido quando
  `product_id` não é nulo; `null` para item manual OU produto apagado).
- Consumes: `catalog_products.preco_cents` (leitura direta, sem helper novo
  — é só um SELECT extra).

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
  it("item de catálogo cujo preço MUDOU desde que foi adicionado: devolve preco_catalogo_atual_cents diferente do gravado (N4)", async () => {
    // mock: item.preco_unitario_cents = 5000 (gravado), catalog_products.preco_cents ATUAL = 6000
    const res = await GET(new Request("http://x") as never, ctxComId(PROPOSTA_ID));
    const body = await res.json();
    const item = body.data.itens.find((i: { product_id: string | null }) => i.product_id !== null);
    expect(item.preco_catalogo_atual_cents).toBe(6000);
  });

  it("item de catálogo cujo preço NÃO mudou: preco_catalogo_atual_cents igual ao gravado", async () => {
    // mock: os dois valores iguais
    const res = await GET(new Request("http://x") as never, ctxComId(PROPOSTA_ID));
    const body = await res.json();
    const item = body.data.itens.find((i: { product_id: string | null }) => i.product_id !== null);
    expect(item.preco_catalogo_atual_cents).toBe(item.preco_unitario_cents);
  });

  it("item MANUAL (sem product_id): preco_catalogo_atual_cents é null, nunca compara com nada (Review Focus 4)", async () => {
    const res = await GET(new Request("http://x") as never, ctxComId(PROPOSTA_ID));
    const body = await res.json();
    const item = body.data.itens.find((i: { product_id: string | null }) => i.product_id === null);
    expect(item.preco_catalogo_atual_cents).toBeNull();
  });

  it("produto do catálogo foi APAGADO desde então: preco_catalogo_atual_cents é null, não quebra", async () => {
    // mock: catalog_products SELECT não devolve linha para aquele product_id
    const res = await GET(new Request("http://x") as never, ctxComId(PROPOSTA_ID));
    expect(res.status).toBe(200);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run "app/api/v1/proposals/[id]/route.test.ts"`
Expected: FAIL nos 4 casos novos.

- [ ] **Step 3: Implementar**

Depois do SELECT de `itens` já existente no `GET`:

```typescript
  const idsDeProduto = [...new Set((itens ?? []).map((it) => it.product_id).filter((id): id is string => id !== null))];
  const precoAtualPorProduto = new Map<string, number>();
  if (idsDeProduto.length > 0) {
    const { data: produtos } = await supabase
      .from("catalog_products")
      .select("id, preco_cents")
      .eq("organization_id", authz.org.orgId)
      .in("id", idsDeProduto);
    for (const p of (produtos ?? []) as Array<{ id: string; preco_cents: number }>) {
      precoAtualPorProduto.set(p.id, p.preco_cents);
    }
  }
  const itensComDrift = (itens ?? []).map((it) => ({
    ...it,
    preco_catalogo_atual_cents: it.product_id ? (precoAtualPorProduto.get(it.product_id) ?? null) : null,
  }));

  return ok({ ...proposta, itens: itensComDrift }, { requestId });
```

(remova o `return ok({ ...proposta, itens: itens ?? [] }, ...)` anterior —
esse `return` é substituído pelo de cima.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run "app/api/v1/proposals/[id]/route.test.ts"`
Expected: PASS (novos + pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/proposals/[id]/route.ts" "app/api/v1/proposals/[id]/route.test.ts"
git commit -m "feat(propostas): GET devolve o preço ATUAL do catálogo junto do item, para detectar drift (N4)"
```

---

### Task 10: UI mostra a faixa "o preço de N itens mudou" (N4)

**Files:**
- Modify: `app/app/proposals/[id]/_client.tsx`
- Modify: `app/app/proposals/[id]/_client.test.tsx`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: `preco_catalogo_atual_cents` (Task 9).

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
  it("item com preço de catálogo desatualizado: mostra a faixa de aviso com 'Atualizar preços' e 'Manter'", async () => {
    // mock GET devolvendo um item com preco_unitario_cents=5000, preco_catalogo_atual_cents=6000, product_id não-nulo
    render(<ProposalClient id="prop-1" />);
    expect(await screen.findByText(/o preço de 1 item mudou no catálogo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /atualizar preços/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manter/i })).toBeInTheDocument();
  });

  it("clicar 'Atualizar preços': troca o preco_unitario_cents do item pelo valor atual do catálogo, localmente (não salva sozinho)", async () => {
    render(<ProposalClient id="prop-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /atualizar preços/i }));
    // confira que o input de preço do item passou a mostrar o valor NOVO (6000/100 = 60,00)
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
  });

  it("nenhum item com drift: não mostra a faixa", async () => {
    // mock GET com preco_catalogo_atual_cents === preco_unitario_cents em todo item
    render(<ProposalClient id="prop-1" />);
    expect(screen.queryByText(/mudou no catálogo/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run "app/app/proposals/[id]/_client.test.tsx"`
Expected: FAIL nos 3 casos novos.

- [ ] **Step 3: Implementar**

Em `ProposalItem`, adicione o campo:

```typescript
  preco_catalogo_atual_cents?: number | null;
```

Calcule os itens com drift (perto de onde `total` já é calculado):

```typescript
  const itensComDrift = proposta.itens.filter(
    (it) => it.product_id !== null && it.preco_catalogo_atual_cents !== null && it.preco_catalogo_atual_cents !== it.preco_unitario_cents,
  );
```

Adicione a faixa de aviso (antes da tabela de itens, mesmo padrão visual dos
outros banners já existentes neste arquivo — releia como o banner de
`ultima_falha_envio` da C2 é montado e replique classes/estrutura):

```tsx
      {editavel && itensComDrift.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p>{t(`O preço de ${itensComDrift.length} ${itensComDrift.length === 1 ? "item mudou" : "itens mudaram"} no catálogo.`)}</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setProposta((p) =>
                  p && {
                    ...p,
                    itens: p.itens.map((it) =>
                      it.product_id !== null && it.preco_catalogo_atual_cents !== null && it.preco_catalogo_atual_cents !== it.preco_unitario_cents
                        ? { ...it, preco_unitario_cents: it.preco_catalogo_atual_cents }
                        : it,
                    ),
                  },
                );
              }}
            >
              {t("Atualizar preços")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDriftIgnorado(true)}>
              {t("Manter")}
            </Button>
          </div>
        </div>
      )}
```

("Manter" só precisa esconder a faixa nesta sessão de edição — um estado
local `driftIgnorado` (useState, default `false`) que você soma à condição
`itensComDrift.length > 0 && !driftIgnorado`; não precisa persistir nada no
servidor, "Manter" é "não vou atualizar agora", não "nunca mais avise".)

Adicione a mensagem: **"Atualizar preços" só muda o estado LOCAL** — o
usuário ainda precisa clicar "Salvar" (já existente) para persistir. Não
chame `apiClient` diretamente neste botão.

- [ ] **Step 4: Strings no dicionário**

```typescript
  "Atualizar preços": { es: "Actualizar precios" },
  "Manter": { es: "Mantener" },
```

(as mensagens com interpolação de número, ex. "O preço de N itens mudou...",
precisam da chave-PT exata que `t()` recebe em cada chamada — se o padrão do
projeto para strings com contagem variável for diferente do que este plano
escreveu, confira `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` e ajuste a
forma da chamada, não force uma forma que o gate não reconhece.)

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pnpm vitest run "app/app/proposals/[id]/_client.test.tsx"`
Expected: PASS.

Run: `pnpm vitest run tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/app/proposals/[id]/_client.tsx" "app/app/proposals/[id]/_client.test.tsx" lib/i18n/dicionario.ts
git commit -m "feat(propostas): tela avisa quando o preço do catálogo mudou, com Atualizar/Manter (N4)"
```

---

### Task 11: contexto da IA inclui o desfecho da última proposta (N7)

**Files:**
- Modify: `lib/agent-engine/edge/crm/get-lead-context.ts`
- Modify: `lib/agent-engine/edge/crm/get-lead-context.test.ts`

**Interfaces:**
- Produces: `LeadContext` ganha `last_proposal: { status: string; total_cents: number; decision_reason: string | null; numero: number | null; ano: number | null } | null`.
- Consumes: nada novo.

- [ ] **Step 1: Escrever os testes (falhando)**

Leia o arquivo de teste inteiro primeiro (o padrão de mock de `pg.Pool`/query
já estabelecido nele — este arquivo usa `pg` direto, não `supabase-js`,
diferente do resto desta onda; confirme isso lendo o topo do arquivo antes
de escrever qualquer mock). Adicione:

```typescript
  it("negócio com proposta RECUSADA: last_proposal reflete status e motivo (N7)", async () => {
    // mock da query de crm_proposals devolvendo { status: "recusada", total_cents: 50000, decision_reason: "Preço acima do orçamento", numero: 1, ano: 2026 }
    const ctx = await getLeadContext(/* deps mockadas */);
    expect(ctx.last_proposal).toEqual({ status: "recusada", total_cents: 50000, decision_reason: "Preço acima do orçamento", numero: 1, ano: 2026 });
  });

  it("negócio SEM nenhuma proposta com desfecho (só rascunho aberto, ou nenhuma): last_proposal é null (Review Focus 5)", async () => {
    // mock: nenhuma linha com status IN (enviada, aceita, recusada, vencida) — só uma linha rascunho, que a query deve IGNORAR
    const ctx = await getLeadContext(/* deps mockadas */);
    expect(ctx.last_proposal).toBeNull();
  });

  it("query de crm_proposals falha: last_proposal null, o resto do contexto SEGUE montando (falha aberta)", async () => {
    // mock: a query lança/erra
    const ctx = await getLeadContext(/* deps mockadas */);
    expect(ctx.last_proposal).toBeNull();
    expect(ctx.contact).toBeDefined(); // o resto do contexto não foi derrubado
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run lib/agent-engine/edge/crm/get-lead-context.test.ts`
Expected: FAIL — `last_proposal` não existe.

- [ ] **Step 3: Implementar**

Adicione a interface:

```typescript
export interface UltimaProposta {
  status: string;
  total_cents: number;
  decision_reason: string | null;
  numero: number | null;
  ano: number | null;
}
```

E ao `LeadContext`:

```typescript
export interface LeadContext {
  // ...campos existentes...
  last_proposal: UltimaProposta | null;
}
```

Antes do `fitToBudget(...)` final (releia o trecho exato — a medição mostrou
`input.leadId` sendo na verdade o `contact_id`; confirme isso de novo aqui
antes de escrever a query, porque errar essa coluna faz a busca nunca achar
nada, silenciosamente), adicione, dentro de um `try/catch` (falha aberta —
este arquivo já segue esse padrão para `previous_service`/`last_human_decision`,
releia como eles tratam erro e replique a MESMA forma):

```typescript
  let last_proposal: UltimaProposta | null = null;
  try {
    const { rows } = await deps.db.query<UltimaProposta>(
      `select status, total_cents, decision_reason, numero, ano
         from crm_proposals
        where organization_id = $1 and contact_id = $2
          and status in ('enviada', 'aceita', 'recusada', 'vencida')
        order by created_at desc
        limit 1`,
      [organizationId, input.leadId],
    );
    last_proposal = rows[0] ?? null;
  } catch (err) {
    deps.log?.warn('lead-context: consulta de proposta falhou — contexto segue sem ela', { error: normalizarErro(err) });
  }
```

(ajuste `deps.db`/`organizationId`/`normalizarErro` aos nomes REAIS já
usados no restante do arquivo — não invente uma forma nova de acessar o
pool ou de logar erro; o arquivo já tem um padrão estabelecido para as
outras duas queries opcionais, releia-o e copie exatamente.)

E inclua `last_proposal` no objeto passado a `fitToBudget(...)`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run lib/agent-engine/edge/crm/get-lead-context.test.ts`
Expected: PASS (novos + pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add lib/agent-engine/edge/crm/get-lead-context.ts lib/agent-engine/edge/crm/get-lead-context.test.ts
git commit -m "feat(propostas): contexto do agente inclui o desfecho da última proposta (N7)"
```

---

### Task 12 — a mais arriscada: assistente nasce desabilitado com motivo, antes do clique (N5)

> **Aviso antes de começar**: a medição para esta task não conseguiu
> confirmar com certeza total a assinatura/grants da função de banco
> `fn_gasto_de_ia_do_mes` nem se ela é chamável via `db.rpc(...)` do
> `supabase-js` a partir de uma rota Next (o caminho medido usa `pg.Pool`
> direto, dentro do motor). **Antes de escrever qualquer código desta task**,
> confirme na fonte:
> ```bash
> grep -n "fn_gasto_de_ia_do_mes" supabase/baseline.sql | tail -5
> psql "$SUPABASE_DB_URL" -c "select grantee, privilege_type from information_schema.role_routine_grants where routine_name = 'fn_gasto_de_ia_do_mes';"
> ```
> Se a função não tiver `EXECUTE` liberado para o papel que a rota Next usa
> (`authenticated`/`service_role`, conforme a rota chamar com client de
> usuário ou admin), a Task precisa de uma migration extra concedendo
> `EXECUTE` — siga a doutrina de migrations (item 9: função nova/grant
> alterado também é mudança de schema, mesma tripla). Se não for chamável de
> jeito nenhum sem reescrever a query, **pare e registre uma Ruling**:
> implementar N5 com uma versão mais simples (ex.: só checar
> `ai_budgets.enforcement_mode = 'hard'` e o teto/gasto SEM o refinamento de
> `avisado_antes`/aviso na Central) é aceitável — a spec já marca N5 como
> **baixa prioridade**, e uma versão mais simples que não lança é melhor que
> nenhuma.

**Files:**
- Create: `lib/propostas/orcamento-de-ia-disponivel.ts`
- Create: `lib/propostas/orcamento-de-ia-disponivel.test.ts`
- Create: `app/api/v1/proposals/[id]/assistant/disponibilidade/route.ts`
- Create: `app/api/v1/proposals/[id]/assistant/disponibilidade/route.test.ts`
- Modify: `app/app/proposals/[id]/_components/AssistantPanel.tsx` (ou onde
  quer que o campo de instrução do assistente esteja — confirme o caminho
  exato, a medição não leu este arquivo)
- Modify: o teste correspondente
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Produces: `orcamentoDeIaDisponivel(db, organizationId): Promise<{ disponivel: boolean; motivo: string | null }>`
  (nunca lança — falha aberta, mesma régua de `aplicarOrcamento`); rota
  `GET .../assistant/disponibilidade` devolvendo o mesmo formato.
- Consumes: `decidirOrcamento` (`lib/agent-engine/edge/llm/orcamento.ts`, já
  existente, PURA — reaproveitada, não reescrita).

- [ ] **Step 1: Escrever os testes de `orcamento-de-ia-disponivel.ts` (falhando)**

```typescript
// lib/propostas/orcamento-de-ia-disponivel.test.ts
import { describe, expect, it, vi } from "vitest";
import { orcamentoDeIaDisponivel } from "./orcamento-de-ia-disponivel";

describe("orcamentoDeIaDisponivel", () => {
  it("modo 'off' ou sem linha em ai_budgets: sempre disponível", async () => {
    const db = montarSupabaseSemOrcamento(); // helper local: ai_budgets SELECT devolve null
    expect(await orcamentoDeIaDisponivel(db, "org-1")).toEqual({ disponivel: true, motivo: null });
  });

  it("gasto abaixo do teto: disponível", async () => {
    const db = montarSupabaseComOrcamento({ enforcement_mode: "hard", monthly_limit_cents: 10000, gasto: 5000 });
    expect(await orcamentoDeIaDisponivel(db, "org-1")).toEqual({ disponivel: true, motivo: null });
  });

  it("gasto ACIMA do teto com enforcement 'hard': indisponível, com motivo legível para leigo", async () => {
    const db = montarSupabaseComOrcamento({ enforcement_mode: "hard", monthly_limit_cents: 10000, gasto: 15000 });
    const r = await orcamentoDeIaDisponivel(db, "org-1");
    expect(r.disponivel).toBe(false);
    expect(r.motivo).toBeTruthy();
  });

  it("erro ao consultar (banco fora, RLS): degrada para DISPONÍVEL, nunca lança (falha aberta)", async () => {
    const db = montarSupabaseComErro();
    await expect(orcamentoDeIaDisponivel(db, "org-1")).resolves.toEqual({ disponivel: true, motivo: null });
  });
});
```

(escreva os helpers `montarSupabaseSemOrcamento`/`montarSupabaseComOrcamento`/
`montarSupabaseComErro` mockando `db.from("ai_budgets").select(...)` e a
chamada de gasto — `db.rpc("fn_gasto_de_ia_do_mes", ...)` ou o SELECT que a
verificação do Step 0 confirmou ser viável.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run lib/propostas/orcamento-de-ia-disponivel.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar (ajuste a consulta de gasto ao que o Step 0 confirmou)**

```typescript
// lib/propostas/orcamento-de-ia-disponivel.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { decidirOrcamento, normalizarModoDeOrcamento } from "@/lib/agent-engine/edge/llm/orcamento";

export interface OrcamentoDeIaDisponivel {
  disponivel: boolean;
  motivo: string | null;
}

/**
 * N5 — checagem SÓ DE LEITURA (nunca abre aviso na Central; isso só
 * acontece no caminho real de chamada de modelo, `aplicarOrcamento`,
 * lib/agent-engine/edge/llm/run-model-call.ts). Reusa a MESMA regra pura
 * (`decidirOrcamento`) para nunca divergir do que vai acontecer de verdade
 * se a pessoa tentar usar o assistente.
 *
 * Falha aberta: erro de leitura nunca bloqueia a tela — degrada para
 * "disponível", igual a `aplicarOrcamento`.
 */
export async function orcamentoDeIaDisponivel(
  db: SupabaseClient,
  organizationId: string,
): Promise<OrcamentoDeIaDisponivel> {
  try {
    const { data: orcamento } = await db
      .from("ai_budgets")
      .select("monthly_limit_cents, enforcement_mode, enforcement_effective_at, alarm_threshold_pct")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!orcamento) return { disponivel: true, motivo: null };

    const { data: gasto } = await db.rpc("fn_gasto_de_ia_do_mes", { organization_id: organizationId });

    const veredito = decidirOrcamento({
      modo: normalizarModoDeOrcamento(orcamento.enforcement_mode),
      tetoCents: orcamento.monthly_limit_cents ?? 0,
      gastoCents: Number(gasto ?? 0),
      efetivoEm: orcamento.enforcement_effective_at ?? null,
      agora: new Date(),
      purpose: "proposal_assistant",
      chave: "on",
      limiarPct: orcamento.alarm_threshold_pct ?? 80,
      avisadoNesteMes: false,
    });

    if (veredito.acao === "bloquear") {
      return {
        disponivel: false,
        motivo: "O orçamento mensal de IA desta organização foi atingido. Ajuste o limite em Uso de IA › Orçamento, ou aguarde a virada do mês.",
      };
    }
    return { disponivel: true, motivo: null };
  } catch {
    return { disponivel: true, motivo: null };
  }
}
```

**Confira os nomes exatos** `normalizarModoDeOrcamento`, o formato de
`veredito.acao` (`"seguir" | "avisar_e_seguir" | "bloquear"` — a medição
mostrou os dois primeiros; confirme o terceiro lendo
`lib/agent-engine/edge/llm/orcamento.ts` inteiro antes de codar, a medição
não leu a função até o fim) e o nome do parâmetro RPC de
`fn_gasto_de_ia_do_mes` (a medição só mostrou `select public.fn_gasto_de_ia_do_mes($1)`
posicional — o nome do parâmetro nomeado que o `supabase-js` `.rpc()` exige
pode ser diferente de `organization_id`; confirme com
`\df+ fn_gasto_de_ia_do_mes` no psql ou lendo a definição no baseline).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run lib/propostas/orcamento-de-ia-disponivel.test.ts`
Expected: PASS (todos, ajustados ao que o Step 0/3 confirmaram).

- [ ] **Step 5: Nova rota `GET .../assistant/disponibilidade`**

```typescript
// app/api/v1/proposals/[id]/assistant/disponibilidade/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { orcamentoDeIaDisponivel } from "@/lib/propostas/orcamento-de-ia-disponivel";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { sePropostasDesligadas } from "@/lib/propostas/porta";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: proposta } = await supabase
    .from("crm_proposals")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  const resultado = await orcamentoDeIaDisponivel(supabase, authz.org.orgId);
  return ok(resultado, { requestId });
}
```

Escreva o teste correspondente (disponível/indisponível/proposta não
encontrada/papel insuficiente), no mesmo padrão dos outros arquivos de rota
de propostas.

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pnpm vitest run "app/api/v1/proposals/[id]/assistant/disponibilidade/route.test.ts"`
Expected: PASS.

- [ ] **Step 7: UI — checar ao abrir, campo nasce desabilitado com motivo**

Localize o componente do painel do assistente (o import em
`app/api/v1/proposals/[id]/assistant/route.ts` não aponta para ele — procure
por quem CHAMA `POST .../assistant` na árvore de `app/app/proposals/[id]/`,
provavelmente `_components/AssistantPanel.tsx` ou dentro do próprio
`_client.tsx`). Leia o arquivo inteiro, então adicione um `useEffect` que
chama `GET .../assistant/disponibilidade` ao montar, guarda
`{ disponivel, motivo }` em estado, e desabilita o campo de instrução +
mostra o motivo (texto pequeno, mesmo padrão de aviso já usado no resto do
editor) quando `disponivel === false`. Escreva o teste RED→GREEN
correspondente (campo desabilitado quando o mock devolve indisponível; campo
habilitado no caso contrário).

- [ ] **Step 8: Strings no dicionário**

```typescript
  "O orçamento mensal de IA desta organização foi atingido. Ajuste o limite em Uso de IA › Orçamento, ou aguarde a virada do mês.": { es: "Se alcanzó el presupuesto mensual de IA de esta organización. Ajusta el límite en Uso de IA › Presupuesto, o espera al cambio de mes." },
```

- [ ] **Step 9: Rodar tudo e verificar**

Run: `pnpm typecheck` → 0 erros.
Run: `pnpm vitest run lib/propostas/orcamento-de-ia-disponivel.test.ts "app/api/v1/proposals/[id]/assistant/disponibilidade/route.test.ts"` (+ o arquivo de teste do painel ajustado no Step 7) → PASS.
Run: `pnpm vitest run tests/unit/i18n-espanhol-cobre-a-tela.test.ts` → PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/propostas/orcamento-de-ia-disponivel.ts lib/propostas/orcamento-de-ia-disponivel.test.ts "app/api/v1/proposals/[id]/assistant/disponibilidade" lib/i18n/dicionario.ts <arquivo do painel e seu teste>
git commit -m "feat(propostas): assistente nasce desabilitado com motivo quando não há orçamento de IA (N5)"
```

---

## Verificação final da onda inteira

- [ ] Run: `pnpm typecheck` → 0 erros.
- [ ] Run: `pnpm lint` → 0 avisos.
- [ ] Run: `pnpm test:unit > /tmp/vt-c5.log 2>&1; echo "exit=$?"` → leia o
      RODAPÉ; compare a lista de vermelhos com a lista já conhecida de
      pré-existentes-não-relacionados; qualquer vermelho novo num arquivo
      tocado por esta onda é seu.
- [ ] Run: `pnpm checar:colisao-de-migration` → sem colisão (reconfira, C3/C4
      podem ter avançado em paralelo).

### Autoauditoria (regra 10 — obrigatória, não pule)

Isto não é o mesmo que "os testes passaram". É uma busca deliberada por um
lugar que a Task 1 deveria ter tocado e não tocou — o mesmo tipo de buraco
que a revisão da C3 achou (um consumidor a mais que a medição do plano não
tinha listado). Rode os comandos abaixo, leia CADA linha do resultado (não
só a contagem), e para qualquer ocorrência que NÃO passe pela checagem de
moeda nova, ou pare e conserte, ou registre no relato final por que aquele
caminho está fora do escopo de D11:

```bash
# Todo lugar que grava em crm_proposal_items — cada um passa pela checagem
# de moeda que a Task 1 introduziu em resolverItensDaProposta?
git grep -n 'from("crm_proposal_items")' -- app lib | grep -i insert

# Todo chamador de resolverItensDaProposta recebe e repassa o 4º parâmetro
# (moedaDaProposta) — nenhum ficou com a assinatura antiga?
git grep -n "resolverItensDaProposta(" -- app lib

# A rota /revise (C4) copia itens de uma proposta pra outra — ela também
# precisa respeitar moeda (a v2 herda a moeda da v1, mas se a Task 1 mudou
# a função que ela chama, confirme que a assinatura nova não quebrou o
# revise silenciosamente).
git grep -n "crm_proposal_items" app/api/v1/proposals/\[id\]/revise/route.ts

# N2: todo caminho que chama agendaRetornoNoCrm a partir do envio de
# proposta é fire-and-forget — nenhum pode lançar quando lead_id E
# contact_id são nulos (proposta órfã, D10)?
git grep -n "agendaRetornoNoCrm(" -- app lib

# N3: a consulta do Radar de Risco filtra "sem proposta mais nova
# enviada/aceita" de verdade, ou só filtra vencimento?
git grep -n "vencida" lib/leads/radar-de-risco.ts

# organization_id em toda query nova desta onda (Global Constraints já
# exige isso por task — aqui é a varredura de fechamento):
git grep -n "from(\"crm_proposals\")\|from(\"crm_proposal_items\")" -- app lib | grep -v "organization_id"
```

Cole a saída de cada comando (ou "vazio, nada a reportar") no relato final
que devolve para revisão — um comando rodado sem a saída anexada não conta
como autoauditoria feita.

## Depois de todas as tasks

Não abra PR, não faça push. Pare depois do commit da Task 12 e devolva o
resultado — incluindo qualquer Ruling que a Task 12 (a mais incerta) tenha
exigido, e a saída colada dos comandos de Autoauditoria — para a revisão
final de branch inteira. Um relato sem a autoauditoria colada é tratado como
incompleto.
