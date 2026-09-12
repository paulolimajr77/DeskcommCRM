# Auditoria — filtros e busca do Inbox

> **Quando:** 2026-09-11 · **Onde:** branch `vps/pljr-combinada` · **Escopo:** o caminho inteiro
> tela → hook → schema → handler → banco de `GET /api/v1/conversations`.
>
> **Como foi medido:** duas rodadas. A primeira, por leitura do código. A segunda, **dirigindo a tela
> de uma instalação real** (`crm.thothcrm.com.br`, versão 1.17.8, org “PLJR Empreendimentos”, 2 conversas,
> uma delas com 32 mensagens) pelo Chrome, como um atendente usaria — observando as requisições de rede
> e consultando a API pela sessão da própria página. Cada caso levou controle positivo **e** negativo.
>
> **A segunda rodada derrubou um achado da primeira** (o antigo B, sobre a busca divergir) e reforçou
> outro (o C, que passou a ser o mais grave). Todo achado abaixo traz agora o seu **status de prova**.

## Resumo

Oito achados válidos. Dois são **falha-em-verde** — a tela afirma um estado do mundo que não é verdade, sem
erro nem aviso, que é a classe de defeito que a doutrina do repo nomeia como a pior num produto que
a pessoa instala sozinha.

| # | Achado | Gravidade | Prova |
|---|---|---|---|
| C | A busca alcança só a **última** mensagem — o resto da conversa é invisível | **Alta** | **Provado na tela** |
| A | “Não lidos” filtra em memória sobre página truncada | **Alta** | **Provado na tela** (mecanismo); beco sem saída só por código |
| E | O seletor de tag oferece tags que não filtram nada; a tag em uso não está nele | Média-alta | **Provado na tela** |
| F | Os contadores das abas ignoram canal, tag, busca e “não lidos” | Média | **Provado na tela** |
| H | Busca de um caractere é aceita e devolve tudo | Média | **Provado na tela** |
| I | A busca por **nome** falha com espaço duplo e com palavras não adjacentes — e a pontuação vira curinga oculto | Média-alta | **Provado na tela** |
| D | Os 120 contatos da busca são escolhidos sem ordem definida | Média | Só por código |
| G | Digitar e trocar de aba em menos de 250 ms volta para a aba anterior | Baixa-média | Só por código |
| ~~B~~ | ~~A busca por conteúdo diverge de si mesma~~ | **RETIRADO** | **Refutado na tela** |

E seis pontos verificados que **estão certos** — registrados para ninguém “consertar” o que funciona.

---

## A. “Não lidos” filtra em memória sobre uma página já truncada

**Onde.** [`components/inbox/InboxLayout.tsx:189-194`](../../components/inbox/InboxLayout.tsx#L189) monta
o predicado; [`components/inbox/ConversationList.tsx:66-69`](../../components/inbox/ConversationList.tsx#L66)
o aplica sobre `q.data.pages.flatMap(...)`.

**O que acontece.** O servidor devolve 50 conversas por página. O botão “Não lidos” não vai ao banco —
ele remove da **página já carregada** as que estão lidas. Medido: `onlyUnread` não existe em
`ConversationsFilters` (`hooks/inbox/useConversationsRealtime.ts:75-92`), não existe em
`listConversationsQuerySchema` (`lib/schemas/messaging.ts:223-322`), e não há nenhum predicado sobre
`unread_count_for_assignee` no handler.

**Por que é falha-em-verde.** Em `ConversationList.tsx:139`, quando `items.length === 0` a função
retorna `<EmptyInbox />` — e esse `return` vem **antes** do bloco que renderiza o botão “Carregar mais”
(linha 158). Então, se as 50 primeiras conversas da página estiverem todas lidas:

- a lista fica vazia,
- a tela mostra o estado vazio de caixa de entrada,
- **e não há botão para carregar a página seguinte.**

O operador lê “nada não lido” e passa adiante. Havia — na página 2. Numa aba como “Todas” ou
“Fechadas”, onde a instalação do vídeo tinha 8.067 conversas, a chance de as 50 primeiras serem todas
lidas não é hipótese remota: é o caso comum, porque a lista vem ordenada por atividade recente e o
atendente acabou de ler justamente as recentes.

**Provado na tela**, em `crm.thothcrm.com.br`, com controle:

1. Aba **Todas**, badge dizendo **2**, duas conversas na lista.
2. Liguei “Não lidos”. **Nenhuma requisição saiu** — o monitor de rede não registrou nada.
3. A lista ficou **vazia**, com a mensagem *“Sem conversas por aqui — Quando chegarem mensagens, elas
   aparecem aqui em tempo real.”*
4. **O badge continuou dizendo 2.**

**Controle de que a sonda não estava cega:** em seguida troquei de aba, e o mesmo monitor registrou
`GET /api/v1/conversations?status=closed&limit=50`. Ele enxerga requisições — logo o zero do passo 2 é
real, e não instrumentação falhando. Repare também que a URL da aba não carrega parâmetro nenhum de
não-lido, o que confirma a ausência no contrato.

**O texto do estado vazio é a parte pior, e ele é enganoso já com 2 conversas.** A tela não diz
“nenhuma conversa não lida”; diz *“quando chegarem mensagens, elas aparecem aqui”* — afirmando que a
caixa está vazia quando na verdade há conversas, só que lidas. Não é preciso ter 50 para enganar.

**O que NÃO consegui provar na tela:** o beco sem saída (o botão “Carregar mais” não ser desenhado)
precisa de mais de uma página de conversas, e esta instalação tem duas. Continua sustentado só pela
leitura do código — o `return` do estado vazio em `ConversationList.tsx:139` vem antes do bloco da
linha 158.

**Nenhum teste vigia isto.** `tests/unit/inbox-filters-scope.test.tsx:44` menciona `onlyUnread`, mas só
como valor fixo `false` dentro do objeto de props — o comportamento do filtro não é exercitado em
lugar nenhum.

**E a cerca que existiria não alcança.** `tests/unit/rota-le-todo-filtro-do-schema.test.ts` cobra que
todo filtro do schema seja lido pela rota — exatamente para impedir filtro que “parece funcionar”. Ele
deriva as chaves do próprio schema; como `onlyUnread` **nunca entrou no schema**, a cerca não tem o que
cobrar. O filtro nasceu do lado de fora do mecanismo.

**Conserto.** `unread: z.coerce.boolean().optional()` no schema, `query.gt("unread_count_for_assignee", 0)`
no handler, o campo no hook e no `filters` do `InboxLayout`. A cerca existente passa a vigiá-lo sozinha,
sem teste novo. O `clientFilter` some.

---

## B. ~~A busca por conteúdo diverge de si mesma~~ — **RETIRADO, refutado na tela**

**A primeira rodada afirmou** que o termo saneado viaja por dois caminhos e que só um trata `*` como
curinga: `query.or("last_message_preview.ilike.*<s>*, …")` quando algum contato casa, e
`query.ilike("last_message_preview", "%<s>%")` quando nenhum casa. A conclusão era que, no segundo, o
`*` inserido pelo saneamento viraria caractere literal e a busca por conteúdo morreria.

**Está errado.** O raciocínio parou no Postgres e esqueceu a camada do PostgREST no meio: o PostgREST
converte `*` em `%` em **todo** operador `like`/`ilike`, não apenas dentro de um `or=`. Os dois ramos
se comportam igual.

**Medido em produção**, contra `crm.thothcrm.com.br`, pela sessão do próprio navegador, com controle
positivo e negativo:

| busca | resultado | o que prova |
|---|---|---|
| `Pass*sua` | **1** (casa “Passei sua”) | o `*` **é** curinga no `ilike` direto |
| `Pass#sua` | **0** | controle negativo — a busca de fato filtra, não devolve tudo |
| `Perf*Passei` | **1** (cobre o `. ` de “Perfeito. Passei”) | curinga confirmado |
| `zzqqxx` | **0** | controle negativo — termo inexistente |

E o par que originou a suspeita, com e sem vírgula, devolve **o mesmo**:
`Passei sua` → 1 · `Passei, sua` → 1 · `Olá Paulo` → 1 · `Olá, Paulo` → 1 · `Perfeito. Passei` → 1 ·
`Perfeito, Passei` → 1.

**Lição, e ela é sobre o método:** a primeira rodada declarou este achado como derivado “da semântica
do Postgres, não de uma consulta executada”, e mesmo assim o escreveu em tom de defeito confirmado, no
topo da lista. Declarar a incerteza numa seção do fim não compensa afirmar com certeza no corpo. O
saneamento de `termoSeguroParaOr` está **correto como está** — não mexer.

---

## C. A busca promete “mensagem” e entrega bem menos

**Onde.** O placeholder em [`InboxFilters.tsx:120`](../../components/inbox/InboxFilters.tsx#L120) diz
`Buscar por nome, telefone ou mensagem…`.

**O que ela alcança de verdade.** Só a coluna `conversations.last_message_preview`. Não há nenhuma
consulta à tabela `messages` no handler — medido, lendo o arquivo inteiro. E o preview é:

- **só a última mensagem** da conversa (por definição da coluna), e
- **truncado**: `slice(0, 200)` em `lib/channels/zernio/ingest.ts:271`, e `left(..., 280)` no caminho
  SQL do `baseline.sql` (linha 21840).

Então “buscar por mensagem” significa, na prática: *os primeiros 200 caracteres da última mensagem*.

**Provado em produção.** Numa conversa real com **32 mensagens**, buscando trechos exatos dela:

| busca | é a mensagem… | achou |
|---|---|---|
| `Site para imobiliária` | nº 3 — **o que o cliente pediu** | **0** |
| `assistente virtual` | nº 2 | **0** |
| `Posso te ajudar` | nº 4 | **0** |
| `Passei sua conversa` | a **última** | **1** ← controle positivo |

O cliente escreveu o que queria comprar, e a busca do Inbox não acha. Só a última mensagem existe para
ela — o resto da conversa é invisível. É por isso que este achado subiu para o topo da lista: é o que
mais custa a quem usa a tela o dia inteiro.

**Conserto — duas opções, em ordem de custo.** (1) Ajustar a promessa: trocar o placeholder por
`Buscar por nome, telefone ou última mensagem…`. Barato, honesto, e resolve o engano hoje. (2) Buscar
de verdade em `messages`, o que é projeto: precisa de índice trigram no corpo, decisão sobre retenção,
e cuidado com LGPD (mensagem de contato anonimizado não pode voltar pela busca — o handler já tem esse
cuidado para contatos, em `.eq("is_anonymized", false)`).

Recomendo (1) agora e (2) como item separado, com brainstorming.

---

## I. A busca por nome tem três buracos — e o terceiro é contraintuitivo

O placeholder promete três coisas: **nome, telefone e mensagem**. Testei as três, uma a uma, contra os
dois contatos reais da instalação (um com `display_name` “Paulo Lima Jr”, outro com `name`
“CPFL Piratininga” e `display_name` nulo).

**Telefone: passou em tudo.** Todos os formatos que um brasileiro digita funcionam, e o piso de 4
dígitos faz o que promete:

| busca | achou | | busca | achou |
|---|---|---|---|---|
| `+5515992594261` | ✅ | | `(15) 99259-4261` | ✅ |
| `5515992594261` | ✅ | | `15 99259-4261` | ✅ |
| `15992594261` | ✅ | | `99259-4261` | ✅ |
| `992594261` | ✅ | | `4261` (o piso) | ✅ |
| `1937951607` | ✅ | | `426` (abaixo do piso) | ❌ correto, é deliberado |

Nada a consertar aqui. O tratamento de telefone é a parte mais bem resolvida da busca.

**Nome: passou no caminho feliz, falhou em três desvios.**

Funciona: nome completo, primeiro nome, nome do meio, final, minúsculas, prefixo de palavra
(`CPFL Pirat` acha), espaços nas bordas, e o campo `name` quando `display_name` é nulo — ou seja, os
dois campos do `.or()` são de fato alcançados.

Falha:

| busca | achou | por quê |
|---|---|---|
| `Paulo  Lima` (espaço **duplo**) | **0** | `termoSeguroParaOr` faz `.trim()` mas não colapsa espaço interno |
| `CPFL  Piratininga` (espaço duplo) | **0** | idem, no outro campo |
| `Paulo Jr` (duas palavras do nome, **não adjacentes**) | **0** | `ilike '%Paulo Jr%'` exige as palavras coladas |
| `Lima, Paulo` (“Sobrenome, Nome”) | **0** | vira `%Lima% Paulo%`, e no banco “Paulo” vem antes |

**E o achado contraintuitivo:** `Paulo Jr` devolve **0**, mas `Paulo, Jr` devolve **1**. As mesmas duas
palavras, e a busca com pontuação funciona **melhor** que a sem. O motivo é o saneamento: a vírgula é
trocada por `*`, que o PostgREST converte em `%` — então a vírgula vira um curinga acidental que cobre
o “Lima” do meio. É um recurso real, poderoso e **invisível**: ninguém vai descobrir sozinho que
pontuar o nome faz a busca achar mais.

**Uma distinção que o comentário do handler pode induzir ao erro.** O bloco `if (q.search)` explica,
com razão, que “Silva, João” quebrava a busca com HTTP 400 e que o saneamento resolveu. Resolveu o
**400** — mas não faz o caso achar: medido, `Lima, Paulo` continua devolvendo zero quando o contato
está salvo como “Paulo Lima Jr”. Não quebrar e achar são coisas diferentes, e quem ler aquele
comentário rápido pode concluir que “Sobrenome, Nome” passou a funcionar.

**Conserto.** Uma linha resolve os dois primeiros e desmascara o terceiro: colapsar espaços internos e
trocar cada separador por um curinga explícito — `termo.trim().split(/[\s,;]+/).join("*")` — de modo
que `Paulo Jr`, `Paulo  Lima` e `Lima, Paulo`… bem, os dois primeiros passam a achar; o terceiro
(ordem invertida) só sai com busca por palavras soltas em `AND`, que é decisão maior. O ganho barato é
deixar de exigir que o atendente digite o nome exatamente como está gravado.

---

## D. Os 120 contatos da busca são escolhidos sem ordem definida

**Onde.** A consulta auxiliar de contatos no handler: `.from("contacts").select("id").eq(...)
.eq("is_anonymized", false).or(camposDoContato).limit(TETO_DE_CONTATOS_NA_BUSCA)` — **sem `.order()`**.

**O que acontece.** Sem `ORDER BY`, o Postgres não promete ordem, e ela pode mudar entre execuções
(plano diferente, linhas movidas por `VACUUM`, paralelismo). Numa base com 3.000 contatos, buscar
“silva” pega 120 **arbitrários** — e duas buscas iguais podem devolver conjuntos diferentes. Como o
resultado alimenta o `contact_id.in.(...)` da consulta principal, o “Carregar mais” da busca pode
repetir ou pular linhas.

O teto em si está **bem feito** — o corte é por bytes de URL (`ORCAMENTO_DE_IDS_NA_URL`), com o
raciocínio medido no comentário, e é a decisão certa. O que falta é dizer **quais** 120.

**Conserto.** `.order("last_activity_at", { ascending: false, nullsLast: true })` — o índice
`idx_contacts_org_last_activity` já existe (`baseline.sql:2646`) e cobre exatamente isso. Passa a
devolver os 120 contatos **mais recentes** que casam, que é o que o atendente quer, e a busca fica
determinística.

---

## E. O seletor de tag depende de uma lista curada, e tag livre nunca é filtrável

**Onde.** Três peças que não combinam:

1. O seletor só aparece se `(tagVocabulary?.length ?? 0) > 0` — `InboxFilters.tsx:173`.
2. O vocabulário vem de `organizations.settings.canonical_conversation_tags`
   (`app/api/v1/conversation-tags/route.ts:32-36`) — uma lista **curada à mão** nas configurações,
   não as tags realmente em uso.
3. O editor aceita **tag livre**: um `Input` com “Nova tag…” em
   `components/inbox/ConversationTagsEditor.tsx:72-85`, e o vocabulário entra só como `suggestions`
   (linha 42). O `PATCH` valida apenas o formato — `conversationTagSchema`
   (`lib/schemas/messaging.ts:146`): minúsculas, 1 a 40 caracteres. **Não** valida contra o vocabulário.

**Consequência.** Numa instalação onde ninguém preencheu a lista canônica, o seletor de tag
**simplesmente não existe** — mesmo com centenas de conversas etiquetadas. E qualquer tag digitada
livremente fica invisível ao filtro para sempre.

**Agravante — assimetria com o filtro de canal.** O canal tem tratamento explícito para “filtro órfão”
(`filtroForaDaLista`, `InboxFilters.tsx:89-96`): se o número filtrado sumiu da lista, o seletor **fica**
e escreve “Número removido”. O comentário ali explica exatamente o perigo — *“deixa o inbox mostrando um
subconjunto, às vezes vazio, sem nada na tela dizendo que há filtro”*. A tag **não tem** esse
tratamento: se o vocabulário esvaziar (alguém limpou a lista, ou o JSON ficou malformado e o
`.catch([])` de `lib/schemas/settings.ts:50` devolveu vazio em silêncio) com um filtro de tag ativo, o
seletor inteiro **desaparece com o filtro ainda aplicado**. É o mesmo defeito que o vizinho já resolveu.

**Provado na tela.** Nesta instalação, o seletor “Todas as tags” oferece oito opções —
`dúvida, reclamação, troca, devolução, elogio, orçamento, pós-venda, urgente` — que são as de semente.
Medido pela API: **nenhuma conversa tem tag nenhuma** (`tags: []` nas duas), e filtrar por `dúvida`
devolve **0**. Ou seja, um seletor inteiro cujas oito opções não filtram nada.

E a assimetria aparece na mesma tela: a conversa do CPFL **exibe uma tag “Pessoal”** na lista — que é
tag do **contato** — e “Pessoal” **não está** entre as oito do seletor. O operador vê uma etiqueta na
tela e não tem como filtrar por ela.

**Conserto.** Duas mudanças pequenas e uma decisão:
- Aplicar ao filtro de tag o mesmo tratamento de órfão que o canal tem (o padrão já está escrito ao lado).
- Alimentar o vocabulário com as tags **em uso** (um `distinct` sobre `conversations.tags`), unidas às
  canônicas — assim tag livre vira filtrável.
- Decidir: ou tag é vocabulário fechado (e o editor recusa livre), ou é aberta (e o filtro acompanha).
  Hoje é aberta na escrita e fechada na leitura, que é o pior dos dois.

---

## F. Os contadores das abas ignoram os filtros auxiliares

**Onde.** [`app/api/v1/conversations/counts/route.ts:45-80`](../../app/api/v1/conversations/counts/route.ts#L45).

**O que acontece.** As quatro contagens filtram por organização e pelo predicado da aba. Não recebem
`channel_session_id`, `tag`, `search` nem `unread`. Então, com o filtro de tag “suporte” ativo, a aba
“Todas” mostra o badge **318** enquanto a lista abaixo tem **4** linhas.

**Provado na tela:** com “Não lidos” ligado, a lista mostra **zero** linhas e a aba continua estampando
**Todas 2** (ver a prova do achado A). Medido também pela API: `/conversations/counts` devolve
`{fila: 0, automatico: 0, mine: 1, all: 2}` — os mesmos números, independentemente do que a tela filtra.

**Por que conta como achado, e não como escolha.** O próprio arquivo declara a regra, duas vezes: *“um
badge que conta o que a aba não mostra é pior que badge nenhum — manda o atendente procurar um trabalho
que não existe”*, e há um teste (`badge-espelha-a-aba.test.ts`) guardando o espelhamento. O
espelhamento foi feito para o **predicado da aba** e não para os filtros ao lado — a regra está certa e
a cobertura dela parou na metade.

**Conserto.** A rota de contagem aceitar os mesmos filtros auxiliares, e o hook mandá-los. Alternativa
mais barata, se o custo de quatro `count` filtrados incomodar: **esconder os badges enquanto houver
filtro auxiliar ativo** — um número ausente não mente; um número errado, sim.

---

## G. Corrida entre o debounce da busca e a troca de aba

**Onde.** [`InboxFilters.tsx:100-109`](../../components/inbox/InboxFilters.tsx#L100).

```
useEffect(() => {
  const t = setTimeout(() => {
    if (searchInput !== value.search) onChange({ ...value, search: searchInput });
  }, 250);
  return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [searchInput]);
```

O efeito depende só de `searchInput`, então o timer captura o `value` do render em que foi agendado —
**incluindo o `tab`**. Se o operador digita e clica noutra aba dentro de 250 ms, o timer dispara com o
`value` velho, e `setFilterValue` (`InboxLayout.tsx:132-143`) vê `next.tab !== tab` e faz
`router.replace` **de volta para a aba anterior**.

Janela estreita, mas o gesto é comum: digitar o nome, ver que a conversa não está nesta aba, clicar em
“Todas”. O `eslint-disable` é o que esconde isto do linter.

**Conserto.** Guardar o texto num `ref` e ler o `value` corrente no momento de disparar, ou agendar o
debounce sobre `search` apenas (`onChange` recebendo uma função de atualização em vez do objeto
inteiro). Teste: agendar, trocar a aba, avançar o timer falso, e cobrar que a aba **não** voltou.

---

## H. Busca de um caractere vai ao banco

**Onde.** `search: z.string().optional()` — `lib/schemas/messaging.ts:317`. Sem `.min()`, sem `.trim()`.

**Provado na tela:** `?search=a` devolveu **as 2 conversas** — isto é, a lista inteira. Numa base do
tamanho da instalação do vídeo (8.067 conversas) isso é a lista inteira reordenada, que é o modo de
falha que o próprio comentário do handler descreve.

Buscar `a` dispara a consulta de contatos, casa 120 arbitrários (achado D) e faz um `ilike '%a%'` em
`last_message_preview` **sem índice** (ver abaixo). O handler já tem o piso de 4 dígitos para o ramo de
telefone, com o raciocínio certo escrito no comentário — *“12 casaria metade da base e devolveria a
lista inteira embaralhada, pior que não achar, porque PARECE que funcionou”*. Esse mesmo raciocínio
vale para o texto e não foi aplicado a ele.

**Nota sobre índices, medida no `baseline.sql`:**

| coluna usada pela busca | índice |
|---|---|
| `contacts.name` | `idx_contacts_org_name_trgm` (GIN trigram) ✓ |
| `contacts.display_name` | **nenhum** — e é o primeiro campo do `.or()` |
| `contacts.phone_number` | só `idx_contacts_phone_lookup_pendente` (parcial, não serve para `ilike '%x%'`) |
| `conversations.last_message_preview` | **nenhum** |

A extensão `pg_trgm` **existe** — vem de `scripts/selfhost-prelude.sql:38`, aplicado antes do baseline
na instalação self-host, e de `scripts/test-db.sh:212` no CI. (Verifiquei porque o `baseline.sql` só
declara `pgcrypto`, e o uso de `gin_trgm_ops` sem a extensão teria sido um defeito de instalação —
não é.)

**Conserto.** `.min(2)` no schema, e índice trigram em `display_name`. O índice em
`last_message_preview` é decisão de custo — vale medir antes numa base real.

---

## Verificado e CORRETO — não mexer

Registrado para que ninguém “conserte” o que funciona:

1. **`.or()` chamado duas vezes (busca + cursor de paginação) está certo.** Medi: o `postgrest-js`
   emite **dois** parâmetros `or=` na URL, e o PostgREST combina parâmetros repetidos com `AND`.
   Saída da medição:
   ```
   or[0] = (last_message_preview.ilike.*ana*,contact_id.in.(uuid-a,uuid-b))
   or[1] = (last_message_at.lt.2026-01-01,and(last_message_at.eq.2026-01-01,id.lt.zzz))
   ```
2. **O teto de ids por bytes de URL** (`ORCAMENTO_DE_IDS_NA_URL`, `idsQueCabemNaURL`) é bem resolvido —
   corta por byte, que é o que estoura, e o comentário traz a medição contra o Kong.
3. **O tratamento do canal removido** (`filtroForaDaLista`) é o padrão certo — é ele que o filtro de
   tag deveria copiar.
4. **O filtro de tag usa `.contains("tags", [tag])`**, que casa o índice GIN
   (`idx_conversations_tags_gin`, `baseline.sql:5472`). Correto.
5. **Multi-tenancy:** as duas consultas (conversas e contatos auxiliares) filtram
   `organization_id` manualmente, como a doutrina exige do service role. O comentário na consulta de
   contatos até nomeia a razão. Correto.
6. **`termoSeguroParaOr` está certo** — trocar `,`, `(` e `)` pelo curinga funciona nos **dois** ramos,
   porque o PostgREST converte `*` em `%` em todo `like`/`ilike`. Provado em produção (ver a seção B
   retirada). Não mexer.

---

## O que NÃO foi medido

Declarado para que ninguém leia este documento como mais do que ele é:

- **O beco sem saída do achado A** (o botão “Carregar mais” não ser desenhado quando o filtro esvazia a
  página) **não foi provado na tela** — precisa de mais de 50 conversas, e a instalação testada tem 2.
  Sustentado só por leitura de código.
- **O achado D** (os 120 contatos sem ordem definida) **não foi provado** — precisa de uma base com
  centenas de contatos casando o mesmo termo. Sustentado só por leitura de código.
- **O achado G** (a corrida entre o debounce e a troca de aba) **não foi provado** — a janela é de
  250 ms e eu não a exercitei com precisão suficiente para afirmar. Sustentado só por leitura de código.
- **Não rodei a suíte de testes.** Nenhum código foi alterado, então não havia o que reprovar; mas
  também não confirmei que os testes citados passam hoje.
- **Não medi desempenho.** Afirmo que faltam índices em `display_name`, `phone_number` e
  `last_message_preview`; não medi o tempo de uma busca numa base grande.
- **Não rastreei todos os caminhos de escrita de `last_message_preview`.** Medi o truncamento em dois
  (`zernio/ingest.ts` e um caminho SQL). Outras chamadas com `p_preview` não foram seguidas até a origem.
- **A instalação testada é pequena** (2 conversas, 1 organização, 1 usuário). Ela serviu para provar
  **mecanismo** — que o filtro não vai ao servidor, que a busca não alcança o histórico, que o seletor
  de tag não filtra. Não serviu para provar nada que dependa de **volume**.
- **O seletor de canal não foi exercitado pela tela.** A instalação tem **um** canal
  (`5515988263583`), e o seletor só aparece com dois ou mais — então o tratamento de “Número removido”,
  que elogio na lista dos corretos, não foi visto funcionando. Pela API, `?channel_session_id=…`
  devolve as 2 conversas corretamente.
- **Não testei sob `visibility_mode` restrito**, nem como `agent` — só como administrador.
- **Não testei escrita.** Nada foi enviado, fechado, transferido ou etiquetado na instalação real: toda
  a segunda rodada foi leitura.
