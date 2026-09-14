# O agente pergunta e preenche os campos que o dono declarou — design

**Data:** 2026-09-14
**Estado:** desenho aprovado em conversa; falta revisão do documento e o plano

---

## O que isto é

**O campo personalizado do funil é o vocabulário do nicho.** Uma clínica declara
`convenio`, `queixa_principal`, `ja_foi_paciente`. Um escritório de advocacia
declara `area_do_direito`, `ha_processo_em_curso`. Uma imobiliária declara
`bairro`, `faixa_de_preco`, `financiamento`. Uma agência declara `tipo_projeto`,
`segmento`, `prazo`.

O produto já deixa declarar até 50 desses por funil, pela tela
(`app/app/settings/tenant/pipelines`), e desenha todos na ficha do lead.

**O agente não sabe que eles existem.** Nem que existem, nem como se chamam, nem
quais são obrigatórios.

Este desenho faz o agente **ler o que o dono declarou, formular a pergunta
sozinho e anotar a resposta durante a conversa** — em qualquer nicho, sem que
ninguém escreva skill nenhuma.

O funil de briefing de agência que motivou o pedido é **um exemplo**, não o
assunto.

---

## A medição

Nesta instalação, hoje:

```
funil "Clientes" → 6 campos declarados:
  prazo · segmento · tipo_projeto · referencias · tem_conteudo · dominio_hospedagem

leads: 4          leads com algum campo preenchido: 0
skill_activations: tabela VAZIA
```

O time do mantenedor abriu a porta da escrita em 2026-09-08 (`custom_fields`
entrou em `crm_update_lead`), e o comentário do commit nomeia o defeito:

> *"o produto deixa criar até 50 campos por funil, desenha todos na ficha do lead
> — e nenhum agente conseguia preencher um."*

**Abriram a porta e não entregaram a chave.**

### Onde exatamente está o buraco

```bash
grep -rn "camposDoFunil" --include=*.ts lib app components | grep -v test
#  lib/leads/campos-do-funil.ts          (a função)
#  app/api/v1/contacts/[id]/crm-summary  (o painel lateral do Atendimento)
```

**Um lugar só em todo o produto**, e não é o motor do agente. E é preciso ser
exato sobre o que falta, porque a primeira leitura desta investigação errou:

| O agente… | Hoje |
|---|---|
| **lê os VALORES** já preenchidos | **sim** — `crm_get_lead` devolve `*` |
| **conhece a DEFINIÇÃO** (chave, rótulo, tipo, obrigatório, opções) | **não** — em lugar nenhum |

Num lead novo `custom_fields` é `{}`. Objeto vazio não ensina chave nenhuma.

### A skill não resolve, e cria o defeito relatado

A `coleta-briefing` carrega a lista **escrita à mão, entre colchetes**, e só
entra por dez palavras-chave de fechamento (`"quero fechar"`, `"vamos fechar"`…).

O cliente conta o segmento, o tipo de projeto e o prazo **durante a conversa
inteira** — e o agente ouve tudo sem anotar, porque não sabe que há onde anotar.
Quando a frase de fechamento enfim vem, a skill entra e manda **perguntar tudo de
novo**.

E renomear um campo na tela do funil **quebra a skill em silêncio**: ela segue
gravando na chave velha, o campo novo fica vazio para sempre, nenhum gate
reclama.

---

## A espinha do desenho

> **Os campos dizem O QUE perguntar. O prompt e a skill dizem COMO e QUANDO.**

| | Onde mora | Quem escreve | Vale para |
|---|---|---|---|
| **O quê** — vocabulário do nicho | `pipelines.settings.fields` | o dono, pela tela | qualquer instalação, no dia 1 |
| **Como e quando** — ordem, tom, regras do negócio | prompt do agente / skill | quem afina o agente | o caso específico |

Hoje a skill carrega **as duas coisas**, e é por isso que é frágil. Tirando a
lista de dentro dela, a skill encolhe para o que só ela sabe — *"uma pergunta por
vez"*, *"nunca informe valor"*, *"se ele não souber o que é domínio, explique em
uma frase"* — e **quem não tem skill nenhuma passa a funcionar mesmo assim**.
Que é o caso de todo cliente novo no dia da instalação.

### O campo já carrega quase tudo que uma pergunta precisa

```ts
key · label · type · required · options
// type: text textarea number date select multiselect boolean email phone url
```

| Declarado | O agente faz |
|---|---|
| `label: "Convênio"`, `type: select`, `options` | pergunta **oferecendo as opções**, e não aceita resposta fora da lista |
| `type: boolean` | pergunta de sim ou não |
| `type: date` | pede data — não grava "semana que vem" como texto |
| `type: number` | pede número |
| `required: true` | é o que ele cobra antes de passar para humano |

E o agente já sabe **em qual funil** trabalha: `ai_agent_versions.pipeline_ids`
(medido: o agente desta instalação está amarrado a um funil). A lista vem do
funil dele, não de todos.

### A chave que falta: `pergunta`

`label: "Conteúdo"` vira pergunta ruim se derivada sozinha. Com

```ts
pergunta: "Você já tem os textos e as imagens, ou vai precisar de ajuda para criar?"
```

fica certa — e **quem vende o CRM configura isso na tela, sem escrever skill**.

**Custo zero de banco:** os campos moram num `jsonb`, então acrescentar uma chave
opcional é só `customFieldSchema` (Zod) mais um input na tela de funis. Sem
migration, sem baseline, sem MANIFEST.

Opcional de propósito: sem ela o agente deriva do `label` e funciona. Com ela,
funciona bem.

---

## ⚠️ A regra que derrubou a primeira versão deste desenho

A proposta original dizia: *"cada preenchimento vira linha na timeline — 'o
agente anotou: segmento = clínica' — com a frase do cliente que originou"*.

**Proibido, e a proibição está no código**, em `app/api/v1/leads/_handler.ts`, no
ponto exato onde a atividade de edição nasce:

> ⚠️ **O REASON NOMEIA OS CAMPOS, NUNCA OS VALORES.** … o reason é RENDERIZADO NA
> TELA e vai junto em captura, exportação e ticket de suporte; o §9 proíbe PII
> nova em log, reason ou evidence.

E a exceção declarada logo abaixo dá o critério, que não é a forma da frase:

> NÃO confunda com a atividade de autorização vencida, que mostra antes-e-depois
> DE PROPÓSITO: lá o texto é a proposta do PRÓPRIO AGENTE, escrita por máquina.
> **A origem do texto é que decide.**

A frase do cliente é escrita pelo cliente. É PII. **Não entra na timeline.**

**Onde entra:** em `contact_field_proposals.trecho`, coluna que já existe para
isso, sob RLS, e cujo comentário no schema explica o porquê — *"`trecho` é o que
a pessoa escreveu; sem ele a confirmação é um ato de fé"*.

**Consequência:** a timeline nomeia **quais** campos foram anotados; o **valor** e
a **frase** vivem onde o acesso é controlado.

---

## Peça por peça, com o impacto no sistema em funcionamento

### 1. O bloco no prompt — e o custo

Os blocos residentes são montados em `lib/agent-engine/agent/inbound-turn.ts`:

```ts
const blocosResidentes = [systemWithMemory, TRANSPARENCIA_SYSTEM_BLOCK];
if (agentConfig !== null && agentConfig.casesEnabled) blocosResidentes.push(CASES_SYSTEM_BLOCK);
```

O bloco novo entra aqui, no padrão do `AGENDA_SYSTEM_BLOCK`, condicionado à chave.

⚠️ **Aqui mora o impacto de custo, e ele decide o desenho.** Esse prefixo é
**cacheado pelo provedor** (`buildStablePrefix`): mesmas entradas ⇒ mesmos bytes
⇒ prefixo reaproveitado.

| O quê | Varia por | Vai em |
|---|---|---|
| **definição** dos campos | organização | **prefixo estável** — cacheia |
| **valores já preenchidos** | lead | **sufixo por-lead** — não cacheia |

Pôr os valores no prefixo invalidaria o cache **a cada turno de cada lead** e
encareceria todo atendimento. É o arranjo que as skills já usam: índice no
prefixo, corpo no sufixo.

**Impacto em quem não ligar:** zero bytes a mais. O bloco só é empilhado com a
chave ligada, e a chave nasce desligada.

### 2. A gravação — a ferramenta já existe, e o merge também

```ts
patch.custom_fields = { ...prev, ...input.custom_fields };
```

**Nada a mudar.** Anotar um campo não apaga os outros — medido, não suposto.

### 3. A timeline — já existe e já nomeia

`updateLeadHandler` emite `lead_edited` com `reason: "Alterou os campos
personalizados"` e `payload: { fields }`.

`crm_lead_activities.type` **não tem CHECK no banco** (confirmado no catálogo), e
isso é deliberado — vocabulário aberto para clone com valor legado não quebrar no
`update.sh`. **Um tipo novo de atividade não exige migration**: exige constante
compartilhada no TypeScript, nunca string literal.

### 4. O conflito com valor humano — proposta, não escrita

**Dado escrito por gente tem precedência sobre dado inferido por modelo**, e isso
mora no CÓDIGO, não na instrução do prompt — instrução o modelo desobedece.

A mecânica existe inteira para os dados do contato: tabela com evidência, tela
(`PropostasDeDado` — *"O QUE A IA OUVIU E ESPERA UMA PESSOA CONFIRMAR"*), rotas de
decisão e cron de vencimento, porque *"prazo que ninguém cobre é pior que prazo
nenhum"*.

**Decisão: estender, não duplicar.** O ciclo de vida é idêntico; duplicá-lo criaria
dois crons, duas telas e duas chances de divergir (doutrina DIRC: **Integrar**).

A extensão exige `destino` (`contact` | `lead_custom_field`) e `lead_id`. O CHECK
de `campo` hoje fecha o vocabulário em três colunas de `contacts`; para
`lead_custom_field` o equivalente **não é lista fixa — é a chave existir em
`settings.fields`**, conferido na aceitação, no servidor.

⚠️ **Impacto em quem já tem proposta pendente:** a migration carimba
`destino='contact'` nas linhas existentes **antes** de exigir a coluna, senão o
`update.sh` de um clone com proposta viva quebra (regra 8 da doutrina).

### 5. Os obrigatórios, antes do handoff

`required` já existe no schema do campo. O gancho é
`lib/ai/handoff/orchestrator.ts`, ponto único da transição bot→humano.

⚠️ **A conferência NÃO pode travar o handoff.** Um dos quatro gatilhos é o cliente
**pedir** um humano; segurar a passagem porque falta um campo transforma proteção
de dado em parede na frente do cliente. Quando o agente decide passar, ele
pergunta o que falta antes; quando o handoff é pedido ou forçado, ele passa e
**declara o que ficou em branco**.

### 6. Propor campo novo — configuração, não dado

Criar campo muda a tela de **todos os leads do funil**, para sempre. Riscos
medidos: o teto é 50 por funil; o modelo criaria `dor_principal`,
`principal_dor` e `dor` em três conversas; campo criado por engano não se desfaz
sem alguém notar.

Então o agente **propõe** — nome, tipo e o trecho que motivou — e quem administra
decide.

⚠️ **E a proposta de campo NÃO vai para a ficha do lead.** Preencher e corrigir são
do lead; criar campo é **configuração do funil**. Na ficha, quem atende aprovaria
mudança de estrutura sem perceber. Vai para **Configurações › Funis**, junto de
onde o campo já é criado à mão.

### 7. O sinal na Central

Hoje uma proposta nasce e **ninguém é avisado** — a desta instalação ficou horas
sem ser vista. `agent_inbox_items.kind` é **fechado por CHECK** (27 valores).

⚠️ **Impacto:** `kind` novo exige migration, e a doutrina manda editar **o bloco
único** dessa constraint, nunca recriá-la num apêndice novo — bloco antigo com
vocabulário velho falha ao re-aplicar, e
`tests/unit/baseline-constraint-reconstruida.test.ts` reprova.

### 8. As chaves na configuração do agente

| Chave | O que liga |
|---|---|
| `lead_fields_enabled` | enxergar, perguntar e anotar os campos do funil |
| `lead_fields_propose_new` | propor campo que ainda não existe |

Separadas: quase todo mundo quer a primeira e não a segunda.

⚠️ **Impacto em quem atualiza: nenhum.** Nascem `false`, como a chamada de voz.
E `ai_agent_versions` é **imutável por gatilho** — ligar é publicar versão nova,
desligar é mover o ponteiro.

---

## As regras que o bloco de sistema carrega

1. **Pergunte a partir do que está declarado.** A lista vem do funil; use
   `pergunta` quando houver, senão derive do `label`. Respeite o tipo: `select`
   oferece as opções, `boolean` é sim ou não, `date` pede data.
2. **Anote quando ouvir.** Não espere o fim da conversa.
3. **Só o que foi dito.** *"Ele falou em clínica, logo o segmento é saúde"* é
   dedução, e dedução enche o CRM de dado errado com cara de certo. Se a frase não
   contém a resposta, o campo fica vazio.
4. **Não toque no que já está preenchido por gente.** Divergiu? Proponha.
5. **Não pergunte o que já está na ficha.**

A regra 4 está no bloco **e** no código — é a única cuja violação apaga trabalho
de alguém.

---

## Como isto será provado

| Prova | O quê |
|---|---|
| unidade — bloco | entra com a chave ligada; **sem a chave, os bytes do prefixo são idênticos aos de hoje** |
| unidade — cache | o hash do prefixo é **igual** em dois leads diferentes da mesma org (definição no prefixo, valores no sufixo) |
| unidade — pergunta | campo com `pergunta` usa a frase; sem ela, deriva do `label`; `select` oferece as opções |
| unidade — tipo | resposta fora das `options` não é gravada; "semana que vem" não vira `date` |
| unidade — merge | anotar um campo não apaga os outros |
| unidade — precedência | valor humano + valor novo do cliente ⇒ **proposta**, e o gravado não muda |
| unidade — dedução | frase sem a resposta ⇒ nenhum campo escrito |
| unidade — obrigatórios | handoff pedido pelo cliente passa mesmo com obrigatório em branco, e declara o que faltou |
| invariante (CI) | aceitar proposta de `lead_custom_field` recusa chave fora de `settings.fields` |
| invariante (CI) | a migration carimba `destino='contact'` antes de exigir a coluna |
| sabotagem | tirar a conferência de precedência deixa vermelho o caso do valor humano |
| tela (Playwright) | funil de **outro nicho** (clínica, com `select` e `boolean`) — conversa preenche, e a timeline nomeia os campos **sem** mostrar valor |
| VPS | Paulo conversa pelo WhatsApp e confere na ficha do lead |

A prova de tela usa um funil que **não é o de briefing**, de propósito: o que se
prova é a capacidade genérica, não o caso que a motivou.

**O que NÃO será medido aqui:** `test:db` e `test:e2e` não rodam nesta máquina —
o veredito vem do CI. E o custo real do prefixo cacheado só se mede em produção
com volume; aqui a prova é de FORMA (o prefixo não varia por lead), não de preço.

---

## Plano em ondas

| Onda | O quê | Entrega sozinha? |
|---|---|---|
| **1** | o agente **recebe a definição** dos campos do funil dele (prefixo estável) e os valores do lead (sufixo) | sim — ele para de perguntar o que já está na ficha |
| **2** | ele **pergunta e anota** durante a conversa, respeitando tipo e opções | sim — é o pedido original |
| **3** | a chave opcional **`pergunta`** no campo, com input na tela de funis | sim — afina sem skill |
| **4** | **nunca sobrescreve humano** — vira proposta na ficha do lead | sim |
| **5** | antes do handoff, **confere os obrigatórios**; pergunta o que falta, e passa declarando o que ficou em branco | sim |
| **6** | **propõe campo novo** em Configurações › Funis, com aviso na Central | sim |
| **7** | as **duas chaves** na configuração do agente, nascendo desligadas | acompanha a 1 |

As ondas 1 e 2 já resolvem o pedido. Da 4 em diante é o que impede o CRM de
encher de dado errado com cara de certo.

A `coleta-briefing` **não é tocada por este trabalho** — ela continua valendo, e
depois da onda 2 pode encolher para o que só ela sabe (ordem, tom, regras do
negócio). Encolher é decisão de quem opera, não deste PR.

---

## O que fica de fora

- **Preencher campo de CONTATO** (nome, e-mail, telefone) — já existe, por
  proposta, e não muda aqui.
- **Editar o valor proposto antes de aceitar** — aceitar ou dispensar, como já é.
- **Apagar campo do funil pelo agente.** Não: propor criação é reversível a um
  clique; remoção apaga dado de todos os leads.
