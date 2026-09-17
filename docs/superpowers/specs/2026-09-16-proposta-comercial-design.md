# A proposta comercial — capacidade nova, medida antes de desenhada

> **Data:** 2026-09-16 · **Estado:** não existe nada disto no produto.
>
> Esta spec é a **Opção C** da §17 de
> [`2026-09-16-campos-do-funil-de-ponta-a-ponta-design.md`](./2026-09-16-campos-do-funil-de-ponta-a-ponta-design.md):
> o CRM passa a **fechar** a venda, não só conduzir até ela.
>
> **Capacidade nova, não conserto de defeito.** A Opção A daquela spec (a promessa vira tarefa de
> um humano) continua valendo e é pré-requisito: ela para o vazamento hoje; esta resolve a causa.
>
> **Âmbito:** qualquer segmento. Clínica manda orçamento de tratamento, imobiliária manda proposta
> de locação, agência manda escopo e preço, prestador manda orçamento de serviço. **Nada aqui é de
> web design.**
>
> Toda afirmação tem a medição ao lado. **Não há item pendente de medição.**

---

## 1. O que existe hoje — medido, peça por peça

Antes de desenhar, medi tudo que uma proposta precisaria usar. O resultado surpreende: **quase
tudo já está construído.**

| O que a proposta precisa | Existe? | Onde, medido |
|---|---|---|
| Gerar PDF | **Sim** | `@react-pdf/renderer` no `package.json`; precedente vivo em `lib/lgpd/pdf-renderer.tsx` |
| Guardar arquivo | **Sim** | Supabase Storage; buckets em uso: `whatsapp-media`, `lgpd-exports`, `ai-policy`, `skill-assets` |
| Mandar arquivo ao cliente | **Sim** | `lib/waha/media-send.ts` → endpoint `sendFile`; e a ferramenta `crm_send_whatsapp_message` aceita `media_url`, `media_mime` e `kind: "document"` |
| Catálogo de itens e preços | **Sim** | tabela `catalog_products` (`codigo, nome, descricao, preco_cents, moeda, custo_cents, ativo, imagem_url`), com tela `/app/products`, API, importação e ferramentas de IA (`crm_search_products`) |
| Valor no negócio | **Sim** | `crm_leads.value_cents` (bigint) + `currency` |
| Página pública com token | **Sim** | `app/team/accept-invite/[token]` — rota em `PUBLIC_PATHS`, token HMAC (`lib/auth/invite-token.ts`), com teto de tentativas contra varredura |
| Máquina de entrega com estado | **Sim** | `calendar_appointments.meeting_delivery` + `meeting_delivery_job_id` + `fn_meet_delivery_enqueue/current` — é a entrega do compromisso, nossa |
| Linha do tempo do negócio | **Sim** | `crm_lead_activities`, vocabulário ABERTO (sem CHECK) — tipo novo entra por constante compartilhada |
| Avisos ao operador | **Sim** | `agent_inbox_items` (o `kind` **tem** CHECK — vocabulário novo exige migration) |
| Anti-morte | **Sim** | motor de follow-up + Radar de Risco (`/app/radar`) |
| Marca da empresa no documento | **Sim** | `organizations.settings.branding` — **a da organização, nunca a da instalação** |
| Automação por evento | **Parcial** | gatilhos medidos: `event.to_stage_id`, `event.added_tags`, `lead.value_cents`, `lead.ghost`. **Não há** gatilho de proposta |

**O que NÃO existe, medido:**

```
tabelas de proposta/orçamento/quote no banco: NENHUMA
```

A tabela `orders` existe mas **não serve**: ela tem `external_id`, `external_provider` e
`customer_external_id` — é **espelho de pedido de e-commerce externo** (Nuvemshop), não um objeto
que o CRM cria. Zero linhas em produção, e nenhum caminho nativo que a escreva.

**Conclusão da medição:** falta **o objeto** e **o fluxo**. Toda a infraestrutura em volta já está
de pé e provada em produção.

---

## 2. O que a proposta é, e o que ela não é

**É:** um documento comercial que a organização emite para um contato, com itens, valores, prazo de
validade e condições — gerado no CRM, entregue pelo canal da conversa, e cujo **desfecho volta para
o funil**.

**Não é:**

- **não é a sugestão de campo** (`crm_propose_lead_field`) — aquilo é o agente pedindo para o CRM
  ganhar um campo de cadastro, e não chega ao cliente (§17 da spec principal);
- **não é a etapa "Proposta enviada"** — aquilo é um rótulo de coluna escrito pelo dono;
- **não é pedido/venda** — pagamento, estoque e entrega ficam fora. A proposta termina em
  **aceita / recusada / vencida**.

> **Vocabulário:** esta spec usa **"proposta"** para o documento comercial e **"sugestão de campo"**
> para o `crm_propose_lead_field`. A spec principal registra o renome no produto como PR pequeno —
> se ele entrar, esta spec fica sem ambiguidade nenhuma.

---

## 3. A decisão que governa o desenho: quem aperta enviar

A doutrina do Sistema Vivo, regra do tempo:

> *"Enviar mensagem a uma pessoa é irreversível e nunca é operação comum."*
> *"O sistema nunca deve ser mais rápido do que o humano consegue interromper."*

**Portanto: o agente NUNCA envia uma proposta.** Ele pode **rascunhar** — e rascunhar é onde ele é
bom, porque já tem o que a empresa quer saber. Quem envia é uma pessoa, sempre, com um clique
deliberado.

Isso não é cautela decorativa: uma proposta com preço errado disparada por um modelo é um prejuízo
que nenhuma mensagem de desculpa desfaz.

---

## 4. O fluxo, de ponta a ponta

```
[1] o agente conversa e preenche os campos do funil            ← spec principal, Peças 2/3
        │
[2] o cliente pede orçamento / o agente promete proposta
        │
[3] promessa vira TAREFA com dono e prazo                      ← spec principal, Peça 7 (Opção A)
        │
[4] RASCUNHO da proposta: itens do catálogo + campos do funil  ← ESTA SPEC
        │   (o agente pode preencher; a pessoa sempre revisa)
        │
[5] uma PESSOA revisa — à mão OU instruindo a IA ("baixa 10%") ← ESTA SPEC, §6
        │   e só ela clica "Enviar ao cliente"                       gate humano
        │
        │
[6] PDF gerado, guardado, enviado pelo canal da conversa       ← ESTA SPEC
        │
[7] a etapa "Proposta enviada" agora tem EVIDÊNCIA             ← destrava a Peça 8
        │
[8] sem resposta em N dias → follow-up + Radar de Risco        ← anti-morte
        │
[9] aceita / recusada / vencida → volta ao funil e à métrica   ← laço de retorno
```

**O elo [1] é o que amarra as duas specs:** os campos que a empresa declarou (segmento, tipo de
projeto, prazo, convênio, bairro, o que for do nicho) são **o insumo do rascunho**. Sem a spec
principal funcionando, o rascunho nasce vazio.

---

## 5. O objeto — modelagem sob a doutrina DIRC

### 5.1 `crm_proposals`

Antes de criar, a doutrina manda perguntar: **D**uplicar, **I**ntegrar, **R**eferenciar, **C**alcular.

| Campo | Decisão DIRC |
|---|---|
| `organization_id` | obrigatório, `on delete cascade`, RLS `tenant_isolation_crm_proposals_all` — não negociável |
| `lead_id` | **Referenciar** — a proposta é de um negócio |
| `contact_id` | **Referenciar** — quem recebe; redundante com o lead de propósito, porque contato pode trocar de negócio |
| `conversation_id` | **Referenciar**, nullable — por onde foi entregue |
| `status` | `text` + CHECK: `rascunho`, `enviada`, `aceita`, `recusada`, `vencida`, `cancelada`, `substituida` |
| `total_cents`, `currency` | **Calcular** dos itens na escrita, guardado — o documento enviado não pode mudar de valor porque um preço do catálogo mudou depois |
| `valid_until` | `date` — validade; vencer é o que gera o aviso |
| `titulo`, `condicoes` | texto livre da organização |
| `pdf_path` | caminho no bucket, preenchido no envio |
| `sent_at`, `sent_by_user_id` | **quem apertou enviar**, sempre uma pessoa |
| `decided_at`, `decided_by` | quando e por quem (pessoa da equipe, ou o próprio cliente pelo link) |
| `numero`, `ano` | **Decidido:** numeração sequencial por organização. `unique (organization_id, ano, numero)` |
| `versao` | `int not null default 1` — **Decidido:** proposta tem versões |
| `substitui_id` | auto-FK nullable — a versão anterior da mesma oferta |
| `drafted_by_agent_id` | nullable — se o rascunho veio da IA, fica registrado |

**Não duplicamos** nome, e-mail nem telefone do contato: vêm por FK na hora de gerar o PDF. **Não
duplicamos** o preço do catálogo — ele é **copiado para o item** no momento do rascunho, que é
coisa diferente: o item guarda o preço **daquela** proposta.

### 5.2 `crm_proposal_items`

| Campo | Nota |
|---|---|
| `proposal_id` | `on delete cascade` |
| `product_id` | **nullable** — item pode ser do catálogo **ou** escrito à mão. Uma clínica que não usa catálogo tem de conseguir montar a proposta mesmo assim |
| `descricao`, `quantidade`, `preco_unitario_cents`, `desconto_cents` | o preço é **cópia**, não referência: proposta enviada é um valor congelado |
| `position` | `numeric` (fractional indexing, `midpoint()`) — **nunca `int`** |

### 5.3 A numeração — e por que ela nasce no ENVIO

**Decidido pelo dono em 2026-09-16: proposta é numerada por organização.**

O número é atribuído **quando a proposta é enviada**, nunca ao criar o rascunho. Rascunho
descartado queimaria número e deixaria buraco na sequência — e sequência com buraco lê como
documento perdido para quem audita. Documento existe quando sai.

| Regra | Decisão |
|---|---|
| chave | `unique (organization_id, ano, numero)` — cada organização tem a **sua** sequência |
| ano | a sequência **reinicia a cada ano**: "Proposta 0042/2026" |
| duas pessoas enviando ao mesmo tempo | alocação na **mesma transação** do envio, com captura de `23505` e nova tentativa — é o padrão de idempotência que o repositório já usa para mensagem e para POST com `Idempotency-Key` |
| versões | **herdam o número da v1**, nunca pegam um novo (ver 5.4) |

### 5.4 As versões — e qual delas vale

**Decidido pelo dono em 2026-09-16: a proposta tem versões.** A medição que sustenta: o funil dele
tem **"Negociando" depois de "Proposta enviada"** — revisão de preço acontece, e é ali que acontece.

| Regra | Decisão |
|---|---|
| revisar uma proposta **enviada** | cria a **v2**, com `substitui_id` apontando para a v1 |
| a v1 | vira `substituida` — **não some**, e continua legível: é o que foi oferecido antes |
| o número | **o mesmo da v1**: "Proposta 0042/2026 — v2". A conversa com o cliente é sobre *a 0042*, não sobre dois documentos |
| qual vale | a **última não cancelada** da cadeia; a tela diz isso em uma linha, sem a pessoa ter que deduzir |
| revisar um **rascunho** | **não** cria versão — rascunho é rascunho, edita-se à vontade (§6) |
| aceite | recai sobre a versão aceita; as anteriores ficam `substituida` para sempre |

**O que isto impede, e é o motivo de existir:** numa discussão de preço, alguém abrir a proposta e
não conseguir dizer o que foi oferecido duas semanas atrás. Com substituição registrada, o
histórico é o argumento.

### 5.5 O que NÃO entra

- **Sem tabela de modelo/template.** O primeiro corte usa o layout único do PDF com a marca da
  organização. Modelo por organização é onda seguinte, e sem demanda medida não entra.
- **Sem assinatura eletrônica.** Aceite é declaração registrada, não assinatura com valor jurídico.
  Dizer o contrário seria prometer o que não entregamos.
- **Sem pagamento.** A proposta termina em aceita; cobrar é outro produto.

---

## 6. A revisão: editor à mão **e** assistente por instrução

Pedido do dono: em vez de só um editor, um campo onde a pessoa **fala com a IA** — *"baixa 10%"*,
*"muda a validade para 30 dias"*, *"tira a hospedagem"* — e ela faz o ajuste.

**As duas coisas entram, e nesta ordem.** Assistente sem editor é armadilha: quando ele erra, não
há como consertar.

### 6.1 O precedente já existe no produto, e está vivo

Medi `ai_reply_drafts` — o rascunho de resposta do modo assistido:

| coluna | o que guarda |
|---|---|
| `original_body` | o que a IA escreveu |
| `edited_body` | o que a pessoa mudou |
| `approved_body` | o que foi aprovado |
| `revision` | a versão que a pessoa leu ao agir |
| `feedback` | **texto que a pessoa escreve para a IA** |
| `status` | `generating` / `pending` / `approved` / `stale` |

A ação passa por `fn_reply_action(p_org, p_id, p_revision, p_action, p_body, p_feedback)`, e a
rota exige a **`revision` lida** — concorrência otimista, para duas pessoas não se
sobrescreverem. O vencimento é detectado por `fn_reply_context_current`: se o contexto andou, o
rascunho vira `stale` em vez de ser aprovado velho.

**Em produção: 1 rascunho, com feedback escrito e corpo editado.** O padrão não é teórico — já
rodou.

**A proposta reusa esse contrato inteiro.** O que muda é o objeto: lá é texto, aqui são números.

### 6.2 O assistente devolve MUDANÇAS, nunca uma proposta reescrita

Esta é a diferença que importa entre o rascunho de resposta e o de proposta.

Um texto reescrito, a pessoa relê inteiro antes de aprovar — o erro aparece. **Uma proposta tem
números**, e ninguém confere doze itens linha a linha. Uma reescrita cega pode mexer num preço que
ninguém pediu para mexer, e passar.

Então o assistente devolve uma **lista de mudanças**, e a pessoa vê antes/depois:

```
instrução: "baixa 10% e tira a hospedagem"

  item "Site institucional"      R$ 8.000,00  →  R$ 7.200,00
  item "Hospedagem anual"        R$ 1.200,00  →  REMOVIDO
  total                          R$ 9.200,00  →  R$ 7.200,00
  validade                       (sem mudança)

                                        [ Aplicar ]   [ Descartar ]
```

**Nada é aplicado sem o clique.** Aplicar incrementa a `revision`, e cada mudança aplicada vira
linha na atividade do negócio — quem pediu, o que mudou, de quanto para quanto.

Se a instrução for ambígua ou fora do alcance (*"manda para o financeiro"*), o assistente responde
dizendo o que não fez, e **não inventa mudança**.

### 6.3 O portão humano não se move

O assistente edita **rascunho**, e rascunho é reversível — por isso ele pode agir sem cerimônia.
**Enviar continua sendo clique de pessoa** (§3), porque enviar é o que não tem volta.

### 6.4 Orçamento e ausência, com superfície

O assistente consome tokens: respeita `ai_budgets` da organização e o teto da versão do agente
(medido em produção: `token_budget = 50000`, `cost_budget_cents = 50`).

**Sem orçamento, ou sem agente publicado, o campo aparece desabilitado com o motivo escrito** — o
editor manual continua funcionando. Um recurso de IA que some em silêncio é falha sem culpado, e é
o invariante 6 da doutrina.

### 6.5 Rascunho vencido

Se o negócio andou enquanto a proposta estava em rascunho — preço de catálogo mudou, etapa mudou,
campo do funil foi preenchido — o rascunho vira **`stale`**, exatamente como o de resposta. A
pessoa vê o que mudou e decide: reaproveitar ou recomeçar. **Proposta não sai com preço de ontem
sem alguém saber.**

---

## 7. A entrega — reusando o que já está provado

| Etapa | Reusa | Medido em |
|---|---|---|
| Gerar o PDF | `@react-pdf/renderer` | `lib/lgpd/pdf-renderer.tsx` |
| Guardar | bucket novo `propostas`, privado, URL assinada | mesmo padrão de `lgpd-exports` |
| Enviar | `sendFile` com `media_url` + `media_mime: application/pdf` | `lib/waha/media-send.ts` |
| Registrar | linha `outbound` em `messages`, `kind: document` | ferramenta `crm_send_whatsapp_message` já aceita |
| Estado da entrega | coluna de estado + job, como a do compromisso | `calendar_appointments.meeting_delivery` |

**A marca é a da ORGANIZAÇÃO** (`organizations.settings.branding`), nunca a da instalação. Uma
proposta é documento comercial **da empresa cliente** — pôr ali a marca de quem revende o software
seria o mesmo erro que a doutrina já proíbe no PDF de LGPD, ao contrário: lá o revendedor não pode
aparecer porque não é o controlador; aqui não pode aparecer porque não é quem vende.

**Anti-banimento:** o envio entra na mesma fila com throttle e janela horária de toda mensagem
(`1 msg/1.2s + jitter`, janela por canal). Proposta não fura fila.

---

## 8. O aceite — duas ondas, e a primeira não abre superfície pública

**Onda 1 — aceite registrado por uma pessoa.** O cliente responde no WhatsApp ("fechado", "pode
tocar"); quem atende marca **Aceita** ou **Recusada** no card. Zero superfície pública nova, zero
risco, e cobre o caso real de hoje.

**Onda 2 — link público assinado.** O PDF leva um link; o cliente abre e clica **Aceito** ou
**Não tenho interesse**. Reusa exatamente o precedente medido do convite de equipe:

- rota pública declarada em `PUBLIC_PATHS`;
- token **HMAC** (`lib/auth/invite-token.ts`), com validade própria;
- **teto de tentativas** aplicado **antes** de qualquer ramificação, para que varrer o espaço de
  tokens não saia de graça nem revele token válido pelo tempo de resposta — a mesma armadilha que a
  rota de convite já resolveu e documentou;
- a página **não mostra dado de outro negócio** e não permite nada além de decidir.

**Onda 2 não entra na primeira entrega.** Superfície pública é onde vaza tenant, e vazamento de
tenant é o fim do produto. Ela entra quando a Onda 1 estiver rodando e medida.

---

## 9. O laço de retorno — invariante 7

A pergunta que a doutrina manda fazer: **quando o sistema erra, o que muda nele?**

| Sinal | Origem | O que muda |
|---|---|---|
| proposta **vencida** sem decisão | `valid_until < hoje` e `status = 'enviada'` | aviso na Central + entra no Radar de Risco |
| proposta **recusada** | decisão registrada | motivo entra na linha do tempo e no resumo de passagem; alimenta o que a IA sabe sobre objeções |
| **taxa de aceite por etapa/segmento** | `crm_proposals` + `crm_leads.custom_fields` | queda sustentada vira aviso — é o mesmo mecanismo da Peça 11 da spec principal |
| **proposta prometida e não criada** | promessa (Peça 7) sem proposta em N dias | aviso na Central: *"você prometeu uma proposta e ela não saiu"* |

A última é a que fecha o buraco que originou tudo isto.

---

## 10. Living System Checklist

| # | Pergunta | Resposta — artefato concreto |
|---|---|---|
| 1 | Quem me alimenta? | `crm_leads` (o negócio) · `crm_leads.custom_fields` (o que o agente coletou) · `catalog_products` (itens e preços) · `contacts` (para quem) |
| 2 | Quem eu alimento? | `messages` (o PDF entregue) · `crm_lead_activities` (timeline) · o **estágio** do funil, agora com evidência (Peça 8) · `crm_leads.value_cents` · Radar de Risco · Central de avisos |
| 3 | Que registro eu emito? | `crm_lead_activities` tipos novos `proposal_drafted`, `proposal_sent`, `proposal_accepted`, `proposal_declined`, `proposal_expired` (vocabulário ABERTO — constante compartilhada, sem CHECK, conforme a doutrina) · `api_audit_log` em toda mutação |
| 4 | Onde apareço na tela? | Aba **Propostas** no card do negócio · lista `/app/proposals` · linha do tempo no inbox · Central de avisos |
| 5 | Por qual porta se chega? | `NAV_CATALOG`: grupo **`crm`**, seção **"Fechar a venda"** — vizinha de `/app/products` ("Preparar a venda", grupo `crm`), que é o precedente medido |
| 6 | Qual meu anti-morte? | Proposta enviada sem decisão agenda follow-up; ao vencer, vira aviso e entra no Radar. **Nenhuma proposta morre em silêncio** |
| 7 | Onde se configura? | **Configurações › Propostas**: ligar a capacidade (nasce desligada), validade padrão (15 dias), condições padrão. **Na versão do agente:** a chave do rascunho automático, ao lado de `lead_fields_enabled`. **Se faltar:** sem catálogo a proposta aceita item à mão; sem orçamento de IA o assistente desabilita com o motivo e o editor manual segue — nunca trava, nunca some calado |
| 8 | Qual a continuidade IA↔humano? | **IA→humano:** o rascunho chega pronto com o que ela apurou, e a tarefa nomeia o que falta. **Humano→IA, em duas vias:** (a) a instrução de ajuste no editor (§6.2) — a pessoa fala e a IA mexe, com a mudança visível antes de aplicar; (b) aceite/recusa e o motivo voltam ao contexto, e a IA para de oferecer o que já foi recusado |
| 9 | Qual meu laço de retorno? | §8 — quatro sinais, sendo "prometida e não criada" o que fecha o defeito de origem |
| 10 | Atualizei o mapa? | `docs/architecture/*.json` ganha o nó `proposta` com arestas para lead, catálogo, mensagens e funil |

---

## 11. Migrations e distribuição

Regra do repositório, sem exceção: **arquivo em `supabase/migrations/` + apêndice idempotente no
`baseline.sql` + linha no `MANIFEST.md`.** Os três no mesmo commit — o hook do contribuidor reprova
se faltar um.

| Objeto | Cuidado |
|---|---|
| `crm_proposals`, `crm_proposal_items` | `create table if not exists`; RLS + policy `tenant_isolation_*_all` via `fn_user_org_ids()`; teste de isolamento entre 2 organizações é obrigatório no CI |
| `agent_inbox_items.kind` | **tem CHECK** — os `kind` novos exigem dedupe/correção **antes** de recriar a constraint, senão o `update.sh` do clone quebra |
| `crm_lead_activities.type` | vocabulário **aberto**, sem CHECK — entra só como constante em TypeScript, e **fora** do invariante `vocabulario-banco-x-typescript` |
| bucket `propostas` | criado idempotente, **privado**; URL assinada, nunca pública |
| numeração | o próximo `NNNN` sai de `ls supabase/migrations/ \| grep -oE '_[0-9]{4}_' \| tr -d _ \| sort -n \| tail -1`, **nunca** do último arquivo da listagem |

**Nada exige que o operador da VPS edite `.env`, compose ou arquivo à mão.** Se exigir, não entra.

---

## 12. Ordem de execução

| Onda | O que entrega | Prova |
|---|---|---|
| **0** | As duas tabelas + RLS + isolamento entre organizações + **numeração** e **versão** na modelagem | `pnpm test:db` com 2 tenants; teste de **duas propostas enviadas ao mesmo tempo** não repetirem número |
| **1** | **Editor manual**: criar rascunho, editar itens (catálogo **e** à mão), total calculado, `revision` | e2e: monta proposta em banco fresco, **sem catálogo nenhum** |
| **1b** | **Assistente por instrução** + **rascunho automático da IA** (chave nova na versão do agente, ligada dentro de quem usa Propostas) | e2e: "baixa 10%" muda só o que foi pedido; instrução ambígua **não** inventa mudança; sem orçamento o campo desabilita com o motivo; desligar a chave para de rascunhar |
| **2** | PDF com a marca da **organização**, guardado no bucket privado | prova visual do PDF + conferência de que a marca da instalação **não** aparece |
| **3** | Envio por `manager`/`admin` + **alocação do número na mesma transação** + `value_cents` do negócio | e2e pela tela + receiver real; número não pula nem repete; **`agent` recebe 403 ao tentar enviar**; a timeline mostra a mudança de valor |
| **4** | Aceite/recusa por pessoa + etapa com **evidência** (destrava a Peça 8) + **revisão cria v2** e a v1 vira `substituida` | e2e: etapa não avança sem proposta enviada; a v1 continua legível e a tela diz qual vale |
| **5** | Anti-morte: follow-up, vencimento, avisos | teste do cron + aviso na Central |
| **6** | Laço de retorno: taxa de aceite e "prometida e não criada" | reverter a Peça 7 faz o aviso aparecer sozinho |
| **7** *(depois, se houver demanda)* | Link público de aceite | teto de tentativas + prova de que não vaza outro tenant |

Cada onda: teste vermelho → implementação → verde → **sabotagem** → commit.

---

## 13. As decisões tomadas

**Decidido aqui, com medição:**

- a proposta é objeto novo — `orders` não serve (é espelho de e-commerce externo);
- o agente **rascunha** e **nunca envia** — doutrina do tempo;
- item do catálogo **ou** escrito à mão — senão o produto só serve a quem cadastrou catálogo;
- preço **copiado** para o item, não referenciado — proposta enviada não muda de valor;
- marca da **organização**, nunca da instalação;
- link público fica para a última onda — superfície pública é onde vaza tenant;
- **o assistente devolve MUDANÇAS, não uma proposta reescrita** — texto a pessoa relê inteiro,
  doze números ela não confere linha a linha (§6.2);
- **editor manual vem antes do assistente** — assistente sem editor é armadilha: quando ele erra,
  não há como consertar.

**Decidido pelo dono em 2026-09-16, e já refletido na modelagem:**

| Pergunta | Decisão | Onde entrou |
|---|---|---|
| Numeração sequencial por organização? | **Sim** — "Proposta 0042/2026", reiniciando por ano | §5.1 e §5.3 |
| Uma proposta por negócio, ou versões? | **Versões** — v2 substitui a v1, que fica legível | §5.1 e §5.4 |
| Vai para o Rafael? | **Construir, testar, validar e mandar PR** | §14 |

---

## 14. Marketplace e plugins — o que existe no repositório dele, medido

O dono perguntou se a promessa de "marketplace e extensões" já tem código, para desenharmos nossas
adições como plugin. **Tem código, está construído — e não é o que parece.**

### 14.1 O que existe, medido na `main` dele

| Peça | Estado |
|---|---|
| `supabase/migrations/…_0068_skills_marketplace.sql` | **existe** — `manifest` na versão da skill, `forked_from_version_id`, tabela `skill_activations`, bucket de assets, e **policy de catálogo**: qualquer usuário autenticado LÊ as skills de plataforma (`organization_id null`) |
| `…_0069_seed_platform_skills.sql` | **existe** — catálogo de fábrica semeado: `objecao-preco` e `agendamento` |
| Tela do marketplace `app/app/ai/skills` | **existe** (`page.tsx` + `_client.tsx`) |
| Importar `.zip` — `POST /api/v1/ai/skills/import` | **existe** |
| Telemetria de ativação | **existe** — e em produção há **1 ativação**, de hoje |

**Na sua instalação:** 2 skills instaladas (`objecao-preco`, `agendamento`) + 1 versão própria
(`coleta-briefing`) que já foi desinstalada (está em `skill_versions`, fora de `skill_pointers`).

### 14.2 O que o marketplace dele É — e o que ele NÃO é

A spec que o define (`docs/superpowers/specs/2026-07-23-harness-evolution-design.md`, Fase 2)
descreve o pacote: **`SKILL.md` + `references/*.md` + `assets/*`**, e diz textualmente:

> **"Sem executáveis."**

Uma skill é `name`, `description`, **`body`** (instrução) e **`matcher`** (quando ativa). Medido no
schema: `skill_versions(id, organization_id, name, description, body, matcher, manifest,
forked_from_version_id)`.

**É um marketplace de PLAYBOOK, não de código.** Ele estende o que o agente *sabe e diz* — não o
que o sistema *faz*. Não carrega tabela, tela, rota, ferramenta nem migration.

### 14.3 Conclusão: nossas adições não cabem como skill

Nem os campos do funil, nem a proposta comercial. As duas precisam de tabela, tela, rota e
ferramenta — **exatamente o que um pacote "sem executáveis" não pode levar**.

Tentar empurrá-las para lá não modularizaria nada: viraria instrução pedindo ao agente para usar
uma capacidade que a instalação não tem — que é o defeito D3 desta mesma investigação, em escala.

### 14.4 O que É modular neste código hoje, e é onde nos encaixamos

Medi os três eixos de modularização que o produto **já** usa:

| Eixo | Medido na `main` dele |
|---|---|
| **Capacidade por versão do agente** | `handoff_tool_enabled`, `cases_enabled`, `operator_enabled` — chave booleana com tela |
| **Pacotes de ferramentas** | `atender`, `escalar`, `evoluir`, `organizar`, `reter`, `vender` — declarados no catálogo de tools |
| **Grupos de navegação** | `analise`, `atendimento`, `canais`, `crm`, `ia`, `organizacao` |

**É assim que uma feature se comporta como módulo neste código hoje**, e é assim que esta spec já
está desenhada:

- a capacidade **"Propostas" nasce desligada por organização** (§14 do plano de PR);
- as ferramentas novas entram no catálogo com `pacotes: ["vender"]`, ao lado de `crm_update_lead`;
- a tela entra no `NAV_CATALOG`, grupo `crm`, seção "Fechar a venda".

**Nenhum trabalho extra é preciso para "ficar pronto para plugin".** Se ele um dia construir
extração de módulos de código, uma feature com chave própria, pacote de ferramentas declarado e
porta de navegação declarada é exatamente a que sai inteira. Uma feature sem esses três é a que não
sai nunca.

### 14.5 O marketplace de PLUGIN DE CÓDIGO — o que foi anunciado, e o que existe

A pergunta do dono não era sobre o marketplace de skills: é sobre o que o Rafael anunciou em
vídeo — **terceiros desenvolvem plugins, publicam num marketplace, e a instalação instala** —
porque ele não dá conta da fila de PR da comunidade.

**Medido: não existe uma linha de código nesse sentido.**

| O que procurei | Resultado |
|---|---|
| diretório `plugins/`, `extensions/`, `addons/`, `apps/` | **não existe** |
| carregamento dinâmico de módulo de terceiro (`await import(...)`) | **não existe** |
| tabela de instalação de plugin no banco | **não existe** |
| branch remota com o tema | **nenhuma** |
| issue ou discussion sobre plugin/marketplace de código | **nenhuma** |
| commit nos últimos 30 dias sobre o tema | **nenhum** |

**O problema que ele descreveu, porém, é real e medido:** **69 PRs abertos**, o mais antigo de
10/09 — e concentrados: 21 de um contribuidor, 14 de outro, 2 dele.

### 14.6 O que já é superfície de extensão hoje

| Superfície | Medido |
|---|---|
| **MCP** | **61 ferramentas** `crm_*` — o CRM inteiro exposto. Terceiros já constroem **por fora**, sem tocar no código |
| **API REST** `/api/v1/` | bearer token server-to-server |
| **Automações** | ação `call-webhook` — extensão sem código nenhum |
| **Skills** | extensão de prompt (§14.2) |
| **Registro de ações** | `registerAction(executor)` / `getAction(type)` em `lib/automation/actions/` — módulos se cadastram sozinhos, listados em `register-all.ts`. **É a única costura do código que já tem forma de ponto de extensão** — mas é em tempo de compilação, não carrega código de terceiro |

### 14.7 Conclusão: não dá para "deixar pré-pronto", e não precisa

**Não existe formato de plugin para o qual se preparar.** Escolher um agora é apostar num desenho
que ninguém publicou — e apostar errado custa mais que não apostar.

**O que de fato protege o nosso trabalho é o que esta spec já faz**, e são os mesmos três eixos que
o código dele já usa (§14.4): chave de capacidade própria, ferramentas declaradas em pacote, porta
declarada na navegação — mais a tripla de migration. Uma feature assim é a que **sai inteira** de
qualquer refatoração de módulos; uma sem isso é a que não sai nunca.

**E há uma leitura oportuna:** ele está afogado em PR. A contribuição que um mantenedor nessa
situação aceita mais rápido é a que **reduz o trabalho dele** — conserto pequeno, isolado, com
teste e sabotagem relatada. É exatamente a forma dos nossos oito PRs (§15).

**O que eu recomendo, e não é adivinhar:** abrir uma **discussion** no repositório perguntando o
formato pretendido do plugin, antes de ele construir. Se ele responder, desenhamos com base; se não
responder, seguimos com os três eixos atuais — que é o que faríamos de qualquer jeito.

### 14.8 O que pode virar skill, e vale a pena

O que **não** é código: **os playbooks por nicho**. O jeito de perguntar os campos do funil de uma
clínica, de uma imobiliária, de uma agência — isso é `body` + `matcher`, cabe no pacote dele, e é
contribuição de baixo atrito para o catálogo de fábrica (que hoje tem **duas** skills).

**Fica registrado como oportunidade, não como tarefa desta spec.**

---

## 15. O caminho até o Rafael

O dono escolheu **construir e mandar o PR pronto**, e não abrir issue antes. A decisão é dele e
está tomada; registro aqui o risco uma vez, sem repetir depois: **recurso grande sem alinhamento
prévio é o que mais fica parado em review** — não por recusa, por discussão de escopo.

**O que reduz esse risco, e entra no plano:**

1. **Um PR por onda, não um PR gigante.** A Onda 0 (tabelas + RLS + isolamento entre organizações)
   é pequena, autocontida e fácil de aprovar; ela abre caminho para as seguintes. Um PR de 4 mil
   linhas com tela, PDF, envio e IA junto é o que ninguém revisa.
2. **Desligado por padrão.** Nenhuma organização ganha comportamento novo ao atualizar — o mesmo
   critério que o PR de "Clientes pela agenda" dele usou e que foi aceito (medido no CHANGELOG
   1.28.0: *"Atualizar não muda nada em organização nenhuma até alguém ligar a regra"*).
3. **Cada PR com o ritual dele:** teste vermelho sem o conserto, **sabotagem** feita e relatada,
   fragmento em `.changes/`, tripla de migration (arquivo + apêndice no `baseline.sql` + linha no
   `MANIFEST.md`), e o bloco "o que NÃO medi".
4. **Prova em tela em banco fresco**, com os envs opcionais ausentes — é a doutrina de QA Visual
   dele, e proposta é fluxo de usuário do começo ao fim.

**A ordem de envio é a das ondas (§12)**, e o primeiro PR só sai depois de a Onda 0 estar verde no
CI do nosso fork.

---

## 16. As decisões de comportamento — todas tomadas

Decididas pelo dono em 2026-09-16. **Não há item em aberto nesta spec.**

| # | Decisão | O que muda no código |
|---|---|---|
| 1 | **Validade padrão: 15 dias** | `valid_until = hoje + 15` ao criar; knob em Configurações › Propostas. É o prazo que dispara o vencimento e o follow-up — chega enquanto a conversa ainda está morna |
| 2 | **Enviar exige `manager` ou `admin`** | `requireRole("manager")` na rota de envio. Quem atende (`agent`) **monta e deixa pronta**; quem tem autoridade comercial envia. Consistente com o sistema: conversar é `agent`, decidir é `manager` |
| 3 | **O agente rascunha sozinho**, com chave para desligar | chave nova na versão do agente, no mesmo padrão de `lead_fields_enabled`, com porta na tela (senão é knob sem superfície — invariante 6) |
| 4 | **Enviar atualiza o valor do negócio** | `crm_leads.value_cents` recebe o total da proposta, e a mudança vira linha na timeline (de quanto para quanto) |
| 5 | **Moeda** — *fechado por medição, não foi pergunta* | `lib/catalogo/moeda-da-org.ts` já resolve: a declarada pela organização, com padrão de fallback |
| 6 | **Imagem do item no PDF** — *fechado por medição* | entra quando o item tiver `imagem_url`; o layout fecha sem buraco quando não tiver, senão quem vende serviço vê caixa vazia |

### 15.1 A contradição que a decisão 3 cria, e como ela se resolve

A §14 diz que o PR para o Rafael entra **desligado por padrão**. A decisão 3 diz que o rascunho da
IA **nasce ligado**. As duas são verdade em níveis diferentes, e a regra é:

| nível | padrão | por quê |
|---|---|---|
| **a capacidade "Propostas"** | **desligada** por organização | atualizar não muda nada em instalação nenhuma — é o critério que o PR "Clientes pela agenda" dele usou e foi aceito |
| **o rascunho da IA, dentro de quem ligou Propostas** | **ligado** | quem ligou Propostas quer proposta; obrigar a achar uma segunda chave é o jeito de o recurso morrer desligado |

Sem essa separação, a decisão 3 quebraria a promessa da §14 — e é o tipo de furo que só aparece
depois do merge.

### 15.2 O valor do negócio: as três bordas

A decisão 4 precisa responder o que acontece fora do caminho feliz. Decidido:

| situação | o que acontece com `value_cents` |
|---|---|
| a **v2** é enviada com outro total | passa a valer o total da v2 — o funil reflete a oferta em pé |
| a proposta é **recusada** ou **vence** | **fica como está**. Negócio perdido guarda quanto valia; zerar apagaria o histórico de quanto se deixou na mesa |
| alguém **corrige à mão** depois | a correção manual vence, e fica na timeline como qualquer edição. O sistema propõe, a pessoa decide |
| a proposta é **cancelada** antes de enviar | nada acontece — rascunho nunca tocou o funil |

