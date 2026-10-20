---
type: threat-model
project: DeskcommCRM
status: draft
last_updated: 2026-07-29
generated_by: auditoria documental (Claude Code) — leitura de rotas, guards, proxy.ts e lib/env.ts
confidence: média-alta (superfície e guards são CONFIRMADO por leitura de código; explorabilidade é INFERIDO — nada foi testado contra instância viva)
audited_against: origin/main @ 789dfa6 (v1.0.0, 2026-07-27)
---

# Threat model — DeskcommCRM self-host

Complementa [`SECURITY.md`](../SECURITY.md), que é política de *reporte*. Este documento é
o inventário da **superfície de ataque real**: o que fica exposto quando alguém sobe o
DeskcommCRM numa VPS com IP público.

**Modelo de implantação que muda tudo:** o produto é self-host open-source. O atacante
tem o **código-fonte completo** — conhece cada rota, cada nome de env var, cada fallback.
Segurança por obscuridade vale zero aqui. E o operador é tipicamente uma PME sem equipe
de segurança: um default inseguro não vai ser corrigido por ele.

**Nada aqui foi explorado.** Nenhum ataque foi executado, nenhuma instância foi tocada.
São conclusões de leitura de código.

---

## 1. Superfície exposta sem sessão

`lib/auth/public-paths.ts` define o que passa sem checagem de auth no `proxy.ts`
(middleware do Next 16). CONFIRMADO:

| Path | Guard próprio dentro da rota | Rate limit |
|---|---|---|
| `/`, `/login`, `/signup`, `/auth/confirm` | Supabase Auth | ❌ |
| `/team/accept-invite/:token` | HMAC-SHA256 + `timingSafeEqual` (`lib/auth/invite-token.ts`) | ❌ |
| `/api/v1/health` | nenhum (por design) | ❌ |
| `/api/v1/webhooks/waha/:token` | HMAC-SHA512 + `timingSafeEqual` (`lib/waha/ingest.ts`) | ❌ |
| `/api/v1/webhooks/waha` (global, sem token) | só rede interna: requisição com marca de proxy de borda recebe 404 (`chegouPelaBorda`, `lib/http/ip-do-cliente.ts` — régua de cabeçalho, válida nos proxies do kit: Caddy, Traefik, Nginx Proxy Manager, túnel da Cloudflare); depois, o mesmo HMAC. Com a porta do app publicada direto, a camada que vale é a assinatura do remetente (`/admin/sistema`) | ❌ |
| `/api/v1/webhooks/in/:token` | path token + assinatura opcional | ✅ 60/min por token |
| `/api/v1/webhooks/nuvemshop/*` | HMAC | ❌ |
| `/api/v1/webhooks/cobranca/:provedor` | Stripe: `Stripe-Signature` (HMAC com horário). Asaas: token estático em `asaas-access-token` (sha256 + `timingSafeEqual`); o corpo é só ponteiro e a decisão vem da releitura. Token vazado: o dono gera outro em Admin › Cobrança › Conexão, "Testar e conectar" de novo | ✅ recusas 120/min por IP; Asaas, avisos válidos de cliente desconhecido 120/min por provedor, chave global (acima, 200 sem gravar) |
| `/api/v1/cron/*` (9 rotas) | `Bearer INTERNAL_CRON_SECRET\|INTERNAL_SECRET`, **fail-closed** | ❌ |
| `/api/mcp` | `Bearer tok_...` validado contra `api_tokens` (hash SHA256) | ❌ |
| `/403`, `/404`, `/500`, `/503`, `/admin/forbidden` | — | ❌ |

**Leitura:** a autenticação de cada superfície está bem construída — HMAC com
`timingSafeEqual` em 6 módulos distintos, crons fail-closed, bearer só via header
(nunca query string), plaintext do token nunca persistido. O problema **não é o guard;
é a ausência de limite de tentativas na frente dele.**

### 1.1 O proxy da borda também é superfície (e o túnel, uma borda terceirizada)

No stack padrão, o `Caddyfile` responde **403** a `/api/v1/webhooks/waha` — o webhook
global, sem token na URL — antes de chegar ao app. O `docker-compose.traefik.yml`
reproduz esse bloqueio; o `docker-compose.npm.yml` deixa o roteamento para o painel do
NPM, e ali o bloqueio é responsabilidade do operador.

O `docker-compose.cloudflared.yml` (instalação atrás de NAT, `REVERSE_PROXY=cloudflared`)
**não tem como impor o 403 pelo compose**: o roteamento é administrado à distância, no
painel da Cloudflare. Quem recusa é o próprio app: a rota global responde 404 ao que
chega com marca de proxy de borda, e o túnel marca com `cf-connecting-ip` (ver a linha da
rota na tabela acima). A assinatura do remetente é opcional e desligada de fábrica
(`/admin/sistema`); uma regra de WAF no painel é camada extra, opcional.

Fora isso, o túnel **reduz** a superfície clássica: não publica porta de entrada nenhuma
(nada de 80/443 escutando), então a varredura de porta e o `network_mode: host` que este
documento assume como premissa não existem nesse modo. O token do túnel é credencial de
saída; vazá-lo permite publicar rotas no túnel da conta, e por isso ele nunca aparece em
log nem em query string.

---

## 2. Riscos por ordem de exploração

### T1 — Brute force e enumeração sem custo 🔴 CONFIRMADO (ausência), INFERIDO (impacto)

> ## ⚠️ ENDEREÇADO DEPOIS DESTA AUDITORIA — releia antes de agir sobre T1
>
> Este documento foi auditado contra `789dfa6` (2026-07-27), e o front-matter diz isso. O
> corpo, porém, fala no **presente** — e um leitor decide pelo corpo. Medido em 2026-08-14 na
> `main`:
>
> - **`lib/auth/rate-limit.ts` existe** e foi escrito para fechar exatamente este risco: o
>   cabeçalho cita a issue #64 e nomeia login, signup, recuperação de senha e aceite de convite.
> - É usado nos **quatro** pontos que o texto abaixo diz estarem descobertos:
>   `app/actions/auth/signInWithPassword.ts`, `signUp.ts`, `requestPasswordReset.ts` e
>   `app/team/accept-invite/[token]/page.tsx`.
> - Limites em vigor (`AUTH_LIMITS`): `login` 5 por identificador / 300 s, `signup` 20 por IP /
>   3600 s, `reset` 30 IP e 3 id / 3600 s, `invite_accept` 60 por IP / 3600 s.
> - **A sub-afirmação "não existe lockout por conta" sobrevive à letra e morre no espírito.** A
>   sonda que o texto usa (`grep lockout|failed_attempts`) devolve **zero** — ainda hoje. Mas
>   `rate-limit.ts:158/165` conta falha de login **por conta**, na chave
>   `auth:login_fail:id:<hash>`. A sonda é cega para o mecanismo que existe, e é o exemplo mais
>   limpo deste documento de por que ausência de sonda não é ausência de defesa.
>
> **O veredito 🔴 NÃO foi rebaixado aqui, de propósito.** Rebaixar risco de segurança pede
> reauditoria com teste contra instância viva, que é o que o próprio `confidence` do
> front-matter diz nunca ter havido. O que esta nota faz é corrigir os **fatos** e marcar o T1
> como devendo reauditoria — não decidir por ela.

`checkRateLimit` existe (`lib/ai/dispatcher/rate-limit.ts`) e é chamado em vários pontos de
`app/` e `lib/`, o webhook `/api/v1/webhooks/in/:token` entre eles. Reconte, não cite: `grep -rln 'checkRateLimit(' app lib --include='*.ts' | grep -v '\.test\.'`.

Não há **nenhum** limite de tentativa em:

- **`/login`** — e não existe lockout por conta: `grep` por `lockout` / `failed_attempts`
  não retorna nada. Senha fraca de operador é atacável na velocidade da rede.
- **`/signup`** — criação de organização em massa; num self-host multi-tenant isso é
  exaustão de recurso (e de cota de IA, se as chaves forem da instância).
- **`/team/accept-invite/:token`** — o HMAC é forte, mas sem limite o atacante pode
  sondar indefinidamente e sem custo, e sem gerar sinal de alerta.
- **Os 9 crons** — o secret é forte e a comparação é em tempo
  constante, mas nada limita o volume de tentativas.
- **`/api/mcp`** — enumeração de bearer token.

**Mitigação recomendada:** aplicar `checkRateLimit` por prefixo no `proxy.ts` (uma passada
cobre todo o surface público de uma vez) + limite por identificador nas rotas de auth
(por e-mail no login, não só por IP — IP rotativo é trivial). Custo baixo, a infra já existe.

### T2 — Fallback in-memory do rate limit anula o limite que existe 🟠 CONFIRMADO

`lib/ai/dispatcher/rate-limit.ts:23` — sem `UPSTASH_REDIS_REST_URL`/`_TOKEN` o contador cai
para um `Map` em memória do processo. Consequências:

- É o estado **normal de um primeiro deploy** (Upstash é serviço externo; `lib/env.ts:69`
  trata as duas vars como opcionais em dev e obrigatórias só em produção).
- Multi-instância ou multi-worker ⇒ limite por processo, não por tenant.
- O único sinal é um `logger.warn` uma vez por processo. Um operador de PME não vai ver.

O stack de produção do kit inclui `serverless-redis-http` + Redis local (visto em
`docker-compose.prod.yml`), o que resolve — **A CONFIRMAR** se o `install.sh` garante que
essas duas vars ficam populadas em toda instalação.

### T3 — 89 handlers com service role, sem gate de escrita 🟠 CONFIRMADO (contagem)

`createAdminClient` (service role, **bypassa RLS**) é importado em **89 dos 169** route
handlers de `app/api/**` (dos quais 166 estão sob `/api/v1/`). A regra da doutrina —
"filtre `organization_id` manualmente, resolvido de fonte
confiável, nunca do body" — é aplicada por revisão humana. Não há lint rule nem teste que
falhe quando um handler *novo* esquece o filtro.

Este é o **pior modo de falha do produto**: vazamento cross-tenant. Duas mitigações reais
existem: as amostras que li (`admin/tenants`, `webhooks/in/:token`, `team/:user_id`) seguem o
padrão corretamente, e os **56 arquivos de invariante em `tests/invariants/` rodam no CI**
(job `invariants` → `pnpm test:db`), cobrindo isolamento cross-tenant de verdade. O
guard-rail existe **e está ligado** — rebaixei de 🔴 para 🟠 por isso.

**Lacuna residual:** os invariantes provam que os caminhos cobertos isolam; não impedem que
um handler novo nasça sem filtro e sem invariante correspondente.

**Mitigação recomendada:** regra de ESLint custom (ou teste que varre o diff) que falhe
quando um arquivo importa `lib/supabase/admin` sem referenciar `organization_id`. Barato,
determinístico, e transforma disciplina em gate.

### T4 — Secret de convite com fallback conhecido 🟠 CONFIRMADO no código, mitigado na prática

`lib/auth/invite-token.ts:16`:

```
INVITE_TOKEN_SECRET → INTERNAL_SECRET → "dev-fallback"
```

Se a cadeia chegar em `"dev-fallback"`, qualquer pessoa com o repo público forja um token
de convite válido — payload inclui `organization_id` e `role`, ou seja: **admin em qualquer
org**.

**Mitigação existente:** `INTERNAL_SECRET` é `required()` em `lib/env.ts:47`, que em
`NODE_ENV=production` **derruba o boot** se estiver vazio. Então numa instância de produção
que subiu, o fallback é inalcançável (INFERIDO — depende de o self-host rodar com
`NODE_ENV=production`, o que é o esperado com `next start`).

**Residual:** (a) em dev a validação afrouxa e a var vira `""` — e string vazia é falsy,
então cai no `"dev-fallback"`; (b) `invite-token.ts` lê `process.env` **cru**, contornando
o Zod, então não herda garantia nenhuma; (c) `INVITE_TOKEN_SECRET` não existe em
`lib/env.ts` nem em `.env.example`, só em docs de épico.
Já está rastreado pelo projeto como risco **M4** em `docs/testing/user-journey-map.md` —
crédito onde é devido.

**Mitigação recomendada:** eliminar o literal. Falhar alto (`throw`) quando nenhum secret
existe, em vez de degradar para um valor público.

### T5 — Secrets ausentes do `.env.example` 🟠 CONFIRMADO

`IMPERSONATE_COOKIE_SECRET`, `INTERNAL_CRON_SECRET`, `LGPD_SIGNING_KEY` estão em
`lib/env.ts` e **não** no template. O operador não sabe que precisa gerá-los.

Como são `required()` (obrigatórios só em produção), o efeito mais provável é falha de boot
com mensagem clara — que é o comportamento seguro. O risco real é indireto: instalação
frustrada, operador colando valor fraco ("123456") só para o app subir, ou reaproveitando
o mesmo valor em todos.

### T6 — SSRF em webhook de saída 🟢 MITIGADO — CONFIRMADO

`lib/automation/outbound-url.ts` + `outbound-url.test.ts` + `lib/automation/actions/call-webhook.ts`
implementam guard de URL de saída, e existe E2E dedicado
(`tests/e2e/vps-webhook-outbound-ssrf.spec.ts`). É a defesa mais bem feita do repo.

**Ressalva:** esse E2E **não roda no CI** — e é a única prova automatizada do guard.
`outbound-url.test.ts` é unitário e roda, o que cobre a lógica de decisão; o que não roda é a
prova de que o egress real está barrado ponta a ponta. Uma regressão na integração passa.

**Segundo egress do servidor (branch das extensões declarativas):** `lib/extensions/download.ts`
baixa o pacote de uma origem de catálogo que o dono da instalação admitiu. Guarda própria, não a
de webhook: só HTTPS, sem redirect, sem cookie nem credencial, DNS resolvido uma vez e o endereço
amarrado à conexão (sem janela de rebinding), endereços especiais IPv4/IPv6 recusados, teto de
bytes contado no corpo lido e prazo total de 15 s. A exceção HTTP em loopback
(`EXTENSIONS_LOCAL_CATALOG_ORIGIN`) só vale com o app também em loopback. Para ver o que roda:
`pnpm exec vitest run lib/extensions/download.test.ts lib/extensions/download-rebinding.test.ts`.
**Ressalva do mesmo tipo:** o caminho HTTPS real (SNI, certificado, lookup amarrado) não é
exercitado por nenhum gate — os testes usam HTTP local e um dublê do lookup.

### T7 — Sem varredura de secret no histórico git 🟡 CONFIRMADO

Sem gitleaks/trufflehog no CI, sem pre-commit hook (`.husky` e `.pre-commit-config.yaml`
ausentes). `.gitignore` cobre `.env*` corretamente, e essa é a única camada.

Agravante específico deste repo: a doutrina de QA visual **incentiva commitar evidência
visual**, e há **116 PNGs rastreados** (85 em `evidence/` contando subpastas, 18 em
`docs/evidence/`, 13 em `loop/checkpoints/evidence/`). Screenshot de tela autenticada pode conter telefone, nome de
cliente ou token em URL — e várias evidências são explicitamente descritas nos HANDOFFs como
tiradas em **conta e conversa reais de WhatsApp**. Num repo público, é irreversível.

Não é argumento contra a doutrina de evidência visual, que é boa. É argumento para um passo
de revisão de PII antes do commit — e `gitleaks` não pega isso, porque não lê imagem.

### T8 — Onde a auditoria é cega ⚪ NÃO IDENTIFICADO

Não avaliado por falta de execução/instância:

- Se as políticas RLS **realmente** isolam (os invariantes existem para provar; não foram rodados).
- Postura do container WAHA — `docker-compose.prod.yml` comenta "Core por default, dashboard
  off", mas exposição de porta e rede não foram verificadas contra instância viva.
- Config do Caddy (`Caddyfile`) — TLS, headers de segurança, HSTS.
- Se `next.config.ts` define CSP / security headers.
- Storage: se o bucket `whatsapp-media` está privado de fato e se a expiração das signed
  URLs é adequada.
- Storage, e este é MEDIDO e DECLARADO em vez de "não avaliado": `brand-logos` (migration
  0158) é o **único bucket público** do repositório — todos os outros nascem
  `public = false` (inclusive `catalog-photos`, das fotos do catálogo, migration 0390), e
  quem conta é `tests/invariants/marca-logo.test.ts`, que reprova um segundo bucket público. A exceção existe porque o logo é renderizado num `<img>` da tela de
  **login**, servida a quem não tem sessão, e URL assinada **vence**: a marca da instalação
  sumiria da fachada sozinha no dia do vencimento. O que a contém, e o que
  `tests/invariants/marca-logo.test.ts` reprova quando deixa de valer: bucket **exclusivo**
  de logo (nada de conversa, export ou base de conhecimento mora nele, então "público" não
  vaza histórico de cliente), **zero policy** em `storage.objects` citando o bucket
  (`public = true` abre a LEITURA pelo endpoint `/object/public/...`; INSERT e DELETE
  continuam só no `service_role`), caminho **não-enumerável** (`<prefixo>/<uuid v4>.<ext>`)
  e teto de 512 KB. O que entra é decidido pelos **bytes** (`lib/branding/logo-arquivo.ts`),
  nunca pelo `Content-Type` — `allowed_mime_types` do bucket e `file.type` na rota leem a
  mesma string que quem sobe escolhe. **SVG é banido**: este repo não define CSP (ver o item
  acima sobre `next.config.ts`), e SVG navegado direto do endereço da imagem executa script.
  O que NÃO está coberto: um logo subido é **público para sempre até ser trocado** — quem
  subir por engano uma arte confidencial precisa removê-la pela tela, e a URL antiga deixa
  de existir junto com o arquivo (a rota apaga o anterior na troca).
- Escopo do service role key no Supabase e rotação de chaves.
- Efetividade do `beforeSend` do Sentry contra PII real.

### T9 — Assistente interno: o modelo lê por dentro e recebe agregado 🟢 MITIGADO — CONFIRMADO

`POST /api/v1/ai/assistente/chat` (F1b) é superfície **com sessão**: cookie, `requireRole("viewer")`,
corpo Zod `.strict()`, sem entrada em `public-paths.ts` — a auth de borda vale. O risco não é
quem entra, e sim o que o turno faz lá dentro:

1. **Chamadas por dentro.** Os adaptadores chamam rotas `GET` na mesma requisição, herdando
   login, papel e organização (`lib/assistente/metricas/chamar-rota.ts`). O modelo nunca enxerga
   além do que a pessoa já vê — exceto `ctx.bancoDaInstalacao` (service role, só para os
   interruptores de módulo sem policy para a sessão). A cerca é propositalmente estreita: só 4
   arquivos citam o campo e nenhuma métrica o usa (`tests/unit/assistente-banco-da-instalacao-so-para-modulos.test.ts`).
2. **Dado que vai ao modelo.** Só agregado, por lista positiva por métrica + varredura de chaves
   proibidas (`lib/assistente/metricas/projecao.ts`): e-mail, telefone, nome de contato, título
   de negócio, motivo livre e prévia de mensagem nunca passam. **Residual honesto:** o ponto de IA
   aceita `base_url` arbitrária, então o agregado pode ir a servidor terceiro — a contenção é a
   lista positiva, não o destino. O `board` do funil foi excluído do catálogo exatamente por
   carregar `last_message_preview`.
3. **Contexto da tela.** O painel manda caminho + id do objeto aberto; o servidor valida que o id
   pertence à org da sessão antes de usar (`lib/assistente/contexto-da-tela.ts`). O assistente
   nunca navega sozinho e nunca publica: `abrir_tela` devolve botão com destino do catálogo.
4. **Abuso de custo (insider).** 12/min por pessoa e 60/min por organização (`checkRateLimit`),
   mais teto diário configurável (padrão 60 por pessoa, org sem limite — IA-12) e teto mensal em
   dinheiro por cima. Replay do mesmo `turn_id` não conta nem chama o modelo. **Residual:** uma
   pessoa legítima ainda consegue gastar a chave da org até o teto — é limite, não prevenção.
5. **Auditoria e erro.** `ai.assistente_asked` grava `turn_id`, fonte, métricas e `call_id`, nunca
   o texto (`lib/audit/actions.ts`). A mensagem do erro nunca vai à resposta, ao aviso, à linha
   gravada nem ao log — só o nome (`assistente.chat.modelo_nao_respondeu`).
6. **Piso.** Sem chave, teto estourado, erro ou texto vazio, a resposta é o determinístico da F1
   (resumo + guia, mesmos dados com RLS) com aviso do motivo e `error_code` na linha.

### T10 — Assistente interno com ferramentas de escrita (F2a) 🟢 MITIGADO — CONFIRMADO

A F2a dá ao turno do assistente 5 ferramentas que ESCREVEM (`criar_rascunho_de_agente`,
`instalar_modelo_de_followup`, `montar_pacote_do_nicho`, `montar_followup_de_nicho`,
`testar_agente`), só quando o papel DA SESSÃO é `admin` — os outros papéis continuam
só com as de leitura. As 5 regras de conduta (§12.C) valem para TODO papel; o admin
recebe a regra 3 com "ler de volta o que executou" (`prompt.test.ts` vigia os dois
lados):

1. **Superfície.** As ferramentas chamam as rotas `POST` por dentro
   (`chamarRotaPorDentro`, mesma requisição, herdando login, papel e
   organização). Nenhuma escrita direta em tabela de negócio, nenhum service
   role no turno, nenhum `organization_id` vindo do modelo (os esquemas são
   `.strict()` e recusam org/papel/URL/SQL).
2. **O que nasce é rascunho.** Agente nasce `v1 draft`, follow-up por modelo
   nasce rascunho, nada é ligado a agente e nada é publicado — publicar
   continua sendo clique do administrador na tela (o cartão leva o botão
   "Abrir o agente"). `testar_agente` só roda versão em rascunho e declara o
   custo (chama o modelo e consome crédito).
3. **Conduta em código, não só em prompt.** Provedor/modelo/credencial vêm da
   configuração lida por dentro (nunca do que o modelo digita); sem credencial
   validada a ferramenta devolve PRECISO CONFIRMAR com o link da tela.
   Credencial, canal, billing, usuários e exclusões não têm ferramenta —
   viram "PRECISO CONFIRMAR" com o link. Toda escrita é lida de volta (id,
   nome, estado) antes de devolver, e o cartão tem `href` montado no servidor.
4. **Tenant da sessão.** As rotas de aplicar já filtram `organization_id` da
   sessão; o par do e2e (`assistente-rascunho-de-agente`: cartão na tela ×
   `GET ai/agents` direto, mesma sessão) prova que o rascunho nasceu na org
   certa e que `published_version_id` segue nulo.
5. **Propostas (F2b, T19): conteúdo e ids, nunca destino.** As 5 ferramentas
   `propor_*` (só `admin`) gravam uma linha `pendente` em `config_proposals`; o
   `payload` guarda `{ operacao, ids alvo, corpo }` num subconjunto curado e
   estrito, e rota/método/URL moram em `lib/assistente/propostas/operacoes.ts`
   — chave `rota`/`url`/`path`/`method`/`metodo` em qualquer nível é recusada.
   Nenhuma delas chama rota de escrita de roteador, conhecimento, memória,
   provedor ou funil (só GET e o POST de propostas); `credential_id` não existe.
6. **Insert pela sessão do admin, aplicação só na T20.** O POST de propostas usa
   o cliente da SESSÃO (RLS da 9002: `requested_by = auth.uid()`, `status =
   'pendente'`, papel admin), nunca service role; `organization_id` e `risk`
   saem da sessão e do código. O audit (`assistente.proposta_criada`) leva só
   tipo, operação e risco, sem o texto. Nada muda no negócio até o clique de
   aprovar e a rota de aplicar (T20).
7. **Rotas de ação (T20): só admin, CAS, trava, destino fixo, credencial
   preservada.** O GET da fila e as três ações (`aprovar`, `rejeitar`,
   `aplicar` em `propostas/[id]/…`) são sessão-cookie, `requireSupportWrite`
   antes de qualquer efeito e `requireRole("admin")` da SESSÃO; `[id]` é
   validado como uuid. O GET nunca escreve (`vencida` é CALCULADO, nunca
   coluna). A mudança de estado é exclusiva do servidor (a 9002 tirou
   `update` de `authenticated`): compare-and-swap no pool de serviço com o
   estado esperado na PRÓPRIA condição e `organization_id` da sessão como
   parâmetro — nunca do corpo; zero linhas lê a linha (com org) para explicar
   404 / expirada / estado inválido. O aplicar toma trava consultiva não
   bloqueante por proposta (`pg_try_advisory_lock`, liberada no `finally`),
   revalida o payload com `payload.ts` (linha antiga no banco não aplicada) e
   chama EXATAMENTE o destino do mapa (`operacoes.ts`) por dentro, na sessão
   do admin — o RBAC, a validação e o audit do handler valem; o dado nunca
   escolhe rota. `definir_ponto` preserva o `credential_id` que o binding do
   ponto já tinha (o PUT sem `credential_id` o apagaria); a proposta nunca
   escolhe credencial. Falha do destino deixa a proposta `aprovada`
   (`proposta_falhou_ao_aplicar`, 422/502) — o audit leva só kind, operacao,
   risk e `http_status`/`codigo_do_destino`, nunca o texto do payload nem o
   motivo da rejeição.

8. **Follow-up de nicho: o texto é do modelo, o desenho é nosso.** Em
   `montar_followup_de_nicho` o modelo escreve só os textos e as esperas dos
   toques (1 a 4); o grafo vem de `montarEscada` e é conferido por
   `flowGraphSchema` + `validateFlowForPublish` antes de gravar — o modelo nunca
   escreve JSON de grafo nem escolhe rota. O texto com chaves `{}` é recusado
   (o modo texto não preenche marcador e a chave sairia LITERAL para o cliente).
   A etapa do gatilho é conferida na organização da SESSÃO (RLS + `organization_id`
   da sessão), nunca aceita só pelo id. O que o texto escrito pelo modelo pode
   causar só existe depois do clique de Publicar, que é do administrador, que
   lê o texto no construtor; nada é ligado a agente. **Residual:** se o PATCH
   falha depois do POST fica um rascunho vazio (a resposta diz o nome; nenhuma
   ferramenta do assistente apaga).
9. **Prompts dos 7 nichos.** O texto que vira `system_prompt` é fixo no código
   (`lib/assistente/nichos`, igual ao `nichos.md` por teste), só com três
   marcadores — o modelo da conversa não reescreve o prompt do nicho. Os 5
   prompts novos foram escritos pelo assistente de código e **aguardam revisão
   do Paulo** antes de qualquer uso com cliente; saem como rascunho, e preço,
   prazo e política ficam por conta dos materiais da empresa, nunca do prompt.

**Residual honesto:** um admin legítimo ainda consegue criar rascunhos à
vontade até o teto de perguntas (IA-12) — é limite, não prevenção; e o
`testar_agente` gasta a chave da org a cada mensagem (o custo é declarado na
resposta, mas o teto diário conta perguntas ao assistente, não testes — ver
§4, pergunta 6).

---

## 3. Sumário de prioridade

| # | Risco | Sev | Custo do fix |
|---|---|---|---|
| T1 | Sem rate limit em login/signup/convite/crons/MCP | 🔴 | baixo — infra já existe |
| T2 | Rate limit degrada silenciosamente para memória | 🟠 | baixo |
| T3 | Service role sem gate de escrita para handler novo | 🟠 | médio (lint rule) — invariantes já cobrem em CI |
| T4 | `"dev-fallback"` como secret de convite | 🟠 | trivial |
| T5 | 3 secrets fora do `.env.example` | 🟠 | trivial |
| T7 | Sem scan de secret no CI + 116 PNGs de evidência sem revisão de PII | 🟡 | baixo |
| T6 | Guard de SSRF existe; o E2E que o prova não roda no CI | 🟢 | baixo |
| T9 | Assistente interno manda agregado ao modelo; residual é destino e gasto insider | 🟢 | — (construído com as cercas) |
| T10 | Assistente com escrita cria só rascunho (só admin); residual é gasto do Testar fora do teto diário | 🟢 | — (travas nas rotas + par no e2e) |

**Conclusão honesta:** os *mecanismos* de segurança deste projeto são acima da média para
um CRM open-source — HMAC em tempo constante em toda borda, fail-closed nos crons, hash de
bearer, RLS com helper central, guard de SSRF testado, LGPD implementada de verdade,
`beforeSend` higienizando PII, e **56 arquivos de invariante de isolamento rodando em CI**.

O que falta é estreito e específico: **limite de tentativa na frente dos guards**. Não há
falha de desenho aqui; há uma camada ausente, e ela é a mais barata de todas as que já foram
construídas.

---

## 4. Perguntas para o responsável

1. O `install.sh` garante `UPSTASH_REDIS_REST_URL`/`_TOKEN` populados em toda instalação?
   (decide a severidade de T2)
2. Alguma instância de produção já rodou sem `INTERNAL_SECRET` definido? (decide se T4 já
   foi exposto em campo)
3. Os 116 PNGs de evidência foram revisados quanto a PII antes do commit? Vários são
   descritos como tirados em conta e conversa reais de WhatsApp.
4. Existe branch protection exigindo os dois checks do CI verdes no merge? (não é visível
   no checkout)
5. Há intenção de pedir pentest externo antes de divulgar a v1.0.0 mais amplamente?
6. O gasto do `testar_agente` do assistente (F2a) entra no teto diário de perguntas
   (IA-12)? Hoje não: o teto conta linhas `human` em `config_messages`, e o Testar
   roda dentro de um turno já contado — cada mensagem de teste chama o modelo sem
   passar pelo limite. Se a resposta for "deve entrar", vira tarefa nova (contar
   testes no limite ou teto próprio); por enquanto o custo é só declarado na
   resposta da ferramenta.
