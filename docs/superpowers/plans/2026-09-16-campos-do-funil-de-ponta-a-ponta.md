# O agente que pergunta, anota, marca e não promete no vazio — plano de execução

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA — use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para percorrer tarefa a tarefa. Os passos usam
> caixa (`- [ ]`) para marcação.

**Goal:** fazer o agente **gravar** o que o cliente responde, **marcar** o compromisso que ele pede
e **nunca prometer** ao cliente sem que uma pessoa fique com a tarefa — provado por três cercas que
percorrem a conversa inteira, em qualquer segmento de negócio.

**Architecture:** doze defeitos, onze consertos, uma direção só — **o sistema para de pedir ao
modelo o que o sistema já sabe, e passa a recusar na FRONTEIRA (schema/contrato) o que hoje recusa
no corpo do handler, em silêncio.** Nada aqui é regra de nicho: tudo vive no contrato das
ferramentas, no contexto do turno e nos gates de envio. Onze dos doze defeitos são da base do
Rafael, e sete viram PR para ele.

**Tech Stack:** TypeScript 6 estrito · Zod · Vercel AI SDK (`tool()`) · Next.js 16 Route Handlers ·
Supabase/Postgres com RLS · Vitest (unit + invariantes) · Playwright (e2e).

**Spec:** [`docs/superpowers/specs/2026-09-16-campos-do-funil-de-ponta-a-ponta-design.md`](../specs/2026-09-16-campos-do-funil-de-ponta-a-ponta-design.md)

---

## Global Constraints

Valem para **toda** tarefa. Cada uma foi medida em 2026-09-16, com o comando ao lado.

| # | Restrição | Onde se comprova |
|---|---|---|
| G1 | **Multi-tenant:** toda query que cruza tabela tenant-aware filtra `organization_id` explicitamente. Na VPS do Paulo **cada organização é um cliente pagante** — agregado sem filtro não é medição, é soma de mundos diferentes | `CLAUDE.md` › Multi-tenancy |
| G2 | **Migration sai como TRIPLA:** arquivo em `supabase/migrations/`, bloco idempotente no apêndice do `supabase/baseline.sql`, linha em `supabase/migrations/MANIFEST.md`. O hook do contribuidor reprova o commit sem as três | `bash .agents/skills/deskcomm-contribuir/scripts/armar-hooks.sh` |
| G3 | **`NNNN` é o maior número, não o último da listagem** — medido hoje: **0271** | `ls supabase/migrations/ \| grep -oE '_[0-9]{4}_' \| tr -d _ \| sort -n \| tail -1` |
| G4 | **`tests/invariants/**` é CONGELADO** pelo `loop/hooks/freeze-invariants.sh`. Consequência dura: **todo campo novo em `LeadContext` nasce OPCIONAL** — exigir quebra 8 arquivos que montam contexto à mão, um deles congelado | `lib/agent-engine/edge/crm/get-lead-context.ts:80-88` |
| G5 | **`kind` novo em `agent_inbox_items` mexe em DOIS lugares** (a lista do `add constraint` no baseline **e** a migration que a reconstrói) e **entra no FIM da lista** — `tests/unit/midia-nao-lida.test.ts` procura `'midia_nao_lida'` nos primeiros 2000 caracteres a partir do `add constraint`, e valor novo acima o empurra para fora da janela | `tests/unit/kind-check-migration-x-baseline.test.ts` |
| G6 | **Um bloco por constraint no baseline.** Reconstruir a mesma constraint em N blocos quebra o `update.sh` de todo clone (issue #159) | `tests/unit/baseline-constraint-reconstruida.test.ts` |
| G7 | **Tela nova tem porta** em `lib/navigation/catalogo.ts` (`NAV_CATALOG`) — ou na allowlist com justificativa escrita. Declarar é no **catálogo**, nunca no `registry.ts`, que só deriva | `tests/unit/navegacao-completude.test.ts` |
| G8 | **A suíte é `pnpm test:unit` SEM caminho** (alcança 566 arquivos, não só os 388 de `tests/unit/`). **O exit code é a autoridade**; o rodapé e o `grep FAIL` são explicação dele; a linha `Errors` reprova com `0 failed` | `pnpm test:unit > /tmp/vt.log 2>&1; echo exit=$?` |
| G9 | **`pnpm test:db` NÃO roda nesta máquina.** O veredito de banco é o CI do fork | memória `nada-de-docker-de-teste-nesta-maquina` |
| G10 | **Nenhuma escrita em produção pela VPS.** Diagnóstico é `select`; escrita é comando entregue ao Paulo | `NOSSA-REGRA.md` |
| G11 | **PR ao Rafael nasce de `origin/main`**, nunca do `main` do fork (que carrega a marca desta instalação) | skill `deskcomm-contribuir`, passo 1 |
| G12 | **Fragmento em `.changes/`** para toda mudança que quem opera uma VPS percebe — declara o **efeito no operador** (`nada_mudou`/`capacidade_nova`/`exige_acao`), nunca o número. **Nunca escrever `## [1.x.y]` no `CHANGELOG.md`** | `pnpm release:conferir` |
| G13 | **Living System Checklist respondido** com artefato concreto (consumidor real, tela real, log real). Resposta que não nomeia artefato não conta | `docs/doctrine/sistema-vivo.md` |
| G14 | **Sabotagem obrigatória** antes de dizer "testado": reverter **só a linha do conserto**, prever quantos casos caem e quais, rodar, conferir a contagem, restaurar. Previsto × observado vai no corpo do commit | skill `deskcomm-contribuir`, passo 5 |
| G15 | **`NOSSA-REGRA.md`, `NOSSA-INTEGRACAO.md`, `FILA.md` e `como-agir.md` NUNCA são commitados** — o fork é público | — |
| G16 | **DeepSeek em dois momentos** de cada tarefa: MEDIR antes da primeira linha, REVISAR o diff antes de empurrar. O que ele devolve é **dado, não veredito** | skill `deepseek-delegacao` |
| G17 | **Recusa de negócio volta como RESPOSTA, nunca exceção** — exceção mata o turno e o assistente emudece na frente do cliente | `docs/…/repo-mcp.md` §7.5, citado em `agendamento.ts:245` |
| G18 | **Nenhuma feature nomeia nicho.** Web design, clínica, imobiliária e infoproduto passam pelo mesmo contrato. Um teste que só passe com vocabulário de um segmento é teste errado | spec §Âmbito |
| G19 | **Antes de tocar código que um invariante CONGELADO exercita, leia o fixture dele e descubra o que ele realmente constrói.** Medido em 2026-09-16: `tests/invariants/case-guardrail.test.ts:32-49` monta o `GateContext` com **`semanticPromise: null`** — e `tests/invariants/case-promise-detector.test.ts` tem 12 casos sobre `detectHumanPromise`, três deles afirmando `false`. Consequências duras para a Tarefa 7: **(a)** `detectHumanPromise` **não pode mudar**; **(b)** o gate tem de ler `ctx.semanticPromise?.…` com o `?.`, porque `null` é o que o fixture passa; **(c)** `prometeuRetornoHumano` **pode e deve ser OBRIGATÓRIO** em `PromiseClassification` — medido: só `semantic.ts` constrói esse literal, e **nenhum arquivo congelado constrói um**. Obrigatório é melhor aqui: força cada `return` do parser a decidir o valor em vez de omitir em silêncio | `loop/hooks/freeze-invariants.sh`; `tests/invariants/case-guardrail.test.ts:32-49`; `tests/invariants/case-promise-detector.test.ts` |
| G20 | **Briefing diz COMO provar, não só O QUE provar.** Medido em 2026-09-16 com um A/B de três configurações (`flash`, `flash --think`, `pro`) no mesmo briefing: as três entregaram o **mesmo teste vacuoso**, e as duas mais fortes saíram com hash idêntico. A causa não era capacidade do modelo — era o briefing dizer *"o teste falha se alguém tirar o filtro"* (a intenção) em vez de *"afirme sobre o SQL e os parâmetros que o dublê já captura"* (a asserção). Reescrito assim, a configuração mais fraca acertou de primeira e ainda acrescentou um caso não pedido | a medição está na seção **Onde a validação custa**, abaixo |

**Gates ao fim de cada tarefa, nesta ordem:**

```bash
rm -f tsconfig*.tsbuildinfo; pnpm typecheck; echo exit=$?
pnpm lint; echo exit=$?
pnpm test:unit > /tmp/vt.log 2>&1; echo exit=$?
grep -aE "Test Files|Tests |Errors " /tmp/vt.log | tail -3
```

---

## Dois defeitos meus na spec, e o que é só detalhe de plano

**Não houve nada que "envelheceu".** A spec foi escrita ontem, revisada mais de uma vez, e **dois
itens dela estavam errados na hora em que foram escritos** — os dois pelo mesmo motivo: **eu medi
que o símbolo existe e afirmei o que ele faz.** É o mesmo erro dos 8 avisos que eram de outros
tenants.

Os dois estão corrigidos **na própria spec**, no lugar onde apareciam, com a correção visível. Aqui
ficam porque mudam o trabalho: são **D1** e **D2** abaixo.

O que vem depois deles (P1, P2, P3) **não é correção** — é detalhe que um plano acrescenta a uma
spec. A spec já dizia o essencial; o plano nomeia o mecanismo. **Está separado de propósito para
não inflar o que foi consertado.**

---

### D3 — Dois testes que já existem e que o plano não tinha visto *(medido na Tarefa 0)*

**`periodo_ambiguo` JÁ tem teste** — `tests/unit/mcp-agendamento-tools.test.ts:143-151`,
*"não aceita dia específico e período relativo juntos"*. Ele chama o **handler direto**, sem passar
pelo schema, e afirma `motivo` e `mensagem`. A Tarefa 4 **mantém** o ramo do handler (só acrescenta
`publicou_horarios`), então ele **continua verde** — e é a prova de que o caso 4 da Cerca B mede
algo genuinamente novo, não uma repetição.

**O gate de promessa é guardado por invariante CONGELADO** — `tests/invariants/case-guardrail.test.ts`
(6 casos sobre `casePromiseGate`) e `tests/invariants/case-promise-detector.test.ts` (12 casos sobre
`detectHumanPromise`). Os dois são **do diretório congelado**: se a Tarefa 7 os deixar vermelhos, o
`freeze-invariants.sh` **bloqueia o commit que os consertaria**. Daí a restrição **G19**.

Consequência concreta para a Tarefa 7, e ela não é opcional:

- `detectHumanPromise` **não muda** — o plano já a mantinha como primeiro filtro. Isso preserva os
  12 casos congelados, incluindo os três que afirmam `false` (*"vou confirmar o valor pra você"*,
  *"vou confirmar com o Fernando"* sem `handoff_keywords`, e a menção sem promessa).
- `semanticPromise.prometeuRetornoHumano` nasce **opcional**, e ausente = `false`. Os 6 casos
  congelados montam o contexto sem esse campo e seguem passando pelo ramo léxico.

### D1 — O detector semântico não serve à Peça 7 como está *(defeito meu)*

A spec afirmava: *"o veto passa a ser confirmado pelo detector semântico que **já existe e já
roda** (`purpose='promise_semantic'`, medido: 6 chamadas hoje)"*.

**Eu medi a contagem de chamadas e afirmei o que ele classifica.** Medido depois, na fonte
(`lib/agent-engine/guardrails/promise/semantic.ts:39-53`), a instrução dele é sobre promessa
**COMERCIAL** e lista, textualmente, *"próximos passos vagos SEM compromisso concreto"* como
**NÃO-promessa**.

"Vou encaminhar para análise e te retorno com a proposta" **é** um próximo passo — o classificador
foi **instruído a devolver `false`** para a frase que vazou. Reusar o veredito dele não pega
nenhuma das cinco frases de §6.3.

**Custo do erro se ele não tivesse sido pego:** a Peça 7 inteira — a que trata a falha mais grave
da spec — seria construída sobre uma capacidade que não existe, e passaria verde.

**O que o plano faz no lugar:** a Tarefa 7 acrescenta um **segundo campo** ao mesmo classificador
(`prometeuRetornoHumano`), no mesmo `purpose`, na mesma chamada — zero chamada nova, zero token no
prompt do agente.

### D2 — A Peça 9.3 é maior do que a spec supunha *(defeito meu)*

A spec afirmava, na tabela de §6.5: *"a Central manda e-mail? **não** — o canal está
`checked={false} disabled` no código"*.

**Eu medi a caixinha na tela e afirmei sobre o servidor.**
`app/actions/settings/updateNotificationPrefs.ts`, corpo inteiro:

```ts
/** STUB — `notification_prefs` table is not yet migrated. Wave 5 of EPIC-10 ships UI only. */
…
return { ok: false, error: "feature_not_yet_available" };
```

Não é o canal de e-mail que está desligado: **a tela inteira de preferências não persiste nada**, e
o próprio arquivo diz isso de si mesmo, em comentário. O que funciona é o outro caminho —
`lib/notifications/prefs.ts`, com `NOTIFY_UI_CATEGORIES` em `localStorage`.

**Escopo honesto da Tarefa 13:** acrescentar a categoria nos dois lugares e deixar funcionando o
caminho que funciona. **Não** construir a tabela de preferências — é dívida própria, fica declarada
e não entra aqui. A Peça 9 já manda: *"se for preciso cortar escopo, corte 2 e 3, nunca 1."*

---

### P1 — A Peça 2 encolheu *(a spec já dizia; aqui é o tamanho)*

A spec diz, na Peça 2: *"a trava resolve o negócio pela conversa — **o que a v1.27.5 já faz, e já
sobrescreve mesmo quando o modelo manda um valor**"*. Está certo, e é o commit `9510ceb3` —
`alvoDerivadoDaConversa` (`lib/ai/runtime/tools.ts:78`), disparada em `:189`:

```ts
if (input.contactId && def.category === "write" && "lead_id" in def.inputSchema) {
```

Consequência para o plano, e é só isso: a Tarefa 5 é de **duas linhas de produção**, não de uma
peça inteira.

### P2 — O mecanismo do "fora da conversa continua obrigatório" *(a spec pediu; o plano entrega)*

A spec já declara o comportamento, na Peça 2: *"**Fora da conversa** (chamada por integração, sem
contato do turno), continua **obrigatório**. A régua é a presença do contato do turno."* O que ela
não diz — e é trabalho de plano dizer — é **por onde** isso é garantido, e qual é a armadilha de
implementá-lo do jeito óbvio:

`lib/leads/escopo-de-funil.ts:279-288`, ramo `funil_vem_do_lead`:

```ts
const leadId = entrada.argumentos.lead_id;
if (typeof leadId !== "string") {
  return { permitido: true };   // ← sem lead, sem funil a checar: LIBERA
}
```

Hoje esse ramo é inalcançável por `crm_update_lead`, porque o schema **exige** o campo. Fora da
conversa (papel Operador, rota HTTP, automação) `input.contactId` é `undefined` e
`alvoDerivadoDaConversa` **não roda**. Tornar o campo opcional sem mais nada faria **toda escrita
de lead fora da conversa passar pelo gate de escopo sem checagem nenhuma**. A Tarefa 5 fecha as
duas pontas, e o caso 3 da cerca dela é o que guarda isso.

### P3 — Âncoras de linha *(número errado na spec; o trecho citado estava certo)*

| spec diz | medido hoje |
|---|---|
| `get-lead-context.ts:277` | **`:315-316`** — e `contact_id` **já existe** ao lado (issue #509) |
| `leads.ts:222-223` | ✅ confere |
| `agendamento.ts:207-213` | ✅ confere |
| `next-action/route.ts:120-145` | **`:119-145`** (o arquivo tem 148 linhas) |
| `inbound-turn.ts:2817` | ✅ confere |
| `human-promise.ts:135` | ✅ confere |

### P4 — Quatro peças custam menos do que parecem, porque a base já as espera

| peça | o que já existe |
|---|---|
| **10** — registro de execução | `ai_agent_runs` já tem `steps_count`, `abort_reason`, `tool_calls`, `status` (`baseline.sql:938-963`). **Zero migration** |
| **5** — a chave entrega a ferramenta | o padrão já está escrito em `pickToolsFromMcp` (`tools.ts:372`): *"Auto-inject handoff tool when enabled even if not in tool_ids"*. É copiar o padrão |
| **7.3** — aviso de promessa sem dono | `'promise_unfulfilled'` **já existe** na constraint (migration 0111). **Zero migration** |
| **9.1** — aprovar cria o compromisso | ~~`agendaRetornoNoCrm`~~ — **errado, ver P5 abaixo.** O destino é `public.crm_tasks` (migration 0210), que já tem rota, tipos, tela e porta na navegação. **Zero migration** |

**Confirmação independente:** 15 das 17 afirmações de contrato foram conferidas por leitor externo
(DeepSeek, sete arquivos anexados) e bateram; as duas restantes estavam fora do escopo dos arquivos
enviados e foram medidas direto no `supabase/baseline.sql`.

---

### P5 — O destino da Peça 9.1 estava errado no plano *(defeito meu, medido na Tarefa 11)*

O plano mandava aprovar chamando `agendaRetornoNoCrm`. Quatro medições dizem que não:

1. **É outra coisa.** `cron_jobs` com `job_kind='followup_turn'` é o RETORNO agendado, e o próprio
   `baseline.sql` o define: *"decisão interna do sistema, não ocupa agenda de ninguém e o cliente
   não sabe"*. Aprovar «Enviar orçamento personalizado» agendaria o **assistente** para falar de
   novo — não daria a ninguém o trabalho de enviar coisa alguma.
2. **A coluna que o teste do plano assertava não existe.** O Passo 1 pedia
   `cronJobsDeRetorno[0].owner_user_id`; `cron_jobs` (`baseline.sql:6778-6806`) não tem
   `owner_user_id`, e `criaRetornoDbSupabase.insere` não grava dono nenhum.
3. **O guard anti-empilhamento recusaria a aprovação.** `agendaRetorno` devolve
   `ja_existe_retorno` quando o contato já tem um retorno vivo. Com a ordem que o plano exige
   (destino antes da limpeza), aprovar responderia erro por um motivo que nada tem a ver com a
   decisão de quem clicou.
4. **"O prazo da organização" não existe.** `lib/followup/janela.ts` só conhece
   `FOLLOWUP_MIN_AHEAD_MS` (5 min) e `FOLLOWUP_MAX_AHEAD_MS` (180 dias) — janela de aceitação, não
   prazo padrão. Nenhum knob de organização guarda prazo.

**O destino certo, medido:** `public.crm_tasks` (migration 0210) — *"lembrete de trabalho interno
com prazo"*, com `title`, `due_date`, `assigned_to`, `created_by`, `lead_id` e `contact_id`. Tem
rota (`/api/v1/tasks`), tipos (`lib/tarefas/tipos.ts`), tela (`/app/tasks`) e porta em
`lib/navigation/catalogo.ts:190`. A policy `crm_tasks_write` exige papel `agent`, e a rota de
aprovação já exige `agent` — o client da sessão escreve. **Zero migration**, como o plano queria;
só a tabela é outra.

---

### P6 — A Tarefa 10 cobriu 1 de 7 escritores de `stage_id` *(defeito meu, medido ao checar conflitos com o upstream)*

Ao medir conflitos contra `origin/main` antes do PR, fui atrás do caminho que a spec da Tarefa 10
disse ter fechado — e não tinha. A trava de `afirma_fato` foi posta só no `moveLeadHandler`.
Medido: **SETE** caminhos escrevem `crm_leads.stage_id`, e o defeito de produção que motivou a
coluna inteira (2026-09-16, o card foi para «Proposta enviada» a partir de uma PROMESSA do agente)
passou por `lib/leads/agent-stage-sync.ts` — um dos seis que a trava não tocava.

**A decisão que resolveu, do dono do produto:** a máquina não afirma fato; a pessoa sim. `user`
passa sempre (a pessoa que arrasta o card É a confirmação); `ai_agent`, `api_token` e
`webhook_source` são recusados. Isto substituiu o critério de `evidencia` da Tarefa 10 — campo que,
medido, **não tinha um único emissor** (nem `moveLeadSchema` nem a rota o declaravam). O campo saiu.

A regra virou módulo puro (`lib/leads/etapa-que-afirma-fato.ts`, `podeEntrarNaEtapa`), e os sete
escritores passaram a consultá-la: `moveLeadHandler`, `createLeadHandler`, `encerraDemanda` (fecha
negócio — chamado pela tela E por `lib/mcp/tools/retencao.ts`, o agente), `agent-stage-sync`,
`appointment-stage-move`, `handoff-stage-move`. O sétimo (`encerraDemanda`) foi achado pela cerca de
AST na primeira execução dela, não por varredura manual — a sonda por proximidade textual (procurar
`.update(` e olhar os 400 caracteres seguintes) tinha 25% de erro medido (2 falsos positivos em 8
candidatos) e perdeu esse arquivo porque o objeto do patch é montado por identificador, nove linhas
antes do `.update()`.

Duas cercas, cada uma cobrindo o que a outra não alcança:
`tests/unit/quem-move-card-respeita-a-etapa-que-afirma-fato.test.ts` prova ALCANCE (todo escritor
importa a regra, ou está na allowlist com justificativa — allowlist que só encolhe);
`lib/leads/encerramento.test.ts` prova CORREÇÃO (a regra é de fato chamada e recusa) — sabotagem
confirmou que a cerca de AST fica verde com o `import` intacto e a chamada apagada, e só o teste
funcional pega isso.

---

## Estrutura de arquivos

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `tests/unit/cerca-anotar-de-ponta-a-ponta.test.ts` | Cerca A — da fala do cliente ao `custom_fields` do negócio certo |
| `tests/unit/cerca-marcar-de-ponta-a-ponta.test.ts` | Cerca B — do pedido do cliente ao compromisso criado |
| `tests/unit/cerca-prometer-de-ponta-a-ponta.test.ts` | Cerca C — nenhuma promessa sai sem destino |
| `lib/agent-engine/edge/crm/negocio-da-conversa.ts` | Resolve o NEGÓCIO do contato para o contexto do turno (Peça 3) |
| `lib/agent-engine/agent/registro-de-execucao.ts` | Escreve a linha de `ai_agent_runs` do turno real (Peça 10) |
| `lib/metricas/laco-de-retorno.ts` | As duas contagens por organização (Peça 11) |
| `app/api/v1/cron/laco-de-retorno/route.ts` | Cron das contagens; abre aviso na queda (Peça 11) |
| `supabase/migrations/…_0274_etapa_que_afirma_fato.sql` | `crm_stages.afirma_fato` (Peça 8) |
| `supabase/migrations/…_0275_a_central_sabe_o_que_e_novo.sql` | `agent_inbox_items.seen_at` (Peça 9.2) |
| `supabase/migrations/…_0276_avisos_de_teto_e_de_laco.sql` | dois `kind` novos (Peças 6 e 11) |

### Modificados

| Arquivo | O que muda | Peça |
|---|---|---|
| `lib/mcp/tools/agendamento.ts` | `.refine()`, dois `describe`, `publicou_horarios` na recusa | 4 |
| `lib/mcp/tools/leads.ts` | `lead_id` opcional em `updateInputShape`; evidência em `crm_move_lead_stage` | 2, 8 |
| `lib/leads/escopo-de-funil.ts` | `funil_vem_do_lead` sem lead deixa de liberar em ESCRITA | 2 |
| `lib/agent-engine/edge/crm/get-lead-context.ts` | soma `negocio_id` (opcional, G4) | 3 |
| `lib/agent-engine/guardrails/promise/semantic.ts` | segundo campo `prometeuRetornoHumano` | 7 |
| `lib/agent-engine/guardrails/before-send.ts` | `casePromiseGate` lê os dois detectores | 7 |
| `app/api/v1/leads/[id]/next-action/route.ts` | aprovar cria destino ANTES de limpar | 9 |
| `lib/ai/runtime/tools.ts` | chave entrega ferramenta; contador de passos | 5, 6 |
| `lib/agent-engine/agent/inbound-turn.ts` | grava execução; teto vira aviso; promessa exige destino | 6, 7, 10 |
| `components/shell/AlertsBell.tsx` | conta o não-visto | 9 |
| `lib/notifications/prefs.ts`, `lib/schemas/settings.ts`, `app/app/settings/notifications/_client.tsx` | categoria "o assistente precisa de você" | 9 |
| `docs/architecture/agent-turn.workflow.json` | nó da gravação e da marcação, 2 arestas cada | 3, 4 |

---

## Ordem das tarefas

```
T0  renumerar 0261/0262             ← passo 1 do envio (spec §16.1)
T1  Cerca A  (VERMELHA)   ┐
T2  Cerca B  (VERMELHA)   ├─ as três ANTES de qualquer conserto
T3  Cerca C  (VERMELHA)   ┘
T4  Peça 4 — agenda                    → Cerca B VERDE          [PR 1]
T5  Peça 2 — lead_id opcional + furo de escopo fechado          [PR 2]
T6  Peça 3 — negocio_id no contexto    → Cerca A VERDE          [PR 3]
T7  Peça 7.1 — detecção de promessa de retorno humano  ┐
T8  Peça 7.2 — promessa aceita exige destino           ├→ Cerca C VERDE  [PR 4]
T9  Peça 7.3 — next_action sem dono vira aviso         ┘
T10 Peça 8 — etapa só afirma fato com evidência                 [PR 5]
T11 Peça 9.1 — aprovar cria o compromisso                       [PR 6]
T12 Peça 9.2 — a Central sabe o que é novo                      [PR 6]
T13 Peça 9.3 — categoria de notificação (escopo do D2)          [PR 6]
T14 Peça 5 — a chave entrega a ferramenta                       (nosso)
T15 Peça 6 — instrumento de passos                              (nosso)
T16 Peça 10 — o turno deixa registro                            [PR 7]
T17 Peça 11 — o laço de retorno                                 [PR 8]
T18 max_steps: medir e só então decidir o valor
T19 Prova em prévia, por mim, antes de o Paulo tocar no telefone
T20 Abrir os 8 PRs
```

**Cada tarefa termina em commit próprio**, com a sabotagem relatada no corpo. Nenhuma tarefa fecha
com gate vermelho que ela mesma acendeu — as Cercas A/B/C são a exceção deliberada (T1–T3), e o
`describe` delas declara isso.

---

# Tarefa 0 — Renumerar as duas migrations que colidem  ✅ FEITA (commit `0e525e2d`)

**Por quê primeiro:** a spec põe isso no passo 14, e está errado. É o passo **1** do envio
(§16.1 dela mesma diz "não é item de fila"), e fazê-lo antes evita reservar números que as tarefas
seguintes vão querer.

**Files:**
- Renomear: `supabase/migrations/20260915170000_0261_o_dono_liga_os_campos_do_funil_no_agente.sql` → `…_0272_…`
- Renomear: `supabase/migrations/20260913000000_0262_meet_nao_espera_para_sempre.sql` → `…_0273_…`
- Modificar: `supabase/migrations/MANIFEST.md`
- Modificar: `supabase/baseline.sql` (os rótulos `-- ---- <coisa> (migration NNNN) ----`)

**Interfaces:**
- Consome: nada.
- Produz: **0274 é o próximo `NNNN` livre** para todas as tarefas seguintes.

- [x] **Passo 1: confirmar as colisões na fonte**

```bash
git fetch origin
ls supabase/migrations/*.sql | xargs -n1 basename | sort > /tmp/ours.txt
git ls-tree --name-only origin/main supabase/migrations/ | xargs -n1 basename | grep '\.sql$' | sort > /tmp/theirs.txt
for f in $(comm -23 /tmp/ours.txt /tmp/theirs.txt); do
  n=$(echo "$f" | grep -oE '_[0-9]{4}_' | tr -d _)
  echo "$n colide=$(grep -c "_${n}_" /tmp/theirs.txt) $f"
done
```

Esperado: exatamente **duas** linhas com `colide=1` — `0261` e `0262`. Se aparecerem outras, o
upstream avançou desde a medição: trate cada uma do mesmo jeito e siga.

- [x] **Passo 2: renomear os dois arquivos (o timestamp fica)**

```bash
cd supabase/migrations
git mv 20260915170000_0261_o_dono_liga_os_campos_do_funil_no_agente.sql \
       20260915170000_0272_o_dono_liga_os_campos_do_funil_no_agente.sql
git mv 20260913000000_0262_meet_nao_espera_para_sempre.sql \
       20260913000000_0273_meet_nao_espera_para_sempre.sql
```

- [x] **Passo 3: trocar o número dentro dos três lugares que o citam**

```bash
cd "D:/PROJETOS VIBE CODING/DeskcommCRM"
grep -rn "migration 0261\|migration 0262\|_0261_\|_0262_" \
  supabase/migrations/MANIFEST.md supabase/baseline.sql supabase/migrations/*.sql
```

Cada ocorrência que se refere a **estas duas** migrations vira `0272`/`0273`. Ocorrência que se
refere às migrations **do Rafael** de mesmo número **não muda** — é disso que o passo 1 trata.

- [x] **Passo 4: provar que não sobrou colisão nem número duplicado**

```bash
ls supabase/migrations/ | grep -oE '_[0-9]{4}_' | tr -d _ | sort | uniq -d   # vazio
ls supabase/migrations/ | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1  # 0273
```

- [x] **Passo 5: rodar os gates de manifesto e baseline**

```bash
pnpm test:unit > /tmp/vt.log 2>&1; echo exit=$?
grep -aE "manifest|baseline|migration" /tmp/vt.log | head -20
```

Esperado: `exit=0`.

- [x] **Passo 6: commit**

```bash
git add supabase/
git commit -m "chore(migrations): 0261 e 0262 saem da faixa do upstream

Medido: a main do Rafael ja usa 0261 e 0262 com OUTRO conteudo. Renumerar
antes de qualquer PR e o passo 1 do envio, nao o ultimo — e evita reservar
numero que as tarefas seguintes vao querer.

Proximo NNNN livre depois disto: 0274.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

> ⚠️ **Risco de frente, declarado agora para não surpreender depois.** Um PR nosso que nasça de
> `origin/main` vai numerar a partir de **0263** (o próximo livre lá). Quando ele for mesclado e
> a `main` dele voltar para cá, o nosso `0263` local (`remarcar_corrige_o_envio`) colide. É o
> custo estrutural de um fork com numeração sequencial, e o comando do Passo 1 o detecta. **Neste
> plano só a Tarefa 10 leva migration para o upstream**, então a colisão é de um arquivo, uma vez.

---

# Tarefa 1 — Cerca A: da fala do cliente ao campo gravado (VERMELHA)

**Files:**
- Criar: `tests/unit/cerca-anotar-de-ponta-a-ponta.test.ts`

**Interfaces:**
- Consome: `pickToolsFromMcp` (`lib/ai/runtime/tools.ts`), `podeChamarFerramenta`
  (`lib/leads/escopo-de-funil.ts`), o padrão de `supabaseFalso()` de
  `tests/unit/o-negocio-vem-da-conversa.test.ts`.
- Produz: nada para outras tarefas. É prova, não peça.

**Por que esta cerca e não as nove que já existem:** medido — há 9 arquivos de teste sobre campos
do funil, e **nenhum vai da conversa ao efeito**. Cada um prova um elo. A entrega teve 9 commits de
conserto em 31 exatamente porque o caminho inteiro nunca foi percorrido.

- [ ] **Passo 1: escrever a cerca**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CERCA A — DA FALA DO CLIENTE AO CAMPO GRAVADO NO NEGÓCIO CERTO.
 *
 * ⚠️ ESTE ARQUIVO NASCE VERMELHO, DE PROPÓSITO. Ele descreve o comportamento
 * que as Tarefas 5 e 6 entregam. Vermelho aqui, hoje, é o ponto: sem ele não
 * se sabe que consertou — só que a peça olhada no momento ficou verde.
 *
 * Medido em produção (2026-09-16): o agente perguntou os 6 campos, o cliente
 * respondeu 4, e `crm_update_lead` foi chamada ZERO vezes. As nove cercas que
 * já existem estavam todas verdes.
 *
 * NADA aqui é de web design. Os dois campos declarados abaixo são genéricos de
 * propósito (G18): a cerca tem de passar igual para clínica e imobiliária.
 */

const ORG = "11111111-1111-1111-1111-111111111111";
const CONTATO = "22222222-2222-2222-2222-222222222222";
const NEGOCIO_DA_CONVERSA = "33333333-3333-3333-3333-333333333333";
const OUTRO_NEGOCIO = "44444444-4444-4444-4444-444444444444";
const FUNIL = "55555555-5555-5555-5555-555555555555";

describe("cerca A — o agente anota o que ouviu, no negócio da conversa", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("o modelo chama crm_update_lead SEM lead_id e o campo chega ao negócio da conversa", async () => {
    const mundo = montarMundo();
    const ferramentas = montarFerramentasDoTurno(mundo, { contactId: CONTATO });

    const r = await ferramentas.crm_update_lead.execute({
      custom_fields: { prazo: "30 dias", origem: "indicação" },
    });

    expect(r.error).toBeUndefined();
    expect(mundo.leads[NEGOCIO_DA_CONVERSA].custom_fields).toEqual({
      prazo: "30 dias",
      origem: "indicação",
    });
  });

  it("a atividade nomeia os CAMPOS, nunca os valores", async () => {
    const mundo = montarMundo();
    const ferramentas = montarFerramentasDoTurno(mundo, { contactId: CONTATO });

    await ferramentas.crm_update_lead.execute({ custom_fields: { prazo: "30 dias" } });

    const linha = mundo.atividades.at(-1);
    expect(linha).toBeDefined();
    expect(JSON.stringify(linha)).toContain("prazo");
    expect(JSON.stringify(linha)).not.toContain("30 dias");
  });

  it("CONTROLE — nenhum outro negócio da organização foi tocado", async () => {
    const mundo = montarMundo();
    const antes = structuredClone(mundo.leads[OUTRO_NEGOCIO]);
    const ferramentas = montarFerramentasDoTurno(mundo, { contactId: CONTATO });

    await ferramentas.crm_update_lead.execute({ custom_fields: { prazo: "30 dias" } });

    expect(mundo.leads[OUTRO_NEGOCIO]).toEqual(antes);
  });

  it("o bloco de campos do funil está no prompt quando a chave está ligada e há funil marcado", async () => {
    const bloco = await montarBlocoDeCamposDoFunil({
      leadFieldsEnabled: true,
      pipelineIds: [FUNIL],
      toolIds: ["crm_update_lead"],
      campos: [
        { key: "prazo", label: "Prazo desejado", type: "texto", pergunta: "Qual prazo?" },
        { key: "origem", label: "Como nos conheceu", type: "texto", pergunta: "Como nos achou?" },
      ],
    });

    expect(bloco).toContain("crm_update_lead");
    expect(bloco).toContain("prazo");
    expect(bloco).toContain("origem");
  });
});
```

> **Nota para quem executa:** `montarMundo`, `montarFerramentasDoTurno` e
> `montarBlocoDeCamposDoFunil` são helpers deste arquivo. Copie o formato de `supabaseFalso()` de
> `tests/unit/o-negocio-vem-da-conversa.test.ts:21` — ele já monta um `from().select().eq()`
> encadeável e é o padrão do repositório. `montarBlocoDeCamposDoFunil` chama
> `camposDoFunil()` de `lib/agent-engine/agent/campos-do-funil-do-agente.ts`.

- [ ] **Passo 2: rodar e conferir que falha pelo motivo CERTO**

```bash
npx vitest run tests/unit/cerca-anotar-de-ponta-a-ponta.test.ts > /tmp/cercaA.log 2>&1; echo exit=$?
grep -aE "Tests |Errors " /tmp/cercaA.log | tail -2
```

Esperado: **3 de 4 falham**. Os três primeiros por erro de validação do Zod
(`lead_id` obrigatório, `Required`); o quarto (o bloco no prompt) **passa** — ele já funciona hoje,
e é o controle que prova que a cerca não está vermelha por estar mal montada.

Se os quatro falharem, a cerca está errada, não o produto: conserte a cerca antes de seguir.

- [ ] **Passo 3: commit da cerca vermelha**

```bash
git add tests/unit/cerca-anotar-de-ponta-a-ponta.test.ts
git commit -m "test(funil): a cerca que vai da fala do cliente ao campo gravado

VERMELHA de proposito. 3 de 4 casos falham hoje; o quarto passa e e o
controle que prova que a cerca esta bem montada.

Existem 9 arquivos de teste sobre campos do funil e nenhum vai da conversa
ao efeito — e e por isso que a entrega teve 9 commits de conserto em 31,
com todas as cercas verdes e o recurso sem fazer nada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

> **Aviso ao executor:** enquanto T1–T3 estiverem no ar e T4–T6 não, a suíte fica VERMELHA. Isso é
> deliberado e dura no máximo três tarefas. **Não abra PR nesse intervalo** e não "conserte" a
> cerca para o verde voltar.

---

# Tarefa 2 — Cerca B: do pedido do cliente ao compromisso marcado (VERMELHA)

**Files:**
- Criar: `tests/unit/cerca-marcar-de-ponta-a-ponta.test.ts`

**Interfaces:**
- Consome: `crmFindFreeSlots`, `crmBookAppointment` (`lib/mcp/tools/agendamento.ts`).
- Produz: nada.

- [ ] **Passo 1: escrever a cerca**

```ts
import { describe, expect, it } from "vitest";
import { crmFindFreeSlots } from "@/lib/mcp/tools/agendamento";

/**
 * CERCA B — DO "PODE AGENDAR" AO COMPROMISSO QUE EXISTE.
 *
 * ⚠️ NASCE VERMELHA. Descreve o que a Tarefa 4 entrega.
 *
 * Medido em produção (2026-09-16): nove chamadas de `crm_find_free_slots`,
 * nove listas vazias, `crm_book_appointment` NUNCA chamada, e `success: true`
 * nas nove no audit. O cliente viu o assistente mudar de assunto.
 *
 * A causa não é o modelo: `dia` e `dias_a_frente` são os dois `.optional()`,
 * nenhum `describe` diz que são excludentes, e a regra vive só no corpo do
 * handler. O modelo não tem como saber antes de chamar.
 */

describe("cerca B — o pedido do cliente vira compromisso", () => {
  it("dia + dias_a_frente juntos são REJEITADOS PELO SCHEMA, antes de rodar", () => {
    const shape = montarObjetoZod(crmFindFreeSlots.inputSchema);
    const r = shape.safeParse({
      event_type_slug: "call",
      dia: "2026-09-17",
      dias_a_frente: 14,
    });

    expect(r.success).toBe(false);
    // A mensagem é o que o modelo lê para se corrigir: tem de NOMEAR os dois campos.
    const msg = JSON.stringify(r.error?.issues ?? []);
    expect(msg).toContain("dia");
    expect(msg).toContain("dias_a_frente");
  });

  it("com só UM dos dois, o schema aceita", () => {
    const shape = montarObjetoZod(crmFindFreeSlots.inputSchema);
    expect(shape.safeParse({ event_type_slug: "call", dia: "2026-09-17" }).success).toBe(true);
    expect(shape.safeParse({ event_type_slug: "call", dias_a_frente: 14 }).success).toBe(true);
  });

  it("os describe dizem que são excludentes — é o que o modelo lê antes de escolher", () => {
    const campos = crmFindFreeSlots.inputSchema as Record<string, { description?: string }>;
    expect(campos.dia.description ?? "").toMatch(/não use junto|nunca junto|um OU o outro/i);
    expect(campos.dias_a_frente.description ?? "").toMatch(/não use junto|nunca junto|um OU o outro/i);
  });

  it("TODA lista vazia carrega publicou_horarios — inclusive as de recusa", async () => {
    const mundo = mundoDeAgendaSemJornada();
    const r = await crmFindFreeSlots.handler({ event_type_slug: "call", dias_a_frente: 7 }, mundo.ctx);

    expect(r.horarios).toEqual([]);
    expect(r).toHaveProperty("publicou_horarios");
  });

  it("com jornada publicada, devolve horários e o inicio serve de starts_at", async () => {
    const mundo = mundoDeAgendaComJornada();
    const r = await crmFindFreeSlots.handler({ event_type_slug: "call", dias_a_frente: 7 }, mundo.ctx);

    expect(r.horarios.length).toBeGreaterThan(0);
    expect(r.horarios[0]).toHaveProperty("inicio");
    expect(r.publicou_horarios).toBe(true);
  });

  it("marcar com o inicio devolvido cria compromisso para o contato DA CONVERSA", async () => {
    const mundo = mundoDeAgendaComJornada();
    const livres = await crmFindFreeSlots.handler({ event_type_slug: "call", dias_a_frente: 7 }, mundo.ctx);

    await mundo.marcar({ event_type_slug: "call", contact_id: mundo.contato, starts_at: livres.horarios[0].inicio });

    const criados = mundo.compromissos.filter((c) => c.contact_id === mundo.contato);
    expect(criados).toHaveLength(1);
    expect(criados[0].status).toBe("scheduled");
  });
});
```

> `montarObjetoZod` é `z.object(shape)` quando o shape é um `Record`, e o próprio schema quando a
> Tarefa 4 o converter em `ZodObject` com `.refine()`. Escreva-o como um helper de uma linha que
> aceita os dois — é o que permite este arquivo sobreviver à mudança de forma.

- [ ] **Passo 2: rodar e conferir o motivo da falha**

```bash
npx vitest run tests/unit/cerca-marcar-de-ponta-a-ponta.test.ts > /tmp/cercaB.log 2>&1; echo exit=$?
grep -aE "Tests |Errors " /tmp/cercaB.log | tail -2
```

Esperado: **3 de 6 falham** — o caso 1 (o schema aceita hoje), o caso 3 (os `describe` não dizem) e
o caso 4 (a recusa não devolve `publicou_horarios`). Os casos 2, 5 e 6 passam: são o controle.

- [ ] **Passo 3: commit**

```bash
git add tests/unit/cerca-marcar-de-ponta-a-ponta.test.ts
git commit -m "test(agenda): a cerca que vai do pedido ao compromisso

VERMELHA de proposito: 3 de 6. Os outros 3 passam e sao o controle.

Medido: nove chamadas, nove listas vazias, book_appointment nunca chamada,
success:true nas nove. A skill de agendamento ja mandava ler o motivo, e a
descricao da ferramenta tambem — o modelo recebeu a instrucao certa de duas
fontes e repetiu a chamada invalida nove vezes. Prosa no prompt nao
substitui schema que recusa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Tarefa 3 — Cerca C: nenhuma promessa sai sem destino (VERMELHA)

**Files:**
- Criar: `tests/unit/cerca-prometer-de-ponta-a-ponta.test.ts`

**Interfaces:**
- Consome: `detectHumanPromise` (`lib/agent-engine/guardrails/human-promise.ts:135`),
  `casePromiseGate` (`lib/agent-engine/guardrails/before-send.ts:394`).
- Produz: a lista de sete frases que a Tarefa 7 tem de satisfazer.

- [ ] **Passo 1: escrever a cerca, com as sete frases medidas**

```ts
import { describe, expect, it } from "vitest";
import { casePromiseGate } from "@/lib/agent-engine/guardrails/before-send";

/**
 * CERCA C — PROMESSA AO CLIENTE VIRA COMPROMISSO DO SISTEMA.
 *
 * ⚠️ NASCE VERMELHA. Descreve o que as Tarefas 7, 8 e 9 entregam.
 *
 * Medido em produção (2026-09-16): o agente prometeu "te retorno com a
 * proposta". Houve UM veto (`case_promise_without_case`) e ZERO casos — a
 * segunda formulação PASSOU, e o fail-safe que abre o caso sozinho nunca foi
 * alcançado. Zero casos, zero follow-ups, zero avisos, e o funil ainda moveu
 * para "Proposta enviada".
 *
 * `detectHumanPromise` é LÉXICO: exige palavra de alvo humano colada ao verbo.
 * Um objeto no meio ("as informações") já quebra o padrão. 5 das 7 frases
 * abaixo passam hoje — inclusive uma que escreve "equipe".
 */

const PROMETEM_RETORNO_HUMANO = [
  "Vou encaminhar as informações do site imobiliário para análise e te retorno com a proposta.",
  "Vou encaminhar as informações para a equipe e te retorno com a proposta.",
  "Vou encaminhar para o responsável e te retorno.",
  "Vou analisar e te retorno com a proposta.",
  "Te retorno com a proposta em breve.",
  "Vou levar isso para avaliação interna e te dou um retorno.",
  "Vou passar para o setor comercial montar o orçamento.",
];

const NAO_PROMETEM = [
  "Bom dia! Como posso ajudar?",
  "Nosso horário é de segunda a sexta, das 8h às 18h.",
  "Qual prazo você julga ideal para a entrega?",
  "Consigo te oferecer quinta às 14h ou sexta às 10h.",
];

describe("cerca C — nenhuma promessa sai sem destino", () => {
  it.each(PROMETEM_RETORNO_HUMANO)("VETA sem caso aberto: %s", (frase) => {
    const r = casePromiseGate.evaluate(contextoSemCaso(frase));
    expect(r.pass).toBe(false);
    expect(r.code).toBe("case_promise_without_case");
  });

  it.each(NAO_PROMETEM)("NÃO veta (controle): %s", (frase) => {
    expect(casePromiseGate.evaluate(contextoSemCaso(frase)).pass).toBe(true);
  });

  it("com caso já aberto, nenhuma das sete é vetada", () => {
    for (const frase of PROMETEM_RETORNO_HUMANO) {
      expect(casePromiseGate.evaluate(contextoComCaso(frase)).pass).toBe(true);
    }
  });

  it("nenhuma conversa termina com promessa e zero linhas em casos + retornos + avisos", async () => {
    const mundo = montarTurnoQuePromete(PROMETEM_RETORNO_HUMANO[0]);
    await mundo.rodarTurno();

    const destinos =
      mundo.casos.length + mundo.cronJobsDeRetorno.length + mundo.avisosDaCentral.length;
    expect(destinos).toBeGreaterThan(0);
  });
});
```

- [ ] **Passo 2: rodar e conferir a contagem exata**

```bash
npx vitest run tests/unit/cerca-prometer-de-ponta-a-ponta.test.ts > /tmp/cercaC.log 2>&1; echo exit=$?
grep -aE "Tests |Errors " /tmp/cercaC.log | tail -2
```

Esperado: **6 falham** — as 5 frases que o detector léxico não pega, mais o caso do turno inteiro.
Os 4 controles e as duas restantes passam. **Se o número for diferente de 6, pare e meça:** ou o
detector mudou, ou a cerca está montando o contexto errado.

- [ ] **Passo 3: commit**

```bash
git add tests/unit/cerca-prometer-de-ponta-a-ponta.test.ts
git commit -m "test(guardrail): a cerca que exige destino para toda promessa

VERMELHA de proposito: 6 falham, e 5 delas sao as frases que o detector
lexico deixa passar hoje — inclusive uma que escreve 'equipe', porque o
padrao exige o alvo colado ao verbo e um objeto no meio ja o quebra.

A trava nao e uma trava: e um filtro de formulacao. Ela ensina o modelo a
reformular ate passar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Tarefa 4 — Peça 4: a agenda recusa o impossível ANTES de rodar

> **Esta é a promessa quebrada mais grave e o conserto mais isolado.** O cliente pediu e não
> recebeu. Vira **PR 1** para o Rafael.

**Files:**
- Modificar: `lib/mcp/tools/agendamento.ts:143-181` (o shape), `:194-201` (a descrição),
  `:207-213` (a recusa), `:245-252` (a recusa de negócio)
- Criar: `.changes/a-agenda-recusa-o-pedido-ambiguo.md`
- Modificar: `docs/architecture/agent-turn.workflow.json`

**Interfaces:**
- Consome: a Cerca B (Tarefa 2).
- Produz: `crmFindFreeSlots.inputSchema` passa a ser um `ZodObject` com `.refine()`, não um
  `Record` de shapes. **Isto muda o tipo consumido por `McpToolDefinition` e é a única mudança
  estrutural da tarefa** — confira quem mais depende da forma antes de mexer.

> ### ✅ A pergunta do Passo 1 está RESPONDIDA — medida em 2026-09-16
>
> **Não se toca em `McpToolDefinition`.** O tipo é
> `McpToolDefinition<TInput extends z.ZodRawShape>` e `inputSchema: TInput` é um **raw shape**,
> não um `ZodObject`. Trocá-lo alcançaria **63 ferramentas** e **6 consumidores** — e falharia no
> caminho externo, porque `server.registerTool` (SDK do MCP) espera o raw shape para derivar o
> JSON Schema.
>
> **O repositório já resolveu exatamente este problema**, em `lib/mcp/tools/governance.ts:47-52`
> (`crm_assign_conversation`, que tem a mesma regra entre campos):
>
> ```ts
> const assignInputShape = { conversation_id: …, to_user_id: …, reason: … };
>
> /** Cross-field: release ⇔ to_user_id null; transfer ⇔ to_user_id preenchido. */
> const assignObject = z.object(assignInputShape).refine(…, { message: … });
>
> export const crmAssignConversation: McpToolDefinition<typeof assignInputShape> = {
>   inputSchema: assignInputShape,          // ← o shape cru, intocado
>   handler: async (input, ctx) => {
>     const parsed = assignObject.parse(input);   // ← a regra entra AQUI
> ```
>
> **A Tarefa 4 segue esse precedente**, com uma diferença: o objeto refinado é **exportado**, para
> a cerca poder medi-lo.
>
> **O `.parse()` lança — e isso NÃO fere G17**, porque os dois ingressos capturam: `wrapMcpTool`
> tem `catch` que devolve `{ error: message }` ao modelo (*"Return error to the model rather than
> throwing — keeps the loop alive"*, `tools.ts:340`) e `lib/mcp/server.ts` tem o seu. O modelo
> recebe erro de argumento, que ele sabe corrigir, em vez de lista vazia, que ele não sabe
> distinguir. Medido: **nada no repositório trata `InvalidToolInputError`** — então a validação do
> AI SDK não é caminho seguro, e é por isso que a regra mora no handler, como no precedente.
>
> **⚠️ CONSEQUÊNCIA PARA A CERCA B, e ela é minha.** O caso 1 dela afirma sobre
> `z.object(crmFindFreeSlots.inputSchema)` — e com este desenho o `inputSchema` continua sendo o
> shape CRU, sem o `refine`. **A cerca ficaria vermelha para sempre.** Ela tem de afirmar sobre o
> objeto refinado exportado. A Tarefa 4 corrige a cerca junto, e isso é parte da tarefa, não
> conserto à parte.

- [ ] **Passo 1: MEDIR o raio (G16, momento 1)** — ✅ FEITO, ver o bloco acima

```bash
grep -rn "inputSchema" lib/mcp/types.ts lib/ai/runtime/tools.ts | head -20
grep -rn "shapeToZodObject" --include=*.ts lib | head
grep -rn "crmFindFreeSlots\|find_free_slots" --include=*.ts --include=*.tsx lib app tests | grep -v "\.test\." | head
```

O que a medição tem de responder, por escrito, antes de qualquer edição: **`McpToolDefinition`
aceita um `ZodObject` no lugar do `Record`?** Se não aceitar, o `.refine()` não pode morar no
shape, e a alternativa medida é `superRefine` aplicado em `shapeToZodObject` — que vale para as 61
ferramentas de uma vez. Escolha a que NÃO exige mudar o tipo genérico de 61 ferramentas.

- [ ] **Passo 2: rodar a Cerca B e anotar o número de partida**

```bash
npx vitest run tests/unit/cerca-marcar-de-ponta-a-ponta.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `3 failed | 3 passed`.

- [ ] **Passo 3: a exclusão entra no schema**

Em `lib/mcp/tools/agendamento.ts`, depois de `horariosLivresShape`:

```ts
/**
 * A EXCLUSÃO MORA NO SCHEMA, NÃO NO CORPO DO HANDLER.
 *
 * ⛔ MEDIDO EM PRODUÇÃO (2026-09-16): nove chamadas com `dia` E `dias_a_frente`
 * juntos, nove `{horarios: [], motivo: "periodo_ambiguo"}`, `success: true` nas
 * nove no audit. `crm_book_appointment` nunca foi chamada. O cliente tinha
 * pedido a call.
 *
 * E a prosa já tinha sido tentada, e bem: a skill de plataforma `agendamento`
 * foi ativada no MESMO job e manda, textualmente, "voltou com `motivo` → leia a
 * `mensagem` e faça o que ela manda"; a descrição da ferramenta dizia o mesmo.
 * O modelo recebeu a instrução certa de DUAS fontes independentes, recebeu a
 * mensagem de erro NOVE vezes, e repetiu a chamada inválida nas nove.
 *
 * Enquanto os dois campos puderem ser enviados juntos, alguma conversa vai
 * enviá-los. O erro de VALIDAÇÃO o modelo sabe corrigir; a lista vazia ele não
 * sabe distinguir de "esse dia não tem" — e a leitura óbvia produz exatamente a
 * caminhada de nove dias observada.
 */
export const horariosLivresSchema = z
  .object(horariosLivresShape)
  .refine((v) => !(v.dia !== undefined && v.dias_a_frente !== undefined), {
    message:
      "escolha UM: `dia` (uma data específica que o cliente nomeou) OU `dias_a_frente` " +
      "(quantos dias olhar a partir de agora). Os dois juntos não descrevem um período.",
    path: ["dia"],
  });
```

E os dois `.describe()` passam a declarar a exclusão:

```ts
  dias_a_frente: z
    .number().int().min(1).max(MAXIMO_DE_DIAS).optional()
    .describe(
      `quantos dias olhar a partir de agora (padrão ${DIAS_PADRAO}). Use ESTE campo se você ` +
      `não sabe a data de hoje. NUNCA use junto com \`dia\` — um OU o outro.`,
    ),
  dia: z
    .string().regex(/^\d{4}-\d{2}-\d{2}$/, "dia deve estar em YYYY-MM-DD").optional()
    .describe(
      "dia civil pedido pelo cliente, em YYYY-MM-DD. Use para uma data específica; o servidor " +
      "aplica o fuso da agenda. NUNCA use junto com `dias_a_frente` — um OU o outro.",
    ),
```

- [ ] **Passo 4: toda lista vazia carrega `publicou_horarios`**

Substitua o bloco de `:207-213`:

```ts
    if (input.dia !== undefined && input.dias_a_frente !== undefined) {
      return {
        horarios: [],
        motivo: "periodo_ambiguo",
        mensagem: "informe um dia específico ou quantos dias olhar, não os dois.",
        // ⚠️ A descrição desta ferramenta MANDA ler `publicou_horarios` diante de
        // lista vazia — e este ramo não o devolvia. O modelo segue a instrução,
        // não acha o campo, e cai no comportamento óbvio: tentar outro dia.
        // Régua: lista vazia tem de ser sempre distinguível entre "agenda sem
        // horário", "atendente não publicou" e "pedido malformado" — pelos
        // CAMPOS do retorno, nunca pela prosa.
        publicou_horarios: null,
      };
    }
```

E o mesmo campo no ramo de recusa de negócio (`if (!consulta.ok)`), com
`publicou_horarios: consulta.publicouHorarios ?? null`.

> **Por que `null` e não `false`:** `false` significa "o atendente não publicou jornada", que é um
> fato sobre a agenda. Aqui o fato é sobre o **pedido**. Colapsar os dois faria o modelo dizer ao
> cliente que ninguém publicou horário quando o problema era o argumento — trocar um defeito
> silencioso por uma mentira ao cliente.

- [ ] **Passo 5: a Cerca B fica verde**

```bash
npx vitest run tests/unit/cerca-marcar-de-ponta-a-ponta.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `6 passed`.

- [ ] **Passo 6: SABOTAGEM (G14)**

Remova **só** a linha `.refine(…)`. Previsão: **2 casos caem** — "dia + dias_a_frente são
REJEITADOS PELO SCHEMA" e nenhum outro (os `describe` e o `publicou_horarios` são independentes).

```bash
npx vitest run tests/unit/cerca-marcar-de-ponta-a-ponta.test.ts 2>&1 | grep -aE "Tests "
```

Se cair número diferente de 1 ou 2, a cerca está acoplada onde não devia. Restaure a linha.

- [ ] **Passo 7: fragmento de release**

`.changes/a-agenda-recusa-o-pedido-ambiguo.md`:

```markdown
---
impacto: corrigido
secao: corrigido
titulo: A consulta de horários avisa quando o pedido está ambíguo
---
Quando o assistente pedia uma data específica e um período ao mesmo tempo, a
consulta devolvia uma lista vazia sem dizer por quê — e ele lia isso como
"não tem horário nesse dia" e seguia tentando o dia seguinte, um por um, sem
nunca oferecer nada ao cliente. Agora o pedido ambíguo é recusado na entrada,
com a explicação do que escolher, e toda resposta vazia diz se o atendente
publicou a jornada dele.
```

> Confira `impacto`/`secao` contra o vocabulário aceito antes de commitar:
> `pnpm release:conferir`.

- [ ] **Passo 8: mapa vivo (G13, item 10 do checklist)**

Em `docs/architecture/agent-turn.workflow.json`, o nó da marcação com **duas arestas**: entrada
(`calendar_event_types` + `attendant_availability`) e saída (`calendar_appointments`).

- [ ] **Passo 9: gates + REVISÃO do diff (G16, momento 2)**

```bash
rm -f tsconfig*.tsbuildinfo; pnpm typecheck; echo exit=$?
pnpm lint; echo exit=$?
pnpm test:unit > /tmp/vt.log 2>&1; echo exit=$?
grep -aE "Test Files|Tests |Errors " /tmp/vt.log | tail -3
```

```bash
git diff > /tmp/diff-peca4.txt
```

Depois, com a skill `deepseek-delegacao`, peça a REVISÃO do diff contra os modos de execução reais:
a ferramenta chamada pelo agente em conversa, pelo papel Operador, pela rota REST e pela automação.
A pergunta: **qual desses quatro caminhos passa a receber um erro que antes não recebia?**

- [ ] **Passo 10: commit**

```bash
git add lib/mcp/tools/agendamento.ts .changes/ docs/architecture/
git commit -m "fix(agenda): dia e dias_a_frente juntos sao recusados no schema, nao no silencio

MEDIDO EM PRODUCAO (2026-09-16): nove chamadas de crm_find_free_slots com os
dois campos juntos, nove listas vazias, success:true nas nove, e
crm_book_appointment nunca chamada. O cliente tinha pedido a call e viu o
assistente mudar de assunto.

A prosa ja tinha sido tentada, e bem: a skill de plataforma 'agendamento' foi
ativada no MESMO job e manda ler o motivo; a descricao da ferramenta dizia o
mesmo. Duas fontes independentes, nove mensagens de erro, e a chamada
invalida repetida nas nove. Prosa no prompt nao substitui um schema que
recusa a chamada invalida.

Tres mudancas, todas no contrato: a exclusao entra no .refine(), os describe
a declaram, e TODA lista vazia passa a carregar publicou_horarios — inclusive
as de recusa, que e o campo que a propria descricao manda ler.

Regua de aceite: lista vazia tem de ser sempre distinguivel entre agenda sem
horario, atendente que nao publicou e pedido malformado — pelos campos do
retorno, nunca pela prosa.

Sabotagem: remover so o .refine() derruba 1 de 6, o previsto.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Tarefa 5 — Peça 2: `lead_id` opcional na conversa, obrigatório fora dela

> **Vira PR 2.** Pequena por causa do P1 — e o P2 é a parte que não pode faltar.

**Files:**
- Modificar: `lib/mcp/tools/leads.ts:222-223`
- Modificar: `lib/leads/escopo-de-funil.ts:279-288`
- Modificar: `tests/unit/o-negocio-vem-da-conversa.test.ts` (dois casos novos)
- Criar: `.changes/o-agente-anota-sem-precisar-do-numero.md`

**Interfaces:**
- Consome: `alvoDerivadoDaConversa` (`lib/ai/runtime/tools.ts:78`) — já pronto.
- Produz: `crm_update_lead` chamável sem `lead_id` **quando há contato do turno**.

- [ ] **Passo 1: MEDIR quem mais escreve lead com `lead_id`**

```bash
grep -rn '"lead_id" in def.inputSchema\|category: "write"' lib/ai/runtime/tools.ts
grep -n 'lead_id: z' lib/mcp/tools/leads.ts
grep -rn 'crm_update_lead' --include=*.ts app lib | grep -v test | head
```

Anote as ferramentas `write` com `lead_id`: são as que a mudança do escopo alcança. **Não torne
opcional em nenhuma outra** — `crm_move_lead_stage` e `crm_close_demand` continuam exigindo, porque
o dano delas não é sobrescrever um campo, é dar o negócio por ganho no lugar errado.

- [ ] **Passo 2: o teste que fica vermelho (os dois lados)**

Em `tests/unit/o-negocio-vem-da-conversa.test.ts`:

```ts
  it("DENTRO da conversa: crm_update_lead sem lead_id grava no negócio da conversa", async () => {
    const r = await anotarSemLeadId(CONTATO);
    expect(r.error).toBeUndefined();
    expect(leadQueChegou()).toBe(NEGOCIO_DA_CONVERSA);
  });

  it("FORA da conversa: sem contato do turno e sem lead_id, o escopo RECUSA", async () => {
    // ⛔ O FURO QUE TORNAR O CAMPO OPCIONAL ABRIRIA.
    //
    // `alvoDerivadoDaConversa` só roda quando há `contactId` (o papel Operador,
    // a rota HTTP e as automações não têm um). E `funil_vem_do_lead` sem
    // `lead_id` devolvia `permitido: true` — "sem lead não há funil a checar".
    // Com o campo obrigatório esse ramo era inalcançável nesta ferramenta.
    // Opcional, ele vira a porta: TODA escrita de lead fora da conversa
    // passaria pelo gate de escopo sem checagem nenhuma.
    const v = await podeChamarFerramenta({
      ferramenta: "crm_update_lead",
      argumentos: { custom_fields: { prazo: "30 dias" } },
      escopo: [FUNIL],
      buscarFunilDoLead: async () => null,
    });
    expect(v.permitido).toBe(false);
    expect(v.motivo).toBe("indisponivel");
  });

  it("CONTROLE: leitura sem lead_id continua liberada (crm_list_followups)", async () => {
    const v = await podeChamarFerramenta({
      ferramenta: "crm_schedule_followup",
      argumentos: { contact_id: CONTATO, in_hours: 72 },
      escopo: [FUNIL],
      buscarFunilDoLead: async () => null,
    });
    expect(v.permitido).toBe(true);
  });
```

- [ ] **Passo 3: rodar e conferir que falha**

```bash
npx vitest run tests/unit/o-negocio-vem-da-conversa.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: **2 falham** (o primeiro por Zod `Required`, o segundo porque o escopo libera hoje). O
controle passa.

- [ ] **Passo 4: o campo vira opcional**

`lib/mcp/tools/leads.ts`:

```ts
const updateInputShape = {
  /**
   * OPCIONAL, e a régua é a presença do CONTATO DO TURNO.
   *
   * Dentro de uma conversa o valor é DESCARTADO de qualquer jeito: a fronteira
   * (`lib/ai/runtime/tools.ts`, `alvoDerivadoDaConversa`) resolve o negócio pelo
   * contato e sobrescreve o que o modelo mandou — porque o modelo NUNCA recebe o
   * id do negócio, e pedir a ele que produza um identificador de memória é
   * desenhar para o fracasso (medido: ele inventou `74a0238a-…`, zero linhas no
   * banco). Exigir aqui era exigir um dado que o sistema já joga fora.
   *
   * ⚠️ FORA da conversa (papel Operador, rota REST, automação) não há contato do
   * turno, a fronteira não age, e a ausência do campo é RECUSADA pelo gate de
   * escopo — ver `escopo-de-funil.ts`, ramo `funil_vem_do_lead`. As duas pontas
   * andam juntas: tornar opcional sem fechar aquele ramo abriria escrita de lead
   * sem escopo nenhum.
   */
  lead_id: z.string().uuid().optional(),
  // … resto inalterado
};
```

E no handler, a recusa legível em vez do `undefined` silencioso:

```ts
  handler: async (input, ctx) => {
    const { lead_id, ...rest } = input;
    if (lead_id === undefined) {
      // Recusa de NEGÓCIO volta como RESPOSTA, nunca exceção (G17): exceção mata
      // o turno e o assistente emudece na frente do cliente.
      return {
        atualizado: false,
        motivo: "sem_negocio",
        mensagem:
          "não consegui identificar de qual negócio você está falando. Siga a conversa e " +
          "deixe que alguém da equipe registre.",
      };
    }
    // … resto inalterado
```

- [ ] **Passo 5: o ramo do escopo para de liberar em ESCRITA**

`lib/leads/escopo-de-funil.ts`:

```ts
    case "funil_vem_do_lead": {
      const leadId = entrada.argumentos.lead_id;
      if (typeof leadId !== "string") {
        // ⛔ ESCRITA SEM ALVO NÃO É "SEM FUNIL A CHECAR", É ALVO DESCONHECIDO.
        //
        // Enquanto `crm_update_lead` exigia `lead_id`, este ramo era inalcançável
        // por ela e liberar era barato. Com o campo opcional (a fronteira resolve
        // o negócio pela conversa), ele vira a porta de trás: fora da conversa
        // não há `contactId`, a fronteira não age, e uma escrita sem alvo
        // passaria pelo escopo sem checagem nenhuma.
        //
        // Leitura e follow-up por contato continuam liberados: ali a ausência do
        // lead é um caminho legítimo, e recusar bloquearia o paciente novo — o
        // caso mais comum de uma clínica.
        if (entrada.categoria === "write") {
          return { permitido: false, motivo: "indisponivel", detalhe: "escrita sem negócio alvo" };
        }
        return { permitido: true };
      }
      return resolverPeloLead(entrada, leadId);
    }
```

> **`entrada.categoria` é campo novo** na interface de `podeChamarFerramenta`. Declare-o
> **opcional** (`categoria?: "read" | "write"`) e trate ausente como `read` — há chamadores em
> `tests/invariants/**`, que é CONGELADO (G4), e exigir o campo os quebraria sem que se possa
> editá-los.

- [ ] **Passo 6: verde, e a sabotagem**

```bash
npx vitest run tests/unit/o-negocio-vem-da-conversa.test.ts 2>&1 | grep -aE "Tests "
```

Sabotagem: reverta **só** o `if (entrada.categoria === "write")`. Previsão: **1 caso cai** — "FORA
da conversa… o escopo RECUSA". Se nenhum cair, o teste não está exercitando o ramo.

- [ ] **Passo 7: fragmento, gates, revisão do diff, commit**

```bash
rm -f tsconfig*.tsbuildinfo; pnpm typecheck && pnpm lint && pnpm test:unit > /tmp/vt.log 2>&1; echo exit=$?
grep -aE "Test Files|Tests |Errors " /tmp/vt.log | tail -3
git add lib/mcp/tools/leads.ts lib/leads/escopo-de-funil.ts tests/unit/ .changes/
git commit -m "fix(crm): anotar deixa de exigir o numero que o sistema descarta

O `lead_id` de crm_update_lead era obrigatorio e o valor era DESCARTADO: a
fronteira do turno resolve o negocio pelo contato da conversa e sobrescreve o
que o modelo mandou. Exigir era exigir um dado que o sistema ja joga fora — e
o modelo, sem ter de onde tirar, inventava (medido: 74a0238a-..., zero linhas).

⛔ E TORNAR OPCIONAL SOZINHO ABRIRIA UM FURO. Fora da conversa nao ha contato
do turno, a fronteira nao age, e `funil_vem_do_lead` sem lead_id devolvia
`permitido: true`. Com o campo obrigatorio esse ramo era inalcancavel aqui;
opcional, ele viraria a porta de tras para escrita de lead sem escopo nenhum.
As duas pontas andam no MESMO commit, e o segundo caso de teste e o que
guarda essa diferenca.

Leitura e follow-up por contato continuam liberados sem lead: ali a ausencia e
caminho legitimo, e recusar bloquearia o paciente novo — o caso mais comum de
uma clinica.

Sabotagem: reverter so o ramo de escrita derruba 1 de 3, o previsto.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Tarefa 6 — Peça 3: o contexto para de mentir o nome, e ensina o caminho

> **Vira PR 3.** É a que tira a causa da raiz — e a que faz a Cerca A ficar verde.

**Files:**
- Criar: `lib/agent-engine/edge/crm/negocio-da-conversa.ts`
- Modificar: `lib/agent-engine/edge/crm/get-lead-context.ts:76-88` (o tipo), `:306-317` (o builder)
- Criar: `lib/agent-engine/edge/crm/negocio-da-conversa.test.ts`
- Criar: `.changes/o-assistente-sabe-de-que-negocio-se-fala.md`
- Modificar: `docs/architecture/agent-turn.workflow.json`

**Interfaces:**
- Consome: `resolveActiveLeadForContact` — **a mesma regra** que o roteamento de atividade, o
  escopo de funil e `alvoDerivadoDaConversa` já usam. Reimplementar faria quatro partes do sistema
  discordarem sobre o mesmo cliente.
- Produz:

```ts
export type NegocioDaConversa =
  | { tipo: "um"; leadId: string }
  | { tipo: "nenhum" }
  | { tipo: "varios"; quantos: number };

export async function negocioDaConversa(
  db: pg.Pool,
  ids: { tenantId: string; contactId: string },
): Promise<NegocioDaConversa>;
```

- [ ] **Passo 1: o teste do resolvedor**

```ts
import { describe, expect, it } from "vitest";

describe("negocioDaConversa", () => {
  it("um negócio aberto → devolve o id", async () => {
    const r = await negocioDaConversa(bancoCom([{ id: NEGOCIO, status: "open" }]), IDS);
    expect(r).toEqual({ tipo: "um", leadId: NEGOCIO });
  });

  it("nenhum → tipo nenhum, e NÃO é erro", async () => {
    expect(await negocioDaConversa(bancoCom([]), IDS)).toEqual({ tipo: "nenhum" });
  });

  it("dois abertos → varios, com a contagem", async () => {
    const r = await negocioDaConversa(
      bancoCom([{ id: A, status: "open" }, { id: B, status: "open" }]), IDS);
    expect(r).toEqual({ tipo: "varios", quantos: 2 });
  });

  it("negócio de OUTRA organização não entra na conta", async () => {
    const r = await negocioDaConversa(
      bancoCom([{ id: A, status: "open", organization_id: OUTRA_ORG }]), IDS);
    expect(r).toEqual({ tipo: "nenhum" });
  });
});
```

O quarto caso é G1 em forma de teste: a query filtra `organization_id` **e** `contact_id`, e o
teste falha se alguém tirar o filtro.

- [ ] **Passo 2: rodar (falha: módulo não existe)**

```bash
npx vitest run lib/agent-engine/edge/crm/negocio-da-conversa.test.ts 2>&1 | grep -aE "Tests |Error"
```

- [ ] **Passo 3: escrever o resolvedor**

```ts
/**
 * O NEGÓCIO DE QUEM ESTÁ FALANDO — para o CONTEXTO, não para a ferramenta.
 *
 * A fronteira (`lib/ai/runtime/tools.ts`) já deriva o negócio na hora de
 * ESCREVER. Aqui ele entra no que o modelo LÊ, e são coisas diferentes: sem
 * isto o agente segue vendo um campo chamado `lead_id` que carrega o id do
 * CONTATO — o nome mente, e o modelo acreditava.
 *
 * Usa `resolveActiveLeadForContact`, a MESMA regra do roteamento de atividade,
 * do escopo de funil e da fronteira de escrita. São quatro consumidores da
 * mesma pergunta; reimplementar faria duas partes do sistema discordarem sobre
 * o mesmo cliente.
 */
export async function negocioDaConversa(
  db: pg.Pool,
  ids: { tenantId: string; contactId: string },
): Promise<NegocioDaConversa> {
  const { rows } = await db.query(
    `select id, organization_id, pipeline_id, status, last_activity_at, created_at
       from crm_leads
      where organization_id = $1 and contact_id = $2`,
    [ids.tenantId, ids.contactId],
  );
  const r = resolveActiveLeadForContact(rows as LeadCandidate[]);
  if (r.routed) return { tipo: "um", leadId: r.leadId };
  if (r.reason === "ambiguous_open_leads") {
    return { tipo: "varios", quantos: rows.filter((l) => l.status === "open").length };
  }
  return { tipo: "nenhum" };
}
```

- [ ] **Passo 4: o contexto ganha `negocio_id` — OPCIONAL (G4)**

Em `get-lead-context.ts`, no tipo `LeadContext`:

```ts
  /**
   * O NEGÓCIO do funil desta conversa — o nome verdadeiro, ao lado do antigo.
   *
   * ⚠️ OPCIONAL, e não por preguiça: exigir o campo obriga a editar fixtures em
   * `tests/invariants/**`, que é CONGELADO pelo hook de governança
   * (`loop/hooks/freeze-invariants.sh`). Mesma razão de `contact_id` e
   * `nome_confirmado` acima. A produção sempre o preenche.
   *
   * `null` é informação, não ausência: significa "não há negócio aberto" ou
   * "há mais de um" — e `negocio_situacao` diz qual dos dois, porque o modelo
   * precisa saber se PERGUNTA ou se SEGUE.
   */
  negocio_id?: string | null;
  negocio_situacao?: "um" | "nenhum" | "varios";
```

E no builder (`:315`), ao lado dos dois que já existem — **sem remover nenhum**:

```ts
      // ⚠️ `lead_id` aqui é, e sempre foi, o id do CONTATO. O campo antigo FICA:
      // ele circula por follow-up, case-reply e escalação, e por invariantes
      // congelados. Trocar o nome custa uma wave; somar o certo custa uma linha.
      lead_id: input.leadId,
      contact_id: input.leadId,
      // O NEGÓCIO, com o nome verdadeiro. Sem isto o modelo tinha à mão um
      // atalho errado (`lead_id`) e nenhum caminho ensinado até o certo — e nas
      // duas conversas medidas ele usou o atalho ou não tentou. Zero vezes o
      // caminho certo.
      negocio_id: negocio.tipo === "um" ? negocio.leadId : null,
      negocio_situacao: negocio.tipo,
```

- [ ] **Passo 5: o bloco de campos do funil aponta para o campo certo**

Em `lib/agent-engine/agent/campos-do-funil-do-agente.ts`, o texto do bloco ganha a frase que
faltava — é a instrução que o elo 10 nunca teve:

```
--- como preencher ---
1. O negócio desta conversa é `negocio_id` do contexto. Se ele vier `null`,
   `negocio_situacao` diz por quê: "nenhum" = esta pessoa ainda não tem negócio
   aberto (siga a conversa, não invente); "varios" = ela tem mais de um e você
   não sabe a qual isto pertence (pergunte, ou deixe para a equipe).
2. Anote assim que ouvir, sem esperar o fim da conversa: …
```

- [ ] **Passo 6: a Cerca A fica verde**

```bash
npx vitest run tests/unit/cerca-anotar-de-ponta-a-ponta.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `4 passed`.

- [ ] **Passo 7: SABOTAGEM**

Troque `negocio_id: negocio.tipo === "um" ? negocio.leadId : null` por `negocio_id: input.leadId`
(isto é, volte a mentir). Previsão: **1 caso cai** na Cerca A e **1** no teste do resolvedor não
cai (ele não passa por aqui) — o que prova que a cerca mede o caminho e o unitário mede a peça.

- [ ] **Passo 8: mapa vivo, gates, revisão do diff, commit**

O nó da gravação em `docs/architecture/agent-turn.workflow.json`, com duas arestas: entrada
(`crm_pipelines.settings.fields`) e saída (`crm_leads.custom_fields` → `LeadFieldsForm.tsx`).

```bash
git add lib/agent-engine/edge/crm/ lib/agent-engine/agent/campos-do-funil-do-agente.ts docs/architecture/ .changes/
git commit -m "feat(agente): o contexto diz de que NEGOCIO se esta falando

O contexto entregava um campo chamado `lead_id` que carrega o id do CONTATO —
o nome mente, e o modelo acreditava. Ao lado dele nao havia caminho nenhum
ate o numero certo: existia (listar os negocios e casar pelo contact_id), mas
nao estava escrito em lugar nenhum do prompt, custava um passo a mais de um
orcamento de 10, e o atalho errado estava a mao.

Nas duas conversas medidas o agente usou o atalho, inventou um uuid, ou nao
tentou. Zero vezes o caminho certo. A palavra exata nao e 'impossivel': e que
acertar dependia de o modelo deduzir sozinho um caminho que o sistema nao
ensina, tendo a mao um atalho errado que o sistema oferece.

`negocio_id` nasce OPCIONAL no tipo porque tests/invariants/** e congelado
pelo hook de governanca — mesma razao de contact_id e nome_confirmado. E
`null` e informacao, nao ausencia: `negocio_situacao` diz se e 'nenhum' (siga)
ou 'varios' (pergunte).

Usa resolveActiveLeadForContact, a MESMA regra do roteamento de atividade, do
escopo de funil e da fronteira de escrita.

Sabotagem: voltar a mentir o campo derruba 1 de 4 na cerca da cadeia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Tarefa 7 — Peça 7.1: o detector de promessa para de ser lista de palavras

> Primeira das três da Peça 7. As três juntas viram **PR 4**.

**Files:**
- Modificar: `lib/agent-engine/guardrails/promise/semantic.ts:27-53` (tipo e instrução),
  `:86-92` (o parser)
- Modificar: `lib/agent-engine/guardrails/before-send.ts:394-408` (`casePromiseGate`)
- Modificar: `lib/agent-engine/guardrails/promise/semantic.test.ts`

**Interfaces:**
- Produz:

```ts
export interface PromiseClassification {
  isPromise: boolean;              // promessa COMERCIAL (inalterado)
  suspectPhrase: string | null;    // inalterado
  /** NOVO — a mensagem promete que alguém da empresa volta a falar com o cliente. */
  prometeuRetornoHumano: boolean;
}
```

- [ ] **Passo 1: por que não dá para reusar o campo que existe (o D1, em teste)**

Antes de mudar qualquer coisa, escreva o caso que **documenta a fronteira**:

```ts
  it("o campo isPromise NÃO cobre promessa de retorno humano — é outra pergunta", () => {
    // A instrução do classificador lista, textualmente, "próximos passos vagos
    // SEM compromisso concreto" como NÃO-promessa. "Te retorno com a proposta"
    // é exatamente um próximo passo. Reusar `isPromise` aqui não pegaria
    // nenhuma das cinco frases que hoje vazam — seria trocar um detector cego
    // por outro, com custo de uma chamada extra.
    expect(PROMISE_SEMANTIC_INSTRUCTION).toContain("próximos passos vagos");
  });
```

- [ ] **Passo 2: o teste que fica vermelho — as sete frases**

```ts
const PROMETEM = [
  "Vou encaminhar as informações do site imobiliário para análise e te retorno com a proposta.",
  "Vou encaminhar as informações para a equipe e te retorno com a proposta.",
  "Vou encaminhar para o responsável e te retorno.",
  "Vou analisar e te retorno com a proposta.",
  "Te retorno com a proposta em breve.",
  "Vou levar isso para avaliação interna e te dou um retorno.",
  "Vou passar para o setor comercial montar o orçamento.",
];

it.each(PROMETEM)("classifica como retorno humano: %s", async (frase) => {
  const r = await classifyPromise(db, cfg, ids, { candidate: frase }, deps);
  expect(r.prometeuRetornoHumano).toBe(true);
});

it.each([
  "Bom dia! Como posso ajudar?",
  "Nosso horário é de segunda a sexta, das 8h às 18h.",
  "Consigo te oferecer quinta às 14h ou sexta às 10h.",
  "Qual prazo você julga ideal?",
])("CONTROLE — não é promessa de retorno: %s", async (frase) => {
  const r = await classifyPromise(db, cfg, ids, { candidate: frase }, deps);
  expect(r.prometeuRetornoHumano).toBe(false);
});
```

> Use `MockLanguageModelV4`, como o arquivo já faz — o teste mede o **parser e o gate**, não o
> modelo. A qualidade da classificação em si é medida na Tarefa 19, em prévia, com modelo real.

- [ ] **Passo 3: a instrução ganha a segunda pergunta**

```ts
export const PROMISE_SEMANTIC_INSTRUCTION =
  'Você é um classificador auxiliar de compliance de vendas (NÃO responde ao lead). ' +
  'Analise a MENSAGEM que o vendedor quer enviar e responda DUAS perguntas independentes.\n' +
  '\n' +
  'PERGUNTA 1 — isPromise: a mensagem contém uma PROMESSA COMERCIAL concreta …' +
  /* … o texto atual, inalterado … */
  '\n' +
  'PERGUNTA 2 — prometeuRetornoHumano: a mensagem promete que ALGUÉM DA EMPRESA ' +
  'volta a falar com o cliente, ou que algo será feito internamente e devolvido a ele? ' +
  'É true para "te retorno", "te dou um retorno", "vou encaminhar para análise", ' +
  '"vou levar para avaliação interna", "vou passar para o setor X", "te mando a proposta", ' +
  'com ou sem nomear a pessoa ou o setor — o que importa é o COMPROMISSO DE VOLTAR, não a ' +
  'palavra usada. É false para perguntas, saudações, horários, oferta de horários já ' +
  'disponíveis, e para qualquer coisa que o assistente resolve AGORA na própria conversa.\n' +
  '\n' +
  'Responda SOMENTE com JSON: ' +
  '{"isPromise": true|false, "suspectPhrase": "<trecho>"|null, "prometeuRetornoHumano": true|false}.';
```

> **Por que aqui e não num `purpose` novo:** mesma chamada, mesmo orçamento, mesmo seam. Um
> `purpose` novo dobraria o custo por turno para responder uma pergunta sobre o **mesmo texto** que
> já está no prompt.

- [ ] **Passo 4: o parser lê o campo, e degrada FECHADO**

```ts
  // ⚠️ ASSIMETRIA DELIBERADA NO DEGRADE, e é o ponto deste bloco.
  //
  // `isPromise` degrada para FALSE quando o auxiliar falha: a camada
  // determinística (F4-01) já rodou e pegou o valor estruturado, então
  // fail-open ali é rede a menos, não invariante ferida.
  //
  // `prometeuRetornoHumano` NÃO tem camada anterior equivalente — o detector
  // léxico deixa passar 5 de 7 frases medidas. Degradar para false aqui
  // desarmaria a invariante sagrada ("o cliente nunca recebe promessa-de-humano
  // sem caso aberto") exatamente quando o sistema está com defeito. Então ele
  // degrada para o veredito do LÉXICO, que é pior que o semântico e melhor que
  // nada.
  const prometeuRetornoHumano =
    obj.prometeuRetornoHumano === true || obj.prometeuRetornoHumano === "true";
```

E no ramo de parse-fail, `prometeuRetornoHumano: detectHumanPromise(candidate)` em vez de `false`.

- [ ] **Passo 5: o gate lê os dois detectores**

```ts
export const casePromiseGate: Gate = {
  name: 'case_promise',
  evaluate: (ctx) => {
    if (!ctx.casesEnabled) return { pass: true };
    if (ctx.hasOpenCase || ctx.openedCaseThisTurn) return { pass: true };
    // ⚠️ OU, não E. O léxico é o filtro barato e continua valendo sozinho: ele
    // roda sem chamada de modelo e pega as duas frases que nomeiam o alvo colado
    // ao verbo. O semântico pega as outras cinco — inclusive uma que escreve
    // "equipe", porque um objeto no meio ("as informações") já quebra o padrão
    // léxico. Exigir os dois faria o conserto não consertar nada.
    const lexico = detectHumanPromise(ctx.body, ctx.humanPromiseExtraTargets);
    const semantico = ctx.semanticPromise?.prometeuRetornoHumano === true;
    if (!lexico && !semantico) return { pass: true };
    return { pass: false, code: 'case_promise_without_case', reason: /* inalterado */ };
  },
};
```

- [ ] **Passo 6: rodar as duas suítes**

```bash
npx vitest run lib/agent-engine/guardrails/promise/semantic.test.ts \
               tests/unit/cerca-prometer-de-ponta-a-ponta.test.ts 2>&1 | grep -aE "Tests "
```

Esperado na Cerca C: **11 de 12 passam** — só o último (o turno inteiro, que exige destino
gravado) continua vermelho, e é a Tarefa 8 que o resolve.

- [ ] **Passo 7: SABOTAGEM**

Troque `!lexico && !semantico` por `!lexico` (volte ao detector antigo). Previsão: **5 casos caem**
na Cerca C — exatamente as cinco frases medidas em §6.3. Se cair número diferente de 5, a medição
da spec mudou e o plano precisa ser remedido antes de seguir.

- [ ] **Passo 8: commit**

```bash
git add lib/agent-engine/guardrails/
git commit -m "fix(guardrail): a trava de promessa deixa de ser lista de palavras

Medido: `detectHumanPromise` exige palavra de alvo humano COLADA ao verbo. Um
objeto no meio ('as informacoes') ja quebra o padrao — e 5 de 7 frases
equivalentes passam, inclusive uma que escreve 'equipe'. A trava nao era uma
trava: era um filtro de formulacao, e ensinava o modelo a reformular ate
passar. Foi o que aconteceu em producao: UM veto, ZERO casos, a segunda
formulacao passou, e o fail-safe que abre o caso sozinho nunca foi alcancado.

⛔ O detector semantico que ja existe NAO servia como estava. A instrucao dele
lista, textualmente, 'proximos passos vagos SEM compromisso concreto' como
NAO-promessa — e 'te retorno com a proposta' e exatamente um proximo passo.
Ele foi INSTRUIDO a devolver false para a frase que vazou. Reusar o veredito
seria trocar um detector cego por outro, com custo de uma chamada extra.

Entao: segunda pergunta no MESMO classificador, mesmo purpose, mesma chamada.
Zero chamada nova, zero token no prompt do agente.

O degrade e assimetrico de proposito: isPromise cai para false (a camada
deterministica ja rodou), prometeuRetornoHumano cai para o veredito do LEXICO
— pior que o semantico e melhor que nada, porque aqui nao ha camada anterior.

Sabotagem: voltar ao detector antigo derruba 5 de 12, as cinco medidas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Tarefa 8 — Peça 7.2: promessa aceita agenda o retorno

**Files:**
- Modificar: `lib/agent-engine/agent/inbound-turn.ts:2817-2856` (o fail-safe)
- Modificar: `tests/unit/cerca-prometer-de-ponta-a-ponta.test.ts` (o caso final fica verde)

**Interfaces:**
- Consome: `openCase` e `moverParaHandoffBestEffort`, ambos já no arquivo; `agendaRetornoNoCrm`
  (`lib/followup/retorno-crm.ts:372`).
- Produz: a garantia `nenhuma mensagem que promete retorno sai sem caso OU follow-up`.

**O que já existe e não se reescreve:** o fail-safe de duas camadas está inteiro
(`inbound-turn.ts:2817`) — 1º veto ensina, 2º veto abre o caso mínimo e libera. **Ele nunca foi
alcançado porque a detecção falhava**, e a Tarefa 7 consertou isso. Esta tarefa só acrescenta a
segunda saída (follow-up) e a asserção de que uma das duas existe.

> ### ✅ MEDIDO em 2026-09-16 — a Tarefa 7 bastou, e o ramo de follow-up NÃO entra
>
> **A régua já está satisfeita.** Com a detecção consertada, o fail-safe de 2ª camada
> (`inbound-turn.ts:2817`) passa a ser alcançado: 1º veto ensina, 2º veto abre o caso mínimo e
> libera. Nenhuma promessa sai sem destino.
>
> **O que faltava era PROVA, não código.** Medido: `guardrail_autofallback` aparecia **só em
> código de produção**, em teste nenhum. O fail-safe existia e ninguém o vigiava. A Tarefa 8
> virou, então, **só a cerca** — `tests/unit/promessa-liberada-tem-destino.test.ts`.
>
> **Por que a cerca mede o TEXTO e não o turno:** o fail-safe vive dentro de
> `executarTurnoDoAgente` (4229 linhas), que exige pool, config de LLM, canal, job e fila. O
> repositório já escolheu a resposta para esta classe de problema, e o cabeçalho de
> `tests/unit/handoff-por-orcamento.test.ts` a explica: *"a propriedade é medida ONDE ELA MORA —
> no texto — com controle negativo obrigatório"*. A cerca percorre a AST, isola o `IfStatement`
> do veto e afirma sobre ele.
>
> **Provado por sabotagem no arquivo REAL, três vezes, cada uma com vermelho próprio:**
>
> | sabotagem | resultado |
> |---|---|
> | trocar `source: 'guardrail_autofallback'` | 1 cai |
> | fazer o fail-safe liberar mesmo sem conseguir abrir o caso | 1 cai |
> | tirar o `hasOpenCase: true` da re-rodada | 1 cai |
>
> ### O ramo de follow-up: DECIDIDO que não entra, e o gatilho está escrito
>
> A spec propunha uma segunda saída — o turno aceitar follow-up agendado como destino, em vez de
> abrir caso. **Não entra, e a razão é medida.**
>
> O gate lê **só** `hasOpenCase` e `openedCaseThisTurn`; follow-up agendado não o libera. Então
> um agente que agendasse o retorno **e** repetisse a promessa receberia caso **+** follow-up —
> redundante, e é o custo que a spec queria evitar.
>
> **Mas esse agente não existe.** Medido em 2026-09-16: `crm_schedule_followup` **está** na lista
> de ferramentas dele e ele **não a chamou nenhuma vez**. O ramo resolveria um problema que nunca
> foi observado — e desenhar mecanismo sem medição é exatamente o que esta spec inteira denuncia.
>
> **A condição que o faz entrar, sem depender de alguém lembrar:** quando a métrica da Tarefa 17
> mostrar, na mesma organização, **um caso aberto por `guardrail_autofallback` e um follow-up
> para o mesmo contato na mesma janela**, a redundância deixou de ser hipótese e vira trabalho.

- [ ] **Passo 1: MEDIR se a Tarefa 7 já bastou** — ✅ FEITO, ver o bloco acima

```bash
npx vitest run tests/unit/cerca-prometer-de-ponta-a-ponta.test.ts 2>&1 | grep -aE "Tests "
```

**Se o último caso já estiver verde, esta tarefa é só o Passo 4 (o fragmento) e o commit.** Com a
detecção consertada, o fail-safe existente pode já estar cumprindo a régua sozinho — e acrescentar
código a um caminho que já funciona é o erro que a spec inteira denuncia. **Meça antes de escrever.**

- [ ] **Passo 2: se ainda vermelho — a segunda saída**

No ramo do 2º veto, antes de `openCase`, tentar o follow-up quando o agente **tem** a ferramenta:

```ts
            // DUAS SAÍDAS, e a ordem importa. Caso é para quando alguém precisa
            // DECIDIR; follow-up é para quando alguém precisa VOLTAR A FALAR.
            // A promessa medida ("te retorno com a proposta") é a segunda — abrir
            // um caso para ela enche a fila de quem cuida de bloqueio com
            // trabalho que tem hora marcada.
            //
            // ⚠️ `crm_schedule_followup` ESTÁ na lista de ferramentas do agente
            // (medido: true) e ele não a chamou. Nenhuma regra ligava "prometer" a
            // "agendar o retorno" — `before-send.ts` não menciona follow-up em
            // lugar nenhum. É isso que esta linha corrige.
```

- [ ] **Passo 3: o caso final da Cerca C fica verde**

```bash
npx vitest run tests/unit/cerca-prometer-de-ponta-a-ponta.test.ts 2>&1 | grep -aE "Tests "
```

Esperado: `12 passed`.

- [ ] **Passo 4: fragmento e commit**

```markdown
---
impacto: capacidade_nova
secao: alterado
titulo: Promessa feita ao cliente vira tarefa de alguém
---
Quando o assistente diz que vai retornar com algo — um orçamento, uma
resposta, uma verificação — o sistema passa a exigir um destino antes de a
mensagem sair: um caso para alguém decidir, ou um retorno marcado na agenda.
Antes disso a promessa chegava ao cliente e não deixava rastro em lugar
nenhum: nem caso, nem retorno, nem aviso.
```

---

# Tarefa 9 — Peça 7.3: "próxima ação" sem dono vira aviso

**Files:**
- Modificar: `lib/agent-engine/agent/inbound-turn.ts` (onde `next_action` é escrita)
- Modificar: `tests/unit/cerca-prometer-de-ponta-a-ponta.test.ts`

**Interfaces:**
- Consome: `insertInboxItem`; o `kind` `'promise_unfulfilled'`, que **já existe** na constraint
  (migration 0111) — **zero migration** (P4).

- [ ] **Passo 1: MEDIR onde `next_action` é gravada e se já há dono**

```bash
grep -rn "next_action" --include=*.ts lib/agent-engine | grep -v test | head -20
grep -rn "next_action_seq\|lead_state" --include=*.ts lib | grep -v test | head -10
```

- [ ] **Passo 2: o teste**

```ts
it("next_action escrita sem caso, sem follow-up e sem responsável abre aviso na Central", async () => {
  const mundo = montarTurnoQueEscreveProximaAcao("Enviar orçamento personalizado.");
  await mundo.rodarTurno();

  const avisos = mundo.avisosDaCentral.filter((a) => a.kind === "promise_unfulfilled");
  expect(avisos).toHaveLength(1);
  expect(avisos[0].organization_id).toBe(ORG);   // G1
});

it("CONTROLE — com caso aberto, nenhum aviso é criado (seria ruído)", async () => {
  const mundo = montarTurnoQueEscreveProximaAcao("Enviar orçamento.", { caso: true });
  await mundo.rodarTurno();
  expect(mundo.avisosDaCentral).toHaveLength(0);
});
```

- [ ] **Passo 3: implementar, rodar, sabotar, commitar**

Sabotagem: remova a condição `sem caso && sem follow-up` (emita sempre). Previsão: o **controle**
cai — 1 caso. É a direção que importa: um aviso a mais é ruído, e ruído ensina a ignorar.

---

# Tarefa 10 — Peça 8: a etapa só afirma o fato com evidência

> **Vira PR 5.** É a **única** tarefa deste plano que leva migration para o upstream.

**Files:**
- Criar: `supabase/migrations/<ts>_0274_etapa_que_afirma_fato.sql`
- Modificar: `supabase/baseline.sql` (apêndice), `supabase/migrations/MANIFEST.md`
- Modificar: `lib/mcp/tools/leads.ts:283-315` (`crm_move_lead_stage`)
- Modificar: a tela `Configurações › Funis` (editor de etapa)
- Criar: `tests/unit/etapa-que-afirma-fato.test.ts`

**Interfaces:**
- Produz: `crm_stages.afirma_fato boolean not null default false`.

**Por que uma coluna e não uma lista de nomes:** a lista de etapas é escrita pelo dono, em qualquer
nicho. "Proposta enviada", "Contrato assinado", "Pagamento recebido", "Laudo entregue", "Chaves
entregues" — a regra **não pode olhar o nome**. O dono marca quais etapas afirmam fato, uma caixa
por etapa, **desligada por padrão**, que não muda nada em quem não a usar. Precedente no mesmo
lugar: `crm_stages.requires_human` (`baseline.sql:1512`).

- [ ] **Passo 1: MEDIR o número da migration, nos DOIS lados**

```bash
ls supabase/migrations/ | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1          # nosso: 0273 após T0
git ls-tree --name-only origin/main supabase/migrations/ | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1   # dele: 0262
```

**Na branch combinada:** `0274`. **Na branch do PR, que nasce de `origin/main`:** `0263`. São dois
arquivos com o mesmo conteúdo e números diferentes — é o custo estrutural declarado na Tarefa 0.

- [ ] **Passo 2: a migration (a TRIPLA inteira, G2)**

```sql
-- 0274 — a etapa que AFIRMA um fato só é atingida com evidência.
--
-- Medido em produção (2026-09-16): o negócio foi movido para "Proposta enviada"
-- a partir da mensagem em que o agente PROMETEU a proposta. O classificador leu
-- INTENÇÃO como FATO. No quadro o negócio aparece adiantado, o que é pior que
-- aparecer parado: um negócio em "Proposta enviada" não chama a atenção de
-- ninguém, e o Radar de Risco só o alcançaria dias depois — quando o cliente já
-- desistiu.
--
-- A coluna é do DONO, não do produto: a lista de etapas é escrita por ele, em
-- qualquer nicho, e a regra não pode olhar o nome. Desligada por padrão: quem
-- não marcar nada não sente diferença nenhuma.
--
-- Precedente no mesmo lugar e com a mesma forma: `crm_stages.requires_human`.
alter table public.crm_stages
  add column if not exists afirma_fato boolean not null default false;

comment on column public.crm_stages.afirma_fato is
  'O nome desta etapa afirma um fato verificável (proposta enviada, contrato '
  'assinado, pagamento recebido). Quando true, só é atingida com evidência no '
  'sistema; sem evidência o assistente apenas SUGERE, e alguém confirma.';
```

O mesmo bloco, rotulado `-- ---- etapa que afirma fato (migration 0274) ----`, no apêndice do
`baseline.sql`; e a linha no `MANIFEST.md`.

- [ ] **Passo 3: o teste**

```ts
it("etapa com afirma_fato=true e sem evidência: a ferramenta SUGERE, não move", async () => {
  const r = await mover({ para: ETAPA_QUE_AFIRMA, evidencia: null });
  expect(r.movido).toBe(false);
  expect(r.motivo).toBe("precisa_de_evidencia");
  expect(mundo.avisosDaCentral).toHaveLength(1);
  expect(mundo.leads[NEGOCIO].stage_id).toBe(ETAPA_ANTERIOR);
});

it("etapa com afirma_fato=true e COM evidência: move", async () => {
  const r = await mover({ para: ETAPA_QUE_AFIRMA, evidencia: { tipo: "documento_enviado", id: DOC } });
  expect(r.movido).toBe(true);
});

it("CONTROLE — etapa comum (afirma_fato=false, o padrão) move sem evidência nenhuma", async () => {
  expect((await mover({ para: ETAPA_COMUM, evidencia: null })).movido).toBe(true);
});

it("CONTROLE — em qualquer nicho: a regra lê a COLUNA, nunca o nome", async () => {
  // A etapa se chama "Proposta enviada" e tem afirma_fato=false: move.
  // A etapa se chama "Etapa 4" e tem afirma_fato=true: não move.
  expect((await mover({ para: CHAMADA_PROPOSTA_MAS_SEM_FLAG, evidencia: null })).movido).toBe(true);
  expect((await mover({ para: NOME_GENERICO_COM_FLAG, evidencia: null })).movido).toBe(false);
});
```

O quarto caso é G18 em forma de teste.

- [ ] **Passo 4: implementar, verde, sabotar**

Sabotagem: ignore a coluna (mova sempre). Previsão: **2 casos caem** — o primeiro e o segundo
controle.

- [ ] **Passo 5: caso degenerado, declarado no código**

```ts
// ⚠️ NÃO EXISTE TABELA DE PROPOSTA, ORÇAMENTO OU QUOTE neste produto (medido no
// information_schema, zero linhas). "Proposta enviada" é o nome de uma coluna do
// quadro, nada mais. Enquanto não houver, a evidência aceitável é a que já
// existe: um documento enviado na conversa, ou uma pessoa confirmando na tela.
//
// Esta peça NÃO cria um módulo de propostas — apenas impede que a etapa minta.
// O módulo é outra spec: 2026-09-16-proposta-comercial-design.md.
```

- [ ] **Passo 6: porta na tela (G7) e fragmento**

A caixa vive no editor de etapa em `Configurações › Funis` — tela que **já existe** e já está no
`NAV_CATALOG`. Confirme com `grep -c 'href:' lib/navigation/catalogo.ts` que a porta não mudou.

---

<details>
<summary><strong>⚠️ O QUE ESTE PLANO MANDAVA FAZER AQUI, E ESTAVA ERRADO</strong> — o texto
original, preservado. Quem executasse ao pé da letra faria trabalho errado.</summary>

> Este bloco existe porque eu, na primeira correção, **substituí** a Tarefa 11 em vez de corrigi-la —
> o erro sumiu do documento e só o conserto ficou. A régua desta sessão é a oposta, e é a que vale
> para a spec deste mesmo plano: o erro fica visível ao lado da correção. As quatro medições que
> derrubaram o texto abaixo estão em **P5**.

**Files** *(como estava)*:
- Modificar: `app/api/v1/leads/[id]/next-action/route.ts:119-145`
- Criar: `tests/unit/aprovar-nao-apaga-a-pendencia.test.ts`
- Criar: `.changes/aprovar-uma-proxima-acao-cria-a-tarefa.md`

**Interfaces** *(como estava)*:
- Consome: `agendaRetornoNoCrm` (`lib/followup/retorno-crm.ts:372`) — grava em `cron_jobs`
  (`kind='at'`, `job_kind='followup_turn'`). **Zero migration** (P4).

**Passo 1: o teste** *(como estava)*:

```ts
it("aprovar cria o retorno ANTES de limpar o slot", async () => {
  const r = await aprovar({ seq: 1 });

  expect(r.status).toBe(200);
  expect(mundo.cronJobsDeRetorno).toHaveLength(1);
  expect(mundo.cronJobsDeRetorno[0].organization_id).toBe(ORG);   // G1
  expect(mundo.leadState.next_action).toBeNull();
});

it("se o retorno NÃO pôde ser criado, o slot NÃO é limpo", async () => {
  // ⛔ A ORDEM É A GARANTIA. Limpar primeiro e falhar depois devolve exatamente
  // o defeito que esta tarefa conserta, agora com um 500 na tela para disfarçar.
  mundo.falharAoAgendarRetorno();
  const r = await aprovar({ seq: 1 });

  expect(r.status).toBeGreaterThanOrEqual(400);
  expect(mundo.leadState.next_action).not.toBeNull();
});

it("DESCARTAR continua limpando na hora, sem criar nada", async () => {
  // Descartar é uma decisão COMPLETA: a pessoa disse que não é para fazer.
  // Aprovar não é — ela disse que é para fazer, e alguém tem de fazer.
  await descartar({ seq: 1 });
  expect(mundo.leadState.next_action).toBeNull();
  expect(mundo.cronJobsDeRetorno).toHaveLength(0);
});

it("quem e até quando: o padrão é quem aprovou, com o prazo da organização", async () => {
  await aprovar({ seq: 1 });
  expect(mundo.cronJobsDeRetorno[0].owner_user_id).toBe(USUARIO_QUE_APROVOU);
  expect(mundo.cronJobsDeRetorno[0].run_at).toBeTruthy();
});
```

**Passo 2** *(como estava)*: rodar e conferir que 3 de 4 falham — hoje a rota emite atividade e
limpa; os casos 1, 2 e 4 falham e o 3 (descartar) já passa.

**Passo 3: implementar — o destino ANTES da limpeza** *(como estava)*:

```ts
  if (decision === "approve") {
    const destino = await agendaRetornoNoCrm(/* … quem aprovou, prazo da org … */);
    if (!destino.ok) {
      return fail("next_action_sem_destino", t("Não consegui criar a tarefa desta aprovação. Nada foi alterado."), 409, { requestId });
    }
  }
  // só agora o slot é limpo
```

**Passo 4** *(como estava)*: verde, sabotagem, fragmento, commit. Sabotagem: inverta a ordem.
Previsão: **1 caso cai**.

**O que, de tudo isso, sobreviveu à medição:** a ORDEM (destino antes da limpeza), a assimetria
entre aprovar e descartar, e a previsão de sabotagem — as três estão na versão corrigida abaixo,
palavra por palavra. **O que caiu foi só o DESTINO** e o que dependia dele: a coluna
`owner_user_id`, que `cron_jobs` não tem, e "o prazo da organização", que não existe.

</details>

# Tarefa 11 — Peça 9.1: aprovar cria a TAREFA em vez de apagar a pendência

> **O item que resolve o caso medido.** A spec é explícita: *"se for preciso cortar escopo, corte
> 2 e 3, nunca 1."* Vira **PR 6** com as Tarefas 12 e 13.
>
> ⚠️ **O destino mudou em relação ao que este plano dizia** — `crm_tasks`, não
> `agendaRetornoNoCrm`. As quatro medições que derrubaram a versão anterior estão em **P5**.
>
> ⚠️ **Esta tarefa carrega também a caixa que a Tarefa 10 deixou faltando** em Configurações ›
> Funis. Sem ela o dono não consegue marcar etapa nenhuma e `crm_stages.afirma_fato` fica
> inalcançável — Definition of Done item 14, "tela nova tem porta".

**Files:**
- Criar: `lib/leads/tarefa-da-aprovacao.ts` (puro) + `lib/leads/tarefa-da-aprovacao.test.ts`
- Modificar: `app/api/v1/leads/[id]/next-action/route.ts:120-147`
- Modificar: `lib/api/errors.ts` (código `next_action_sem_destino`)
- Criar: `tests/unit/aprovar-nao-apaga-a-pendencia.test.ts`
- Criar: `.changes/aprovar-uma-proxima-acao-cria-a-tarefa.md`
- **A caixa:** `app/api/v1/pipelines/[id]/agent-mapping/route.ts`, `hooks/pipelines/useAgentMapping.ts`,
  `hooks/pipelines/useStages.ts`, `app/api/v1/pipelines/[id]/stages/[stageId]/route.ts`,
  `lib/leads/stage-operations.ts`, `app/app/settings/tenant/pipelines/_stages.tsx` + teste novo

**Interfaces:**
- Consome: `public.crm_tasks` (migration 0210) — `title`, `due_date`, `assigned_to`, `created_by`,
  `lead_id`, `contact_id`. A policy `crm_tasks_write` exige papel `agent`; a rota já exige `agent`.
  **Zero migration.**
- Produz: `tarefaDaAprovacao(entrada): LinhaDeTarefa` e `PRAZO_DA_APROVACAO_MS`.

**O defeito, em uma frase:** o botão "Aprovar" apaga a única superfície onde a pendência existia.
Quem aprova acredita estar autorizando uma ação; o que faz é concordar com um texto e removê-lo da
tela. **A demanda fica invisível pelo próprio ato de cuidar dela.**

- [x] **Passo 1: o módulo puro e o teste dele**

`tarefaDaAprovacao` monta a linha; quem insere é a rota. Três decisões, cada uma medida:

- **`due_date` nunca é `null`** — `faixaDePrazo()` manda tarefa sem prazo para `sem_prazo` e
  `estaAtrasada()` devolve `false` para ela **sempre** (`lib/tarefas/tipos.ts`). Uma tarefa sem
  prazo nunca vira atrasada: nasceria escondida num lugar diferente do anterior. O padrão é
  `agora + 24 h`, constante do módulo — não há knob de organização (P5, item 4).
- **`title` cortado em 255, com o texto inteiro em `description` quando não couber.** Perder o fim
  de uma proposta longa é perder o que ela pede.
- **`assigned_to = created_by = quem aprovou.** Dono errado é corrigível na tela de tarefas; dono
  nenhum é a tarefa que ninguém vê.

- [x] **Passo 2: a rota — o destino ANTES da limpeza**

```ts
  // ⛔ A ORDEM É A GARANTIA, E ELA É O CONSERTO INTEIRO.
  //
  // Medido em produção (2026-09-16): o dono aprovou "Enviar orçamento
  // personalizado…" — `actor_kind: user`, com o id dele — e o que isso produziu
  // foi uma linha de timeline e `update lead_state set next_action = null`. E
  // só. Nenhuma tarefa, nenhum dono, nenhum prazo, nenhum caso, nenhum
  // follow-up, nenhum aviso. O sino estava em ZERO.
  //
  // Ele aprovou sem saber o que aquilo acionava — porque não acionava nada.
  //
  // Descartar continua limpando na hora: descartar é uma decisão COMPLETA.
  // Aprovar não é.
  //
  // E a ATIVIDADE vem antes da TAREFA de propósito: se o insert falhar, o que
  // se repete numa nova tentativa é a linha de timeline (registro duplicado de
  // uma decisão real, inócuo) e nunca a tarefa (trabalho duplicado).
  if (decision === "approve") {
    const { data, error } = await supabase.from("crm_tasks")
      .insert(tarefaDaAprovacao({ /* … da linha do lead e de user.id … */ }))
      .select("id").single();
    if (error) return fail("next_action_sem_destino", t("…"), 500, { requestId });
  }
  // só agora o slot é limpo
```

**500 e não 409:** a causa é do servidor, não do pedido. O código é próprio para quem lê o log
distinguir "falhou no destino" de qualquer outro erro interno.

- [x] **Passo 3: o teste da rota — 5 casos**

1. aprovar cria a tarefa E SÓ DEPOIS limpa o slot (org, lead, contato, dono e prazo conferidos);
2. ⭐ **se a tarefa não pôde ser criada, o slot NÃO é limpo** — status ≥ 400 e `update` não chamado;
3. CONTROLE — descartar limpa na hora e cria **zero** tarefas;
4. CONTROLE — autorização vencida (`seq` diferente) recusa 409 e não cria nada;
5. o texto inteiro da proposta chega ao destino.

- [x] **Passo 4: a caixa de `afirma_fato`, do banco à tela**

Seis pedaços, e abrir cinco deixa o botão sem efeito ou a tela sem o dado: a projeção do
`agent-mapping` (que é quem alimenta a tela, **não** o `useStages`), `EtapaDoFunil`,
`PatchDeEtapa`, o `bodySchema` `.strict()` do PATCH, `PedidoDeEdicao`/`patchDoAlvo` em
`stage-operations`, e a linha própria com `Switch` no `<li>` de cada etapa.

⚠️ `afirma_fato` **não** passa por `validarMarcacao`/`updatesDeMarcacao`: aqueles cuidam de
`is_won`/`is_lost`, que disputam índices únicos parciais por funil. Quantas etapas do funil
afirmarem fato, todas podem.

- [x] **Passo 5: verde, sabotagem, fragmento, commit**

Sabotagem: inverta a ordem (limpe primeiro, insira depois). Previsão: **1 caso cai** — "se a
tarefa não pôde ser criada, o slot NÃO é limpo". É o caso que separa este conserto de um que só
parece certo.

---

# Tarefa 12 — Peça 9.2: a Central sabe o que é novo

> **Prevenção, não o caso medido.** A Central desta organização tem **zero** avisos abertos hoje —
> medido, com filtro de `organization_id` (G1). A degradação que isto evita aparece com volume.

**Files:**
- Criar: `supabase/migrations/<ts>_0275_a_central_sabe_o_que_e_novo.sql`
- Modificar: `supabase/baseline.sql`, `supabase/migrations/MANIFEST.md`
- Modificar: `components/shell/AlertsBell.tsx:28-29`, `hooks/…/useAgentInbox`
- Criar: `tests/unit/o-sino-conta-o-que-ninguem-olhou.test.tsx`

**Interfaces:**
- Produz: `agent_inbox_items.seen_at timestamptz` (nullable = nunca visto).

- [x] **Passo 1: a migration**

```sql
-- 0275 — o sino passa a contar o que NINGUÉM OLHOU, não o acervo.
--
-- Medido: a tabela não tem coluna de "lido"/"visto"/"novo". O sino conta
-- `status = 'open'`, que é acervo. Com volume, o contador vira paisagem: oito
-- avisos antigos e um crítico novo produzem o mesmo "9" de ontem, e quem olha
-- aprende a não olhar.
--
-- ⚠️ Isto é PREVENÇÃO, e a medição diz por quê: a Central desta organização
-- tem ZERO avisos abertos. Não foi isto que escondeu o episódio de 16/09 — o
-- canal estava funcionando e não tinha o que transmitir (nada foi emitido).
-- O acervo continua na tela da Central, onde é útil; no sino ele é ruído.
alter table public.agent_inbox_items
  add column if not exists seen_at timestamptz;

create index if not exists idx_agent_inbox_items_nao_vistos
  on public.agent_inbox_items (organization_id, created_at desc)
  where status = 'open' and seen_at is null;
```

- [x] **Passo 2: o teste**

```tsx
it("um aviso critical NOVO é distinguível de oito antigos SEM abrir a Central", () => {
  render(<AlertsBell />, { avisos: [ ...oitoAntigosVistos, umCriticalNovo ] });
  expect(screen.getByTestId("alerts-bell-count")).toHaveTextContent("1");
});

it("CONTROLE — o acervo continua inteiro na tela da Central", () => {
  render(<CentralDeAvisos />, { avisos: [ ...oitoAntigosVistos, umCriticalNovo ] });
  expect(screen.getAllByRole("listitem")).toHaveLength(9);
});
```

O segundo caso é a régua de aceite da spec, ao contrário: **esconder o acervo não é o conserto.**

- [x] **Passo 3: implementar, verde, sabotar, commitar**

Sabotagem: volte o `AlertsBell` a contar `open`. Previsão: **1 caso cai** (o primeiro); o controle
continua verde — que é o que prova que a mudança não escondeu nada.

---

# Tarefa 13 — Peça 9.3: a categoria "o assistente precisa de você"

> **Escopo cortado pelo D2, e o corte está declarado.** A tela `Configurações › Notificações` é UI
> sem servidor (`updateNotificationPrefs.ts` é um STUB). Esta tarefa acrescenta a categoria nos
> dois lugares e **não** constrói a tabela de preferências.

**Files:**
- Modificar: `lib/notifications/prefs.ts:3-9,28-33,98`, `lib/notifications/kinds.ts`
- Modificar: `lib/schemas/settings.ts:127-132`
- Modificar: `app/app/settings/notifications/_client.tsx:22`
- Modificar: `lib/schemas/settings.test.ts`

- [x] **Passo 1: MEDIR as seis cópias da lista (a armadilha da memória `busca-que-monta-lista`)**

```bash
grep -rn "lead_assigned" --include=*.ts --include=*.tsx app lib components hooks tests | wc -l
grep -rn "lead_assigned" --include=*.ts --include=*.tsx app lib components hooks tests
```

**Rode a varredura LARGA e CONTE.** Uma busca filtrada devolve um conjunto que parece completo e
nada na saída diz "havia mais, eu escondi" — foi assim que uma lista voltou 5 de 6 e o CI reprovou
numa cerca de drift.

- [x] **Passo 2: acrescentar a categoria em TODAS as ocorrências medidas**

Nome: `assistente_precisa_de_voce`. Rótulo na tela: "O assistente precisa de você".

- [x] **Passo 3: conferir que o número de ocorrências convertidas bate com o total**

```bash
total=$(grep -rn "lead_assigned" --include=*.ts --include=*.tsx app lib components hooks tests | wc -l)
novo=$(grep -rn "assistente_precisa_de_voce" --include=*.ts --include=*.tsx app lib components hooks tests | wc -l)
echo "universo=$total convertidas=$novo"    # têm de bater
```

- [x] **Passo 4: a dívida fica ESCRITA, não escondida**

Em `app/actions/settings/updateNotificationPrefs.ts`, o comentário do stub ganha a medição:

```ts
/**
 * STUB — a tabela `notification_prefs` não existe. Medido em 2026-09-16: esta
 * ação devolve `feature_not_yet_available` para QUALQUER entrada, e a tela
 * `Configurações › Notificações` é UI sem servidor desde a Wave 5 do EPIC-10.
 *
 * O caminho que FUNCIONA é o outro: `lib/notifications/prefs.ts`, com
 * `NOTIFY_UI_CATEGORIES` em `localStorage` — por navegador, in-app e push.
 *
 * ⚠️ DÍVIDA DECLARADA, fora do escopo deste plano: a preferência não atravessa
 * navegador nem dispositivo, e o canal de e-mail segue `disabled` no código.
 * O que NÃO podia continuar é a categoria não existir — aí nem quem quer ser
 * avisado consegue pedir.
 */
```

- [x] **Passo 5: gates e commit**

---

# Tarefa 14 — Peça 5: a chave entrega a ferramenta

> **Nossa, não vai para o Rafael** — `lead_fields_*` não existe no produto dele. É o **único
> defeito dos doze que é nosso** (D3).

**Files:**
- Modificar: `lib/ai/runtime/tools.ts:35-60` (`PickToolsInput`), `:347-379` (`pickToolsFromMcp`)
- Modificar: `lib/agent-engine/edge/crm/mcp-tools.ts:109-125`
- Criar: `tests/unit/a-chave-entrega-a-ferramenta.test.ts`

**Interfaces:**
- Consome: `PublishedAgentConfig.leadFieldsEnabled` / `.leadFieldsProposeNew`
  (`agent-config.ts:91,100`) — já existem e já são lidos do banco.
- Produz: `PickToolsInput` ganha `leadFieldsEnabled?: boolean` e `leadFieldsProposeNew?: boolean`.

**O padrão já está escrito**, e esta tarefa é copiá-lo (`tools.ts:372`):

```ts
  // Auto-inject handoff tool when enabled even if not in tool_ids
  if (input.handoffToolEnabled && !result[HANDOFF_TOOL_NAME]) { … }
```

- [x] **Passo 1: o teste, com o caso degenerado que a spec exige**

```ts
it("ligar lead_fields_enabled acrescenta crm_update_lead mesmo fora de tool_ids", () => {
  const t = pickToolsFromMcp({ ...base, toolIds: [], leadFieldsEnabled: true });
  expect(Object.keys(t)).toContain("crm_update_lead");
});

it("ligar lead_fields_propose_new acrescenta crm_propose_lead_field", () => {
  const t = pickToolsFromMcp({ ...base, toolIds: [], leadFieldsProposeNew: true });
  expect(Object.keys(t)).toContain("crm_propose_lead_field");
});

it("DEGENERADO — desligar a chave NÃO remove a ferramenta escolhida à mão", () => {
  // A chave ACRESCENTA, nunca remove: o dono pode tê-la escolhido em modo
  // avançado, e uma chave que tira o que o dono pôs é a chave decidindo por ele.
  const t = pickToolsFromMcp({ ...base, toolIds: ["crm_update_lead"], leadFieldsEnabled: false });
  expect(Object.keys(t)).toContain("crm_update_lead");
});

it("CERCA — nenhuma chave nomeia no prompt uma ferramenta que ela não entrega", () => {
  // D3, em forma de guarda: o bloco do prompt mandava usar `crm_update_lead` e
  // a chave não a entregava. Falha sem culpado — a tela dizia ligado, o prompt
  // dava a ordem, e a ferramenta não estava lá.
  for (const chave of CHAVES_QUE_ESCREVEM_NO_PROMPT) {
    const t = pickToolsFromMcp({ ...base, toolIds: [], [chave.flag]: true });
    for (const nome of chave.ferramentasCitadas) expect(Object.keys(t)).toContain(nome);
  }
});
```

- [x] **Passo 2: implementar, verde, sabotar, commitar**

Sabotagem: remova a auto-injeção de `crm_propose_lead_field`. Previsão: **2 casos caem** (o
segundo e a cerca).

> **Achado durante a execução, fora do escopo escrito acima (medido em 2026-09-16, não
> antecipado pelo brainstorming original).** A auto-injeção resolve quem MONTA a ferramenta, mas
> `inbound-turn.ts:1993` decidia o TEXTO do prompt (`podeAnotar`) por uma condição diferente —
> `agentConfig.toolIds.includes('crm_update_lead')`, a lista escolhida à MÃO no modo avançado, sem
> olhar `leadFieldsEnabled`. Resultado: o dono que liga só a chave simples ganha a ferramenta no
> motor (esta tarefa) e continua lendo, no texto que o modelo recebe, "você NÃO tem ferramenta
> para gravar" — o modelo nunca tenta usá-la. Mesmo defeito de D3, do lado do texto.
>
> Corrigido no mesmo commit da sessão (`95e51515`), com uma função pura nova —
> `podeAnotarCampos(agentConfig)` em `campos-do-funil-do-agente.ts` — que unifica as duas origens
> (`toolIds` manual OU `leadFieldsEnabled`), usada tanto seria de decidir o texto quanto poderia
> decidir a montagem se um dia o código for reorganizado. Quatro casos novos no arquivo de teste
> co-localizado; sabotagem (`||` removido) derruba exatamente o caso que motivou a correção.

---

# Tarefa 15 — Peça 6: o teto de passos passa a ser medido, não adivinhado

> **Nossa.** E o que ela **não** faz é tão importante quanto o que faz: **não mexe no valor `10`.**
> Trocar um número sem instrumento é o mesmo erro de novo.

**Files:**
- Modificar: `lib/agent-engine/agent/inbound-turn.ts` (o `return` do teto)
- Criar: `supabase/migrations/<ts>_0276_avisos_de_teto_e_de_laco.sql` (dois `kind`, G5 + G6)
- Modificar: `supabase/baseline.sql`, `supabase/migrations/MANIFEST.md`
- Criar: `tests/unit/o-teto-de-passos-aparece.test.ts`

- [x] **Passo 1: MEDIR onde o teto para o turno hoje**

```bash
grep -rn "maxSteps\|max_steps\|stepCount" --include=*.ts lib/agent-engine lib/ai | grep -v test | head -15
```

- [x] **Passo 2: a migration dos dois `kind` (G5: entram no FIM da lista)**

```sql
-- 0276 — dois avisos que o sistema precisa saber emitir sobre SI MESMO.
--
-- G5: kind novo mexe em DOIS lugares (esta migration e a lista do baseline) e
-- entra no FIM — `tests/unit/midia-nao-lida.test.ts` procura 'midia_nao_lida'
-- nos primeiros 2000 caracteres a partir do `add constraint`, e valor novo
-- acima dele o empurra para fora da janela (medido: offset 1532 -> 2275).
--
-- G6: UM bloco por constraint. Reconstruir a mesma constraint em N blocos
-- quebra o `update.sh` de todo clone com vocabulário posterior (issue #159).
alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    -- … a lista inteira em vigor, verbatim, na ordem …
    'lead_field_proposed',
    -- (migration 0276) O turno bateu no teto de passos e parou no meio. Antes
    -- disto era um `return` mudo: o cliente via a conversa terminar sem resposta
    -- e ninguém no sistema sabia que o teto tinha sido a causa.
    'passos_esgotados',
    -- (migration 0276) Uma das duas contagens do laço de retorno caiu de forma
    -- sustentada nesta organização: perguntas de campo feitas x campos gravados,
    -- ou pedidos de agendamento x compromissos criados. É o invariante 7 em
    -- forma de aviso — o sistema denunciando a si mesmo em vez de esperar o
    -- dono reclamar.
    'laco_de_retorno_caiu',
    'other'
  ));
```

- [x] **Passo 3: o teste**

```ts
it("turno que bate no teto abre aviso na Central, com a organização certa", async () => {
  const mundo = montarTurnoComTeto(3);
  await mundo.rodarTurnoQueGasta(5);

  const avisos = mundo.avisosDaCentral.filter((a) => a.kind === "passos_esgotados");
  expect(avisos).toHaveLength(1);
  expect(avisos[0].organization_id).toBe(ORG);      // G1
});

it("registra passos gastos e motivo de parada onde já há escritor vivo", async () => {
  const mundo = montarTurnoComTeto(3);
  await mundo.rodarTurnoQueGasta(5);
  expect(mundo.execucao.steps_count).toBe(3);
  expect(mundo.execucao.abort_reason).toBe("max_steps");
});

it("CONTROLE — turno que cabe no teto não emite aviso nenhum", async () => {
  const mundo = montarTurnoComTeto(10);
  await mundo.rodarTurnoQueGasta(4);
  expect(mundo.avisosDaCentral).toHaveLength(0);
});
```

- [x] **Passo 4: implementar, verde, sabotar, commitar**

No commit, a linha que impede a próxima sessão de "melhorar" o número:

```
O que NAO muda: o valor 10. Trocar um numero sem instrumento e o mesmo erro
de novo. O valor se decide na Tarefa 18, com o dado que esta tarefa produz.
```

---

# Tarefa 16 — Peça 10: o turno real deixa registro de execução

> **Vira PR 7.** É o que transforma o próximo defeito de três dias em dez minutos.

**Files:**
- Criar: `lib/agent-engine/agent/registro-de-execucao.ts`
- Modificar: `lib/agent-engine/agent/inbound-turn.ts` (início e fim do turno)
- Criar: `lib/agent-engine/agent/registro-de-execucao.test.ts`
- Criar: `.changes/o-turno-do-assistente-deixa-registro.md`

**Interfaces:**
- Consome: `ai_agent_runs` — **todas as colunas já existem** (`baseline.sql:938-963`):
  `status`, `abort_reason`, `steps_count`, `tool_calls`, `tokens_in/out`, `cost_cents`,
  `latency_ms`, `is_dry_run`, `started_at`, `completed_at`. **Zero migration** (P4).
- Produz:

```ts
export async function abrirRegistroDeExecucao(db, ids): Promise<{ runId: string }>;
export async function fecharRegistroDeExecucao(db, runId, r: {
  status: "completed" | "failed" | "aborted" | "handoff";
  abortReason?: string;
  stepsCount: number;
  toolCalls: readonly { nome: string; ok: boolean }[];
}): Promise<void>;
```

**O defeito, medido (§9):** `ai_invocations` tem **zero linhas desde sempre** — a migration 0130 a
deixou sem escritor. `ai_agent_runs` só é escrita pela rota de teste
(`versions/[vid]/test/route.ts:13`): 2 linhas, a última de 10/09. **O turno real não grava passos,
motivo de parada, nem o prompt.** Este diagnóstico levou dias e exigiu ler log de contêiner.

- [ ] **Passo 1: MEDIR que a rota de prévia já grava, e reusar o formato dela**

```bash
grep -rn "ai_agent_runs" --include=*.ts app lib workers | grep -v test
```

**Grave no mesmo formato da prévia.** Duas formas para a mesma tabela fariam a consulta de
diagnóstico ter de saber quem escreveu — que é o oposto do objetivo.

- [ ] **Passo 2: o teste**

```ts
it("depois de um turno, a linha existe com passos, motivo e ferramentas", async () => {
  const mundo = montarTurno();
  await mundo.rodarTurno();

  const linha = mundo.runs.at(-1);
  expect(linha.is_dry_run).toBe(false);
  expect(linha.steps_count).toBeGreaterThan(0);
  expect(linha.status).toBe("completed");
  expect(linha.tool_calls).toBeInstanceOf(Array);
  expect(linha.organization_id).toBe(ORG);       // G1
});

it("turno que MORRE também deixa linha — é o caso que mais importa", async () => {
  // ⛔ Registro que só existe no caminho feliz não serve para diagnosticar.
  // O defeito que se quer investigar é, por definição, o turno que deu errado.
  const mundo = montarTurno({ explodeNoPasso: 2 });
  await mundo.rodarTurno().catch(() => {});

  expect(mundo.runs.at(-1).status).toBe("failed");
  expect(mundo.runs.at(-1).steps_count).toBe(2);
});

it("CONTROLE — gravar a execução NUNCA derruba o turno", async () => {
  // Fire-and-forget, como o audit log: falha de observabilidade não pode calar
  // o assistente na frente do cliente.
  const mundo = montarTurno({ falharAoGravarExecucao: true });
  const r = await mundo.rodarTurno();
  expect(r.enviou).toBe(true);
});
```

- [ ] **Passo 3: implementar, verde, sabotar**

Sabotagem: remova o `fechar` do caminho de erro. Previsão: **1 caso cai** — "turno que MORRE também
deixa linha".

- [ ] **Passo 4: régua de aceite, na VPS, pelo Paulo (G10)**

Entregue o comando; não rode escrita:

```sql
select steps_count, abort_reason, status, jsonb_array_length(tool_calls) as ferramentas
  from ai_agent_runs
 where organization_id = :'org' and is_dry_run = false
 order by created_at desc limit 5;
```

---

# Tarefa 17 — Peça 11: o laço de retorno

> **Vira PR 8.** É o invariante 7 da doutrina dele, e a única peça cuja prova é **o sistema
> denunciar a si mesmo**.

**Files:**
- Criar: `lib/metricas/laco-de-retorno.ts`
- Criar: `app/api/v1/cron/laco-de-retorno/route.ts`
- Criar: `tests/unit/laco-de-retorno.test.ts`
- Modificar: `docker-compose.prod.yml` (agendamento no `scheduler`)

**Interfaces:**
- Consome: `ai_agent_runs` (Tarefa 16), `api_audit_log`, `crm_leads.custom_fields`,
  `calendar_appointments`; o `kind` `'laco_de_retorno_caiu'` (Tarefa 15).
- Produz:

```ts
export interface ContagemDoLaco {
  organizationId: string;
  perguntasDeCampo: number;   camposGravados: number;
  pedidosDeAgenda: number;    compromissosCriados: number;
}
export async function medirLaco(db, janelaEmDias: number): Promise<ContagemDoLaco[]>;
```

**A pergunta que a doutrina manda fazer:** *quando o sistema erra, o que muda nele?* Hoje a
resposta é **nada** — quem percebeu foi o dono, reclamando.

- [ ] **Passo 1: o teste — e a régua de aceite é a mais forte deste plano**

```ts
it("perguntas de campo feitas sem campos gravados vira aviso na Central", async () => {
  const mundo = mundoCom({ perguntas: 20, gravados: 0 });
  await rodarLaco(mundo);
  expect(mundo.avisosDaCentral.filter((a) => a.kind === "laco_de_retorno_caiu")).toHaveLength(1);
});

it("pedidos de agendamento sem compromissos criados vira aviso", async () => {
  const mundo = mundoCom({ pedidosDeAgenda: 9, compromissos: 0 });
  await rodarLaco(mundo);
  expect(mundo.avisosDaCentral).toHaveLength(1);
});

it("CONTAGEM POR ORGANIZAÇÃO — o aviso de um cliente não aparece no outro", async () => {
  // ⛔ G1 EM FORMA DE TESTE, e na VPS do Paulo isto é existencial: cada
  // organização é um CLIENTE PAGANTE diferente. Somar duas é medir um mundo
  // que não existe, e mandar o aviso de um cliente para outro é o fim do
  // produto, não um bug grave.
  const mundo = mundoComDuasOrgs({ orgA: { perguntas: 20, gravados: 0 },
                                   orgB: { perguntas: 20, gravados: 20 } });
  await rodarLaco(mundo);
  const avisos = mundo.avisosDaCentral;
  expect(avisos).toHaveLength(1);
  expect(avisos[0].organization_id).toBe(ORG_A);
});

it("CONTROLE — queda de um dia não dispara; só a sustentada", async () => {
  const mundo = mundoCom({ perguntas: 2, gravados: 0, dias: 1 });
  await rodarLaco(mundo);
  expect(mundo.avisosDaCentral).toHaveLength(0);
});
```

- [ ] **Passo 2: o gatilho da Peça 9 (envelhecimento) sai desta métrica**

A spec deixou o envelhecimento de aviso parado **de fora, com gatilho escrito**: entra quando esta
métrica mostrar **qualquer aviso aberto há mais de 7 dias**. Inclua a contagem no mesmo cron, e a
condição deixa de depender de alguém lembrar:

```sql
select organization_id, count(*) as parados
  from agent_inbox_items
 where status = 'open' and created_at < now() - interval '7 days'
 group by organization_id;
```

- [ ] **Passo 3: SABOTAGEM — e é a prova da peça inteira**

**Reverta a Tarefa 5** (volte `lead_id` a obrigatório) num ambiente de teste e rode o laço.
Previsão: o aviso aparece **sem ninguém reclamar**. Se não aparecer, a peça não faz o que promete —
e o que ela promete é a única coisa que ela existe para fazer.

---

# Tarefa 18 — `max_steps`: medir e só então decidir o valor

> **Não é exclusão, é sequência.** Depende da Tarefa 15 (o instrumento) e da 16 (o registro).

- [ ] **Passo 1: medir quantos passos um turno real gasta, por tipo de turno**

Comando para o Paulo rodar na VPS (G10):

```sql
select
  case when jsonb_array_length(tool_calls) = 0 then 'sem ferramenta'
       when tool_calls::text like '%find_free_slots%' then 'com agenda'
       else 'so conversa' end as tipo,
  count(*), min(steps_count), percentile_cont(0.5) within group (order by steps_count) as mediana,
  max(steps_count), count(*) filter (where abort_reason = 'max_steps') as bateram_no_teto
from ai_agent_runs
where organization_id = :'org' and is_dry_run = false and created_at > now() - interval '14 days'
group by 1;
```

- [ ] **Passo 2: só com esse dado, decidir**

**Medido em 16/09, antes do instrumento:** 12 chamadas num minuto; descontadas as do papel Operador
(orçamento próprio), sobram **~11 passos do atendente num turno com teto de 10**. Numa conversa que
entra na agenda **não há passo sobrando para gravar campo**, mesmo com todo o resto certo.

Se a medição confirmar, a mudança é do **default** em `lib/ai/agents/validation.ts` — e ela é
**PR próprio**, com a tabela acima no corpo. Se não confirmar, **não mude nada** e escreva por quê.

---

# Tarefa 19 — A prova em prévia, por mim, antes de o Paulo tocar no telefone

> **Nada aqui usa o dono como teste.** A rota de prévia serve inteira, e está medida.

**O que a rota faz** (`app/api/v1/ai/agents/[id]/versions/[vid]/test/route.ts`):

- carrega a configuração **completa** da versão (`loadAgentVersionConfig`), com `lead_fields_*` e
  `pipeline_ids`;
- roda o **mesmo** `executarTurnoDoAgente` do turno real (`runAgentPreview`);
- em prévia toda operação vira **proposta**, gravada em `ai_agent_runs.tool_calls` — a decisão do
  modelo fica registrada **sem escrever no cliente**;
- funciona hoje: `llm_calls` tem `purpose='agent_preview'` de 16/09 às 09:50.

- [ ] **Passo 1: o roteiro de conversa, em TRÊS segmentos (G18)**

O mesmo roteiro, trocando só o vocabulário do funil do dono:

| segmento | campos declarados | pedido de agenda |
|---|---|---|
| serviços | prazo, tipo de projeto, tem conteúdo | "pode agendar uma call" |
| clínica | convênio, primeira consulta, sintoma principal | "quero marcar uma consulta" |
| imobiliária | bairro, faixa de preço, quartos | "dá para visitar sábado?" |

**Se o roteiro só funcionar em um dos três, a entrega é de nicho e volta para a bancada.**

- [ ] **Passo 2: rodar a prévia e ler a decisão do modelo**

```sql
select tool_calls from ai_agent_runs where is_dry_run = true order by created_at desc limit 1;
```

O que tem de aparecer: `crm_update_lead` com `custom_fields` preenchido e **sem** `lead_id`
inventado; `crm_find_free_slots` com **um** dos dois campos de período; `crm_book_appointment` com
o `inicio` copiado.

- [ ] **Passo 3: e só então, a conversa real — comandos para o Paulo (G10)**

```sql
select id, custom_fields from crm_leads where organization_id = :'org' and id = '<o negócio da conversa>';
select id, status, starts_at from calendar_appointments where organization_id = :'org' and contact_id = '<o contato>';
select kind, severity, title, created_at from agent_inbox_items where organization_id = :'org' and status = 'open';
```

---

# Tarefa 20 — Os oito PRs

**Regra dele, seguida ao pé da letra (G11):** branch nova **de `origin/main`**, nunca do `main` do
fork — o fork carrega a marca e a configuração desta instalação, e um PR dali propõe tudo isso ao
produto inteiro (medido no repo dele: sete arquivos com a marca de um cliente mergeando sem
conflito, PR #465).

- [ ] **Passo 1: o pré-voo, antes de cada PR**

```bash
bash .agents/skills/deskcomm-contribuir/scripts/quem-sou.sh
bash .agents/skills/deskcomm-contribuir/scripts/armar-hooks.sh
bash .agents/skills/deskcomm-contribuir/scripts/pre-voo.sh
```

- [ ] **Passo 2: os oito, um por defeito**

| PR | Tarefa | O que conserta | Tamanho | Migration? |
|---|---|---|---|---|
| 1 | T4 | agenda: `dia` + `dias_a_frente` juntos devolvem lista vazia em silêncio | pequeno | não |
| 2 | T5 | `lead_id` obrigatório sem caminho ensinado (+ o furo de escopo) | pequeno | não |
| 3 | T6 | o contexto chama de `lead_id` o id do contato | médio | não |
| 4 | T7–T9 | promessa ao cliente sem caso, follow-up nem dono | médio | não |
| 5 | T10 | o estágio afirma "Proposta enviada" sem proposta | médio | **sim — 0263 lá** |
| 6 | T11–T13 | aprovar apaga a pendência; sino conta acervo; categoria não existe | pequeno+ | sim (0275 aqui) |
| 7 | T16 | o turno real não deixa registro de execução | médio | não |
| 8 | T17 | o laço de retorno: o sistema denuncia a si mesmo | médio | sim (0276 aqui) |

**As Tarefas 1–3 (as cercas), 14 (Peça 5) e 15 (Peça 6) são nossas** e não vão para ele: nascem de
`lead_fields_*`, que não existe no produto dele.

- [ ] **Passo 3: o corpo de cada PR**

Leva, sempre: o que muda **para quem usa**; o teste que fica vermelho sem o conserto; a
**sabotagem** feita, com previsto × observado; fragmento em `.changes/`; e o bloco **"o que NÃO
medi"** — que no PR é obrigatório e serve para o mantenedor saber o que provar (diferente de uma
spec, onde é desculpa).

Termina com:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Passo 4: o candidato a PR pequeno, fora da ordem**

O produto empilha "proposta" em **três** sentidos — `contact_field_proposals`,
`crm_propose_contact_field`, `crm_propose_lead_field`, e a etapa de funil que qualquer nicho tem.
Renomear o vocabulário interno ("sugestão de campo" em vez de "proposta de campo") é barato, é da
base dele, e evita a confusão que gerou a §17 da spec. **Não é defeito, é clareza** — e por isso
não entra na ordem de execução.

---

## Living System Checklist — respondido para a entrega inteira (G13)

| # | Pergunta | Artefato concreto |
|---|---|---|
| 1 | Quem me alimenta? | `crm_pipelines.settings.fields` · `calendar_event_types` + `attendant_availability` · a fala do cliente |
| 2 | Quem eu alimento? | `crm_leads.custom_fields` → `LeadFieldsForm.tsx` · `calendar_appointments` → agenda · `cron_jobs` (`job_kind='followup_turn'`) → o retorno · `agent_inbox_items` → Central |
| 3 | Que registro eu emito? | `crm_lead_activities` (nomeia o **campo**, nunca o valor) · `api_audit_log` `mcp.tool_called` em toda tentativa, inclusive recusada · **`ai_agent_runs`, a partir da Tarefa 16** |
| 4 | Onde apareço na tela? | "Campos do funil" no card · agenda · linha do tempo no inbox · Central · o sino |
| 5 | Por qual porta se chega? | Configurações › Funis · Configurações › Agenda · tela do agente · card — todas já no `NAV_CATALOG` |
| 6 | Qual meu anti-morte? | A passagem para humano declara os **obrigatórios em branco**. A lacuna medida — a call pedida que não gerou próximo passo nenhum — é fechada pela Tarefa 4 (a falha vira visível) e pela Tarefa 8 (a promessa vira destino) |
| 7 | Onde se configura? | Configurações › Funis · Configurações › Agenda · tela do agente. **Se faltar:** sem funil marcado o bloco é vazio e o agente não promete nada (ramo `podeAnotar: false`, medido) |
| 8 | Qual a continuidade IA↔humano? | **IA→humano:** `obrigatorios_em_branco` no resumo de passagem; caso ou follow-up a partir da Tarefa 8. **Humano→IA:** campo preenchido à mão volta pelo `crm_get_lead`, e a regra 5 do bloco impede repetir a pergunta |
| 9 | Qual meu laço de retorno? | **Tarefa 17:** perguntas feitas × campos gravados, e pedidos de agendamento × compromissos criados, **por organização**, com queda sustentada virando aviso na Central. É o que faz o sistema denunciar a si mesmo em vez de esperar o dono reclamar |
| 10 | Atualizei o mapa? | `docs/architecture/agent-turn.workflow.json` ganha o nó da gravação (Tarefa 6) e o da marcação (Tarefa 4), com duas arestas cada |

---

## Auto-revisão do plano

**1. Cobertura da spec.** As onze peças, mapeadas: Peça 1 → T1–T3 · Peça 2 → T5 · Peça 3 → T6 ·
Peça 4 → T4 · Peça 5 → T14 · Peça 6 → T15 · Peça 7 → T7–T9 · Peça 8 → T10 · Peça 9 → T11–T13 ·
Peça 10 → T16 · Peça 11 → T17. Os passos 12–14 da ordem da spec → T18–T20. A §16.1 (renumerar) →
T0, movida para o início com a razão escrita. **Sem lacuna.**

**2. Varredura de marcador vago.** Nenhum "TBD", "adicionar tratamento de erro adequado" ou
"similar à tarefa N". Onde a spec usava palavra vaga ("impraticável", "deve ser"), o plano usa a
medição. Onde o plano não pôde decidir sem medir (T4 passo 1, T8 passo 1, T18), ele diz **o que
medir e o que fazer com cada resultado** — inclusive "não mude nada e escreva por quê".

**3. Consistência de tipos.** `NegocioDaConversa` (T6) usa `tipo: "um" | "nenhum" | "varios"` em
todas as ocorrências. `PromiseClassification.prometeuRetornoHumano` (T7) é lido em T7 passo 5 com o
mesmo nome. `ContagemDoLaco` (T17) nomeia os quatro campos uma vez só. `entrada.categoria` (T5) é
declarado opcional em todo lugar em que aparece.

**4. O que era erro meu e o que era detalhe de plano, separado sem inflar.** Dois defeitos na
spec, os dois pelo mesmo motivo — presença do símbolo em lugar de comportamento —, e os dois já
corrigidos **na própria spec**, no lugar onde apareciam: **D1** (o detector semântico não serve
como está) e **D2** (a tela de preferências não persiste nada). O resto — **P1** a **P4** — é o que
um plano acrescenta a uma spec: o tamanho da peça, o mecanismo, o número de linha e o custo real.
**Não é correção, e chamar de correção seria engordar a entrega.**

**5. O que este plano NÃO faz, dito em voz alta:**

- **Não cria o módulo de proposta comercial.** É a outra spec
  (`2026-09-16-proposta-comercial-design.md`), e ela depende desta: a tarefa que a Peça 7 cria é o
  gatilho do rascunho.
- **Não muda o valor de `max_steps`.** Mede (T15/T16) e decide depois (T18).
- **Não constrói a tabela de preferências de notificação.** Dívida declarada no D2.
- **Não mescla** `fix/criador-do-tenant-sai-quando-o-dono-assume`: o upstream já resolveu o mesmo
  problema, melhor (`provisional_until_handover`, cerca com 5 casos contra 1), e está no ar.
  **Descartar, não mesclar** — mesclar sobrescreveria a lógica dele e deixaria a coluna sem quem a
  leia.
- **Não dá escritor a `ai_invocations`.** A Tarefa 16 escreve em `ai_agent_runs`, que já tem as
  colunas. A tabela órfã da migration 0130 continua órfã, e isso fica registrado.
