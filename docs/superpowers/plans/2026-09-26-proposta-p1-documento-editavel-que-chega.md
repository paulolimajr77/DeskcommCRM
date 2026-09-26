# Proposta P1 — o documento é corrigível na tela, e é ele que chega ao cliente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Fechar o item 1 da spec: a pessoa corrige seção e campo do documento na tela, a proposta com modelo passa a poder ser enviada, e o PDF que o cliente recebe é o documento.

**Architecture:** Um módulo novo (`lib/propostas/documento/documento-da-proposta.ts`) passa a ser o **único** lugar que resolve o modelo, renderiza, aplica as seções reescritas e calcula as pendências — a rota do documento, a trava de envio, o snapshot e o PDF usam ele (hoje o cálculo está copiado três vezes). Um vocabulário de nomes legíveis (`rotulos-das-variaveis.ts`) diz, para cada `{{variável}}`, como ela se chama para uma pessoa e onde se preenche. A rota do documento ganha o preenchimento de campo e o "voltar ao texto do modelo", e passa a recusar proposta fora de rascunho. A tela troca `<div>` por campos editáveis.

**Tech Stack:** Next.js Route Handlers, Supabase JS (admin client), Zod, @react-pdf/renderer, React 19, Vitest + Testing Library.

**Spec:** [`docs/superpowers/specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md`](../specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md) — §1.4, §1.5, §1.6 e §2 Item 1; decisões D1–D4.

## Como este plano é executado (opencode)

- **Base:** este plano parte da `vps/pljr-combinada` do fork (é a única branch que tem o N1, o N2 e os consertos de 26/09 — medido com `git branch -a --contains 772dc8bc2`). Trabalhe numa worktree própria (Task 0), **nunca** na pasta principal do clone.
- **Medir antes de colar.** Todo trecho "Modify" traz o texto atual que ele substitui. Se o texto no arquivo não bater byte a byte, **pare e reporte** — o arquivo mudou depois da medição.
- **O que roda nesta máquina:** só `npx vitest run <arquivos da tarefa>`, `pnpm typecheck` e `pnpm lint`. Nada de `pnpm test:unit` inteiro, `pnpm test:db`, `pnpm test:e2e` ou `pnpm build` — esses são do CI do fork.
- **Sabotagem:** onde o passo diz "sabotar", copie o arquivo antes (`cp arq "$TMP/arq.bak"`), faça a sabotagem, rode, e restaure **da cópia** (`cp "$TMP/arq.bak" arq`) — nunca com `git checkout --`, que apaga o trabalho ainda não commitado.
- **Um commit por tarefa**, com a linha `Co-Authored-By` que a sessão pedir. **Não empurre** (`git push`): quem empurra, desce para a `vps/pljr-combinada` e publica é a sessão Claude, depois de revisar.

## Global Constraints

- Toda consulta com o client admin filtra `organization_id` com o valor de `authz.org.orgId` — nunca do corpo (anti-pattern 10).
- Toda rota mutante começa com `requireSupportWrite()` antes de qualquer efeito (cerca `tests/unit/suporte-cobertura-de-efeitos.test.ts`).
- Texto de tela e de erro sai de `t(...)`; cada chave nova ganha entrada em espanhol em `lib/i18n/dicionario.ts` no MESMO commit (cerca `tests/unit/i18n-espanhol-cobre-a-tela.test.ts`). Antes de acrescentar uma chave, confira se ela já existe — `grep -n '^  "<chave>":\|^  <chave>:' lib/i18n/dicionario.ts` — porque chave duplicada em objeto literal quebra o `typecheck`.
- `formatCents`/`formatarMoeda` são os únicos formatadores de dinheiro; nenhum `Intl.NumberFormat` novo.
- Auditoria nunca grava o VALOR que a pessoa digitou num campo (é dado do cliente): só o caminho do campo.
- Proposta sem modelo confirmado continua exatamente como hoje (PDF de itens, sem trava de documento).
- Nada muda no banco neste plano: `prazo_dias_uteis`, `pagamento`, `briefing_json` e `secoes_editadas` já existem em `crm_proposals` (medido na VPS: `information_schema.columns`).

## Review Focus

- **Variável que aparece em várias seções** (`excluded.list` está nas seções "limitations" e "excluded" do `projeto_personalizado`) — preenchê-la uma vez tem de resolver as duas, e "O que falta" tem de listá-la uma vez só. Task 3 testa.
- **Seção reescrita e depois o campo dela é preenchido** — a reescrita continua valendo (a pessoa escreveu o texto final); o campo preenchido só aparece nas OUTRAS seções. Task 3 testa.
- **`secoes_editadas` com lixo** (array, número, valor não-string vindo de clone antigo) — é ignorado, nunca lança. Task 3 testa.
- **Proposta enviada aberta em outra aba** — salvar seção, voltar ao modelo ou preencher campo devolve 409, nunca grava. Task 4 testa.
- **Trocar o modelo com seção reescrita** — sem a confirmação, a rota recusa e nada muda; com ela, as reescritas saem junto. Task 5 testa.

---

### Task 0: Worktree de trabalho

- [ ] **Step 1: Conferir a árvore principal e criar a worktree**

```bash
cd "D:/PROJETOS VIBE CODING/DeskcommCRM"
git status --short                         # só pode aparecer "?? PLJR-Proposal-System-v1.1.0/" e arquivos de docs/superpowers
git fetch fork
git worktree add "../deskcomm-proposta-p1" -b feat/proposta-p1-documento fork/vps/pljr-combinada
cd "../deskcomm-proposta-p1"
pnpm install --frozen-lockfile
```

A worktree fica FORA de `/tmp` e com `node_modules` real (Turbopack recusa symlink). Se `git status` da pasta principal mostrar arquivo modificado que não seja de `docs/superpowers/`, **pare** — é trabalho de outra sessão.

- [ ] **Step 2: Retrato de partida dos testes da área**

```bash
npx vitest run lib/propostas "app/api/v1/proposals" "app/app/proposals" > "$TMP/p1-antes.log" 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests " "$TMP/p1-antes.log" | tail -2
```

Anote o rodapé. É a régua para dizer, no fim, que nada que estava verde ficou vermelho.

---

### Task 1: Nome legível e lugar de preenchimento de cada variável

**Files:**
- Create: `lib/propostas/documento/rotulos-das-variaveis.ts`
- Create: `lib/propostas/documento/rotulos-das-variaveis.test.ts`

**Interfaces:**
- Produces:
  - `ROTULO_DA_VARIAVEL: Readonly<Record<string, string>>`
  - `rotuloDaVariavel(caminho: string): string`
  - `type OndePreencher = "briefing" | "campo_prazo" | "itens" | "contato" | "sistema"`
  - `ondePreencher(caminho: string): OndePreencher`

- [ ] **Step 1: Escrever o teste**

```typescript
// lib/propostas/documento/rotulos-das-variaveis.test.ts
import { describe, expect, it } from "vitest";

import { MODELOS_BASE } from "../modelos/catalogo-base";
import { extrairVariaveis } from "./variaveis";
import { ROTULO_DA_VARIAVEL, ondePreencher, rotuloDaVariavel } from "./rotulos-das-variaveis";

describe("rótulos das variáveis", () => {
  it("toda variável usada pelos modelos da plataforma tem nome legível (varre, não lista)", () => {
    const usadas = new Set(
      Object.values(MODELOS_BASE).flatMap((m) => m.sections.flatMap((s) => extrairVariaveis(s.body))),
    );
    const semNome = [...usadas].filter((v) => !Object.hasOwn(ROTULO_DA_VARIAVEL, v));
    expect(semNome).toEqual([]);
    // guarda de vacuidade: a varredura achou alguma coisa
    expect(usadas.size).toBeGreaterThan(20);
  });

  it("variável desconhecida (modelo da empresa) vira o último pedaço, legível", () => {
    expect(rotuloDaVariavel("scope.tipo_de_imovel")).toBe("Tipo de imovel");
    expect(rotuloDaVariavel("x")).toBe("X");
  });

  it("variável conhecida devolve o nome do vocabulário", () => {
    expect(rotuloDaVariavel("scope.property_filters")).toBe("Filtros de busca de imóveis");
  });

  it("diz onde cada variável se preenche", () => {
    expect(ondePreencher("project.objective")).toBe("briefing");
    expect(ondePreencher("client.company")).toBe("briefing");
    expect(ondePreencher("included.list")).toBe("briefing");
    expect(ondePreencher("schedule.estimated_days")).toBe("campo_prazo");
    expect(ondePreencher("investment.total_formatted")).toBe("itens");
    expect(ondePreencher("client.name")).toBe("contato");
    expect(ondePreencher("client.company_or_name")).toBe("contato");
    expect(ondePreencher("commercial_terms.validity_days")).toBe("sistema");
    expect(ondePreencher("approval.date")).toBe("sistema");
    expect(ondePreencher("numero")).toBe("sistema");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/documento/rotulos-das-variaveis.test.ts`
Expected: FAIL — `Cannot find module './rotulos-das-variaveis'`

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/documento/rotulos-das-variaveis.ts
/**
 * O nome de cada `{{variável}}` para uma pessoa ler, e onde ela se preenche.
 *
 * A tela e a trava de envio falavam em `project.objective`; quem revisa uma
 * proposta não sabe o que é isso. O teste ao lado VARRE os modelos da
 * plataforma e reprova variável nova sem nome — a lista não envelhece calada.
 */
export const ROTULO_DA_VARIAVEL: Readonly<Record<string, string>> = Object.freeze({
  "approval.date": "Data da aprovação",
  "client.company": "Empresa do cliente",
  "client.company_or_name": "Empresa ou nome do cliente",
  "client.name": "Nome do cliente",
  "commercial_terms.validity_days": "Validade da proposta (dias)",
  "excluded.list": "O que não está incluído",
  "included.list": "O que está incluído",
  "investment.total_formatted": "Investimento total",
  "project.business_context": "Contexto do negócio",
  "project.description": "Descrição da solução",
  "project.name": "Nome do projeto",
  "project.objective": "Objetivo do projeto",
  "project.primary_conversion_action": "Ação principal de conversão",
  "schedule.estimated_days": "Prazo (dias úteis)",
  "scope.actions": "Ações da automação",
  "scope.admin_features": "Recursos administrativos",
  "scope.assumptions": "Premissas",
  "scope.content.client_provided_list": "Materiais fornecidos pelo cliente",
  "scope.content.initial_population": "Cadastro inicial de imóveis",
  "scope.content.provider_provided_list": "Conteúdos produzidos pelo fornecedor",
  "scope.features_conversion_list": "Elementos de conversão",
  "scope.features_list": "Funcionalidades",
  "scope.integrations_list": "Integrações",
  "scope.pages_list": "Lista de páginas",
  "scope.payment_methods": "Meios de pagamento",
  "scope.product_catalog_fields": "Campos do catálogo de produtos",
  "scope.property_filters": "Filtros de busca de imóveis",
  "scope.services_list": "Serviços oferecidos",
  "scope.shipping_rules": "Regras de entrega e frete",
  "scope.triggers": "Gatilhos da automação",
  "scope.user_roles": "Perfis de usuário",
  "scope.workflow": "Fluxo principal da automação",
  "scope.workflows": "Fluxos principais",
});

export function rotuloDaVariavel(caminho: string): string {
  if (Object.hasOwn(ROTULO_DA_VARIAVEL, caminho)) return ROTULO_DA_VARIAVEL[caminho]!;
  const ultimo = caminho.split(".").pop() ?? caminho;
  const texto = ultimo.replace(/_/g, " ").trim();
  return texto.length === 0 ? caminho : texto.charAt(0).toUpperCase() + texto.slice(1);
}

export type OndePreencher = "briefing" | "campo_prazo" | "itens" | "contato" | "sistema";

/**
 * `montarDadosDoDocumento` calcula `client.name`, `client.company_or_name`,
 * `investment`, `schedule` e `commercial_terms` de colunas gravadas; o resto
 * vem do `briefing_json`. Esta função é o espelho daquela, para a tela saber
 * se oferece um campo ou aponta para outro lugar.
 */
export function ondePreencher(caminho: string): OndePreencher {
  if (caminho === "schedule.estimated_days") return "campo_prazo";
  if (caminho === "investment" || caminho.startsWith("investment.")) return "itens";
  if (caminho === "client.name" || caminho === "client.company_or_name") return "contato";
  if (
    caminho === "numero" ||
    caminho === "commercial_terms.validity_days" ||
    caminho === "approval" ||
    caminho.startsWith("approval.")
  ) {
    return "sistema";
  }
  return "briefing";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/documento/rotulos-das-variaveis.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Sabotar e ver o teste de varredura ficar vermelho**

Copie o arquivo, apague a linha `"scope.property_filters": ...`, rode o teste: o primeiro caso tem de falhar com `["scope.property_filters"]`. Restaure da cópia e rode de novo (verde).

- [ ] **Step 6: Commit**

```bash
git add lib/propostas/documento/rotulos-das-variaveis.ts lib/propostas/documento/rotulos-das-variaveis.test.ts
git commit -m "feat(propostas): nome legível e lugar de preenchimento de cada variável do documento (P1)"
```

---

### Task 2: A data da aprovação vira linha em branco

**Files:**
- Modify: `lib/propostas/documento/montar-dados.ts`
- Modify: `lib/propostas/documento/montar-dados.test.ts`

**Interfaces:**
- Produces: `LINHA_EM_BRANCO = "____/____/______"` (exportada); `montarDadosDoDocumento(...)` devolve também `approval: { date: LINHA_EM_BRANCO }`.

- [ ] **Step 1: Escrever o teste** — acrescente ao fim de `lib/propostas/documento/montar-dados.test.ts`:

```typescript
describe("montarDadosDoDocumento — aprovação (D2 da spec de 26/09)", () => {
  it("approval.date é sempre a linha em branco da assinatura", () => {
    const dados = montarDadosDoDocumento(PROPOSTA_BASE, null);
    expect(dados.approval).toEqual({ date: LINHA_EM_BRANCO });
  });

  it("o briefing não consegue preencher approval.date", () => {
    const dados = montarDadosDoDocumento({ ...PROPOSTA_BASE, briefing_json: { approval: { date: "01/01/2026" } } }, null);
    expect(dados.approval).toEqual({ date: LINHA_EM_BRANCO });
  });
});
```

E troque o import do topo do arquivo:

```typescript
import { montarDadosDoDocumento } from "./montar-dados";
```

por:

```typescript
import { LINHA_EM_BRANCO, montarDadosDoDocumento } from "./montar-dados";
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/documento/montar-dados.test.ts`
Expected: FAIL — `LINHA_EM_BRANCO` não exportado / `dados.approval` undefined

- [ ] **Step 3: Implementar** — em `lib/propostas/documento/montar-dados.ts`, logo depois da função `diasEntre` (texto atual abaixo), acrescente a constante:

Texto atual:
```typescript
function diasEntre(inicio: string, fim: string): number {
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000);
}
```

Depois dele, acrescente:
```typescript

/**
 * `{{approval.date}}` é a data em que o CLIENTE assina — ninguém a sabe no
 * envio. Sem valor ela virava pendência em todos os 8 modelos, e a trava de
 * envio recusava toda proposta com modelo (spec de 26/09, §1.5).
 */
export const LINHA_EM_BRANCO = "____/____/______";
```

E no `return` da função, troque:
```typescript
    commercial_terms: {
      ...briefingCommercialTerms,
      validity_days: proposta.valid_until ? diasEntre(proposta.created_at, proposta.valid_until) : null,
    },
  };
```
por:
```typescript
    commercial_terms: {
      ...briefingCommercialTerms,
      validity_days: proposta.valid_until ? diasEntre(proposta.created_at, proposta.valid_until) : null,
    },
    approval: { date: LINHA_EM_BRANCO },
  };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/documento/`
Expected: PASS em todos os arquivos da pasta

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/documento/montar-dados.ts lib/propostas/documento/montar-dados.test.ts
git commit -m "fix(propostas): data da aprovação é linha em branco, nunca pendência (P1)"
```

---

### Task 3: O documento da proposta num lugar só

**Files:**
- Create: `lib/propostas/briefing-caminho.ts`
- Modify: `lib/propostas/assistente.ts`
- Create: `lib/propostas/documento/documento-da-proposta.ts`
- Create: `lib/propostas/documento/documento-da-proposta.test.ts`

**Interfaces:**
- Consumes: `rotuloDaVariavel`, `ondePreencher`, `OndePreencher` (Task 1); `montarDadosDoDocumento`, `DadosDaPropostaParaDocumento`, `ContatoParaDocumento` (`./montar-dados`); `renderizarDocumento`, `SecaoRenderizada` (`./renderer`); `resolverModelo`, `ModeloResolvido` (`../modelos/resolver`).
- Produces:
  - `definirCaminho(obj: Record<string, unknown>, caminho: string, valor: string): Record<string, unknown>` em `lib/propostas/briefing-caminho.ts`
  - `lerSecoesEditadas(valor: unknown): Record<string, string>`
  - `interface SecaoDoDocumento extends SecaoRenderizada { editada: boolean }`
  - `interface CampoFaltando { caminho: string; rotulo: string; onde: OndePreencher; secoes: string[] }`
  - `interface DocumentoDaProposta { modelo: ModeloResolvido; secoes: SecaoDoDocumento[]; pendencias: string[]; camposFaltando: CampoFaltando[] }`
  - `interface PropostaParaDocumento extends DadosDaPropostaParaDocumento { template_slug: string | null; secoes_editadas: unknown }`
  - `montarDocumentoDaProposta(db: SupabaseClient, organizationId: string, proposta: PropostaParaDocumento, contato: ContatoParaDocumento | null): Promise<DocumentoDaProposta | null>`

- [ ] **Step 1: Tirar `definirCaminho` de dentro do assistente**

Motivo: a rota do documento (Task 4) precisa dele, e importar `assistente.ts` arrasta `run-model-call`, que valida o ambiente ao carregar e derruba o teste da rota.

Crie `lib/propostas/briefing-caminho.ts`:

```typescript
// lib/propostas/briefing-caminho.ts
/**
 * Grava `valor` no caminho pontuado (`scope.content.client_provided_list`)
 * sem mutar o objeto de entrada. Chave computada em literal cria propriedade
 * PRÓPRIA — `__proto__` como segmento não troca o protótipo de nada.
 */
export function definirCaminho(obj: Record<string, unknown>, caminho: string, valor: string): Record<string, unknown> {
  const [primeira, ...resto] = caminho.split(".");
  if (resto.length === 0) {
    return { ...obj, [primeira!]: valor };
  }
  const atual = obj[primeira!];
  const sub = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Record<string, unknown>) : {};
  return { ...obj, [primeira!]: definirCaminho(sub, resto.join("."), valor) };
}
```

Em `lib/propostas/assistente.ts`, apague a função local inteira (texto atual):

```typescript
function definirCaminho(obj: Record<string, unknown>, caminho: string, valor: string): Record<string, unknown> {
  const [primeira, ...resto] = caminho.split(".");
  if (resto.length === 0) {
    return { ...obj, [primeira!]: valor };
  }
  const atual = obj[primeira!];
  const sub = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Record<string, unknown>) : {};
  return { ...obj, [primeira!]: definirCaminho(sub, resto.join("."), valor) };
}
```

e acrescente, junto aos outros imports do topo do arquivo:

```typescript
import { definirCaminho } from "./briefing-caminho";
```

Run: `npx vitest run lib/propostas/assistente.test.ts`
Expected: PASS (nada mudou de comportamento)

- [ ] **Step 2: Escrever o teste do módulo**

```typescript
// lib/propostas/documento/documento-da-proposta.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolverModelo = vi.hoisted(() => vi.fn());
vi.mock("../modelos/resolver", () => ({ resolverModelo }));

import { MODELOS_BASE } from "../modelos/catalogo-base";
import { lerSecoesEditadas, montarDocumentoDaProposta, type PropostaParaDocumento } from "./documento-da-proposta";

const ORG = "22222222-2222-4222-8222-222222222222";
const db = {} as never;

function proposta(over: Partial<PropostaParaDocumento> = {}): PropostaParaDocumento {
  return {
    template_slug: "site_institucional",
    secoes_editadas: null,
    briefing_json: null,
    total_cents: 350000,
    moeda: "BRL",
    prazo_dias_uteis: null,
    valid_until: "2026-10-16",
    created_at: "2026-09-26T00:00:00.000Z",
    ...over,
  };
}

const BRIEFING_COMPLETO = {
  client: { company: "Imobiliária Exemplo" },
  project: { name: "Site da imobiliária", objective: "gerar contatos de compradores" },
  scope: { pages_list: "Home, Sobre, Contato" },
  included: { list: "Layout, desenvolvimento e publicação" },
  excluded: { list: "Hospedagem e domínio" },
};

beforeEach(() => {
  resolverModelo.mockReset();
  resolverModelo.mockImplementation(async (_db: unknown, _org: string, slug: string) =>
    Object.hasOwn(MODELOS_BASE, slug) ? { ...MODELOS_BASE[slug]!, origem: "base" } : null,
  );
});

describe("montarDocumentoDaProposta", () => {
  it("sem modelo confirmado devolve null e nem consulta o modelo", async () => {
    expect(await montarDocumentoDaProposta(db, ORG, proposta({ template_slug: null }), null)).toBeNull();
    expect(resolverModelo).not.toHaveBeenCalled();
  });

  it("modelo que não resolve devolve null", async () => {
    expect(await montarDocumentoDaProposta(db, ORG, proposta({ template_slug: "nao_existe" }), null)).toBeNull();
  });

  it("MODELO REAL com briefing e prazo preenchidos: zero pendência (o bloqueio de §1.5 da spec)", async () => {
    const doc = await montarDocumentoDaProposta(
      db,
      ORG,
      proposta({ briefing_json: BRIEFING_COMPLETO, prazo_dias_uteis: 30 }),
      { name: "Maria", display_name: null },
    );
    expect(doc?.pendencias).toEqual([]);
    expect(doc?.camposFaltando).toEqual([]);
  });

  it("sem prazo, a pendência aponta para o campo de prazo, com nome legível", async () => {
    const doc = await montarDocumentoDaProposta(db, ORG, proposta({ briefing_json: BRIEFING_COMPLETO }), {
      name: "Maria",
      display_name: null,
    });
    expect(doc?.camposFaltando).toEqual([
      { caminho: "schedule.estimated_days", rotulo: "Prazo (dias úteis)", onde: "campo_prazo", secoes: ["schedule"] },
    ]);
  });

  it("variável usada em várias seções aparece UMA vez em camposFaltando, com todas as seções", async () => {
    // `excluded.list` está em DUAS seções do projeto_personalizado: "limitations" e "excluded".
    const doc = await montarDocumentoDaProposta(
      db,
      ORG,
      proposta({ template_slug: "projeto_personalizado", prazo_dias_uteis: 30 }),
      { name: "Maria", display_name: null },
    );
    const excluidos = doc?.camposFaltando.filter((c) => c.caminho === "excluded.list") ?? [];
    expect(excluidos).toHaveLength(1);
    expect(excluidos[0]!.secoes).toEqual(["limitations", "excluded"]);
    expect(doc?.pendencias.filter((p) => p === "excluded.list")).toHaveLength(2);
  });

  it("seção reescrita não gera pendência, fica marcada como editada e mantém o texto", async () => {
    const doc = await montarDocumentoDaProposta(
      db,
      ORG,
      proposta({ briefing_json: BRIEFING_COMPLETO, prazo_dias_uteis: 30, secoes_editadas: { summary: "Texto final." } }),
      { name: "Maria", display_name: null },
    );
    const resumo = doc?.secoes.find((s) => s.id === "summary");
    expect(resumo).toMatchObject({ body: "Texto final.", faltantes: [], editada: true });
    expect(doc?.secoes.find((s) => s.id === "objectives")?.editada).toBe(false);
  });
});

describe("lerSecoesEditadas", () => {
  it("ignora lixo de clone antigo, nunca lança", () => {
    expect(lerSecoesEditadas(null)).toEqual({});
    expect(lerSecoesEditadas(["a"])).toEqual({});
    expect(lerSecoesEditadas("texto")).toEqual({});
    expect(lerSecoesEditadas({ a: "ok", b: 3, c: null })).toEqual({ a: "ok" });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/documento/documento-da-proposta.test.ts`
Expected: FAIL — `Cannot find module './documento-da-proposta'`

- [ ] **Step 4: Implementar**

```typescript
// lib/propostas/documento/documento-da-proposta.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolverModelo, type ModeloResolvido } from "../modelos/resolver";
import { montarDadosDoDocumento, type ContatoParaDocumento, type DadosDaPropostaParaDocumento } from "./montar-dados";
import { renderizarDocumento, type SecaoRenderizada } from "./renderer";
import { ondePreencher, rotuloDaVariavel, type OndePreencher } from "./rotulos-das-variaveis";

export interface PropostaParaDocumento extends DadosDaPropostaParaDocumento {
  template_slug: string | null;
  secoes_editadas: unknown;
}

export interface SecaoDoDocumento extends SecaoRenderizada {
  editada: boolean;
}

export interface CampoFaltando {
  caminho: string;
  rotulo: string;
  onde: OndePreencher;
  secoes: string[];
}

export interface DocumentoDaProposta {
  modelo: ModeloResolvido;
  secoes: SecaoDoDocumento[];
  /** Uma entrada por OCORRÊNCIA (a mesma variável em duas seções conta duas). */
  pendencias: string[];
  /** Uma entrada por VARIÁVEL, na ordem em que aparece no documento. */
  camposFaltando: CampoFaltando[];
}

/** `secoes_editadas` é jsonb sem CHECK: só entra o que for texto. */
export function lerSecoesEditadas(valor: unknown): Record<string, string> {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return {};
  const saida: Record<string, string> = {};
  for (const [chave, texto] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof texto === "string") saida[chave] = texto;
  }
  return saida;
}

function camposFaltandoDe(secoes: SecaoDoDocumento[]): CampoFaltando[] {
  const porCaminho = new Map<string, CampoFaltando>();
  for (const secao of secoes) {
    for (const caminho of secao.faltantes) {
      const existente = porCaminho.get(caminho);
      if (existente) {
        if (!existente.secoes.includes(secao.id)) existente.secoes.push(secao.id);
        continue;
      }
      porCaminho.set(caminho, {
        caminho,
        rotulo: rotuloDaVariavel(caminho),
        onde: ondePreencher(caminho),
        secoes: [secao.id],
      });
    }
  }
  return [...porCaminho.values()];
}

/**
 * O ÚNICO lugar que resolve modelo + dados + reescritas + pendências (D1 da
 * spec de 26/09). A rota do documento, a trava de envio, o snapshot e o PDF
 * chamam esta função — antes o cálculo estava copiado em três pontos.
 *
 * Não lança para "sem modelo": devolve `null`, e quem chama segue o caminho
 * da proposta sem documento.
 */
export async function montarDocumentoDaProposta(
  db: SupabaseClient,
  organizationId: string,
  proposta: PropostaParaDocumento,
  contato: ContatoParaDocumento | null,
): Promise<DocumentoDaProposta | null> {
  if (!proposta.template_slug) return null;
  const modelo = await resolverModelo(db, organizationId, proposta.template_slug);
  if (!modelo) return null;

  const renderizado = renderizarDocumento(modelo, montarDadosDoDocumento(proposta, contato));
  const editadas = lerSecoesEditadas(proposta.secoes_editadas);
  const secoes: SecaoDoDocumento[] = renderizado.secoes.map((s) =>
    editadas[s.id] !== undefined
      ? { ...s, body: editadas[s.id]!, faltantes: [], editada: true }
      : { ...s, editada: false },
  );

  return {
    modelo,
    secoes,
    pendencias: secoes.flatMap((s) => s.faltantes),
    camposFaltando: camposFaltandoDe(secoes),
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run lib/propostas/documento/documento-da-proposta.test.ts lib/propostas/assistente.test.ts`
Expected: PASS

- [ ] **Step 6: Sabotar a Task 2 e ver o teste do modelo real ficar vermelho**

Copie `montar-dados.ts`, apague a linha `approval: { date: LINHA_EM_BRANCO },`, rode `documento-da-proposta.test.ts`: o caso "MODELO REAL ... zero pendência" tem de falhar com `["approval.date"]`. Restaure da cópia.

- [ ] **Step 7: Commit**

```bash
git add lib/propostas/briefing-caminho.ts lib/propostas/assistente.ts lib/propostas/documento/documento-da-proposta.ts lib/propostas/documento/documento-da-proposta.test.ts
git commit -m "feat(propostas): documento da proposta calculado num lugar só (P1, D1)"
```

---

### Task 4: A rota do documento edita, preenche, desfaz — e só em rascunho

**Files:**
- Modify (reescrita inteira): `app/api/v1/proposals/[id]/documento/route.ts`
- Modify: `app/api/v1/proposals/[id]/documento/route.test.ts`
- Modify: `lib/audit/actions.ts`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: Task 3 inteira; `definirCaminho`; `extrairVariaveis` (`@/lib/propostas/documento/variaveis`).
- Produces:
  - `GET /api/v1/proposals/[id]/documento` → `{ status, modeloSlug, modeloSlugSugerido, secoes: SecaoDoDocumento[], variaveisFaltando: string[], camposFaltando: CampoFaltando[], temSecaoEditada: boolean, prontidao, resumoComercial: null }`
  - `PATCH` com `{ secaoId, texto: string | null }` (null = voltar ao texto do modelo) → `{ secoesEditadas }`
  - `PATCH` com `{ campo, valor }` → `{ campo }`
  - ação de auditoria `proposal.documento_campo_preenchido`

- [ ] **Step 1: Registrar a ação de auditoria** — em `lib/audit/actions.ts`, troque:

```typescript
  // Edição manual de seção do documento pelo canvas (M3, onda de modelos).
  "proposal.documento_editado",
```

por:

```typescript
  // Edição manual de seção do documento pelo canvas (M3, onda de modelos).
  "proposal.documento_editado",
  // Campo do documento preenchido pela tela (P1, spec de 26/09) — grava no
  // briefing; o metadata leva só o CAMINHO, nunca o valor digitado.
  "proposal.documento_campo_preenchido",
```

- [ ] **Step 2: Ajustar o mundo do teste e escrever os casos novos**

Em `app/api/v1/proposals/[id]/documento/route.test.ts`:

1. No objeto `mocks` do `vi.hoisted`, acrescente `resolverAviso: vi.fn(),` e, junto aos outros `vi.mock`, acrescente:

```typescript
vi.mock("@/lib/propostas/aviso-de-revisao", () => ({ resolverAvisoDeRevisaoSeProntaOuEncerrada: mocks.resolverAviso }));
```

2. Em `interface MundoOpts`, acrescente `status?: string;`.

3. Em `montarMundo`, no objeto `propostaRow`, acrescente a linha `status: opts.status ?? "rascunho",` logo depois de `organization_id: ORG_ID,`.

4. Ainda em `montarMundo`, troque a captura do `update`:

```typescript
          update: (payload: Record<string, unknown>) => {
            secoesEditadasCapturadas = payload.secoes_editadas as Record<string, unknown>;
            return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
          },
```

por:

```typescript
          update: (payload: Record<string, unknown>) => {
            if ("secoes_editadas" in payload) {
              secoesEditadasCapturadas = payload.secoes_editadas as Record<string, unknown>;
            }
            if ("briefing_json" in payload) briefingCapturado = payload.briefing_json as Record<string, unknown>;
            return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
          },
```

declare `let briefingCapturado: Record<string, unknown> | undefined;` ao lado de `let secoesEditadasCapturadas`, e troque o `return` final de `montarMundo` (texto atual, único no arquivo):

```typescript
  return { capturedSecoesEditadas: () => secoesEditadasCapturadas };
```

por:

```typescript
  return {
    capturedSecoesEditadas: () => secoesEditadasCapturadas,
    capturedBriefing: () => briefingCapturado,
  };
```

5. O `mocks.resolverModelo` do mundo devolve um modelo de UMA seção com `{{project.name}}`. Mantenha. Acrescente, no fim do arquivo, estes casos:

```typescript
describe("PATCH /documento — P1 (spec de 26/09)", () => {
  beforeEach(() => vi.clearAllMocks());

  function patch(body: unknown) {
    return PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }) as never, {
      params: Promise.resolve({ id: PROPOSTA_ID }),
    });
  }

  it("proposta enviada: salvar seção devolve 409 e não grava", async () => {
    const mundo = montarMundo({ status: "enviada", templateSlug: "site_institucional" });
    const res = await patch({ secaoId: "resumo", texto: "x" });
    expect(res.status).toBe(409);
    expect(mundo.capturedSecoesEditadas()).toBeUndefined();
  });

  it("proposta enviada: preencher campo devolve 409 e não grava", async () => {
    const mundo = montarMundo({ status: "enviada", templateSlug: "site_institucional" });
    const res = await patch({ campo: "project.name", valor: "Site" });
    expect(res.status).toBe(409);
    expect(mundo.capturedBriefing()).toBeUndefined();
  });

  it("texto null tira a reescrita (volta ao texto do modelo) e preserva as outras", async () => {
    const mundo = montarMundo({ templateSlug: "site_institucional", secoesEditadas: { resumo: "A", outra: "B" } });
    const res = await patch({ secaoId: "resumo", texto: null });
    expect(res.status).toBe(200);
    expect(mundo.capturedSecoesEditadas()).toEqual({ outra: "B" });
  });

  it("voltar ao modelo na última reescrita grava null, não objeto vazio", async () => {
    const mundo = montarMundo({ templateSlug: "site_institucional", secoesEditadas: { resumo: "A" } });
    await patch({ secaoId: "resumo", texto: null });
    expect(mundo.capturedSecoesEditadas()).toBeNull();
  });

  it("texto só com espaços é recusado (422) — para esvaziar, use voltar ao modelo", async () => {
    montarMundo({ templateSlug: "site_institucional" });
    expect((await patch({ secaoId: "resumo", texto: "   " })).status).toBe(422);
  });

  it("preencher campo grava no briefing, preservando o que já havia", async () => {
    const mundo = montarMundo({ templateSlug: "site_institucional", briefingJson: { client: { company: "X" } } });
    const res = await patch({ campo: "project.name", valor: "  Site da imobiliária  " });
    expect(res.status).toBe(200);
    expect(mundo.capturedBriefing()).toEqual({ client: { company: "X" }, project: { name: "Site da imobiliária" } });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "proposal.documento_campo_preenchido", metadata: { campo: "project.name" } }),
    );
  });

  it("campo que o modelo não usa é recusado (422)", async () => {
    const mundo = montarMundo({ templateSlug: "site_institucional" });
    expect((await patch({ campo: "scope.pages_list", valor: "x" })).status).toBe(422);
    expect(mundo.capturedBriefing()).toBeUndefined();
  });

  it("campo calculado pelo sistema é recusado (422) mesmo que o modelo o use", async () => {
    mocks.resolverModelo.mockImplementationOnce(async () => ({
      slug: "x", version: 1, sectionOrder: ["a"], origem: "base",
      sections: [{ id: "a", title: "A", titleEs: null, body: "{{investment.total_formatted}}", bodyEs: null, required: true, conditional: false }],
    }));
    montarMundo({ templateSlug: "site_institucional" });
    expect((await patch({ campo: "investment.total_formatted", valor: "R$ 1" })).status).toBe(422);
  });

  it("segmento perigoso no caminho é recusado (422)", async () => {
    montarMundo({ templateSlug: "site_institucional" });
    expect((await patch({ campo: "__proto__.x", valor: "y" })).status).toBe(422);
  });

  it("sem modelo confirmado, preencher campo é recusado (422)", async () => {
    montarMundo({ templateSlug: null });
    expect((await patch({ campo: "project.name", valor: "Site" })).status).toBe(422);
  });

  it("depois de gravar, tenta fechar o aviso de revisão", async () => {
    montarMundo({ templateSlug: "site_institucional" });
    await patch({ campo: "project.name", valor: "Site" });
    expect(mocks.resolverAviso).toHaveBeenCalledWith(expect.anything(), ORG_ID, PROPOSTA_ID);
  });
});

describe("GET /documento — P1", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve status, camposFaltando com nome legível e temSecaoEditada", async () => {
    montarMundo({ templateSlug: "site_institucional", briefingJson: {}, secoesEditadas: { outra: "x" } });
    const res = await GET(new Request("http://x") as never, { params: Promise.resolve({ id: PROPOSTA_ID }) });
    const body = await res.json();
    expect(body.data.status).toBe("rascunho");
    expect(body.data.temSecaoEditada).toBe(true);
    expect(body.data.camposFaltando).toEqual([
      { caminho: "project.name", rotulo: "Nome do projeto", onde: "briefing", secoes: ["resumo"] },
    ]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run "app/api/v1/proposals/[id]/documento/route.test.ts"`
Expected: FAIL nos casos novos (409 não existe, `texto: null` recusado, `campo` recusado, `camposFaltando` ausente)

- [ ] **Step 4: Reescrever a rota inteira**

```typescript
// app/api/v1/proposals/[id]/documento/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { resolverAvisoDeRevisaoSeProntaOuEncerrada } from "@/lib/propostas/aviso-de-revisao";
import { definirCaminho } from "@/lib/propostas/briefing-caminho";
import { lerSecoesEditadas, montarDocumentoDaProposta } from "@/lib/propostas/documento/documento-da-proposta";
import type { ContatoParaDocumento } from "@/lib/propostas/documento/montar-dados";
import { ondePreencher } from "@/lib/propostas/documento/rotulos-das-variaveis";
import { extrairVariaveis } from "@/lib/propostas/documento/variaveis";
import { montarEntradaDeProntidao } from "@/lib/propostas/prontidao-da-proposta";
import { sePropostasDesligadas } from "@/lib/propostas/porta";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SEGMENTOS_PROIBIDOS = new Set(["__proto__", "constructor", "prototype"]);

const secaoSchema = z.object({
  secaoId: z.string().trim().min(1).max(100),
  // null = voltar ao texto do modelo. Texto vazio não é aceito: esvaziar uma
  // seção obrigatória sem dizer nada é pior que o [a definir] que ela tinha.
  texto: z.string().trim().min(1).max(20000).nullable(),
});
const campoSchema = z.object({
  campo: z
    .string()
    .max(200)
    .regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/)
    .refine((c) => !c.split(".").some((s) => SEGMENTOS_PROIBIDOS.has(s))),
  valor: z.string().trim().min(1).max(4000),
});
const patchSchema = z.union([secaoSchema, campoSchema]);

type Ctx = { params: Promise<{ id: string }> };
type Admin = ReturnType<typeof createAdminClient>;

interface LinhaDaProposta {
  id: string;
  organization_id: string;
  status: string;
  template_slug: string | null;
  template_slug_sugerido: string | null;
  briefing_json: unknown;
  secoes_editadas: unknown;
  pricing_status: "missing" | "catalog" | "manual" | "custom" | "approved";
  contact_id: string | null;
  titulo: string | null;
  prazo_dias_uteis: number | null;
  pagamento: string | null;
  valid_until: string | null;
  total_cents: number;
  moeda: string;
  created_at: string;
}

async function buscarProposta(admin: Admin, orgId: string, id: string): Promise<LinhaDaProposta | null> {
  const { data } = await admin
    .from("crm_proposals")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as LinhaDaProposta | null) ?? null;
}

async function buscarContato(admin: Admin, orgId: string, contactId: string | null): Promise<ContatoParaDocumento | null> {
  if (!contactId) return null;
  const { data } = await admin
    .from("contacts")
    .select("name, display_name")
    .eq("organization_id", orgId)
    .eq("id", contactId)
    .maybeSingle();
  return (data as ContatoParaDocumento | null) ?? null;
}

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const proposta = await buscarProposta(admin, authz.org.orgId, id);
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  const base = {
    status: proposta.status,
    modeloSlug: proposta.template_slug,
    modeloSlugSugerido: proposta.template_slug_sugerido,
    secoes: [] as unknown[],
    variaveisFaltando: [] as string[],
    camposFaltando: [] as unknown[],
    temSecaoEditada: Object.keys(lerSecoesEditadas(proposta.secoes_editadas)).length > 0,
    prontidao: null as unknown,
    resumoComercial: null,
  };
  if (!proposta.template_slug) return ok(base, { requestId });

  const contato = await buscarContato(admin, authz.org.orgId, proposta.contact_id);
  const documento = await montarDocumentoDaProposta(admin, authz.org.orgId, proposta, contato);
  if (!documento) return ok(base, { requestId });

  const { data: itens } = await admin
    .from("crm_proposal_items")
    .select("preco_unitario_cents")
    .eq("organization_id", authz.org.orgId)
    .eq("proposal_id", id);
  const temItensComPreco = (itens ?? []).length > 0 && (itens ?? []).every((it) => it.preco_unitario_cents !== null);

  const prontidao = montarEntradaDeProntidao(
    {
      contact_id: proposta.contact_id,
      titulo: proposta.titulo,
      pricing_status: proposta.pricing_status,
      prazo_dias_uteis: proposta.prazo_dias_uteis,
      pagamento: proposta.pagamento,
      valid_until: proposta.valid_until,
      briefing_json: proposta.briefing_json,
    },
    temItensComPreco,
  );

  return ok(
    {
      ...base,
      modeloSlug: documento.modelo.slug,
      secoes: documento.secoes,
      variaveisFaltando: documento.pendencias,
      camposFaltando: documento.camposFaltando,
      prontidao,
    },
    { requestId },
  );
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });

  const admin = createAdminClient();
  const proposta = await buscarProposta(admin, authz.org.orgId, id);
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });
  // Achado do plano M6 que ficou sem dono: editar uma proposta já enviada
  // mudava a tela sem mudar o que o cliente recebeu.
  if (proposta.status !== "rascunho") {
    return fail("proposal_context_stale", t("Só é possível editar o documento de uma proposta em rascunho."), 409, {
      requestId,
    });
  }

  if ("campo" in parsed.data) {
    const { campo, valor } = parsed.data;
    const contato = await buscarContato(admin, authz.org.orgId, proposta.contact_id);
    const documento = await montarDocumentoDaProposta(admin, authz.org.orgId, proposta, contato);
    if (!documento) {
      return fail("validation_failed", t("Escolha o modelo da proposta antes de preencher campos."), 422, { requestId });
    }
    const variaveisDoModelo = new Set(documento.modelo.sections.flatMap((s) => extrairVariaveis(s.body)));
    if (!variaveisDoModelo.has(campo) || ondePreencher(campo) !== "briefing") {
      return fail("validation_failed", t("Este campo não se preenche por aqui."), 422, { requestId });
    }

    const briefing = definirCaminho(comoObjeto(proposta.briefing_json), campo, valor);
    const { error } = await admin
      .from("crm_proposals")
      .update({ briefing_json: briefing })
      .eq("organization_id", authz.org.orgId)
      .eq("id", id);
    if (error) return fail("internal_error", t("Falha ao salvar o campo."), 500, { requestId });

    void resolverAvisoDeRevisaoSeProntaOuEncerrada(admin, authz.org.orgId, id);
    void audit({
      action: "proposal.documento_campo_preenchido",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "crm_proposals",
      resourceId: id,
      requestId,
      metadata: { campo },
    });
    return ok({ campo }, { requestId });
  }

  const { secaoId, texto } = parsed.data;
  const editadas = lerSecoesEditadas(proposta.secoes_editadas);
  if (texto === null) delete editadas[secaoId];
  else editadas[secaoId] = texto;
  const secoesEditadas = Object.keys(editadas).length > 0 ? editadas : null;

  const { error } = await admin
    .from("crm_proposals")
    .update({ secoes_editadas: secoesEditadas })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (error) return fail("internal_error", t("Falha ao salvar a seção."), 500, { requestId });

  void resolverAvisoDeRevisaoSeProntaOuEncerrada(admin, authz.org.orgId, id);
  void audit({
    action: "proposal.documento_editado",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_proposals",
    resourceId: id,
    requestId,
    metadata: { secaoId, restaurada: texto === null },
  });

  return ok({ secoesEditadas }, { requestId });
}
```

- [ ] **Step 5: Traduções** — acrescente ao `DICIONARIO` de `lib/i18n/dicionario.ts` (depois da linha `"pendência(s)": { es: "pendiente(s)" },`), conferindo antes que nenhuma já exista:

```typescript
  "Só é possível editar o documento de uma proposta em rascunho.": {
    es: "Solo es posible editar el documento de una propuesta en borrador.",
  },
  "Escolha o modelo da proposta antes de preencher campos.": {
    es: "Elige el modelo de la propuesta antes de completar campos.",
  },
  "Este campo não se preenche por aqui.": { es: "Este campo no se completa por aquí." },
  "Falha ao salvar o campo.": { es: "No fue posible guardar el campo." },
```

Confira também que `"Falha ao salvar a seção."` já tem entrada (`grep -n 'Falha ao salvar a seção' lib/i18n/dicionario.ts`); se não tiver, acrescente `"Falha ao salvar a seção.": { es: "No fue posible guardar la sección." },`.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run "app/api/v1/proposals/[id]/documento/route.test.ts" tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/suporte-cobertura-de-efeitos.test.ts`
Expected: PASS

- [ ] **Step 7: Sabotar** — copie `route.ts`, apague o bloco `if (proposta.status !== "rascunho") { ... }`, rode o teste da rota: os dois casos "proposta enviada" falham. Restaure da cópia.

- [ ] **Step 8: Commit**

```bash
git add "app/api/v1/proposals/[id]/documento/route.ts" "app/api/v1/proposals/[id]/documento/route.test.ts" lib/audit/actions.ts lib/i18n/dicionario.ts
git commit -m "feat(propostas): rota do documento preenche campo, volta ao modelo e recusa fora de rascunho (P1)"
```

---

### Task 5: Trocar o modelo depois de confirmado, com confirmação

**Files:**
- Modify: `app/api/v1/proposals/[id]/modelo/route.ts`
- Modify: `app/api/v1/proposals/[id]/modelo/route.test.ts`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Produces: `PATCH /api/v1/proposals/[id]/modelo` aceita `{ template_slug, descartar_reescritas?: boolean }`. Trocar para OUTRO modelo com `secoes_editadas` não vazio sem `descartar_reescritas: true` → 409. Trocar descarta `secoes_editadas`.

- [ ] **Step 1: Teste** — em `app/api/v1/proposals/[id]/modelo/route.test.ts`:

1. Em `MundoOpts`, acrescente `secoesEditadas?: Record<string, string> | null;`.
2. No `propostaRow`, acrescente `secoes_editadas: opts.secoesEditadas ?? null,`.
3. Acrescente, dentro do `describe` existente, antes do `});` final:

```typescript
  it("troca de modelo com seção reescrita SEM confirmar: 409, nada muda", async () => {
    const mundo = montarMundo({ templateSlug: "landing_page", secoesEditadas: { summary: "x" }, modeloResolve: { slug: "ecommerce", version: 1 } });
    const res = await PATCH(reqComBody({ template_slug: "ecommerce" }), ctx());
    expect(res.status).toBe(409);
    expect(mundo.updateCapturado()).toBeUndefined();
  });

  it("troca de modelo com seção reescrita E confirmação: grava e descarta as reescritas", async () => {
    const mundo = montarMundo({ templateSlug: "landing_page", secoesEditadas: { summary: "x" }, modeloResolve: { slug: "ecommerce", version: 1 } });
    const res = await PATCH(reqComBody({ template_slug: "ecommerce", descartar_reescritas: true }), ctx());
    expect(res.status).toBe(200);
    expect(mundo.updateCapturado()).toMatchObject({ template_slug: "ecommerce", secoes_editadas: null });
  });

  it("reconfirmar o MESMO modelo não pede confirmação nem apaga reescrita", async () => {
    const mundo = montarMundo({ templateSlug: "landing_page", secoesEditadas: { summary: "x" }, modeloResolve: { slug: "landing_page", version: 1 } });
    const res = await PATCH(reqComBody({ template_slug: "landing_page" }), ctx());
    expect(res.status).toBe(200);
    expect(mundo.updateCapturado()).not.toHaveProperty("secoes_editadas");
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/api/v1/proposals/[id]/modelo/route.test.ts"`
Expected: FAIL nos três casos novos

- [ ] **Step 3: Implementar** — em `app/api/v1/proposals/[id]/modelo/route.ts`:

Troque:
```typescript
const patchSchema = z.object({ template_slug: z.string().min(1).max(100).nullable() });
```
por:
```typescript
const patchSchema = z.object({
  template_slug: z.string().min(1).max(100).nullable(),
  descartar_reescritas: z.boolean().optional(),
});
```

Troque:
```typescript
    .select("id, status")
```
por:
```typescript
    .select("id, status, template_slug, secoes_editadas")
```

Troque o bloco final de gravação:
```typescript
  const modelo = await resolverModelo(admin, authz.org.orgId, parsed.data.template_slug);
  if (!modelo) return fail("validation_failed", t("Modelo não encontrado."), 422, { requestId });

  const { error } = await admin
    .from("crm_proposals")
    .update({ template_slug: modelo.slug, template_version: modelo.version, template_slug_sugerido: null })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
```
por:
```typescript
  const modelo = await resolverModelo(admin, authz.org.orgId, parsed.data.template_slug);
  if (!modelo) return fail("validation_failed", t("Modelo não encontrado."), 422, { requestId });

  // §6.1 da spec de 21/09: trocar o modelo com rascunho em andamento perde o
  // texto ajustado à mão — por isso exige confirmação explícita.
  const atual = proposta as { template_slug: string | null; secoes_editadas: unknown };
  const trocaDeModelo = atual.template_slug !== null && atual.template_slug !== modelo.slug;
  const temReescrita = Object.keys(lerSecoesEditadas(atual.secoes_editadas)).length > 0;
  if (trocaDeModelo && temReescrita && parsed.data.descartar_reescritas !== true) {
    return fail(
      "proposal_context_stale",
      t("Esta proposta tem seções reescritas à mão. Confirme o descarte para trocar o modelo."),
      409,
      { requestId },
    );
  }

  const { error } = await admin
    .from("crm_proposals")
    .update({
      template_slug: modelo.slug,
      template_version: modelo.version,
      template_slug_sugerido: null,
      ...(trocaDeModelo ? { secoes_editadas: null } : {}),
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
```

E acrescente o import:
```typescript
import { lerSecoesEditadas } from "@/lib/propostas/documento/documento-da-proposta";
```

E no `audit` desta rota, troque `metadata: { template_slug: modelo.slug, template_version: modelo.version },` por:
```typescript
    metadata: { template_slug: modelo.slug, template_version: modelo.version, descartou_reescritas: trocaDeModelo && temReescrita },
```

- [ ] **Step 4: Tradução** — acrescente ao `DICIONARIO`:

```typescript
  "Esta proposta tem seções reescritas à mão. Confirme o descarte para trocar o modelo.": {
    es: "Esta propuesta tiene secciones reescritas a mano. Confirma el descarte para cambiar el modelo.",
  },
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run "app/api/v1/proposals/[id]/modelo/route.test.ts" tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "app/api/v1/proposals/[id]/modelo/route.ts" "app/api/v1/proposals/[id]/modelo/route.test.ts" lib/i18n/dicionario.ts
git commit -m "feat(propostas): trocar o modelo depois de confirmado, com confirmação do descarte (P1)"
```

---

### Task 6: Prazo e pagamento passam a ser editáveis

**Files:**
- Modify: `app/api/v1/proposals/[id]/route.ts`
- Modify: `app/api/v1/proposals/[id]/route.test.ts`

**Interfaces:**
- Produces: `PATCH /api/v1/proposals/[id]` aceita `prazo_dias_uteis?: number | null` (inteiro 1–365) e `pagamento?: string | null` (até 500).

- [ ] **Step 1: Teste** — acrescente dentro do `describe("PATCH /api/v1/proposals/[id]", ...)`:

```typescript
  it("grava prazo em dias úteis e pagamento (P1 — nada no produto escrevia essas colunas)", async () => {
    const mundo = montarMundoDeEdicao();
    const res = await mundo.PATCH({ revision: 1, prazo_dias_uteis: 30, pagamento: "50% no aceite, 50% na entrega", itens: [item] });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada).toMatchObject({ prazo_dias_uteis: 30, pagamento: "50% no aceite, 50% na entrega" });
  });

  it("prazo fora de 1..365 é recusado (422)", async () => {
    const mundo = montarMundoDeEdicao();
    expect((await mundo.PATCH({ revision: 1, prazo_dias_uteis: 0, itens: [item] })).status).toBe(422);
    expect((await mundo.PATCH({ revision: 1, prazo_dias_uteis: 400, itens: [item] })).status).toBe(422);
    expect(mundo.propostaAtualizada).toBeNull();
  });

  it("omitir prazo e pagamento não os apaga", async () => {
    const mundo = montarMundoDeEdicao();
    await mundo.PATCH({ revision: 1, itens: [item] });
    expect(mundo.propostaAtualizada).not.toHaveProperty("pagamento");
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/api/v1/proposals/[id]/route.test.ts"`
Expected: FAIL no primeiro e no segundo caso novos

- [ ] **Step 3: Implementar** — em `app/api/v1/proposals/[id]/route.ts`, troque:

```typescript
  valid_until: z.string().date().nullable().optional(),
  itens: z.array(propostaItemSchema),
});
```
por:
```typescript
  valid_until: z.string().date().nullable().optional(),
  prazo_dias_uteis: z.number().int().min(1).max(365).nullable().optional(),
  pagamento: z.string().trim().max(500).nullable().optional(),
  itens: z.array(propostaItemSchema),
});
```

E no `.update({...})` da PATCH, troque:
```typescript
      ...(input.valid_until !== undefined ? { valid_until: input.valid_until } : {}),
```
por:
```typescript
      ...(input.valid_until !== undefined ? { valid_until: input.valid_until } : {}),
      ...(input.prazo_dias_uteis !== undefined ? { prazo_dias_uteis: input.prazo_dias_uteis } : {}),
      ...(input.pagamento !== undefined ? { pagamento: input.pagamento === "" ? null : input.pagamento } : {}),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "app/api/v1/proposals/[id]/route.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/proposals/[id]/route.ts" "app/api/v1/proposals/[id]/route.test.ts"
git commit -m "feat(propostas): prazo em dias úteis e pagamento editáveis na proposta (P1)"
```

---

### Task 7: O PDF do documento, completo

**Files:**
- Modify (reescrita inteira): `lib/propostas/documento/pdf-do-documento.tsx`
- Modify (reescrita inteira): `lib/propostas/documento/pdf-do-documento.test.ts`

**Interfaces:**
- Produces:
  - `type BlocoDoPdf = { tipo: "secao"; secao: SecaoRenderizada } | { tipo: "itens" }`
  - `blocosDoDocumento(secoes: SecaoRenderizada[]): BlocoDoPdf[]` — os itens entram logo depois da seção `investment`; sem ela, no fim.
  - `interface DocumentoPdfInput { titulo; numero: number | null; ano: number | null; versao: number; destinatario: { nome: string }; secoes: SecaoRenderizada[]; itens: ItemDoPdf[]; totalCents: number; moeda: string; validUntil: string | null; condicoes: string | null; marca: { app_name: string | null; accent_hex: string | null; logoUrl: string | null } }`
  - `interface ItemDoPdf { descricao: string; quantidade: number; precoUnitarioCents: number; descontoCents: number; imagemUrl?: string | null }`
  - `renderDocumentoPdf(input: DocumentoPdfInput): Promise<Buffer>`

- [ ] **Step 1: Teste**

```typescript
// lib/propostas/documento/pdf-do-documento.test.ts
import { describe, expect, it } from "vitest";

import { blocosDoDocumento, renderDocumentoPdf, type DocumentoPdfInput } from "./pdf-do-documento";

const secao = (id: string) => ({ id, title: id, body: `corpo ${id}`, faltantes: [] });

const BASE: DocumentoPdfInput = {
  titulo: "Proposta de Teste",
  numero: 12,
  ano: 2026,
  versao: 1,
  destinatario: { nome: "Maria" },
  secoes: [secao("summary"), secao("investment"), secao("terms")],
  itens: [{ descricao: "Site", quantidade: 1, precoUnitarioCents: 350000, descontoCents: 0, imagemUrl: null }],
  totalCents: 350000,
  moeda: "BRL",
  validUntil: "2026-10-16",
  condicoes: "50% no aceite",
  marca: { app_name: "Acme", accent_hex: null, logoUrl: null },
};

describe("blocosDoDocumento", () => {
  it("os itens entram logo depois da seção de investimento (§6.2 da spec de 21/09)", () => {
    expect(blocosDoDocumento(BASE.secoes).map((b) => (b.tipo === "itens" ? "itens" : b.secao.id))).toEqual([
      "summary",
      "investment",
      "itens",
      "terms",
    ]);
  });

  it("modelo sem seção de investimento: itens no fim", () => {
    expect(blocosDoDocumento([secao("a"), secao("b")]).map((b) => (b.tipo === "itens" ? "itens" : b.secao.id))).toEqual([
      "a",
      "b",
      "itens",
    ]);
  });

  it("zero seções: só os itens", () => {
    expect(blocosDoDocumento([])).toEqual([{ tipo: "itens" }]);
  });
});

describe("renderDocumentoPdf", () => {
  it("gera um PDF (buffer não vazio) com cabeçalho, seções e itens", async () => {
    const buf = await renderDocumentoPdf(BASE);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("gera mesmo com ZERO seções e sem número (rascunho), sem lançar", async () => {
    const buf = await renderDocumentoPdf({ ...BASE, secoes: [], numero: null, ano: null, condicoes: null, validUntil: null });
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/documento/pdf-do-documento.test.ts`
Expected: FAIL — `blocosDoDocumento` não exportado

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/documento/pdf-do-documento.tsx
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { formatarMoeda } from "../moeda";
import type { SecaoRenderizada } from "./renderer";

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontSize: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  logo: { width: 96, height: 40, objectFit: "contain" },
  titulo: { fontSize: 16, fontWeight: 700 },
  secaoTitulo: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  secaoBody: { fontSize: 10, lineHeight: 1.4 },
  linhaItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5 },
  itemImagem: { width: 32, height: 32, objectFit: "cover", marginRight: 8 },
  itemTexto: { flexDirection: "row", alignItems: "center" },
  total: { marginTop: 8, fontSize: 12, fontWeight: 700, textAlign: "right" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 8, color: "#666" },
});

export interface ItemDoPdf {
  descricao: string;
  quantidade: number;
  precoUnitarioCents: number;
  descontoCents: number;
  imagemUrl?: string | null;
}

export interface DocumentoPdfInput {
  titulo: string;
  numero: number | null;
  ano: number | null;
  versao: number;
  destinatario: { nome: string };
  secoes: SecaoRenderizada[];
  itens: ItemDoPdf[];
  totalCents: number;
  moeda: string;
  validUntil: string | null;
  condicoes: string | null;
  /** SÓ a organização (D6 da spec-mãe) — quem monta é `marcaDaOrganizacaoParaPdf`. */
  marca: { app_name: string | null; accent_hex: string | null; logoUrl: string | null };
}

export type BlocoDoPdf = { tipo: "secao"; secao: SecaoRenderizada } | { tipo: "itens" };

const ID_DA_SECAO_DE_INVESTIMENTO = "investment";

/** A ordem de leitura da §6.2 da spec de 21/09: a tabela de itens mora dentro do investimento. */
export function blocosDoDocumento(secoes: SecaoRenderizada[]): BlocoDoPdf[] {
  const blocos: BlocoDoPdf[] = [];
  let itensColocados = false;
  for (const secao of secoes) {
    blocos.push({ tipo: "secao", secao });
    if (secao.id === ID_DA_SECAO_DE_INVESTIMENTO && !itensColocados) {
      blocos.push({ tipo: "itens" });
      itensColocados = true;
    }
  }
  if (!itensColocados) blocos.push({ tipo: "itens" });
  return blocos;
}

function Itens({ d, accent }: { d: DocumentoPdfInput; accent: string | undefined }): React.ReactElement {
  return (
    <View style={{ marginTop: 8 }}>
      {d.itens.map((it, i) => (
        <View key={i} style={styles.linhaItem}>
          <View style={styles.itemTexto}>
            {it.imagemUrl ? <Image src={it.imagemUrl} style={styles.itemImagem} /> : null}
            <Text>
              {it.descricao} (x{it.quantidade})
            </Text>
          </View>
          <Text>{formatarMoeda(it.quantidade * it.precoUnitarioCents - it.descontoCents, d.moeda)}</Text>
        </View>
      ))}
      <Text style={[styles.total, accent ? { color: accent } : {}]}>Total: {formatarMoeda(d.totalCents, d.moeda)}</Text>
    </View>
  );
}

function DocumentoPdfDoc({ d }: { d: DocumentoPdfInput }): React.ReactElement {
  const accent = d.marca.accent_hex ?? undefined;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.titulo, accent ? { color: accent } : {}]}>{d.titulo}</Text>
            {d.numero !== null && d.ano !== null ? (
              <Text>
                Proposta {String(d.numero).padStart(4, "0")}/{d.ano}
                {d.versao > 1 ? ` — v${d.versao}` : ""}
              </Text>
            ) : null}
          </View>
          {d.marca.logoUrl ? (
            <Image src={d.marca.logoUrl} style={styles.logo} />
          ) : d.marca.app_name ? (
            <Text>{d.marca.app_name}</Text>
          ) : null}
        </View>

        <Text>Para: {d.destinatario.nome}</Text>

        {blocosDoDocumento(d.secoes).map((bloco, i) =>
          bloco.tipo === "itens" ? (
            <Itens key={`itens-${i}`} d={d} accent={accent} />
          ) : (
            <View key={bloco.secao.id} wrap>
              <Text style={styles.secaoTitulo}>{bloco.secao.title}</Text>
              <Text style={styles.secaoBody}>{bloco.secao.body}</Text>
            </View>
          ),
        )}

        {d.validUntil ? <Text style={{ marginTop: 12 }}>Válida até {d.validUntil}</Text> : null}
        {d.condicoes ? <Text style={{ marginTop: 8 }}>{d.condicoes}</Text> : null}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${d.marca.app_name ?? "Proposta comercial"} — página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderDocumentoPdf(input: DocumentoPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<DocumentoPdfDoc d={input} />);
  return buf as Buffer;
}
```

Medido ao escrever: `formatarMoeda` vem de `lib/propostas/moeda.ts` (o PDF de itens o importa como `./moeda`, `lib/propostas/pdf.tsx:4`), e o texto "Proposta comercial" do rodapé é o mesmo do PDF de itens. O `tests/unit/branding.test.ts` do Step 4 confirma que o arquivo novo não vaza marca.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/documento/pdf-do-documento.test.ts tests/unit/branding.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/documento/pdf-do-documento.tsx lib/propostas/documento/pdf-do-documento.test.ts
git commit -m "feat(propostas): PDF do documento com cabeçalho, seções, itens e rodapé (P1)"
```

---

### Task 8: O envio usa o documento — na trava, no snapshot e no PDF

**Files:**
- Modify: `app/api/v1/proposals/[id]/send/route.ts`
- Modify: `app/api/v1/proposals/[id]/send/route.test.ts`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: `montarDocumentoDaProposta` (Task 3); `renderDocumentoPdf` (Task 7).

- [ ] **Step 1: Teste** — em `app/api/v1/proposals/[id]/send/route.test.ts`:

1. No `vi.hoisted` de `mocks`, acrescente `renderDocumentoPdf: vi.fn(),`.
2. Junto aos `vi.mock`, acrescente:

```typescript
vi.mock("@/lib/propostas/documento/pdf-do-documento", () => ({ renderDocumentoPdf: mocks.renderDocumentoPdf }));
```

3. Dentro de `montarMundoDeEnvio`, logo depois do bloco `mocks.renderPropostaPdf.mockImplementation(...)`, acrescente:

```typescript
  mocks.renderDocumentoPdf.mockImplementation(async () => {
    pdfFoiGerado = true;
    return Buffer.from("PDF-DOCUMENTO");
  });
```

4. No topo, junto aos imports, acrescente `import { MODELOS_BASE } from "@/lib/propostas/modelos/catalogo-base";`.

5. No fim do arquivo, acrescente:

```typescript
describe("P1 — o documento chega ao cliente", () => {
  const BRIEFING_COMPLETO = {
    client: { company: "Imobiliária Exemplo" },
    project: { name: "Site da imobiliária", objective: "gerar contatos de compradores" },
    scope: { pages_list: "Home, Sobre, Contato" },
    included: { list: "Layout, desenvolvimento e publicação" },
    excluded: { list: "Hospedagem e domínio" },
  };

  it("MODELO REAL com tudo preenchido é enviado, e o PDF é o do documento", async () => {
    const mundo = montarMundoDeEnvio({
      propostaOriginal: { template_slug: "site_institucional", prazo_dias_uteis: 30, briefing_json: BRIEFING_COMPLETO },
    });
    mocks.resolverModelo.mockImplementation(async () => ({ ...MODELOS_BASE.site_institucional!, origem: "base" }));
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.status).toBe("enviada");
    expect(mocks.renderDocumentoPdf).toHaveBeenCalledTimes(1);
    expect(mocks.renderPropostaPdf).not.toHaveBeenCalled();
    const entrada = mocks.renderDocumentoPdf.mock.calls[0][0];
    expect(entrada.secoes.map((s: { id: string }) => s.id)).toContain("investment");
    expect(entrada.itens).toHaveLength(1);
  });

  it("sem modelo, o PDF continua o de itens", async () => {
    const mundo = montarMundoDeEnvio({});
    await mundo.POST();
    expect(mocks.renderPropostaPdf).toHaveBeenCalledTimes(1);
    expect(mocks.renderDocumentoPdf).not.toHaveBeenCalled();
  });

  it("a recusa por pendência NOMEIA o que falta", async () => {
    const mundo = montarMundoDeEnvio({ propostaOriginal: { template_slug: "site_institucional", briefing_json: {} } });
    const res = await mundo.POST();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain("Nome do projeto");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/api/v1/proposals/[id]/send/route.test.ts"`
Expected: FAIL nos três casos novos

- [ ] **Step 3: Implementar** — em `app/api/v1/proposals/[id]/send/route.ts`:

a) Troque os imports:
```typescript
import { resolverModelo } from "@/lib/propostas/modelos/resolver";
import { montarDadosDoDocumento } from "@/lib/propostas/documento/montar-dados";
import { renderizarDocumento } from "@/lib/propostas/documento/renderer";
```
por:
```typescript
import { montarDocumentoDaProposta } from "@/lib/propostas/documento/documento-da-proposta";
import { renderDocumentoPdf } from "@/lib/propostas/documento/pdf-do-documento";
```

b) Troque o bloco inteiro da trava (texto atual):
```typescript
  if (proposta.template_slug) {
    const modelo = await resolverModelo(admin, authz.org.orgId, proposta.template_slug as string);
    if (modelo) {
      const { data: contatoParaDoc } = proposta.contact_id
        ? await admin
            .from("contacts")
            .select("name, display_name")
            .eq("organization_id", authz.org.orgId)
            .eq("id", proposta.contact_id)
            .maybeSingle()
        : { data: null };
      const dados = montarDadosDoDocumento(proposta as never, contatoParaDoc ?? null);
      const documento = renderizarDocumento(modelo, dados);
      const overrides = (proposta.secoes_editadas as Record<string, string> | null) ?? {};
      const pendencias = documento.secoes.flatMap((s) => (overrides[s.id] !== undefined ? [] : s.faltantes));
      if (pendencias.length > 0) {
        return fail(
          "validation_failed",
          t("Faltam {n} campo(s) do documento antes de enviar. Abra a proposta e revise.").replace(
            "{n}",
            String(pendencias.length),
          ),
          422,
          { requestId },
        );
      }
    }
  }
```
por:
```typescript
  // D1 da spec de 26/09: o documento é calculado num lugar só, e é o MESMO
  // objeto que trava, congela no snapshot e vira o PDF abaixo.
  const { data: contatoParaDoc } = proposta.template_slug && proposta.contact_id
    ? await admin
        .from("contacts")
        .select("name, display_name")
        .eq("organization_id", authz.org.orgId)
        .eq("id", proposta.contact_id)
        .maybeSingle()
    : { data: null };
  const documento = await montarDocumentoDaProposta(admin, authz.org.orgId, proposta as never, contatoParaDoc ?? null);
  if (documento && documento.camposFaltando.length > 0) {
    return fail(
      "validation_failed",
      t("Faltam {n} campo(s) do documento antes de enviar: {lista}. Abra a proposta e preencha.")
        .replace("{n}", String(documento.camposFaltando.length))
        .replace("{lista}", documento.camposFaltando.map((c) => t(c.rotulo)).join(", ")),
      422,
      { requestId },
    );
  }
```

c) Troque o bloco do snapshot (texto atual):
```typescript
  let templateSnapshot: unknown = null;
  let renderedSnapshot: unknown = null;
  if (propostaAlvo.template_slug) {
    try {
      const modelo = await resolverModelo(admin, authz.org.orgId, propostaAlvo.template_slug as string);
      if (modelo) {
        const dados = montarDadosDoDocumento(propostaAlvo as never, contato ?? null);
        const documento = renderizarDocumento(modelo, dados);
        const overrides = (propostaAlvo.secoes_editadas as Record<string, string> | null) ?? {};
        const secoes = documento.secoes.map((s) =>
          overrides[s.id] !== undefined ? { ...s, body: overrides[s.id]!, faltantes: [] } : s,
        );
        templateSnapshot = modelo;
        renderedSnapshot = { secoes, variaveisFaltando: secoes.flatMap((s) => s.faltantes) };
      }
    } catch (erro) {
      logger.warn("proposal.send: falha ao montar snapshot do documento — envio segue sem ele", {
        organizationId: authz.org.orgId,
        propostaId: propostaAlvo.id,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }
```
por:
```typescript
  const templateSnapshot: unknown = documento ? documento.modelo : null;
  const renderedSnapshot: unknown = documento
    ? { secoes: documento.secoes, variaveisFaltando: documento.pendencias }
    : null;
```

d) Dentro do `try` do PDF, troque:
```typescript
    const pdfBuffer = await renderPropostaPdf({
```
por:
```typescript
    const itensDoPdf = itens.map((it) => ({
      descricao: it.descricao, quantidade: it.quantidade,
      precoUnitarioCents: it.preco_unitario_cents, descontoCents: it.desconto_cents,
      imagemUrl: it.product_id ? (imagensPorProduto.get(it.product_id) ?? null) : null,
    }));
    const pdfBuffer = documento
      ? await renderDocumentoPdf({
          titulo: propostaAlvo.titulo, numero: numeroEAno.numero, ano: numeroEAno.ano,
          versao: propostaAlvo.versao, destinatario: { nome: destinatarioNome },
          secoes: documento.secoes, itens: itensDoPdf,
          totalCents: propostaAlvo.total_cents, moeda: propostaAlvo.moeda,
          validUntil: propostaAlvo.valid_until, condicoes: propostaAlvo.condicoes,
          marca: { app_name: marca.appName, accent_hex: marca.accentHex, logoUrl: marca.logoUrl },
        })
      : await renderPropostaPdf({
```

e o fechamento do `renderPropostaPdf({...})` continua igual (a chamada existente vira o ramo `:` do ternário). Confira depois de colar: o objeto passado a `renderPropostaPdf` não mudou nenhuma chave.

O import de `logger` continua em uso depois de (c): o bloco do follow-up o chama (`send/route.ts:465` hoje). Não o apague.

- [ ] **Step 4: Tradução** — acrescente ao `DICIONARIO` (a chave antiga, `"Faltam {n} campo(s) do documento antes de enviar. Abra a proposta e revise."`, fica: não tem mais chamador, mas apagá-la é outra mudança):

```typescript
  "Faltam {n} campo(s) do documento antes de enviar: {lista}. Abra a proposta e preencha.": {
    es: "Faltan {n} campo(s) del documento antes de enviar: {lista}. Abre la propuesta y complétalos.",
  },
```

Os 33 nomes de `ROTULO_DA_VARIAVEL` passam por `t(c.rotulo)`. Rode a cerca de espanhol no Step 5: se ela exigir entrada para os rótulos (o `t()` recebe uma variável, e a cerca pode varrer só literais), acrescente uma entrada por rótulo com a tradução — a lista está na Task 1.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run "app/api/v1/proposals/[id]/send/route.test.ts" tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: PASS — inclusive os testes M5 antigos de snapshot (o `rendered_snapshot` ganhou o campo `editada` por seção; eles usam `toMatchObject`)

- [ ] **Step 6: Sabotar** — copie `montar-dados.ts`, tire a linha `approval: { date: LINHA_EM_BRANCO },`, rode o teste do envio: "MODELO REAL com tudo preenchido é enviado" tem de falhar com 422. Restaure da cópia.

- [ ] **Step 7: Commit**

```bash
git add "app/api/v1/proposals/[id]/send/route.ts" "app/api/v1/proposals/[id]/send/route.test.ts" lib/i18n/dicionario.ts
git commit -m "fix(propostas): envio usa o documento na trava, no snapshot e no PDF do cliente (P1)"
```

---

### Task 9: A tela — documento editável, campos que faltam, prazo e pagamento

**Files:**
- Modify (reescrita inteira): `app/app/proposals/[id]/_components/DocumentoCanvas.tsx`
- Modify: `app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx`
- Modify: `app/app/proposals/[id]/_client.tsx`
- Modify: `app/app/proposals/[id]/page.tsx`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: `GET/PATCH /documento` (Task 4), `PATCH /modelo` (Task 5), `PATCH /proposals/[id]` com prazo e pagamento (Task 6).
- Produces: `DocumentoCanvas({ propostaId, podeRevisar?, emRascunho?, versao? })`; `ProposalEditorClient({ id, podeEditar, podeRevisar? })`.

- [ ] **Step 1: Teste** — acrescente ao fim de `app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx`:

```typescript
describe("DocumentoCanvas — P1 (edição)", () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
  });

  const COM_MODELO = docBase({
    status: "rascunho",
    modeloSlug: "site_institucional",
    secoes: [
      { id: "summary", title: "Resumo", body: "Projeto: [a definir]", faltantes: ["project.name"], editada: false },
      { id: "terms", title: "Condições", body: "Texto escrito à mão", faltantes: [], editada: true },
    ],
    variaveisFaltando: ["project.name", "schedule.estimated_days"],
    camposFaltando: [
      { caminho: "project.name", rotulo: "Nome do projeto", onde: "briefing", secoes: ["summary"] },
      { caminho: "schedule.estimated_days", rotulo: "Prazo (dias úteis)", onde: "campo_prazo", secoes: ["schedule"] },
    ],
    temSecaoEditada: true,
  });

  it("sem papel de revisão, nada é editável", async () => {
    get.mockResolvedValue({ data: COM_MODELO });
    render(<DocumentoCanvas propostaId="p1" emRascunho />);
    await screen.findByText("Resumo");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("salvar seção chama PATCH /documento com o texto", async () => {
    get.mockResolvedValue({ data: COM_MODELO });
    patch.mockResolvedValue({ data: {} });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    const caixa = await screen.findByLabelText("Resumo");
    fireEvent.change(caixa, { target: { value: "Projeto: Site da imobiliária" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Salvar seção" })[0]!);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/documento", { secaoId: "summary", texto: "Projeto: Site da imobiliária" }),
    );
  });

  it("voltar ao texto do modelo só aparece na seção reescrita, e manda texto null", async () => {
    get.mockResolvedValue({ data: COM_MODELO });
    patch.mockResolvedValue({ data: {} });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    const botoes = await screen.findAllByRole("button", { name: "Voltar ao texto do modelo" });
    expect(botoes).toHaveLength(1);
    fireEvent.click(botoes[0]!);
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/documento", { secaoId: "terms", texto: null }));
  });

  it("campo do briefing tem caixa; prazo aponta para o campo de prazo", async () => {
    get.mockResolvedValue({ data: COM_MODELO });
    patch.mockResolvedValue({ data: {} });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    const campo = await screen.findByLabelText("Nome do projeto");
    fireEvent.change(campo, { target: { value: "Site da imobiliária" } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher" }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/documento", { campo: "project.name", valor: "Site da imobiliária" }),
    );
    expect(screen.getByText("Preencha no campo Prazo (dias úteis), abaixo.")).toBeInTheDocument();
  });

  it("trocar o modelo com seção reescrita: cancelar a confirmação não chama nada", async () => {
    get.mockResolvedValue({ data: COM_MODELO });
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    fireEvent.change(await screen.findByLabelText("Modelo do documento"), { target: { value: "ecommerce" } });
    expect(confirmar).toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it("trocar o modelo confirmando manda descartar_reescritas", async () => {
    get.mockResolvedValue({ data: COM_MODELO });
    patch.mockResolvedValue({ data: {} });
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    fireEvent.change(await screen.findByLabelText("Modelo do documento"), { target: { value: "ecommerce" } });
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/modelo", { template_slug: "ecommerce", descartar_reescritas: true }),
    );
    confirmar.mockRestore();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx"`
Expected: FAIL nos casos novos; os 6 antigos continuam PASS

- [ ] **Step 3: Reescrever o componente**

Os dois subcomponentes (`EditorDeSecao`, `CampoQueFalta`) ficam FORA de `DocumentoCanvas`: declarados dentro, cada re-render do pai criaria um tipo novo de componente e o React descartaria o texto que a pessoa está digitando.

```tsx
// app/app/proposals/[id]/_components/DocumentoCanvas.tsx
"use client";

import { useEffect, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";
import { ROTULO_DO_MODELO } from "@/lib/propostas/modelos/rotulos";

interface SecaoDocumento {
  id: string;
  title: string;
  body: string;
  faltantes: string[];
  editada?: boolean;
}

type Onde = "briefing" | "campo_prazo" | "itens" | "contato" | "sistema";

interface CampoFaltando {
  caminho: string;
  rotulo: string;
  onde: Onde;
  secoes: string[];
}

interface Documento {
  status?: string;
  modeloSlug: string | null;
  modeloSlugSugerido: string | null;
  secoes: SecaoDocumento[];
  variaveisFaltando: string[];
  camposFaltando?: CampoFaltando[];
  temSecaoEditada?: boolean;
  prontidao: { status: string; checklist: Record<string, boolean> } | null;
  resumoComercial: string | null;
}

type Traduz = (chave: string) => string;

export interface DocumentoCanvasProps {
  propostaId: string;
  /** manager+ e sem suporte só-leitura — quem a rota PATCH aceita. */
  podeRevisar?: boolean;
  emRascunho?: boolean;
  /** O editor incrementa quando salva algo que muda o documento (prazo, itens). */
  versao?: number;
}

const DICA_POR_ONDE: Record<Exclude<Onde, "briefing">, string> = {
  campo_prazo: "Preencha no campo Prazo (dias úteis), abaixo.",
  itens: "Vem do total dos itens da proposta.",
  contato: "Vem do cadastro do contato.",
  sistema: "Calculado pelo sistema.",
};

function CampoQueFalta({
  campo,
  editavel,
  ocupado,
  onPreencher,
  t,
}: {
  campo: CampoFaltando;
  editavel: boolean;
  ocupado: boolean;
  onPreencher: (valor: string) => void;
  t: Traduz;
}) {
  const [valor, setValor] = useState("");
  const idDoCampo = `campo-${campo.caminho}`;
  if (campo.onde !== "briefing" || !editavel) {
    return (
      <li>
        <span className="font-medium">{t(campo.rotulo)}</span>
        {campo.onde !== "briefing" ? (
          <>
            <span aria-hidden> — </span>
            <span>{t(DICA_POR_ONDE[campo.onde])}</span>
          </>
        ) : null}
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-1 sm:flex-row sm:items-center">
      <label htmlFor={idDoCampo} className="font-medium sm:w-56">
        {t(campo.rotulo)}
      </label>
      <Input id={idDoCampo} value={valor} onChange={(e) => setValor(e.target.value)} className="flex-1 bg-white" />
      <Button size="sm" disabled={ocupado || valor.trim().length === 0} onClick={() => onPreencher(valor.trim())}>
        {t("Preencher")}
      </Button>
    </li>
  );
}

function EditorDeSecao({
  secao,
  ocupado,
  onSalvar,
  onRestaurar,
  t,
}: {
  secao: SecaoDocumento;
  ocupado: boolean;
  onSalvar: (texto: string) => void;
  onRestaurar: () => void;
  t: Traduz;
}) {
  const [texto, setTexto] = useState(secao.body);
  const idDaCaixa = `secao-${secao.id}`;
  const mudou = texto.trim() !== secao.body.trim();
  return (
    <div className="space-y-1">
      <label htmlFor={idDaCaixa} className="text-sm font-semibold">
        {secao.title}
      </label>
      <Textarea
        id={idDaCaixa}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={Math.min(12, Math.max(3, Math.ceil(texto.length / 90)))}
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={ocupado || !mudou || texto.trim().length === 0} onClick={() => onSalvar(texto.trim())}>
          {t("Salvar seção")}
        </Button>
        {secao.editada ? (
          <Button size="sm" variant="outline" disabled={ocupado} onClick={onRestaurar}>
            {t("Voltar ao texto do modelo")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentoCanvas({ propostaId, podeRevisar = false, emRascunho = false, versao = 0 }: DocumentoCanvasProps) {
  const t = useT();
  const [doc, setDoc] = useState<Documento | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get<ApiSuccess<Documento>>(`/api/v1/proposals/${propostaId}/documento`, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setDoc(res.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showApiError(error);
      });
    return () => controller.abort();
  }, [propostaId, versao, recarga]);

  async function executar(acao: () => Promise<unknown>) {
    setOcupado(true);
    try {
      await acao();
      setRecarga((n) => n + 1);
    } catch (error) {
      showApiError(error);
    } finally {
      setOcupado(false);
    }
  }

  const confirmarModelo = (slug: string, descartar = false) =>
    executar(() =>
      apiClient.patch(
        `/api/v1/proposals/${propostaId}/modelo`,
        descartar ? { template_slug: slug, descartar_reescritas: true } : { template_slug: slug },
      ),
    );

  if (!doc) return null;

  const secoes = doc.secoes ?? [];
  const camposFaltando = doc.camposFaltando ?? [];
  // Resposta de rota antiga (sem camposFaltando) ainda conta pelas ocorrências.
  const totalDePendencias = camposFaltando.length > 0 ? camposFaltando.length : (doc.variaveisFaltando ?? []).length;
  const editavel = podeRevisar && emRascunho;

  if (!doc.modeloSlug) {
    const rotuloSugerido = doc.modeloSlugSugerido ? ROTULO_DO_MODELO[doc.modeloSlugSugerido] : null;
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-gray-600 space-y-3">
        {doc.modeloSlugSugerido ? (
          <p>
            {t("A IA sugeriu o modelo")} <strong>{rotuloSugerido ?? doc.modeloSlugSugerido}</strong>.
          </p>
        ) : (
          <p>{t("Nenhum modelo escolhido para esta proposta ainda.")}</p>
        )}
        <div className="flex items-center gap-2">
          {doc.modeloSlugSugerido && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => confirmarModelo(doc.modeloSlugSugerido!)}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {t("Usar este modelo")}
            </button>
          )}
          <select
            disabled={ocupado}
            defaultValue=""
            onChange={(e) => e.target.value && confirmarModelo(e.target.value)}
            className="rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              {t("Ou escolha outro modelo")}
            </option>
            {Object.entries(ROTULO_DO_MODELO).map(([slug, rotulo]) => (
              <option key={slug} value={slug}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  const trocarModelo = (slug: string) => {
    if (!slug || slug === doc.modeloSlug) return;
    if (doc.temSecaoEditada) {
      if (!window.confirm(t("Trocar o modelo descarta as seções reescritas à mão. Continuar?"))) return;
      void confirmarModelo(slug, true);
      return;
    }
    void confirmarModelo(slug);
  };

  return (
    <div className="rounded-lg border p-4 space-y-4">
      {editavel && (
        <div className="flex items-center gap-2 text-sm">
          <span>{t("Modelo do documento")}</span>
          <select
            aria-label={t("Modelo do documento")}
            disabled={ocupado}
            value={doc.modeloSlug}
            onChange={(e) => trocarModelo(e.target.value)}
            className="rounded-md border px-2 py-1.5 text-sm"
          >
            {Object.entries(ROTULO_DO_MODELO).map(([slug, rotulo]) => (
              <option key={slug} value={slug}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
      )}

      {totalDePendencias > 0 && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
          <p className="font-medium">
            {t("Não é possível enviar")} — {totalDePendencias} {t("pendência(s)")}
          </p>
          {camposFaltando.length > 0 && (
            <>
              <p>{t("O que falta preencher:")}</p>
              <ul className="space-y-2">
                {camposFaltando.map((c) => (
                  <CampoQueFalta
                    key={c.caminho}
                    campo={c}
                    editavel={editavel}
                    ocupado={ocupado}
                    t={t}
                    onPreencher={(valor) =>
                      executar(() => apiClient.patch(`/api/v1/proposals/${propostaId}/documento`, { campo: c.caminho, valor }))
                    }
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="space-y-4">
        {secoes.map((s) =>
          editavel ? (
            <EditorDeSecao
              key={`${s.id}:${s.body}`}
              secao={s}
              ocupado={ocupado}
              t={t}
              onSalvar={(texto) =>
                executar(() => apiClient.patch(`/api/v1/proposals/${propostaId}/documento`, { secaoId: s.id, texto }))
              }
              onRestaurar={() =>
                executar(() => apiClient.patch(`/api/v1/proposals/${propostaId}/documento`, { secaoId: s.id, texto: null }))
              }
            />
          ) : (
            <div key={s.id}>
              <div className="text-sm font-semibold">{s.title}</div>
              <div className="text-sm whitespace-pre-wrap">{s.body}</div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
```

A `key` do `EditorDeSecao` inclui o texto da seção: quando a rota devolve um corpo novo (campo preenchido, volta ao modelo), o editor nasce de novo com o texto novo — sem `setState` dentro de `useEffect`, que a regra `react-hooks/set-state-in-effect` do lint recusa.

- [ ] **Step 4: O editor passa as permissões e ganha prazo e pagamento**

Em `app/app/proposals/[id]/page.tsx`, troque:
```tsx
  const podeEditar =
    roleAtLeast(activeOrg.role, "agent") &&
    (!user.support ||
      (user.support.status === "active" && user.support.access_mode === "full"));

  return <ProposalEditorClient id={id} podeEditar={podeEditar} />;
```
por:
```tsx
  const suporteLiberaEscrita =
    !user.support || (user.support.status === "active" && user.support.access_mode === "full");
  const podeEditar = roleAtLeast(activeOrg.role, "agent") && suporteLiberaEscrita;
  // O documento só é editável por manager+ — o mesmo papel que a rota PATCH /documento exige.
  const podeRevisar = roleAtLeast(activeOrg.role, "manager") && suporteLiberaEscrita;

  return <ProposalEditorClient id={id} podeEditar={podeEditar} podeRevisar={podeRevisar} />;
```

Em `app/app/proposals/[id]/_client.tsx`:

1. Na `interface Proposta`, depois de `valid_until: string | null;`, acrescente:
```typescript
  prazo_dias_uteis: number | null;
  pagamento: string | null;
```
2. Troque a assinatura:
```tsx
export function ProposalEditorClient({ id, podeEditar }: { id: string; podeEditar: boolean }) {
```
por:
```tsx
export function ProposalEditorClient({ id, podeEditar, podeRevisar = false }: { id: string; podeEditar: boolean; podeRevisar?: boolean }) {
```
3. Logo depois de `const [driftIgnorado, setDriftIgnorado] = useState(false);`, acrescente:
```tsx
  // Salvar prazo/itens muda o documento (prazo e investimento): o canvas recarrega.
  const [versaoDoDocumento, setVersaoDoDocumento] = useState(0);
```
4. Em `salvar()`, no corpo do `apiClient.patch`, depois de `valid_until: proposta.valid_until,` acrescente:
```tsx
          prazo_dias_uteis: proposta.prazo_dias_uteis,
          pagamento: proposta.pagamento,
```
e, depois do `setProposta((p) => p && { ...p, revision: ..., total_cents: ... });` do sucesso, acrescente `setVersaoDoDocumento((n) => n + 1);`.
5. Troque:
```tsx
      <DocumentoCanvas propostaId={id} />
```
por:
```tsx
      <DocumentoCanvas
        propostaId={id}
        podeRevisar={podeRevisar}
        emRascunho={proposta.status === "rascunho"}
        versao={versaoDoDocumento}
      />
```
6. Logo depois do bloco `<div className="space-y-2">` de "Válido até" (termina em `</div>` depois do `<input type="date" .../>`), acrescente:
```tsx
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="prazo-dias-uteis" className="block text-sm font-medium">{t("Prazo (dias úteis)")}</label>
          <input
            id="prazo-dias-uteis"
            type="number"
            min="1"
            max="365"
            step="1"
            className="w-full rounded-md border p-2 text-sm disabled:bg-gray-100"
            value={proposta.prazo_dias_uteis ?? ""}
            disabled={!editavel}
            onChange={(e) =>
              setProposta((p) => p && { ...p, prazo_dias_uteis: e.target.value === "" ? null : Math.round(Number(e.target.value)) || null })
            }
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="forma-de-pagamento" className="block text-sm font-medium">{t("Forma de pagamento")}</label>
          <input
            id="forma-de-pagamento"
            type="text"
            maxLength={500}
            className="w-full rounded-md border p-2 text-sm disabled:bg-gray-100"
            value={proposta.pagamento ?? ""}
            disabled={!editavel}
            onChange={(e) => setProposta((p) => p && { ...p, pagamento: e.target.value || null })}
            placeholder={t("Ex: 50% no aceite e 50% na entrega")}
          />
        </div>
      </div>
```

- [ ] **Step 5: Traduções** — acrescente ao `DICIONARIO` (confira cada uma antes com `grep`):

```typescript
  "Modelo do documento": { es: "Modelo del documento" },
  "O que falta preencher:": { es: "Qué falta completar:" },
  Preencher: { es: "Completar" },
  "Salvar seção": { es: "Guardar sección" },
  "Voltar ao texto do modelo": { es: "Volver al texto del modelo" },
  "Trocar o modelo descarta as seções reescritas à mão. Continuar?": {
    es: "Cambiar el modelo descarta las secciones reescritas a mano. ¿Continuar?",
  },
  "Preencha no campo Prazo (dias úteis), abaixo.": { es: "Completa el campo Plazo (días hábiles), abajo." },
  "Vem do total dos itens da proposta.": { es: "Viene del total de los ítems de la propuesta." },
  "Vem do cadastro do contato.": { es: "Viene del registro del contacto." },
  "Calculado pelo sistema.": { es: "Calculado por el sistema." },
  "Prazo (dias úteis)": { es: "Plazo (días hábiles)" },
  "Forma de pagamento": { es: "Forma de pago" },
  "Ex: 50% no aceite e 50% na entrega": { es: "Ej.: 50% al aceptar y 50% a la entrega" },
```

E uma entrada para cada um dos 33 rótulos da Task 1 (eles chegam à tela por `t(campo.rotulo)`), por exemplo:

```typescript
  "Nome do projeto": { es: "Nombre del proyecto" },
  "Objetivo do projeto": { es: "Objetivo del proyecto" },
  "Filtros de busca de imóveis": { es: "Filtros de búsqueda de inmuebles" },
```

— e assim para os 33 (a lista inteira está em `ROTULO_DA_VARIAVEL`). `"Prazo (dias úteis)"` já entra acima; não duplique.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run "app/app/proposals/[id]/" tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: PASS — o `_client.test.tsx` antigo continua verde (ele renderiza o canvas real com `apiClient.get` mockado; o canvas trata `camposFaltando` e `secoes` ausentes como vazios)

- [ ] **Step 7: Gates da tarefa**

```bash
pnpm typecheck
pnpm lint
```

- [ ] **Step 8: Commit**

```bash
git add "app/app/proposals/[id]/_components/DocumentoCanvas.tsx" "app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx" "app/app/proposals/[id]/_client.tsx" "app/app/proposals/[id]/page.tsx" lib/i18n/dicionario.ts
git commit -m "feat(propostas): documento editável na tela, campos que faltam, prazo e pagamento (P1)"
```

---

### Task 10: Fragmento de versão e fechamento

**Files:**
- Create: `.changes/proposta-com-modelo-chega-ao-cliente-e-e-editavel.md`

- [ ] **Step 1: Fragmento**

```markdown
---
impacto: capacidade_nova
secao: corrigido
titulo: Proposta com modelo passa a poder ser enviada, e o cliente recebe o documento
---

Toda proposta com modelo escolhido era recusada no envio, porque dois campos de todo modelo (a data da aprovação e o prazo) não tinham onde ser preenchidos. Agora o prazo e a forma de pagamento ficam no editor, a data da aprovação vira uma linha em branco para a assinatura, e cada seção do documento pode ser reescrita — ou voltar ao texto do modelo — antes do envio. O que falta preencher aparece com nome, e não com código. O PDF que o cliente recebe no WhatsApp passa a ser o documento completo, com as seções e a tabela de itens; proposta sem modelo continua recebendo o PDF de itens.
```

- [ ] **Step 2: Conferir a forma do fragmento**

Run: `pnpm release:conferir`
Expected: o fragmento aparece, sem erro de forma

- [ ] **Step 3: Régua final contra o retrato de partida**

```bash
npx vitest run lib/propostas "app/api/v1/proposals" "app/app/proposals" tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/suporte-cobertura-de-efeitos.test.ts tests/unit/branding.test.ts > "$TMP/p1-depois.log" 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " "$TMP/p1-depois.log" | tail -3
pnpm typecheck && pnpm lint && pnpm lint:channels
```

O `exit` é a autoridade. Compare com o rodapé da Task 0: nenhum arquivo que estava verde pode estar vermelho.

- [ ] **Step 4: Commit**

```bash
git add .changes/proposta-com-modelo-chega-ao-cliente-e-e-editavel.md
git commit -m "docs(release): fragmento do P1 da proposta"
```

- [ ] **Step 5: Relatório para a sessão Claude**

Cole: a lista de commits (`git log --oneline fork/vps/pljr-combinada..HEAD`), o rodapé de antes e de depois, a saída de `typecheck`/`lint`, e a saída de cada sabotagem (Tasks 1, 3, 4, 8). **Não empurre.**

---

## Roteiro de prova na tela (para o dono, depois de publicado)

1. No WhatsApp de teste, peça um orçamento até a IA criar o rascunho; abra **Propostas** e o rascunho.
2. Confirme o modelo; veja **O que falta preencher** com nomes legíveis.
3. Preencha dois campos e veja o texto das seções mudar.
4. Reescreva uma seção, salve; depois clique **Voltar ao texto do modelo** e veja o `[a definir]` voltar onde faltar dado.
5. Preencha prazo e forma de pagamento, salve; o aviso de prazo some.
6. Envie e abra o PDF no WhatsApp: as seções estão lá, com a tabela de itens depois de "Investimento".
7. **Erro de propósito:** tente enviar com um campo vazio (a lista nomeada aparece); troque o modelo com uma seção reescrita e **cancele** a confirmação (nada muda).

## Self-Review (aplicado ao escrever)

- Cobertura da spec, Item 1: comportamentos 1 (Task 9), 2 (Tasks 3, 4, 9), 3 (Tasks 6, 9), 4 (Task 2), 5 (Tasks 5, 9), 6 (Task 4), 7 (Tasks 7, 8), 8 (Task 8). D1 (Task 3), D2 (Task 2), D3 (`client.company` fica `briefing`, Task 1), D4 (Task 8).
- Tipos: `SecaoDoDocumento`, `CampoFaltando`, `OndePreencher` têm o mesmo nome e forma nas Tasks 1, 3, 4 e 9 (a tela repete a interface porque é client component e não importa de rota).
- Review Focus: variável em várias seções (Task 3), reescrita + campo (Task 3, caso "seção reescrita"), lixo em `secoes_editadas` (Task 3), proposta enviada em outra aba (Task 4), troca de modelo com reescrita (Task 5).
