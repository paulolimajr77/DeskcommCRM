# Protocolo de atendimento e histórico que abre a conversa — design

> Data: 2026-09-12 · Âncora: **`origin/main`** @ `e142504d` · Medido nela, nunca no disco desta branch
> Origem: lacunas ③ e ④ do [comparativo com o Atendechat](../../research/atendechat-inbox-comparativo.md).
> Destino: **PR ao Rafael** (jeito 1), dois PRs a partir desta spec.
> A pesquisa propôs um desenho; a medição derrubou. Este documento é o desenho medido.

---

## 1. O que falta, e o que a medição corrigiu

O concorrente dá a cada atendimento um número (`#202606-677A02383B9`), visível na ficha e no
histórico, e o painel lateral lista "Conversas Anteriores (5)" — cada bloco com **protocolo, data,
quantas mensagens, quem encerrou** — e abre o atendimento inteiro num modal.

Nós temos **a data e o desfecho**, e só. Protocolo não existe: `grep` por `protocolo`,
`protocol_number` e `service_protocol` na `origin/main` devolve apenas `protocol` no sentido de rede
(HTTP, cookie, WAHA). Nenhum identificador legível por humano.

### ⛔ A pesquisa propôs a coluna no lugar errado

> *"Coluna `service_protocol text` em `conversations`"* — [comparativo, PR 1](../../research/atendechat-inbox-comparativo.md)

**Isso daria um número por CONVERSA, e conversa aqui é o fio inteiro com a pessoa, para sempre.**
Medido: o histórico do painel não lê `conversations` — lê **`demandas`**:

```
app/api/v1/contacts/[id]/crm-summary/route.ts:124
  .from("demandas").select("id, desfecho, fechada_em")
  .not("fechada_em", "is", null).order("fechada_em", …).limit(5)
```

E `conversations.current_demanda_id` aponta para a demanda **vigente** — o que só faz sentido se uma
conversa atravessa várias demandas ao longo do tempo. É exatamente o "Conversas Anteriores (5)" do
concorrente: cinco atendimentos, um contato, um fio.

**A unidade de atendimento deste produto já existe, e é a `demanda`.** Ela tem `aberta_em`,
`fechada_em`, `origem` (`inbound`/`handoff`/`followup`/`manual`/`derivada`), `estado`, os seis
`desfecho` que a tela de fechar já oferece, e **dono que nunca é vazio** (`dono_kind` +
`dono_user_id`) — que é o "quem encerrou" do concorrente, já modelado.

---

## 2. A armadilha que decide o custo do histórico

`messages.demanda_id` **existe e é escrita** — não é coluna morta como foi o `last_heartbeat_at`.
Quem escreve:

```
fn_service_inbound  (baseline.sql:19103 na origin/main)
  update public.messages set service_revision=…, demanda_id=d.id, demanda_revision=d.revision
```

Chamada pelo gatilho `trg_demanda_abre_no_inbound`, que dispara em **toda** inserção de mensagem.

### ⛔ Mas só mensagem de ENTRADA é carimbada

```
fn_service_inbound, primeira linha do corpo:
  if not found or m.direction <> 'inbound' or m.service_revision is not null then return; end if;
```

O gatilho dispara sempre; a função **sai fora** quando a direção não é `inbound`. Então toda resposta
— do atendente e do agente de IA — tem `demanda_id` **nulo**.

**É uma falha-em-verde perfeita, e era o caminho óbvio.** Contar "quantas mensagens teve este
atendimento" com `count(*) where demanda_id = X` devolve um número, sem erro, sem aviso — e o número
é **metade da conversa**. Abrir "o atendimento inteiro" pelo mesmo caminho mostra um monólogo do
cliente, com as respostas sumidas.

Foi a medição que impediu isto. É por isso que esta spec existe em vez de um plano direto.

---

## 3. Decisões

| # | Decisão | Por quê |
|---|---|---|
| **D1** | **O protocolo mora em `demandas`, não em `conversations`** | É a unidade de atendimento medida (§1). Na conversa, seria um número por pessoa, vitalício — que não é o que alguém cita no telefone |
| **D2** | **O protocolo é COLUNA GERADA, derivada de `id` + `aberta_em`** — não há sequência, não há escrita, não há backfill | Doutrina DIRC, letra **C**: pode ser calculado. Derivado, ele existe no instante em que a linha existe; **é impossível haver demanda sem protocolo** — e linha sem protocolo seria a falha que o recurso veio evitar |
| **D3** | **Formato `AAAAMM-XXXXXXXX`**, com os 8 primeiros hex do uuid em maiúscula | Legível ao telefone, ordenável por mês, e sem coordenação: o uuid já é único por construção. Sequência exigiria trava e brigaria entre instalações |
| **D4** | **As respostas passam a ser carimbadas com a demanda** — o carimbo deixa de ser só do `inbound` | Sem isto, contagem e leitura do histórico entregam metade (§2). O conserto é na origem, que é a regra: nunca deduzir um sinal que o banco pode guardar |
| **D5** | **O que já está no banco é carimbado por migration de dados**, pela janela da demanda sobre as conversas vinculadas (`demanda_conversas`) | O D4 só vale daqui para frente. Sem o backfill, todo histórico anterior à versão continua pela metade — e o operador não tem como saber qual |
| **D6** | **A janela só é usada no backfill, nunca em consulta de tela** | Na fronteira entre uma demanda que fecha e outra que abre, a janela erra a atribuição — e a fronteira é o caso comum. Uma vez, com os dados parados, é aceitável; a cada leitura, não |
| **D7** | **PR 1 é o protocolo; PR 2 é o histórico.** O PR 2 depende do 1 | O histórico sem protocolo mostra data e contagem, mas não identifica o atendimento — que é o pedido |
| **D8** | **O modal do histórico é LEITURA.** Não responde, não reabre, não transfere | Atendimento encerrado que aceita ação vira uma segunda porta para o mesmo trabalho, concorrendo com o Inbox |

---

## 4. Schema — o número

**O número da migration se mede na âncora, no momento do commit:**

```bash
git fetch origin
git ls-tree -r --name-only origin/main -- supabase/migrations \
  | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1
```

⚠️ **Não escreva um número nesta spec.** Hoje o topo é `0238` e o PR 0 (busca e filtros) reserva o
`0239` — mas **só quando ele mergear**. Se este PR for commitado antes, os dois medem `0238` e
escolhem `0239`: colisão, que é o **erro nº 1** dos recorrentes de contribuidor (renumerada 11 vezes
desde agosto; cinco PRs disputando o mesmo `0161` na issue #285). A regra é medir **no commit**, e
renumerar trocando **o número e o timestamp juntos** — renumerar só o número é o que fabrica colisão
de timestamp.

```sql
alter table public.demandas
  add column if not exists protocolo text
  generated always as (
    to_char(aberta_em at time zone 'UTC', 'YYYYMM') || '-' ||
    upper(substr(replace(id::text, '-', ''), 1, 8))
  ) stored;

create index if not exists idx_demandas_org_protocolo
  on public.demandas (organization_id, protocolo);
```

⚠️ **O `at time zone 'UTC'` não é enfeite.** `to_char` sobre `timestamptz` depende do fuso da sessão,
o que a torna `STABLE` — e o Postgres **recusa** expressão não-`IMMUTABLE` em coluna gerada. Forçar o
fuso devolve um `timestamp` sem fuso, e aí a expressão é imutável. **Não medido nesta sessão** — é o
primeiro passo da tarefa, no Postgres descartável, antes de qualquer outra coisa.

**Nenhum backfill para o protocolo:** coluna gerada calcula sozinha para as linhas que já existem.
O backfill do **D5** é outro, e é de `messages.demanda_id`.

**Sem RLS nova:** `demandas` já é tenant-aware e já tem a policy. Coluna nova em tabela protegida não
abre superfície — mas o índice leva `organization_id` na frente, como todo índice desta tabela.

---

## 5. Isolamento entre organizações

⛔ **Vendemos tenants: uma organização ver dado de outra não é defeito grave, é o fim do produto.**
As peças que esta spec toca, medidas:

| peça | client | quem isola |
|---|---|---|
| `demandas` (coluna nova) | — | a policy de tenant que a tabela já tem; a coluna não muda alcance |
| `crm-summary/route.ts` (o histórico) | **sessão** (`createClient`) → a RLS vale | RLS **e** o `.eq("organization_id", …)` que a rota já aplica |
| a rota nova que devolve as mensagens de um atendimento | **a definir na tarefa** | se usar admin client, o filtro manual é a **única** barreira — e aí ele é obrigatório e testado |

**Nenhuma função `security definer` nova.** Se alguma vier a ser necessária, ela **não** recebe a
organização por argumento sem conferir quem chamou: é a classe de defeito que um relatório da
comunidade explorou na v1.0.0 (`emit_event`, `retrieve_top_k_chunks`, consertados na 0149), e o gate
que a vigia cobre **lista fixa de duas funções** — não varre. Ver `FILA.md`, item 13.

---

## 6. Living System Checklist

```
Living System Checklist — Protocolo e histórico de atendimento

[x] Onde eu poderia VAZAR entre organizações?   ← para nós, a primeira pergunta
    §5. O protocolo deriva do id da demanda, que já é escopado por organização.
    A rota nova de mensagens do atendimento é a única superfície a provar.

[x] Quem me alimenta?
    demandas (aberta_em, fechada_em, desfecho, dono_user_id, origem),
    demanda_conversas (qual conversa), messages (demanda_id, direction).

[x] Quem eu alimento?
    CRMSidePanel (o bloco "Histórico encerrado"), o modal de leitura, e a busca
    do Inbox — o protocolo entra como termo procurável.

[x] Que registro eu emito?
    NENHUM na leitura, deliberado: abrir histórico não é mutação, e auditar
    leitura de tela produz o lixo que o CLAUDE.md condena (95% do audit de uma
    VPS eram batidas de cron vazias). O protocolo em si é derivado: não há
    escrita a auditar.

[x] Onde eu apareço na tela?
    /app/inbox, painel lateral: cada atendimento anterior com protocolo, data,
    contagem e quem encerrou; e o modal que abre a conversa daquele atendimento.

[x] Por qual porta se chega até mim?
    Nenhuma tela nova — tudo dentro do Inbox. Nada a declarar em
    lib/navigation/catalogo.ts. (Verificado, não presumido: é o catálogo que
    declara, não o registry — `grep -c 'href:'` dá 49 e 0.)

[x] Qual meu anti-morte?
    N/A justificado: leitura de histórico não é demanda e não tem ciclo de vida.
    O anti-morte das demandas ABERTAS é o motor de follow-up e o Radar, vivos.

[x] Onde se CONFIGURA o que eu uso?
    Nada a configurar: o formato é fixo por decisão (D3). Formato configurável
    faria o número deixar de ser comparável entre instalações, e o número existe
    justamente para ser citado fora do sistema.

[x] Qual a continuidade IA↔humano?
    `demandas.dono_kind` já distingue quem atendeu — o histórico passa a MOSTRAR
    isso, que é continuidade virando superfície: hoje o dado existe e não aparece.

[x] A regra do tempo — quem OBSERVA e o que AGE?
    Só observa. O modal é leitura (D8). Nada aqui é irreversível.

[x] Qual meu LAÇO DE RETORNO?
    O protocolo fecha um laço que hoje está aberto FORA do sistema: a pessoa liga
    citando um atendimento e ninguém consegue encontrá-lo. Com ele, a busca do
    Inbox encontra — e é o que permite medir quantas vezes o mesmo contato voltou
    pelo mesmo assunto, que hoje não é contável.

[x] Atualizei o mapa vivo?
    Sem peça nova: a aresta demanda→tela já existe e passa a carregar mais.
    docs/architecture/ não muda. (Declarado, não esquecido.)
```

---

## 7. Fora de escopo

- **Protocolo em `conversations`** — recusado com medição (§1).
- **Sequência numérica por organização** (`#00001`) — exigiria trava e não sobrevive a duas
  instalações comparando números. O uuid já resolve.
- **Protocolo visível ao cliente final** (enviado na mensagem) — é decisão de produto e de canal, com
  custo de anti-banimento. Item separado.
- **Reabrir um atendimento pelo histórico** — D8.
- **Exportar o atendimento em PDF** — pedido plausível, nenhuma medição por trás.

---

## 8. Riscos

| Risco | Mitigação |
|---|---|
| `to_char` recusado em coluna gerada por não ser `IMMUTABLE` | O `at time zone 'UTC'`. **Provar no Postgres descartável antes de escrever o resto** |
| O backfill do D5 errar a atribuição na fronteira entre demandas | Roda **uma vez**, com dados parados, e só onde `demanda_id is null`. A janela nunca entra em consulta de tela (D6) |
| O carimbo do outbound (D4) tocar o caminho de envio | O carimbo é gatilho de banco depois do insert, como o do inbound já é — não entra no caminho que envia |
| Contagem de mensagens ficar cara com histórico longo | Índice `(demanda_id)` em `messages`; a lista já é `limit 5` |

---

## 9. Critérios de aceite

1. Toda demanda — inclusive as que já existiam — tem protocolo, sem backfill ter rodado.
2. Duas demandas nunca compartilham protocolo; conferido por consulta de duplicidade na base de teste.
3. O protocolo encontra o atendimento pela busca do Inbox.
4. O painel mostra, por atendimento anterior: protocolo, data, **contagem de mensagens** e quem encerrou.
5. ⛔ **A contagem bate com o número de mensagens que o modal exibe** — e as duas incluem **entrada e
   saída**. É o critério que pega a falha-em-verde do §2: sem o D4, os dois números concordam entre si
   e estão errados juntos.
6. O modal abre em leitura e não oferece responder, reabrir ou transferir.
7. ⛔ **Organização A não lê atendimento de B** — caso de isolamento verde. Falhando, cancela o PR.
8. `pnpm test:db` verde, com o baseline provado em **install e update** num `pgvector/pgvector:pg15`.
9. Migration numerada contra `origin/main` **no commit**, com a tripla no mesmo commit.
10. Provado na tela da nossa instalação, pelo Paulo, **antes** do PR — provocando o caminho do erro.

---

## 10. O que esta spec NÃO mediu

- **Se o Postgres aceita a expressão da coluna gerada.** É a primeira coisa a provar.
- **Quantas demandas fechadas existem numa base real** — o custo do backfill do D5 não foi estimado.
- **Se `demanda_conversas` está populada** em instalações antigas. Se não estiver, o backfill do D5
  não tem por onde começar, e o histórico anterior fica declaradamente pela metade.
- **Nada foi rodado contra Postgres nesta sessão** — toda a medição foi leitura de `origin/main`.
- **A tela não foi exercitada** para este recurso; a leitura do painel vem da rodada de 2026-09-11.
