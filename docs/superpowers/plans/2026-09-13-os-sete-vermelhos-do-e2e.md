# Os sete vermelhos do e2e — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zerar os sete vermelhos da rodada e2e 34760238143 — consertando o que é defeito, roteando cada conserto para a branch que o causou, e nomeando por escrito o que **não** é conserto.

**Architecture:** Nenhum conserto nasce na `vps/pljr-combinada`. Cada um nasce na branch dona do comportamento que o quebrou e desce por `cherry-pick`. Foi medido que os arquivos tocados são **idênticos** entre a combinada e suas branches donas, então todo patch aplica limpo nas duas pontas. O único conserto de produto (o campo de busca que não limpa) é feito por TDD, com o par de controle que impede o conserto de virar um defeito novo.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript estrito · Playwright · Vitest + Testing Library + user-event · Git.

**Spec:** não há doc separado. O diagnóstico está na seção **Diagnóstico medido** abaixo, e cada linha dele saiu de leitura do código, não de suposição.

## Global Constraints

- **Nenhum container nesta máquina.** `pnpm test:db` e o e2e local sobem Postgres/Supabase em Docker e estão proibidos aqui (medido: 35 e 81 min só para criar o container). O veredito de e2e vem do **CI do fork**. Localmente só `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:shell`.
- **Mão única.** Todo commit nasce na branch dona e desce para `vps/pljr-combinada` por `cherry-pick`. Nunca o contrário. Nunca commitar direto na combinada.
- **Sem PR para o Rafael.** Decisão pendente do Paulo.
- **`NOSSA-REGRA.md`, `NOSSA-INTEGRACAO.md` e `FILA.md` nunca entram em commit** — o fork é público e eles carregam caminhos da VPS, usuário de SSH, domínio e nomes de backup.
- **Nunca imprimir valor de configuração** (linha de `.env`, `crontab -l`, `docker inspect … .Config.Env`). Só o NOME da variável ou o sha256 curto.
- Copy em pt-BR; toda string de tela passa por `t()`.
- `pnpm typecheck` e `pnpm lint` zerados ao fim de **cada** task.
- `$SCRATCH` = o diretório de rascunho da sessão, onde os dois patches prontos já estão salvos.

## Diagnóstico medido

| # | Vermelho | O que é | Branch dona |
|---|---|---|---|
| 1 | `agenda-presenca-recuperacao.spec.ts:289` | **Rastro nosso.** A Onda 3 fundiu os dois campos do cliente em um só; com cliente escolhido não existe campo, existe o nome + "Tirar o cliente". A spec procurava `getByLabel("Quem será atendido")` | `fix/atualizacao-segura-e-agenda` |
| 2 | `system-update.spec.ts` (3 asserções) | **Rastro nosso.** A tela deixou de dizer "Atualizando para a versão X" antes de haver passo; agora diz "Pedido enviado — esperando o servidor pegar". Uma das quatro asserções foi atualizada no PR, as outras três não | `fix/tela-de-atualizacao-conta-o-pe` |
| 3 | `inbox-busca-e-filtros:95` | **Defeito de produto.** `InboxFilters` guarda o texto em `useState(value.search)` e nunca ressincroniza. "Limpar filtros" zera o filtro aplicado e deixa o termo escrito na tela — a tela mostra uma busca que não vale mais | `fix/busca-e-filtros-do-inbox` |
| 4 | `inbox-busca-e-filtros:134` | **Teste frágil.** O badge da aba só aparece com `count > 0` (decisão deliberada, vale para todas as abas). O teste não cria conversa fechada nenhuma — torce para o ambiente ter | `fix/busca-e-filtros-do-inbox` |
| 5 | `inbox-busca-e-filtros:81` | **Não concluído por leitura.** A lógica do `EmptyPorFiltro` está correta no código lido. Precisa do log do CI | `fix/busca-e-filtros-do-inbox` |
| 6 | `autonomia-assistida:252` | **Fora deste plano** — não medido, e fora do raio das nossas mudanças | — |
| 7 | `degradacao-silenciosa:117` | **Não é conserto.** É `test.fail()` deliberado: catraca de uma lacuna conhecida (nada avisa quando a entrega de `postgres_changes` morre). Estar vermelho é o desenho funcionando | — |

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `tests/e2e/agenda-presenca-recuperacao.spec.ts` | prova que a entrada pelo Inbox chega com o cliente preso | Modificar (patch pronto) |
| `tests/e2e/system-update.spec.ts` | prova a tela de atualização nos dois piores dias | Modificar (patch pronto) |
| `components/inbox/InboxFilters.tsx` | barra de busca + filtros + abas do inbox | Modificar (6 linhas) |
| `tests/unit/limpar-filtros-limpa-o-campo.test.tsx` | prende o conserto acima e o seu par de controle | Criar |
| `tests/e2e/inbox-busca-e-filtros-dizem-a-verdade.spec.ts` | prova busca e filtros pela tela | Modificar (fixture própria) |

---

### Task 0: Preparação (uma vez, antes de tudo)

- [ ] **Step 1: Conferir que os dois patches estão onde o plano diz**

```bash
ls -l "$SCRATCH/01-presenca.patch" "$SCRATCH/02-system-update.patch"
```

Esperado: os dois existem (28 e 37 linhas). Se sumiram (o rascunho é da sessão), regenere-os a partir da árvore suja da combinada com `git diff -- <spec>` antes de qualquer `git stash`.

- [ ] **Step 2: Escrever os quatro arquivos de mensagem de commit**

Cada task abaixo mostra o conteúdo exato de `msg-01.txt` … `msg-04.txt`. Escreva os quatro em `$SCRATCH` agora, com a ferramenta de escrita de arquivo — **não por heredoc**: as mensagens têm travessões e acentos, e o `-F` do git preserva o arquivo como está, sem a expansão do shell no caminho.

```bash
ls "$SCRATCH"/msg-0*.txt
```

Esperado: os quatro listados.

---

### Task 1: O conserto da spec de presença desce pela branch dona

**Files:**
- Modify: `tests/e2e/agenda-presenca-recuperacao.spec.ts`
- Patch pronto: `$SCRATCH/01-presenca.patch`

**Interfaces:**
- Consome: nada.
- Produz: o SHA do commit, necessário para o `cherry-pick` do Step 5.

- [ ] **Step 1: Guardar o que está solto na combinada**

A árvore pode já conter as duas edições (feitas antes deste plano). Tire-as do caminho sem perdê-las:

```bash
git stash push -m "consertos de spec (plano 2026-09-13)" -- tests/e2e/agenda-presenca-recuperacao.spec.ts tests/e2e/system-update.spec.ts
git status --short
```

Esperado: nenhuma das duas specs aparece mais.

- [ ] **Step 2: Ir para a branch dona e conferir que o patch aplica**

```bash
git switch fix/atualizacao-segura-e-agenda
git apply --check "$SCRATCH/01-presenca.patch" && echo "aplica limpo"
```

Esperado: `aplica limpo`. Foi medido que o arquivo é idêntico ao da combinada — uma falha aqui significa que a árvore mudou desde a medição. **Pare e releia**, não force.

- [ ] **Step 3: Aplicar e commitar**

```bash
git apply "$SCRATCH/01-presenca.patch"
git add tests/e2e/agenda-presenca-recuperacao.spec.ts
git commit -F "$SCRATCH/msg-01.txt"
git log --oneline -1
```

Conteúdo de `$SCRATCH/msg-01.txt`:

```
test(e2e): a prova da presenca confere o cliente do jeito que a tela mostra hoje

A Onda 3 fundiu os dois campos do cliente num so. Com alguem escolhido nao ha
campo nenhum: ha o NOME e a saida "Tirar o cliente". A spec ainda procurava
`getByLabel("Quem sera atendido")` e o UUID dentro dele — um campo que a tela
nao tem mais.

O que ela prova continua o mesmo: entrar pelo Inbox chega com o cliente daquela
conversa ja preso. Muda so o jeito de olhar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

- [ ] **Step 4: Gates**

```bash
npx tsc --noEmit -p tsconfig.typecheck.json && npx eslint tests/e2e/agenda-presenca-recuperacao.spec.ts && echo "verde"
```

Esperado: `verde`.

- [ ] **Step 5: Descer para a combinada**

```bash
SHA=$(git rev-parse HEAD)
git switch vps/pljr-combinada
git cherry-pick "$SHA"
git log --oneline -1
```

Esperado: mesmo assunto de commit, hash novo. Conflito não deve acontecer (arquivo idêntico, medido) — se acontecer, `git cherry-pick --abort` e reporte.

---

### Task 2: O conserto da spec de atualização desce pela branch dona

**Files:**
- Modify: `tests/e2e/system-update.spec.ts`
- Patch pronto: `$SCRATCH/02-system-update.patch`

**Interfaces:**
- Consome: o stash criado na Task 1 Step 1 (que ainda contém esta spec).
- Produz: o SHA do commit.

> **Nota medida, e ela evita um susto:** `fix/tela-de-atualizacao-conta-o-pe` aparece com 2 commits "fora da combinada", mas `git cherry` mostra os dois com `-` — o conteúdo já está lá, aplicado com hashes diferentes. Por isso **`cherry-pick`, nunca `merge`**: um merge tentaria reaplicar os dois e conflitaria contra o que já existe.

- [ ] **Step 1: Ir para a branch dona e conferir**

```bash
git switch fix/tela-de-atualizacao-conta-o-pe
git apply --check "$SCRATCH/02-system-update.patch" && echo "aplica limpo"
```

- [ ] **Step 2: Aplicar e commitar**

```bash
git apply "$SCRATCH/02-system-update.patch"
git add tests/e2e/system-update.spec.ts
git commit -F "$SCRATCH/msg-02.txt"
```

Conteúdo de `$SCRATCH/msg-02.txt`:

```
test(e2e): a spec da atualizacao para de esperar trabalho antes de haver trabalho

O conserto desta branch deu nome ao silencio: entre o clique e o primeiro passo
passam ate cinco minutos, e nesse intervalo a tela diz "Pedido enviado —
esperando o servidor pegar" em vez de afirmar um trabalho que ainda nao comecou.

Uma das quatro assercoes ja tinha sido movida para depois do primeiro passo; as
outras tres continuavam cobrando o titulo velho logo apos o clique. Agora elas
cobram o estado certo — e a primeira continua cobrando que a versao de destino
seja nomeada, que e o que este teste existe para vigiar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

- [ ] **Step 3: Gates**

```bash
npx tsc --noEmit -p tsconfig.typecheck.json && npx eslint tests/e2e/system-update.spec.ts && echo "verde"
```

- [ ] **Step 4: Descer para a combinada e limpar o stash**

```bash
SHA=$(git rev-parse HEAD)
git switch vps/pljr-combinada
git cherry-pick "$SHA"
git stash list
git stash drop
git status --short
```

Esperado: `git status --short` sem nenhuma das duas specs, e o stash vazio. Só solte o stash **depois** de confirmar que os dois commits existem.

---

### Task 3: "Limpar filtros" limpa o campo (defeito de produto, por TDD)

**Files:**
- Create: `tests/unit/limpar-filtros-limpa-o-campo.test.tsx`
- Modify: `components/inbox/InboxFilters.tsx:62` (o `useState`) e o efeito do debounce em `:132-141`

**Interfaces:**
- Consome: `InboxFilters` (`value: InboxFiltersValue`, `onChange: (next) => void`) — a assinatura não muda; o conserto é interno.
- Produz: nenhuma API nova.

**O defeito, em uma frase:** `const [searchInput, setSearchInput] = useState(value.search)` roda uma vez. Quando `limparFiltrosAuxiliares` (`components/inbox/InboxLayout.tsx:149`) zera `value.search`, o campo continua exibindo o termo — e o operador vê na tela uma busca que o servidor não está mais aplicando.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/unit/limpar-filtros-limpa-o-campo.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * "LIMPAR FILTROS" LIMPA O CAMPO — SENÃO A TELA MENTE DE NOVO.
 *
 * O defeito que esta entrega inteira existe para matar é a tela AFIRMAR um
 * estado que o servidor não tem. O botão "Limpar filtros" reintroduzia
 * exatamente isso por outro caminho: zerava o filtro aplicado e deixava o termo
 * escrito na caixa de busca. A lista voltava cheia com um termo visível que já
 * não valia — e quem operasse leria a lista como resultado daquela busca.
 *
 * A causa é o campo ter estado próprio (o debounce mora nele) sem nunca escutar
 * o valor de fora.
 *
 * ⛔ O par de controle é obrigatório aqui: um campo que adote o valor de fora
 * sem critério atropela quem continuou digitando depois do debounce — o conserto
 * viraria um defeito pior, e invisível em teste manual (só aparece para quem
 * digita rápido).
 */
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  useChannelSessions: () => ({ data: [] }),
  channelLabel: () => "",
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: { orgId: "org-1", role: "admin", visibility_mode: "all" } }),
}));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: undefined }),
}));

const { InboxFilters } = await import("@/components/inbox/InboxFilters");

/**
 * O arnês é o `InboxLayout` em miniatura: ele é o dono do estado, e o botão faz
 * o que `limparFiltrosAuxiliares` faz — zera a busca POR FORA do campo.
 * `search-aplicado` é a janela para o valor que já venceu o debounce; esperar
 * por ele é o que torna o teste determinístico sem relógio falso.
 */
function Arnes() {
  const [value, setValue] = useState({ tab: "all" as const, search: "", onlyUnread: false });
  return (
    <>
      <InboxFilters value={value} onChange={setValue} />
      <span data-testid="search-aplicado">{value.search}</span>
      <button onClick={() => setValue((v) => ({ ...v, search: "", onlyUnread: false }))}>
        Limpar filtros
      </button>
    </>
  );
}

afterEach(cleanup);

describe('"Limpar filtros" e o campo de busca', () => {
  it("o campo volta a ficar vazio quando o filtro é limpo por fora", async () => {
    const user = userEvent.setup();
    render(<Arnes />);
    const campo = screen.getByLabelText("Buscar conversas");

    await user.type(campo, "zzqqxxnaoexiste");
    // Espera o debounce (250 ms) entregar o termo ao dono do estado.
    await screen.findByText("zzqqxxnaoexiste", {}, { timeout: 2_000 });

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));

    expect(campo, "o termo continuou escrito numa busca que não vale mais").toHaveValue("");
  });

  it("⛔ CONTROLE: o que ainda está sendo digitado NÃO é atropelado", async () => {
    const user = userEvent.setup();
    render(<Arnes />);
    const campo = screen.getByLabelText("Buscar conversas");

    await user.type(campo, "ab");
    await screen.findByText("ab", {}, { timeout: 2_000 });
    // A pessoa continua digitando DEPOIS de o debounce ter propagado "ab".
    await user.type(campo, "c");
    await new Promise((r) => setTimeout(r, 400));

    expect(campo, "o conserto reverteu a digitação em curso").toHaveValue("abc");
  });
});
```

- [ ] **Step 2: Rodar e ver o primeiro falhar pela razão certa**

```bash
npx vitest run tests/unit/limpar-filtros-limpa-o-campo.test.tsx
```

Esperado: o primeiro caso FALHA com `expected "zzqqxxnaoexiste" to equal ""`; o **controle passa** (é ele que o conserto pode quebrar). Se o controle falhar aqui, o arnês está errado — conserte o arnês antes de tocar no produto.

- [ ] **Step 3: Consertar `InboxFilters`**

Em `components/inbox/InboxFilters.tsx`, logo depois de `const [searchInput, setSearchInput] = useState(value.search);`:

```tsx
  /**
   * O campo escuta o valor de FORA — e só ele.
   *
   * O estado do campo é próprio porque o debounce mora nele. O preço era não
   * saber quando o filtro morria por outro caminho: "Limpar filtros" zerava a
   * busca aplicada e deixava o termo escrito na tela, mostrando uma busca que
   * não valia mais — a mesma mentira de tela que esta entrega existe para matar.
   *
   * A ref guarda o que ESTE campo propagou. Valor de fora diferente dela = a
   * mudança veio de outro lugar, e o campo adota. Igual = foi o próprio campo, e
   * adotar atropelaria quem continuou digitando depois do debounce (o caso de
   * controle em `tests/unit/limpar-filtros-limpa-o-campo.test.tsx`).
   */
  const propagado = useRef(value.search);
  useEffect(() => {
    if (value.search !== propagado.current) {
      propagado.current = value.search;
      setSearchInput(value.search);
    }
  }, [value.search]);
```

E no efeito do debounce, marque o que o campo propagou **antes** de propagar:

```tsx
  useEffect(() => {
    const t = setTimeout(() => {
      const atual = valorRef.current;
      if (searchInput !== atual.search) {
        propagado.current = searchInput;
        onChangeRef.current({ ...atual, search: searchInput });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);
```

- [ ] **Step 4: Rodar e ver os dois passarem**

```bash
npx vitest run tests/unit/limpar-filtros-limpa-o-campo.test.tsx
```

Esperado: 2 passed.

- [ ] **Step 5: Sabotar o conserto para provar que o teste vigia**

Comente a linha `propagado.current = searchInput;` do Step 3 e rode de novo.

Esperado: o **controle** fica vermelho (o campo passa a ser atropelado). Restaure a linha e confirme os dois verdes. Um conserto cujo teste não reprova a sabotagem não está vigiado.

- [ ] **Step 6: Gates e commit na branch dona**

O trabalho dos steps 1–5 foi feito na combinada (é onde a árvore está). Leve-o para a branch dona como patch — o arquivo de produto foi medido como idêntico nas duas, então aplica limpo:

```bash
git diff -- components/inbox/InboxFilters.tsx > "$SCRATCH/03-inbox-filtros.patch"
cp tests/unit/limpar-filtros-limpa-o-campo.test.tsx "$SCRATCH/"
git checkout -- components/inbox/InboxFilters.tsx
rm tests/unit/limpar-filtros-limpa-o-campo.test.tsx
git status --short   # esperado: limpo

git switch fix/busca-e-filtros-do-inbox
git apply "$SCRATCH/03-inbox-filtros.patch"
cp "$SCRATCH/limpar-filtros-limpa-o-campo.test.tsx" tests/unit/
pnpm typecheck && pnpm lint && echo "verde"
git add components/inbox/InboxFilters.tsx tests/unit/limpar-filtros-limpa-o-campo.test.tsx
git commit -F "$SCRATCH/msg-03.txt"
```

Conteúdo de `$SCRATCH/msg-03.txt`:

```
fix(inbox): "Limpar filtros" limpa tambem o campo de busca

O botao zerava o filtro aplicado e deixava o termo escrito na caixa. A lista
voltava cheia com uma busca visivel que o servidor nao estava mais aplicando —
a mesma mentira de tela que esta entrega existe para matar, reintroduzida por
outro caminho.

A causa: o campo guarda o texto em estado proprio (o debounce mora nele) e nunca
escutava o valor de fora. Agora escuta — e so quando a mudanca NAO foi dele, o
que impede o conserto de atropelar quem continua digitando depois do debounce.

Os dois casos, o do conserto e o do atropelamento, ficam presos em
`tests/unit/limpar-filtros-limpa-o-campo.test.tsx`. A sabotagem foi feita: sem a
marca do que o campo propagou, o controle reprova.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

- [ ] **Step 7: Descer para a combinada**

```bash
SHA=$(git rev-parse HEAD)
git switch vps/pljr-combinada
git cherry-pick "$SHA"
```

---

### Task 4: A aba "Fechadas" ganha a conversa fechada que o teste precisa

**Files:**
- Modify: `tests/e2e/inbox-busca-e-filtros-dizem-a-verdade.spec.ts` (o caso `a aba "Fechadas" mostra número`)

**Interfaces:**
- Consome: a sessão logada do `beforeEach` (`page.request` carrega os cookies dela).
- Produz: nada.

**Por que o teste está errado e o produto não:** o badge só aparece com `count > 0`, e isso vale para **todas** as abas — mostrar `0` faria cada aba vazia carregar um zero. O teste depende de existir uma conversa fechada no banco e não cria nenhuma. Em banco fresco ele reprova um produto correto.

**Por que criar, e não fechar uma existente:** o Supabase de e2e é compartilhado entre frentes. Fechar uma conversa que já estava aberta muda o mundo de outras specs. `POST /conversations/open-with-contact` aceita `phone_number` + `name` sem `contact_id` (medido em `lib/schemas/messaging.ts:171`), então o teste cria o próprio dado e não toca no de ninguém.

- [ ] **Step 1: Substituir o caso**

```ts
test('a aba "Fechadas" mostra número', async ({ page }) => {
  // Ela existia sem contador nenhum. Num inbox antigo é o número que diz o
  // tamanho do arquivo, e a ausência fazia a aba parecer um lugar vazio.
  //
  // ⚠️ O badge não mostra zero de propósito — vale para todas as abas. Então o
  // teste PRECISA criar a sua conversa fechada: torcer para o ambiente ter uma
  // é o que fazia este caso reprovar um produto correto em banco fresco. E ele
  // cria a sua em vez de fechar uma existente, porque este Supabase é
  // compartilhado e fechar conversa alheia muda o mundo de outra spec.
  const aberta = await page.request.post("/api/v1/conversations/open-with-contact", {
    data: { phone_number: `+5511${Date.now().toString().slice(-9)}`, name: "Arquivo do teste" },
  });
  expect(aberta.ok(), await aberta.text()).toBe(true);
  const { data: conversa } = await aberta.json();

  const fechada = await page.request.patch(`/api/v1/conversations/${conversa.id}`, {
    data: { status: "closed" },
  });
  expect(fechada.ok(), await fechada.text()).toBe(true);

  await page.reload();
  await expect(page.getByRole("tab", { name: /Fechadas/i })).toHaveText(/\d/);
});
```

- [ ] **Step 2: Gates**

```bash
npx tsc --noEmit -p tsconfig.typecheck.json && npx eslint tests/e2e/inbox-busca-e-filtros-dizem-a-verdade.spec.ts && echo "verde"
```

O veredito de execução vem do CI (Task 5) — este e2e não roda nesta máquina.

- [ ] **Step 3: Commitar na branch dona e descer**

A Task 3 já deixou você em `fix/busca-e-filtros-do-inbox`. Se a edição do Step 1 foi feita na combinada, leve-a por patch do mesmo jeito da Task 3:

```bash
# (só se a edição foi feita na combinada)
git diff -- tests/e2e/inbox-busca-e-filtros-dizem-a-verdade.spec.ts > "$SCRATCH/04-aba-fechadas.patch"
git checkout -- tests/e2e/inbox-busca-e-filtros-dizem-a-verdade.spec.ts
git switch fix/busca-e-filtros-do-inbox
git apply "$SCRATCH/04-aba-fechadas.patch"

git add tests/e2e/inbox-busca-e-filtros-dizem-a-verdade.spec.ts
git commit -F "$SCRATCH/msg-04.txt"
SHA=$(git rev-parse HEAD)
git switch vps/pljr-combinada
git cherry-pick "$SHA"
```

Conteúdo de `$SCRATCH/msg-04.txt`:

```
test(e2e): a prova da aba "Fechadas" cria a conversa fechada que ela precisa

O badge nao mostra zero de proposito — vale para todas as abas. O teste nao
criava conversa fechada nenhuma: torcia para o ambiente ter uma, e em banco
fresco reprovava um produto correto.

Agora ele cria a sua, e cria em vez de fechar uma existente: este Supabase e
compartilhado entre frentes, e fechar conversa alheia muda o mundo de outra
spec.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 5: O CI dá o veredito, e o quinto vermelho ganha diagnóstico

**Files:** nenhum, até o log dizer o quê.

**Interfaces:**
- Consome: os quatro commits das tasks 1–4, já na combinada.
- Produz: o diagnóstico de `inbox-busca-e-filtros:81`, e o conserto dele se houver.

- [ ] **Step 1: Empurrar e disparar**

```bash
git push fork vps/pljr-combinada
git push fork fix/atualizacao-segura-e-agenda fix/tela-de-atualizacao-conta-o-pe fix/busca-e-filtros-do-inbox
gh run list --repo paulolimajr77/DeskcommCRM --limit 5
```

- [ ] **Step 2: Esperar e ler o resultado inteiro**

```bash
gh run watch --repo paulolimajr77/DeskcommCRM <run-id>
gh run view --repo paulolimajr77/DeskcommCRM <run-id> --log-failed > "$SCRATCH/e2e.log" 2>&1
grep -aE "^ *[0-9]+\) |Error:|expect\(" "$SCRATCH/e2e.log" | head -60
```

⚠️ **Não corte a saída com `tail`.** O rodapé guarda a contagem e joga fora os NOMES — foi assim que a contagem anterior saiu errada (cinco reportados, sete existindo).

- [ ] **Step 3: Conferir caso a caso, contra a lista**

Esperado: 1, 2, 3 e 4 verdes. `degradacao-silenciosa` continua vermelho **e isso é o correto** (`test.fail` deliberado). `autonomia-assistida:252` continua vermelho e está fora deste plano.

- [ ] **Step 4: Diagnosticar o quinto com o log real**

Só agora, com a razão que o Playwright imprimiu para `inbox-busca-e-filtros:81`, decidir. **Não adivinhar antes.** Se for defeito de produto, vira uma task nova neste plano, com TDD e par de controle como a Task 3. Se for teste frágil, conserte o teste e diga por quê.

- [ ] **Step 5: Relatar ao Paulo**

Em português claro: o que ficou verde, o que continua vermelho e por quê, e o que sobrou como fila. Sem PR para o Rafael.

---

## O que NÃO entra neste plano, e por quê

**`degradacao-silenciosa.spec.ts:117` — nada a consertar aqui.** É uma catraca: a spec declara `test.fail()` com a razão escrita no próprio arquivo — nenhuma superfície avisa quando a entrega de `postgres_changes` morre; o único estado publicado descreve a ASSINATURA e diz `subscribed` com a entrega morta. O desenho é: quando alguém construir o detector, este teste passa, e *passar* vira o vermelho — obrigando a remoção consciente do `test.fail`. Consertar a spec seria apagar o alarme. **A lacuna em si é item de fila**, não deste plano.

**`autonomia-assistida.spec.ts:252` — fora do raio.** "Resposta aprovada enviada" não aparece. Nenhuma das nossas mudanças toca esse caminho, e eu não o medi. Entra na fila para diagnóstico próprio; palpite aqui seria inventar.
