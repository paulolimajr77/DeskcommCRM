# O agente enxerga e preenche os campos do funil — design

**Data:** 2026-09-14
**Estado:** desenho aprovado em conversa; falta revisão do documento e o plano

---

## O problema, medido

O produto deixa o dono do CRM declarar até 50 campos por funil, desenha todos na
ficha do lead, e **o agente não sabe que eles existem**.

Medido nesta instalação, hoje:

```
funil "Clientes" → 6 campos declarados:
  prazo · segmento · tipo_projeto · referencias · tem_conteudo · dominio_hospedagem

leads existentes: 4        leads com algum campo preenchido: 0
skill_activations: tabela VAZIA
```

O time do mantenedor abriu a porta da escrita em 2026-09-08 (`custom_fields`
entrou em `crm_update_lead`), e o comentário do commit descreve o defeito com
precisão:

> *"o produto deixa criar até 50 campos por funil, desenha todos na ficha do lead
> — e nenhum agente conseguia preencher um."*

**Abriram a porta e não entregaram a chave.** O agente pode gravar e não sabe
onde.

### Onde exatamente está o buraco

A definição dos campos (`pipelines.settings.fields`) é lida por **um lugar só**
em todo o produto:

```bash
grep -rn "camposDoFunil" --include=*.ts lib app components | grep -v test
#  lib/leads/campos-do-funil.ts          (a função)
#  app/api/v1/contacts/[id]/crm-summary  (o painel lateral do Atendimento)
```

Nada do motor do agente lê. E é preciso ser preciso sobre o que falta, porque a
primeira leitura desta investigação errou nisto:

| O agente… | Hoje |
|---|---|
| **lê os VALORES** já preenchidos | **sim** — `crm_get_lead` devolve `*`, `custom_fields` inclusive |
| **conhece a DEFINIÇÃO** (chave, rótulo, tipo, obrigatório, opções) | **não** — em lugar nenhum |

Com o lead novo, `custom_fields` é `{}`. Um objeto vazio não ensina nada: o
modelo não tem como inventar `tipo_projeto` nem saber que ele existe.

### Por que a skill não resolve — e cria o defeito que o dono relatou

A `coleta-briefing` carrega a lista de campos **escrita à mão, entre colchetes**,
dentro do texto dela. E ela só entra em ação por palavra-chave:

```
"quero fechar" · "vamos fechar" · "bora começar" · "pode fazer"
"como faço para contratar" · "como contrato" · "quero contratar"
"vamos começar" · "fechar o projeto" · "fechar negócio"
```

Resultado, na voz de quem opera: *"não é no 'vamos fechar', é durante a coleta de
informações do cliente que deve ser preenchido"*. O cliente conta o segmento, o
tipo de projeto e o prazo durante a conversa inteira — e o agente ouve tudo sem
anotar nada, porque não sabe que há onde anotar. Quando a frase de fechamento
enfim vem, a skill entra e manda **perguntar as seis coisas de novo**.

A própria skill tenta remendar (*"se o lead já respondeu antes, não perguntar de
novo"*), e o remendo depende de a conversa inteira ainda caber na janela do
modelo. Conversa longa, não cabe.

E há um terceiro efeito, silencioso: **renomear um campo na tela do funil quebra
a skill sem avisar.** Ela continua gravando na chave velha, o campo novo fica
vazio para sempre, e nenhum gate reclama — a chave é texto livre dentro de um
markdown.

---

## O que este desenho faz

1. O agente **recebe a definição dos campos** do funil em todo turno.
2. Ele **anota o que o cliente diz, quando o cliente diz** — não no fim.
3. Ele **nunca sobrescreve** valor escrito por gente: propõe a troca.
4. Antes de passar para humano, ele **confere os obrigatórios** e pergunta o que
   falta — sem travar a passagem se o cliente não souber.
5. Ele pode **propor um campo novo** quando o cliente diz algo importante que não
   tem onde caber. Propor, nunca criar.
6. Tudo isso é **ligado por chave na configuração do agente**, e nasce
   **desligado**.

### O que este desenho NÃO faz

- **Não cria campo sozinho.** Ver "Criar campo é configuração, não dado".
- **Não deduz.** Só grava o que o cliente disse. Ver a regra no bloco de sistema.
- **Não mexe no que o humano escreveu.**
- **Não substitui a `coleta-briefing`** — encolhe o papel dela (ver Onda 4).

---

## ⚠️ A regra que derruba a primeira versão deste desenho

A proposta original dizia: *"cada preenchimento vira linha na timeline — 'o
agente anotou: segmento = clínica' — com a frase do cliente que originou"*.

**Isso é proibido, e a proibição está escrita no código**, em
`app/api/v1/leads/_handler.ts`, no ponto exato onde a atividade de edição é
emitida:

> ⚠️ **O REASON NOMEIA OS CAMPOS, NUNCA OS VALORES.** Se você veio aqui para
> deixar a timeline "mais informativa" pondo o antes-e-depois — pare: neste
> produto o TÍTULO É O NOME DO CLIENTE, e `custom_fields` é dado arbitrário do
> tenant, sem limite conhecido. O reason é RENDERIZADO NA TELA e vai junto em
> captura, exportação e ticket de suporte; o §9 proíbe PII nova em log, reason ou
> evidence.

E a exceção declarada logo abaixo diz o critério, que não é a forma da frase:

> NÃO confunda com a atividade de autorização vencida, que mostra antes-e-depois
> DE PROPÓSITO: lá o texto é a proposta do PRÓPRIO AGENTE, escrita por máquina.
> **A origem do texto é que decide.**

A frase do cliente é escrita pelo cliente. É PII. **Não entra na timeline.**

**Onde ela entra, então:** em `contact_field_proposals.trecho` — coluna que já
existe exatamente para isso, sob RLS, e cujo comentário no schema explica o
porquê: *"`trecho` é o que a pessoa escreveu; sem ele a confirmação é um ato de
fé"*. É o lugar certo, já construído, e é para lá que a evidência vai.

**Consequência para o desenho:** a timeline nomeia **quais** campos o agente
anotou; o **valor** e a **frase** vivem onde o acesso é controlado.

---

## Peça por peça, com o impacto no sistema em funcionamento

### 1. O bloco de campos no prompt — e o custo

Os blocos residentes do agente são montados em
`lib/agent-engine/agent/inbound-turn.ts`:

```ts
const blocosResidentes = [systemWithMemory, TRANSPARENCIA_SYSTEM_BLOCK];
if (agentConfig !== null && agentConfig.casesEnabled) blocosResidentes.push(CASES_SYSTEM_BLOCK);
```

O bloco novo entra aqui, no mesmo padrão do `AGENDA_SYSTEM_BLOCK`, condicionado à
chave nova.

⚠️ **E aqui mora o impacto de custo, que decide o desenho.** Esse prefixo é
**cacheado pelo provedor** (`buildStablePrefix`, cache efêmero da Anthropic):
mesmas entradas ⇒ mesmos bytes ⇒ prefixo reaproveitado. Então:

| O quê | Varia por | Vai em |
|---|---|---|
| **definição** dos campos (chave, rótulo, tipo, obrigatório, opções) | organização | **prefixo estável** — cacheia |
| **valores já preenchidos** deste lead | lead | **sufixo por-lead** — não cacheia |

Pôr os valores no prefixo estável invalidaria o cache **a cada turno de cada
lead** e aumentaria o custo de todo atendimento. É o mesmo arranjo que as skills
já usam: índice no prefixo, corpo no sufixo.

**Impacto nas instalações que não ligarem:** zero bytes a mais. O bloco só é
empilhado quando a chave está ligada, e a chave nasce desligada.

### 2. A gravação — a ferramenta já existe, e o merge também

`crm_update_lead` aceita `custom_fields` e o handler faz merge, não substituição:

```ts
patch.custom_fields = { ...prev, ...input.custom_fields };
```

**Nada a mudar aqui.** Anotar um campo não apaga os outros — está medido no
código, não suposto.

### 3. A timeline — já existe, e já nomeia

`updateLeadHandler` emite `lead_edited` com `reason: "Alterou os campos
personalizados"` e `payload: { fields }`. O vocabulário já tem a tradução:

```ts
custom_fields: "os campos personalizados",
```

**Impacto:** o preenchimento pelo agente **já apareceria** na timeline hoje. O
que falta é distinguir quem anotou. O `actor` já é gravado, então a distinção é
de LEITURA, não de escrita.

`crm_lead_activities.type` **não tem CHECK no banco** — confirmado no catálogo:

```
select conname from pg_constraint where conrelid='public.crm_lead_activities'::regclass
  and contype='c' and pg_get_constraintdef(oid) ilike '%type%';
→ SEM CHECK — vocabulário aberto
```

Isso é deliberado (`CLAUDE.md`, "Exceção deliberada — colunas de vocabulário
ABERTO"): clone com valor legado não pode quebrar no `update.sh`. **Então um tipo
novo de atividade não exige migration** — exige constante compartilhada no
TypeScript, nunca string literal, e fica fora do invariante de vocabulário.

### 4. O conflito com valor humano — proposta, não escrita

Regra: **dado escrito por gente tem precedência sobre dado inferido por modelo**,
e isso mora no código, não na instrução do prompt — instrução o modelo
desobedece; código não.

A mecânica já existe inteira para os dados do contato:

```
contact_field_proposals
  campo · valor_proposto · valor_anterior
  conversation_id · message_id · trecho     ← a evidência, sob RLS
  proposed_by_agent_id · status · expires_at · decided_at · decided_by_user_id
```

Com tela (`components/contacts/PropostasDeDado.tsx` — *"O QUE A IA OUVIU E ESPERA
UMA PESSOA CONFIRMAR"*), rotas de decidir, e cron de vencimento
(`contact-proposals-watcher`), porque *"prazo que ninguém cobre é pior que prazo
nenhum"*.

**Decisão: estender essa tabela, não criar irmã.** O ciclo de vida é idêntico
(propor → vencer → aceitar/dispensar, com evidência), e duplicá-lo criaria dois
crons, duas telas e duas chances de divergir. Pela doutrina DIRC, isto é
**Integrar**, não Duplicar.

O que a extensão exige, e o que ela protege:

- coluna `destino` (`contact` | `lead_custom_field`) — sem ela, quem consome não
  sabe onde a aceitação escreve;
- coluna `lead_id` (nula quando `destino='contact'`);
- o CHECK de `campo` hoje fecha o vocabulário em `email`/`name`/`phone_number`,
  e o comentário explica por quê: *"o que entra aqui vira escrita em `contacts`,
  e campo livre deixaria a IA propor qualquer coluna"*. Para `lead_custom_field`
  o equivalente não é uma lista fixa — **é a chave existir em
  `pipelines.settings.fields`**, conferido na aceitação, no servidor.

⚠️ **Impacto em quem já tem proposta pendente:** a migration precisa dar
`destino='contact'` às linhas existentes **antes** de tornar a coluna
obrigatória, senão o `update.sh` de um clone com proposta viva quebra. É a regra
8 da doutrina de migrations.

### 5. Os obrigatórios, antes do handoff

`required` **já existe** em `customFieldSchema` — o dono marca na tela e o
produto guarda. O agente é que nunca soube.

O gancho é o `lib/ai/handoff/orchestrator.ts`, que é o ponto único da transição
bot→humano e já executa cinco efeitos em ordem.

⚠️ **Impacto: a conferência NÃO pode travar o handoff.** O orquestrador atende
quatro gatilhos, e um deles é o cliente **pedir** um humano. Segurar a passagem
porque falta um campo transforma uma proteção de dado em uma parede na frente do
cliente. O desenho é: o agente pergunta o que falta **antes** de acionar o
handoff quando ele mesmo decide passar; quando o handoff é pedido ou forçado,
ele passa e **declara o que ficou em branco**.

### 6. Criar campo é configuração, não dado

Criar campo muda a tela de **todos os leads daquele funil**, para sempre. Três
riscos medidos:

- o limite é 50 campos por funil;
- o modelo criaria `dor_principal`, `principal_dor` e `dor` em três conversas —
  nomes que só um humano sabe que são a mesma coisa;
- campo criado por engano não dá para desfazer sem alguém perceber que existe.

Por isso **o agente propõe, com nome sugerido, tipo sugerido e o trecho que
motivou** — e a decisão é de quem administra.

⚠️ **E a proposta de campo NÃO aparece na ficha do lead.** Preencher e corrigir
são do lead; **criar campo é configuração do funil**. Se aparecesse ao lado dos
outros, quem atende aprovaria mudança de estrutura sem perceber que mudou a tela
da empresa inteira. Vai para **Configurações › Funis**, junto de onde o campo já
é criado à mão.

### 7. O sinal na Central

Hoje uma proposta nasce e **ninguém é avisado** — a desta instalação ficou horas
sem ser vista. A Central (`agent_inbox_items`) é o lugar declarado de "isto
precisa de um humano", e o vocabulário dela **é fechado por CHECK**:

```
agent_inbox_items_kind_check → 27 valores, entre eles 'contact_proposal_expired'
```

⚠️ **Impacto:** `kind` novo exige migration, e a doutrina do baseline manda
editar **o bloco único** dessa constraint, nunca recriá-la num apêndice novo — um
bloco antigo com vocabulário velho falha ao re-aplicar num banco que já tem a
linha nova, e `tests/unit/baseline-constraint-reconstruida.test.ts` reprova.

### 8. As chaves na configuração do agente

Duas, separadas de propósito:

| Chave | O que liga |
|---|---|
| `lead_fields_enabled` | enxergar e anotar os campos do funil |
| `lead_fields_propose_new` | propor campo que ainda não existe |

Quase todo mundo vai querer a primeira e não a segunda; juntas numa chave só,
quem quer anotar é obrigado a aceitar sugestões.

Elas acompanham as que já existem (`cases_enabled`, `operator_enabled`,
`handoff_tool_enabled`), na mesma tabela versionada (`ai_agent_versions`), com a
mesma tela (`AgentForm.tsx`).

⚠️ **Impacto em quem atualiza: nenhum.** As duas nascem `false`, como a chamada
de voz nasce desligada. Instalação que atualiza não ganha comportamento novo sem
pedir. E `ai_agent_versions` é **imutável por gatilho** — ligar a chave é publicar
versão nova, e desligar é mover o ponteiro de volta.

---

## As quatro regras que o bloco de sistema precisa carregar

1. **Anote quando ouvir.** O cliente disse, você grava — não espere o fim.
2. **Só o que foi dito.** *"Ele falou em clínica, logo o segmento é saúde"* é
   dedução, e dedução enche o CRM de dado errado com cara de certo. Se a frase não
   contém a resposta, o campo fica vazio.
3. **Não toque no que já está preenchido por gente.** Divergiu? Proponha.
4. **Não pergunte o que já está na ficha.** O agente vê os valores; perguntar de
   novo, na frente do cliente, é o que a skill faz hoje.

A regra 3 está no bloco **e** no código. As outras três são só do bloco — e é por
isso que a 3 é a que o código guarda: é a única cuja violação apaga trabalho de
alguém.

---

## Como isto será provado

| Prova | O quê |
|---|---|
| unidade — bloco | o bloco entra quando a chave está ligada e **não entra** quando desligada (controle: sem a chave, os bytes do prefixo são idênticos aos de hoje) |
| unidade — prefixo | a definição vai no prefixo estável e os valores no sufixo por-lead — medido pelo hash do prefixo em dois leads diferentes da mesma org: **tem de ser igual** |
| unidade — merge | anotar um campo não apaga os outros |
| unidade — precedência | valor escrito por humano + valor novo do cliente ⇒ **proposta**, e o valor gravado não muda |
| unidade — dedução | frase sem a resposta ⇒ nenhum campo escrito |
| unidade — obrigatórios | handoff pedido pelo cliente passa mesmo com obrigatório em branco, e declara o que faltou |
| invariante (CI) | a aceitação de proposta de `lead_custom_field` recusa chave que não está em `settings.fields` |
| invariante (CI) | migration de `destino` deixa linha antiga como `contact` antes de exigir a coluna |
| sabotagem | tirar a conferência de precedência deixa vermelho o caso do valor humano |
| tela (Playwright) | conversa que menciona segmento e prazo ⇒ campos aparecem preenchidos na ficha, e a timeline nomeia os campos **sem** mostrar valor |
| VPS | Paulo conversa pelo WhatsApp e confere na ficha do lead |

**O que NÃO será medido aqui:** `test:db` e `test:e2e` não rodam nesta máquina —
o veredito vem do CI. E o custo real do prefixo cacheado só se mede em produção,
com volume; aqui a prova é de FORMA (o prefixo não varia por lead), não de preço.

---

## Living System Checklist

| Invariante | Resposta |
|---|---|
| entrada | mensagem do cliente no turno do agente |
| saída | `crm_leads.custom_fields` escrito, ou linha em `contact_field_proposals` |
| atividade / log | `crm_lead_activities` nomeando os campos; `api_audit_log` na mutação |
| aparece na tela | ficha do lead, painel do Atendimento, e a Central quando há proposta |
| porta na navegação | as três já existem |
| anti-morte | proposta tem `expires_at` e cron que a vence; campo anotado errado é editável à mão |
| laço de retorno | anotou errado ⇒ o humano corrige na ficha, e a correção passa a ter precedência sobre o agente |

---

## O que fica de fora, e por quê

- **Preencher campo de CONTATO** (nome, e-mail, telefone) — já existe, por
  proposta, e não muda aqui.
- **Editar o valor proposto antes de aceitar.** Aceitar ou dispensar, como já é
  hoje para contato. Um terceiro caminho merece decisão própria.
- **Apagar campo do funil pelo agente.** Não. Propor criação é reversível ao
  custo de um clique; propor remoção apaga dado de todos os leads.
