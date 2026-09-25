# Proposta comercial por modelo — a onda seguinte, com conteúdo piloto

> ⚠️ **Substituída em 2026-09-23 por [`2026-09-23-proposta-comercial-design.md`](./2026-09-23-proposta-comercial-design.md).**
> Fica como histórico das decisões; quando discordar da nova, vale a nova.

> **Data:** 2026-09-21 · **Estado:** desenhado, não implementado.
>
> Esta spec é a **onda seguinte** que a §5.5 de
> [`2026-09-16-proposta-comercial-design.md`](./2026-09-16-proposta-comercial-design.md)
> adiou de propósito ("modelo por organização é onda seguinte, e sem demanda
> medida não entra"). A demanda foi medida: operação real de web design
> (PLJR) gera rascunhos pelados (título + R$ 0,00) que o dono reescreve à mão,
> e o agente cria um rascunho por turno sem olhar os anteriores (7 duplicadas
> medidas em 21/09/2026, apagadas).
>
> **Âmbito:** fork-local. **Decisão do dono em 21/09/2026: sem PR até validar**
> — o básico (rascunho → revisão → envio) ainda não foi provado em operação,
> e as regras da MAIN exigem evidência antes do PR. Quando validar, o caminho
> até o Rafael segue a §15 da spec-mãe.
>
> **Conteúdo piloto:** 8 modelos da PLJR Web Design Studio (institucional,
> landing page, e-commerce, catálogo imobiliário, site profissional, sistema
> web, automação, projeto personalizado), formato `template.json` v1.1.0
> (seções com texto, ordem, `required`/`conditional`, variáveis `{{...}}`).
>
> Toda afirmação técnica tem a medição ao lado. O que é decisão do dono está
> marcado com data.

---

## 1. O que existe hoje — medido, peça por peça

| O que o modelo precisa | Existe? | Onde, medido |
|---|---|---|
| Rascunho pelo agente | **Sim** | `crm_draft_proposal` (`lib/mcp/tools/propostas.ts`): `titulo` + `itens[]` (descrição, qtd, preço em centavos); cria em `crm_proposals` como `rascunho`, nunca envia |
| Número só no envio | **Sim** | `alocarNumero` (`lib/propostas/numeracao.ts`): aloca na transação do envio, `unique (organization_id, ano, numero)`, captura `23505` |
| Preço autorizado | **Sim** | `catalog_products` + tela `/app/products` + `crm_search_products`; a própria tela diz que o atendente de IA tira o preço dali |
| Editor com revisão | **Sim** | `/app/proposals/[id]`: edita itens (manual + busca no catálogo), condições e validade por proposta, envia, versiona |
| PDF | **Parcial** | `lib/propostas/pdf.tsx`: só cabeçalho + itens + total + condições. Não há seções, resumo, escopo corrido |
| Condições/validade por proposta | **Sim** | colunas `condicoes`, `valid_until` em `crm_proposals`; padrões globais em `/app/settings/tenant/proposals` |
| Versões | **Sim** | `versao`, `substitui_id` (§5.4 da spec-mãe) |
| Dedup de rascunho | **Não** | medido: 7 rascunhos do mesmo negócio em 1 hora; a ferramenta não olha os existentes. Trava de prompt (v26) é fita isolante |
| Seções por tipo | **Não** | nada no banco nem no PDF além de itens livres |
| Bloco-resumo comercial | **Não** | idem |
| Espanhol | **Exigido** | gate reprova texto de tela em PT sem ES; todo texto novo de seção/template precisa das duas línguas |

**Conclusão da medição:** falta **o conteúdo do documento** (seções por tipo +
resumo) e **a amarração** (ferramenta aceitando tipo/prazo/pagamento, dedup).
O cadastro, o envio e a numeração já estão de pé.

---

## 2. O que isto é, e o que não é

**É:** um motor de modelos — briefing + modelo do tipo = documento comercial
completo — mais a amarração do rascunho (preço do catálogo ou 0 + aviso,
1 rascunho aberto por negócio).

**Não é:**

- **não é um editor novo** — o editor existente revisa, precifica e envia; ele
  ganha campos, não substituto;
- **não é motor de precificação** — sem tabela autorizada não há cotação
  automática; isso é onda futura e depende de decisão comercial, não técnica;
- **não é assinatura eletrônica nem pagamento** — já excluídos na §5.5 da
  spec-mãe, continuam excluídos;
- **não é DOCX** — HTML/PDF/WhatsApp nesta onda; DOCX é onda futura.

---

## 3. A decisão que governa o desenho: preço tem fonte ou não existe

> *"O agente nunca deve ser mais rápido do que o humano consegue interromper."*

Regra, sem exceção:

```
antes de falar QUALQUER valor → consulta o catálogo (crm_search_products)
  achou o serviço  → usa o preço cadastrado, sem arredondar nem estimar
  não achou        → NÃO cita valor (nem faixa, nem "a partir de");
                     diz que o Paulo confirma + abre o aviso interno;
                     o rascunho sai com valor 0 e alerta de revisão
```

Medido em 21/09: sem a regra, o modelo citou "R$ 1.500 a R$ 4.000" inventados.
Com a regra em prompt (v26), zero número no sandbox. A regra em prompt é
necessária e insuficiente — a §5 a torna mecânica.

---

## 4. O fluxo, de ponta a ponta

```
[1] briefing na conversa (segmento, serviço, estágio, identidade, textos, fotos)
         │
[2] cliente confirma ("quero", "pode gerar")
         │
[3] UM negócio = UM rascunho: com rascunho aberto, retoma; sem, cria  ← DEDUP
         │   (ferramenta passa a recusar o 2º aberto do mesmo negócio)
         │
[4] preço: do catálogo; sem cadastro → 0 + aviso ao Paulo            ← §3
         │
[5] Paulo revisa no editor (texto das seções, valores, validade)      ← humano
         │
[6] enviar → número alocado + PDF completo + resumo                   ← existe
         │
[7] sem resposta em N dias → follow-up + Radar                        ← existe
         │
[8] aceita / recusada / vencida → volta ao funil                      ← existe
```

O que esta spec constrói: [3] e o **documento** de [6]. O resto já existe.

---

## 5. O objeto — modelagem sob a doutrina DIRC

### 5.1 O modelo (`proposal_templates`, nova)

Conteúdo piloto = formato `template.json` v1.1.0, medido arquivo a arquivo:

| Campo | Decisão DIRC |
|---|---|
| `organization_id` | obrigatório, `on delete cascade`, RLS `tenant_isolation_..._all` — não negociável |
| `slug` | `text` + CHECK dos 8 tipos piloto; tipo novo exige migration (vocabulário fechado de propósito) |
| `version` | `int not null default 1` — modelo evolui sem reescrever propostas antigas (o PDF guarda o texto renderizado, não o ponteiro) |
| `sections` | **jsonb** com `[{id, title, title_es, body, body_es, required, conditional}]` — exceção aceita ao "jsonb genérico": é conteúdo editorial versionado, não dinheiro nem relação; índice GIN só se a busca precisar |
| `section_order` | array de ids — a ordem é dado, não código |
| `is_active` | desativa sem apagar (proposta antiga referencia por cópia) |

**Por que tabela e não arquivo:** o dono edita texto de seção pela tela
futura sem deploy; RLS separa organizações; versão congela o que foi enviado.

**Nascem por tenant — decisão do dono em 21/09/2026** (o produto vende
tenant): o mesmo desenho do catálogo de Skills — base da plataforma
(`organization_id` nulo, só leitura) com os 8 modelos piloto + cópia por
organização quando ela personaliza. Proposta usa sempre a cópia da org (ou a
base, se ela nunca mexeu); PDF congela o texto da versão usada. Cai a ideia
de "modelos por organização em onda futura": é onda 1.

### 5.2 O rascunho ganha campos (ALTER, não tabela nova)

| Campo novo em `crm_proposals` | Nota |
|---|---|
| `template_slug` | nullable, FK lógica ao modelo+versão usados (texto livre + CHECK dos 8, para não travar se o modelo for desativado) |
| `tipo_projeto` | texto curto do briefing (ex.: `catalogo_imobiliario`) — **Referenciar** o vocabulário do modelo |
| `prazo_dias_uteis` | nullable — só entra confirmado/autorizado |
| `pagamento` | texto curto (ex.: `50_50`) ou livre validado — **nunca** inferido |
| `resumo_comercial` | texto gerado na emissão: projeto + investimento + prazo + pagamento + validade — o bloco que o cliente lê primeiro |
| `briefing_json` | **jsonb** do briefing estruturado (segmento, serviço, estágio, identidade, textos, fotos) — é o insumo auditável do documento |
| `pricing_status` | `text` + CHECK (`missing`, `catalog`, `manual`, `custom`, `approved`), default `missing` — **estado explícito de precificação**; envio exige `!= missing`; PDF mostra "A definir", nunca R$ 0,00 como preço |
| `version_reason` | texto curto do motivo da versão (ex.: "alteração de investimento pedida pelo cliente") |

**Não duplicamos** o texto das seções no rascunho: ele renderiza na emissão a
partir do modelo+versão + `briefing_json`. O PDF guarda o bytes final.

### 5.3 Dedup — 1 rascunho aberto por negócio

**Decidido pelo dono em 21/09/2026**, depois das 7 duplicadas:

- a ferramenta recusa criar o 2º rascunho com `status = rascunho` do mesmo
  `lead_id` (erro nomeado `rascunho_aberto_existe`, com o id existente);
- o prompt manda retomar o existente;
- fechar/duplicar de propósito continua possível à mão, no editor.

### 5.4 Conteúdo piloto anexado

Os 8 modelos web design (formato v1.1.0 do pacote externo) mais 3 anexos
desta spec, em `2026-09-21-proposta-templates/`: `clinica_exames_laboratorial`
(escopo fechado em exames/diagnóstico — decisão do dono em 21/09: clínica
genérica não existe), `curso_infoproduto` e `servicos_gerais`. PT-BR nesta
fase; ES na implementação (gate). Imobiliária-transação fora, a pedido do dono.

### 5.5 Snapshot — TEMPLATE, PROPOSAL e DOCUMENT são 3 coisas

Revisão externa acatada em 21/09: o "PDF congela" era fraco. Valem 3 conceitos:

```
TEMPLATE (estrutura editorial versionada)
  → PROPOSAL (instância comercial editável: briefing + seções + valores)
  → SNAPSHOT (documento imutável do que foi enviado)
```

No envio, grava-se junto da proposta: `template_slug`, `template_version`,
`template_snapshot` (qual modelo editorial foi usado) e `rendered_snapshot`
(exatamente o que saiu: seções resolvidas + valores + marca). Template v4
nunca altera a 0042/2026 v1, nem indiretamente — ela lê só o snapshot.

### 5.6 Migrações e distribuição

Tripla da casa: migration versionada + apêndice idempotente no `baseline.sql`
+ linha no `MANIFEST.md`. Sem `jsonb` para dinheiro (já é `_cents`); `briefing_json`
não carrega valor — valor mora em `total_cents` e itens, como hoje.

---

## 6. UX — desenhos

### 6.1 Proposta com modelo (editor, estado rascunho)

```
┌ Proposta: Site catálogo de imóveis ───────────── [Rascunho] ────┐
│ Modelo: [Catálogo imobiliário ▾]  Versão do modelo: v3          │
│                                                                 │
│ ┌ Resumo comercial (lido pelo cliente primeiro) ──────────────┐ │
│ │ Projeto: ...  Investimento: R$ ...  Prazo: ...               │ │
│ │ Pagamento: ...  Validade: ...                                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ Seções do documento (do modelo; texto editável nesta proposta): │
│  [✓] Resumo  [✓] Objetivos  [✓] Estrutura  [✓] Catálogo ...     │
│  [ ] Painel administrativo (condicional, fora do escopo)        │
│                                                                 │
│ Itens e valores (do catálogo ou à mão)  Total: R$ ...           │
│ [Salvar rascunho]  [Enviar ao cliente]                          │
└─────────────────────────────────────────────────────────────────┘
```

- trocar o modelo com rascunho em andamento exige confirmação (perde o texto
  ajustado à mão);
- seção condicional fora do escopo some do PDF, não aparece riscada;
- variável sem dado **não inventa**: renderiza `[a definir]` em rascunho e
  **barra o envio** até preencher (erro nomeado, não silencioso).

### 6.2 PDF — ordem de leitura

```
[marca]  Proposta 0042/2026 — v1          [logo]
Para: Nome (Empresa)

RESUMO COMERCIAL (4–6 linhas: projeto, investimento, prazo, pagamento, validade)
1. Sobre o projeto      2. Objetivos      3. Escopo (por tipo)
4. ...seções do modelo...      5. Investimento (itens + total)
6. O que está incluído / não está incluído
7. Responsabilidades do cliente   8. Garantia e suporte
9. Condições comerciais           10. Aprovação (nome, data, assinatura ___)
[rodapé: marca — página X de Y]
```

### 6.3 Alerta de valor 0 (o que o Paulo vê)

```
┌ ⚠ Proposta sem preço ─────────────────────────────────────────┐
│ O serviço "X" não está no catálogo. O rascunho saiu com R$ 0. │
│ [Abrir catálogo]  [Abrir proposta]  [Dispensar]                │
└────────────────────────────────────────────────────────────────┘
```

Entra na Central (não some com o alerta) e acompanha a proposta até ter valor.

---

## 7. O renderer — regras mecânicas

1. Substitui `{{caminho}}` pelos dados (`briefing_json` + proposta + cliente).
2. Variável sem dado → `[a definir]` no rascunho; **envio bloqueado** com a
   lista do que falta.
3. Seção condicional fora do escopo → omitida, sem rastro.
4. Lista vazia → omitida.
5. `number`/`numero` sempre vazio em rascunho (já vale hoje; o renderer
   reafirma, não confia).
6. PDF em PT-BR e ES a partir de `title/body` + `title_es/body_es`.
7. Variáveis **declaradas**, não descobertas: cada template lista
   `variables: {caminho: {type, required}}`; o renderer valida e **trava**
   variável desconhecida (ex.: `{{filter}}` vs `{{filters}}`) em vez de
   trocar em silêncio.
8. Prontidão (`readiness`): `incompleta` / `pronta_para_revisao` /
   `pronta_para_envio`, com checklist visível (cliente, escopo, prazo,
   investimento, pagamento, validade, conteúdo). Sem porcentagem.

---

## 8. Preço — o caminho do valor (fluxo)

```
cliente pede valor
  → busca no catálogo (crm_search_products)
    → achou: pricing_status=catalog, preço cadastrado, sem ajuste
    → não achou: pricing_status=missing, PDF mostra "A definir"
       (nunca R$ 0,00 — zero parece gratuidade) + aviso (alerta §6.3)
  → Paulo precifica no editor → pricing_status=manual
  → envia exige pricing_status != missing
  → congela (itens guardam cópia, como hoje)
```

---

## 9. Espanhol — arquitetura agora, conteúdo depois (revisão acatada)

Correção honesta: o gate de ES cobre texto de *tela*; conteúdo de banco não
tem gate cobrindo. Então: formato `body: {pt-BR, es}` desde o dia 1
(arquitetura i18n pronta), **conteúdo ES depois de validar o fluxo em PT**.
Piloto de 3 modelos ≈ 60 seções em PT, não 160 bilíngues.

---

## 10. Living System Checklist (resumo)

- Nada é ilha: rascunho ↔ negócio ↔ conversa ↔ PDF no Storage, tudo
  referenciado e visível (lista, editor, Central).
- Continuidade: rascunho 0 volta como alerta nomeado, nunca como silêncio.
- Nenhuma demanda sem próximo passo: rascunho aberto aparece com dono (Paulo)
  e ação (precificar / revisar / enviar).
- Todo laço se fecha: aceita/recusada/vencida voltam ao funil (spec-mãe §9).

---

## 11. Ordem de execução (revisada; sem PR até validar)

Piloto: 3 modelos (catálogo imobiliário, institucional, landing page) — cobre
catálogo, filtros, páginas, integrações, preço, prazo e condicionais. Os outros
5 entram depois de validado.

1. **Onda 0 — fundamento:** template + versão + proposta + snapshot +
   `pricing_status` + readiness. RLS + testes de tenant.
2. **Onda 1 — rascunho confiável:** briefing, dedup, preço do catálogo,
   "A definir", pendências.
3. **Onda 2 — documento:** renderer, seções, variáveis declaradas,
   condicionais, HTML, PDF, snapshot.
4. **Onda 3 — canvas:** prévia do documento, edição por seção, manual,
   versão/revisão com motivo.
5. **Onda 4 — IA:** chat, mudanças estruturadas, prévia, aplicar, auditoria.
6. **Onda 5 — envio:** autorização humana, número, PDF congelado, envio,
   timeline.
7. **Onda 6 — pós-envio:** aceita/recusada/vencida, follow-up, v2.
   (Onda 7, métricas/inteligência, fora desta spec.)

Cada onda: tripla de migration + prova na tela com o Paulo antes da próxima.
Documento confiável antes de interface sofisticada.

---

## 12. As decisões tomadas

| # | Decisão | Por quem/quando |
|---|---|---|
| 1 | Sem PR até validar em operação | dono, 21/09/2026 (regras da MAIN exigem evidência) |
| 2 | Preço do catálogo ou 0 + aviso; nunca inventar | dono, 21/09/2026 (medido o número inventado) |
| 3 | 1 rascunho aberto por negócio | dono, 21/09/2026 (7 duplicadas medidas) |
| 4 | Rascunho sem número; número só no envio | já valia (§5.3 da spec-mãe); reafirmado |
| 5 | ES obrigatório em todo texto novo de seção | gate da casa (não é decisão, é lei) |
| 6 | Sem DOCX, sem assinatura eletrônica, sem pagamento nesta spec | dono, 21/09/2026 |
| 7 | Item 8: revisão em canvas no formato do cliente + chat com LLM; envio nunca automático, mesmo com preço de catálogo | dono, 21/09/2026 |
| 8 | Motor genérico para qualquer nicho de serviços; 8 modelos piloto do web design; tipo novo via migration | dono, 21/09/2026 |
| 9 | Padrões de proposta centralizados no painel de configurações (validade, condições + futuros); nada espalhado | dono, 21/09/2026 |
| 10 | Revisar/alterar proposta só `manager`+ (tela e rota); o `agent` de hoje será fechado na Onda 1 | dono, 21/09/2026 |
| 11 | Modelos nascem por tenant: base da plataforma (leitura) + cópia por organização; proposta usa a cópia | dono, 21/09/2026 |
| 12 | Revisão externa acatada: TEMPLATE/PROPOSAL/SNAPSHOT separados; `pricing_status` + "A definir"; variáveis declaradas; readiness com bloqueadores; ES como arquitetura (conteúdo depois); piloto de 3 modelos; ordem em 7 ondas | dono, 21/09/2026 |
| 13 | Envio exige `manager` com ator usuário — verificado no código (403 para `agent`, sem alocar número); sem caminho técnico de IA enviar | medido, 21/09/2026 |
| 14 | Slug único com CHECK no piloto; split tipo-funcional × template-editorial só quando a 2ª leva exigir | dono, 21/09/2026 |
| 15 | Cópia nunca auto-atualiza: versão nova da base vira "atualização sugerida" (comparar/aplicar/ignorar) | dono, 21/09/2026 |

---

## 13. Item 8 do dono — revisão em canvas, nunca envio automático

**Decisão do dono em 21/09/2026**, medida contra o que existe:

| O Item 8 exige | Existe? | Onde / o que falta |
|---|---|---|
| Operador revisa o documento **no formato que o cliente verá** | **Não** | o editor mostra campos; falta o canvas lateral com o texto corrido renderizado (seções + resumo + valores) |
| Caixa de conversa com o LLM para discutir e pedir alterações | **Sim** | `AssistantPanel`: instrução → prévia de mudanças → aplicar, com `revision` (concorrência otimista, §6 da spec-mãe) |
| Proposta **nunca** enviada ao cliente pelo agente, mesmo com preço de catálogo | **Sim (regra), falta a trava escrita** | só humano clica enviar; esta spec torna explícito: nenhuma ferramenta, capacidade ou automação chama envio — o caminho de envio não aceita `actor` IA |

```
┌ Editor: Proposta (rascunho) ───────────────────────────────────┐
│ CANVAS — o documento como o cliente verá (área principal):      │
│ Resumo + seções em texto corrido + itens + total + validade     │
│                                                   │ LATERAL:    │
│ [Enviar ao cliente] ← humano, aqui no canvas      │ - chat IA   │
│                                                   │   ("troca o│
│                                                   │   prazo p/ │
│                                                   │   20d")     │
│                                                   │ - ajustes   │
│                                                   │   de campos │
└─────────────────────────────────────────────────────────────────┘
```

O canvas é a área principal e de leitura; a lateral carrega o chat com o LLM
e os ajustes de campos do documento. A conversa edita o rascunho, nunca
envia. Auditoria registra quem enviou (`sent_by_user_id`, sempre pessoa —
já vale hoje). O botão de envio mora no canvas, junto ao documento que ele
vai disparar.

Bloqueadores de envio (o botão sabe o que falta, não só retorna erro):

```
Não é possível enviar — 3 pendências:
1. Investimento não definido ............ [Resolver]
2. Prazo não confirmado ................. [Resolver]
3. 1 variável obrigatória sem conteúdo ... [Resolver]
```

Readiness ao lado do status: `incompleta` / `pronta_para_revisao` /
`pronta_para_envio`, com checklist (cliente, escopo, prazo, investimento,
pagamento, validade, conteúdo).

## 14. Perguntas que só o dono responde — RESPONDIDAS em 21/09/2026

1. **Tipos:** os 8 modelos nascem do caso web design, mas o motor é genérico
   para qualquer nicho de prestação de serviços. Tipo novo = vocabulário
   fechado via migration (não texto livre); modelos por organização ficam para
   onda futura.
2. **Centralização:** validade e tudo mais que for padrão mora **só** no painel
   de configuração de propostas — nada de dado de proposta espalhado em outras
   telas. O painel atual (validade, condições) é a semente; campos novos que
   surgirem entram nele, não em outro lugar.
3. **Quem revisa:** só gerência e adm (`manager`/`admin`). Divergência medida:
   o editor aceita `agent` hoje (`roleAtLeast(..., "agent")` nas duas páginas)
   — a Onda 1 fecha para `manager`+ na tela E na rota.
