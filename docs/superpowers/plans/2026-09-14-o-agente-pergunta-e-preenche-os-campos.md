# O agente pergunta e preenche os campos que o dono declarou — plano

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA — `superpowers:subagent-driven-development`
> (recomendada) ou `superpowers:executing-plans`, tarefa a tarefa. Os passos usam
> caixa (`- [ ]`) para marcação.

**Objetivo:** o agente lê a definição dos campos personalizados do funil em que
trabalha, formula a pergunta sozinho, anota a resposta durante a conversa — e
identifica quem está do outro lado — em qualquer nicho, sem skill escrita à mão.

**Arquitetura:** a definição dos campos é **org-wide e estável**, então entra no
prefixo cacheado do prompt pelo mesmo molde da memória da organização
(`loadOrgMemory` + `renderOrgMemory`): um módulo com `carregar…` e `render…`, e
string vazia quando não há nada — custo zero para quem não usa. Tudo que varia
por lead (valores preenchidos, se o contato tem nome) viaja no **sufixo**, dentro
do `get_lead_context`. A gravação usa a ferramenta que já existe
(`crm_update_lead`, que já faz merge de `custom_fields`); o que o humano escreveu
nunca é sobrescrito — vira proposta, na tabela de propostas que já existe.

**Pilha:** Next.js 16 App Router · TypeScript estrito · Zod · Postgres/Supabase
com RLS · Vitest (unidade e invariantes) · Playwright · pnpm.

**Spec:** [`docs/superpowers/specs/2026-09-14-o-agente-enxerga-e-preenche-os-campos-do-funil-design.md`](../specs/2026-09-14-o-agente-enxerga-e-preenche-os-campos-do-funil-design.md)

---

## ⚠️ Três correções que a medição impôs à spec

Estas três não estavam no desenho aprovado em conversa. Foram medidas ao escrever
o plano, e **mudam o que se implementa**. A spec é corrigida na Tarefa 0.0.

### 1. O modelo NUNCA soube que o contato está sem nome (derruba a onda 0)

`lib/agent-engine/edge/crm/get-lead-context.ts:280`:

```ts
name: contact.display_name ?? contact.name,
```

O contexto entregue ao modelo **funde as duas colunas**, preferindo o
`display_name` — que é o texto que a própria pessoa escreveu no aparelho dela
("Josué sites"). O modelo sempre enxerga um nome, e por isso **nenhum bloco de
sistema resolveria sozinho**: mandar "pergunte o nome de quem não tem" a um
modelo que lê `name: "Josué sites"` não produz pergunta nenhuma.

A onda 0 passa a ter duas peças: **um campo novo no contexto**, que separa nome
confirmado pela empresa de texto vindo do aparelho, e o bloco.

### 2. O bloco NÃO pode variar por contato — ele mora no prefixo cacheado

A spec pedia "contato sem `name` ⇒ o bloco entra; com `name` ⇒ não entra". O
`system` é montado em `inbound-turn.ts:1939-1951` e vai inteiro para o prefixo
estável (`buildStablePrefix`), cujo módulo tem regra dura escrita:

> *"NADA volátil (timestamp, random, lead, contador) entra aqui."*

Um bloco que entra ou sai conforme o contato **invalida o cache a cada lead** —
exatamente o erro que a própria spec denuncia na onda 1. A condição correta é
**constante por versão do agente** (a ferramenta estar ligada); a variação por
contato viaja no sufixo, no campo novo do item 1.

### 3. As duas chaves da onda 7 NÃO cabem em `config` — são colunas

`agent-config.ts:126` lê `a.config` — `config` é de **`ai_agents`** (o agente),
não de `ai_agent_versions` (a versão). A spec afirma *"`ai_agent_versions` é
imutável por gatilho — ligar é publicar versão nova"*, e isso **só vale para
coluna da versão**, como `cases_enabled`. Em `config` a chave seria mutável e
ficaria fora do versionamento e do diff de versões.

Custo real: coluna nova em `ai_agent_versions` obriga a editar a lista literal de
colunas repetida em **8 arquivos** (medido com `grep -rn "cases_enabled"`).

---

## Restrições globais

Valem para **toda** tarefa deste plano.

| Restrição | Valor exato |
|---|---|
| Numeração de migration | **0254** e **0255**. Medido: `origin/main` topo `0251`; nossos PRs abertos topo `0246`; `vps/pljr-combinada` topo `0253`. Começar em 0252 colidiria com a combinada no merge de volta |
| Tripla de migration | arquivo em `supabase/migrations/` **+** apêndice idempotente no `supabase/baseline.sql` **+** linha no `MANIFEST.md`, **no mesmo commit** |
| `agent_inbox_items_kind_check` | editar **o bloco único** (`supabase/baseline.sql:10044`), nunca recriar num apêndice novo — `tests/unit/baseline-constraint-reconstruida.test.ts` reprova |
| Prefixo estável | nada que varie por lead/contato entra em `system` |
| PII (§9) | `crm_lead_activities.reason` nomeia **campos**, nunca **valores**, e nunca a frase do cliente. A frase vai em `contact_field_proposals.trecho` |
| `crm_lead_activities.type` | vocabulário **aberto** (sem CHECK, de propósito): tipo novo usa **constante compartilhada**, nunca string literal, e **não** entra em `tests/invariants/vocabulario-banco-x-typescript.test.ts` |
| Escopo de funil | toda ferramenta de escrita nova entra em `lib/leads/escopo-de-funil.ts` — ausência é **recusa**, e `tests/unit/escopo-de-funil-cobre-as-escritas.test.ts` reprova |
| Teto de capacidades | 25 por agente. **Nenhuma ferramenta nova neste plano** — só as que já existem |
| Fragmento de release | `.changes/<kebab>.md` por onda que muda o que o operador percebe |
| Nesta máquina | `pnpm test:db` e `pnpm test:e2e` **não rodam**. Veredito vem do CI do fork |

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Onda |
|---|---|---|
| `lib/agent-engine/edge/crm/get-lead-context.ts` | separa nome confirmado de apelido do aparelho | 0 |
| `lib/agent-engine/agent/identificacao.ts` | **novo** — o bloco de identificação | 0 |
| `lib/agent-engine/agent/campos-do-funil-do-agente.ts` | **novo** — carrega e renderiza a definição dos campos (molde `org-memory.ts`) | 1 |
| `lib/agent-engine/agent/inbound-turn.ts` | empilha os blocos em `blocosResidentes` | 0,1,2 |
| `lib/schemas/settings.ts` | chave opcional `pergunta` no `customFieldSchema` | 3 |
| `app/app/settings/tenant/pipelines/` | input da `pergunta`; propostas de campo novo | 3,6 |
| `lib/contacts/proposta-de-dado.ts` | proposta com `destino` e `lead_id` | 4 |
| `supabase/migrations/…_0254_…sql` | `destino` + `lead_id` + índice de unicidade | 4 |
| `lib/ai/handoff/orchestrator.ts` | declara obrigatórios em branco no handoff | 5 |
| `supabase/migrations/…_0255_…sql` | duas colunas em `ai_agent_versions` + `kind` novo | 6,7 |

---

## Onda 0 — o agente sabe com quem está falando

**Entrega sozinha.** Sem ela, todo contato que entra pelo WhatsApp fica sem nome
para sempre — medido nesta instalação: 2 de 3.

### Tarefa 0.0: corrigir a spec — ✅ FEITA ao escrever este plano

- [x] A seção 0 da spec traz as **duas** causas (a fusão em
      `get-lead-context.ts:280` e a falta de ordem), e a condição correta do bloco.
- [x] A seção 8 diz **coluna em `ai_agent_versions`**, com o custo das 8 listas.
- [x] A tabela de provas troca "o bloco entra/não entra por contato" pelas três
      provas de `nome_confirmado` mais a de byte-identidade do prefixo.

### Tarefa 0.1: o contexto para de esconder que o nome é apelido

**Arquivos:**
- Modificar: `lib/agent-engine/edge/crm/get-lead-context.ts` (interface `contact`, ~linha 89; montagem, ~linha 279)
- Teste: `lib/agent-engine/edge/crm/get-lead-context.test.ts`

**Interfaces:**
- Produz: `LeadContext["contact"].nome_confirmado: boolean` — `true` somente quando
  `contacts.name` está preenchido (não-nulo e não-vazio após `trim`). A Tarefa 0.2
  depende deste nome exato.

⚠️ **Não trocar o campo `name`.** O comentário em `get-lead-context.ts:273-277`
diz por quê: ele circula por follow-up, case-reply e escalação, e por invariantes
congelados. Somar o certo custa uma linha; trocar o nome custa uma onda.

- [ ] **Passo 1: escrever o teste que falha**

```ts
it("nome vindo do aparelho não conta como nome confirmado", async () => {
  const ctx = await montarContextoDeTeste({ name: null, display_name: "Josué sites" });
  expect(ctx.contact.name).toBe("Josué sites");      // o campo antigo não muda
  expect(ctx.contact.nome_confirmado).toBe(false);   // e agora dá para saber
});

it("nome preenchido pela empresa conta", async () => {
  const ctx = await montarContextoDeTeste({ name: "Paulo Lima", display_name: "Paulão" });
  expect(ctx.contact.nome_confirmado).toBe(true);
});

it("nome só de espaços não conta", async () => {
  const ctx = await montarContextoDeTeste({ name: "   ", display_name: null });
  expect(ctx.contact.nome_confirmado).toBe(false);
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
pnpm vitest run lib/agent-engine/edge/crm/get-lead-context.test.ts
```

Esperado: FAIL — `nome_confirmado` não existe no tipo.

- [ ] **Passo 3: implementar**

Na interface, ao lado de `name`:

```ts
    /**
     * O nome foi confirmado pela EMPRESA (`contacts.name`), ou o que está em
     * `name` acima é o texto que a pessoa escreveu no aparelho dela
     * (`display_name`)?
     *
     * Existe porque `name` acima é `display_name ?? name`: sem este booleano o
     * modelo lê "Josué sites" e conclui que já sabe o nome do cliente. Medido:
     * 2 de 3 contatos de uma instalação real estavam assim.
     */
    nome_confirmado: boolean;
```

Na montagem:

```ts
        name: contact.display_name ?? contact.name,
        nome_confirmado: (contact.name ?? "").trim() !== "",
```

- [ ] **Passo 4: rodar e ver passar**

```bash
pnpm vitest run lib/agent-engine/edge/crm/get-lead-context.test.ts
```

- [ ] **Passo 5: commit**

```bash
git add lib/agent-engine/edge/crm/get-lead-context.ts lib/agent-engine/edge/crm/get-lead-context.test.ts
git commit -m "feat(agente): o contexto diz se o nome foi confirmado ou veio do aparelho"
```

### Tarefa 0.2: o bloco de identificação

**Arquivos:**
- Criar: `lib/agent-engine/agent/identificacao.ts`
- Modificar: `lib/agent-engine/agent/inbound-turn.ts` (~linha 1946)
- Teste: `lib/agent-engine/agent/identificacao.test.ts`

**Interfaces:**
- Consome: `LeadContext["contact"].nome_confirmado` (Tarefa 0.1)
- Produz: `IDENTIFICACAO_SYSTEM_BLOCK: string` — constante, sem interpolação

⚠️ **Condicionado à ferramenta, não ao contato.** `crm_propose_contact_field`
está **fora** do pacote "Atender" (ver `lib/mcp/tools/catalogo/atendimento.ts` —
o pacote já usa 18 das 25 vagas). Um bloco que manda perguntar o nome sem a
ferramenta ligada faz o agente prometer o que não tem como cumprir.

- [ ] **Passo 1: escrever o teste que falha**

```ts
import { IDENTIFICACAO_SYSTEM_BLOCK } from "./identificacao";

it("o bloco não interpola nada — é constante", () => {
  expect(IDENTIFICACAO_SYSTEM_BLOCK).not.toMatch(/\$\{/);
});

it("nomeia a ferramenta que ele exige", () => {
  expect(IDENTIFICACAO_SYSTEM_BLOCK).toContain("crm_propose_contact_field");
});

it("carrega as três travas", () => {
  expect(IDENTIFICACAO_SYSTEM_BLOCK).toMatch(/uma vez/i);
  expect(IDENTIFICACAO_SYSTEM_BLOCK).toMatch(/telefone/i);
  expect(IDENTIFICACAO_SYSTEM_BLOCK).toContain("nome_confirmado");
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
pnpm vitest run lib/agent-engine/agent/identificacao.test.ts
```

- [ ] **Passo 3: implementar o bloco**

```ts
/**
 * QUEM ESTÁ DO OUTRO LADO — bloco residente (onda 0).
 *
 * ⚠️ CONSTANTE, sem interpolação: ele vai para o prefixo CACHEADO
 * (`buildStablePrefix`), que precisa ser byte-idêntico entre leads. O que varia
 * por contato — se o nome foi confirmado — viaja no sufixo, em
 * `contact.nome_confirmado` do `get_lead_context`.
 *
 * ⚠️ Empilhado só quando `crm_propose_contact_field` está entre as tools
 * publicadas: ela está FORA do pacote "Atender" (teto de 25 capacidades), e um
 * bloco que manda perguntar sem a ferramenta faz o agente prometer o que não
 * consegue cumprir — o mesmo defeito que o comentário do `AGENDA_SYSTEM_BLOCK`
 * descreve.
 */
export const IDENTIFICACAO_SYSTEM_BLOCK = [
  '=== quem está do outro lado ===',
  'O campo `contact.name` do contexto pode ser apenas o texto que a pessoa escreveu no aparelho dela — um apelido, o nome do negócio ou o próprio número. Quem diz se a empresa tem o nome de verdade é `contact.nome_confirmado`.',
  'Quando `nome_confirmado` for false: pergunte o nome UMA VEZ, com naturalidade, no primeiro momento em que couber na conversa. Se a pessoa não responder ou não quiser dizer, siga o atendimento e NÃO pergunte de novo — insistir queima o atendimento, e quem se recusa na primeira não diz na terceira.',
  'E-mail: peça somente quando houver algo concreto para enviar (proposta, orçamento, link de reunião, documento). Pedir e-mail logo no "oi" parece golpe e faz a pessoa sumir.',
  'Telefone: NÃO pergunte. A conversa já chega por um número. Só registre se a pessoa oferecer um segundo número, diferente do canal.',
  'O que a pessoa disser vai por `crm_propose_contact_field`, que cria uma PROPOSTA para alguém da empresa confirmar. Nada entra no cadastro por conta dessa chamada: nunca diga ao cliente que o cadastro foi atualizado.',
].join('\n');
```

- [ ] **Passo 4: empilhar em `inbound-turn.ts`**

Logo depois da condição da agenda (~linha 1946), no mesmo molde:

```ts
  if (agentConfig !== null && agentConfig.toolIds.includes('crm_propose_contact_field')) {
    blocosResidentes.push(IDENTIFICACAO_SYSTEM_BLOCK);
  }
```

- [ ] **Passo 5: o teste que prova que quem não liga não paga**

```ts
it("sem a ferramenta, o bloco não entra", () => {
  const semA = blocosDoTurno({ toolIds: [] });
  const comA = blocosDoTurno({ toolIds: ["crm_propose_contact_field"] });
  expect(semA).not.toContain("quem está do outro lado");
  expect(comA).toContain("quem está do outro lado");
});
```

- [ ] **Passo 6: rodar, com o teste de cache junto**

```bash
pnpm vitest run lib/agent-engine/agent/identificacao.test.ts lib/agent-engine/edge/llm
```

- [ ] **Passo 7: sabotar**

Comentar a linha `blocosResidentes.push(IDENTIFICACAO_SYSTEM_BLOCK)`. Previsão:
**1 vermelho**, o do Passo 5. Rodar, conferir a contagem, restaurar.

- [ ] **Passo 8: commit**

```bash
git add lib/agent-engine/agent/identificacao.ts lib/agent-engine/agent/identificacao.test.ts lib/agent-engine/agent/inbound-turn.ts
git commit -m "feat(agente): ele pergunta o nome de quem ainda nao tem"
```

### Tarefa 0.3: o fragmento de release da onda 0

**Arquivos:** Criar `.changes/o-agente-pergunta-o-nome.md`

- [ ] **Passo 1: escrever**

```markdown
---
impacto: capacidade_nova
secao: adicionado
titulo: O agente pergunta o nome de quem chega pelo WhatsApp
---
Contato que entra pelo WhatsApp chegava com o texto que a própria pessoa escreveu no aparelho — um apelido, o nome do negócio ou o número — e o campo de nome do cadastro ficava vazio para sempre. Agora o agente percebe a diferença, pergunta o nome uma única vez e registra como proposta para alguém confirmar. Precisa da capacidade "Anotar dado que o cliente informou" ligada no agente.
```

- [ ] **Passo 2: conferir e commitar**

```bash
pnpm release:conferir
git add .changes/o-agente-pergunta-o-nome.md
git commit -m "chore(release): fragmento da onda 0"
```

---

## Onda 1 — o agente recebe a definição dos campos do funil dele

**Entrega sozinha:** ele para de perguntar o que já está na ficha e passa a
conhecer o vocabulário do nicho.

### Tarefa 1.1: o módulo que carrega e renderiza a definição

**Arquivos:**
- Criar: `lib/agent-engine/agent/campos-do-funil-do-agente.ts`
- Teste: `lib/agent-engine/agent/campos-do-funil-do-agente.test.ts`

**Interfaces:**
- Consome: `camposDoFunil(settings)` de `lib/leads/campos-do-funil.ts` (já existe;
  devolve `CustomFieldDef[]` e engole jsonb velho sem explodir)
- Produz:
  - `carregarCamposDoFunilDoAgente(db: pg.Pool, tenantId: string, pipelineIds: string[]): Promise<CamposPorFunil[]>`
  - `renderCamposDoFunil(funis: CamposPorFunil[]): string` — **`''` quando vazio**
  - `interface CamposPorFunil { pipelineId: string; nome: string; campos: CustomFieldDef[] }`

⚠️ **Molde obrigatório: `lib/agent-engine/agent/org-memory.ts`.** Ele já resolve
os dois problemas desta tarefa — consulta no turno com `pg.Pool` e bloco que vira
string vazia quando não há conteúdo (custo zero para quem não usa).

⚠️ **`pipelineIds` vazio significa NENHUM, nunca "todos".** É a regra escrita em
`lib/leads/escopo-de-funil.ts` (`ESCOPO_VAZIO`). Devolver todos os funis da
organização aqui daria ao agente de suporte o vocabulário do funil de vendas.

- [ ] **Passo 1: escrever o teste que falha**

```ts
it("sem funil marcado, o bloco é vazio — custo zero", () => {
  expect(renderCamposDoFunil([])).toBe("");
});

it("funil sem campo declarado também é vazio", () => {
  expect(renderCamposDoFunil([{ pipelineId: "p1", nome: "Clientes", campos: [] }])).toBe("");
});

it("nomeia chave, rótulo, tipo e obrigatoriedade", () => {
  const bloco = renderCamposDoFunil([
    {
      pipelineId: "p1",
      nome: "Pacientes",
      campos: [
        { key: "convenio", label: "Convênio", type: "select", required: true,
          options: [{ value: "unimed", label: "Unimed" }, { value: "particular", label: "Particular" }] },
        { key: "ja_foi_paciente", label: "Já foi paciente", type: "boolean" },
      ],
    },
  ]);
  expect(bloco).toContain("convenio");
  expect(bloco).toContain("Convênio");
  expect(bloco).toContain("unimed");
  expect(bloco).toMatch(/obrigat/i);
  expect(bloco).toContain("ja_foi_paciente");
});

it("não vaza VALOR de lead nenhum — só definição", () => {
  const bloco = renderCamposDoFunil([
    { pipelineId: "p1", nome: "Clientes",
      campos: [{ key: "segmento", label: "Segmento", type: "text" }] },
  ]);
  // Só o que é igual para toda a organização. Valor é do lead e vive no sufixo.
  expect(bloco).not.toMatch(/lead|contato|cliente_/i);
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
pnpm vitest run lib/agent-engine/agent/campos-do-funil-do-agente.test.ts
```

- [ ] **Passo 3: implementar**

```ts
import type pg from 'pg';

import { camposDoFunil } from '@/lib/leads/campos-do-funil';
import type { CustomFieldDef } from '@/lib/schemas/settings';

export interface CamposPorFunil {
  pipelineId: string;
  nome: string;
  campos: CustomFieldDef[];
}

/**
 * A definição dos campos personalizados dos funis DESTE agente.
 *
 * ⚠️ `pipelineIds` vazio devolve lista vazia — vazio é NENHUM, nunca "todos"
 * (`ESCOPO_VAZIO` em `lib/leads/escopo-de-funil.ts`). Devolver todos os funis da
 * organização daria ao agente de suporte o vocabulário do funil de vendas.
 */
export async function carregarCamposDoFunilDoAgente(
  db: pg.Pool,
  tenantId: string,
  pipelineIds: string[],
): Promise<CamposPorFunil[]> {
  if (pipelineIds.length === 0) return [];
  const { rows } = await db.query<{ id: string; name: string; settings: Record<string, unknown> | null }>(
    `select id, name, settings
       from crm_pipelines
      where organization_id = $1 and id = any($2::uuid[])
      order by name asc, id asc`,
    [tenantId, pipelineIds],
  );
  return rows.map((r) => ({ pipelineId: r.id, nome: r.name, campos: camposDoFunil(r.settings) }));
}

function descreveTipo(c: CustomFieldDef): string {
  if (c.type === 'select' || c.type === 'multiselect') {
    const ops = (c.options ?? []).map((o) => `${o.value} (${o.label})`).join(', ');
    const quantos = c.type === 'select' ? 'UMA das opções' : 'uma ou mais opções';
    return `escolha ${quantos}: ${ops}`;
  }
  const porTipo: Record<string, string> = {
    boolean: 'sim ou não',
    date: 'uma data (AAAA-MM-DD) — nunca grave "semana que vem" como texto',
    number: 'um número',
    email: 'um e-mail',
    phone: 'um telefone',
    url: 'um endereço de site',
    textarea: 'texto livre, pode ser longo',
    text: 'texto curto',
  };
  return porTipo[c.type] ?? 'texto curto';
}

/**
 * Bloco do prefixo ESTÁVEL — `''` quando não há campo declarado (custo zero).
 *
 * ⚠️ Só DEFINIÇÃO entra aqui: chave, rótulo, tipo, opções, obrigatoriedade. Tudo
 * isso é igual para toda a organização, então o prefixo continua byte-idêntico
 * entre leads e o cache do provedor segue valendo. O VALOR já preenchido é do
 * lead e chega pelo `crm_get_lead`, no sufixo.
 */
export function renderCamposDoFunil(funis: CamposPorFunil[]): string {
  const comCampos = funis.filter((f) => f.campos.length > 0);
  if (comCampos.length === 0) return '';
  const partes: string[] = [
    '=== os campos que esta empresa quer preenchidos ===',
    'Estes campos são do funil desta empresa e valem para todo atendimento. Cada linha traz a CHAVE (o que vai no argumento `custom_fields` de `crm_update_lead`), o rótulo que a empresa usa e o que a resposta precisa ser.',
  ];
  for (const f of comCampos) {
    partes.push(`-- funil "${f.nome}" --`);
    for (const c of f.campos) {
      const obrig = c.required === true ? ' [OBRIGATÓRIO]' : '';
      partes.push(`- ${c.key} — "${c.label}"${obrig}: ${descreveTipo(c)}`);
    }
  }
  return partes.join('\n');
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
pnpm vitest run lib/agent-engine/agent/campos-do-funil-do-agente.test.ts
```

- [ ] **Passo 5: commit**

```bash
git add lib/agent-engine/agent/campos-do-funil-do-agente.ts lib/agent-engine/agent/campos-do-funil-do-agente.test.ts
git commit -m "feat(agente): a definicao dos campos do funil vira bloco do prefixo"
```

### Tarefa 1.2: o bloco entra no turno, atrás da chave

**Arquivos:**
- Modificar: `lib/agent-engine/agent/inbound-turn.ts` (~linha 1925-1951)
- Teste: `lib/agent-engine/agent/campos-do-funil-do-agente.test.ts` (acrescenta)

**Interfaces:**
- Consome: `carregarCamposDoFunilDoAgente`, `renderCamposDoFunil` (Tarefa 1.1);
  `agentConfig.pipelineIds` e `agentConfig.leadFieldsEnabled` (Onda 7)

⚠️ **Ordem entre ondas.** A chave `leadFieldsEnabled` nasce na Onda 7. Para não
travar esta onda atrás daquela, implemente aqui lendo
`agentConfig.leadFieldsEnabled === true` e deixe a Onda 7 acrescentar a coluna; até
lá o campo é `false` no tipo e o bloco não entra em lugar nenhum — o que é o
comportamento desejado de qualquer forma.

- [ ] **Passo 1: escrever o teste que falha**

```ts
it("com a chave desligada, o prefixo é byte-idêntico ao de hoje", async () => {
  const hoje = await prefixoDoTurno({ leadFieldsEnabled: false, pipelineIds: ["p1"] });
  const antes = await prefixoDeReferencia();
  expect(hoje).toBe(antes);
});

it("dois leads da mesma org produzem o MESMO prefixo", async () => {
  const a = await prefixoDoTurno({ leadFieldsEnabled: true, leadId: "lead-a" });
  const b = await prefixoDoTurno({ leadFieldsEnabled: true, leadId: "lead-b" });
  expect(a).toBe(b);   // definição no prefixo, valor no sufixo
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
pnpm vitest run lib/agent-engine/agent/campos-do-funil-do-agente.test.ts
```

- [ ] **Passo 3: implementar**

Junto de `loadOrgMemory` (~linha 1928), e empilhando depois dos demais blocos:

```ts
  // Definição dos campos do funil — prefixo ESTÁVEL (org-wide), como a memória
  // da organização. Os VALORES do lead não vêm por aqui: chegam pelo
  // `crm_get_lead`, no sufixo, senão o cache do provedor morreria a cada lead.
  const camposDoFunilDoAgente =
    agentConfig !== null && agentConfig.leadFieldsEnabled
      ? await carregarCamposDoFunilDoAgente(pool, tenantId, agentConfig.pipelineIds)
      : [];
  const blocoDosCampos = renderCamposDoFunil(camposDoFunilDoAgente);
  if (blocoDosCampos !== '') blocosResidentes.push(blocoDosCampos);
```

- [ ] **Passo 4: rodar e ver passar**

```bash
pnpm vitest run lib/agent-engine/agent lib/agent-engine/edge/llm
```

- [ ] **Passo 5: sabotar**

Trocar a condição por `true` incondicional. Previsão: **1 vermelho** — o teste do
prefixo byte-idêntico. Rodar, conferir, restaurar.

- [ ] **Passo 6: commit**

```bash
git add lib/agent-engine/agent/inbound-turn.ts lib/agent-engine/agent/campos-do-funil-do-agente.test.ts
git commit -m "feat(agente): o turno empilha a definicao dos campos do funil"
```

---

## Onda 2 — ele pergunta e anota durante a conversa

**Entrega sozinha:** é o pedido original.

### Tarefa 2.1: as cinco regras de conduta

**Arquivos:**
- Modificar: `lib/agent-engine/agent/campos-do-funil-do-agente.ts` (acrescenta ao bloco)
- Teste: `lib/agent-engine/agent/campos-do-funil-do-agente.test.ts`

**Interfaces:**
- Produz: as regras dentro do MESMO bloco da Tarefa 1.1 — não é bloco novo. Um
  bloco separado gastaria cabeçalho e separador no prefixo sem ganhar nada.

- [ ] **Passo 1: escrever o teste que falha**

```ts
it("o bloco carrega as cinco regras", () => {
  const bloco = renderCamposDoFunil([
    { pipelineId: "p1", nome: "Clientes",
      campos: [{ key: "segmento", label: "Segmento", type: "text" }] },
  ]);
  expect(bloco).toMatch(/uma pergunta por vez|de uma vez só/i);   // 1
  expect(bloco).toMatch(/assim que|não espere/i);                  // 2 — anote quando ouvir
  expect(bloco).toMatch(/deduz|dedução|suponha/i);                 // 3 — só o que foi dito
  expect(bloco).toMatch(/já preenchid|não sobrescreva/i);          // 4 — humano tem precedência
  expect(bloco).toMatch(/não pergunte o que já/i);                 // 5
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
pnpm vitest run lib/agent-engine/agent/campos-do-funil-do-agente.test.ts
```

- [ ] **Passo 3: implementar — acrescentar ao fim de `renderCamposDoFunil`**

```ts
  partes.push(
    '-- como usar estes campos --',
    '1. Pergunte a partir do que está declarado acima, na linguagem do cliente. Uma pergunta por vez: não despeje a lista inteira de uma vez, isso vira formulário e o cliente abandona.',
    '2. Anote assim que ouvir, com `crm_update_lead`. Não espere o fim da conversa para registrar — conversa que cai no meio leva junto tudo que não foi anotado.',
    '3. Grave SOMENTE o que foi dito. Se a frase não contém a resposta, o campo fica vazio. "Ele falou em clínica, logo o segmento é saúde" é dedução, e dedução enche o cadastro de dado errado com cara de certo.',
    '4. NÃO sobrescreva campo já preenchido. Se o que o cliente disser hoje for diferente do que está gravado, mantenha o gravado e siga a conversa.',
    '5. Não pergunte o que já está preenchido na ficha — leia antes com `crm_get_lead`.',
  );
```

- [ ] **Passo 4: rodar e ver passar**

```bash
pnpm vitest run lib/agent-engine/agent/campos-do-funil-do-agente.test.ts
```

- [ ] **Passo 5: commit**

```bash
git add lib/agent-engine/agent/campos-do-funil-do-agente.ts lib/agent-engine/agent/campos-do-funil-do-agente.test.ts
git commit -m "feat(agente): as regras de como perguntar entram no bloco dos campos"
```

### Tarefa 2.2: provar que anotar um campo não apaga os outros

**Arquivos:**
- Teste: `app/api/v1/leads/_handler.test.ts` (acrescenta)

⚠️ **Nada a implementar.** O merge já existe em `updateLeadHandler`
(`patch.custom_fields = { ...prev, ...input.custom_fields }`). Esta tarefa
escreve a **cerca** que impede alguém de trocá-lo por atribuição direta depois —
é a linha cuja quebra apaga trabalho em silêncio.

- [ ] **Passo 1: escrever o teste**

```ts
it("anotar um campo preserva os outros", async () => {
  const lead = await comLead({ custom_fields: { segmento: "clinica", prazo: "30 dias" } });
  await updateLeadHandler({ id: lead.id, custom_fields: { tipo_projeto: "site" } });
  const depois = await lerLead(lead.id);
  expect(depois.custom_fields).toEqual({
    segmento: "clinica", prazo: "30 dias", tipo_projeto: "site",
  });
});
```

- [ ] **Passo 2: rodar (passa de primeira — é cerca, não conserto)**

```bash
pnpm vitest run app/api/v1/leads
```

- [ ] **Passo 3: sabotar**

Trocar o merge por `patch.custom_fields = input.custom_fields`. Previsão:
**1 vermelho**. Rodar, conferir, restaurar.

- [ ] **Passo 4: commit**

```bash
git add app/api/v1/leads/_handler.test.ts
git commit -m "test(leads): cerca no merge de custom_fields"
```

### Tarefa 2.3: o fragmento de release das ondas 1 e 2

**Arquivos:** Criar `.changes/o-agente-preenche-os-campos-do-funil.md`

- [ ] **Passo 1: escrever e conferir**

```markdown
---
impacto: capacidade_nova
secao: adicionado
titulo: O agente pergunta e preenche os campos personalizados do funil
---
Os campos personalizados que a empresa declara em Configurações › Funis — convênio numa clínica, área do direito num escritório, bairro numa imobiliária — agora chegam ao agente com rótulo, tipo e obrigatoriedade. Ele formula a pergunta sozinho, respeita as opções de cada campo e anota durante a conversa, sem que ninguém escreva instrução à mão. Nasce desligado: ligue em Agentes › a capacidade "Perguntar e preencher os campos do funil".
```

```bash
pnpm release:conferir
git add .changes/o-agente-preenche-os-campos-do-funil.md
git commit -m "chore(release): fragmento das ondas 1 e 2"
```

---

## Onda 3 — a pergunta escrita pelo dono, na tela

**Entrega sozinha:** afina a pergunta sem escrever skill. **Custo zero de banco** —
os campos moram num `jsonb`.

### Tarefa 3.1: a chave `pergunta` no schema

**Arquivos:**
- Modificar: `lib/schemas/settings.ts:134-157` (`customFieldSchema`)
- Modificar: `lib/agent-engine/agent/campos-do-funil-do-agente.ts` (`renderCamposDoFunil`)
- Teste: `lib/schemas/settings.test.ts` e `lib/agent-engine/agent/campos-do-funil-do-agente.test.ts`

**Interfaces:**
- Produz: `CustomFieldDef["pergunta"]?: string` (máx. 200)

⚠️ **Opcional de propósito.** Sem ela o agente deriva do `label` e funciona. Isso
também é o que mantém a compatibilidade: `camposDoFunil()` roda
`customFieldSchema.safeParse` por item e **descarta o que não valida** — um campo
obrigatório novo faria todo campo já gravado sumir da ficha do lead.

- [ ] **Passo 1: escrever o teste que falha**

```ts
it("campo sem `pergunta` continua válido", () => {
  expect(customFieldSchema.safeParse({ key: "segmento", label: "Segmento", type: "text" }).success).toBe(true);
});

it("aceita a pergunta escrita pelo dono", () => {
  const r = customFieldSchema.safeParse({
    key: "tem_conteudo", label: "Conteúdo", type: "boolean",
    pergunta: "Você já tem os textos e as imagens, ou vai precisar de ajuda para criar?",
  });
  expect(r.success).toBe(true);
});

it("pergunta longa demais é recusada", () => {
  const r = customFieldSchema.safeParse({
    key: "x", label: "X", type: "text", pergunta: "a".repeat(201),
  });
  expect(r.success).toBe(false);
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
pnpm vitest run lib/schemas/settings.test.ts
```

- [ ] **Passo 3: implementar — no `customFieldSchema`, depois de `options`**

```ts
  /**
   * A pergunta que o agente faz, escrita por quem conhece o negócio.
   *
   * OPCIONAL de propósito: sem ela o agente deriva do `label` e funciona. Com
   * ela funciona bem — `label: "Conteúdo"` vira pergunta ruim se derivada
   * sozinha. Torná-la obrigatória apagaria da ficha todo campo já gravado:
   * `camposDoFunil()` descarta por `safeParse` o item que não valida.
   */
  pergunta: z.string().min(1).max(200).optional(),
```

- [ ] **Passo 4: usar no bloco — em `renderCamposDoFunil`, trocar a linha do campo**

```ts
      const obrig = c.required === true ? ' [OBRIGATÓRIO]' : '';
      const comoPerguntar =
        c.pergunta === undefined ? '' : `\n    pergunte assim: "${c.pergunta}"`;
      partes.push(`- ${c.key} — "${c.label}"${obrig}: ${descreveTipo(c)}${comoPerguntar}`);
```

- [ ] **Passo 5: o teste do bloco**

```ts
it("usa a pergunta do dono quando existe, e o label quando não", () => {
  const com = renderCamposDoFunil([{ pipelineId: "p", nome: "F", campos: [
    { key: "tem_conteudo", label: "Conteúdo", type: "boolean", pergunta: "Você já tem os textos?" },
  ]}]);
  expect(com).toContain("Você já tem os textos?");

  const sem = renderCamposDoFunil([{ pipelineId: "p", nome: "F", campos: [
    { key: "tem_conteudo", label: "Conteúdo", type: "boolean" },
  ]}]);
  expect(sem).toContain("Conteúdo");
  expect(sem).not.toContain("pergunte assim");
});
```

- [ ] **Passo 6: rodar e ver passar**

```bash
pnpm vitest run lib/schemas lib/agent-engine/agent/campos-do-funil-do-agente.test.ts
```

- [ ] **Passo 7: commit**

```bash
git add lib/schemas/settings.ts lib/schemas/settings.test.ts lib/agent-engine/agent/campos-do-funil-do-agente.ts lib/agent-engine/agent/campos-do-funil-do-agente.test.ts
git commit -m "feat(funis): o dono escreve a pergunta que o agente faz"
```

### Tarefa 3.2: o input na tela de funis

**Arquivos:**
- Modificar: a tela de campos personalizados em `app/app/settings/tenant/pipelines/`
  (localizar com `grep -rln "custom" app/app/settings/tenant/pipelines`)
- Teste: Playwright em `tests/e2e/` **ou** teste de componente, conforme o padrão
  que a tela já tiver

⚠️ **Antes de escrever, leia a tela.** Ela já desenha `key`, `label`, `type`,
`required` e `options`; o input novo segue o mesmo desenho, nunca um diferente.

- [ ] **Passo 1: localizar e ler**

```bash
grep -rln "customFieldSchema\|pipelineConfigPatchSchema" app components | grep -v test
```

- [ ] **Passo 2: acrescentar o input**

Rótulo: **"Pergunta que o agente faz (opcional)"**. Ajuda embaixo: *"Deixe em
branco e o agente monta a pergunta a partir do nome do campo."*

- [ ] **Passo 3: a prova de tela**

Spec nova entra em `SPECS_PARTE_N` do `.github/workflows/e2e.yml`, senão
`tests/unit/e2e-cobertura-completa.test.ts` reprova.

- [ ] **Passo 4: gates e commit**

```bash
pnpm typecheck && pnpm lint
git add -A app components tests .github
git commit -m "feat(funis): a pergunta do agente ganha campo na tela"
```

---

## Onda 4 — nunca sobrescreve humano

**Entrega sozinha.** É a onda que impede o CRM de encher de dado errado com cara
de certo.

### Tarefa 4.1: a migration 0254 — a proposta ganha destino

**Arquivos:**
- Criar: `supabase/migrations/20260915100000_0254_proposta_de_dado_alcanca_o_campo_do_funil.sql`
- Modificar: `supabase/baseline.sql` (apêndice no fim)
- Modificar: `supabase/migrations/MANIFEST.md`
- Teste: `tests/invariants/proposta-de-campo-do-funil.test.ts`

**Interfaces:**
- Produz: `contact_field_proposals.destino text not null` (`'contact'` | `'lead_custom_field'`)
  e `contact_field_proposals.lead_id uuid null references crm_leads(id) on delete cascade`

⚠️ **A ARMADILHA DESTA ONDA, e ela é silenciosa.** O índice de idempotência que
existe hoje é

```sql
create unique index uq_contact_field_proposals_uma_viva
  on public.contact_field_proposals (organization_id, contact_id, campo)
  where status = 'pending';
```

e o comentário dele diz que **ele é a idempotência, não otimização** — sem ele, a
IA que ouve o mesmo e-mail dez vezes cria dez linhas.

Acrescentar `lead_id` **nulo** para as propostas de contato **quebra esse índice
sem aviso**: no Postgres, `NULL` é distinto de `NULL` num índice único, então
`(org, contato, NULL, 'email')` entra quantas vezes quiser. O conserto é indexar
uma expressão que nunca é nula:

```sql
coalesce(lead_id, '00000000-0000-0000-0000-000000000000'::uuid)
```

`unique nulls not distinct` também resolveria e é PG15 — exatamente o piso que
dizemos suportar (`tests/unit/baseline-no-piso-do-postgres.test.ts`). Encostar no
piso para economizar uma linha não se paga: use o `coalesce`.

- [ ] **Passo 1: escrever a migration**

```sql
-- 0254 — a proposta de dado alcança o campo personalizado do funil
--
-- O agente passa a propor valor para campo de funil, não só para as três
-- colunas de `contacts`. A mecânica é a MESMA (prazo, tela, cron de
-- vencimento): estender em vez de duplicar evita dois crons, duas telas e duas
-- chances de divergir.

-- 1. As colunas, nascendo compatíveis com quem já tem proposta viva.
alter table public.contact_field_proposals
  add column if not exists destino text;
alter table public.contact_field_proposals
  add column if not exists lead_id uuid references public.crm_leads(id) on delete cascade;

-- 2. CARIMBAR ANTES de exigir (doutrina de migrations, regra 8): sem isto o
--    `update.sh` de um clone com proposta pendente quebra no `not null`.
update public.contact_field_proposals set destino = 'contact' where destino is null;

alter table public.contact_field_proposals
  alter column destino set default 'contact';
alter table public.contact_field_proposals
  alter column destino set not null;

-- 3. Vocabulário do destino.
alter table public.contact_field_proposals
  drop constraint if exists contact_field_proposals_destino_check;
alter table public.contact_field_proposals
  add constraint contact_field_proposals_destino_check check (
    destino = any (array['contact', 'lead_custom_field']::text[])
  );

-- 4. O `campo` deixa de ser lista fixa — mas SÓ para o destino novo.
--    Para `contact` continua fechado: o que entra ali vira escrita em `contacts`,
--    e campo livre deixaria a IA propor qualquer coluna.
--    Para `lead_custom_field` não existe lista fixa possível: o vocabulário é o
--    que o dono declarou em `pipelines.settings.fields`, e quem confere isso é a
--    aceitação, no servidor (Tarefa 4.3).
alter table public.contact_field_proposals
  drop constraint if exists contact_field_proposals_campo_check;
alter table public.contact_field_proposals
  add constraint contact_field_proposals_campo_check check (
    (destino = 'contact' and campo = any (array['email', 'name', 'phone_number']::text[]))
    or (destino = 'lead_custom_field' and campo ~ '^[a-zA-Z][a-zA-Z0-9_]{0,39}$')
  );

-- 5. Coerência: campo de funil exige lead; dado de contato não tem lead.
alter table public.contact_field_proposals
  drop constraint if exists contact_field_proposals_destino_coerente;
alter table public.contact_field_proposals
  add constraint contact_field_proposals_destino_coerente check (
    (destino = 'contact' and lead_id is null)
    or (destino = 'lead_custom_field' and lead_id is not null)
  );

-- 6. ⚠️ A IDEMPOTÊNCIA. O índice antigo não conhece `lead_id`, e NULL é distinto
--    de NULL num índice único — mantê-lo como está devolveria o defeito que ele
--    veio matar: dez propostas idênticas do mesmo e-mail.
drop index if exists public.uq_contact_field_proposals_uma_viva;
create unique index if not exists uq_contact_field_proposals_uma_viva
  on public.contact_field_proposals (
    organization_id,
    contact_id,
    coalesce(lead_id, '00000000-0000-0000-0000-000000000000'::uuid),
    campo
  )
  where status = 'pending';

comment on column public.contact_field_proposals.destino is
  'Para onde o valor vai se alguém confirmar: coluna de `contacts` ou campo personalizado do lead do funil.';
```

- [ ] **Passo 2: apêndice idempotente no `baseline.sql`**

Bloco novo no fim, rotulado `-- ---- proposta de dado alcança o campo do funil (migration 0254) ----`,
com o MESMO SQL. ⚠️ Os blocos antigos da constraint `contact_field_proposals_campo_check`
(linha ~11528) **continuam onde estão** — eles rodam antes e o bloco novo os
substitui; o que a doutrina proíbe é **reconstruir a mesma constraint em N blocos
com vocabulários diferentes**, e é isso que `baseline-constraint-reconstruida`
mede. Rodar o teste para confirmar, não para acreditar.

- [ ] **Passo 3: linha no MANIFEST**

```
| 20260915100000_0254 | proposta_de_dado_alcanca_o_campo_do_funil | A proposta de dado passa a valer também para campo personalizado do funil (`destino`, `lead_id`), com o índice de idempotência refeito para não ser furado por `lead_id` nulo. |
```

- [ ] **Passo 4: rodar os gates de baseline que rodam nesta máquina**

```bash
pnpm vitest run tests/unit/baseline-constraint-reconstruida.test.ts tests/unit/manifest-x-migrations.test.ts tests/unit/apendice-do-baseline-nao-diverge-da-cadeia.test.ts
```

- [ ] **Passo 5: commit — os três artefatos JUNTOS**

```bash
git add supabase/migrations/20260915100000_0254_proposta_de_dado_alcanca_o_campo_do_funil.sql supabase/baseline.sql supabase/migrations/MANIFEST.md
git commit -m "feat(db): a proposta de dado alcanca o campo personalizado do funil"
```

### Tarefa 4.2: o invariante do índice furado

**Arquivos:** Criar `tests/invariants/proposta-de-campo-do-funil.test.ts`

⚠️ **Este teste existe por causa do modo de falha do Passo 6 acima.** Ele é a
única prova de que a idempotência sobreviveu à coluna nula.

- [ ] **Passo 1: escrever**

```ts
it("duas propostas iguais do mesmo contato continuam impossíveis", async () => {
  await inserirProposta({ destino: "contact", campo: "email", valor: "a@b.com" });
  await expect(
    inserirProposta({ destino: "contact", campo: "email", valor: "a@b.com" }),
  ).rejects.toMatchObject({ code: "23505" });
});

it("o mesmo campo em DOIS leads do mesmo contato é permitido", async () => {
  await inserirProposta({ destino: "lead_custom_field", leadId: LEAD_A, campo: "segmento" });
  await expect(
    inserirProposta({ destino: "lead_custom_field", leadId: LEAD_B, campo: "segmento" }),
  ).resolves.toBeTruthy();
});

it("campo de funil sem lead é recusado pelo banco", async () => {
  await expect(
    inserirProposta({ destino: "lead_custom_field", leadId: null, campo: "segmento" }),
  ).rejects.toMatchObject({ code: "23514" });
});
```

- [ ] **Passo 2: rodar — no CI**

Nesta máquina `pnpm test:db` não roda. Empurrar e ler o job `invariants`.

- [ ] **Passo 3: commit**

```bash
git add tests/invariants/proposta-de-campo-do-funil.test.ts
git commit -m "test(db): a idempotencia da proposta sobrevive ao lead nulo"
```

### Tarefa 4.3: a precedência no código

**Arquivos:**
- Modificar: `lib/contacts/proposta-de-dado.ts`
- Modificar: `app/api/v1/contacts/[id]/proposals/[proposal_id]/route.ts` (aceitação)
- Teste: `lib/contacts/proposta-de-dado.test.ts`

**Interfaces:**
- Consome: `camposDoFunil()` de `lib/leads/campos-do-funil.ts`
- Produz: `proporDadoDoContato(..., { destino, leadId })`; motivo novo
  `campo_nao_declarado`

⚠️ **A chave tem de existir em `settings.fields` NA ACEITAÇÃO, conferida no
servidor.** Conferir só na proposta deixa passar o caso em que o dono apaga o
campo entre propor e confirmar — e a escrita entraria num `jsonb` sem dono.

⚠️ **Precedência em CÓDIGO, não em instrução.** Instrução o modelo desobedece:
se o valor gravado foi escrito por gente e o novo diverge, a ferramenta **não
grava** — devolve proposta.

- [ ] **Passo 1: escrever o teste que falha**

```ts
it("campo já preenchido não é sobrescrito — vira proposta", async () => {
  const lead = await comLead({ custom_fields: { segmento: "clinica" } });
  const r = await anotarCampoDoFunil({ leadId: lead.id, campo: "segmento", valor: "estetica" });
  expect(r.gravou).toBe(false);
  expect(r.propostaCriada).toBe(true);
  expect((await lerLead(lead.id)).custom_fields.segmento).toBe("clinica");
});

it("campo vazio é gravado direto — não há o que proteger", async () => {
  const lead = await comLead({ custom_fields: {} });
  const r = await anotarCampoDoFunil({ leadId: lead.id, campo: "segmento", valor: "clinica" });
  expect(r.gravou).toBe(true);
});

it("chave fora de settings.fields é recusada", async () => {
  const r = await anotarCampoDoFunil({ leadId: LEAD, campo: "inventado", valor: "x" });
  expect(r.motivo).toBe("campo_nao_declarado");
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
pnpm vitest run lib/contacts/proposta-de-dado.test.ts
```

- [ ] **Passo 3: implementar**

Estender `proporDadoDoContato` com `destino` e `leadId`; na aceitação, ler
`crm_pipelines.settings` do funil do lead, rodar `camposDoFunil()` e recusar
chave ausente com `campo_nao_declarado`.

- [ ] **Passo 4: rodar, sabotar, restaurar**

Remover a conferência de precedência. Previsão: **1 vermelho** (o primeiro teste).

- [ ] **Passo 5: commit**

```bash
git add lib/contacts app/api/v1/contacts
git commit -m "feat(propostas): valor escrito por gente nao e sobrescrito pela IA"
```

### Tarefa 4.4: a timeline nomeia o campo, nunca o valor

**Arquivos:**
- Modificar: `lib/crm/atividades.ts` (constante compartilhada — localizar com
  `grep -rn "lead_edited" --include=*.ts lib | grep -v test`)
- Teste: `tests/unit/timeline-nao-mostra-valor.test.ts`

⚠️ **§9.** O `reason` é renderizado na tela e vai junto em captura, exportação e
ticket de suporte. Nomeia **campos**; o valor e a frase vivem em
`contact_field_proposals.trecho`, sob RLS.

⚠️ **Constante compartilhada, nunca string literal** — `crm_lead_activities.type`
é vocabulário aberto de propósito, e a única coisa que o segura é o TypeScript.

- [ ] **Passo 1: escrever o teste**

```ts
it("o reason nomeia o campo e não o valor", async () => {
  await anotarCampoDoFunil({ leadId: LEAD, campo: "segmento", valor: "clínica de estética" });
  const [ativ] = await atividadesDo(LEAD);
  expect(ativ.reason).toContain("segmento");
  expect(ativ.reason).not.toContain("estética");
  expect(JSON.stringify(ativ.payload)).not.toContain("estética");
});
```

- [ ] **Passo 2: rodar, implementar, rodar, commitar**

```bash
pnpm vitest run tests/unit/timeline-nao-mostra-valor.test.ts
git add lib/crm tests/unit/timeline-nao-mostra-valor.test.ts
git commit -m "feat(timeline): a anotacao do agente nomeia o campo, nunca o valor"
```

---

## Onda 5 — os obrigatórios, antes do handoff

**Entrega sozinha.**

### Tarefa 5.1: conferir sem travar

**Arquivos:**
- Modificar: `lib/ai/handoff/orchestrator.ts` (`triggerHandoff`, ~linha 73)
- Teste: `lib/ai/handoff/orchestrator.test.ts`

**Interfaces:**
- Consome: `HandoffReason` (já existe: `requested_human`, `low_sentiment`,
  `low_confidence`, `critical_stage`, `legal_mention`, `refund_mention`,
  `orcamento_de_ia`)
- Produz: `metadata.obrigatorios_em_branco: string[]` — chaves, **nunca valores**

⚠️ **A conferência NUNCA trava o handoff.** `requested_human` é o cliente
**pedindo** uma pessoa; segurar a passagem porque falta um campo transforma
proteção de dado em parede na frente do cliente. Ela **declara** o que ficou em
branco, e quem recebe decide.

- [ ] **Passo 1: escrever o teste que falha**

```ts
it("handoff pedido pelo cliente passa mesmo com obrigatório em branco", async () => {
  const r = await triggerHandoff({ ...base, reason: "requested_human" });
  expect(r.triggered).toBe(true);
});

it("e declara o que ficou em branco — por chave, sem valor", async () => {
  const r = await triggerHandoff({ ...base, reason: "requested_human" });
  const ativ = await ultimaAtividade();
  expect(ativ.payload.obrigatorios_em_branco).toEqual(["convenio"]);
  expect(JSON.stringify(ativ.payload)).not.toMatch(/unimed|particular/);
});

it("com tudo preenchido, a lista é vazia", async () => {
  await preencher({ convenio: "unimed" });
  const ativ = await ultimaAtividade();
  expect(ativ.payload.obrigatorios_em_branco).toEqual([]);
});
```

- [ ] **Passo 2: rodar, implementar, rodar**

```bash
pnpm vitest run lib/ai/handoff
```

- [ ] **Passo 3: sabotar**

Fazer a conferência retornar cedo quando há obrigatório em branco. Previsão:
**1 vermelho** (o primeiro teste). Restaurar.

- [ ] **Passo 4: commit**

```bash
git add lib/ai/handoff
git commit -m "feat(handoff): a passagem declara o que ficou em branco, e nao trava"
```

---

## Onda 6 — o agente propõe campo novo

**Entrega sozinha.** Depende da Onda 7 para a segunda chave.

### Tarefa 6.1: a proposta de CONFIGURAÇÃO, e o aviso na Central

**Arquivos:**
- Criar: `supabase/migrations/20260915110000_0255_o_agente_propoe_campo_e_a_central_avisa.sql`
- Modificar: `supabase/baseline.sql` — **o bloco único** da
  `agent_inbox_items_kind_check` (linha ~10044), acrescentando `lead_field_proposed`
- Modificar: `supabase/migrations/MANIFEST.md`
- Modificar: a tela `app/app/settings/tenant/pipelines/`

⚠️ **`kind` é fechado por CHECK (27 valores) e a constraint tem BLOCO ÚNICO.**
Recriá-la num apêndice novo faz o bloco antigo falhar ao re-aplicar num clone com
dado do vocabulário novo — e `baseline-constraint-reconstruida` reprova. Edite o
bloco que existe.

⚠️ **A proposta de campo NÃO vai para a ficha do lead.** Preencher e corrigir são
do lead; criar campo é **configuração do funil**, e muda a tela de todos os leads
para sempre. Vai para **Configurações › Funis**, junto de onde o campo já é criado
à mão.

⚠️ **Teto de 50 campos por funil.** A aceitação recusa quando o funil está no
teto, com mensagem que diz o número — não um `23514` cru na tela.

- [ ] **Passo 1: a migration, o apêndice e o MANIFEST**

Mesma tripla da Tarefa 4.1, acrescentando `'lead_field_proposed'` ao bloco único.

- [ ] **Passo 2: o teste do bloco único**

```bash
pnpm vitest run tests/unit/baseline-constraint-reconstruida.test.ts
```

- [ ] **Passo 3: a tela e o aviso**

Aviso na Central com o `kind` novo, apontando para Configurações › Funis. Sem ele
a proposta nasce e ninguém é avisado — foi o que aconteceu com a primeira
proposta desta instalação, que ficou horas sem ser vista.

- [ ] **Passo 4: gates e commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run tests/unit
git add -A supabase app tests
git commit -m "feat(funis): o agente propoe campo novo e a Central avisa"
```

---

## Onda 7 — as duas chaves, nascendo desligadas

**Acompanha a Onda 1.**

### Tarefa 7.1: duas colunas em `ai_agent_versions`

**Arquivos:**
- Criar: `supabase/migrations/…_0255_…sql` (mesmo arquivo da Onda 6, ou 0256 se as
  ondas forem separadas em PRs distintos — **reconferir o número livre na hora**)
- Modificar: `supabase/baseline.sql`, `supabase/migrations/MANIFEST.md`
- Modificar: **os 8 arquivos com a lista literal de colunas** —
  `grep -rn "cases_enabled" --include=*.ts --include=*.tsx app lib | grep -v test`
- Modificar: `lib/agent-engine/agent/agent-config.ts` (`Row`, `SELECT_AGENT_CONFIG_COLUMNS`, `mapAgentConfigRow`)
- Modificar: `app/app/ai/agents/[id]/_components/AgentForm.tsx` e `VersionDiff.tsx`

**Interfaces:**
- Produz: `PublishedAgentConfig.leadFieldsEnabled: boolean` e
  `PublishedAgentConfig.leadFieldsProposeNew: boolean`

⚠️ **Colunas, não `config`.** `config` é de `ai_agents`, não da versão: em
`config` a chave seria mutável e ficaria fora do versionamento e do diff de
versões. Coluna em `ai_agent_versions` herda a imutabilidade por gatilho — ligar é
publicar versão nova, desligar é mover o ponteiro.

⚠️ **`?? false` no mapeamento**, como `operator_enabled` faz: clone que ainda não
aplicou a migration recebe coluna ausente, e a direção segura é **desligado**.

⚠️ **Separadas de propósito:** quase todo mundo quer a primeira (perguntar e
preencher) e não a segunda (propor campo novo).

- [ ] **Passo 1: escrever o teste que falha**

```ts
it("clone sem a coluna recebe as chaves desligadas", () => {
  const cfg = mapAgentConfigRow({ ...linhaMinima, lead_fields_enabled: undefined });
  expect(cfg.leadFieldsEnabled).toBe(false);
  expect(cfg.leadFieldsProposeNew).toBe(false);
});

it("ligado no banco chega ligado no turno", () => {
  const cfg = mapAgentConfigRow({ ...linhaMinima, lead_fields_enabled: true });
  expect(cfg.leadFieldsEnabled).toBe(true);
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
pnpm vitest run lib/agent-engine/agent
```

- [ ] **Passo 3: a migration (tripla) e o mapeamento**

```sql
alter table public.ai_agent_versions
  add column if not exists lead_fields_enabled boolean not null default false;
alter table public.ai_agent_versions
  add column if not exists lead_fields_propose_new boolean not null default false;
```

```ts
    // `?? false` cobre o clone que ainda não aplicou a 0255: coluna ausente vem
    // como null/undefined, e a direção segura é DESLIGADO — nunca ligar
    // capacidade por causa de um schema desatualizado.
    leadFieldsEnabled: r.lead_fields_enabled ?? false,
    leadFieldsProposeNew: r.lead_fields_propose_new ?? false,
```

- [ ] **Passo 4: as 8 listas literais**

```bash
grep -rn "cases_enabled" --include=*.ts --include=*.tsx app lib | grep -v "\.test\." | cut -d: -f1 | sort -u
```

Cada arquivo dessa lista recebe as duas colunas novas. **Conferir o número de
arquivos antes e depois** — uma lista esquecida faz a chave sumir naquela tela
sem erro nenhum.

- [ ] **Passo 5: os dois interruptores na tela**

Em `AgentForm.tsx`, no molde do `cases_enabled` (~linha 1110), e as duas linhas em
`VersionDiff.tsx` (~linha 90) — senão ligar a chave não aparece no diff de versões.

- [ ] **Passo 6: gates**

```bash
rm -f tsconfig*.tsbuildinfo; pnpm typecheck; pnpm lint
pnpm test:unit > /tmp/vt.log 2>&1; echo exit=$?
grep -aE "Test Files|Tests " /tmp/vt.log | tail -2
```

- [ ] **Passo 7: commit**

```bash
git add -A supabase lib app
git commit -m "feat(agentes): as duas chaves dos campos do funil, nascendo desligadas"
```

---

## Prova final, antes de declarar pronto

- [ ] **A suíte inteira, uma vez** (não os gates que você lembra):

```bash
pnpm test:unit > /tmp/vt.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests " /tmp/vt.log | tail -2
r=$(grep -aE "^ *Tests " /tmp/vt.log | tail -1 | grep -oE "[0-9]+ failed" | head -1)
g=$(grep -acE "^ *FAIL " /tmp/vt.log)
echo "rodapé: ${r:-0 failed} | grep contou: $g"
```

- [ ] **`pnpm build`** — o `build-and-size` é check obrigatório.
- [ ] **`pnpm test:db` e `pnpm test:e2e` no CI do fork** — não rodam nesta máquina.
- [ ] **Prova de tela num funil de OUTRO nicho** (clínica, com `select` e
  `boolean`), não no funil de briefing: o que se prova é a capacidade genérica.
- [ ] **VPS:** Paulo conversa pelo WhatsApp e confere na ficha do lead.

---

## Autorrevisão deste plano

**Cobertura da spec.** As oito ondas da spec têm tarefa. As três correções do topo
estão refletidas nas tarefas 0.0, 0.2 e 7.1.

**Marcador vazio.** Nenhum "TBD". Dois pontos são deliberadamente abertos, e o
plano diz **como fechá-los**, não "depois se vê": (a) a tela de funis na Tarefa
3.2 — o caminho exato sai do `grep` do Passo 1, porque fixar o nome do arquivo
aqui envelheceria; (b) o número da migration da Onda 7, que depende de as ondas 6
e 7 irem no mesmo PR ou não.

**Consistência de tipos.** `nome_confirmado` (0.1) é lido pelo bloco de 0.2.
`CamposPorFunil`, `carregarCamposDoFunilDoAgente` e `renderCamposDoFunil` (1.1)
são usados com a mesma grafia em 1.2, 2.1 e 3.1. `leadFieldsEnabled` (7.1) é a
mesma chave que 1.2 lê — e 1.2 traz escrito o que acontece se a Onda 7 vier
depois.

**Ordem entre ondas.** 0 é independente. 1 depende de 7 para o interruptor, e o
plano resolve sem travar (a chave `false` no tipo até a coluna existir). 2 depende
de 1. 3, 4 e 5 dependem de 1. 6 depende de 4 (a mecânica de proposta) e de 7 (a
segunda chave).

---

## Como executar

Duas opções:

1. **Um subagente por tarefa** (recomendado) — revisão entre tarefas, iteração rápida.
2. **Execução nesta sessão** — em lotes, com ponto de conferência por onda.

---

## Living System Checklist — item 13 do Definition of Done

Respondido com **artefato nomeado**, nunca com o que a peça "poderia" fazer.
Medido em 2026-09-14.

### Peça: o agente identifica quem está do outro lado (Onda 0)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Quem me alimenta? | `contacts.name` e `contacts.display_name`, pela query de `lib/agent-engine/edge/crm/get-lead-context.ts:184`; e `ai_agent_versions.tool_ids`, por `agentConfig.toolIds` |
| 2 | Quem eu alimento? | `crm_propose_contact_field` (`lib/mcp/tools/contacts.ts:134`) → `proporDadoDoContato` → tabela `contact_field_proposals` |
| 3 | Que registro eu emito? | a própria linha em `contact_field_proposals` (com `trecho`, a frase que originou) e o audit `mcp.tool_called` |
| 4 | Onde apareço na tela? | `components/contacts/PropostasDeDado.tsx`, na ficha do contato (`app/app/contacts/[id]/_client.tsx`) — *"O QUE A IA OUVIU E ESPERA UMA PESSOA CONFIRMAR"* |
| 5 | Por qual porta se chega? | a ficha do contato, que já tem porta. **Nenhuma tela nova** — nada a declarar em `lib/navigation/catalogo.ts` |
| 6 | Qual meu anti-morte? | o cron `app/api/v1/cron/contact-proposals-watcher/route.ts`: proposta que ninguém decide vence e vira item de caixa, em vez de virar badge permanente |
| 7 | Onde se configura? | a capacidade **"Anotar dado que o cliente informou"** na tela do agente. **O que aparece se faltar:** o bloco não é empilhado — e é um teste que prova, não uma esperança |
| 8 | Qual a continuidade IA↔humano? | a proposta **é** a continuidade: a IA entrega valor + evidência (`trecho`), e o humano decide com os dois lados à vista (`valor_anterior` existe para isso) |
| 9 | Qual meu laço de retorno? | `contact_field_proposals.motivo_recusa` — proposta recusada diz onde a IA erra, e o comentário da coluna no schema já nomeia isso como o laço |
| 10 | Atualizei o mapa? | `docs/architecture/crm-vivo.architecture.json` e `agent-turn.workflow.json` já contêm a peça das propostas; a aresta nova é *bloco de identificação → `crm_propose_contact_field`* |

### Peça: o agente enxerga e preenche os campos do funil (Ondas 1–2)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Quem me alimenta? | `crm_pipelines.settings.fields` (o dono declara na tela de funis) e `ai_agent_versions.pipeline_ids` |
| 2 | Quem eu alimento? | o prompt do turno → `crm_update_lead` → `crm_leads.custom_fields` → a ficha do lead, que já desenha todos |
| 3 | Que registro eu emito? | `crm_lead_activities` tipo `lead_edited`, com `payload.fields` — **nomes de campo, nunca valores** (§9) |
| 4 | Onde apareço na tela? | ficha do lead (os campos preenchidos) e a timeline do lead (quais campos foram anotados) |
| 5 | Por qual porta se chega? | telas existentes. Nenhuma porta nova |
| 6 | Qual meu anti-morte? | **Onda 5** — a conferência dos obrigatórios antes do handoff. ⚠️ **Enquanto as ondas 1–2 estiverem na VPS sem a 5, esta peça não tem anti-morte, e isto é dívida declarada:** campo obrigatório em branco não vira próximo passo de ninguém |
| 7 | Onde se configura? | a chave `lead_fields_enabled` (Onda 7), na tela do agente. **O que aparece se faltar:** o bloco não entra e o prefixo fica byte-idêntico ao de hoje — provado por teste |
| 8 | Qual a continuidade IA↔humano? | Onda 5: o handoff **declara** o que ficou em branco em vez de travar a passagem |
| 9 | Qual meu laço de retorno? | Onda 4 fecha metade: valor divergente vira proposta, e a recusa com motivo diz onde a IA erra. ⚠️ **A outra metade fica aberta e declarada:** quando o agente grava num campo **vazio** e acerta a forma mas erra o conteúdo, o humano corrige na ficha e **nada sinaliza** — o sistema não aprende com essa correção. Candidato a onda futura: correção humana de campo que a IA preencheu emite sinal |
| 10 | Atualizei o mapa? | `docs/architecture/crm-vivo.architecture.json` — aresta nova: *definição dos campos do funil → prefixo do turno do agente* |

**Invariante 7, dito sem rodeio:** a Onda 0 fecha o laço (a recusa da proposta é o
retorno). As Ondas 1–2 **não fecham sozinhas** — só com a 4 e a 5. Quem parar na
2 leva uma capacidade que funciona e não aprende. É decisão de quem opera, e está
escrita aqui para ser decisão, não descuido.
