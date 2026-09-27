# Proposta: briefing universal, prévia fiel, modelos que se desligam e aviso que se vê

Data: 2026-09-27 · Destino: `vps/pljr-combinada` (a proposta comercial só existe nesta branch;
ver FILA, "A branch que vira PR da proposta está ~30 commits atrás").

## 1. O caso que originou esta spec (medido na VPS, organização do Paulo)

Proposta 0003/2026, conversa de um cliente pedindo site de imobiliária:

- a IA fez duas perguntas (material, prazo) e criou o rascunho 19 s depois de o cliente responder
  "certo, quero algo como o site da perfil" — antes de ele pedir a proposta;
- `crm_proposals.template_slug` ficou nulo (só `template_slug_sugerido = catalogo_imobiliario`),
  embora a organização tenha modelo próprio ativo para portal imobiliário;
- a pessoa enviou 5 s depois de editar; o envio caiu no PDF legado (sem seções);
- o aviso `proposta_pronta_para_revisao` abriu na Central; os dois canais externos pularam em
  silêncio (`event_log.last_error`: `web-push-inbound.v1: vapid_ausente`;
  `propostas-aviso-no-whatsapp.v1: sem_configuracao`). As chaves VAPID foram gravadas na VPS em
  27/09 (fora do código). O aviso no WhatsApp **não** será configurado: o Paulo não tem segundo número.

## 2. Contrato

### C1 — Envio exige modelo confirmado
- Proposta com `template_slug` nulo não é enviada: a rota de envio recusa com `422` e mensagem
  que diz o que fazer ("Escolha e confirme o modelo da proposta antes de enviar").
- Na tela, o botão "Enviar ao cliente" fica indisponível enquanto não houver modelo confirmado, com
  o motivo escrito ao lado.
- Hoje: recusa inexistente — `lib/propostas/documento/documento-da-proposta.ts:78` devolve `null`
  sem modelo e `app/api/v1/proposals/[id]/send/route.ts:271` cai em `renderPropostaPdf`; botão em
  `app/app/proposals/[id]/_client.tsx:524` só checa `salvando`.
- NÃO é: apagar o gerador legado nem mexer em propostas já enviadas.
- Testes que descrevem o comportamento ANTIGO e devem ser reescritos (não são regressão):
  `app/api/v1/proposals/[id]/send/route.test.ts:859` ("SEM template_slug … envio continua igual") e
  `:911` ("não recusa … quando a proposta não tem modelo").

### C2 — Prévia fiel ("Ver como o cliente recebe")
- Botão na tela da proposta abre o PDF que o envio geraria **naquele momento**, sem alocar número,
  sem mudar status, sem enviar, sem gravar no Storage. Onde o número apareceria, aparece
  "Prévia — sem número".
- A prévia e o envio montam o PDF pela **mesma** função (uma leitura, um dono). Uma diferença
  entre os dois é defeito por construção. Hoje não existe prévia (grep `preview|previa|prévia` em
  `app/app/proposals` e `app/api/v1/proposals`: só "prévia de mudanças" do `AssistantPanel`).
- Sem modelo confirmado a prévia mostra o mesmo motivo do C1, não o PDF legado.
- Permissão: a mesma de ver a proposta (`requireRole("agent")`), `organization_id` do cookie.

### C3 — Modelo da plataforma pode ser desligado; a IA enxerga os modelos da empresa
- Na tela de Modelos, cada modelo **da plataforma** ganha "Usar / Não usar". Desligado: some do
  seletor do editor, da lista que a IA recebe e da recusa `modelos_validos`; continua resolvendo
  para propostas que já o usam (`resolverModelo` não muda — proposta antiga não quebra).
- Guardado em `organizations.settings.proposals.modelos_ocultos` (lista de slugs), gravado por
  merge (nunca sobrescrever `settings` nem `settings.proposals`; ver merge atual em
  `app/api/v1/settings/proposals/route.ts:62-64`). Sem migration.
- Quem grava: uma ação nova na rota que a tela de Modelos já usa
  (`app/api/v1/settings/proposal-templates/route.ts`, união de `acao` na linha 22), com
  `requireRole("manager")`, `requireSupportWrite` e auditoria — **não** o PATCH de
  `settings/proposals`, cujo schema é fechado (linhas 14-22) e é de configuração geral.
- Rascunho cujo modelo foi desligado: o seletor do documento continua mostrando esse modelo, marcado
  "(desligado)" — nunca omite a opção corrente (o `<select>` controlado de
  `DocumentoCanvas.tsx:297` exibiria outra opção sem aviso).
- A IA deixa de receber a lista fixa `ROTULO_DO_MODELO` (`lib/mcp/tools/propostas.ts:60-69`) e passa
  a receber a lista **desta organização** (ativos, incluindo "Da empresa"), pela ferramenta do C5.

### C4 — Importar modelo: campos de verdade e retorno visível
- A importação passa a trocar por campo não só o dado de UM cliente, mas também o que **muda de um
  projeto para outro** (listas de páginas, módulos, funcionalidades, integrações, o que o cliente
  fornece), e marca como `conditional` as seções que nem todo cliente leva. Hoje a instrução
  (`lib/propostas/modelos/importar.ts:50-59`) manda manter a redação e trocar só dado do cliente —
  o modelo importado pelo Paulo ficou com 26 seções e 1 campo.
- Antes de salvar, a tela mostra "Este modelo vai pedir ao cliente: …" (rótulos dos campos) e avisa
  quando pede zero ou um campo.
- Retorno em cada passo: "Lendo o arquivo…" → "A IA está montando as seções (pode levar até um
  minuto)…" → tela de revisão; ao salvar, mensagem "Modelo salvo" visível na lista. Resposta que não
  é JSON (corte por tempo do proxy) vira mensagem de erro legível, nunca silêncio
  (`app/app/settings/tenant/proposals/modelos/_client.tsx:65-66` faz `res.json()` sem proteção).
- O texto da tela deixa de prometer o que a IA não faz.

### C5 — Briefing universal, com trava no código
- **Base comum, igual para qualquer produto** (site, automação, projeto especial sem modelo),
  aprovada pelo Paulo em 27/09. Sete categorias:
  1. `objetivo` — o que o cliente quer resolver;
  2. `entregas` — o que será entregue;
  3. `o_que_o_cliente_tem` — o que já existe e os acessos necessários;
  4. `responsabilidades` — o que fica com o cliente e o que fica com a empresa;
  5. `prazo`;
  6. `decisao_e_orcamento` — quem decide e quanto pretende investir;
  7. `referencia` — exemplo ou referência.
- As categorias **não são perguntas prontas**: a IA formula a pergunta do caso (em site,
  "o que o cliente tem" vira domínio/hospedagem/logo; em automação, acesso às contas e APIs).
- Resposta válida: um texto, ou a marca explícita "cliente não sabe" / "não se aplica" (para a
  conversa nunca travar).
- **Ferramenta nova de leitura para o Conversador** (ex.: preparar proposta): devolve os modelos
  ativos desta organização (slug, nome, origem), as sete categorias com uma orientação curta de como
  perguntar, e — quando recebe um modelo — os campos que ele pede, com rótulo legível. Hoje não
  existe ferramenta que devolva campos faltando (`grep -rnE "camposFaltando|variaveisFaltando|\bpendencias\b"
  lib/mcp lib/agent-engine`: nenhum; sem a fronteira de palavra o grep casa `DependenciasDoPonto`, que
  não é isto).
- `crm_draft_proposal` **recusa** (sem criar nada) quando falta categoria ou confirmação, e devolve
  a lista do que falta, para a IA perguntar. Não recusa por campo do modelo (esses a pessoa ainda
  completa no documento; a recusa de envio já existe em `send/route.ts:113-120`).
- **Confirmação do resumo:** o briefing leva a frase com que o cliente confirmou. Régua do código:
  normaliza (minúsculas, sem acento, espaços colapsados) e aceita se a frase for a mensagem
  **inteira**, ou um trecho de **12 caracteres ou mais**, de uma mensagem **recebida** desta conversa
  que chegou **depois da última mensagem enviada pela IA antes dela** (o lote do turno atual — um
  "sim" antigo não serve). O texto comparado é `body` ou, em áudio, `media_derived_text`. Sem
  transcrição ainda, recusa com motivo próprio ("a mensagem do cliente ainda está sendo
  transcrita"). (Decidir se é confirmação de verdade — "certo" com informação nova não é — continua
  com a IA; o código garante que não foi inventada nem é antiga.)
- Toda recusa diz o motivo exato e, na de confirmação, devolve a frase recebida, com a instrução
  "peça a confirmação ao cliente; não repita a ferramenta com a mesma frase".
- Teste que descreve o comportamento ANTIGO e deve ser reescrito: `lib/mcp/tools/propostas.test.ts:531`
  ("briefing é opcional").
- As sete categorias ficam gravadas em `briefing_json` sob uma chave própria, sem apagar as chaves
  que o documento já usa (`project`, `client`, `scope`, `included`, `excluded`).
- NÃO é: lista por nicho, pergunta fixa, nem mudança de modelo de IA.

### C6 — Aviso de proposta que se vê
- Quando nasce um `proposta_pronta_para_revisao` e a pessoa está com o CRM aberto, aparece um aviso
  em destaque (janela com o título e o botão "Abrir proposta") e, se o navegador permitir,
  notificação do sistema. Hoje o sino é polling de 60 s sem destaque (`hooks/ai/useAgentInbox.ts:28-38`).
- O Radar passa a listar "Propostas esperando revisão" (hoje só lê `crm_proposals` para
  vencidas sem retomada — `lib/leads/radar-de-risco.ts:400`).
- Ao resolver o aviso, `resolved_at` é gravado (hoje o update de
  `lib/propostas/aviso-de-revisao.ts:130-135` só troca `status`).

## 3. Critérios de aceite (prova pela tela, na VPS, pelo Paulo)

1. Rascunho sem modelo: "Enviar" indisponível com o motivo; forçar pela API devolve 422.
2. "Ver como o cliente recebe" abre o PDF com seções do modelo, igual ao que chega no WhatsApp
   depois do envio (mesmo conteúdo, só o número muda).
3. Desligar "Site institucional" da plataforma: some do seletor e a IA não o sugere; proposta antiga
   com ele ainda abre.
4. Reimportar o PDF do portal: a revisão lista os campos que o modelo pede; "Modelo salvo" aparece.
5. Conversa nova pedindo uma automação: a IA pergunta pelas sete categorias com palavras de
   automação; só cria o rascunho depois da confirmação do cliente; a sugestão de modelo sai da lista
   da empresa.
6. Rascunho criado pela IA com o CRM aberto: aparece o aviso em destaque e a linha no Radar.

## 4. Fora desta spec (na FILA)
Aviso órfão depois de "Apagar dados" (núcleo); custo do agente gravado como zero; mover o funil ao
enviar/aceitar; aceite pelo agente.
