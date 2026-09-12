# Atualização segura e a agenda que falta — spec

**Data:** 2026-09-12 · **Origem:** incidente em instalação de produção + quatro pedidos do dono do produto

Duas frentes independentes, na mesma spec porque a segunda **depende** da primeira:
enquanto atualizar puder apagar regra de segurança, publicar recurso novo é
aumentar a exposição.

---

## PARTE A — Atualizar não pode apagar regra de segurança

### A.1 O que aconteceu, medido

Numa instalação real, depois de atualizar, **o funil apareceu vazio**. Os dados
estavam todos no banco. O que tinha sumido eram duas regras de acesso:
`crm_leads_select` e `crm_leads_update`.

Sem a regra de leitura e com a segurança por linha ligada, o Postgres nega **em
silêncio**. A tela mostra lista vazia — indistinguível de "não há nada aqui". E
a atualização tinha reportado `success`.

No mesmo dia, uma segunda atualização derrubou **dez** regras diferentes, entre
elas `conversations_select` — nenhuma conversa visível para ninguém.

### A.2 A causa, medida três vezes

O `baseline.sql` aplica cada regra como `drop policy if exists` seguido de
`create policy` — é o único caminho portável, porque o Postgres não tem
`create or replace policy`. E o `update.sh` roda **sem `ON_ERROR_STOP`**, de
propósito, para um clone bagunçado conseguir se curar.

Com o sistema **em funcionamento**, essas operações disputam a tabela com o
tráfego normal e o Postgres mata uma das pontas para desempatar:

| como o banco foi aplicado | travamentos mútuos (`deadlock detected`) |
|---|---|
| sistema inteiro no ar — **o que a atualização faz hoje** | **113** |
| CRM parado (`app`, `worker`, `scheduler`), Supabase no ar | **60** |
| **tudo parado**, incluindo `supabase-rest`, `realtime`, `studio` | **0** |

Três medições, mesma máquina, mesmo dia, mesmo arquivo. Quando o travamento
mata o comando **entre** o `drop` e o `create`, a regra desaparece.

E o sorteio é diferente a cada passada: a segunda reaplicação devolveu
`conversations_select` e levou embora `conversations_agent_insert`. **Reaplicar
não converge** — conserta umas e quebra outras.

**Por que parar só o CRM não basta:** o PostgREST recarrega o mapa do banco a
cada mudança de estrutura. Ele reage ao próprio `drop`/`create` que está sendo
aplicado, e entra na fila contra ele. Medido: `WITH -- Recursively get the base
types of domains` esperando `Lock` com o CRM já parado.

### A.3 O que existe hoje, medido

Antes de propor, o que foi conferido no código e no servidor:

| pergunta | resposta medida |
|---|---|
| existe modo manutenção? | **não** — zero ocorrências em `app/`, `lib/`, `components/`; **não há `middleware.ts`** |
| o `baseline.sql` usa transação? | **não** — zero `BEGIN` |
| o `update.sh` usa `--single-transaction`? | **não** |
| o Supabase é parte do nosso compose? | **não** — `docker-compose.prod.yml` não tem um serviço Supabase sequer |
| quanto custa parar e subir? | **stop 10,3s + start 6,0s ≈ 16s**, medido na instalação real |

A quarta linha é a que decide o desenho: **parar `supabase-rest` só é possível
onde o Supabase é local.** Nesta instalação são 11 contêineres Supabase, mas o
produto também roda contra o Supabase hospedado — e lá não há o que parar. Um
conserto que dependa de parar o PostgREST **não é portável**.

### A.4 Transação única: medida, e o que ela resolve

`psql --single-transaction` com `\set ON_ERROR_ROLLBACK on` cria um ponto de
retorno por comando. Medido num Postgres descartável, com um erro benigno
plantado no meio:

```
psql:/t.sql:6: ERROR:  relation "t_a" already exists     ← o erro benigno
CREATE POLICY                                            ← e os seguintes CONTINUAM
policies sobreviventes: p_um, p_dois
```

**Resolve:** aplicar tudo numa transação sem que "já existe" derrube o resto —
que era o motivo de o `update.sh` rodar sem `ON_ERROR_STOP`.

**NÃO resolve sozinha:** o ponto de retorno é por comando, então um travamento
no `create policy` reverte só ele — e o `drop policy` anterior, que já passou,
permanece. A regra some do mesmo jeito.

### A.5 O conserto — dois caminhos, porque um só não é portável

**Caminho 1 — instalação com Supabase local (detectável).** Parar app, worker,
scheduler **e** `supabase-rest`, `realtime`, `studio`. Medido: **zero
travamentos**. Custo: ~16s a mais, e o CRM fora do ar durante o banco.

**Caminho 2 — instalação com Supabase hospedado.** Não há o que parar do lado do
Supabase. Aqui vale a transação única (A.4) para tolerar o erro benigno, **mais
a peça que converge**: ao fim, conferir as 92 regras e **recriar exatamente as
que faltam** — não reaplicar o arquivo inteiro.

**Por que recriar as que faltam, e não reaplicar tudo:** medido nesta
instalação, reaplicar **não converge**. A segunda passada devolveu
`conversations_select` e levou embora `conversations_agent_insert`; a terceira
trocou o conjunto de novo. Cada passada sorteia. Recriar só o que falta é um
punhado de comandos rápidos, com muito menos superfície para travar.

⚠️ **Isto corrige a versão anterior desta spec**, que mandava "reaplicar uma vez
e conferir de novo". Aquilo era o que eu tinha feito no servidor, e a medição
mostrou que não fecha.

### A.6 O conserto, em passos

1. **Congelar as telas.** Antes de tocar no banco, o sistema entra em modo
   manutenção: quem estiver com o CRM aberto vê um aviso de atualização em
   curso, em vez de clicar em algo que vai falhar. É o que evita que a pessoa
   "descubra" a atualização por um erro.
2. **Parar quem fala com o banco** — `app`, `worker`, `scheduler` **e** as peças
   do Supabase que reagem a mudança de estrutura (`supabase-rest`,
   `realtime`, `studio`). É a diferença entre 60 travamentos e zero.
3. **Aplicar o banco**, guardando a saída inteira em `.deskcomm-banco.log` (já
   feito — foi esse log que permitiu achar a causa; antes era descartado).
4. **Conferir as 92 regras** contra o que o `baseline.sql` declara, **antes** de
   subir os serviços — é enquanto tudo está parado que dá para consertar sem
   disputa. Faltando alguma, **recriar exatamente as que faltam** (A.5), e
   conferir de novo. Só então subir.
5. **Se ainda faltar depois disso, parar e gritar em vermelho** — dizendo o
   efeito em português ("as telas aparecem vazias"), listando o que falta e
   apontando o log e o `restore.sh`. O sistema **não** volta ao ar dizendo
   "concluída": um CRM sem regra de isolamento é pior que um CRM fora do ar.

⚠️ O passo 4 acontece **com os serviços ainda parados**, e isso é deliberado. A
versão anterior desta spec conferia depois de subir — o que recria exatamente a
disputa que causou o problema, no pior momento possível.

**A régua da conferência vale a ÚLTIMA operação de cada regra no arquivo.** O
baseline cria e depois apaga a mesma regra de propósito (uma regra antiga vira
três novas). Contar toda criação daria falso positivo em cima de decisão
deliberada — e alarme que toca sem motivo é pior que alarme nenhum: quem o vê
tocar à toa aprende a ignorá-lo. Medido contra a instalação real: **92 regras
esperadas, zero falso positivo.**

### A.7 Critérios de aceite

- [ ] Uma atualização numa instalação **em uso** termina com **zero** travamentos
- [ ] As 92 regras estão presentes ao fim, conferidas pela própria atualização
- [ ] Com uma regra removida de propósito antes do fim, a atualização **reprova**
      e diz qual falta (sabotagem obrigatória)
- [ ] Quem está com o CRM aberto vê o aviso de manutenção, não um erro
- [ ] O sistema volta sozinho — nenhum passo manual
- [ ] O tempo total não piora: o que se perde parando, ganha-se sem disputa

---

## PARTE B — A agenda

Quatro pedidos. **Dois deles não precisam de banco nem de API** — a capacidade
já existe e só a tela não oferece. Isso foi medido, não presumido.

### B.1 Um campo só para escolher o cliente

**Hoje:** `components/agenda/VinculoDaMarcacao.tsx` tem **dois** campos em
sequência — "Buscar cliente" (texto) e "Quem será atendido" (lista). O segundo
dá a impressão de que vai abrir algo ao digitar, e o primeiro parece não fazer
nada até a lista mudar.

**Proposta:** um campo único com busca embutida — digita e a lista filtra ali
mesmo, com "Compromisso pessoal, sem cliente" como primeira opção e padrão.

**Cuidado medido:** o padrão **tem de continuar sendo o vazio**. Um seletor que
abre com o primeiro contato da lista marca compromisso no nome de outra pessoa —
defeito que já aconteceu nesta instalação e foi consertado em 2026-09-12 (o
cliente ficava herdado da abertura anterior).

### B.2 Campo de anotações

**Medido:** a coluna `calendar_appointments.notes` **já existe**, e a API já a
aceita — `app/api/v1/agenda/agendamentos/route.ts:84`, `z.string().max(2000)`,
no POST **e** no PATCH.

**Ou seja: não há migration, não há rota nova.** Falta apenas o campo na tela de
marcação e a exibição no detalhe do compromisso.

**Medido, e decide a escolha da coluna:** `lib/agenda/google/evento.ts:330` manda
para o Google **apenas `description`**. `notes` **não** viaja.

Isso vira uma pergunta de produto, não de código: a anotação é **interna da
equipe** (fica em `notes`, invisível no Google) ou **parte do compromisso** (vai
em `description`, e o cliente convidado a lê no convite)?

A spec propõe **`notes`, interna** — anotação de atendimento costuma conter o
que não se diz ao cliente ("desconfio que vai pedir desconto"). Mandar isso ao
Google, num evento que pode ter o cliente como convidado, é vazamento com cara
de recurso. Se a intenção for a outra, é decisão do dono do produto e muda a
coluna, não o desenho.

### B.3 O e-mail do convidado vem preenchido

**Medido:** `contacts.email` existe (`text`). Hoje o campo "E-mail do convidado"
nasce vazio, e quem marca digita à mão um endereço que o sistema já tem.

**Proposta:** ao escolher o cliente, o campo é preenchido com o e-mail dele —
**editável**, e apagável. Contato sem e-mail deixa o campo vazio, como hoje.

**Cuidado:** preencher **só** quando o campo estiver intocado. Sobrescrever o
que alguém digitou é o mesmo defeito do cliente herdado, pelo avesso.

### B.4 Mandar o compromisso ao cliente pelo WhatsApp

**Medido:** existe o mecanismo — `job_queue.kind = 'transactional_delivery'`, o
mesmo que entrega o link do Google Meet. Ele já resolve fila, canal, fronteira
de atendimento e autorização.

**Proposta:** reusar essa entrega para mandar os dados do compromisso (data,
hora, tipo, local e, quando houver, o link) na conversa do cliente.

**Restrição herdada, e ela não é negociável:** a entrega exige **atendimento
aberto** naquela conversa. Foi exatamente essa regra que recusou o envio do link
do Meet hoje (`meet_conversation_stale`). A tela precisa dizer isso **antes** do
clique, não depois — botão desabilitado com o motivo à vista.

**Opt-out:** contato com `is_blocked` não recebe. Marcar consulta não é
consentir em receber mensagem — a doutrina do produto já decide isso, e esta
funcionalidade não a contorna.

### B.5 Critérios de aceite (todos pela tela)

- [ ] Escolher cliente num campo só, com "Compromisso pessoal" como padrão
- [ ] Abrir o painel depois de fechar outro **não** herda cliente nenhum
- [ ] Anotação escrita aparece no detalhe do compromisso e sobrevive a remarcar
- [ ] E-mail do convidado chega preenchido e continua editável
- [ ] E-mail digitado à mão **não** é sobrescrito ao trocar de cliente
- [ ] Compartilhar por WhatsApp chega na conversa, com atendimento aberto
- [ ] Sem atendimento aberto, o botão está **desabilitado e explicado**

---

## O que esta spec NÃO mediu

- **Se o modo manutenção cabe no desenho atual do app.** A Parte A assume que dá
  para congelar as telas com um aviso; não medi onde isso mora nem se há
  mecanismo pronto. Pode exigir uma rota e um estado novos.
- **Quanto tempo a atualização passa a levar.** Parar tudo remove a disputa, mas
  acrescenta o tempo de parar e subir. A hipótese é que compense; **não está
  medido**.
- **O impacto de parar `supabase-rest` numa instalação que usa o Supabase
  hospedado.** Esta instalação roda Supabase local em Docker. Quem usa o serviço
  na nuvem não tem esses contêineres, e a Parte A precisa de um caminho
  alternativo — provavelmente pausar só os nossos e aceitar a disputa residual.
- **Se `notes` aparece no evento do Google.** A coluna existe e a API aceita;
  não medi se a sincronização a leva.
- **Como o texto do compromisso fica no WhatsApp.** Formato, fuso e o que
  acontece quando o compromisso é remarcado depois de enviado.
- **O `crm_lead_risk_states_since_no_passado`** — apareceu no log de produção
  como violação de constraint (`[risk-watcher] org falhou`) e não foi
  investigado. Não é desta spec, mas está aqui para não se perder.
