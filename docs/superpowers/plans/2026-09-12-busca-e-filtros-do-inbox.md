# Busca e Filtros do Inbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a busca e os quatro filtros do Inbox dizerem a verdade — nenhum filtro em memória, nenhum estado vazio que afirme caixa vazia com conversas existindo, e nenhuma promessa no placeholder que o backend não cumpra.

**Architecture:** Todo filtro da tela passa a ser parâmetro de `listConversationsQuerySchema`, o que o põe automaticamente sob a cerca `tests/unit/rota-le-todo-filtro-do-schema.test.ts` (que deriva as chaves do schema e cobra que a rota as leia). A prop `clientFilter` de `ConversationList` — o mecanismo que permitiu o desvio — é removida. O estado vazio vira dois: um por ausência, outro por filtro.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript estrito · Zod · Supabase/PostgREST · TanStack Query · Vitest · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-busca-e-filtros-do-inbox-design.md`

## Global Constraints

- **Nenhuma tela nova.** Tudo mora dentro de `/app/inbox`. Nada a declarar em `lib/navigation/catalogo.ts` — verificado, não presumido.
- **`/api/v1/` é contrato:** todo parâmetro novo é **opcional**, e `unassigned` continua respondendo ao lado de `fila` (spec D7).
- **Não tocar `termoSeguroParaOr`** (`app/api/v1/conversations/_handler.ts:27-34`). Ela está correta — provado em produção (spec §3). Mexer nela é regressão.
- **Service role filtra `organization_id` manualmente** em toda consulta — já é assim nas duas consultas do handler; manter.
- Copy em pt-BR, para dono de PME. Toda string de tela passa por `t()` (`useT`).
- Zero `console.log` merged. `pnpm typecheck` e `pnpm lint` zerados ao fim de **cada** task.
- **Commits atômicos por task.** A suíte inteira (`pnpm test:unit`, **sem caminho**) roda **uma vez, no fim da fila** — não a cada task.
- **A sabotagem vem DEPOIS do commit, nunca antes.** Commite, reverta **só a linha do conserto** (não o commit), **preveja quantos casos vão cair e quais**, rode, confira a contagem, restaure. `deskcomm-contribuir` passo 5: *"sabotar antes de commitar já custou trabalho perdido aqui mais de uma vez"*. O resultado (`"1 vermelho de N, o previsto"`) vai no corpo do PR.
- **Toda string nova de tela entra em `lib/i18n/dicionario.ts`** — erro nº 11 dos recorrentes (PRs #631, #600): o guardião do espanhol é cego a `t(<variável>)`.
- Fragmento em `.changes/` por item visível a quem opera VPS, **com `Crédito: @paulolimajr77`**; conferir com `pnpm release:conferir`. **Nunca** escrever `## [x.y.z]` no `CHANGELOG.md` — o corte de release é automático (erro nº 3).
- **Migration: a tripla vai no MESMO COMMIT.** O hook `pre-commit` reprova migration nova sem apêndice no `baseline.sql` e sem linha no `MANIFEST.md` no mesmo commit.

---

## File Structure

**Modificar:**

| Arquivo | O que muda |
|---|---|
| `lib/schemas/messaging.ts` | `search` ganha `.trim().min(2)`; nasce `unread` |
| `app/api/v1/conversations/route.ts` | lê `unread` de `searchParams` |
| `app/api/v1/conversations/_handler.ts` | predicado de não-lido; normalização de separadores no termo |
| `hooks/inbox/useConversationsRealtime.ts` | `unread` em `ConversationsFilters` e na querystring |
| `components/inbox/InboxLayout.tsx` | `onlyUnread` entra em `filters`; `clientFilter` sai |
| `components/inbox/ConversationList.tsx` | prop `clientFilter` removida; vazio por filtro |
| `components/inbox/InboxFilters.tsx` | placeholder honesto; debounce só de `search`; contador de Fechadas; órfão de tag |
| `app/api/v1/conversations/counts/route.ts` | aceita filtros auxiliares; devolve `closed`; comentário da linha 69 corrigido |
| `app/api/v1/conversation-tags/route.ts` | união de canônicas + em uso |
| `components/inbox/CRMSidePanel.tsx` | histórico mostra a data |

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `components/inbox/EmptyPorFiltro.tsx` | O vazio que nomeia o filtro ativo e oferece limpá-lo |
| `lib/inbox/termo-de-busca.ts` | `normalizarTermoDeBusca()` — pura, testável sem banco |
| `supabase/migrations/<ts>_0239_tags_de_conversa_em_uso.sql` | `fn_tags_de_conversa_em_uso` |
| `tests/unit/busca-exige-dois-caracteres.test.ts` | T1 |
| `tests/unit/termo-de-busca-tolera-digitacao.test.ts` | T3 |
| `tests/unit/badge-espelha-o-filtro.test.ts` | T6 |
| `tests/unit/debounce-nao-volta-a-aba.test.tsx` | T7 |
| `tests/invariants/nao-lidos-filtra-no-banco.test.ts` | T4 |
| `tests/invariants/tags-em-uso-aparecem-no-filtro.test.ts` | T8 |
| `tests/e2e/inbox-filtros-dizem-a-verdade.spec.ts` | T10 |

---

## Task 0: A âncora, a identidade e os hooks

Não produz código. Produz o **chão** — e é onde a primeira versão deste plano errou: ela mediu o número
da migration no disco desta branch (`0233`) em vez da âncora, e `0234` **já existe** na `origin/main`.

**Files:** nenhum do produto.

- [ ] **Step 1: Quem está contribuindo**

```bash
bash .agents/skills/deskcomm-contribuir/scripts/quem-sou.sh
```

Expected: `contribuidor` (o `origin` é `melgarafael`, e o push sai pelo remote `fork`). Se disser
`mantenedor`, pare — o ritual é outro.

> Esta branch (`vps/pljr-combinada`) **não tem** `.agents/`. Ele vive na `origin/main`. Traga com
> `git archive origin/main .agents | tar -x` num diretório de trabalho, ou rode os comandos à mão.

- [ ] **Step 2: A branch nasce de `origin/main`, nunca daqui**

```bash
git fetch origin
git switch -c fix/busca-e-filtros-do-inbox origin/main
```

`vps/pljr-combinada` é a **planta própria** (jeito 2 do `NOSSA-REGRA.md`) e carrega as personalizações
desta instalação. Abrir PR dela propõe tudo isso ao produto de todo mundo — é o erro nº 2 e nº 4 dos
recorrentes, medido no PR #465: sete arquivos com a marca de um cliente mergeando sem conflito.

- [ ] **Step 3: Arme os hooks (uma vez por clone)**

```bash
bash .agents/skills/deskcomm-contribuir/scripts/armar-hooks.sh
```

`pre-commit` reprova migration sem a tripla e com número/timestamp já usados; `pre-push` reprova push
na `main`; os dois avisam se o commit estiver assinado como `root@…`.

- [ ] **Step 4: Meça o número da migration NA ÂNCORA**

```bash
git ls-tree -r --name-only origin/main -- supabase/migrations   | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1
```

Expected hoje: **`0238`** → a nova é **0239**. Confira também que o timestamp está livre:

```bash
git ls-tree -r --name-only origin/main -- supabase/migrations | grep -c "20260912" # → 0
```

> **Ordene pelo número, nunca pela listagem.** Timestamp e `NNNN` já discordaram neste repo, e um
> contribuidor externo escolheu o número errado seguindo a instrução antiga (issue #285: cinco PRs
> disputando o mesmo `0161` numa rodada).

- [ ] **Step 5: Confira a identidade dos commits**

```bash
git config user.email    # tem de ser a conta do GitHub de quem assina
```

Erro nº 6 dos recorrentes: commit como `root@vps` não aparece no perfil de quem fez (PRs #569-#571).

---

## Task 1: A busca exige 2 caracteres

**Files:**
- Modify: `lib/schemas/messaging.ts:317`
- Test: `tests/unit/busca-exige-dois-caracteres.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `listConversationsQuerySchema` com `search` normalizado (`.trim()`) e mínimo de 2

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { listConversationsQuerySchema } from "@/lib/schemas";

describe("a busca não vai ao banco com 1 caractere", () => {
  it("CONTROLE: termo de 2 caracteres é aceito", () => {
    const r = listConversationsQuerySchema.safeParse({ search: "an" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.search).toBe("an");
  });

  it("termo de 1 caractere é RECUSADO", () => {
    // Medido em produção: ?search=a devolveu a lista inteira. O handler já aplica
    // este raciocínio ao telefone (piso de 4 dígitos); falta aplicá-lo ao texto.
    expect(listConversationsQuerySchema.safeParse({ search: "a" }).success).toBe(false);
  });

  it("espaço em volta não conta como caractere", () => {
    expect(listConversationsQuerySchema.safeParse({ search: " a " }).success).toBe(false);
  });

  it("o termo chega ao handler já aparado", () => {
    const r = listConversationsQuerySchema.safeParse({ search: "  ana  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.search).toBe("ana");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/busca-exige-dois-caracteres.test.ts`
Expected: FAIL — os casos de 1 caractere passam hoje (`search` é `z.string().optional()` sem restrição).

- [ ] **Step 3: Write minimal implementation**

Em `lib/schemas/messaging.ts`, trocar a linha `search: z.string().optional(),` por:

```ts
  /**
   * O termo de busca, com piso de 2 caracteres DEPOIS de aparado.
   *
   * Medido em produção: `?search=a` devolvia a lista inteira — e lista inteira sob
   * busca não é resposta, é ruído que PARECE resposta. O handler já aplica o mesmo
   * raciocínio ao telefone (piso de 4 dígitos, com a justificativa escrita lá).
   */
  search: z.string().trim().min(2).optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/busca-exige-dois-caracteres.test.ts`
Expected: PASS (4 casos)

- [ ] **Step 5: Gates + commit — o commit vem ANTES da sabotagem**

```bash
rm -f tsconfig*.tsbuildinfo; pnpm typecheck; echo exit=$?
pnpm lint; echo exit=$?
pnpm lint:channels; echo exit=$?
git add lib/schemas/messaging.ts tests/unit/busca-exige-dois-caracteres.test.ts
git commit -m "fix(inbox): a busca para de ir ao banco com uma letra só"
```

- [ ] **Step 6: Sabote o que acabou de commitar**

**Preveja antes de rodar:** trocar `.min(2)` por `.min(1)` deve derrubar **2 casos** — "termo de 1
caractere é RECUSADO" e "espaço em volta não conta como caractere". Os outros 2 seguem verdes.

```bash
# reverta SÓ a linha do conserto, nunca o commit
npx vitest run tests/unit/busca-exige-dois-caracteres.test.ts
git checkout -- lib/schemas/messaging.ts
```

Expected: **2 failed de 4**, os previstos. Número diferente = o teste não vigia o que você pensa;
reescreva o teste. Anote "2 vermelhos de 4, o previsto" para o corpo do PR.
---

## Task 2: O placeholder para de prometer o histórico

**Files:**
- Modify: `components/inbox/InboxFilters.tsx:120`

**Interfaces:**
- Consumes: nada
- Produces: nada

Sem teste unitário: é uma string de tela, coberta pela E2E da Task 10. O valor está em parar de mentir hoje (spec D5), enquanto a busca real no histórico é projeto separado.

- [ ] **Step 1: Change the copy**

Em `components/inbox/InboxFilters.tsx`, no `<Input>` da busca:

```tsx
              placeholder={t("Buscar por nome, telefone ou última mensagem…")}
```

E acrescente, logo acima do `<Input>`, o comentário que impede a regressão:

```tsx
            {/* "última mensagem", e não "mensagem": a busca alcança apenas
                `conversations.last_message_preview` — a ÚLTIMA mensagem, truncada em 200
                caracteres (`lib/channels/zernio/ingest.ts:271`). Medido numa conversa real
                de 32 mensagens: buscar o que o cliente pediu na 3ª devolve ZERO. Alcançar o
                histórico é projeto próprio (índice trigram + retenção + LGPD); até lá, a
                tela não promete o que o backend não faz. */}
```

- [ ] **Step 2: Verify in the app**

Run: `pnpm dev` e abra `/app/inbox`. Expected: o campo diz “Buscar por nome, telefone ou última mensagem…”.

- [ ] **Step 3: Gates + fragment + commit**

Crie `.changes/busca-do-inbox-nao-promete-o-historico.md`:

```markdown
---
impacto: nada_mudou
secao: corrigido
titulo: O campo de busca do Inbox passa a dizer o que realmente procura
---

O campo de busca do Inbox dizia "Buscar por nome, telefone ou mensagem", mas
procura apenas na ÚLTIMA mensagem de cada conversa — não no histórico. Quem
buscava uma frase dita no meio do atendimento não encontrava nada, sem qualquer
aviso de que aquela parte da conversa estava fora do alcance.

O texto do campo agora diz "última mensagem". Nada mudou no que a busca encontra:
ela continua achando por nome, por telefone (em qualquer formato) e pela última
mensagem. O que mudou é que a tela parou de prometer o que não entrega.

Buscar dentro do histórico inteiro está no plano, como melhoria à parte.

Crédito: @paulolimajr77
```

```bash
pnpm typecheck && pnpm lint
git add components/inbox/InboxFilters.tsx .changes/busca-do-inbox-nao-promete-o-historico.md
git commit -m "fix(inbox): o campo de busca para de prometer o historico"
```

---

## Task 3: A busca por nome tolera o jeito humano de digitar

**Files:**
- Create: `lib/inbox/termo-de-busca.ts`
- Modify: `app/api/v1/conversations/_handler.ts` (bloco `if (q.search)`)
- Test: `tests/unit/termo-de-busca-tolera-digitacao.test.ts`

**Interfaces:**
- Consumes: `termoSeguroParaOr` (existente, **não modificada**)
- Produces: `normalizarTermoDeBusca(bruto: string): string` — colapsa separadores em `*`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { normalizarTermoDeBusca } from "@/lib/inbox/termo-de-busca";

/**
 * Medido na tela, contra o contato "Paulo Lima Jr":
 *   "Paulo  Lima" (espaço duplo)        → 0 resultados
 *   "Paulo Jr"    (não adjacentes)      → 0 resultados
 *   "Paulo, Jr"   (as MESMAS, c/ vírgula) → 1  ← funciona por acidente
 *
 * A vírgula vira `*`, que o PostgREST converte em `%`. É um curinga acidental e
 * invisível: ninguém descobre sozinho que pontuar o nome faz a busca achar mais.
 */
describe("o termo de busca tolera como gente digita", () => {
  it("espaço simples vira curinga", () => {
    expect(normalizarTermoDeBusca("Paulo Jr")).toBe("Paulo*Jr");
  });

  it("espaço DUPLO não vira dois curingas nem quebra", () => {
    expect(normalizarTermoDeBusca("Paulo  Lima")).toBe("Paulo*Lima");
  });

  it("vírgula e espaço juntos colapsam num curinga só", () => {
    expect(normalizarTermoDeBusca("Paulo, Jr")).toBe("Paulo*Jr");
  });

  it("as três formas produzem O MESMO termo — é o ponto da tarefa", () => {
    const a = normalizarTermoDeBusca("Paulo Jr");
    expect(normalizarTermoDeBusca("Paulo  Jr")).toBe(a);
    expect(normalizarTermoDeBusca("Paulo, Jr")).toBe(a);
    expect(normalizarTermoDeBusca("Paulo;Jr")).toBe(a);
  });

  it("CONTROLE: o termo continua FILTRANDO — não vira curinga universal", () => {
    // Sem este par, "troque tudo por *" passaria em todos os casos acima.
    const s = normalizarTermoDeBusca("Paulo, Jr");
    expect(s).toContain("Paulo");
    expect(s).toContain("Jr");
    expect(s.replace(/\*/g, "").trim()).not.toBe("");
  });

  it("CONTROLE: uma palavra só não ganha curinga nenhum", () => {
    expect(normalizarTermoDeBusca("Paulo")).toBe("Paulo");
  });

  it("bordas são aparadas, não viram curinga", () => {
    expect(normalizarTermoDeBusca("  Paulo Jr  ")).toBe("Paulo*Jr");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/termo-de-busca-tolera-digitacao.test.ts`
Expected: FAIL com “Failed to resolve import … lib/inbox/termo-de-busca”.

- [ ] **Step 3: Write minimal implementation**

Criar `lib/inbox/termo-de-busca.ts`:

```ts
/**
 * Colapsa os separadores do termo digitado num curinga do PostgREST.
 *
 * ─── O defeito que ela conserta ──────────────────────────────────────────────
 * Medido na tela, com o contato "Paulo Lima Jr" no banco:
 *
 *     "Paulo  Lima"  (espaço duplo)         → 0
 *     "Paulo Jr"     (palavras não adjacentes) → 0
 *     "Paulo, Jr"    (as MESMAS, com vírgula)  → 1
 *
 * A terceira acha porque a vírgula é trocada por `*` no saneamento, e o PostgREST
 * converte `*` em `%`. Ou seja: pontuar o nome faz a busca funcionar MELHOR — um
 * recurso real, poderoso e invisível, que ninguém descobre sozinho.
 *
 * Esta função torna o acidente uma regra: todo separador vira o mesmo curinga.
 *
 * ⚠️ NÃO substitui `termoSeguroParaOr` (app/api/v1/conversations/_handler.ts). Aquela
 * cuida da GRAMÁTICA do `or=` do PostgREST e está correta — mexer nela é regressão.
 * Esta cuida de COMO A PESSOA DIGITA. As duas compõem, nesta ordem.
 */
export function normalizarTermoDeBusca(bruto: string): string {
  return bruto
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .join("*");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/termo-de-busca-tolera-digitacao.test.ts`
Expected: PASS (7 casos)

- [ ] **Step 5: Wire it into the handler**

Em `app/api/v1/conversations/_handler.ts`, dentro de `if (q.search)`, trocar

```ts
    const s = termoSeguroParaOr(q.search);
```

por

```ts
    // Duas normalizações, em ordem, com responsabilidades diferentes:
    //   normalizarTermoDeBusca → como a PESSOA digitou (espaço duplo, vírgula, ponto
    //                            e vírgula viram o mesmo curinga)
    //   termoSeguroParaOr      → a GRAMÁTICA do `or=` do PostgREST (não mexer)
    const s = termoSeguroParaOr(normalizarTermoDeBusca(q.search));
```

e acrescentar o import no topo:

```ts
import { normalizarTermoDeBusca } from "@/lib/inbox/termo-de-busca";
```

- [ ] **Step 6: Verify the existing suite still passes**

Run: `npx vitest run tests/unit/busca-do-inbox-nao-quebra-a-sintaxe.test.ts tests/unit/inbox-busca-acha-pelo-contato.test.ts tests/unit/busca-do-inbox-nao-estoura-a-url.test.ts`
Expected: PASS — as três continuam verdes; nenhuma delas testa `termoSeguroParaOr` em composição.

- [ ] **Step 7: Gates + fragment + commit**

Crie `.changes/busca-por-nome-tolera-digitacao.md`:

```markdown
---
impacto: capacidade_nova
secao: corrigido
titulo: A busca do Inbox acha o contato mesmo quando o nome é digitado diferente
---

Procurar um contato pelo nome exigia digitar exatamente como estava gravado. Num
contato salvo como "Paulo Lima Jr", buscar "Paulo Jr" não achava nada — e
"Paulo  Lima", com dois espaços por engano, também não. Só achava quem digitasse
o nome inteiro e na ordem certa.

Agora espaço, vírgula e ponto e vírgula são tratados igual: "Paulo Jr",
"Paulo  Lima" e "Paulo, Jr" encontram o mesmo contato. Buscar pelo sobrenome
primeiro ("Lima Paulo") continua não achando — isso é uma mudança maior, para
outra versão.

Você não precisa fazer nada para adotar. Crédito: @paulolimajr77
```

```bash
pnpm typecheck && pnpm lint
git add lib/inbox/termo-de-busca.ts app/api/v1/conversations/_handler.ts \
        tests/unit/termo-de-busca-tolera-digitacao.test.ts \
        .changes/busca-por-nome-tolera-digitacao.md
git commit -m "fix(inbox): a busca por nome tolera espaco duplo e palavras soltas"
```

- [ ] **Step 8: Sabote o que acabou de commitar**

**Preveja:** trocar `.join("*")` por `.join(" ")` derruba **4 casos** — os três de colapso e o de
equivalência ("as três formas produzem O MESMO termo"). Os dois CONTROLE e o de bordas seguem verdes.

```bash
npx vitest run tests/unit/termo-de-busca-tolera-digitacao.test.ts
git checkout -- lib/inbox/termo-de-busca.ts
```

Expected: **4 failed de 7**, os previstos.

---

## Task 4: "Não lidos" vira filtro de servidor

**Files:**
- Modify: `lib/schemas/messaging.ts`, `app/api/v1/conversations/route.ts`, `app/api/v1/conversations/_handler.ts`, `hooks/inbox/useConversationsRealtime.ts`, `components/inbox/InboxLayout.tsx`, `components/inbox/ConversationList.tsx`
- Test: `tests/invariants/nao-lidos-filtra-no-banco.test.ts`

**Interfaces:**
- Consumes: `listConversationsQuerySchema` (Task 1)
- Produces: `ConversationsFilters.unread?: boolean`; `ListConversationsQuery.unread?: boolean`. `ConversationList` **perde** a prop `clientFilter`.

- [ ] **Step 1: Add `unread` to the schema**

Em `lib/schemas/messaging.ts`, ao lado de `tag`:

```ts
  /**
   * Só as que têm mensagem não lida para o dono.
   *
   * NASCEU FORA DO CONTRATO E POR ISSO FORA DE TODO MECANISMO. Era `onlyUnread`, um
   * predicado aplicado em memória sobre a página JÁ TRUNCADA (50 linhas): com as 50
   * primeiras lidas, a tela dizia "Sem conversas por aqui" — e o botão "Carregar mais"
   * nem era desenhado, porque o estado vazio retornava antes dele. Medido na tela: ligar
   * o filtro não gerava requisição nenhuma.
   *
   * Estando aqui, `tests/unit/rota-le-todo-filtro-do-schema.test.ts` passa a cobrá-lo
   * sozinho — a cerca deriva as chaves deste schema.
   */
  unread: z.coerce.boolean().optional(),
```

- [ ] **Step 2: Run the existing fence to watch it fail**

Run: `npx vitest run tests/unit/rota-le-todo-filtro-do-schema.test.ts`
Expected: **FAIL** — “a rota lê `unread` de searchParams”. É a cerca fazendo o trabalho dela, sem teste novo.

- [ ] **Step 3: Make the route read it**

Em `app/api/v1/conversations/route.ts`, no objeto montado para o `safeParse`, acrescentar ao lado de `tag`:

```ts
    unread: searchParams.get("unread") ?? undefined,
```

- [ ] **Step 4: Run the fence to verify it passes**

Run: `npx vitest run tests/unit/rota-le-todo-filtro-do-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing invariant test**

Criar `tests/invariants/nao-lidos-filtra-no-banco.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { comPostgres, criarOrg, criarConversa } from "./_helpers/db";

/**
 * O FILTRO TEM DE ACONTECER NO BANCO, NÃO NA PÁGINA.
 *
 * O controle que dá sentido ao caso principal é o `limit`: com o predicado em
 * memória, pedir 2 linhas devolveria as 2 PRIMEIRAS (lidas) e filtraria depois,
 * resultando em lista vazia. Com o predicado no banco, as 2 linhas JÁ vêm não lidas.
 */
describe("o filtro de não lidos roda no banco", () => {
  it("com 3 lidas antes de 2 não lidas, pedir limit=2 devolve as NÃO LIDAS", async () => {
    await comPostgres(async (db) => {
      const org = await criarOrg(db);
      // mais recentes primeiro é a ordem da lista; as lidas entram na frente
      await criarConversa(db, org, { unread: 0, last_message_at: "2026-09-10T10:00:00Z" });
      await criarConversa(db, org, { unread: 0, last_message_at: "2026-09-10T09:00:00Z" });
      await criarConversa(db, org, { unread: 0, last_message_at: "2026-09-10T08:00:00Z" });
      await criarConversa(db, org, { unread: 2, last_message_at: "2026-09-10T07:00:00Z" });
      await criarConversa(db, org, { unread: 1, last_message_at: "2026-09-10T06:00:00Z" });

      const { rows } = await db.query(
        `select unread_count_for_assignee as u
           from conversations
          where organization_id = $1 and unread_count_for_assignee > 0
          order by last_message_at desc
          limit 2`,
        [org],
      );

      expect(rows).toHaveLength(2);
      expect(rows.every((r: { u: number }) => r.u > 0)).toBe(true);
    });
  });
});
```

> **Nota para quem executa:** confira os helpers reais de `tests/invariants/` antes de escrever este arquivo — o nome exato de `comPostgres`/`criarOrg`/`criarConversa` sai do que já existe lá. Se os helpers tiverem outra assinatura, adapte **o teste**, nunca a asserção.

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm test:db`
Expected: FAIL (a coluna existe, mas o handler ainda não usa o predicado — ver Step 7; se este teste passar direto contra SQL puro, ele está medindo o banco e não o handler: mova a asserção para a rota).

- [ ] **Step 7: Apply the predicate in the handler**

Em `app/api/v1/conversations/_handler.ts`, logo após o bloco de `tag`:

```ts
  // No BANCO, e não em memória: filtrar depois de paginar devolveria páginas curtas —
  // e, quando a página inteira estivesse lida, uma lista vazia que a tela apresentava
  // como caixa vazia, sem sequer oferecer "Carregar mais".
  if (q.unread) query = query.gt("unread_count_for_assignee", 0);
```

> ⛔ **`query` aqui é a query que JÁ tem `.eq("organization_id", ctx.organization_id)` — componha
> sobre ela, nunca abra uma consulta nova.** Este handler usa o **admin client**
> (`createAdminClient`, linha 1), que **passa por cima da RLS**: o filtro manual de organização é a
> única barreira que existe. Uma consulta paralela para "buscar os não lidos" nasceria sem barreira
> nenhuma e devolveria conversa de **outro cliente** — e nesta instalação, onde se vendem tenants,
> isso não é defeito grave, é o fim do produto. Confira antes de escrever:
>
> ```bash
> grep -n 'organization_id\|createAdminClient' app/api/v1/conversations/_handler.ts | head
> ```

- [ ] **Step 8: Wire hook → layout → list**

Em `hooks/inbox/useConversationsRealtime.ts`, no `interface ConversationsFilters`:

```ts
  /** Só as que têm mensagem não lida para o dono. Vai ao BANCO (migration nenhuma —
   *  a coluna `unread_count_for_assignee` já existe). */
  unread?: boolean;
```

e na montagem da querystring, junto dos outros:

```ts
      if (filters.unread) qs.set("unread", "true");
```

Em `components/inbox/InboxLayout.tsx`, dentro do `useMemo` de `filters`, acrescentar `unread: filterValue.onlyUnread || undefined,` e incluir `filterValue.onlyUnread` no array de dependências. Em seguida, **apagar** o `useMemo` de `clientFilter` (linhas 188-194) e a prop `clientFilter={clientFilter}` passada ao `<ConversationList>`.

Em `components/inbox/ConversationList.tsx`, remover a prop da interface e o uso:

```ts
  const items = useMemo(
    () => q.data?.pages.flatMap((p) => p.data) ?? [],
    [q.data],
  );
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm test:db && npx vitest run tests/unit/rota-le-todo-filtro-do-schema.test.ts tests/unit/inbox-filters-scope.test.tsx`
Expected: PASS

- [ ] **Step 10: Gates + fragment + commit**

Crie `.changes/nao-lidos-filtra-de-verdade.md`:

```markdown
---
impacto: capacidade_nova
secao: corrigido
titulo: O filtro "Não lidos" do Inbox passa a procurar em todas as conversas
---

O botão "Não lidos" só escondia as conversas já lidas da parte da lista que
estava carregada na tela — ele não consultava o sistema. Numa caixa com muitas
conversas, se as primeiras estivessem todas lidas, a tela mostrava "Sem conversas
por aqui" e nem oferecia carregar o resto, dando a entender que não havia nada
não lido quando havia.

Agora o filtro consulta todas as conversas da organização, e o botão passa a
poder ser combinado com as abas e com os demais filtros.

Você não precisa fazer nada para adotar. Crédito: @paulolimajr77
```

```bash
pnpm typecheck && pnpm lint
git add lib/schemas/messaging.ts app/api/v1/conversations/route.ts \
        app/api/v1/conversations/_handler.ts hooks/inbox/useConversationsRealtime.ts \
        components/inbox/InboxLayout.tsx components/inbox/ConversationList.tsx \
        tests/invariants/nao-lidos-filtra-no-banco.test.ts \
        .changes/nao-lidos-filtra-de-verdade.md
git commit -m "fix(inbox): o filtro de nao lidos consulta o banco, nao a pagina"
```

- [ ] **Step 11: Sabote o que acabou de commitar**

**Preveja:** comentar `if (q.unread) query = query.gt(...)` derruba **1 caso** —
`nao-lidos-filtra-no-banco`. A cerca `rota-le-todo-filtro-do-schema` continua **verde**, porque ela
cobra a leitura do parâmetro, não o predicado. É a prova de que os dois vigiam coisas diferentes e de
que nenhum é redundante.

```bash
pnpm test:db
git checkout -- app/api/v1/conversations/_handler.ts
```

Expected: **1 failed**, o previsto.

---

## Task 5: O vazio distingue filtro de ausência

**Files:**
- Create: `components/inbox/EmptyPorFiltro.tsx`
- Modify: `components/inbox/ConversationList.tsx:139`, `components/inbox/InboxLayout.tsx`
- Test: `tests/unit/inbox-filters-scope.test.tsx` (estender)

**Interfaces:**
- Consumes: `ConversationsFilters` com `unread` (Task 4)
- Produces: `<EmptyPorFiltro filtros={string[]} onLimpar={() => void} />`

- [ ] **Step 1: Write the failing test**

Acrescentar a `tests/unit/inbox-filters-scope.test.tsx`:

```tsx
describe("o vazio por FILTRO não se disfarça de caixa vazia", () => {
  it("sem filtro e sem conversa: diz que a caixa está vazia", () => {
    render(<ConversationList {...propsBase({ items: [], filtros: {} })} />);
    expect(screen.getByText(/Sem conversas por aqui/i)).toBeInTheDocument();
  });

  it("COM filtro e sem resultado: NÃO diz que a caixa está vazia", () => {
    render(<ConversationList {...propsBase({ items: [], filtros: { unread: true } })} />);
    expect(screen.queryByText(/Sem conversas por aqui/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Não lidos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Limpar filtros/i })).toBeInTheDocument();
  });

  it("COM filtro, sem resultado e com próxima página: o 'Carregar mais' CONTINUA lá", () => {
    // O defeito original: o `return` do vazio vinha ANTES do bloco do botão, então o
    // operador ficava sem como alcançar a página seguinte.
    render(
      <ConversationList {...propsBase({ items: [], filtros: { unread: true }, hasNextPage: true })} />,
    );
    expect(screen.getByRole("button", { name: /Carregar mais/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/inbox-filters-scope.test.tsx`
Expected: FAIL nos dois últimos casos — hoje o vazio é sempre `<EmptyInbox />` e o botão não é desenhado.

- [ ] **Step 3: Create the component**

`components/inbox/EmptyPorFiltro.tsx`:

```tsx
"use client";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { FunnelX } from "@/lib/ui/icons";

interface Props {
  /** Os filtros ativos, já em português — ex.: ["Não lidos", "tag: urgente"]. */
  filtros: string[];
  onLimpar: () => void;
}

/**
 * O vazio que NÃO mente.
 *
 * `EmptyInbox` diz "quando chegarem mensagens, elas aparecem aqui" — verdade quando a
 * caixa está vazia, mentira quando um filtro escondeu tudo. Medido na tela: com duas
 * conversas existindo e "Não lidos" ligado, a tela afirmava caixa vazia.
 */
export function EmptyPorFiltro({ filtros, onLimpar }: Props) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FunnelX size={28} className="text-text-subtle" weight="regular" aria-hidden />
      <p className="text-sm font-medium text-text">{t("Nenhuma conversa com esses filtros")}</p>
      <p className="text-xs text-text-muted">
        {t("Ativos:")} {filtros.join(" · ")}
      </p>
      <Button size="sm" variant="outline" onClick={onLimpar}>
        {t("Limpar filtros")}
      </Button>
    </div>
  );
}
```

> Confira o nome do ícone em `lib/ui/icons` antes de importar — a doutrina proíbe importar direto de `@phosphor-icons/react`. Se `FunnelX` não estiver exportado, acrescente-o lá.

> ⚠️ **As quatro strings novas entram em `lib/i18n/dicionario.ts`** — "Nenhuma conversa com esses
> filtros", "Ativos:", "Limpar filtros" e o rótulo de cada filtro. É o erro nº 11 dos recorrentes
> (PRs #631, #600): string em português fora do dicionário, e o guardião do espanhol é **cego a
> `t(<variável>)`**, então ele não pega sozinho. O arquivo tem 8.285 linhas; acrescente as chaves lá.

- [ ] **Step 4: Use it in the list**

Em `components/inbox/ConversationList.tsx`, substituir o bloco do vazio por:

```tsx
  if (items.length === 0 && filtrosAtivos.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyInbox />
      </div>
    );
  }
```

e, dentro do `return` principal, antes do `items.map`:

```tsx
        {items.length === 0 && filtrosAtivos.length > 0 && (
          <EmptyPorFiltro filtros={filtrosAtivos} onLimpar={onLimparFiltros} />
        )}
```

Assim o bloco do `hasNextPage` (linha 158) **continua sendo alcançado** — que é o conserto.

`filtrosAtivos: string[]` e `onLimparFiltros: () => void` entram como props, montadas no `InboxLayout` a partir de `filterValue`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/inbox-filters-scope.test.tsx`
Expected: PASS

- [ ] **Step 6: Gates + commit**

```bash
pnpm typecheck && pnpm lint
git add components/inbox/EmptyPorFiltro.tsx components/inbox/ConversationList.tsx \
        components/inbox/InboxLayout.tsx tests/unit/inbox-filters-scope.test.tsx
git commit -m "fix(inbox): lista vazia por filtro deixa de se passar por caixa vazia"
```

- [ ] **Step 7: Sabote o que acabou de commitar**

**Preveja:** mover o `EmptyPorFiltro` para um `return` precoce (antes do bloco do `hasNextPage`)
derruba **1 caso** — "o 'Carregar mais' CONTINUA lá". Os outros dois seguem verdes: o texto continua
certo, o que quebra é o botão sumir. É exatamente o defeito original.

```bash
npx vitest run tests/unit/inbox-filters-scope.test.tsx
git checkout -- components/inbox/ConversationList.tsx
```

Expected: **1 failed**, o previsto.

---

## Task 6: Contadores respeitam os filtros, e "Fechadas" ganha número

**Files:**
- Modify: `app/api/v1/conversations/counts/route.ts`, `hooks/inbox/useConversationCounts.ts`, `components/inbox/InboxFilters.tsx:76-84`
- Test: `tests/unit/badge-espelha-o-filtro.test.ts`

**Interfaces:**
- Consumes: `ConversationsFilters` (Task 4)
- Produces: resposta de `/conversations/counts` ganha `closed: number` e passa a aceitar `channel_session_id`, `tag`, `search`, `unread`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { montarContagens } from "@/app/api/v1/conversations/counts/route";

/**
 * Medido na tela: com "Não lidos" ligado a lista mostrava ZERO linhas e a aba
 * continuava estampando "Todas 2".
 *
 * O próprio arquivo da rota já declara a regra: "um badge que conta o que a aba não
 * mostra é pior que badge nenhum — manda o atendente procurar trabalho que não existe."
 * A regra estava certa; a cobertura parou no predicado da aba e não alcançou os
 * filtros ao lado.
 */
describe("o badge conta o mesmo que a lista mostra", () => {
  it("o filtro de tag entra em TODAS as contagens", () => {
    const q = montarContagens({ tag: "urgente" });
    for (const nome of ["fila", "automatico", "mine", "all", "closed"]) {
      expect(q[nome].filtros, `contagem '${nome}'`).toContainEqual(["tag", "urgente"]);
    }
  });

  it("o filtro de não lidos entra em TODAS as contagens", () => {
    const q = montarContagens({ unread: true });
    for (const nome of ["fila", "automatico", "mine", "all", "closed"]) {
      expect(q[nome].filtros, `contagem '${nome}'`).toContainEqual(["unread", true]);
    }
  });

  it("a aba Fechadas TEM contagem — o concorrente mostra 8067 e nós mostrávamos nada", () => {
    expect(Object.keys(montarContagens({}))).toContain("closed");
  });

  it("CONTROLE: sem filtro auxiliar, nenhuma contagem carrega filtro extra", () => {
    const q = montarContagens({});
    expect(q.all.filtros).toEqual([]);
  });
});
```

> A rota hoje não exporta função pura. **Step 3 extrai `montarContagens`** — é o que torna esta regra testável sem banco.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/badge-espelha-o-filtro.test.ts`
Expected: FAIL — `montarContagens` não existe.

- [ ] **Step 3: Extract the pure function and apply the filters**

Em `app/api/v1/conversations/counts/route.ts`, extrair a montagem dos filtros auxiliares numa função exportada e pura (que devolve, por contagem, a lista de pares a aplicar), e passar a chamá-la nas cinco contagens — incluindo a nova:

```ts
    countExact().in("status", CONVERSATION_TERMINAL_STATUSES),
```

> ⚠️ **A contagem nova entra pela fábrica `countExact()`, nunca montando query própria.** A fábrica
> aplica `.eq("organization_id", org)` por construção — herdar o filtro tira a opção de esquecer dele.
> (Esta rota usa o client de **sessão**, então a RLS também vale: são duas redes. O handler da T4 tem
> **uma só**. A diferença está medida na §5.1 da spec e é o motivo de os cuidados serem diferentes.)

no `Promise.all`, e `closed: closed.count ?? 0` na resposta.

- [ ] **Step 4: Fix the false claim in the comment**

Na linha 69, trocar a citação de `tests/unit/badge-espelha-a-aba.test.ts` — **que não existe**; medido com `find`, e o `git log` não mostra deleção — pelos arquivos reais:

```ts
    // ...e o espelhamento entre badge e aba é vigiado por
    // `tests/e2e/inbox-abas-espelham-o-comando.spec.ts`,
    // `tests/unit/fila-tem-uma-definicao-so.test.ts` e
    // `tests/invariants/gov-5b-inbox-scope-counts.test.ts` — mais, desde 2026-09,
    // `tests/unit/badge-espelha-o-filtro.test.ts`, que estende a regra aos filtros
    // auxiliares. (Este comentário citava um arquivo que nunca existiu.)
```

- [ ] **Step 5: Show the count in the tab**

Em `components/inbox/InboxFilters.tsx`, no `countFor`, acrescentar `closed: counts?.closed,`. Atualizar o tipo em `hooks/inbox/useConversationCounts.ts`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/badge-espelha-o-filtro.test.ts tests/unit/fila-tem-uma-definicao-so.test.ts`
Expected: PASS

- [ ] **Step 7: Gates + fragment + commit**

Crie `.changes/contadores-das-abas-respeitam-os-filtros.md`:

```markdown
---
impacto: capacidade_nova
secao: corrigido
titulo: Os números das abas do Inbox passam a acompanhar os filtros
---

Os números ao lado das abas do Inbox ignoravam os filtros: com um filtro de
etiqueta ligado, a aba podia dizer "318" enquanto a lista logo abaixo mostrava
quatro conversas. O número contava a organização inteira, não o que estava na
tela.

Agora cada número conta exatamente o que a aba mostra, com os filtros aplicados.
A aba "Fechadas", que não tinha número nenhum, passa a ter.

Você não precisa fazer nada para adotar. Crédito: @paulolimajr77
```

```bash
pnpm typecheck && pnpm lint
git add app/api/v1/conversations/counts/route.ts hooks/inbox/useConversationCounts.ts \
        components/inbox/InboxFilters.tsx tests/unit/badge-espelha-o-filtro.test.ts \
        .changes/contadores-das-abas-respeitam-os-filtros.md
git commit -m "fix(inbox): os contadores das abas respeitam os filtros e Fechadas ganha numero"
```

- [ ] **Step 8: Sabote o que acabou de commitar**

**Preveja:** remover o filtro de `tag` de **uma** das cinco contagens derruba **1 caso** — "o filtro de
tag entra em TODAS as contagens" — e a mensagem deve **nomear qual contagem** caiu (é para isso que o
`expect` leva a terceira string). Se não disser qual, o teste é ruim de diagnosticar: melhore agora.

```bash
npx vitest run tests/unit/badge-espelha-o-filtro.test.ts
git checkout -- app/api/v1/conversations/counts/route.ts
```

Expected: **1 failed**, nomeando a contagem.

---

## Task 7: A corrida do debounce

**Files:**
- Modify: `components/inbox/InboxFilters.tsx:100-109`
- Test: `tests/unit/debounce-nao-volta-a-aba.test.tsx`

**Interfaces:**
- Consumes: `InboxFiltersValue`
- Produces: `onChange` passa a aceitar também `(anterior: InboxFiltersValue) => InboxFiltersValue`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";

/**
 * O efeito do debounce dependia só de [searchInput], com eslint-disable — então o timer
 * capturava o `value` do render em que foi agendado, INCLUINDO `tab`. Digitar e trocar
 * de aba em menos de 250ms fazia o timer disparar com a aba velha e o `InboxLayout`
 * devolver o operador à aba anterior.
 */
describe("o debounce da busca não desfaz a troca de aba", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("digitar e trocar de aba em <250ms preserva a ABA NOVA", () => {
    let atual: InboxFiltersValue = { tab: "unassigned", search: "", onlyUnread: false };
    const onChange = vi.fn((next: InboxFiltersValue) => { atual = next; });

    const { rerender } = render(<InboxFilters value={atual} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Buscar conversas/i), { target: { value: "ana" } });

    // o operador troca de aba ANTES do debounce fechar
    act(() => { onChange({ ...atual, tab: "all" }); });
    rerender(<InboxFilters value={atual} onChange={onChange} />);

    act(() => { vi.advanceTimersByTime(300); });

    expect(atual.tab).toBe("all");   // a aba nova sobreviveu
    expect(atual.search).toBe("ana"); // e a busca também chegou
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/debounce-nao-volta-a-aba.test.tsx`
Expected: FAIL — `atual.tab` volta a `"unassigned"`.

- [ ] **Step 3: Write minimal implementation**

Em `components/inbox/InboxFilters.tsx`, trocar o efeito por:

```tsx
  // O timer propaga SÓ `search`, via função de atualização — e não o `value` inteiro do
  // render em que foi agendado. Sem isso, digitar e trocar de aba dentro dos 250ms
  // devolvia o operador à aba anterior: o `value` capturado carregava o `tab` velho.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const t = setTimeout(() => {
      onChangeRef.current((anterior) =>
        anterior.search === searchInput ? anterior : { ...anterior, search: searchInput },
      );
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);
```

Atualizar a assinatura da prop:

```tsx
interface Props {
  value: InboxFiltersValue;
  onChange: (
    next: InboxFiltersValue | ((anterior: InboxFiltersValue) => InboxFiltersValue),
  ) => void;
}
```

e, em `InboxLayout.tsx`, fazer `setFilterValue` aceitar a forma funcional resolvendo contra o `filterValue` corrente.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/debounce-nao-volta-a-aba.test.tsx tests/unit/inbox-filters-scope.test.tsx`
Expected: PASS

- [ ] **Step 5: Gates + commit**

```bash
pnpm typecheck && pnpm lint
git add components/inbox/InboxFilters.tsx components/inbox/InboxLayout.tsx \
        tests/unit/debounce-nao-volta-a-aba.test.tsx
git commit -m "fix(inbox): trocar de aba logo apos digitar para de voltar a aba anterior"
```

- [ ] **Step 6: Sabote o que acabou de commitar**

**Preveja:** voltar para `onChange({ ...value, search: searchInput })` derruba **1 caso**, e o `expect`
que falha é o do `tab`, não o do `search`. Se falhar o do `search`, a sabotagem pegou outra coisa e o
teste está medindo o que não devia.

```bash
npx vitest run tests/unit/debounce-nao-volta-a-aba.test.tsx
git checkout -- components/inbox/InboxFilters.tsx
```

Expected: **1 failed**, na asserção do `tab`.

---

## Task 8: `fn_tags_de_conversa_em_uso` + a rota devolve a união

**Files:**
- Create: `supabase/migrations/<timestamp>_0239_tags_de_conversa_em_uso.sql`
- Modify: `supabase/baseline.sql` (apêndice), `supabase/migrations/MANIFEST.md`, `app/api/v1/conversation-tags/route.ts`
- Test: `tests/invariants/tags-em-uso-aparecem-no-filtro.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `fn_tags_de_conversa_em_uso(p_org uuid) returns table (tag text)`; `GET /api/v1/conversation-tags` devolve a união ordenada

- [ ] **Step 1: Confirm the migration number**

```bash
git fetch origin
git ls-tree -r --name-only origin/main -- supabase/migrations \
  | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1
git ls-tree -r --name-only origin/main -- supabase/migrations | grep -c "20260912"   # timestamp livre?
```

Expected hoje: **`0238`** → a nova é **0239**; e `0` timestamps em `20260912`.

> **A âncora é `origin/main`, nunca o disco.** A primeira versão deste plano mediu `ls
> supabase/migrations/` nesta branch (`0233`) e concluiu `0234` — que **já existe** na `origin/main`
> (`20260907130000_0234_voice_calls_no_realtime.sql`). Erro nº 1 dos recorrentes: renumerada 11 vezes
> desde agosto, cinco PRs disputando o mesmo `0161` (issue #285). E ordene pelo **número**, nunca pela
> listagem: timestamp e `NNNN` já discordaram neste repo.

- [ ] **Step 2: Write the failing invariant test**

Criar `tests/invariants/tags-em-uso-aparecem-no-filtro.test.ts` com **quatro** casos. Os três últimos
não são zelo: eles são o único gate desta função, porque a varredura genérica de `security definer`
do repo **não a alcança** (ela é invoker de propósito):

1. **Faz o que promete** — tag aplicada a uma conversa e **ausente** de `canonical_conversation_tags`
   aparece no retorno.
2. **Guarda de vacuidade** — uma tag que ninguém aplicou **não** aparece. Sem este caso, um retorno
   que devolvesse tudo passaria no caso 1.
3. **⛔ Isolamento entre organizações** — montar DUAS organizações, cada uma com sua tag exclusiva;
   autenticado como membro de **A**, chamar a função passando o uuid de **B** e exigir **zero linhas**.
   É o caso que a primeira versão desta tarefa não tinha — e sem ele o `security definer` que eu havia
   escrito teria passado em tudo, vazando as etiquetas de um cliente para outro.
4. **`anon` não executa** — chamar como `anon` e exigir erro de permissão. É o que prova o
   `revoke ... from public, anon`; nenhum outro gate o cobre nesta função.

> O caso 3 monta o cenário **perigoso** de propósito, e não o caminho feliz. É a regra que o
> `NOSSA-REGRA.md` tirou de um prejuízo real: quatro testes passaram no CI contra Postgres de verdade
> e não pegaram o defeito, porque ninguém imaginou o caso.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test:db`
Expected: FAIL — função não existe.

- [ ] **Step 4: Write the migration**

```sql
-- Vocabulário de etiquetas EM USO, para o filtro do Inbox.
--
-- O seletor de tag lia apenas `organizations.settings.canonical_conversation_tags` —
-- uma lista curada à mão. Medido numa instalação real: o seletor oferecia 8 etiquetas
-- de semente, NENHUMA conversa tinha etiqueta, filtrar por qualquer uma devolvia zero,
-- e a etiqueta que a lista de conversas EXIBIA não estava entre as 8.
--
-- Função, e não consulta direta, porque o PostgREST não expressa `distinct unnest`.
--
-- security INVOKER, e isto não é detalhe. A função recebe a organização por ARGUMENTO e
-- é concedida a `authenticated` — logo é RPC alcançável por qualquer pessoa logada. Com
-- `security definer` ela leria a organização que o chamador pedisse: vazamento entre
-- clientes. Sob invoker, quem isola é a RLS de `conversations`
-- (tenant_isolation_conversations_all via fn_user_org_ids()), e o p_org vira filtro,
-- não fronteira. O mesmo raciocínio está escrito no comment de fn_gasto_de_ia_do_mes.
create or replace function public.fn_tags_de_conversa_em_uso(p_org uuid)
returns table (tag text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct t
  from public.conversations c, unnest(c.tags) as t
  where c.organization_id = p_org and c.tags is not null
  order by t
  limit 200;
$$;

-- Função nova em `public` nasce EXPOSTA — as DUAS origens de EXECUTE (CLAUDE.md):
-- (A) o ALTER DEFAULT PRIVILEGES ... TO anon do baseline, que `revoke from public` não
--     remove; (B) o grant a PUBLIC que o Postgres dá a toda função ao criá-la, que
--     `revoke from anon` não remove.
revoke execute on function public.fn_tags_de_conversa_em_uso(uuid) from public, anon;
grant  execute on function public.fn_tags_de_conversa_em_uso(uuid) to authenticated, service_role;
```

- [ ] **Step 5: Mirror it in the baseline and the MANIFEST**

Acrescentar ao **fim** de `supabase/baseline.sql`, rotulado, o mesmo bloco (é `create or replace` + `revoke`/`grant` — idempotente por construção):

```sql
-- ---- tags de conversa em uso (migration 0239) ----
```

E uma linha na tabela “Applied” de `supabase/migrations/MANIFEST.md`, dizendo **o quê** e **por quê**.

- [ ] **Step 6: Make the route return the union**

Em `app/api/v1/conversation-tags/route.ts`, após ler as canônicas, chamar a função e devolver a união deduplicada e ordenada. A org vem de `requireRole` — **nunca do body**.

- [ ] **Step 7: Run the tests**

Run: `pnpm test:db`
Expected: PASS.

> ⚠️ **Não conte com a varredura de definer aqui.** `tests/invariants/hardening-definer-varredura.test.ts`
> só alcança funções `security definer` — esta é **invoker** de propósito (ver o comentário da migration),
> então ela **não entra** nessa varredura. Trocar definer por invoker conserta o furo e apaga o gate que
> olhava para ele: por isso o teste de isolamento do Step 3 é obrigatório, e não opcional.

- [ ] **Step 8: Prove the baseline on a disposable Postgres**

Suba `pgvector/pgvector:pg15` (o PISO), aplique `scripts/selfhost-prelude.sql` e então `baseline.sql` em modo **install** (`ON_ERROR_STOP=1`) e em modo **update** (re-aplicar, sem a flag). Expected: os dois passam.

- [ ] **Step 9: Gates + commit — a TRIPLA vai no MESMO commit**

O hook `pre-commit` reprova migration nova sem apêndice no `baseline.sql` e sem linha no `MANIFEST.md`
no mesmo commit, e reprova número ou timestamp já usados na `origin/main`.

```bash
pnpm typecheck && pnpm lint
git add supabase/migrations/ supabase/baseline.sql app/api/v1/conversation-tags/route.ts \
        tests/invariants/tags-em-uso-aparecem-no-filtro.test.ts
git commit -m "feat(inbox): o filtro de tags passa a oferecer as etiquetas em uso"
```

- [ ] **Step 10: Sabote o que acabou de commitar**

**Preveja três sabotagens, porque são três guardas distintas — e uma delas é a que me pegou:**

1. **Trocar `security invoker` por `security definer`** → tem de derrubar o **caso 3** (isolamento) do
   teste escrito no Step 2: sob definer, a organização A passa o uuid de B e **recebe as etiquetas de B**. Se essa
   sabotagem ficar **verde**, o teste não está medindo o que importa — pare e reescreva o teste antes
   de qualquer outra coisa. Esta é a sabotagem mais importante das oito tarefas.
2. Trocar o corpo por `select unnest(tags) from conversations` sem o filtro de organização → derruba
   o mesmo invariante de isolamento, por outro caminho.
3. Remover `revoke execute ... from public, anon` → derruba o **caso 4**. A função fica alcançável
   pela **anon key**, que vai para o browser. ⚠️ **A varredura de definer NÃO pega isto**, porque a
   função é invoker — o caso 4 é o único guardião deste `revoke`.

Vazamento entre clientes é o defeito que nenhum gate pode deixar passar — e aqui o gate genérico do
repo não cobre. Quem cobre é o teste que esta tarefa escreve.

```bash
pnpm test:db
git checkout -- supabase/
```

Expected: **1 failed** em cada sabotagem, as previstas — e nomeando o caso certo.

---

## Task 9: Filtro de tag órfã + o histórico mostra a data

**Files:**
- Modify: `components/inbox/InboxFilters.tsx` (órfão de tag), `components/inbox/CRMSidePanel.tsx:696`
- Test: `tests/unit/inbox-filters-scope.test.tsx` (estender)

**Interfaces:**
- Consumes: vocabulário unificado (Task 8)
- Produces: nada novo

- [ ] **Step 1: Write the failing test**

Espelhar o caso que **já existe** para o canal (`"filtro aponta para número que saiu da lista: o seletor FICA e nomeia o número removido"`), agora para a tag: com vocabulário vazio e `value.tag` preenchido, o seletor **permanece** e nomeia a tag órfã.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/inbox-filters-scope.test.tsx`
Expected: FAIL — hoje o seletor inteiro some com o filtro ainda aplicado.

- [ ] **Step 3: Apply the same treatment the channel already has**

Copiar o padrão de `filtroForaDaLista` (`InboxFilters.tsx:89-96`) para a tag, e trocar a condição de exibição do seletor para `(tagVocabulary?.length ?? 0) > 0 || tagForaDoVocabulario`.

- [ ] **Step 4: Show the date in the history**

Em `components/inbox/CRMSidePanel.tsx:696`, acrescentar `h.fechada_em` formatado ao lado do desfecho. **O campo já chega** — `app/api/v1/contacts/[id]/crm-summary/route.ts:124` seleciona `id, desfecho, fechada_em` e a tela o descartava.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/inbox-filters-scope.test.tsx`
Expected: PASS

- [ ] **Step 6: Gates + commit**

```bash
pnpm typecheck && pnpm lint
git add components/inbox/InboxFilters.tsx components/inbox/CRMSidePanel.tsx \
        tests/unit/inbox-filters-scope.test.tsx
git commit -m "fix(inbox): filtro de tag orfa nao some, e o historico mostra a data"
```

- [ ] **Step 7: Sabote o que acabou de commitar**

**Preveja:** voltar a condição do seletor para só `(tagVocabulary?.length ?? 0) > 0` derruba **1 caso**
— o da tag órfã. O caso equivalente do **canal** continua verde: é a prova de que os dois tratamentos
são independentes, e de que o da tag não estava só herdando o do vizinho.

```bash
npx vitest run tests/unit/inbox-filters-scope.test.tsx
git checkout -- components/inbox/InboxFilters.tsx
```

Expected: **1 failed**, o previsto.

---

## Task 10: Prova pela tela (DoD item 12)

**Files:**
- Create: `tests/e2e/inbox-filtros-dizem-a-verdade.spec.ts`
- Modify: `.github/workflows/e2e.yml` (`SPECS_PARTE_*`)

**Interfaces:**
- Consumes: tudo das Tasks 1-9
- Produces: evidência visual em `evidence/` (**versionada** — `.superpowers/` é ignorado pelo git)

- [ ] **Step 1: Write the E2E spec**

Ambiente fresco estilo VPS: Postgres limpo do `baseline.sql` + `scripts/bootstrap-owner.ts`, `next build` + `next start`. A spec dirige o **frontend** e cobre os critérios de aceite 1, 2 e 5 da spec de design:

1. Semear conversas lidas **e** não lidas; ligar “Não lidos”; asseverar que a requisição **sai** (interceptar a rota) e que a lista mostra as não lidas.
2. Aplicar um filtro que não casa nada; asseverar que a tela **não** diz “Sem conversas por aqui”, que nomeia o filtro e que oferece “Limpar filtros”.
3. Com filtro de tag ativo, asseverar que o badge da aba bate com a contagem de linhas visíveis.

Medidas de front-end **por ferramenta** (`getBoundingClientRect`/`getComputedStyle`), nunca a olho.

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e`
Expected: PASS, com screenshot salvo em `evidence/` — e a spec **registrada** em `SPECS_PARTE_N` do `.github/workflows/e2e.yml`, senão `tests/unit/e2e-cobertura-completa.test.ts` reprova spec órfã.

- [ ] **Step 3: Declare it in CI**

Acrescentar a spec a uma `SPECS_PARTE_*` do `.github/workflows/e2e.yml` — ou a `FORA_DO_CI` **com motivo escrito**. Sem isso, `tests/unit/e2e-cobertura-completa.test.ts` reprova.

- [ ] **Step 4: Run the whole suite — ONCE, at the end of the queue**

```bash
pnpm test:unit > /tmp/vt.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests " /tmp/vt.log | tail -2                   # ← a AUTORIDADE
grep -aE "^ *FAIL " /tmp/vt.log | sed 's/ > .*//' | sort | uniq -c   # arquivos + contagem
r=$(grep -aE "^ *Tests " /tmp/vt.log | tail -1 | grep -oE "[0-9]+ failed" | head -1)
g=$(grep -acE "^ *FAIL " /tmp/vt.log)
echo "rodapé: ${r:-0 failed} | grep contou: $g"   # têm de bater
```

`pnpm test:unit` **sem caminho** — o script alcança o repo inteiro (566 arquivos), não só `tests/unit/` (388). Se as duas sondas não baterem, troque por `--reporter=verbose` em vez de acreditar no silêncio.

> **Vermelho local que NÃO é seu:** `lib/ai/dispatcher/rate-limit.test.ts` falha em 5 casos, com 15s de timeout cada, quando o `.env.local` tem `UPSTASH_REDIS_REST_URL`/`TOKEN` apontando para um Redis que não está de pé. No CI não há `UPSTASH`, e lá o arquivo passa.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/inbox-filtros-dizem-a-verdade.spec.ts .github/workflows/e2e.yml
git commit -m "test(e2e): os filtros do inbox provados pela tela"
```

---

## Ordem e dependências

```
T1 ──┐
T2 ──┤  (independentes, podem ir em paralelo)
T3 ──┤
T7 ──┘
T4 ──→ T5 ──┐
      └─ T6 ─┤
T8 ──→ T9 ───┴──→ T10
```

- **Fase 1 (sem schema):** T1, T2, T3, T4, T5, T6, T7
- **Fase 2 (com migration 0239):** T8, T9
- **Fecho:** T10

Um PR por fase, ou um PR único com os commits atômicos preservados — o que o revisor preferir.

---

## Task 11: O pré-voo, antes de abrir o PR

Mede, do seu lado, o que o mantenedor mede depois — e é o que evita retrabalho.

- [ ] **Step 1: Rode o pré-voo**

```bash
bash .agents/skills/deskcomm-contribuir/scripts/pre-voo.sh
```

Ele imprime, medido: atraso e sobreposição com a `origin/main`, arquivos fora do produto no diff
(marca, `.env`, config do fork), segredo no diff, `console.log` novo, migration e a tripla, seção de
versão escrita à mão no `CHANGELOG.md` (**bloqueador**), fragmento em `.changes/`, documento de
autoridade tocado, identidade dos commits.

- [ ] **Step 2: Os gates que o CI cobra — a suíte, não os que você lembra**

```bash
rm -f tsconfig*.tsbuildinfo; pnpm typecheck; echo exit=$?
pnpm lint; echo exit=$?
pnpm lint:channels; echo exit=$?
pnpm test:unit > /tmp/vt.log 2>&1; echo exit=$?; grep -aE "Test Files|Tests " /tmp/vt.log | tail -2
pnpm test:db; echo exit=$?
pnpm build; echo exit=$?
```

- [ ] **Step 3: Subir na NOSSA VPS e o Paulo provar na tela — ANTES do PR, não depois**

```
1. escrever                     <- tarefas 1 a 10, na branch que nasceu de origin/main
2. gates verdes no computador   <- Step 2 acima
3. rodar na NOSSA instalação
4. PAULO prova na tela, como um usuário faria
5. SÓ ENTÃO o PR
```

**Esta ordem não é negociável** (`NOSSA-REGRA.md`, seção “PR só sai depois de PROVADO NA TELA”).
Ela nasceu de quatro PRs abertos com a suíte verde nos quais o Paulo, usando o CRM, achou um defeito
que nenhuma delas pegaria: o #679 deixava a pessoa revogada sentada na tela aberta, com o menu
inteiro no lugar. Nenhum teste automático pega isso — o defeito vive ENTRE dois carregamentos.

### ⛔ A direção é de mão única, e inverter custa o PR inteiro

O trabalho **nasce** na branch limpa (filha de `origin/main`) e **desce** para a
`vps/pljr-combinada` para ser provado. **Nunca o contrário.** Implementar na combinada e depois
tentar extrair o PR arrasta a nossa personalização junto — imagens `ghcr.io/paulolimajr77`, os
`Dockerfile` com o nosso repositório, o workflow que conhece o nome da nossa branch. É o caso medido
do `CONTRIBUTING.md` dele (PR #465): sete arquivos com a marca de um cliente, **seis mergearam em
silêncio**.

```bash
# 1. a combinada recebe o trabalho (ela é quem vai virar imagem)
git checkout vps/pljr-combinada
git merge <a-branch-do-conserto>      # nunca rebase, nunca reset

# 2. empurrar constrói as imagens — e PARA AQUI
git push fork vps/pljr-combinada
```

### ⛔ NÃO crie a tag. Avise.

**Quem publica a versão é outro agente.** Há outro trabalhando neste repositório em paralelo e a
sequência de versões é **uma só**: dois publicando disputam o mesmo número, e o botão "Atualizar
agora" passa a oferecer coisa que o outro não sabe que existe. Já nasceu uma **versão fantasma** por
número errado — e era um agente só.

Ao terminar o push, entregue um aviso com **três partes**, em linguagem de quem usa a ferramenta —
nunca nome de arquivo, nunca jargão:

1. **O que entra na versão** — uma linha por conserto, dita pelo efeito. *"A busca para de sumir com
   a conversa quando você digita o nome com dois espaços."*
2. **O que exige ação de quem opera** — nesta leva, nada: ninguém precisa mexer em nada para adotar.
3. **O que conferir na tela depois do clique** — a tabela do caminho do erro, abaixo.

Depois que a tag sair e o Paulo clicar em "Atualizar agora", aí sim vem a prova de tela.

**Empurrar código não publica versão, e isso é a seu favor.** O agente da VPS lê **tag**, não
branch (`hostgator-setup-kit/agent.sh:107,204`), e o botão só acende quando a maior tag do fork
difere da versão do rodapé. Então a branch empurrada **não fica pela metade**: fica pronta,
esperando o número. Nada quebra enquanto ela espera.

**Nem a tag nem o clique são seus.** A tag é do outro agente; o clique em "Atualizar agora" é do
Paulo.

### ⚠️ Se o Paulo achar defeito provando, o conserto volta para a branch LIMPA

E de lá desce de novo para a combinada. Consertar direto na combinada faz o que foi **provado**
divergir do que vai **no PR** — e aí a prova de tela vale para uma versão que ninguém vai mandar.
É a falha-em-verde deste fluxo: medir um caminho e entregar outro.

O que o Paulo tem de provocar de propósito, porque **o caminho do erro é o que mais paga**:

| provar | o caminho do erro |
|---|---|
| busca por nome, telefone e mensagem | uma letra só; espaço duplo; termo que não existe |
| “Não lidos” | ligado junto com uma aba e com um filtro de canal |
| lista vazia por filtro | filtrar até zerar e conferir que o texto **não** diz “caixa vazia” |
| contadores das abas | com filtro ligado, e a aba “Fechadas” com número |
| trocar de aba logo após digitar | digitar e clicar na aba em menos de 1 segundo |
| filtro de tag | uma tag órfã (que existe em conversa e não no vocabulário) |

Se o PR precisar sair antes do passo 4, ele sai **como rascunho** — e nunca sem dizer isso.

- [ ] **Step 4: O Paulo decide abrir o PR do FORK para `melgarafael/DeskcommCRM`**

**Abrir PR não é decisão sua.** Sai para fora e leva o nome dele (`NOSSA-REGRA.md`; seção 9 do
`NOSSA-INTEGRACAO.md`). Deixe a branch empurrada e o corpo do PR escrito; quem aperta é ele.

```bash
git push fork HEAD
```

Corpo do PR: o que muda para quem usa; o que você **mediu** (rodapé do `test:unit`, as **oito
sabotagens** com a contagem prevista de cada uma, a prova de tela); e um bloco **"O que NÃO medi"**.

**Nunca feche o próprio PR** por achar que "fez ruído" — erro nº 5 dos recorrentes, aconteceu seis
vezes, e um autor fechou 36 segundos depois de abrir levando junto um bug real. `Vercel` vermelho com
"Authorization required to deploy" é **esperado** em fork e não entra no gate.

---

## Definition of Done

Além dos 17 itens do `CLAUDE.md`:

- [ ] `pnpm typecheck` (após `rm -f tsconfig*.tsbuildinfo`), `pnpm lint`, `pnpm lint:channels` e `pnpm build` zerados
- [ ] `pnpm test:unit` (**sem caminho**) verde, com rodapé conferido contra o `grep FAIL`
- [ ] `pre-voo.sh` rodado e cada apontamento resolvido ou declarado
- [ ] `pnpm test:db` verde **localmente** (fase 2 toca schema)
- [ ] `pnpm test:e2e` com a spec da T10 verde
- [ ] Migration `0239` **+** apêndice idempotente no `baseline.sql` **+** linha no `MANIFEST.md`, **no mesmo commit**
- [ ] Número e timestamp da migration conferidos contra **`origin/main`**, não contra o disco
- [ ] Branch nasceu de `origin/main`; nenhum arquivo de marca, `.env` ou config do fork no diff
- [ ] Strings novas em `lib/i18n/dicionario.ts`
- [ ] Fragmentos com `Crédito: @paulolimajr77`; **nenhuma** seção `## [x.y.z]` escrita à mão no `CHANGELOG.md`
- [ ] `revoke execute … from public, anon` presente — **as duas origens**
- [ ] ⛔ **Nenhuma das três peças pode cruzar organizações** — o filtro `unread` compôs sobre a query
  que já filtra a organização (handler roda em admin client: barreira única), a contagem `closed`
  entrou pela fábrica `countExact()`, e a função nova é `security invoker` com caso de isolamento
  entre duas organizações passando. **Vendemos tenants: este item não tem “quase”**
- [ ] Baseline provado num Postgres descartável `pgvector/pgvector:pg15`, **install e update**
- [ ] Fragmentos em `.changes/` (T2, T3, T4, T6), conferidos com `pnpm release:conferir`
- [ ] O comentário de `counts/route.ts:69` cita os testes que **existem**
- [ ] `docs/research/atendechat-inbox-comparativo.md` atualizado nas linhas afetadas
- [ ] Evidência visual em **`evidence/`** — versionada. `.superpowers/` é ignorado pelo git, e evidência que o git ignora não chega a ninguém (`receita-e2e-local.md`, passo 5)
- [ ] Nenhuma tela nova ⇒ nada a declarar em `lib/navigation/catalogo.ts` (verificado, não presumido)
- [ ] **Toda task passou pelo passo de sabotagem** e ficou vermelha quando devia
- [ ] **O Paulo provou na tela da VPS, provocando o caminho do erro** — e só depois disso o PR sai do rascunho. Suíte verde não substitui isto: o defeito do #679 vivia entre dois carregamentos de página
- [ ] Item da `FILA.md` aberto antes de começar e fechado ao terminar, com o commit
