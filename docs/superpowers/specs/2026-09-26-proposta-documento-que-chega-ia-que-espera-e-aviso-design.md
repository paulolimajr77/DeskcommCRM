# Proposta comercial — o documento que a IA monta chega ao cliente, a pessoa corrige antes, e fica sabendo (design)

**Data:** 26/09/2026
**Estado:** proposta para revisão do dono do produto
**Specs anteriores que esta corrige ou completa:**
[`2026-09-21-proposta-comercial-templates-design.md`](2026-09-21-proposta-comercial-templates-design.md)
(a spec da onda de modelos) e
[`2026-09-23-proposta-comercial-design.md`](2026-09-23-proposta-comercial-design.md) (a spec-mãe).
**Planos que a executam:** quatro (P1, P2, P4A+P4B, P5), em `docs/superpowers/plans/2026-09-26-proposta-p*.md`.
Existe também um `2026-09-26-proposta-p0-*.md` na mesma pasta — **não é desta spec**: é uma
remoção no CRM (campos do funil), decidida na mesma conversa por coincidência de tema, sem
nenhuma dependência com propostas.
**Revisado em 26/09/2026** depois de uma primeira leitura do dono: o item 2 original (a IA
espera) e o item 3 original (a IA completa o rascunho sozinha) viraram um único item 2 novo,
mais simples — ver a nota no início daquela seção e em §5.

---

## 0. Por que esta spec existe

Num teste de ponta a ponta feito pelo dono em 26/09/2026, um cliente pediu orçamento de um
sistema para imobiliária. O resultado foi um rascunho de proposta genérico, com campos que
não podiam ser preenchidos na tela, e nada no documento chegaria ao cliente mesmo que
fossem. A medição (§1) mostra que não houve um defeito: houve **quatro promessas da spec
de 21/09 que os planos seguintes não cumpriram**, e duas delas foram adiadas por escrito
com "perguntar ao dono depois" — pergunta que nunca foi feita.

| Promessa da spec de 21/09 | Onde o plano a deixou cair |
|---|---|
| §6.1 "texto editável nesta proposta" | O objetivo do plano M3 dizia "edita o texto de qualquer seção à mão"; a tarefa de tela do mesmo plano (Task 4) só renderiza texto |
| §6.2 o PDF com as seções do documento | O plano M5 (linha 18) deixou "trocar o PDF enviado" como "decisão separada, a se tomar com o Paulo" |
| §7 item 2 "envio bloqueado até preencher" | Foi implementado, mas duas variáveis de todo modelo não têm fonte nenhuma — o bloqueio vale para sempre |
| §4 "1 briefing na conversa, capturado pela IA" | A ferramenta grava o briefing, mas nada impede a IA de gravá-lo antes de o cliente responder |

O plano M6 registrou um quinto achado do mesmo jeito ("perguntar ao Paulo se quer um
plano à parte"): a edição de seção aceita proposta já enviada.

Esta spec fecha as cinco pontas e acrescenta o que o dono pediu em 26/09: a empresa
cadastra os próprios modelos de proposta (inclusive a partir de um arquivo), a IA preenche
pelo histórico da conversa, e quem revisa é avisado.

---

## 1. Medições

Toda afirmação desta seção tem o comando que a reproduz. Os comandos de banco usam
`\set org '<id da organização>'` porque cada organização é um cliente diferente; a
evidência do teste de 26/09 é descrita sem identificadores.

### 1.1 O rascunho nasceu antes de o cliente dizer o que queria

```bash
ssh appfin-staging 'docker exec -i supabase-db psql -U postgres -d postgres' <<'SQL'
\set org '<id da organização>'
select p.created_at as rascunho_criado,
       (select min(m.created_at) from messages m
         where m.organization_id = p.organization_id and m.conversation_id = p.conversation_id
           and m.direction = 'inbound' and m.created_at > p.created_at) as proxima_fala_do_cliente,
       p.briefing_json
  from crm_proposals p where p.organization_id = :'org' order by p.created_at desc limit 5;
SQL
```

Resultado no teste de 26/09: o agente perguntou "qual seu segmento?" às 10:09:06; o
rascunho foi criado às 10:09:14; o cliente respondeu "imobiliária, com catálogo de imóveis,
filtros, captação no WhatsApp e área gerencial" às 10:09:58. O briefing gravado tinha só
`scope.request = "Orçamento para um site"`, `scope.details = "Cliente pediu orçamento para
site, sem mais especificações no turno."`, `project.name = "Site"`,
`included.list = "A definir com a equipe…"` e `excluded.list = "Não informado neste turno"`.
Nas mensagens seguintes o agente entendeu certo ("sistema web/catálogo imobiliário sob
medida") e o rascunho nunca foi atualizado.

A trilha de auditoria da mesma proposta (`select created_at, action, metadata from
api_audit_log where organization_id = :'org' and resource_type = 'crm_proposals' order by
created_at`) mostra três linhas: `proposal.drafted` (a IA), `proposal.modelo_confirmado`
com `projeto_personalizado` (a pessoa, 3 minutos depois) e `proposal.discarded`
(1min39s depois).

### 1.2 A ferramenta de rascunho não tem trava de conteúdo

`lib/mcp/tools/propostas.ts`: a única condição sobre o conteúdo é a frase da descrição
("Use quando o cliente pedir orçamento ou proposta e você já souber o que oferecer",
linhas 93–96). O briefing é `z.record(...).optional()` (linhas 69–79) e a descrição dele
afirma "Preço, prazo e validade NÃO entram aqui — o sistema já sabe e calcula sozinho" —
**falso para o prazo** (§1.5).

### 1.3 Um rascunho por negócio, e nada que o complete

`lib/mcp/tools/propostas.ts:114-127` recusa um segundo rascunho com
`rascunho_aberto_existe` e "retome-o em vez de criar outro" — mas não existe ferramenta
para retomar:

```bash
grep -n "name: \"crm_" lib/mcp/tools/propostas.ts        # só crm_draft_proposal
```

O único caminho de mudar o briefing depois é o `AssistantPanel`, disparado por uma pessoa
(`app/api/v1/proposals/[id]/assistant/route.ts`, papel `agent`).

### 1.4 A tela do documento é só leitura

`app/app/proposals/[id]/_components/DocumentoCanvas.tsx:117-122` mostra `title` e `body` de
cada seção em `<div>`. O seletor de modelo só aparece enquanto **não há** modelo confirmado
(linha 67): depois de confirmar, não há como trocar. A rota que editaria já existe e nunca
foi chamada pela tela:

```bash
grep -rn "proposals/\${.*}/documento\"\|/documento\`" app/app/proposals   # só o GET
```

`app/api/v1/proposals/[id]/documento/route.ts`:
- o `PATCH` aceita `{secaoId, texto}` com `texto: z.string()` (linha 20): texto vazio grava
  `""`, e não há como voltar ao texto do modelo;
- o `PATCH` **não confere** `status = 'rascunho'` (linhas 124–163) — achado do plano M6;
- o `GET` devolve `variaveisFaltando` como caminhos técnicos (`project.objective`), que a
  tela conta mas não nomeia.

### 1.5 Nenhuma proposta com modelo consegue ser enviada

```bash
node -e 'const s=require("fs").readFileSync("lib/propostas/modelos/catalogo-base.ts","utf8");
const M=JSON.parse(s.slice(s.indexOf("Object.freeze(")+14,s.lastIndexOf("} as Record")+1));
for (const [k,m] of Object.entries(M)) console.log(k, m.sections.filter(x=>x.required).some(x=>/approval\.date/.test(x.body)), m.sections.filter(x=>x.required).some(x=>/schedule\.estimated_days/.test(x.body)))'
grep -rn "approval" lib/propostas app/api/v1/proposals --include=*.ts | grep -v catalogo-base   # vazio
grep -rn "prazo_dias_uteis\|pagamento:" --include=*.ts --include=*.tsx app lib | grep -v test   # só leitores
```

Os oito modelos têm, em seção obrigatória, `{{approval.date}}` e
`{{schedule.estimated_days}}`. `montarDadosDoDocumento` (`lib/propostas/documento/montar-dados.ts:53-68`)
nunca define `approval`, e define `schedule.estimated_days` a partir da coluna
`crm_proposals.prazo_dias_uteis` — que **nenhuma tela, rota ou ferramenta escreve**. A
coluna `pagamento` está na mesma situação. Como a rota de envio recusa quando sobra
pendência (`app/api/v1/proposals/[id]/send/route.ts:104-131`), todo envio de proposta com
modelo confirmado é recusado com "Faltam N campo(s)". Os testes passavam porque o mundo
montado em `app/api/v1/proposals/[id]/documento/route.test.ts` traz `prazo_dias_uteis: 20` e
`pagamento: "50_50"`, valores que o produto nunca grava.

As 33 variáveis usadas pelos 8 modelos (comando acima, trocando o `console.log`) dividem-se
em: **calculadas pelo sistema** (`client.name`, `client.company_or_name`,
`investment.total_formatted`, `commercial_terms.validity_days`, `schedule.estimated_days`),
**sem fonte** (`approval.date`), **do cliente ou da conversa** (`client.company`,
`project.*`, `scope.*`) e **decisão de quem vende** (`included.list`, `excluded.list`).

### 1.6 O documento nunca chega ao cliente

```bash
grep -rn "renderDocumentoPdf" --include=*.ts --include=*.tsx app lib workers | grep -v "\.test\."
```

Só a definição, em `lib/propostas/documento/pdf-do-documento.tsx:37`. O envio gera o PDF
com `renderPropostaPdf` (`send/route.ts:284-296`, definido em `lib/propostas/pdf.tsx`):
título, número, destinatário, itens, total, validade e condições. As seções do modelo vão
só para `rendered_snapshot`, no banco.

### 1.7 O aviso existe, e é fraco

- `lib/propostas/aviso-de-revisao.ts:27-36` abre `proposta_pronta_para_revisao` com
  `severity: "info"` e título genérico ("Uma proposta está pronta para revisão"), sem dizer
  de quem nem o que falta.
- O sino do topo conta avisos abertos e não vistos (`components/shell/AlertsBell.tsx`,
  `app/api/v1/ai/inbox/route.ts:67-76`). No teste de 26/09 o aviso da proposta foi um entre
  22 da organização.
- A notificação do navegador existe e não conhece proposta:
  `lib/notifications/push.handler.ts` consome `message.received`, `lead.assigned`,
  `lead.won`, `lead.lost` e `user.mentioned`. `enviarPushAoUsuario(org, userId, payload)`
  (`lib/notifications/web_push.ts:75`) entrega a um usuário.
- O "Aviso no WhatsApp" (`lib/escalacao/aviso-ao-suporte.ts`) só consome `ai.case_opened` /
  `ai.case_closed`, e a entrega exige caso: `entregas_de_aviso_de_caso.case_id uuid not null
  references agent_cases(id)`. Na organização do teste não há linha em
  `config_aviso_de_caso` (`select ligado from config_aviso_de_caso where organization_id = :'org'`
  volta vazio).

### 1.8 Os modelos da empresa têm tabela e não têm mais nada

```bash
python -c "s=open('supabase/baseline.sql',encoding='utf-8').read(); k=s.rfind('create table if not exists public.proposal_templates'); print(s[k:k+700])"
python -c "s=open('supabase/baseline.sql',encoding='utf-8').read(); k=s.rfind('create policy proposal_templates_write'); print(s[k:k+400])"
grep -rln "proposal_templates" --include=*.ts --include=*.tsx app lib | grep -v test
```

- `proposal_templates` tem `slug`, `version`, `base_slug`, `base_version`, `sections`,
  `section_order`, `is_active` — **sem nome** para mostrar a uma pessoa.
- A política de escrita exige papel `agent`, abaixo do `manager` que a decisão #10 da spec
  de 21/09 exige para alterar proposta.
- Só `lib/propostas/modelos/resolver.ts` lê a tabela. Não há rota nem tela: a página de
  configurações (`app/app/settings/tenant/proposals/_client.tsx`) tem liga/desliga,
  validade padrão e condições padrão.
- A ferramenta de rascunho só aceita slug do código (`Object.hasOwn(MODELOS_BASE, …)`,
  `lib/mcp/tools/propostas.ts:146`) e o seletor da tela só lista `ROTULO_DO_MODELO` (os 8).
- O repositório extrai texto de PDF, Markdown, texto e CSV
  (`lib/ai/rag/ingest/documento.ts:39`, `extractPdfText` e `extractMarkdownText` em
  `lib/ai/rag/extractors/`). DOCX não; a spec de 21/09 já dizia "não é DOCX".

---

## 2. O contrato, item por item

Cada item diz o que muda para quem usa, o que não é, e como provar pela tela. Nomes de
função e diff são dos planos.

### Item 1 — O documento é corrigível na tela, e é ele que chega ao cliente

**Comportamento**

1. Com a proposta em rascunho, quem tem papel `manager` ou acima vê cada seção num campo
   de texto editável, com **Salvar seção** e **Voltar ao texto do modelo**. Quem não tem o
   papel vê o texto como hoje.
2. Acima das seções, **O que falta preencher** lista cada variável sem valor com um nome
   legível ("Objetivo do projeto", "Filtros de busca de imóveis") e um campo. Preencher ali
   grava no briefing da proposta e o valor aparece em **todas** as seções que o usam. Uma
   seção reescrita à mão não gera pendência, como já é hoje.
3. Prazo (dias úteis) e forma de pagamento viram campos do editor, ao lado de validade e
   condições. O prazo alimenta `{{schedule.estimated_days}}`.
4. `{{approval.date}}` deixa de ser pendência: é a data em que o cliente assina, e o
   documento a mostra como linha em branco para ser preenchida à mão.
5. O modelo pode ser trocado enquanto a proposta é rascunho. Se houver seção reescrita à
   mão, a tela pede confirmação e a troca descarta essas reescritas.
6. Nada disso é aceito fora de rascunho: a rota recusa com 409.
7. Ao enviar uma proposta com modelo confirmado, o PDF que o cliente recebe é o
   **documento**: cabeçalho (marca, número, versão, destinatário), as seções na ordem do
   modelo, a tabela de itens com o total logo depois da seção de investimento, e o rodapé
   com página X de Y. Proposta sem modelo continua recebendo o PDF de itens de hoje.
8. A pendência nunca é inventada: o que a pessoa não preencheu continua bloqueando o envio,
   com a lista nomeada.

**Não é:** editor rico (negrito, imagem); reordenar ou criar seção dentro da proposta (isso
é do modelo, item 5); conteúdo em espanhol; o "resumo comercial" da §6.1 de 21/09.

**Aceite (observável)**
- Proposta com modelo confirmado e todas as variáveis de conteúdo preenchidas **é enviada**
  e o PDF recebido no WhatsApp tem as seções.
- Voltar ao texto do modelo faz a seção voltar a mostrar `[a definir]` onde faltar dado.
- `PATCH` de seção ou de campo em proposta `enviada` devolve 409.
- Trocar o modelo com seção reescrita, sem confirmar, não muda nada.

**Prova na tela (roteiro para o dono):** abrir um rascunho criado pela IA → confirmar o
modelo → preencher dois campos em "O que falta" e ver o texto das seções mudar → reescrever
uma seção e salvar → voltar ao texto do modelo → preencher prazo e pagamento → enviar →
abrir o PDF no WhatsApp. **Caminho do erro:** tentar enviar com um campo vazio (a lista
nomeada aparece); trocar o modelo com uma seção reescrita e cancelar a confirmação.

### Item 2 — A pessoa preenche o documento com a ajuda da conversa, quando quiser

**Revisado em 26/09/2026, depois da primeira leitura desta spec pelo dono.** Os dois
comportamentos que este item tinha (a IA recusa rascunhar até o briefing estar completo; a
IA completa sozinha o rascunho aberto a cada resposta nova do cliente) saíram. O motivo:
fazer a IA decidir sozinha **quando** a conversa já tem informação suficiente é a mesma
classe de problema medida em §1.1 (ela decidiu cedo demais), só que adiada para depois do
primeiro rascunho em vez de resolvida. A pessoa que revisa já sabe melhor do que a IA quando
a conversa está madura — e o item 1 já deu a ela um lugar para agir: o editor do documento.

**Comportamento**

1. `crm_draft_proposal` **não muda neste item**: continua rascunhando sem exigir briefing
   completo, sem travar o turno do agente esperando resposta, e sem tentar completar um
   rascunho já aberto. Não nasce ferramenta nova nem modo novo de ferramenta (D16).
2. No editor do documento (item 1), quando existir pelo menos um campo de briefing em
   "O que falta preencher", aparece o botão **Preencher com a conversa**.
3. Ao clicar, o sistema lê as mensagens da conversa da proposta e pede à IA — por uma
   chamada de rota, no mesmo padrão do assistente de instrução que já existe, nunca por uma
   tool MCP — sugestões só para os campos que ainda faltam. A IA só pode sugerir valor para
   um campo da lista recebida e só quando a conversa respondeu aquilo de verdade; não pode
   inventar campo novo nem chutar valor.
4. **A sugestão pré-preenche a caixa do campo; nada é gravado sozinho.** A pessoa vê o texto
   sugerido, pode editá-lo, e só grava clicando em **Preencher** — o mesmo botão e a mesma
   rota que already existe para digitar à mão (item 1).
5. Pode ser clicado de novo mais tarde, quantas vezes quiser: sugere de novo só para os
   campos que ainda estiverem vazios naquele momento (um campo já preenchido, por sugestão
   aceita ou por digitação, não aparece mais na lista de pendências, e portanto não recebe
   sugestão nova).

**Não é:** a IA gravar qualquer coisa sem clique; a IA decidir quando parar de perguntar ao
cliente; mexer em itens, preço, condições, validade ou seções reescritas (não são "briefing");
uma ferramenta nova para o agente de atendimento.

**Aceite:** proposta em rascunho com "Objetivo do projeto" faltando e a conversa contendo
"gerar contato de comprador" → clicar o botão preenche a CAIXA com esse texto, sem gravar;
clicar em Preencher grava. Campo cuja informação não está na conversa não recebe sugestão
(a caixa continua vazia). Editar a sugestão antes de confirmar grava o texto editado.

**Prova na tela:** pedir orçamento dizendo só o segmento → abrir o rascunho → ver "Objetivo
do projeto" vazio → clicar **Preencher com a conversa** → a caixa continua vazia (o cliente
não disse) → responder o objetivo no WhatsApp de teste → clicar de novo → a caixa preenche.
**Caminho do erro:** clicar sem nenhum campo de briefing faltando — o botão não aparece.

### Item 4 — Quem revisa fica sabendo

Dividido em duas partes independentes, cada uma com seu plano.

**4A — no sistema e no navegador (vale para toda instalação)**

1. O aviso da Central vira `severity: "warn"`, com título que nomeia a proposta e o cliente
   ("Proposta «Site catálogo» de Maria está pronta para revisão") e corpo que diz quantos
   campos faltam.
2. O aviso só se fecha sozinho quando a proposta está **de fato pronta**: modelo confirmado,
   preço definido **e zero pendências no documento** — ou quando ela sai de rascunho.
3. Ao rascunhar, a IA emite o evento `proposal.ready_for_review`. O consumidor de
   notificação do navegador manda um aviso ao dono do negócio, se ele tiver papel `manager`
   ou acima; senão, a cada pessoa `manager`+ da organização com o navegador inscrito. Clicar
   abre a proposta.
4. Na lista de propostas, rascunho criado pela IA mostra "Aguardando revisão" e aparece
   primeiro.

**4B — no WhatsApp da equipe (só onde o "Aviso no WhatsApp" está configurado)**

1. **Configurações › Propostas** ganha a chave **Avisar no WhatsApp da equipe quando a IA
   rascunhar uma proposta**, ligada por padrão. O número e a conexão são os do "Aviso no
   WhatsApp" que já existe; sem ele configurado e ligado, nada sai.
2. Com as duas coisas ligadas, o evento `proposal.ready_for_review` vira uma mensagem ao
   número da equipe, com o título da proposta, o primeiro nome do cliente e o link.
3. Reaproveita o transporte, o espaçamento anti-bloqueio e o teto diário do aviso de caso,
   e não cria tabela (D12).
4. Antes de enviar, confere se a proposta ainda é rascunho e se o aviso da Central ainda
   está aberto; senão, não envia. Falha definitiva (canal desconectado por tempo demais,
   envio recusado três vezes) fica registrada na auditoria.

**Não é:** e-mail; aviso ao cliente; preferência por usuário no servidor (o navegador já
tem a sua).

**Arbitragem declarada:** 4B ligado por padrão. A razão: quem configurou o aviso de caso já
escolheu receber no WhatsApp o que precisa de decisão humana, e o teste de 26/09 mostrou
que a proposta é exatamente isso. Desligar é um clique.

**Aceite:** rascunho criado pela IA → item aberto na Central com severidade `warn` e título
com o nome; com o navegador inscrito, a notificação chega. Preencher tudo e confirmar
modelo e preço → o aviso fecha. 4B: com aviso configurado, a mensagem chega ao número; com
a chave desligada, não chega.

**Prova na tela:** permitir notificações no navegador → provocar um rascunho → ver a
notificação e o sino → abrir → preencher tudo → ver o aviso sair da Central.
**Caminho do erro:** descartar o rascunho antes do envio do WhatsApp sair — a entrega fica
cancelada, sem mensagem.

### Item 5 — A empresa cadastra os próprios modelos

**Comportamento**

1. **Configurações › Propostas › Modelos** lista os 8 modelos da plataforma e os da
   empresa, com nome, origem ("da plataforma", "personalizado", "da empresa") e número de
   seções.
2. **Personalizar** um modelo da plataforma cria a cópia da empresa com o mesmo
   identificador — a partir daí, toda proposta nova que usar aquele modelo usa a cópia.
   **Voltar ao modelo da plataforma** desativa a cópia.
3. **Novo modelo** cria um modelo da empresa em branco, com nome e identificador próprios.
4. O editor de modelo edita nome e descrição e, por seção: título, texto (com
   `{{variáveis}}`), obrigatória ou condicional, subir, descer, remover e adicionar. Ao lado,
   a lista das variáveis que o texto usa, com o nome legível de cada uma.
5. **Criar a partir de um arquivo:** a pessoa envia a proposta que a empresa já usa (PDF,
   `.md` ou `.txt`, até 5 MB). A IA a converte em seções, trocando dados de um cliente
   específico por variáveis do vocabulário conhecido. O resultado abre no editor para
   revisão; **nada é gravado até a pessoa salvar**. DOCX é recusado com a instrução de
   exportar para PDF.
6. A IA do atendimento passa a enxergar os modelos da empresa sem ferramenta nova (D11):
   `crm_draft_proposal` aceita o identificador de um modelo da empresa, e quando recebe um
   identificador que não existe, a recusa lista todos os modelos válidos daquela
   organização (identificador e nome) para a próxima tentativa.
7. O seletor de modelo da proposta (item 1) lista os mesmos modelos.
8. Só `manager` ou acima cria, altera, importa ou desativa modelo — na rota e na política
   do banco.

**Não é:** biblioteca pública de modelos entre empresas; DOCX; conteúdo em espanhol;
versionamento com histórico navegável (a versão sobe a cada alteração, e a proposta enviada
guarda o próprio snapshot, como já é hoje).

**Aceite:** personalizar "Catálogo imobiliário", trocar o texto de uma seção, e a próxima
proposta com esse modelo mostra o texto novo; importar um PDF de proposta real gera
seções editáveis sem gravar; um usuário `agent` recebe 403 ao salvar.

**Prova na tela:** importar a proposta que a empresa já usa → revisar → salvar → pedir
orçamento no WhatsApp → o rascunho usa o modelo da empresa. **Caminho do erro:** enviar um
DOCX (instrução de exportar); enviar um PDF só de imagem (mensagem de "arquivo sem texto").

---

## 3. Decisões e o porquê

| # | Decisão | Por quê |
|---|---|---|
| D1 | A pendência é calculada **num lugar só**, usado pelo `GET` do documento, pela trava de envio, pelo snapshot e pelo PDF | Hoje o cálculo está copiado em `documento/route.ts` e duas vezes em `send/route.ts`; o item 1 muda a regra, e três cópias divergiriam |
| D2 | `approval.date` vira linha em branco, nunca pendência | É a data da assinatura do cliente; ninguém a sabe no envio |
| D3 | `client.company` continua pendência preenchível | Pessoa física existe; a tela explica "se for pessoa física, escreva o nome" em vez de inventar |
| D4 | O PDF do documento substitui o de itens **só com modelo confirmado** | Proposta sem modelo é o caso antigo, e o PDF de itens continua certo para ela |
| D5 | A IA só sugere valor para campo que está vazio, e nunca grava sozinha — a pessoa confirma campo por campo | Evita guardar "quem escreveu cada chave" (seria coluna nova), garante que a correção humana nunca é desfeita, e tira da IA a decisão de QUANDO a conversa já basta (era o defeito medido em §1.1) |
| D6 | *(revogada em 26/09/2026)* Existia uma trava de servidor que recusava rascunhar sem briefing completo | O item 2 mudou de desenho antes de qualquer plano executá-la: em vez de a IA decidir quando parar de perguntar, a pessoa decide quando clicar "Preencher com a conversa". Mantida na tabela só para quem ler o histórico da spec não estranhar a lacuna no número |
| D7 | O aviso WhatsApp de proposta não usa a tabela de entregas do aviso de caso | `entregas_de_aviso_de_caso.case_id` é `not null` com FK para caso; afrouxar mexeria no módulo de 6 mil linhas que já funciona |
| D12 | …e também não cria tabela própria: a baixa do evento no `event_log` é a trava contra envio em dobro, e a chave fica em `organizations.settings.proposals` | Uma tabela nova entraria em três cercas medidas (`rls-completude-varredura`, `cascata-lgpd-nao-encolhe`, isolamento RLS) e pediria a tripla de migration; a configuração do aviso de caso só é gravável pela função `security definer` `fn_definir_aviso_de_caso`, que revalida papel, suporte e MFA. O preço aceito: uma queda exatamente entre o envio e a baixa do evento pode repetir o aviso — para a EQUIPE, nunca para o cliente |
| D8 | Cópia da empresa usa o mesmo identificador do modelo da plataforma | É o que `resolverModelo` já faz ("a cópia da organização sempre vence") |
| D9 | Escrita em `proposal_templates` passa a exigir `manager` no banco | Decisão #10 da spec de 21/09; a política atual (`agent`) deixaria um atendente reescrever o texto que vai a todo cliente pela API |
| D10 | Importação sem armazenar o arquivo | O texto extraído vira seções e o arquivo não é mais necessário; guardar seria dado duplicado sem consumidor |
| D11 | Nenhuma ferramenta nova de IA; a recusa de `crm_draft_proposal` lista os modelos válidos (P5) | Medido em 26/09 com o catálogo real (`tests/unit/pacote-reserva-vaga-da-critica.test.ts` reproduzido com 0, 1 e 2 ferramentas a mais no pacote `vender`): hoje o agente nasce com 22 e só `evoluir` cabe, com 27 de 27; com +1 ferramenta vira 28 e **nenhum** pacote cabe, com +2 vira 29. Subir `TETO_TOOLS_POR_AGENTE` pela quarta vez é decisão de produto maior que este pedido. **Atualizado em 26/09/2026:** a parte "`crm_draft_proposal` rascunha ou completa" saiu com a revisão do item 2 — a ferramenta não ganha um segundo modo; o teto continua relevante só porque P5 ainda toca a mesma ferramenta (a recusa por slug inválido) |
| D16 | O botão "Preencher com a conversa" (item 2 revisado) chama uma ROTA HTTP, nunca uma tool MCP | Mesmo raciocínio de D11: qualquer tool nova disputaria a mesma vaga zero do pacote `vender`. Uma rota chamada pelo editor (papel `manager`) não tem esse custo — é o mesmo padrão de `proposal_assistant`, que já existe e já é uma rota |
| D17 | O ponto de IA `proposal_fill_from_conversation` entra no registro (`lib/ai/pontos/registro.ts`) como um ponto separado de `proposal_assistant`, mesmo chamando o modelo do mesmo jeito | São UI e propósito diferentes (preencher documento vs. ajustar itens/condições por instrução); a tela de proveedores de IA precisa listar os dois, e a cerca de completude exige um `purpose` por entrada |
| D18 | `orcamentoDeIaDisponivel` passa a aceitar o `purpose` de quem chama, em vez de fixar `"proposal_assistant"` | Sem isto, uma futura tela de disponibilidade para `proposal_fill_from_conversation` mentiria sobre isenção de orçamento (checaria a lista errada de purposes isentos) — corrigido no P2 mesmo sem essa tela existir ainda, porque o descuido já estava lá para o próximo consumidor herdar |

---

## 4. Fora do escopo, medido e registrado

- **A prontidão lê uma chave que ninguém grava.** `lib/propostas/prontidao-da-proposta.ts`
  procura `briefing_json.escopo`; os modelos gravam `scope.*`. A prontidão também não
  aparece em tela nenhuma. Registrado na fila.
- **Resumo comercial.** `GET /documento` devolve `resumoComercial: null` sempre; a §6.1 de
  21/09 o desenhava. Não entra aqui.
- **Espanhol do conteúdo dos modelos** continua onda futura (§9 de 21/09). Os textos de tela
  novos têm entrada em espanhol, como exige `tests/unit/i18n-espanhol-cobre-a-tela.test.ts`.
- **Nenhum teste e2e de proposta existe** (`ls tests/e2e | grep -i propos` vazio). A prova
  é a do dono na tela, com os roteiros acima.

---

## 5. Ordem e dependências

```
P0 (sai o preenchimento de campos do funil pela IA — subsistema à parte, sem dependência daqui)

P1 (documento editável que chega) ──┬─> P2 (preencher com a conversa)
                                    ├─> P4A (aviso no sistema e no navegador) ──> P4B (WhatsApp)
                                    └─> P5 (modelos da empresa)
```

P2, P4A e P5 usam o módulo de pendências e os nomes legíveis criados no P1. Nenhum depende
de P2 nem de P5 entre si; P5 pode rodar em paralelo a P2, contanto que os dois partam de uma
base com P1 aplicado.

**Revisado em 26/09/2026:** a ordem tinha P2 → P3 em série (a IA esperava, depois completava).
Os dois viraram um único item 2 redesenhado (P2 novo, "preencher com a conversa"), que só
depende do P1. P0 não pertence a este subsistema — é uma remoção no CRM (campos do funil),
decidida na mesma conversa, sem relação de dependência com P1–P5.

---

## 6. Sistema vivo (DoD 13)

| Item | Entrada | Saída | Tela | Registro | Anti-morte | Laço de retorno |
|---|---|---|---|---|---|---|
| 1 | pessoa edita seção/campo | PDF do documento no WhatsApp | editor da proposta | `api_audit_log` (`proposal.documento_editado`, `proposal.documento_campo_preenchido`) | trava de envio nomeia o que falta | pendência que sobra volta à tela antes do envio |
| 2 | pessoa clica "Preencher com a conversa" | caixa do campo pré-preenchida (grava só ao clicar "Preencher", que já é o laço do item 1) | editor da proposta | `llm_calls` (ponto `proposal_fill_from_conversation`) | sem sugestão, o botão não trava nada — a caixa fica vazia e a pessoa digita | clicar de novo mais tarde repete só para o que ainda falta |
| 4A | evento `proposal.ready_for_review` | notificação + aviso `warn` | Central, sino, lista | `event_log`, `agent_inbox_items` | aviso só fecha quando pronto | aviso aberto enquanto houver pendência |
| 4B | mesmo evento | mensagem ao número da equipe | Configurações › Propostas (a chave) e Aviso no WhatsApp (o número) | auditoria `proposal.aviso_whatsapp_*` + `pacing_ledger` | evento velho (30 min) não sai; proposta que saiu de rascunho não sai | falha definitiva auditada; o aviso da Central continua aberto |
| 5 | pessoa ou arquivo | modelo usado nas propostas | Configurações › Propostas › Modelos | auditoria `proposal_template.*` | modelo inválido não salva | — |

Portas de navegação (DoD 14): a tela de modelos entra em `lib/navigation/catalogo.ts`.

---

## 7. Destino (DoD 18)

**Núcleo**, atrás da capacidade `propostas` que já existe. Se nenhuma organização ligar
propostas, a operação comum continua inteira — mas o recurso já foi distribuído, e a
doutrina de extensões proíbe extraí-lo sem equivalência. Nenhum item cria dependência do
núcleo em relação a propostas.

---

## 8. Versão (DoD 17)

Cada plano traz um fragmento em `.changes/`: P1 `corrigido` / `capacidade_nova`
(proposta com modelo passa a poder ser enviada); P2 (novo, "preencher com a conversa")
`adicionado` / `capacidade_nova`; P4A e P4B `adicionado` / `capacidade_nova`; P5 `adicionado` /
`capacidade_nova`. Nenhum exige ação de quem opera a VPS: a única migration (P5) é aditiva e
o `update.sh` a aplica. P0 (remoção do preenchimento de campos do funil pela IA) não é deste
subsistema e não traz fragmento: a versão publicada já anuncia que essa capacidade não existe
mais (CHANGELOG, linha 748, de 22/09/2026) — não há nada novo a dizer ao operador.
