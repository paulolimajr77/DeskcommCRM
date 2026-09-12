# "+ Nova conversa" no Inbox — plano

> **Para quem executa:** siga tarefa a tarefa. Os passos usam caixinha (`- [ ]`).

**Goal:** quem trabalha no Inbox consegue iniciar uma conversa sem sair dele — inclusive com um número
que ainda não é contato.

**Architecture:** **nenhuma mudança de API, de schema ou de validação.** Medido: a rota
`POST /api/v1/conversations/open-with-contact` já aceita `phone_number` sem `contact_id`, e
`openSharedContactConversation` já **cria o contato** via `fn_upsert_wa_contact`. Isto é tela.

**Tech Stack:** Next.js 16 App Router, React 19, TS estrito, Tailwind 4, shadcn/ui.

**Spec:** nenhuma. A lacuna ② do [comparativo](../../research/atendechat-inbox-comparativo.md) previa
uma decisão de projeto ("provavelmente só precisa aceitar telefone sem `contact_id`"); a medição
mostrou que a decisão já está tomada no código. Sem decisão, spec seria papel.

---

## Por que não há spec, medido

```bash
git show origin/main:lib/schemas/messaging.ts | sed -n '170,180p'
git show origin/main:lib/messaging/open-shared-contact-conversation.ts | grep -n "fn_upsert_wa_contact"
```

O schema (`openConversationWithContactSchema`) aceita `channel_session_id?`, `contact_id?`,
`phone_number?` e `name?`, exigindo **um dos dois** identificadores. A implementação procura o contato
pelo telefone (`encontrarContatoPorTelefone`), e **cria** quando não acha.

A porta existe em **dois** lugares hoje, e nenhum é o Inbox:
`components/contacts/ContactsTable.tsx:121` e `components/inbox/media/ContactCard.tsx:74`.

---

## Global Constraints

- **`/api/v1/` é contrato** — nenhum parâmetro novo, nenhum campo removido.
- **Toda string nova entra em `lib/i18n/dicionario.ts`** — erro nº 11 dos recorrentes (PRs #631,
  #600). O guardião do espanhol é cego a `t(<variável>)`, então não pega sozinho.
- **Ícone vem de `lib/ui/icons`**, nunca de `@phosphor-icons/react` direto.
- **Nada de `if (provider === …)` na tela** — o `lint:channels` reprova. Use o rótulo neutro
  (`fonteDeTemplates`) ou `CHANNEL_CAPABILITIES`.
- **Branch nasce de `origin/main`**, nunca da `vps/pljr-combinada`.

## File Structure

| arquivo | responsabilidade |
|---|---|
| `components/inbox/NovaConversaDialog.tsx` (**criar**) | o modal: telefone, nome opcional, seletor de conexão |
| `components/inbox/InboxFilters.tsx` (**modificar**) | o botão `+` no topo da lista |
| `lib/i18n/dicionario.ts` (**modificar**) | as strings novas |
| `tests/unit/nova-conversa-no-inbox.test.tsx` (**criar**) | o comportamento do modal |

---

## Task 1: O modal

**Files:**
- Create: `components/inbox/NovaConversaDialog.tsx`
- Test: `tests/unit/nova-conversa-no-inbox.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/conversations/open-with-contact` (contrato existente)
- Produces: `<NovaConversaDialog open onOpenChange onAberta={(conversationId) => void} />`

- [ ] **Step 1: Escreva o teste que falha**

Quatro casos, e o terceiro é a guarda de vacuidade:

```tsx
it("telefone vazio mantém o botão desabilitado", () => { /* … */ });

it("envia phone_number e name, sem contact_id, para a rota existente", async () => {
  // Prova o ponto do plano: nada de API muda. O corpo tem phone_number e NÃO tem contact_id.
});

it("CONTROLE: com um telefone válido o botão habilita", () => { /* … */ });

it("erro 'invalid_phone' da rota vira mensagem na tela, não erro mudo", async () => {
  // A rota devolve `invalid_phone` (route.ts:56). Sem este caso, o modal engole e
  // a pessoa fica olhando um botão que não faz nada.
});
```

- [ ] **Step 2: Rode e confirme o vermelho**

Run: `npx vitest run tests/unit/nova-conversa-no-inbox.test.tsx`
Expected: FAIL — o componente não existe.

- [ ] **Step 3: Escreva o modal**

Campos: **telefone (obrigatório)**, **nome (opcional)**, **conexão** (só aparece com duas ou mais —
mesmo critério que o seletor de canal do `InboxFilters` já usa). Ao abrir com sucesso, navegue para a
conversa devolvida.

> **O seletor de modelo aprovado NÃO entra aqui.** A tela que já resolve isso é o
> `JanelaFechadaAviso`, que aparece **na conversa** quando a janela está fechada, com a lista certa
> por conta (`fonteDeTemplates`). Duplicar o seletor no modal criaria uma segunda régua de "qual
> modelo posso mandar" — e o comentário de `lib/channels/templates-fonte.ts` explica por que juntar
> as listas produz envio que a plataforma recusa. Conversa nova cai no fluxo que já existe.

- [ ] **Step 4: Rode e confirme o verde**

Run: `npx vitest run tests/unit/nova-conversa-no-inbox.test.tsx`
Expected: PASS (4 casos)

- [ ] **Step 5: As strings no dicionário**

"Nova conversa", "Telefone", "Nome (opcional)", "Conexão", "Iniciar conversa" e a mensagem de telefone
inválido entram em `lib/i18n/dicionario.ts`.

- [ ] **Step 6: Gates + commit — o commit vem ANTES da sabotagem**

```bash
rm -f tsconfig*.tsbuildinfo; pnpm typecheck; echo exit=$?
pnpm lint; echo exit=$?
pnpm lint:channels; echo exit=$?
git add components/inbox/NovaConversaDialog.tsx tests/unit/nova-conversa-no-inbox.test.tsx lib/i18n/dicionario.ts
git commit -m "feat(inbox): iniciar conversa sem sair da tela de atendimento"
```

- [ ] **Step 7: Sabote o que acabou de commitar**

**Preveja:** mandar `contact_id: null` junto no corpo derruba **1 caso** — o que cobra "sem
`contact_id`". Os outros 3 seguem verdes: é a prova de que o teste vigia o contrato, não só o fluxo.

```bash
npx vitest run tests/unit/nova-conversa-no-inbox.test.tsx
git checkout -- components/inbox/NovaConversaDialog.tsx
```

Expected: **1 failed de 4**, o previsto.

---

## Task 2: O botão no Inbox

**Files:**
- Modify: `components/inbox/InboxFilters.tsx`
- Test: o mesmo arquivo da Task 1

- [ ] **Step 1: Escreva o caso que falha**

```tsx
it("o botão de nova conversa fica no topo da lista e abre o modal", () => { /* … */ });
it("papel `viewer` NÃO vê o botão", () => {
  // A rota exige `agent` (route.ts:27). Oferecer na tela o que a API recusa
  // produz erro que parece defeito do sistema.
});
```

- [ ] **Step 2: Rode e confirme o vermelho** — Expected: FAIL

- [ ] **Step 3: Acrescente o botão**, respeitando o papel

- [ ] **Step 4: Rode e confirme o verde** — Expected: PASS

- [ ] **Step 5: Fragmento em `.changes/`**

```
Agora dá para começar uma conversa sem sair da tela de atendimento — inclusive com
um número que ainda não está na sua lista de contatos. O botão fica no topo da lista.

Você não precisa fazer nada para adotar. Crédito: @paulolimajr77
```

- [ ] **Step 6: Gates + commit**

```bash
rm -f tsconfig*.tsbuildinfo; pnpm typecheck && pnpm lint && pnpm lint:channels
git add components/inbox/InboxFilters.tsx tests/unit/nova-conversa-no-inbox.test.tsx .changes/
git commit -m "feat(inbox): o botao de nova conversa entra no topo da lista"
```

- [ ] **Step 7: Sabote**

**Preveja:** tirar a guarda de papel derruba **1 caso** — o do `viewer`. Expected: **1 failed**.

---

## Task 3: Prova pela tela

- [ ] **Step 1: Spec Playwright**

`tests/e2e/inbox-nova-conversa.spec.ts`, dirigindo o frontend: abrir o Inbox, clicar no `+`, digitar
um número **que não está na base**, iniciar, e conferir que a conversa abre e que o contato passou a
existir. Asserção **no valor** (texto exato, contagem), nunca na presença.

- [ ] **Step 2: Registre a spec no CI**

Entra em `SPECS_PARTE_N` do `.github/workflows/e2e.yml`, ou em `FORA_DO_CI` **com motivo escrito**.
`tests/unit/e2e-cobertura-completa.test.ts` reprova spec órfã.

- [ ] **Step 3: Evidência em `evidence/`** — versionada. `.superpowers/` é ignorado pelo git.

---

## Definition of Done

Além dos 17 itens do `CLAUDE.md`:

- [ ] `pnpm typecheck` (após `rm -f tsconfig*.tsbuildinfo`), `lint`, `lint:channels`, `test:unit`,
      `test:shell` e `build` zerados — os **cinco** passos do job `verify` medidos em `origin/main`,
      não os três que o `CLAUDE.md` lista
- [ ] Spec e2e registrada em `SPECS_PARTE_N` ou `FORA_DO_CI` com motivo
- [ ] Strings novas em `lib/i18n/dicionario.ts`
- [ ] Fragmento com `Crédito: @paulolimajr77`; **nenhuma** seção `## [x.y.z]` à mão no `CHANGELOG.md`
- [ ] Nenhum arquivo de marca, `.env` ou config do fork no diff
- [ ] Toda tarefa passou pela sabotagem e ficou vermelha quando devia
- [ ] **O Paulo provou na tela da nossa instalação**, provocando o caminho do erro (número inválido,
      número que já é contato, organização com uma conexão só) — e só então o PR sai do rascunho
