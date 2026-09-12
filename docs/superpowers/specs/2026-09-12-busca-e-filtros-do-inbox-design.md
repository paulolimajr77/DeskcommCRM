# Busca e filtros do Inbox que dizem a verdade — design

> Data: 2026-09-12 · Âncora: **`origin/main`** (o repo do Rafael) · Medido em `origin/main` @ `e142504d`
> Investigação feita a partir de `vps/pljr-combinada` (a planta própria, jeito 2 do `NOSSA-REGRA.md`);
> **a branch de trabalho nasce de `origin/main`**, nunca da combinada nem do `main` do fork.
> Origem: comparação com a tela de atendimento de um concorrente levou a auditar a nossa. Três filtros afirmam estado falso, sem erro e sem aviso.
> Auditoria completa: [`../../audits/2026-09-11-filtros-e-busca-do-inbox.md`](../../audits/2026-09-11-filtros-e-busca-do-inbox.md)

---

## 1. O problema, medido

O Inbox é onde o atendente passa o dia. Oferece uma busca e quatro filtros. **Três mentem** — sem erro,
sem aviso, sem log. O operador lê a tela, conclui errado, segue.

O caso mais caro, medido numa instalação real (`crm.thothcrm.com.br`, v1.17.8, canal `waha`):

> Conversa de **32 mensagens**. Na terceira, o cliente escreveu o que queria comprar:
> *“Site para imobiliária completo com CMS”*. Buscar essa frase exata devolve **zero**.
> Buscar a **última** mensagem devolve **um**.

O campo promete `Buscar por nome, telefone ou mensagem…`. Alcança a última mensagem, e só.

Os oito defeitos, com o status de prova de cada um:

| # | Defeito | Onde | Prova |
|---|---|---|---|
| A | “Não lidos” filtra em memória a página já carregada | `InboxLayout.tsx:189-194` + `ConversationList.tsx:66-69` | **tela** |
| C | A busca alcança só a última mensagem, truncada em 200 caracteres | `_handler.ts` (bloco `if (q.search)`) | **tela** |
| E | O seletor de tag oferece tags de semente; a tag que a tela exibe não está nele | `conversation-tags/route.ts:32-36` | **tela** |
| F | Contadores das abas ignoram canal, tag, busca e não-lidos | `counts/route.ts:45-105` | **tela** |
| H | Busca de 1 caractere devolve tudo | `lib/schemas/messaging.ts:317` | **tela** |
| I | Busca por nome falha com espaço duplo e palavras não adjacentes | `_handler.ts:27-34` (o `.trim()`) | **tela** |
| D | Os 120 contatos da busca saem sem ordem definida | `_handler.ts` (consulta auxiliar) | só código |
| G | Digitar + trocar de aba em <250 ms volta a aba anterior | `InboxFilters.tsx:100-109` | só código |

Mais dois, vindos da comparação: a aba **“Fechadas” não tem contador** (o concorrente mostra 8067) e o
**histórico encerrado mostra só o desfecho**, sem a data — que a API já entrega e a tela descarta.

### ⛔ Dois destes NÃO são consertados por esta spec — e um deles é o mais caro

| defeito | o que esta spec faz | por quê |
|---|---|---|
| **C** — a busca não alcança o histórico | **para de prometer**: o placeholder passa a dizer “última mensagem” | buscar em `messages` exige índice trigram, decisão de retenção e LGPD — é projeto próprio (D4). Segurar sete consertos baratos esperando por ele seria pior |
| **D** — 120 contatos sem ordem | **nada** | não foi reproduzido: precisa de base com centenas de contatos casando o mesmo termo. **Item aberto, não tarefa** |

Está dito aqui, na primeira seção, porque o **C** abre este documento como “o caso mais caro” — e quem
parar no §1 sai achando que ele será consertado. Os oito itens da §6 são **A, E, F, G, H, I** mais os
dois da comparação; **C entra só como promessa corrigida, e D não entra.**

---

## 2. Causa raiz

**Um filtro nasceu fora do contrato, e por isso fora de todo mecanismo.**

`onlyUnread` existe em `InboxFiltersValue` (`InboxFilters.tsx:50`), vira predicado no `InboxLayout` e é
aplicado na lista. **Não existe** em `ConversationsFilters` nem em `listConversationsQuerySchema`.

O repo já tem a cerca certa: `tests/unit/rota-le-todo-filtro-do-schema.test.ts` deriva as chaves **do
próprio schema** e cobra que a rota leia cada uma. O cabeçalho dele conta que o defeito aconteceu duas
vezes (`tag`, depois `comando`) e conclui: *“comentário não é mecanismo”*.

A cerca funciona — mas só alcança quem entra pelo schema. `onlyUnread` nunca entrou. **A causa raiz não
é o filtro: é não haver regra que obrigue todo filtro de tela a ser parâmetro do contrato.**

O segundo eixo da causa é o estado vazio: `ConversationList.tsx:139` devolve `<EmptyInbox />` antes do
bloco do “Carregar mais” (linha 158). Lista vazia por **filtro** é apresentada como caixa vazia por
**ausência** — e sem saída para a página seguinte.

---

## 3. O que a segunda rodada de medição custou

A rodada 1 (leitura de código) produziu nove achados. Um deles — *“a busca diverge conforme o termo
tenha vírgula”* — foi derivado da semântica do Postgres, **sem consulta executada**, e mesmo assim
escrito em tom de defeito confirmado.

A rodada 2 (tela real, com controle positivo e negativo) **refutou**:

| busca | achou | prova |
|---|---|---|
| `Pass*sua` | 1 | o `*` **é** curinga no `ilike` direto |
| `Pass#sua` | 0 | controle negativo — a busca de fato filtra |
| `zzqqxx` | 0 | controle negativo — termo inexistente |

O PostgREST converte `*` em `%` em **todo** `like`/`ilike`, não só dentro de `or=`.

**Consequência de projeto:** `termoSeguroParaOr` está **correto** e é não-objetivo. A lição fica aqui
porque ela justifica o critério de aceite desta spec ser prova de tela: *leitura de código produz
hipótese; só a tela produz fato.*

---

## 4. Decisões tomadas

| # | Decisão | Por quê |
|---|---|---|
| **D1** | **Todo filtro da tela é parâmetro do schema Zod.** Nenhum sobrevive em memória | É o conserto da causa raiz (§2): põe todo filtro dentro da cerca que já existe |
| **D2** | **Vazio por filtro ≠ vazio por ausência.** O vazio nomeia o filtro ativo, oferece limpá-lo e **mantém o “Carregar mais”** | Hoje a tela afirma caixa vazia com as conversas lá |
| **D3** | **O vocabulário do filtro de tag é o que está EM USO**, unido ao canônico | Medido: 8 tags de semente, nenhuma conversa com tag, e a etiqueta exibida fora da lista |
| **D4** | **Busca no histórico de mensagens é fase 3, fora desta spec** | Exige índice trigram, decisão de retenção e LGPD. Não pode segurar os consertos baratos |
| **D5** | **Enquanto a fase 3 não existe, o placeholder não promete o histórico** | Parar de mentir é grátis e vale mais que a mentira |
| **D6** | **Contadores respeitam os filtros auxiliares.** A saída de emergência (esconder o badge sob filtro ativo) só é acionada com **número medido**: `p95` da rota de contadores acima de **400 ms** em base real. Sem esse número, não se aciona — e a decisão de acionar é de quem implementa, não do Paulo | Número ausente não mente; número errado mente. Mas “se ficar caro” sem régua é decisão adiada se passando por decisão tomada |
| **D7** | **Nada quebra a API versionada.** Todo parâmetro novo é opcional; `unassigned` segue respondendo ao lado de `fila` | `/api/v1/` é contrato: campo não some entre versões |
| **D8** | **Ordem invertida de nome (`Lima Paulo` → “Paulo Lima Jr”) fica de fora** | Muda a semântica da busca inteira; decisão própria |
| **D9** | **O destino — PR ao Rafael (jeito 1) ou funcionalidade do fork (jeito 2) — é decisão do Paulo e está EM ABERTO.** A spec assume jeito 1 e diz o que muda se for 2 (§13) | Abrir PR sai para fora e leva o nome dele (`NOSSA-INTEGRACAO.md` §9). O projeto, esse, não espera a decisão: os oito consertos são os mesmos nos dois regimes |
| **D11** | **Toda peça que esta spec toca declara onde poderia vazar entre organizações, e prova que não vaza.** Filtro novo, contagem nova e função nova entram com a medição escrita (§5.1) | Nesta instalação **vendemos tenants**: uma organização ver dado de outra não é defeito grave, é o produto deixando de existir. A régua do repo de origem (onde cada cliente instala a própria cópia) não é a nossa |
| **D10** | **O PR não sai antes da prova de tela do Paulo na VPS.** Se precisar existir antes, existe como **rascunho**, dito em voz alta | `NOSSA-REGRA.md`, seção “PR só sai depois de PROVADO NA TELA”. Quatro PRs saíram com a suíte verde e o defeito do #679 vivia **entre dois carregamentos de página** — lugar onde teste automático nenhum chega |

---

## 5. Arquitetura: o filtro atravessa quatro peças, e as quatro têm dono

Hoje um filtro pode existir em uma peça e não nas outras — foi assim que `onlyUnread` virou ilha.
O desenho passa a ser explícito:

```
  InboxFilters.tsx          InboxLayout.tsx         useConversationsRealtime.ts
  (a superfície)      →     (o estado)         →    (o transporte)
        │                                                   │
        │                                                   ▼
        │                                    lib/schemas/messaging.ts   ← a CERCA vive aqui
        │                                    (listConversationsQuerySchema)
        │                                                   │
        ▼                                                   ▼
  o vazio nomeia o filtro                    app/api/v1/conversations/
  (D2)                                       route.ts → _handler.ts (o predicado)
```

**A regra que D1 cria:** um filtro só é considerado pronto quando existe nas **quatro** — superfície,
estado, transporte e schema. A cerca `rota-le-todo-filtro-do-schema.test.ts` cobra a ponta do schema
automaticamente, sem teste novo, porque deriva as chaves de `listConversationsQuerySchema.shape`.

`clientFilter` (a prop opcional de `ConversationList`) **deixa de existir**: ela é o mecanismo que
permitiu o desvio. **Remoção medida, não presumida** — `grep -rn clientFilter` devolve dois arquivos
e **um único chamador**: a definição e o uso em `ConversationList.tsx:30,40,66-67` e a passagem em
`InboxLayout.tsx:188,410`. Nada mais depende dela.

---

## 5.1 Isolamento entre organizações — o que esta spec toca, medido

⛔ **Aqui isto não é boa prática, é a mercadoria.** Nesta instalação vendemos tenants: vários
clientes na mesma base. Uma organização alcançar dado de outra não é bug de severidade alta — é o fim
do produto. As três peças que esta spec toca foram medidas **uma a uma**, e não herdadas por confiança:

| peça | client | quem isola | medido |
|---|---|---|---|
| `conversations/_handler.ts` — onde entra o filtro `unread` | **admin** (`createAdminClient`, linha 1) → **passa por cima da RLS** | só o filtro manual: `.eq("organization_id", ctx.organization_id)` em 5 pontos, e o `ctx` vem de `route.ts:74` (`activeOrg.orgId`, da sessão) — **nunca do body** | ✅ |
| `conversations/counts/route.ts` — onde entra a contagem `closed` | **sessão** (`createClient`) → a RLS vale | dupla: a RLS **e** a fábrica `countExact()`, que aplica `.eq("organization_id", org)` em **toda** contagem por construção | ✅ |
| `fn_tags_de_conversa_em_uso` — função nova (§7) | sessão | a RLS, porque é `security invoker` | ✅ **depois de corrigida** — nasceu `definer` nesta spec, e isso era vazamento |

**A assimetria é o ponto, e ela decide onde vão os testes.** A contagem tem duas redes; o handler tem
**uma só**. Um `.eq("organization_id", ...)` apagado por engano no handler não encontra nenhuma segunda
barreira — o admin client já passou por cima da RLS. Por isso:

- a contagem nova entra **pela fábrica `countExact()`**, nunca montando query própria: assim ela herda o
  filtro em vez de repeti-lo, e não existe a opção de esquecer;
- o filtro `unread` entra **compondo** sobre a query que já tem o `.eq` de organização, nunca numa
  consulta paralela;
- a função nova leva caso de isolamento entre duas organizações (§7), porque é a única das três que
  não existe hoje — e porque **o gate genérico do repo não cobre esta pergunta**: 
  `tests/invariants/definer-valida-membership.test.ts` cobra lista fixa de **duas** funções, não varre.

> **O código de hoje está limpo — medido, não suposto.** Varredura do `baseline.sql` inteiro:
> **21 funções únicas** são `security definer`, recebem a organização por argumento e são alcançáveis
> por quem está logado; **nenhuma** deixa de amarrar o chamador à organização. A única suspeita
> (`fn_appointment_change`) delega para `fn_appointment_change_core`, que tem o guard.
> O que **não** está garantido é que continue assim — e esse buraco de gate está na `FILA.md`, item 13.
> É defeito dele, e dos bons de mandar: mesma classe que um relatório da comunidade explorou na v1.0.0
> (`emit_event`, `retrieve_top_k_chunks`, consertados na migration 0149).

---

## 6. Os itens, um a um

### 6.1 “Não lidos” vira filtro de servidor · A

`unread: z.coerce.boolean().optional()` no schema; `query.gt("unread_count_for_assignee", 0)` no
handler; o campo atravessa hook e `filters`.

> **Desempenho, declarado e não esquecido:** não há índice em `unread_count_for_assignee`. O que existe
> é `idx_conversations_org_assignee_assigned` (`baseline.sql:5785`). O filtro sempre vem combinado com
> `organization_id`, e o volume de uma VPS não justifica índice novo **agora**. Se doer, o conserto é
> `(organization_id) where unread_count_for_assignee > 0`.

### 6.2 O estado vazio distingue filtro de ausência · A (metade 2) · D2

Componente próprio quando houver filtro auxiliar ativo: nomeia o filtro, oferece “Limpar filtros”,
mantém o “Carregar mais” se `hasNextPage`.

> **Toda string nova entra em `lib/i18n/dicionario.ts`.** É o erro nº 11 da tabela de recorrentes
> (PRs #631 e #600): string em português fora do dicionário, e o guardião do espanhol é cego a
> `t(<variável>)`. O arquivo tem 8.285 linhas — as chaves novas entram nele, não só no `t()`.

### 6.3 A busca por nome tolera o jeito humano de digitar · I

Medido na tela, com o contato “Paulo Lima Jr” no banco:

| busca | achou |
|---|---|
| `Paulo  Lima` (espaço duplo) | **0** |
| `Paulo Jr` (palavras não adjacentes) | **0** |
| `Paulo, Jr` (as mesmas, com vírgula) | **1** ← funciona por acidente |

A vírgula funciona porque vira `*`, que o PostgREST converte em `%`: um curinga acidental e invisível.
Os separadores (espaço, vírgula, ponto e vírgula) passam a colapsar **num curinga explícito**.

**Não toca `termoSeguroParaOr`** — ela cuida da gramática do `or=` e está certa (§3).

### 6.4 A busca exige 2 caracteres · H

`.min(2)` após `.trim()`. O handler já aplica esse raciocínio ao telefone (piso de 4 dígitos, com a
justificativa escrita: *“12 casaria metade da base… pior que não achar, porque PARECE que funcionou”*).
Falta aplicá-lo ao texto.

### 6.5 Contadores respeitam os filtros · F · e a aba “Fechadas” ganha contador

A rota passa a aceitar os filtros auxiliares, e devolve `closed`
(`.in("status", CONVERSATION_TERMINAL_STATUSES)`).

> ⚠️ **Afirmação falsa dentro do próprio código.** `counts/route.ts:69` diz que o espelhamento
> badge×aba é vigiado por `tests/unit/badge-espelha-a-aba.test.ts`. **Esse arquivo não existe** —
> medido com `find`, e o `git log` não mostra deleção: nunca existiu. O espelhamento **é** coberto, por
> `tests/e2e/inbox-abas-espelham-o-comando.spec.ts`, `tests/unit/fila-tem-uma-definicao-so.test.ts` e
> `tests/invariants/gov-5b-inbox-scope-counts.test.ts`. O comentário é corrigido.

### 6.6 A corrida do debounce · G

O efeito depende só de `[searchInput]` (com `eslint-disable`), então o timer captura o `value` do render
antigo — **incluindo `tab`**. O debounce passa a propagar **apenas `search`**.

### 6.7 O seletor de tag mostra as tags em uso · E · D3

`GET /api/v1/conversation-tags` devolve a **união** de canônicas e tags em uso. O filtro de tag ganha o
mesmo tratamento de órfão que o canal já tem (`filtroForaDaLista`, `InboxFilters.tsx:89-96`) — hoje, se
o vocabulário esvaziar com filtro ativo, o seletor some **com o filtro aplicado**.

### 6.8 O histórico encerrado ganha data

`crm-summary/route.ts:124` já seleciona `id, desfecho, fechada_em`. **A data chega e é descartada** por
`CRMSidePanel.tsx:696`. Mostrar é só tela. Contagem de mensagens e link ficam fora — dependem do
protocolo de atendimento, que é outra spec.

---

## 7. Schema — migration 0239

Só o item 6.7 toca banco.

**Próximo número — medido na ÂNCORA, não no disco:**

```bash
git fetch origin
git ls-tree -r --name-only origin/main -- supabase/migrations   | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1
```

→ **`0238`**. Logo a nova é **0239**.

> ⚠️ **A primeira versão desta spec dizia 0234, e estava errada.** Ela mediu `ls supabase/migrations/`
> na branch local (`0233`) — mas esta branch é a planta própria e diverge. Na `origin/main`, **`0234`
> já existe** (`20260907130000_0234_voice_calls_no_realtime.sql`) e o topo é `0238`. É o **erro nº 1**
> da tabela de erros recorrentes de contribuidor: migration com número já usado, renumerada 11 vezes
> desde agosto, com 5 PRs disputando o mesmo `0161` numa rodada (issue #285). A régua é a âncora,
> nunca o disco. O timestamp também: `20260912*` está livre na `origin/main` — conferido.

Uma função, porque o PostgREST não expressa `distinct unnest(tags)`:

```sql
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

revoke execute on function public.fn_tags_de_conversa_em_uso(uuid) from public, anon;
grant  execute on function public.fn_tags_de_conversa_em_uso(uuid) to authenticated, service_role;
```

> ⛔ **A primeira versão desta spec escreveu `security definer` aqui, e isso era uma leitura
> cross-tenant.** A combinação é exatamente a que o próprio código do projeto proibiu por extenso:
> definer + organização **por argumento** + `grant` a `authenticated`. Com ela, qualquer pessoa logada
> na organização A chamaria o RPC pelo PostgREST passando o uuid da organização B e leria as etiquetas
> de B. O aviso está escrito no `comment on function` de `fn_gasto_de_ia_do_mes`
> (`baseline.sql:13014`), e não sou eu quem está dizendo:
>
> > *“security invoker: recebe a organização por argumento e não valida membership, então definer aqui
> > seria leitura cross-tenant.”*
>
> A justificativa que eu tinha escrito — *“quem passa o parâmetro é a rota, que resolve da sessão”* — é
> o mesmo erro que o `CLAUDE.md` chama de anti-pattern nº 10: confiar em quem **deveria** chamar, quando
> a função é alcançável por quem quiser. Uma função concedida a `authenticated` é RPC público para todo
> mundo que fez login, não um detalhe interno da rota.

**Por que `security invoker` resolve, e quem passa a isolar:** medido — a rota usa `createClient()`
(o client da **sessão**, `conversation-tags/route.ts:24`), não o admin. Sob invoker a função roda com o
JWT de quem chamou, e a **RLS de `conversations` isola sozinha**
(`tenant_isolation_conversations_all` via `fn_user_org_ids()`). Quem passar o uuid de outra organização
recebe zero linhas, pelo banco, sem depender de a rota se comportar. O `p_org` deixa de ser a fronteira
de segurança e vira o que sempre devia ter sido: um filtro.

⚠️ **E isso troca o guardião.** A varredura `tests/invariants/hardening-definer-varredura.test.ts` só
alcança funções `security definer` — com invoker, ela **deixa de cobrir esta**. A rede de proteção
passa a ser explicitamente um caso de isolamento entre duas organizações em
`tests/invariants/`: organização A pede as etiquetas de B e recebe **zero**. Sem esse teste, a troca de
definer para invoker consertaria o furo e apagaria o único gate que olhava para ele.

**O índice que ela usa já existe:** `idx_conversations_tags_gin` (`baseline.sql:5472`).

**Os três artefatos andam juntos, e NO MESMO COMMIT** — o hook `pre-commit` da skill `deskcomm-contribuir` reprova migration nova sem apêndice no `baseline.sql` e sem linha no `MANIFEST.md` no mesmo commit: migration + apêndice idempotente no `baseline.sql` (rotulado
`-- ---- tags de conversa em uso (migration 0239) ----`) + linha no `MANIFEST.md`.
**Sem constraint, sem coluna, sem backfill.**

---

## 8. Living System Checklist

```
Living System Checklist — Busca e filtros do Inbox que dizem a verdade

[x] Quem me alimenta?
    `conversations` (status, comando_da_conversa, tags, unread_count_for_assignee,
    last_message_preview, channel_session_id) e `contacts` (display_name, name,
    phone_number), via GET /api/v1/conversations e /conversations/counts. Na fase 2,
    também fn_tags_de_conversa_em_uso(p_org).

[x] Quem eu alimento?
    components/inbox/ConversationList.tsx (a lista), InboxFilters.tsx (os badges das abas)
    e InboxLayout.tsx (seleção e navegação J/K). Em cima deles, o atendente.

[x] Que atividade/log eu emito?
    NENHUM, deliberado: leitura de lista não é mutação, e auditar consulta de tela
    produziria o lixo que o CLAUDE.md condena (a lição do routing-worker, 95% do audit
    de uma VPS). O que se observa é o X-Request-Id que a rota já devolve.

[x] Onde eu apareço na tela?
    /app/inbox — a lista, os cinco badges, o seletor de canal, o de tag, o botão
    "Não lidos" e o campo de busca. O estado vazio vira superfície própria (6.2).

[x] Por qual porta se chega até mim?
    lib/navigation/catalogo.ts, destino /app/inbox (grupo "atendimento", sidebar).
    NENHUMA TELA NOVA — tudo mora dentro do Inbox. Nada a declarar.
    (A skill sistema-vivo manda à registry.ts; medido, quem declara é o catalogo:
     grep -c 'href:' → catalogo.ts 49, registry.ts 0. A skill herdou o endereço
     errado que o nosso PR #718 corrigiu no CLAUDE.md. Registrado na FILA.)

[x] Qual meu mecanismo anti-morte?
    N/A justificado: filtro não é demanda e não tem ciclo de vida. O anti-morte do que
    ele mostra é o Radar (/app/radar), já vivo.

[x] Onde se CONFIGURA o que eu uso?
    Tags canônicas: Configurações › Atendimento
    (organizations.settings.canonical_conversation_tags). E o item 6.7 é precisamente o
    conserto deste invariante: a configuração tem superfície, mas o que está EM USO não —
    o operador não consegue filtrar pela etiqueta que a própria tela lhe mostra.

[x] Qual a continuidade IA↔humano?
    A aba "Automático" (comando_da_conversa) é a superfície dessa continuidade na lista, e
    não muda. "Não lidos" passa a poder ser combinado com ela — hoje não pode, porque
    filtra depois da página.

[x] Qual meu LAÇO DE RETORNO?
    É o invariante que esta spec serve. O laço estava ABERTO: a tela afirmava "não há
    nada" e nada registrava que ela mentiu. Fecha com a cerca
    tests/unit/rota-le-todo-filtro-do-schema.test.ts, que deriva as chaves do schema —
    filtro novo nasce ligado ou nasce vermelho. D1 existe para que todo filtro futuro caia
    dentro desse laço.

[x] Onde eu poderia VAZAR entre organizações?   ← para nós, a primeira pergunta
    Três superfícies, medidas em §5.1: o handler (admin client, isola só pelo filtro
    manual), a rota de contadores (sessão + fábrica countExact, dupla rede) e a função
    nova (invoker, isola pela RLS). Nenhuma recebe organização do body.
    Esta pergunta NÃO está no checklist da skill sistema-vivo — ela é nossa, porque
    aqui se vende tenant. Toda spec desta instalação responde.

[x] A regra do tempo — quem OBSERVA e o que AGE?
    Esta peça só OBSERVA: lista, contadores, filtros. Observação é direito do humano e
    é realtime — useConversationsRealtime.ts já assina as mudanças. Ela não AGE sobre
    ninguém: não envia, não atribui, não fecha. Nada aqui é irreversível.
    E o achado A é uma violação DESSA regra: filtrar a página já carregada faz o
    resultado envelhecer em silêncio — mensagem nova chega pelo realtime e o filtro
    não a considera, porque ele roda depois da página, não dentro da consulta.

[x] Atualizei o mapa vivo?
    Sem peça nova nem aresta nova — a spec conserta arestas existentes. docs/architecture/
    não muda. (Declarado, não esquecido.)
```

---

## 9. Fora de escopo (YAGNI declarado)

- **Busca por palavras em `AND` / ordem invertida** (D8).
- **Busca no histórico de mensagens** — fase 3, com brainstorming próprio (D4).
- **Filtro por atendente e ordenação na tela** — aditivo, não conserto.
- **Departamentos** e **protocolo de atendimento** — projetos à parte. O histórico (6.8) entrega só a
  data porque contagem e link dependem do protocolo.
- **Índices em `last_message_preview`, `display_name`, `phone_number`.** A auditoria registrou a
  ausência; o custo não foi medido em base grande. Decisão de desempenho não entra sem número.
- **Mexer em `termoSeguroParaOr`** — está correto, provado em produção (§3).
- **Achado D (120 contatos sem ordem).** O conserto é `.order("last_activity_at", …)` com o índice que
  já existe (`idx_contacts_org_last_activity`), mas o defeito **não foi reproduzido** — precisa de base
  com centenas de contatos casando o mesmo termo. **Item aberto, não tarefa.**

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Quatro `count` filtrados encarecem a rota de contadores | D6 já traz a saída: esconder o badge enquanto houver filtro ativo. Medir antes de otimizar |
| O filtro `unread` sem índice fica lento numa base grande | Declarado em 6.1, com o índice parcial pronto para quando doer |
| A união de tags (6.7) crescer demais numa org bagunçada | `limit 200` dentro da função |
| Mudar o estado vazio quebrar testes de tela existentes | `tests/unit/inbox-filters-scope.test.tsx` é estendido, não reescrito |

---

## 11. Critérios de aceite

1. Ligar “Não lidos” **gera requisição** e o resultado vem do banco — provado pela tela.
2. Lista vazia por filtro **nomeia o filtro** e mantém o “Carregar mais”.
3. `Paulo Jr`, `Paulo  Lima` e `Paulo, Jr` casam a **mesma** linha; `zzqqxx` continua devolvendo zero.
4. Termo de 1 caractere não vira consulta.
5. Badge de cada aba bate com a lista **sob filtro de tag**; “Fechadas” tem número.
6. Digitar + trocar de aba em <250 ms **não** volta a aba.
7. Tag aplicada e fora do canônico **aparece** no seletor; vocabulário vazio com filtro ativo mantém o
   seletor e nomeia a tag órfã.
8. Histórico encerrado mostra desfecho **+ data**.
9. `pnpm test:db` verde; migration 0239 + apêndice no baseline + linha no MANIFEST.
10. `pnpm typecheck`, `pnpm lint`, **`pnpm lint:channels`**, `pnpm test:unit` e **`pnpm test:shell`**
    verdes — os **cinco** passos do job `verify`, medidos em `origin/main` e não os três que o
    `CLAUDE.md` lista. Mais `pnpm build` (`build-and-size`).
11. A spec e2e da T10 está registrada em `SPECS_PARTE_N` do `.github/workflows/e2e.yml` — ou em
    `FORA_DO_CI` **com o motivo escrito**. `tests/unit/e2e-cobertura-completa.test.ts` reprova spec
    órfã, e a nossa vai nascer órfã se ninguém a registrar.
12. Prova pela tela em ambiente fresco estilo VPS, com evidência versionada em **`evidence/`** —
    não em `.superpowers/`, que o git ignora (evidência que o git ignora não chega a ninguém).
13. ⛔ **Nenhuma das três peças cruza organizações** — provado, não herdado: caso de isolamento entre
    duas organizações verde para a função nova, e o filtro e a contagem compondo sobre o filtro de
    organização que já existe (§5.1). **É o único critério desta lista que, falhando, cancela o PR
    inteiro** — aqui se vendem tenants.
14. **O Paulo provou na tela da VPS, provocando o caminho do erro** (D10), e só depois disso o PR
    deixa de ser rascunho. Suíte verde não substitui este item — é o item 12 do Definition of
    Done do próprio projeto, e é o único critério desta lista que **não é meu para cumprir**.

---

## 12. O que esta spec NÃO mediu

- **O beco sem saída do 6.2** (o “Carregar mais” sumir) não foi provado na tela — precisa de mais de 50
  conversas; a instalação testada tem 2. Sustentado por leitura de código.
- **A corrida do 6.6** não foi reproduzida (janela de 250 ms).
- **Desempenho de nada.** Nenhum índice é proposto com número medido.
- **A instalação testada é pequena** (2 conversas, 1 org, 1 usuário, 1 canal WAHA). Provou
  **mecanismo**, não escala.
- **Nada foi testado sob `visibility_mode` restrito**, nem como `agent` — só como administrador.
- **Nada foi escrito na instalação durante a medição** — toda a rodada 2 foi leitura.
- **`pnpm test:db`, `pnpm test:e2e` e `pnpm test:shell` não foram rodados** ao escrever esta spec:
  exigem Docker e Supabase local de pé. São tarefa do plano, não da spec.
- **Instalação fresca de VPS (`vps-fresh-onboarding`) não foi exercitada.** É a P0 da doutrina de
  QA Visual e está **fora do CI** — logo, ninguém a mede automaticamente, nem lá nem aqui.
- **A rota de contadores não foi medida sob carga.** O risco de D6 é declarado, não quantificado.

> Esta lista não é desculpa — é **contrato**. O combinado público do template de PR do projeto é
> que quem contribui declara o que não mediu e o mantenedor mede. Veredito sem o campo
> “não medido” é recusado pela própria triagem dele (o agente `triagem-cetico` existe para isso).

---

## 13. Se o destino for o jeito 2 (ficar só nesta instalação)

D9 está em aberto. **Os oito consertos são os mesmos nos dois regimes** — o que muda é o preço depois,
e ele não é pequeno. Escrito aqui para a decisão ser tomada com o número na frente:

| | jeito 1 — PR ao Rafael | jeito 2 — só aqui |
|---|---|---|
| De onde a branch sai | `origin/main` | `vps/pljr-combinada` |
| Custo depois | **zero**, a partir do merge | **merge a cada release dele, para sempre** |
| A migration `0239` | vira dele; para de brigar por número | vira **a segunda nossa** — hoje temos uma (`politica_de_cadastro`), que já trocou de número **três vezes** (0231→0232→0233) |
| Fragmento em `.changes/` | sim, com `Crédito: @paulolimajr77` | sim, mas a nossa numeração de versão é desta instalação |
| Quem prova na tela | o Paulo, **antes** do PR | o Paulo, antes da tag |

**Recomendação medida:** jeito 1. Pela tabela de decisão do `NOSSA-REGRA.md`, *“consertar ou melhorar
o CRM”* é jeito 1, e nenhum dos oito é personalização desta instalação — são defeitos no código dele,
que toda instalação do mundo tem agora. O argumento mais forte é a migration: guardá-la aqui **dobra**
um pedágio que a `FILA.md` (item 8) já registra como recorrente.

O risco do jeito 2 não é teórico e está escrito no `NOSSA-REGRA.md`: *“foi aqui que o Thoth morreu —
não por ser fork, por ninguém pagar a manutenção”*. 38 migrations de atraso, zero commits, 312 MB
fora de controle de versão.
