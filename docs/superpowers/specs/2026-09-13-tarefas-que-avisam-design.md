# A tarefa vencida deixa de passar despercebida — design

> **Estado:** spec. Não há código escrito.
> **Medido em:** 2026-09-13, contra `origin/main` e contra a árvore de
> `vps/pljr-combinada` (as duas dizem a mesma coisa neste assunto).
> **Destino pretendido:** jeito 1 — PR para o Rafael. É buraco do produto, não
> personalização desta instalação.
>
> **⚠️ Esta spec tem DUAS naturezas, e o PR precisa separá-las.** O aviso de
> tarefa vencida é **conserto** de um buraco (coluna sem consumidor, invariante
> 4 violado). A visibilidade individual da tarefa é **mudança de desenho**
> pedida pelo dono do produto — nenhuma outra tela do produto se comporta assim
> (§ 3.4, metade B). Apresentar a segunda como se fosse conserto seria afirmação
> falsa ao mantenedor. **Se ele recusar a metade B, a metade A continua de pé
> sozinha** — com o aviso caindo para a organização, como a versão anterior
> desta spec propunha.

---

## 1. O problema, medido

O módulo de Tarefas (migration 0210, extraída do PR #418) entregou a **lista**.
Não entregou o **aviso**. A tela pinta "ATRASADAS" em vermelho, e quem tem de
descobrir isso é a pessoa, abrindo a tela por conta própria.

Sete medições, todas reproduzíveis:

| # | O que foi medido | Onde | Resultado |
|---|---|---|---|
| 1 | Nenhuma rotina olha prazo de tarefa | `ls app/api/v1/cron/` | 21 rotinas nesta branch (22 na `main`), nenhuma de tarefa |
| 2 | Quem consome `crm_tasks` | `git grep -n crm_tasks origin/main -- 'app/**' 'lib/**' 'hooks/**' 'workers/**'` | 5 arquivos: as 2 rotas, o hook da tela, o coletor de LGPD, os tipos |
| 3 | Não há tipo de aviso de tarefa | `lib/notifications/kinds.ts` | 6 tipos; nenhum de tarefa |
| 4 | Não há categoria na tela de Notificações | `lib/notifications/prefs.ts` | 5 categorias; nenhuma de tarefa |
| 5 | `crm_tasks` não está no tempo real | bloco da tabela em `supabase/baseline.sql` | sem `alter publication supabase_realtime` |
| 6 | Sem gatilho de aviso no banco | mesmo bloco | só `trg_crm_tasks_updated_at` |
| 7 | A tela não se atualiza sozinha | `hooks/tasks/useTasks.ts` | `refetchInterval` removido de propósito; só `refetchOnWindowFocus` |

**E há um oitavo achado, que muda o desenho inteiro:**

| # | O que foi medido | Onde | Resultado |
|---|---|---|---|
| 8 | **Nenhuma tarefa pode ter RESPONSÁVEL hoje** | `grep -n "assigned_to" app/app/tasks/_components/FormularioDeTarefa.tsx` | **vazio** |

⚠️ **A tarefa NÃO está solta — os vínculos que importam existem.** Esta linha
já esteve errada nesta spec ("toda tarefa é órfã") e foi corrigida no mesmo dia,
depois de o dono do produto perguntar. O que é verdade, medido:

| Vínculo | Coluna | Estado |
|---|---|---|
| Organização | `organization_id uuid **not null**` | sempre preenchido, com RLS |
| Quem criou | `created_by` | o `POST` **sempre** grava `created_by: authz.user.id` |
| Responsável | `assigned_to` | coluna existe, FK real para `auth.users` — **nada preenche** |

`assigned_to` é projetado pelo `select` da rota e aceito no `POST`, mas **o
formulário não tem campo de responsável, a lista nunca mostra o dono, e o `GET`
não aceita filtrar por ele** (`listaSchema` tem `status`, `priority`, `lead_id`,
`contact_id`, `due_from`, `due_to`, `aberto` — e só).

`created_by` tem o defeito irmão, mais barato: **o dado chega na tela e não é
exibido.** Está em `lib/tarefas/tipos.ts:43` e nenhum componente de
`app/app/tasks/_components/` o lê.

Os dois são a mesma classe — coluna sem superfície, anti-pattern nº 3 do
`CLAUDE.md` — mas com consequências diferentes para esta spec: sem
`assigned_to` não há a quem *atribuir*; **com `created_by` já há a quem
avisar.**

---

## 2. Causa raiz

**Todo aviso do produto nasce de alguém fazendo algo. Tarefa vencendo não é
alguém fazendo algo — é o tempo passando.**

Os cinco avisos existentes (mensagem nova, lead atribuído, ganho, perdido,
menção) são disparados por `useCrmAlerts` e `useInboundMessageAlerts`, montados
no `AppShell`, ouvindo o Realtime do Postgres. Às 13:45 do dia em que a tarefa
vence, **nada acontece no banco**: a linha continua parada, idêntica. Não existe
evento para o produto reagir.

Some-se a isso que **não existe tabela de notificações** — o aviso é efêmero (um
`toast` mais uma notificação do sistema operacional). Quem não estava com a aba
aberta no instante do evento nunca soube que ele existiu.

---

## 3. Onde o aviso mora — e por que não é o Radar

### 3.1 O Radar responde outra pergunta

`app/app/radar/` lista **negócios esfriando** (`useAtRiskLeads`, baldes
`critico` / `em_risco` / `em_voo`, recarga a cada 60 s). Uma tarefa é lembrete
de trabalho interno, **pode não ter negócio nenhum** (`crm_tasks.lead_id` é
nullable) e não tem temperatura. Pôr tarefa ali mistura duas perguntas e a tela
para de responder bem qualquer uma das duas.

### 3.2 A Central de avisos já é a casa deste tipo de aviso

`components/shell/AlertsBell.tsx` — o sino do topo — já existe, já conta em
vermelho, e leva para `/app/ai/inbox`. Ele lê `agent_inbox_items`.

**E a Central já tem três avisos que nascem exatamente do tempo passando**, com
a mesma forma que esta spec precisa:

| Aviso | Quem produz | O que é |
|---|---|---|
| `snooze_expired` | `cron/snooze-watcher` | a espera combinada venceu |
| `contact_proposal_expired` | `cron/contact-proposals-watcher` | a sugestão venceu |
| `message_send_stuck` | `cron/recover-stuck-messages` | o envio travou há mais de 5 min |

Esta spec **não inventa padrão nenhum**: copia um que o repositório já executa
três vezes.

### 3.3 E funciona numa VPS recém-instalada

É o critério P0 da doutrina de QA Visual: instalação fresca não tem
`VAPID_PUBLIC_KEY`, não tem `RESEND_API_KEY`, não tem e-mail. O sino e a Central
são **banco e tela** — funcionam com zero variável opcional configurada. E-mail
e push ficam de fora por isso, não por esquecimento.

### 3.4 Tarefa é individual — decisão do dono do produto, 2026-09-13

> *"assim como agenda e notificações de transferências ou chamados para o
> usuário são individuais, a tarefa também. Só aparece para o usuário que a
> criou ou adm da org."*

A decisão tem duas metades, e a medição as separa — porque elas custam coisas
diferentes e uma delas muda comportamento existente.

#### Metade A — o AVISO é individual. Isto é o padrão da casa, medido.

Os cinco avisos do produto **já são por pessoa**, e nunca foram da organização:

| Aviso | A guarda que o torna individual |
|---|---|
| Lead atribuído / ganho / perdido | `useCrmAlerts.ts:47,57,67` — `owner === user.id` |
| Menção | `useCrmAlerts.ts:86-90` — `mencaoAtingeUsuario(...)` |

Um aviso de tarefa que chegue a todos seria o **desvio**, não a regra. A versão
anterior desta spec propunha exatamente isso, e estava errada.

#### Metade B — a LISTA é individual. Isto é novo no produto.

Medido: nenhuma tela do produto tem visibilidade por pessoa hoje.

| Tela | Como abre | RLS |
|---|---|---|
| Agenda (`app/app/agenda/page.tsx:101`) | tudo da organização, exibindo `owner_user_id` — **sem filtrar** | org |
| Inbox (`useConversationsRealtime.ts:81`) | tudo da organização; `assigned_to: "me"` existe e é **opcional** | org |
| Tarefas | tudo da organização | org |

`calendar_appointments` e `crm_tasks` têm RLS **idêntica**, palavra por palavra:
`organization_id in (select fn_user_org_ids()) or fn_is_platform_admin()`.

Então esta metade **não** é "alinhar tarefa com a agenda" — é dar a Tarefas um
comportamento que a agenda não tem. É decisão legítima do dono do produto e está
escrita como tal, mas não deve ser apresentada ao mantenedor como correção de
inconsistência: é mudança de desenho, e o PR precisa defendê-la.

⚠️ **É mudança que ESCONDE, e isso tem classe própria de risco.** Ver § 10.

---

## 4. Quando o sistema avisa

Dois momentos, e só dois. Mais que isso vira ruído, e ruído treina a pessoa a
ignorar o sino — que é pior que não avisar.

| Momento | Quando dispara | Gravidade |
|---|---|---|
| **Vence hoje** | na primeira passagem do dia em que a tarefa vence | `info` |
| **Venceu** | na primeira passagem depois de `due_date` | `warn` — ou `critical` se `priority = 'urgent'` |

**Tarefa sem prazo nunca avisa.** É decisão da própria migration 0210, escrita
no cabeçalho dela: *"algum dia eu preciso"* é tarefa legítima, e forçar data
faria o operador inventar uma — *"o que envenena a lista de atrasadas, que é a
única razão de a coluna existir"*.

**Cada momento avisa uma vez só.** Não há repetição, não há lembrete do
lembrete. A tarefa atrasada continua vermelha na tela e o aviso continua aberto
na Central até alguém resolver.

**O que é "hoje"** sai de `organizations.timezone` (`text not null default
'America/Sao_Paulo'`, medido no baseline linha 1732) — nunca do relógio do
servidor, que numa VPS é UTC.

---

## 5. Arquitetura — cinco peças, e as cinco têm dono

```
  crm_tasks (due_date)
        |
        | 1. varredura de 5 em 5 min
        v
  cron/tarefas-watcher ---- 2. abre ----> agent_inbox_items
        |                                  (kind: tarefa_vence_hoje
        | marca que ja avisou                    / tarefa_atrasada)
        v                                        |
  crm_tasks.avisado_*_em                         | 3. conta
                                                 v
                                          AlertsBell (sino, ja existe)
                                                 | 4. clique
                                                 v
                                          /app/ai/inbox --5.--> /app/tasks?tarefa=<id>
```

| # | Peça | Estado hoje |
|---|---|---|
| 1 | `app/api/v1/cron/tarefas-watcher/route.ts` | **nova** — copia a forma do `snooze-watcher` |
| 2 | dois `kind` novos em `agent_inbox_items` | **novo** — CHECK do banco + tipo TS |
| 3 | `agent_inbox_items.user_id` | **coluna nova** — nula = da organização (semântica de hoje) |
| 4 | `GET /api/v1/ai/inbox` + contagem do sino | **filtro novo** — `user_id is null or user_id = <quem lê>` |
| 5 | `AlertsBell` | **existe, zero mudança no componente** — só passa a contar menos |
| 6 | `POLITICAS_DE_AVISO` + `REFERENCIAS_DE_AVISO` | **precisa de entrada nova** para o aviso ter destino |
| 7 | `/app/tasks?tarefa=<id>` | **não existe** — medido: a tela não lê `searchParams` |
| 8 | RLS de `crm_tasks` | **estreita** — criador, atribuído ou `admin` (§ 6.5) |

O item 5 não é enfeite: sem ele o aviso não leva a lugar nenhum, e um aviso que
não leva a lugar nenhum viola o invariante 5 do Sistema Vivo (*informação com
propósito*).

**Agendamento:** o `scheduler` do `docker-compose.prod.yml` precisa conhecer a
rota nova. É a mesma nota de deploy que o `snooze-watcher` carrega no cabeçalho:
*"sem isso o snooze nunca expira sozinho"*.

---

## 6. Schema — a tripla

Três artefatos, sempre juntos: arquivo em `supabase/migrations/`, apêndice
idempotente no `supabase/baseline.sql`, linha no `MANIFEST.md`.

**O número da migration sai medido, e contra a `origin/main`** — nunca contra
esta branch, que é a planta divergente:

```bash
git fetch origin
git ls-tree -r --name-only origin/main supabase/migrations/ \
  | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1
```

### 6.1 As duas marcas de "já avisei"

```sql
alter table public.crm_tasks
  add column if not exists avisado_prazo_em  timestamptz,
  add column if not exists avisado_atraso_em timestamptz;
```

**Por que coluna, e não dedução.** A regra mais cara desta instalação: *nunca
inventar um sinal que o banco não guarda*. A alternativa barata seria deduzir de
`updated_at` ou da existência de um aviso aberto — as duas mentem (`updated_at`
muda por qualquer edição; o aviso pode ter sido resolvido à mão). O dado existe
no instante da varredura; grava-se ali.

### 6.2 Prazo remarcado limpa as marcas

Gatilho `before update` em `crm_tasks`: se `due_date` mudou, zera as duas
marcas.

Sem isso, remarcar uma tarefa atrasada para semana que vem faria o novo prazo
vencer **em silêncio** — as marcas já estavam preenchidas.

### 6.3 Tarefa resolvida fecha o aviso

Gatilho `after update` em `crm_tasks`: `status` vira `done` ou `cancelled` →
`update agent_inbox_items set status='resolved', resolved_at=now() where
ref_kind='crm_task' and ref_id = new.id and status in ('open','ack')`.

É o padrão que o gatilho de roteamento já usa no baseline. Sem ele o sino conta
para sempre tarefa que já foi feita, e o contador deixa de significar alguma
coisa.

### 6.4 O aviso ganha dono — `agent_inbox_items.user_id`

```sql
alter table public.agent_inbox_items
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_agent_inbox_items_pessoa
  on public.agent_inbox_items (organization_id, user_id, created_at desc)
  where status = 'open';
```

**Nulo significa "da organização inteira" — que é a semântica de HOJE.** Toda
linha existente nasce nula e continua se comportando exatamente como antes: zero
migração de dados, zero mudança para os avisos do runtime do agente.

O `GET /api/v1/ai/inbox` e a contagem do sino passam a filtrar
`user_id is null or user_id = <quem lê>`. Um aviso de tarefa nasce com o
`user_id` de quem criou a tarefa; todo o resto nasce nulo.

⚠️ **Esta é a peça que o PR precisa defender melhor.** Ela muda o significado de
uma tabela que o runtime do agente usa inteira. O argumento é que a Central se
chama "Central de avisos", já recebe aviso que não é de IA (`message_send_stuck`
é falha de envio), e que um aviso sem destinatário é o que obriga toda pessoa a
ler o aviso de todas as outras.

### 6.5 Quem enxerga a tarefa — a RLS estreita

```sql
drop policy if exists crm_tasks_select on public.crm_tasks;
create policy crm_tasks_select on public.crm_tasks
  for select using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and (created_by = auth.uid()
             or assigned_to = auth.uid()
             or public.fn_role_at_least(organization_id, 'admin')))
  );
```

A política de escrita (`crm_tasks_write`) acompanha a mesma condição — hoje ela
libera qualquer `agent` da organização, e deixar escrita mais larga que leitura
permite editar o que não se vê.

**`assigned_to` entra desde já, mesmo sem nada preenchê-lo** (achado 8). Hoje
não tem efeito; no dia em que o campo de responsável nascer, a pessoa a quem a
tarefa foi atribuída já enxerga sem migração nova. Coluna que não custa nada
hoje e evita uma migration amanhã.

**A rota não muda.** `GET /api/v1/tasks` usa `createClient()` (cliente do
usuário, RLS aplicada), medido em `app/api/v1/tasks/route.ts` — então a lista
estreita sozinha. Quem precisa mudar é a **varredura**, que usa
`createAdminClient()` e enxerga tudo: ela resolve o destinatário a partir de
`created_by`, e é isso que a torna correta e não vazada.

### 6.6 Os dois `kind` novos

O CHECK de `agent_inbox_items.kind` é estendido por apêndice (é o que a linha
"`agent_inbox_items_kind_check` já foi estendida com `voice_call_missed`" do
baseline registra). Acrescentar `tarefa_vence_hoje` e `tarefa_atrasada`.

⚠️ **O tipo TypeScript anda junto, na mesma mudança.** `InboxKind` em
`lib/agent-engine/db/repository.ts` — e o cabeçalho dele avisa que essa lista já
ficou 3 valores atrás do banco sem nada falhar. Hoje quem vigia é
`tests/invariants/vocabulario-banco-x-typescript.test.ts`, que compara os dois
conjuntos contra Postgres real.

⚠️ **`POLITICAS_DE_AVISO` é `satisfies Record<InboxKind, Politica>`** — então
acrescentar o `kind` ao tipo **obriga** o compilador a cobrar a política. Isso é
uma rede, não um empecilho: clone com par desconhecido falha fechado.

**Nome em português** para casar com o módulo (`lib/tarefas/tipos.ts`,
`PRIORIDADES_DA_TAREFA`) e com os `kind` recentes (`midia_nao_lida`,
`conhecimento_nao_indexado`). O vocabulário da Central é misto; se o mantenedor
preferir inglês, é troca de uma linha em três lugares.

---

## 7. Os itens, um a um

### 7.1 A rotina que varre — `cron/tarefas-watcher`

Forma copiada do `snooze-watcher`: Bearer `INTERNAL_CRON_SECRET` |
`INTERNAL_SECRET`, **fail-closed**, teto de 200 linhas por passagem,
`createAdminClient` com `organization_id` vindo **da linha**, nunca de
parâmetro.

Duas consultas por passagem:

- **venceu**: `due_date < now()`, `status in ('pending','in_progress')`,
  `avisado_atraso_em is null`
- **vence hoje**: `due_date` entre agora e o fim do dia no fuso da organização,
  `status in ('pending','in_progress')`, `avisado_prazo_em is null`

⚠️ **Audita só quando houve efeito.**
`tests/unit/cron-audita-so-quando-ha-efeito.test.ts` varre o AST de **toda**
rota de `app/api/v1/cron/` — passagem que não abriu aviso nenhum não escreve em
`api_audit_log`. Numa VPS real isso já foi 95% do registro de auditoria.

### 7.2 O texto do aviso

O corpo diz **o que fazer**, não o que aconteceu. Orientação na
`POLITICAS_DE_AVISO`:

- `tarefa_vence_hoje` → *"Esta tarefa vence hoje. Conclua ou remarque o prazo."*
- `tarefa_atrasada` → *"O prazo desta tarefa passou. Conclua, remarque ou cancele."*

Botão: `rotulo: "Abrir tarefa"`. O título do aviso carrega o título da tarefa —
é o que permite reconhecer qual é sem abrir. **Não precisa nomear o autor:** o
aviso chega só para ele (§ 6.4).

### 7.2.1 Para quem o aviso vai

`agent_inbox_items.user_id = crm_tasks.created_by`.

**Se `created_by` for nulo, o aviso nasce nulo** — isto é, da organização
inteira, visível a todos. É o caso da pessoa removida do sistema
(`on delete set null`): a tarefa continua existindo e o prazo continua valendo,
então o aviso tem de chegar a **alguém**. Cair para a organização é a escolha
segura; sumir seria perder a demanda, que é exatamente o que o invariante 4
proíbe.

⚠️ **Isto é a contrapartida do § 6.5 e as duas têm de ser lidas juntas.** A RLS
esconde a tarefa órfã de todos menos do `admin`; o aviso dela vai para todos.
Não é contradição: a tarefa fica restrita, mas o fato de ela ter vencido não
pode ficar sem leitor. Quem receber o aviso e não puder abrir a tarefa vê o
estado `indisponivel` do resolvedor de destino, com a orientação — e um `admin`
resolve.

### 7.3 O destino — `REFERENCIAS_DE_AVISO.crm_task`

```ts
crm_task: {
  tabela: "crm_tasks",
  papel: "viewer",          // a tela de Tarefas não tem minRole; ver o catálogo
  rotulo: "Abrir tarefa",
  href: (id: string) => `/app/tasks?tarefa=${id}`,
}
```

`papel: "viewer"` porque `lib/navigation/catalogo.ts` declara Tarefas **sem**
`minRole`, com o motivo escrito ali: *"`viewer` VÊ o que o time combinou (é
informação de operação), e a criação é cobrada pela rota"*.

### 7.4 A tela aceita link direto

`/app/tasks?tarefa=<uuid>` abre a lista com aquela tarefa destacada e rolada
para a vista. Id que não existe (ou de outra organização) não quebra a tela:
abre a lista normal.

---

## 8. Living System Checklist

| # | Invariante | Resposta |
|---|---|---|
| **1** | Nada é ilha (≥2 arestas) | **Entrada:** `crm_tasks.due_date`. **Saída:** `agent_inbox_items` → sino → tela de Tarefas. Duas arestas reais |
| **2** | Continuidade IA↔humano | **Não se aplica, e está escrito.** Tarefa é trabalho humano; a IA não produz nem consome tarefa hoje |
| **3** | Log universal e visível | O aviso **é** o registro visível. A varredura que abriu aviso audita em `api_audit_log`; a vazia não |
| **4** | Nenhuma demanda sem próximo passo | **É o invariante que dá razão a esta spec.** Tarefa vencida sem ninguém avisado é demanda aberta sem próximo passo visível — vazamento pela definição da lei |
| **5** | Informação com propósito | O aviso leva à tarefa em um clique e a orientação diz a ação (concluir, remarcar, cancelar). Sem o item 7.4 este invariante falha |
| **6** | Toda configuração tem superfície | **Não há configuração nesta versão** — os dois momentos são fixos e o mecanismo não tem liga/desliga. Superfície é a própria Central, que já tem tela de leitura e ação (resolver). Antecipação declarada: se um dia a antecedência virar ajustável, ela nasce com tela |
| **7** | Todo laço se fecha | **Parcial, e declarado.** Fecha-se o laço curto: tarefa concluída resolve o aviso (§ 6.3), então o contador mede trabalho real pendente. **Não há** sinal de retorno medindo se o aviso mudou comportamento. Dívida declarada, não ausência de defeito |

---

## 9. Fora de escopo — YAGNI declarado

| O que fica de fora | Por quê |
|---|---|
| **Campo de responsável na tela** | É trabalho próprio: formulário, coluna na lista, filtro `assigned_to` no `GET`. **Não é pré-requisito** — `created_by` já diz a quem avisar, e a RLS do § 6.5 já aceita `assigned_to` para o dia em que nascer |
| **Alinhar Agenda e Inbox à mesma regra** | A decisão do § 3.4 vale para Tarefas. Estender a visibilidade por pessoa à Agenda e ao Inbox é mudança de produto muito maior, em telas de uso diário, e não foi pedida |
| **Exibir quem criou na lista de Tarefas** | Com a lista estreitada, toda tarefa visível é sua (ou você é `admin`). A coluna perde utilidade justamente onde ela ia aparecer |
| **E-mail e push** | Instalação fresca não tem `RESEND_API_KEY` nem VAPID. Um aviso que depende deles não chega em quem acabou de instalar |
| **Contador no menu lateral** | O sino já conta. `lib/navigation/catalogo.ts` não tem conceito de contador hoje, e criar um para um caso só é caro |
| **Antecedência configurável** | "Vence hoje" resolve o caso real. Knob sem pedido é superfície para manter |
| **Repetir o aviso** | Avisar de novo treina a pessoa a ignorar o sino |
| **Tempo real na tela de Tarefas** | O `refetchInterval` foi removido de propósito, com motivo escrito no hook. Reverter isso é decisão de outra pessoa |

---

## 10. Riscos

### ⛔ O risco de classe própria: esta mudança ESCONDE

A RLS do § 6.5 estreita o que já está na tela de todo mundo. Num clone onde
duas pessoas criaram tarefas e as duas as enxergam hoje, o `update.sh` faz
metade delas **sumir sem aviso** — e o produto não vai dizer que sumiu, vai só
mostrar menos.

É a mesma classe do critério que apaga: a diferença entre `delete` e `hide` é o
tempo que leva para alguém perceber. A regra desta instalação é rodar o critério
como **consulta**, contra dado real, e **ler linha por linha** antes de publicar:

```sql
-- quantas tarefas cada pessoa DEIXA de ver com a política nova
select t.organization_id,
       count(*) filter (where t.created_by is null)                as ficam_so_para_admin,
       count(*) filter (where t.created_by is not null)            as tem_dono,
       count(*)                                                    as total
  from public.crm_tasks t
 where t.status in ('pending','in_progress')
 group by 1;
```

Se numa instalação real a coluna `ficam_so_para_admin` não for zero, essa
instalação **tem tarefa que vai desaparecer da tela de todos menos do admin** —
e isso precisa estar no fragmento de `.changes/` como `exige_acao`, não como
`capacidade_nova`.

**Alternativa de menor dano, se a consulta acima assustar:** estrear a
visibilidade estreita apenas para tarefas criadas **depois** da migration
(comparando `created_at` com a data de aplicação). Fica mais feio e é mais
código; some com o susto. Decisão em § 13.

| Risco | Tamanho | Mitigação |
|---|---|---|
| **Tarefa com `created_by` nulo some para todos menos `admin`** | Médio | `on delete set null` é o gatilho. O aviso dela cai para a organização (§ 7.2.1), então o vencimento não fica sem leitor |
| **`user_id` muda o sentido da Central** | Médio | Nulo preserva o comportamento atual linha por linha; só aviso de tarefa nasce com dono |
| **Fuso errado faz "hoje" ser o dia errado** | Médio | `organizations.timezone` é a fonte, nunca o relógio do servidor. Testar com organização em fuso diferente de `America/Sao_Paulo` |
| **A rota nova não ser agendada no `scheduler`** | **Alto — é falha em silêncio** | É o modo de falha que o `agenda-reminder` documenta: *"ligar o lembrete não fazia nada, e não fazia nada EM SILÊNCIO"*. O compose entra na mesma mudança |
| **Número da migration colidir** | Médio | Medido contra `origin/main` na hora de escrever, nunca contra esta branch |
| **A marca não limpar ao remarcar** | Médio | § 6.2, com teste que remarca uma tarefa já avisada |
| **Enxurrada na primeira passagem** | Médio | Instalação com 200 tarefas vencidas há meses abre 200 avisos de uma vez. O teto de 200/passagem contém; considerar piso de recência — **decisão em aberto, § 13** |

---

## 11. Critérios de aceite

1. Tarefa com prazo para hoje, `pending` → uma passagem abre **um** aviso
   `tarefa_vence_hoje`; a passagem seguinte **não** abre outro.
2. Tarefa com prazo vencido → aviso `tarefa_atrasada`, `severity='warn'`; com
   `priority='urgent'`, `critical`.
3. Tarefa **sem** `due_date` → nenhuma passagem abre aviso.
4. Tarefa `done` ou `cancelled` → nenhum aviso novo, e o aviso aberto vira
   `resolved` com `resolved_at`.
5. Remarcar o prazo de uma tarefa já avisada → as duas marcas zeram, e o novo
   prazo volta a avisar.
6. O sino conta o aviso; clicar leva à Central; o botão leva a
   `/app/tasks?tarefa=<id>` com a tarefa destacada.
7. Organização A não vê aviso de tarefa da organização B (invariante de RLS,
   `pnpm test:db`).
8. **Pessoa A, papel `agent`, não vê a tarefa criada pela pessoa B da mesma
   organização** — nem na lista, nem no sino, nem pela URL direta do § 7.4.
9. **Pessoa `admin` da organização vê as duas**, e vê a tarefa com `created_by`
   nulo.
10. **O aviso de tarefa chega só a quem criou.** O contador do sino de B não
    muda quando a tarefa de A vence.
11. **Aviso do runtime do agente continua chegando a todos** — `user_id` nulo,
    comportamento idêntico ao de antes. É o controle que prova que a coluna nova
    não estreitou o que não devia.
12. Passagem que não abriu aviso nenhum **não** escreve em `api_audit_log`.
13. `pnpm test:db` verde, incluindo `vocabulario-banco-x-typescript`.
14. **Prova em tela**, num banco fresco do `baseline.sql`, sem envs opcionais:
    criar tarefa vencida → rodar a passagem → o sino acende → clicar → chegar na
    tarefa.

    **E o caminho do erro, que é o que paga:** com DUAS contas abertas em
    janelas separadas na mesma organização — a de B não vê a tarefa de A, o sino
    de B não conta, e a URL `/app/tasks?tarefa=<id de A>` colada na janela de B
    não revela a tarefa. Depois, entrar como `admin` e ver as duas.

---

## 12. O que esta spec NÃO mediu

- **O número da migration.** De propósito — número escrito envelhece; já
  envelheceu três vezes neste projeto. Sai medido na hora de escrever.
- **Se o `scheduler` do `docker-compose.prod.yml` tem teto de rotinas** ou algum
  custo por rotina nova. Não abri o arquivo.
- **Quantas tarefas vencidas existem numa instalação real.** O risco da
  enxurrada (§ 10) é raciocínio, não medição. A VPS do Paulo tem 1 tarefa; isso
  não representa uma clínica com seis meses de uso.
- **Se `/app/ai/inbox` tem filtro por `kind` na tela.** Li a rota, não o
  componente inteiro. Se não tiver, tarefa e aviso de IA se misturam na mesma
  lista — não quebra nada, mas muda a experiência.
- **O comportamento da Central quando a tarefa é apagada.** `crm_tasks` não tem
  cascata para `agent_inbox_items` (a referência é polimórfica, `ref_kind` +
  `ref_id`, sem FK). O aviso viraria órfão. O resolvedor de destino trata isso
  (`estado: "indisponivel"`), mas não confirmei em execução.
- **Quantas tarefas com `created_by` nulo existem em instalação real.** É a
  consulta do § 10 e ela **não foi rodada** — nem na VPS desta instalação. É o
  passo que decide a § 13.2 e ele está pendente.
- **Se `manager` deveria enxergar tudo.** A spec escreveu `admin` ao pé da letra
  da decisão; não medi se algum papel do produto depende de ver tarefa alheia.
- **Se algum outro lugar do produto lê `agent_inbox_items` sem passar pelo
  `GET`** — um painel, uma métrica, o `ai/evolution`. Se ler, o filtro de
  `user_id` precisa chegar lá também, e eu não varri.
- **Nada disto foi executado.** Não há código escrito, não há teste rodado, não
  há tela provada.

---

## 13. Decisões que são do dono do produto

### Já decididas

| # | Decisão | Quando |
|---|---|---|
| — | **Aviso individual, e lista individual.** Só quem criou, mais `admin` da organização | 2026-09-13, § 3.4 |

### Em aberto

1. **Piso de recência** (§ 10): avisar tarefa vencida há seis meses, ou só as
   dos últimos N dias? Recomendo N dias, com N fixo, para a primeira passagem
   numa instalação antiga não virar enxurrada.
2. **A visibilidade estreita vale para as tarefas que JÁ existem, ou só para as
   novas?** (§ 10). Valer para todas é mais simples e mais coerente; valer só
   para as novas evita que tarefa suma da tela de quem atualiza. **A consulta do
   § 10 responde isto com dado real** — rodá-la na VPS antes de escolher é o
   passo que a regra desta instalação exige.
3. **`manager` enxerga tudo, ou só `admin`?** A decisão diz "adm da org", e a
   spec escreveu `fn_role_at_least(organization_id, 'admin')` ao pé da letra.
   Num time com gerente que não é admin, ele deixa de ver as tarefas da equipe —
   o que pode ser exatamente o desejado, ou um efeito não previsto.
4. **O campo de responsável** (§ 9): fica para depois, como esta spec propõe.
   **Não** é pré-requisito — `created_by` já diz a quem avisar, e a RLS do § 6.5
   já aceita `assigned_to`.
5. **Vocabulário** (§ 6.6): `tarefa_vence_hoje` / `tarefa_atrasada` em
   português, ou inglês como `voice_call_missed`?
