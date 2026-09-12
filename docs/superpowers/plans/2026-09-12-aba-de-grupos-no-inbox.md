# Aba de Grupos no Inbox — plano

> **Para quem executa:** siga tarefa a tarefa. Os passos usam caixinha (`- [ ]`).
> ⛔ **Este plano entra DEPOIS do PR 0** (busca e filtros). Ver "A ordem é obrigatória", abaixo.

**Goal:** as conversas de grupo de WhatsApp param de ser invisíveis — ganham aba própria, e só onde
o canal entrega grupos.

**Architecture:** **o dado já existe e já é lido.** `conversations.is_group` e
`conversations.group_chat_id` são selecionados pelo handler (`SELECT_COLS`, `_handler.ts:84-92`) e
nenhuma aba ou filtro usa. E o discriminante de "este canal entrega grupos" também já existe:
`CHANNEL_CAPABILITIES[provider].groups`, em `lib/channels/capabilities.ts`. Isto é tela mais um
parâmetro de schema.

**Tech Stack:** Next.js 16 App Router, React 19, TS estrito, Postgres/Supabase com RLS.

**Spec:** nenhuma. A única decisão de projeto da lacuna ⑥ do
[comparativo](../../research/atendechat-inbox-comparativo.md) — *"só mostrar a aba quando houver
conexão que entrega grupos"* — já está tomada e justificada: aba sempre vazia é pior que aba nenhuma.
E o mapa que responde isso já existe no código, então nem capacidade nova é preciso inventar.

---

## ⛔ A ordem é obrigatória, e ignorá-la é retrabalho garantido

A aba de Grupos é uma **sexta aba** em `InboxFilters.tsx` — e o **PR 0** já está mexendo exatamente
ali, acrescentando a contagem de "Fechadas" e passando os filtros auxiliares para as contagens.

```
origin/main:components/inbox/InboxFilters.tsx:21
  export type InboxTab = "unassigned" | "mine" | "all" | "closed" | "ai";
```

Os dois PRs tocam o mesmo tipo, o mesmo array, a mesma regra de visibilidade por papel e a mesma rota
de contadores. Andando juntos, conflitam nos quatro. **Este plano começa quando o PR 0 tiver
mergeado** — e aí ele aproveita a estrutura pronta, incluindo o mecanismo de contagem por filtro.

---

## Global Constraints

- ⛔ **Nada de `if (provider === "waha")`.** O `lint:channels` reprova, e é o invariante 1 da doutrina
  de canal: a tela recebe um rótulo neutro. Use `CHANNEL_CAPABILITIES[provider].groups`.
- **Grupo NÃO vira lead.** A doutrina manda pular o vínculo com CRM quando o chat é de grupo
  (`CLAUDE.md`: *SKIP CRM binding se `chatId.endsWith('@g.us')`*). Mostrar na tela e deixar responder
  é outra coisa — e é o que este plano faz. **Nada aqui cria lead, demanda ou contato.**
- **Todo filtro da tela é parâmetro do schema Zod** (decisão D1 do PR 0). A cerca
  `tests/unit/rota-le-todo-filtro-do-schema.test.ts` deriva as chaves do schema; filtro que nasce
  fora dela nasce órfão — foi exatamente como o "Não lidos" virou ilha.
- **Toda string nova em `lib/i18n/dicionario.ts`** (erro nº 11 dos recorrentes).
- **Branch nasce de `origin/main`.** Nenhuma migration: não há schema novo.
- ⛔ **Vendemos tenants.** O filtro entra **compondo** sobre a query que já tem
  `.eq("organization_id", ctx.organization_id)` — o handler roda em **admin client** e passa por cima
  da RLS, então esse filtro é a barreira **única**. Nunca abra consulta paralela.

## File Structure

| arquivo | responsabilidade |
|---|---|
| `lib/schemas/messaging.ts` (**modificar**) | `is_group` como parâmetro de consulta |
| `app/api/v1/conversations/_handler.ts` (**modificar**) | o predicado, compondo |
| `app/api/v1/conversations/counts/route.ts` (**modificar**) | a contagem da aba, pela fábrica |
| `components/inbox/InboxFilters.tsx` (**modificar**) | a aba, visível por capacidade |
| `hooks/inbox/useConversationsRealtime.ts` (**modificar**) | o transporte |
| `tests/unit/aba-de-grupos.test.tsx` (**criar**) | a aba e a visibilidade |
| `tests/invariants/grupos-filtram-no-banco.test.ts` (**criar**) | o filtro no banco |

---

## Task 1: O filtro atravessa as quatro peças

**Files:** schema, handler, hook, e os dois testes

**Interfaces:**
- Produces: `listConversationsQuerySchema` com `is_group?: boolean`; `ConversationsFilters` com o mesmo

- [ ] **Step 1: Escreva os testes que falham**

```ts
// tests/unit/ — a cerca que já existe passa a cobrar sozinha
it("a rota lê TODO filtro do schema", () => { /* já existe: rota-le-todo-filtro-do-schema */ });

// tests/invariants/ — o filtro no BANCO, não na página
it("is_group=true devolve só conversa de grupo", () => { /* … */ });
it("CONTROLE: sem o filtro, as duas aparecem", () => {
  // Guarda de vacuidade: sem este caso, um filtro que devolvesse SEMPRE vazio passaria.
});
it("⛔ organização A não vê grupo de B", () => {
  // O handler roda em admin client: o filtro manual de organização é a barreira ÚNICA.
});
```

- [ ] **Step 2: Rode e confirme o vermelho**

Run: `pnpm test:db && npx vitest run tests/unit/rota-le-todo-filtro-do-schema.test.ts`
Expected: FAIL — o parâmetro não existe.

- [ ] **Step 3: O parâmetro no schema**

```ts
  /**
   * Conversa de grupo de WhatsApp. A coluna `is_group` já existia e já era
   * SELECIONADA pelo handler — nenhuma aba ou filtro a usava. "Não virar lead"
   * (doutrina de grupos) e "não aparecer na tela" são coisas diferentes.
   */
  is_group: z.coerce.boolean().optional(),
```

- [ ] **Step 4: O predicado, compondo**

Em `_handler.ts`, **sobre a query que já filtra a organização** — nunca numa consulta nova:

```ts
  if (q.is_group !== undefined) query = query.eq("is_group", q.is_group);
```

- [ ] **Step 5: O transporte** — `ConversationsFilters` em `hooks/inbox/useConversationsRealtime.ts`

- [ ] **Step 6: Rode e confirme o verde** — Expected: PASS

- [ ] **Step 7: Gates + commit**

```bash
rm -f tsconfig*.tsbuildinfo; pnpm typecheck && pnpm lint && pnpm lint:channels
git add lib/schemas/messaging.ts app/api/v1/conversations/_handler.ts hooks/inbox/useConversationsRealtime.ts tests/
git commit -m "feat(inbox): conversa de grupo vira filtro de consulta, no banco"
```

- [ ] **Step 8: Sabote o que acabou de commitar**

**Preveja duas, porque são guardas distintas:**

1. Comentar o predicado do handler → derruba **1 caso** (`is_group=true devolve só grupo`), e a cerca
   `rota-le-todo-filtro-do-schema` **também** cai, porque ela cobra que a rota leia cada chave. Duas
   quedas, por dois motivos — confira que são esses.
2. Tirar o `.eq("organization_id", …)` da query → derruba o caso de isolamento. Se **não** derrubar,
   o teste não montou duas organizações de verdade; pare e conserte o teste antes de seguir.

```bash
pnpm test:db
git checkout -- app/api/v1/conversations/_handler.ts
```

---

## Task 2: A aba, e ela só aparece onde faz sentido

**Files:** `InboxFilters.tsx`, `counts/route.ts`, `tests/unit/aba-de-grupos.test.tsx`

- [ ] **Step 1: Escreva os testes que falham**

```tsx
it("a aba Grupos aparece quando a organização tem canal que entrega grupos", () => { /* … */ });
it("a aba NÃO aparece quando nenhum canal entrega grupos", () => {
  // Aba sempre vazia é pior que aba nenhuma: manda o atendente procurar
  // trabalho que não existe — o mesmo defeito que o badge mentiroso causava.
});
it("o contador da aba bate com a lista", () => {
  // Espelhamento badge×aba. Um badge que conta o que a aba não mostra é pior
  // que badge nenhum.
});
```

- [ ] **Step 2: Rode e confirme o vermelho** — Expected: FAIL

- [ ] **Step 3: A aba**

`InboxTab` ganha `"groups"`; o array ganha a entrada; `tabToFilter` manda `is_group: true`. A
visibilidade sai de `CHANNEL_CAPABILITIES[provider].groups` sobre os canais da organização —
**nunca** de um `if` com o nome do provider.

- [ ] **Step 4: A contagem, PELA FÁBRICA**

Em `counts/route.ts`, a contagem nova entra por `countExact()`:

```ts
    countExact().eq("is_group", true),
```

> ⚠️ **Pela fábrica, nunca montando query própria.** `countExact()` aplica
> `.eq("organization_id", org)` por construção — herdar o filtro tira a opção de esquecer dele.

- [ ] **Step 5: Rode e confirme o verde** — Expected: PASS

- [ ] **Step 6: Strings no dicionário** — "Grupos", e o estado vazio da aba

- [ ] **Step 7: Fragmento em `.changes/`**

```
As conversas de grupo de WhatsApp agora têm aba própria na tela de atendimento. Ela
só aparece se a sua conexão entregar grupos — a API oficial da Meta não entrega. Grupo
continua não virando lead nem contato, como antes.

Você não precisa fazer nada para adotar. Crédito: @paulolimajr77
```

- [ ] **Step 8: Gates + commit**

- [ ] **Step 9: Sabote**

**Preveja:** trocar a condição de visibilidade por `true` derruba **1 caso** — o da organização sem
canal que entrega grupos. Os outros dois seguem verdes: a aba continua funcionando, ela só aparece
onde não devia. É exatamente o defeito que o caso existe para pegar.

---

## Task 3: Prova pela tela

- [ ] **Step 1:** `tests/e2e/inbox-aba-de-grupos.spec.ts` — a aba aparece, filtra, o contador bate, e
  **nenhum lead foi criado** por abrir uma conversa de grupo. Asserção no valor, nunca na presença.

- [ ] **Step 2: Registre no CI** — `SPECS_PARTE_N` do `.github/workflows/e2e.yml`, ou `FORA_DO_CI`
  **com motivo escrito**. `tests/unit/e2e-cobertura-completa.test.ts` reprova spec órfã.

  ```bash
  grep -ciE "waha|resend|nuvemshop|redis" tests/e2e/inbox-aba-de-grupos.spec.ts
  ```

- [ ] **Step 3: Evidência em `evidence/`**, versionada — `.superpowers/` é ignorado pelo git.

---

## Definition of Done

Além dos 17 itens do `CLAUDE.md`:

- [ ] **O PR 0 mergeou antes** — conferido, não presumido
- [ ] `typecheck` (após `rm -f tsconfig*.tsbuildinfo`), `lint`, `lint:channels`, `test:unit`,
      `test:shell`, `build` e `test:db` zerados
- [ ] `pnpm lint:channels` verde **com atenção**: é o gate que pega `if (provider === …)`
- [ ] Spec e2e registrada em `SPECS_PARTE_N` ou `FORA_DO_CI` com motivo
- [ ] ⛔ **Organização A não vê grupo de B** — caso de isolamento verde. Falhando, cancela o PR
- [ ] Nenhum lead, contato ou demanda criado a partir de conversa de grupo
- [ ] Strings novas em `lib/i18n/dicionario.ts`
- [ ] Fragmento com `Crédito: @paulolimajr77`
- [ ] Toda tarefa passou pela sabotagem e ficou vermelha quando devia
- [ ] **O Paulo provou na tela** — com canal por QR Code (a aba aparece) e conferindo que numa
      organização sem esse canal ela **não** aparece — e só então o PR sai do rascunho

## Fora de escopo

- **Responder em grupo com menção a participante** — o identificador do remetente num grupo é
  `p.author`, não `p.from`, e mencionar exige montar o payload por canal. Item próprio.
- **Lista de participantes do grupo** — o WAHA entrega, mas é dado pessoal de gente que nunca falou
  com a empresa. Precisa de decisão de LGPD antes de tela.
- **Grupo virar lead** — recusado pela doutrina, e não é omissão.
