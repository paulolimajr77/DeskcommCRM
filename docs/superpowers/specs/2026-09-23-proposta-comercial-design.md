# A proposta comercial — spec única, medida contra o código em vigor

> **Data:** 2026-09-23 · **Estado:** no ar no fork (`vps/pljr-combinada`) e na VPS (1.43.1), com
> defeitos medidos no código **e no banco de produção** (§9); a onda de modelos está desenhada e não
> implementada.
>
> **Esta spec substitui duas:**
> [`2026-09-16-proposta-comercial-design.md`](./2026-09-16-proposta-comercial-design.md) (a
> spec-mãe) e [`2026-09-21-proposta-comercial-templates-design.md`](./2026-09-21-proposta-comercial-templates-design.md)
> (a onda de modelos). As duas ficam como histórico das decisões; **quando discordarem desta, vale
> esta.** O raciocínio que não mudou (por que a proposta é objeto novo, por que o agente nunca envia,
> por que o preço é copiado para o item, marketplace) continua lá e não é repetido aqui.
>
> **Por que unificar:** a spec-mãe dizia "não existe nada disto no produto" quando quase tudo já
> existia; a de modelos se apoiava nela em três seções e mudava decisões dela sem apontar onde. O
> trabalho que vem agora — consertar a base antes de construir os modelos — caía no vão entre as duas.
>
> **Âmbito:** fork-local. A migration `0389_proposta_comercial` **não existe na `main` do Rafael**
> (medido: `git grep -c crm_proposals origin/main -- supabase/baseline.sql` → 0). Sem PR até validar
> em operação (decisão do dono, 21/09); quando validar, o caminho segue a §15 da spec-mãe.
>
> **Ordem de prioridade (decisão do dono, 23/09):** primeiro o que **está no ar com erro**, depois o
> que a spec-mãe **prometeu e não entregou**, e só então a onda de modelos.
>
> Toda afirmação tem a medição ao lado. Esta spec não contém código: descreve o que muda e como se
> prova.

---

## 0. Decisões do dono em 2026-09-23

| Pergunta | Decisão | Medição que sustenta |
|---|---|---|
| Proposta é núcleo ou módulo (ADR-0002)? | **Consertar já com as tabelas no baseline; virar módulo depois**, junto com o financeiro | O financeiro — o módulo opcional que a ADR planejou como primeiro — entrou na `main` com tabelas no baseline (PRs #796, #807, #808, #812, #813, #819, 19–21/09); a conversão dele ficou na issue #1338, "não é condição de merge". A peça central ainda está aberta (issue #1114), nenhum módulo usa o mecanismo, e não existem a tela de instalação nem o comportamento sem tabelas (`docs/specs/modulo-instalado-onda-2.md`, "onda 3") |
| Modelos-base no banco ou no código? Tipos com lista fechada? | **Em aberto** — só afetam a onda de modelos (M), não os consertos | — |

Consequência: D1 fica no nível da **organização** (a chave por empresa), como está desenhado abaixo. A
conversão para módulo entra como etapa futura (§7, onda **MOD**), depois de a issue #1114 fechar.

---

## 1. O que está no ar — medido peça por peça

| Peça | Estado | Onde, medido |
|---|---|---|
| Tabelas `crm_proposals`, `crm_proposal_items`, RLS por organização | ✅ | `supabase/migrations/20260919232000_0389_proposta_comercial.sql`; policies `crm_proposals_select/_write` via `fn_user_org_ids()` |
| Numeração por organização/ano, só no envio | ❌ **já repetiu número em produção** (D9) e marca enviada antes de sair (D3) | `lib/propostas/numeracao.ts`; índice único parcial `crm_proposals_numero_ano_org_uidx` (exclui `substituida`) |
| Versão v2 herdando o número | ⚠️ inalcançável pela tela (D4) | `lib/propostas/versao.ts` + ramo `nova_versao` em `app/api/v1/proposals/[id]/send/route.ts` |
| Editor manual (catálogo ou item à mão) | ✅ | `app/app/proposals/[id]/_client.tsx`; `PATCH /api/v1/proposals/[id]` só em `rascunho`, com `revision` |
| Assistente por instrução (lista de mudanças → aplicar) | ✅ | `lib/propostas/assistente.ts`, `/assistant` e `/assistant/apply`, `AssistantPanel.tsx` |
| Rascunho automático da IA | ✅ com defeito (D2, D5) | ferramenta `crm_draft_proposal` (`lib/mcp/tools/propostas.ts`); chave `ai_agent_versions.proposal_ai_draft_enabled` (migration 0346, padrão ligado) |
| PDF | ⚠️ parcial (D6) | `lib/propostas/pdf.tsx`: título, número, destinatário, itens, total, validade, condições |
| Envio só `manager`/`admin`, pelo canal da conversa, com throttle e janela | ✅ | `requireRole("manager")`; `adiarAteAJanelaAbrir`, `checkDailyLimit`, `espacarEnvio` antes de alocar número |
| Envio atualiza `crm_leads.value_cents` + linha na timeline | ✅ | atividades `proposal_sent` e `proposal_value_changed` |
| Aceite/recusa por pessoa | ✅ | `POST /api/v1/proposals/[id]/decide` (`agent`+), só sobre `enviada`; `value_cents` não muda (§15.2 da mãe) |
| Vencimento diário → `vencida` + aviso na Central | ✅ | cron `proposal-expiry` (08:00, `docker/scheduler/entrypoint.sh:115`), kind `proposal_expired_notice` |
| Laço: taxa de aceite e "prometida e não criada" | ✅ | crons `proposal-acceptance-rate` (dom 06:00) e `proposal-promised-not-created` (08:30) |
| Configurações › Propostas (ligar, validade, condições) | ⚠️ duas das três chaves são mortas (D1, D7) | `app/api/v1/settings/proposals/route.ts`; semente na migration 0313 |
| Porta na navegação | ✅ | `lib/navigation/catalogo.ts`: `/app/proposals` (grupo `crm`, "Fechar a venda") e `/app/settings/tenant/proposals` |

---

## 2. Defeitos no que está no ar — prioridade 1

Cada defeito traz **o que acontece**, **a medição**, **a solução** e **a prova** que o fecha.

### D1 — "Ligar propostas para esta organização" não desliga nada · **crítico**

- **O que acontece:** toda organização tem menu, rotas, telas e a ferramenta da IA, com a chave
  desligada. A promessa central da spec-mãe (§15.1: "nasce desligada; atualizar não muda nada em
  instalação nenhuma") é falsa — e é a promessa que torna o PR aceitável upstream.
- **Medição:** `settings.proposals.enabled` só é lido em `app/api/v1/settings/proposals/route.ts` e
  na própria tela (`git grep -n "proposals" -- lib app components | grep -i enabled` → só a tela).
- **Solução:** a chave passa a valer nas **quatro camadas**, copiando o precedente que já existe para
  o módulo opcional `banco_externo` (`lib/instalacao/modulos.ts`), só que no nível da
  **organização** (a doutrina de extensões: "a instância decide o pacote; a organização decide o
  uso"):
  1. **uma leitura só**, num helper novo de `lib/propostas/` que nunca lança e **falha fechada**
     (ausente/erro = desligado) — o mesmo contrato de `modulosLigados()`;
  2. **navegação:** `NavMetadata` ganha o equivalente organizacional de `modulo` — a entrada
     `/app/proposals` some do menu, do hub e do ⌘K com a chave desligada. A de Configurações
     continua visível: é onde se liga;
  3. **telas e rotas:** layout de `app/app/proposals` responde `notFound()` e toda rota de
     `/api/v1/proposals/**` responde 404 nomeado (espelho de `app/api/v1/external-db/_falha.ts`);
     os três crons pulam organização desligada;
  4. **ferramenta da IA:** `crm_draft_proposal` sai da lista do agente **e** do servidor MCP quando a
     organização está desligada — nos dois lugares onde `deModuloDesligado` já filtra
     (`lib/ai/runtime/tools.ts:410`, `lib/mcp/server.ts:56`), **e também no auto-injetor da linha 414**,
     que hoje roda depois do filtro e o contornaria.
- **O que não muda:** dados existentes. Desligar esconde; não apaga proposta nem cancela enviada
  (doutrina: "tirar é lógico e preserva dados"). Proposta `enviada` numa organização que desligou
  continua vencendo? **Sim** — o cron de vencimento é o único que roda mesmo desligado, para nenhuma
  proposta enviada morrer sem desfecho.
- **Migração de dados — medido na VPS em 23/09 (1.43.1):** as 3 organizações estão com
  `enabled: false` e **nenhuma tem proposta** (`crm_proposals` vazia nas três). A `59914589` ligou a
  chave em 18/09 20:54 e **desligou de propósito em 22/09 14:59** (auditoria
  `proposals.config_changed`). Logo o conserto **não liga ninguém**: respeita o que cada
  organização decidiu. Consequência que o Paulo precisa saber antes: ao aplicar C1, a tela de
  Propostas **some** da `59914589` até ele religar a chave — que é exatamente o que ele pediu em 22/09
  e o sistema ignorou. Em clone de terceiros, a regra da migration continua sendo "liga só quem já tem
  proposta", rodada antes como SELECT por organização.
- **Prova:** teste com duas organizações (uma ligada, uma desligada) cobrindo menu, página, rota,
  cron e lista de ferramentas do agente; sabotagem: remover a checagem de uma camada e ver o teste
  daquela camada ficar vermelho.

### D2 — A chave do agente "rascunhar sozinho" vaza pelo pacote `vender` · **alto**

- **O que acontece:** desligar `proposal_ai_draft_enabled` só impede o **acréscimo** automático da
  ferramenta. Agente que selecionou o pacote `vender` continua com `crm_draft_proposal`.
- **Medição:** `lib/mcp/tools/catalogo/comercio.ts` declara `pacotes: ["vender"]`;
  `lib/ai/runtime/tools.ts:414` só adiciona quando ligada, nunca remove quando desligada.
- **Solução:** a chave passa a ser **autoridade nos dois sentidos**: ligada → a ferramenta entra
  (como hoje); desligada → a ferramenta **sai**, mesmo vinda do pacote. O teto de 27 ferramentas
  por agente (`TETO_TOOLS_POR_AGENTE`) não muda de conta: a ferramenta já está no `vender`.
- **Medido na VPS em 23/09:** o único agente (LIMA, org `59914589`) tem a versão publicada com a
  chave **desligada** e `crm_draft_proposal` **fora** de `tool_ids` (27 ferramentas). O vazamento
  existe no código mas **não está ativo** hoje — ativa no dia em que alguém marcar o pacote `vender`
  nesse agente. Prioridade mantida em alto por isso: é silencioso quando acontecer.
- **Prova:** agente com pacote `vender` + chave desligada não recebe a ferramenta; sabotagem:
  voltar ao só-acrescenta e ver o caso ficar vermelho.

### D3 — A proposta vira "enviada" mesmo quando o WhatsApp falha · **crítico**

- **O que acontece:** `alocarNumero` já marca `status = 'enviada'` com número. Depois vêm PDF,
  upload e envio pelo WhatsApp. Se qualquer passo falhar, fica uma proposta "enviada", numerada, sem
  `pdf_path` nem `sent_at` — e o cliente não recebeu nada. O botão "Enviar" some (só aparece em
  rascunho), então **ninguém consegue reenviar pela tela**. No ramo da v2, o erro ao copiar os itens
  é ignorado.
- **Medição:** `lib/propostas/numeracao.ts` (UPDATE com `status: "enviada"`);
  `send/route.ts` — insert de itens da v2 sem checar erro; `pdf_path/sent_at` gravados só no fim.
- **Pior do que parece — a falha do WhatsApp não é exceção.** `sendMessageHandler`
  (`app/api/v1/messages/_handler.ts`, bloco `catch` perto da linha 939) **devolve** a mensagem com
  `status: "failed"` (ou `queued`, quando o canal não está configurado) em vez de lançar. A rota de
  proposta não olha esse status: com o WhatsApp fora, ela segue, marca a proposta como enviada,
  **muda o valor do negócio**, grava "Proposta enviada" na timeline e responde sucesso à tela. O
  cliente não recebeu nada e ninguém é avisado.
- **Solução — separar "número reservado" de "entregue":**
  1. **estado intermediário `enviando`** no CHECK de `status` (vocabulário fechado → migration com
     a tripla da casa). O número é alocado ao entrar em `enviando`, não em `enviada`;
  2. a proposta guarda **o id da mensagem** que a levou (coluna nova). O desfecho segue o status
     **devolvido** pela mensagem, nunca a ausência de exceção:
     - `sent`/`delivered` → a proposta vira `enviada` e só então ganha `sent_at`, `value_cents` do
       negócio, as atividades da timeline e a auditoria;
     - `queued` (canal sem credencial; o agent-engine reagenda) → continua `enviando`, e a tela diz
       "na fila do WhatsApp"; vira `enviada` quando a mensagem sair;
     - `failed` → passo 3;
  3. **falha em qualquer passo:** a proposta volta a `rascunho` **mantendo o número** (número
     reservado não se devolve: a sequência não fica com buraco nem repete). O próximo envio reusa
     o número — `alocarNumero` já só aloca quando `numero is null`;
  4. **presa em `enviando` há mais de 5 minutos** (processo morto no meio): o padrão do cron
     `recover-stuck-messages` — volta a rascunho e abre aviso na Central. Não reenvia sozinho
     (envio em dobro é pior que não-envio — doutrina WAHA);
  5. a cópia de itens da v2 passa a ser checada; falhou → a v2 é descartada e a v1 continua
     `enviada` (nada de v1 `substituida` apontando para uma v2 vazia).
- **Por que não "uma transação só":** o envio pelo WhatsApp é rede, e rede não entra em transação de
  banco (anti-pattern 9 da casa). O estado intermediário é o jeito honesto de dizer isso.
  6. a tela mostra a falha com o motivo (`error_message` da mensagem) e o botão "Enviar" de volta.
- **Prova:** envio com WAHA derrubado → a proposta volta a rascunho com o número, o valor do negócio
  **não** muda, nenhuma "Proposta enviada" aparece na timeline, e o segundo envio sai com o
  **mesmo** número; duas propostas enviadas ao mesmo tempo continuam sem repetir.

### D4 — A versão v2 não pode ser feita pela tela · **médio**

- **O que acontece:** só rascunho é editável (`PATCH` filtra `status = 'rascunho'`) e o botão
  "Enviar" só aparece em rascunho. O único caminho para a v2 é chamar o envio numa proposta já
  enviada — o que **reenvia o mesmo conteúdo** com rótulo "v2".
- **Medição:** `app/app/proposals/[id]/_client.tsx:214` (`editavel` exige rascunho) e `:383`;
  `decidirVersao` só gera v2 a partir de `enviada`.
- **Solução — "Revisar" cria a v2 como RASCUNHO, e o envio dela é um envio comum:**
  1. botão **"Revisar esta proposta"** em proposta `enviada` (`manager`+): cria a v2 em `rascunho`,
     com cópia dos itens, `substitui_id` apontando para a v1 e `numero/ano` herdados — **a v1 segue
     `enviada`** enquanto a v2 é rascunho (o cliente ainda tem a v1 válida na mão);
  2. ao **enviar** a v2, a v1 vira `substituida` na mesma operação;
  3. descartar a v2 em rascunho não toca na v1;
  4. o ramo `nova_versao` da rota de envio **deixa de existir**: enviar proposta já enviada vira 409.
- **Consequência no banco:** a v2 em rascunho já nasce com `numero/ano` herdados enquanto a v1 ainda
  é `enviada` — o índice único parcial precisa aceitar **o mesmo número em versões da mesma cadeia**.
  Solução: a unicidade passa a ser `(organization_id, ano, numero, versao)`. Medir antes, por
  organização, se há linha que viole a chave nova (não deve haver: hoje v2 só nasce pela rota de
  envio, e a v1 vira `substituida` antes).
- **Interação com a trava de rascunho único (§5.3):** a trava conta a v2 em rascunho como "o"
  rascunho aberto do negócio — é o comportamento certo.
- **Prova:** pela tela: enviar v1 → revisar → mudar preço → enviar v2; a v1 fica legível como
  `substituida`, o PDF da v2 diz "0042/2026 — v2", e o cliente recebeu dois documentos com o mesmo
  número.

### D5 — A ferramenta de rascunho da IA é mais pobre que o rascunho manual · **alto**

É a raiz direta das duas dores que motivaram a onda de modelos (preço inventado, 7 rascunhos
duplicados em 1 hora).

| Falta | Medição | Solução |
|---|---|---|
| Preço vem da cabeça da IA | a ferramenta aceita `preco_unitario_cents` livre; `product_id: null` fixo | o item passa a aceitar **`product_id`** do catálogo; com ele, o **preço vem do catálogo no servidor** e o valor enviado pela IA é ignorado. Item sem `product_id` entra **sem preço** (ver §5.2, "A definir") — a IA não escreve preço de item fora do catálogo |
| Rascunho duplicado | a ferramenta não consulta rascunhos existentes | trava da §5.3 |
| Sem validade | a ferramenta não preenche `valid_until`; a rota manual usa `default_valid_days` | mesma regra da rota manual — um só lugar calcula a validade padrão |
| Sem condições padrão | idem, e as condições padrão não são usadas por ninguém (D7) | mesma regra da rota manual |
| Sem registro na timeline nem auditoria | nenhum `emitLeadActivity` nem `audit` na ferramenta. **Medido na VPS:** a auditoria da `59914589` tem **1** `proposal.drafted` (19/09, pelo editor) e **nenhum** registro em 21/09 — os 7 rascunhos da IA daquele dia não deixaram rastro nenhum | `proposal_drafted` na timeline (ator IA) + auditoria, como já faz `lib/mcp/tools/handoff.ts` |
| Sem vínculo com a conversa | `conversation_id` nunca é gravado (nem pela rota manual) | a ferramenta grava a conversa do turno; o envio passa a usar **essa** conversa e só cai na mais recente do contato quando ela for nula (hoje sempre usa a mais recente, e contato com dois canais pode receber no canal errado) |

### D6 — O PDF não mostra o que a spec-mãe prometeu · **médio**

- **Medição:** `lib/propostas/pdf.tsx` recebe `logo_path` e `accent_hex` e não desenha nenhum dos
  dois; recebe `imagemUrl` no item e não desenha; a rota de envio nem passa a imagem do item.
- **Solução:** logo da **organização** no cabeçalho e cor de destaque no título e no total; imagem
  do item quando `imagem_url` existir, com layout que fecha sem buraco quando não existir (decisão
  6 da mãe); rodapé com "página X de Y". Precedente de imagem no mesmo motor: o PDF de LGPD.
  **A marca da instalação continua proibida** aqui (doutrina de marca própria).
- **Prova:** PDF gerado com e sem logo, com e sem imagem de item; conferência visual e de que o nome
  da instalação não aparece.

### D7 — "Condições padrão" é chave morta · **baixo**

- **Medição:** `default_conditions` só é lido na tela de configuração;
  `POST /api/v1/proposals` usa `input.condicoes ?? null`.
- **Solução:** rascunho novo (manual **ou** da IA) nasce com as condições padrão da organização,
  editáveis por proposta.

### D8 — Datas no fuso errado · **baixo**

- **Medição:** `alocarNumero` usa `new Date().getFullYear()` (`lib/propostas/numeracao.ts:18`) e o
  vencimento usa `agora.toISOString().slice(0, 10)` (`proposal-expiry/route.ts:28`) — os dois em UTC.
  A organização tem fuso próprio (`organizations.timezone`, IANA), lido por
  `lib/agent-engine/agent/fuso-da-org.ts` com padrão `America/Sao_Paulo`; esse helper é do motor
  (cliente `pg`), e o lado Next lê a mesma coluna em outros lugares (ex.:
  `app/api/v1/agenda/horarios-livres/route.ts`).
- **Solução:** "ano" do número, "hoje" do vencimento e a validade padrão calculados no **fuso da
  organização**, pela mesma regra de padrão do helper do motor (uma regra, dois clientes). Sem isso,
  a proposta enviada às 22h de 31/12 em Brasília nasce "0001/2027", e vence 3 horas antes do fim do
  dia dela.
- **Medido na VPS em 23/09:** as 3 organizações têm fuso preenchido — duas `America/Sao_Paulo` e a
  `11b020c8` em `Europe/Lisbon`. O caso de fuso diferente do padrão **já existe** entre os clientes.

### D12 — A proposta pode apontar para negócio de outra organização · **importante, medido**

- **O que acontece:** `crm_proposals` não tem trava que amarre `lead_id`, `contact_id` e
  `conversation_id` ao `organization_id` da própria linha. A RLS de escrita só confere o
  `organization_id` da linha e o papel. Um usuário logado de A grava, pela API do banco, uma
  proposta de A com o negócio de B — e a `on delete cascade` do lead deixaria B apagar dado de A.
- **Medição:** nenhum trigger `on public.crm_proposals` na 0394 (achado da revisão cega do merge,
  conferido na fonte); os itens têm (`fn_verificar_org_do_item_da_proposta`) e a timeline também
  (`trg_validate_activity_lead_org`). **Não há vazamento de leitura:** as rotas e a ferramenta da IA
  conferem o negócio na organização antes de gravar (`app/api/v1/proposals/route.ts`,
  `lib/mcp/tools/propostas.ts`).
- **Solução:** trigger `trg_crm_proposals_org_consistente` no molde do dos itens, com referência
  nula passando (compatível com D10) e só escrita nova validada (o `update.sh` de clone com dado
  legado não quebra). Migration própria (0398).
- **Prova:** invariante de banco com duas organizações — controle positivo grava; negócio, contato e
  UPDATE cruzados são recusados.

### D11 — Toda proposta sai em real, qualquer que seja a moeda da empresa · **médio, medido**

- **O que acontece:** `crm_proposals.moeda` tem padrão `'BRL'` (migration 0389) e nem a rota de
  criação (`app/api/v1/proposals/route.ts`) nem a ferramenta da IA (`lib/mcp/tools/propostas.ts`)
  informam a moeda. A decisão 5 da spec-mãe ("`lib/catalogo/moeda-da-org.ts` já resolve") nunca foi
  ligada: nenhum arquivo de proposta usa esse helper (medido por `git grep` em `lib/propostas`,
  `app/api/v1/proposals`, `app/app/proposals` e na ferramenta).
- **Medido na VPS:** a organização `11b020c8` está em `Europe/Lisbon` — o caso de moeda diferente de
  real é plausível entre os clientes.
- **Solução:** rascunho novo (manual ou da IA) nasce com a moeda da organização, pelo helper que já
  existe. Item de catálogo em moeda diferente da proposta é recusado com mensagem, nunca convertido.
- **Prova:** organização com moeda diferente de BRL cria rascunho pela tela e pela IA → a proposta e o
  PDF saem nessa moeda.

### D9 — O mesmo número já foi entregue a dois clientes · **crítico, medido em produção**

- **O que aconteceu (auditoria da org `59914589`, 19/09/2026):**

  | hora | evento |
  |---|---|
  | 12:05:51 | `proposal.sent` da proposta `1372f553` — **nº 1/2026** |
  | 12:13:08 | `org.dados_operacionais_apagados` — o negócio foi apagado, e a proposta com ele (cascata) |
  | 12:27:50 | `proposal.sent` da proposta `7e36496c` — **nº 1/2026 de novo** |

  A tabela está vazia hoje e os **2 PDFs continuam** no bucket `propostas` (medido:
  `storage.objects`, 2 arquivos de 19/09).
- **Causa:** `fn_proposta_aloca_numero` calcula `max(numero) + 1` sobre as **linhas que existem**.
  Apagou a linha, o número volta a estar livre. O índice único não pega porque a primeira linha não
  existe mais.
- **Solução:** a numeração deixa de depender das propostas existentes. Um **contador por
  organização e ano**, que só cresce, avançado numa única operação atômica no banco (uma linha por
  organização/ano; o próximo número é "o último + 1", gravado na mesma instrução). Apagar proposta,
  negócio ou todos os dados operacionais **não** mexe no contador. Efeito colateral bom: a
  alocação deixa de precisar da captura de `23505` com nova tentativa.
- **Semente do contador — medida:** em banco com propostas, o maior número existente por
  organização/ano; **e** o maior `numero` registrado em `api_audit_log` (`action =
  'proposal.sent'`, `metadata->>'numero'`), porque a auditoria é a única coisa que sobrevive a um
  apagamento. Na VPS isso dá: org `59914589`, ano 2026 → **1** (a próxima será a 0002/2026); as
  outras duas começam do zero.
- **Prova:** enviar, apagar o negócio, enviar outra → a segunda sai com o número seguinte; o mesmo
  depois de "apagar dados operacionais".

### D10 — Apagar um negócio apaga a proposta já enviada ao cliente · **alto, medido**

- **O que acontece:** `crm_proposals.lead_id` e `contact_id` são `on delete cascade` (migration
  0389). Apagar negócio em lote é permitido a `agent` (`app/api/v1/leads/bulk/route.ts`, ação
  `delete`, piso `agent`) — **um atendente apaga, sem querer, um documento comercial que o cliente
  já tem na mão**. É o anti-pattern 7 da casa ("cascata fantasma").
- **E o apagamento de dados operacionais é incompleto** (`lib/settings/apagar-dados-operacionais.ts`):
  as propostas somem em cascata sem aparecer na contagem nem no comentário que lista o que some, e
  os **PDFs ficam órfãos** no bucket — medido: 2 PDFs sem proposta na VPS.
- **Solução:**
  1. proposta **enviada, aceita, recusada, vencida ou substituída** é documento e sobrevive ao
     negócio: `lead_id` e `contact_id` passam a `on delete set null` (e aceitam vazio), e no envio
     a proposta guarda o nome do destinatário que foi impresso no PDF — o documento continua legível
     sem o negócio;
  2. **rascunho** de negócio apagado vira `cancelada` (não tem valor fora do negócio);
  3. o apagamento de dados operacionais passa a ter propostas como raiz declarada **e** limpa a
     pasta da organização no bucket, com contagem das duas coisas na auditoria. O contador de D9 **não**
     é zerado por ele;
  4. a tela de apagar negócio avisa quando há proposta enviada ("o negócio some; a proposta 0002/2026
     continua em Propostas").
- **Prova:** apagar em lote um negócio com proposta enviada → a proposta continua listada e o PDF
  abre; apagar dados operacionais → zero proposta, zero PDF da organização no bucket, contador
  intacto.

---

## 3. Prometido pela spec-mãe e não entregue — prioridade 2

| # | Promessa (spec-mãe) | Medido | Solução |
|---|---|---|---|
| N1 | Aba **Propostas no card do negócio** (§10, item 4) | não existe. O card é `components/kanban/LeadDossier.tsx`, feito de seções empilhadas (cabeçalho, conversa, contato, linha do tempo, dados do negócio) — não de abas | **seção "Propostas"** no dossiê, depois de "Dados do negócio": as propostas do negócio com número, versão, status, total e validade, e o atalho "Nova proposta" (`manager`+). Some quando a organização desligou (D1) |
| N2 | Proposta enviada **agenda follow-up** (§10, item 6; Onda 5) | nada agenda. O motor já tem as peças chamáveis de rota: `agendaRetornoNoCrm` e `cancelaRetornoNoCrm` (`lib/followup/retorno-crm.ts`, cliente Supabase), já usadas pela ferramenta de retenção (`lib/mcp/tools/retencao.ts`). O agendamento recusa data fora da janela configurada (`promised_at_out_of_window`) e retorno duplicado (`already_pending`) | ao virar `enviada`, agenda o retorno em **N dias** (knob novo em Configurações › Propostas, padrão 3, nunca depois da validade), com o motivo "retomar a proposta 0042/2026". Aceita, recusada ou cancelada → **cancela** o retorno. `already_pending` não é erro: o negócio já tem retorno, e ele serve. Fora da janela → registra na timeline que não agendou e por quê, nunca em silêncio |
| N3 | Vencida **entra no Radar de Risco** (§9) | só abre aviso na Central. O Radar (`lib/leads/radar-de-risco.ts`) monta a lista a partir de `crm_leads` (atividade antiga), `cron_jobs` (retorno agendado = "em voo") e `demandas` sem próximo passo — não lê propostas | o Radar ganha **um motivo novo**: negócio aberto com proposta `vencida` e sem proposta mais nova — lido de `crm_proposals`, sempre filtrado pela organização. Com N2 no ar, o retorno cancelado na vencida tira o negócio de "em voo", e ele aparece sozinho |
| N4 | **Rascunho vencido** quando o negócio andou (§6.5) | só existe a trava de concorrência (`revision`). `catalog_products` tem `updated_at` com trigger | **só preço entra**: o rascunho compara o preço de cada item de catálogo com o preço **atual** do catálogo (o item já guarda o preço copiado). Diferença → faixa no editor "o preço de 2 itens mudou no catálogo" com **Atualizar preços** / **Manter**; e o envio pede confirmação listando as diferenças. Etapa e campos do funil **não** entram: não mudam o conteúdo da proposta hoje (voltam a importar com o briefing dos modelos, e aí entram pelo renderer) |
| N5 | Assistente **desabilitado com motivo** sem orçamento de IA (§6.4) | **entregue em parte:** `assistant/route.ts` captura `LlmBudgetExceededError`, `LlmProviderUnknownError` e `LlmModelNotEnabledError` e devolve `disponivel: false` + `motivo` — mas só **depois** do clique, e o motivo é o `err.message` técnico | checagem **ao abrir** o editor (o campo já nasce desabilitado) e motivo escrito para leigo, em PT e ES. Baixa prioridade |
| N6 | Etapa "Proposta enviada" com **evidência** (Peça 8) | virou outra coisa: "etapa que afirma fato" (migration 0286) exige uma **pessoa** movendo o card, não uma proposta enviada | **decisão já tomada no produto, registrada aqui:** a 0286 cobre o risco (card adiantado por IA/automação). Amarrar a etapa a uma proposta **não** entra: travaria quem vende sem usar propostas. Fica o complemento barato: ao **enviar**, se o negócio estiver antes da etapa marcada como "afirma fato", a tela **oferece** movê-lo — nunca move sozinha |
| N7 | "A IA para de oferecer o que já foi recusado" (§10, item 8b) | o motivo da recusa vai para a timeline; nada o leva ao contexto do agente | o resumo do negócio que o agente já lê passa a incluir a última proposta e o desfecho dela (status, total, motivo da recusa). Sem ferramenta nova |

---

## 4. Decisões que as duas specs tomavam diferente — resolvidas

| Tema | Mãe (16/09) | Modelos (21/09) | **Vale** | Por quê |
|---|---|---|---|---|
| Quem monta/revisa o rascunho | `agent` monta, `manager` envia (decisão 2) | só `manager`+ revisa e altera (decisão 10) | **`manager`+ revisa e altera; `agent` vê** | decisão mais recente do dono. A **IA** continua rascunhando pela ferramenta (ator IA, não papel humano). O `agent` humano mantém: ver, e marcar aceita/recusada (é quem está na conversa) |
| Modelos por organização | "onda seguinte" (§5.5) | onda 1 (§5.1, decisão 11) — mas "onda futura" na §14.1 | **onda 1 da parte de modelos** | a §14.1 é resposta anterior à decisão 11 e ficou velha |
| Rascunho sem preço | — | "R$ 0 + aviso" (§3, §6.3) × "nunca R$ 0,00, A definir" (§8) | **"A definir"** | zero no PDF lê como gratuidade |
| Espanhol no conteúdo do modelo | — | obrigatório (decisão 5) × depois (§9) | **estrutura pronta agora, texto ES depois** | o gate de ES cobre texto de tela, não conteúdo de banco (medido na própria §9); o texto de **tela** novo continua exigindo ES |
| Quantidade de modelos | — | CHECK com 8 (§5.1) × 8 + 3 anexos (§5.4) × piloto de 3 (§11) | **vocabulário = o que existir de modelo; piloto = 3** | ver §6.2 |

---

## 5. Base comum que a onda de modelos exige (e que já resolve D5)

### 5.1 Estado de precificação

A proposta ganha **`pricing_status`** (`text` + CHECK): `missing`, `catalog`, `manual`,
`approved`. (O `custom` da spec de modelos sai: não houve medição que o separasse de `manual`.)

- `missing` → o PDF mostra **"A definir"**, nunca R$ 0,00; **o envio é recusado**;
- item do catálogo → `catalog`; preço digitado por pessoa → `manual`.

### 5.2 Item sem preço

Hoje `preco_unitario_cents` é **obrigatório** e `>= 0`. Para "A definir" existir no item, ele passa
a **aceitar vazio** — o CHECK `>= 0` continua valendo para quando houver valor. O total da proposta
soma só itens com preço, e **enviar com qualquer item sem preço é recusado** com a lista dos itens.

Por que no item e não só na proposta: numa proposta de 5 itens, 4 podem vir do catálogo e 1 não —
o PDF precisa dizer **qual** está a definir.

**Migração:** afrouxar `not null` é seguro em banco com dados (nenhuma linha viola a regra nova);
o apêndice idempotente do `baseline.sql` usa `alter column ... drop not null`, que é reaplicável.

### 5.3 Um rascunho aberto por negócio

- **No banco**, não só na ferramenta: índice único parcial em `(organization_id, lead_id)` onde
  `status = 'rascunho'`. Trava só na ferramenta perde para duas chamadas simultâneas — e as 7
  duplicadas medidas nasceram em turnos seguidos do mesmo agente.
- **Antes do índice, o dedupe:** a migration cancela os rascunhos excedentes de cada negócio,
  mantendo o mais recente — rodado antes como SELECT, por organização, e com a contagem registrada.
  Nada é apagado: `cancelada` preserva o histórico.
- A ferramenta, ao bater na trava, responde com o id do rascunho aberto (`rascunho_aberto_existe`)
  e o prompt manda retomar.
- "Duplicar de propósito à mão" (spec de modelos §5.3) **sai**: contradiz a trava. Quem quer
  recomeçar cancela o rascunho aberto.

---

## 6. A onda de modelos — prioridade 3

Tudo da spec de 21/09 que não foi alterado acima continua valendo: TEMPLATE → PROPOSAL → SNAPSHOT
(§5.5 dela), renderer com variáveis declaradas e `[a definir]` (§7), readiness com bloqueadores
(§7.8 e §13), canvas com chat lateral e envio nunca automático (§13). Abaixo, só o que precisou ser
corrigido.

### 6.1 Modelo da plataforma × modelo da organização

A spec de modelos exigia `organization_id` **obrigatório** e, no mesmo item, um modelo base "com
`organization_id` nulo". As duas coisas não cabem juntas.

**Solução:** o modelo base **não mora no banco** — mora no código, versionado, como os JSON anexos.
No banco só existem as **cópias por organização** (com `organization_id` obrigatório e RLS comum).

- organização que nunca personalizou → usa o modelo do código;
- ao personalizar → nasce a cópia, com `base_slug` e `base_version` de onde veio;
- versão nova da base → "atualização sugerida" (comparar/aplicar/ignorar — decisão 15 do dono),
  nunca sobrescreve a cópia.

**Por que no código e não com organização nula:** a regra da casa é "`organization_id not null` em
toda tabela tenant-aware", e política de leitura para linha sem dono é exatamente onde vazamento
entre organizações nasce. O precedente de skills com `organization_id` nulo existe, mas é o
contrário do que se quer para um produto que vende tenant. E atualizar o modelo base vira deploy
comum, sem migration de dados.

### 6.2 Vocabulário de tipos

Sem CHECK com lista de slugs. O tipo válido é **o que existe como modelo** (no código ou na cópia da
organização). CHECK de slug obrigaria migration a cada modelo novo — e a spec de modelos já queria
modelo novo pela tela.

### 6.3 Texto das seções editável por proposta

A spec dizia "não guardamos o texto das seções no rascunho" (§5.2) e "texto editável nesta proposta"
(§6.1). **Solução:** a proposta guarda **só as seções alteradas à mão** (as demais renderizam do
modelo). O SNAPSHOT do envio congela o texto final inteiro.

### 6.4 Os anexos precisam de conserto antes de virar piloto

Medido nos 3 JSON de `2026-09-21-proposta-templates/`:

| Achado | Solução |
|---|---|
| `"version": "1.0.0"`, não a v1.1.0 citada | alinhar a versão do formato |
| `variables` é a string `"{{variable.path}}"`, não a declaração que a §7.7 exige — e aparece como variável falsa `variable.path` | declarar `variables: {caminho: {type, required}}` |
| chaves diferentes para a mesma coisa: `client.company` e `client.company_or_name` | um nome só |
| nenhum texto em espanhol | esperado (§4); a estrutura precisa já ter o lugar do ES |
| os 8 modelos de web design não estão no repositório | trazê-los antes da onda; o piloto (catálogo imobiliário, institucional, landing page) depende deles |

### 6.5 PDF com seções

Medir antes de desenhar a tela: o motor atual (`@react-pdf/renderer`) com um modelo de 15 seções
de texto longo — quebra de página no meio de seção, título órfão no pé da página. Se não servir, a
decisão de motor vem antes da Onda M2.

---

## 7. Ordem de execução

Cada onda: medição → teste vermelho → implementação → verde → **sabotagem** → prova pela tela com o
Paulo antes da próxima. Toda mudança de schema com a tripla da casa (migration + apêndice idempotente
no `baseline.sql` + linha no `MANIFEST.md`).

| Onda | Entrega | Prova |
|---|---|---|
| **C1** | D12 (trava de organização da proposta) + D1 (chave da organização nas 4 camadas) + D2 | 2 organizações × menu, rota, cron, ferramenta |
| **C2** | D9 (contador próprio, com semente da auditoria) + D3 (estado `enviando`, falha devolve a rascunho com o número, cron de presa) + D10 (proposta enviada sobrevive ao negócio; apagamento completo) | envio com WAHA derrubado + reenvio com o mesmo número; apagar negócio e enviar outra não repete número |
| **C3** | D5 + §5 (preço do catálogo no servidor, `pricing_status`, item sem preço, trava de rascunho único com dedupe, validade/condições padrão, timeline e auditoria, conversa gravada) + D7 | a IA não consegue gravar preço fora do catálogo; segundo rascunho recusado |
| **C4** | D4 (revisar cria v2 em rascunho) + D6 (PDF com marca e imagem) + D8 | v1 → v2 pela tela; PDF conferido visualmente |
| **C3b** | D11 (moeda da organização) | organização fora do real cria proposta pela tela e pela IA |
| **E1** | N1–N5, N7 (card, follow-up, Radar, rascunho vencido, orçamento, contexto da IA) | uma prova por item |
| **M0–M6** | onda de modelos (ordem da §11 da spec de 21/09, a partir do fundamento de template) | idem à spec de 21/09 |

| **MOD** *(depois da issue #1114)* | a proposta vira módulo (ADR-0002): `fn_propostas_provisionar()`, instalação pela tela, app sem tabelas | o molde `tests/invariants/molde-de-provisionadora.ts` |

C1 vem primeiro porque é o único defeito que **vaza comportamento para organizações que não pediram**
— na VPS, cada organização é um cliente pagante.

---

## 8. O que não entra

Sem link público de aceite (Onda 7 da mãe, sem mudança), sem assinatura eletrônica, sem pagamento,
sem DOCX, sem motor de precificação automática.

---

## 9. Medido na VPS em 2026-09-23

Leitura por `ssh appfin-staging` → `supabase-db`, só `SELECT`, todo número separado por
organização. Versão em produção: **1.43.1** (`app`, `worker` e `scheduler`).

| Pergunta | Resultado | Onde decide |
|---|---|---|
| Quais organizações usam propostas | nenhuma tem linha em `crm_proposals`; as 3 com `enabled: false`; a `59914589` desligou por vontade própria em 22/09 | D1 |
| Propostas presas em "enviada" sem ter saído | 0 linhas (tabela vazia) | D3 — o conserto não precisa corrigir dado |
| Rascunhos duplicados abertos | 0 (os 7 de 21/09 já tinham sido apagados) | §5.3 — o dedupe da migration roda e não acha nada aqui; continua necessário para clones |
| Número repetido | **sim: o nº 1/2026 foi enviado duas vezes** | D9 |
| PDF sem proposta | **2** no bucket `propostas` | D10 |
| Chave de rascunho da IA no agente publicado | LIMA: desligada, ferramenta fora da lista | D2 |
| Fuso das organizações | 2 × `America/Sao_Paulo`, 1 × `Europe/Lisbon` | D8 |
| Janela do follow-up | `.env` **não** define `FOLLOWUP_MIN_AHEAD_MS` nem `FOLLOWUP_MAX_AHEAD_MS` (conferido só pelo nome da variável) → valem os padrões do código, 5 min a **180 dias** (`lib/followup/janela.ts:17-20`) — cabe folgado na validade de 15 dias | N2 |
| Condições padrão configuradas | só a `59914589` tem texto (que nunca foi usado — D7) | D7 |

As medições de código das seções 2 e 3 foram varridas por um subagente Haiku e **conferidas na
fonte**, uma a uma, antes de entrar aqui.
