# Assinatura do atendente na mensagem — plano

> **Para quem executa:** siga tarefa a tarefa. Os passos usam caixinha (`- [ ]`).

**Goal:** o cliente sabe com quem está falando — a mensagem sai com o nome de quem a escreveu, e isso
liga e desliga.

**Architecture:** o discriminante **já existe no schema**: `messages.sent_by_user_id` é preenchido
quando quem envia é uma pessoa e fica nulo quando quem envia é o agente. A assinatura é decidida por
esse campo, nunca por um `if` na tela. A preferência mora em `organizations.settings` (padrão
**desligado**) e o estado de cada mensagem em `messages.metadata`, para o histórico saber depois.

**Tech Stack:** Next.js 16 App Router, React 19, TS estrito, Postgres/Supabase com RLS.

**Spec:** nenhuma. A lacuna ⑤ do [comparativo](../../research/atendechat-inbox-comparativo.md) tem
duas regras, e as duas já estão medidas contra o código (abaixo). Sem decisão em aberto, spec é papel.

---

## As duas regras, e por que elas não são opinião

**1. Mensagem do agente de IA não é assinada.** Assinar com o nome de uma pessoa algo que a pessoa não
escreveu é fazer o produto mentir sobre autoria — e, num CRM que atende cliente final, isso é do tipo
que vira reclamação. O campo que separa os dois é `messages.sent_by_user_id`: presente = pessoa.

**2. Modelo aprovado não é assinado.** O texto do modelo é fixo e aprovado pela plataforma; alterar o
corpo faz o envio ser recusado. Quem sabe se a conversa está nesse regime é
`lib/channels/templates-fonte.ts` — **não** um `if (provider === …)`, que o `lint:channels` reprova.

---

## Global Constraints

- **Toda string nova entra em `lib/i18n/dicionario.ts`** (erro nº 11 dos recorrentes).
- **Nada de `if (provider === …)`** — use o rótulo neutro. É o invariante 1 da doutrina de canal.
- **Migration em três lugares, no MESMO commit**: arquivo, apêndice idempotente do `baseline.sql`,
  linha no `MANIFEST.md`. O número se mede **na `origin/main`, no commit** — nunca no disco.
- **Branch nasce de `origin/main`.**
- ⛔ **Vendemos tenants.** A preferência é por organização e vive em `organizations.settings`, tabela
  já tenant-aware. Nenhuma função nova; se alguma vier, ela **não** recebe a organização por
  argumento sem conferir quem chamou (ver `FILA.md`, item 13).

## File Structure

| arquivo | responsabilidade |
|---|---|
| `lib/mensagens/assinatura.ts` (**criar**) | a REGRA pura: assina ou não, e como fica o texto |
| `lib/schemas/settings.ts` (**modificar**) | a preferência no schema de configurações |
| `app/api/v1/conversations/[id]/messages/route.ts` (**modificar**) | aplica a regra no envio |
| `components/inbox/...` (**modificar**) | o botão de alternância e o texto do campo |
| `tests/unit/assinatura-do-atendente.test.ts` (**criar**) | a regra pura, pelos dois lados |

---

## Task 1: A regra, pura e sozinha

**Files:**
- Create: `lib/mensagens/assinatura.ts`
- Test: `tests/unit/assinatura-do-atendente.test.ts`

**Interfaces:**
- Produces: `aplicarAssinatura({ corpo, nomeDeQuemEnvia, ligadaNaOrg, ehModeloAprovado }): string`

- [ ] **Step 1: Escreva o teste que falha**

Seis casos. Os dois primeiros são o recurso; os quatro seguintes são o que impede o estrago:

```ts
it("assina com o primeiro nome quando está ligada", () => { /* "*Ana*\n\nOlá" */ });
it("CONTROLE: desligada, o corpo sai intacto", () => { /* … */ });

it("NÃO assina quando não há pessoa (mensagem do agente)", () => {
  // nomeDeQuemEnvia = null. Assinar aqui faria o produto mentir sobre autoria.
});
it("NÃO assina modelo aprovado", () => {
  // O texto é fixo; alterar faz a plataforma recusar o envio.
});
it("GUARDA DE VACUIDADE: corpo vazio continua vazio, não vira só a assinatura", () => {
  // Sem este caso, uma implementação que sempre concatena passaria nos de cima.
});
it("não assina DUAS vezes quando o corpo já começa com a assinatura", () => {
  // Reenvio e rascunho passam duas vezes pelo mesmo caminho.
});
```

- [ ] **Step 2: Rode e confirme o vermelho**

Run: `npx vitest run tests/unit/assinatura-do-atendente.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Escreva a regra**

Função pura, sem acesso a banco e sem React. Recebe o que precisa e devolve o corpo. Fica testável
sozinha — e é o que permite que a sabotagem do Step 6 seja precisa.

- [ ] **Step 4: Rode e confirme o verde** — Expected: PASS (6 casos)

- [ ] **Step 5: Gates + commit**

```bash
rm -f tsconfig*.tsbuildinfo; pnpm typecheck && pnpm lint && pnpm lint:channels
git add lib/mensagens/assinatura.ts tests/unit/assinatura-do-atendente.test.ts
git commit -m "feat(mensagens): a regra de assinatura do atendente, isolada e testada"
```

- [ ] **Step 6: Sabote o que acabou de commitar**

**Preveja:** tirar a condição de `nomeDeQuemEnvia` derruba **1 caso** — o da mensagem do agente. Tirar
a de modelo aprovado derruba **outro**, sozinho. Se uma sabotagem derrubar **dois**, as duas regras
estão amarradas na mesma condição, e uma delas vai sumir no primeiro refactor: separe.

```bash
npx vitest run tests/unit/assinatura-do-atendente.test.ts
git checkout -- lib/mensagens/assinatura.ts
```

Expected: **1 failed** em cada sabotagem, isolados.

---

## Task 2: A preferência da organização

**Files:**
- Modify: `lib/schemas/settings.ts`, o apêndice do `baseline.sql`, `MANIFEST.md`
- Create: a migration
- Test: `tests/invariants/assinatura-preferencia.test.ts`

- [ ] **Step 1: Meça o número da migration NA ÂNCORA, agora**

```bash
git fetch origin
git ls-tree -r --name-only origin/main -- supabase/migrations \
  | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1
git ls-tree -r --name-only origin/main -- supabase/migrations | grep -c "$(date +%Y%m%d)"
```

⚠️ **Não confie em número escrito neste plano** — não há nenhum, de propósito. O PR 0 e a spec do
protocolo também vão medir, e quem commitar primeiro leva o número. Renumerar troca **número e
timestamp juntos**: trocar só o número é o que fabrica colisão de timestamp.

- [ ] **Step 2: Escreva o invariante que falha**

Que a preferência aceite só booleano, que o **padrão seja desligado**, e que uma organização não leia
a preferência da outra.

- [ ] **Step 3: Rode e confirme o vermelho** — `pnpm test:db` — Expected: FAIL

- [ ] **Step 4: A chave no schema e no settings**

`assinatura_do_atendente: z.boolean().default(false)` dentro do bloco de atendimento de
`organizations.settings`. **Padrão desligado**: ligado por padrão mudaria, num update automático, o
texto que já sai para clientes de todo self-hoster — sem ninguém ter pedido.

- [ ] **Step 5: A tripla** — migration + apêndice idempotente no `baseline.sql` + linha no `MANIFEST.md`

- [ ] **Step 6: Prove o baseline no Postgres descartável**

`pgvector/pgvector:pg15` (o PISO), em modo **install** (`ON_ERROR_STOP=1`) **e update** (re-aplicar,
sem a flag). Os dois têm de passar.

- [ ] **Step 7: Gates + commit — a tripla vai no MESMO commit**

- [ ] **Step 8: Sabote**

**Preveja:** trocar o padrão para `true` derruba **1 caso** — o do padrão. Se não derrubar, o teste
está lendo a configuração de uma organização que já a tem gravada, e não o padrão.

---

## Task 3: A tela

**Files:**
- Modify: o composer e a rota de envio
- Test: `tests/unit/assinatura-na-tela.test.tsx`

- [ ] **Step 1: O teste** — o botão reflete a preferência; o texto do campo muda para "Assinando
  como {nome}…"; **o botão não aparece quando a conversa está em regime de modelo aprovado**.

- [ ] **Step 2: Vermelho.** **Step 3:** implemente. **Step 4: verde.**

- [ ] **Step 5: Strings no dicionário** — "Assinar mensagens", "Assinando como {nome}…"

- [ ] **Step 6: Fragmento em `.changes/`**

```
As mensagens que você envia podem sair com o seu nome, para o cliente saber com quem
está falando. Liga e desliga em Configurações, e vem desligado. Mensagem enviada pelo
atendimento automático nunca é assinada.

Você não precisa fazer nada para adotar. Crédito: @paulolimajr77
```

- [ ] **Step 7: Gates + commit.** **Step 8: Sabote** — tirar a guarda de modelo aprovado na tela
  derruba **1 caso**; a regra pura da Task 1 continua verde, porque são camadas diferentes. É a prova
  de que nenhuma das duas é redundante.

---

## Definition of Done

Além dos 17 itens do `CLAUDE.md`:

- [ ] `typecheck` (após `rm -f tsconfig*.tsbuildinfo`), `lint`, `lint:channels`, `test:unit`,
      `test:shell`, `build` e `test:db` zerados
- [ ] Migration numerada contra `origin/main` **no commit**, tripla no mesmo commit
- [ ] Baseline provado em **install e update** num `pgvector/pgvector:pg15`
- [ ] ⛔ **Nenhuma organização lê a preferência de outra** — caso de isolamento verde. Falhando,
      cancela o PR
- [ ] Strings novas em `lib/i18n/dicionario.ts`
- [ ] Fragmento com `Crédito: @paulolimajr77`
- [ ] Toda tarefa passou pela sabotagem e ficou vermelha quando devia
- [ ] **O Paulo provou na tela** — enviando assinado, enviando com o automático ligado (não pode
      assinar) e enviando modelo aprovado (não pode assinar) — e só então o PR sai do rascunho

## Fora de escopo

- **Preferência por usuário**, além da de organização. Aditivo; entra se alguém pedir.
- **Assinar mídia e áudio** — a legenda tem limite por canal e o áudio não tem texto.
- **Formato configurável da assinatura** — negrito e quebra dupla, fixo. Configurável vira suporte.
