# Proposta P2 — "Preencher com a conversa"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Fechar o item 2 (revisado) da spec: no editor da proposta, um botão lê a conversa com o cliente e sugere valores para os campos que faltam preencher — sem gravar nada até a pessoa revisar e clicar em "Preencher" em cada campo, exatamente como já funciona no P1.

**Architecture:** Este plano **substitui** os antigos planos "P2 — a IA só rascunha depois de ouvir" e "P3 — a IA completa o rascunho aberto" (apagados; ver §0). Aquele desenho fazia a IA travar ou completar o rascunho sozinha, sem uma pessoa no meio. O novo desenho é mais simples e mais seguro: a IA continua rascunhando a proposta do jeito que já rascunha hoje (sem exigir briefing completo, sem travar o turno do agente esperando resposta) — quem decide QUANDO a conversa já tem informação suficiente é a pessoa que revisa, apertando um botão no editor. Um módulo puro (`lib/propostas/preencher-com-conversa.ts`) lê as mensagens da conversa da proposta e pede à IA — no mesmo padrão do `AssistantPanel`/`gerarMudancas` que já existe — sugestões só para os campos que o P1 já lista em "O que falta preencher". As sugestões pré-preenchem a caixa de cada campo (nunca gravam sozinhas); a pessoa revisa, edita se quiser, e aperta "Preencher" — o mesmo `PATCH /documento` do P1.

**Tech Stack:** Next.js Route Handlers, Supabase JS (admin client), Zod, Vercel AI Gateway (`runModelCall`), React 19, Vitest + Testing Library.

**Spec:** [`docs/superpowers/specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md`](../specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md) — §2 Item 2 (revisado); decisões D5, D6, D16–D18.

## §0 — Por que os planos antigos saíram

Decisão do dono em 26/09/2026: em vez de a IA tentar adivinhar quando o briefing está "completo" (o antigo P2) ou completar sozinha o rascunho a cada resposta do cliente (o antigo P3), o preenchimento do documento a partir da conversa vira uma ação que a pessoa pede, quando quiser, sobre o rascunho que já existe. Isso:

- Evita o problema medido em §1.1 da spec (a IA gravou o briefing 8 segundos depois de perguntar o segmento, antes da resposta) de um jeito mais simples: a IA não escreve mais conteúdo do documento sozinha em NENHUM momento — nem ao criar o rascunho, nem depois. `crm_draft_proposal` não muda neste plano.
- Não gasta a vaga nova de ferramenta que a spec antiga (D11) tinha reservado para "rascunhar ou completar" — este plano não toca o pacote de ferramentas do agente de atendimento. É chamada de IA a partir de uma **rota HTTP**, no mesmo padrão do `proposal_assistant` que já existe, nunca uma tool MCP.
- Dá à pessoa o controle total: ela decide quando a conversa já tem o suficiente, pode repetir o pedido depois de o cliente responder mais, e nunca perde o que já escreveu (a sugestão só troca uma caixa vazia; a caixa com valor não é tocada).

## Como este plano é executado (opencode)

As mesmas regras do P1 (seção "Como este plano é executado"): worktree própria sobre a base que a sessão Claude indicar (precisa ter o P1 já aplicado — `lib/propostas/documento/documento-da-proposta.ts` tem de existir), medir antes de colar, só testes da tarefa + `typecheck` + `lint`, sabotagem com cópia em `$TMP`, um commit por tarefa, **não empurrar**.

## Global Constraints

- **Nenhuma ferramenta nova de IA para o agente de atendimento.** A sugestão é chamada de uma rota HTTP (como `proposal_assistant`), nunca de uma tool MCP — não mexe no pacote `vender` nem no teto de ferramentas.
- **A IA só sugere; nunca grava.** Toda gravação passa pelo `PATCH /documento` que o P1 já construiu (`{ campo, valor }`), com a pessoa clicando "Preencher" — igual a digitar o valor à mão.
- **A IA só vê os campos que já faltam** (`camposFaltando` com `onde === "briefing"`, do P1) — nunca todas as variáveis do modelo, e nunca itens/preço/condições/validade (que não são "briefing").
- **A IA não pode inventar campo fora da lista recebida.** A resposta é filtrada contra os `caminho` pedidos; qualquer `campo` fora da lista é descartado, silenciosamente (mesma régua do `aplicarMudancas` do assistente: "item referenciado que não existe mais é ignorado").
- Toda rota mutante — e esta rota, mesmo sem escrever no banco, gasta orçamento de IA e por isso conta como tal — começa com `requireSupportWrite()` antes de qualquer efeito (cerca `tests/unit/suporte-cobertura-de-efeitos.test.ts`), no molde de `app/api/v1/proposals/[id]/assistant/route.ts`.
- Texto de tela e de erro sai de `t(...)`; toda chave nova ganha entrada em espanhol no MESMO commit (cerca `tests/unit/i18n-espanhol-cobre-a-tela.test.ts`).
- A conversa lida é SEMPRE `crm_proposals.conversation_id` da própria proposta — nunca um id vindo do corpo da requisição (anti-pattern 10; filtro de `organization_id` explícito em toda consulta com o client admin).
- Papel exigido: `manager` (o mesmo que `PATCH /documento` do P1) — o botão só aparece dentro do bloco que o P1 já restringe a `podeRevisar && emRascunho`.

## Review Focus

- **Proposta sem `conversation_id`** (órfã, ou criada fora de uma conversa) — a rota devolve `sugestoes: []` sem chamar a IA, nunca erro. Task 2 testa.
- **Nenhum campo faltando, ou nenhum é `onde === "briefing"`** (só falta prazo/pagamento/itens) — a rota não chama a IA (economiza orçamento) e devolve `sugestoes: []`. Task 4 testa.
- **A IA sugere um campo que não estava na lista pedida** (alucinação) — descartado, nunca gravado nem exibido. Task 1 testa.
- **A IA sugere valor vazio ou só espaço** para um campo pedido — descartado (não teria efeito além de piscar a caixa). Task 1 testa.
- **Campo que já tem sugestão e a pessoa edita antes de clicar "Preencher"** — o valor editado é o que vai no `PATCH`, nunca a sugestão original (o campo continua sendo um `<input>` comum). Task 5 testa.

---

### Task 0: Worktree

- [ ] **Step 1**

```bash
cd "D:/PROJETOS VIBE CODING/DeskcommCRM"
git status --short
git worktree add "../deskcomm-proposta-p2" -b feat/proposta-p2-preencher-com-conversa <BASE-INFORMADA-PELA-SESSAO>
cd "../deskcomm-proposta-p2" && pnpm install --frozen-lockfile
ls lib/propostas/documento/documento-da-proposta.ts   # P1 tem de estar na base
```

- [ ] **Step 2: Retrato de partida**

```bash
npx vitest run lib/propostas "app/api/v1/proposals" "app/app/proposals" tests/unit/pontos-de-ia-completude.test.ts > "$TMP/p2-antes.log" 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests " "$TMP/p2-antes.log" | tail -2
```

---

### Task 1: O módulo puro — transcrição da conversa e sugestão de valores

**Files:**
- Create: `lib/propostas/preencher-com-conversa.ts`
- Create: `lib/propostas/preencher-com-conversa.test.ts`

**Interfaces:**
- Consumes: `runModelCall`, `tool`, `type ModelMessage`, `type LlmEdgeConfig` (`@/lib/agent-engine/edge/llm/run-model-call`) — mesmo import de `lib/propostas/assistente.ts`.
- Produces:
  - `interface CampoParaSugestao { caminho: string; rotulo: string }`
  - `interface SugestaoDeValor { campo: string; rotulo: string; valor: string }`
  - `function linhaDaMensagem(direction: string, body: string | null): string | null`
  - `function montarTranscricao(mensagens: Array<{ direction: string; body: string | null }>): string`
  - `async function sugerirValoresDaConversa(input: { campos: CampoParaSugestao[]; transcricao: string; pool: pg.Pool; cfg: LlmEdgeConfig; tenantId: string }): Promise<SugestaoDeValor[]>`

- [ ] **Step 1: Escrever o teste**

```typescript
// lib/propostas/preencher-com-conversa.test.ts
import { describe, expect, it, vi } from "vitest";
import { montarTranscricao, sugerirValoresDaConversa } from "./preencher-com-conversa";
import type { CampoParaSugestao } from "./preencher-com-conversa";

describe("montarTranscricao", () => {
  it("rotula inbound como Cliente e outbound como Atendente, na ordem em que vieram", () => {
    const t = montarTranscricao([
      { direction: "inbound", body: "Quero um site para minha imobiliária" },
      { direction: "outbound", body: "Claro! Qual o objetivo principal do site?" },
      { direction: "inbound", body: "Gerar contato de comprador" },
    ]);
    expect(t).toBe(
      "Cliente: Quero um site para minha imobiliária\nAtendente: Claro! Qual o objetivo principal do site?\nCliente: Gerar contato de comprador",
    );
  });

  it("mensagem sem corpo (mídia sem transcrição) é pulada, nunca vira linha vazia", () => {
    const t = montarTranscricao([
      { direction: "inbound", body: null },
      { direction: "inbound", body: "  " },
      { direction: "outbound", body: "Oi!" },
    ]);
    expect(t).toBe("Atendente: Oi!");
  });

  it("lista vazia devolve string vazia", () => {
    expect(montarTranscricao([])).toBe("");
  });
});

vi.mock("@/lib/agent-engine/edge/llm/run-model-call", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agent-engine/edge/llm/run-model-call")>();
  return { ...real, runModelCall: vi.fn() };
});

const CAMPOS: CampoParaSugestao[] = [
  { caminho: "project.objective", rotulo: "Objetivo do projeto" },
  { caminho: "scope.pages_list", rotulo: "Lista de páginas" },
];

describe("sugerirValoresDaConversa", () => {
  it("monta a chamada com tenantId/purpose corretos e devolve as sugestões da tool-call", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({
      result: {
        toolCalls: [{
          toolName: "sugerir_valores",
          input: { sugestoes: [{ campo: "project.objective", valor: "Gerar contato de comprador" }] },
        }],
      },
    } as never);

    const r = await sugerirValoresDaConversa({
      campos: CAMPOS, transcricao: "Cliente: quero gerar contatos",
      pool: {} as never, cfg: {} as never, tenantId: "org-1",
    });

    expect(r).toEqual([{ campo: "project.objective", rotulo: "Objetivo do projeto", valor: "Gerar contato de comprador" }]);
    expect(vi.mocked(runModelCall)).toHaveBeenCalledWith(
      {}, {}, expect.objectContaining({ tenantId: "org-1", purpose: "proposal_fill_from_conversation" }),
    );
  });

  it("campo fora da lista pedida (alucinação) é descartado — nunca sai da função", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({
      result: { toolCalls: [{ toolName: "sugerir_valores", input: { sugestoes: [
        { campo: "project.objective", valor: "Vender apartamentos" },
        { campo: "client.bank_account", valor: "12345-6" },
      ] } }] },
    } as never);

    const r = await sugerirValoresDaConversa({ campos: CAMPOS, transcricao: "x", pool: {} as never, cfg: {} as never, tenantId: "org-1" });
    expect(r).toEqual([{ campo: "project.objective", rotulo: "Objetivo do projeto", valor: "Vender apartamentos" }]);
  });

  it("valor vazio ou só espaço é descartado", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({
      result: { toolCalls: [{ toolName: "sugerir_valores", input: { sugestoes: [
        { campo: "project.objective", valor: "   " },
        { campo: "scope.pages_list", valor: "Home, Sobre, Contato" },
      ] } }] },
    } as never);

    const r = await sugerirValoresDaConversa({ campos: CAMPOS, transcricao: "x", pool: {} as never, cfg: {} as never, tenantId: "org-1" });
    expect(r).toEqual([{ campo: "scope.pages_list", rotulo: "Lista de páginas", valor: "Home, Sobre, Contato" }]);
  });

  it("modelo não chama a tool: devolve lista vazia, nunca lança", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({ result: { toolCalls: [] } } as never);
    const r = await sugerirValoresDaConversa({ campos: CAMPOS, transcricao: "x", pool: {} as never, cfg: {} as never, tenantId: "org-1" });
    expect(r).toEqual([]);
  });

  it("sem campos pedidos, nem chama o modelo — economiza orçamento", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    const r = await sugerirValoresDaConversa({ campos: [], transcricao: "x", pool: {} as never, cfg: {} as never, tenantId: "org-1" });
    expect(r).toEqual([]);
    expect(runModelCall).not.toHaveBeenCalled();
  });

  it("sem transcrição, nem chama o modelo — nada para ler", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    const r = await sugerirValoresDaConversa({ campos: CAMPOS, transcricao: "   ", pool: {} as never, cfg: {} as never, tenantId: "org-1" });
    expect(r).toEqual([]);
    expect(runModelCall).not.toHaveBeenCalled();
  });

  it("orçamento estourado: o erro de runModelCall SOBE, não é engolido aqui", async () => {
    const { runModelCall, LlmBudgetExceededError } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockRejectedValue(new LlmBudgetExceededError());
    await expect(
      sugerirValoresDaConversa({ campos: CAMPOS, transcricao: "x", pool: {} as never, cfg: {} as never, tenantId: "org-1" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/preencher-com-conversa.test.ts`
Expected: FAIL — `Cannot find module './preencher-com-conversa'`

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/preencher-com-conversa.ts
import { z } from "zod";
import type pg from "pg";
import { tool, type ModelMessage, runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";

export interface CampoParaSugestao {
  caminho: string;
  rotulo: string;
}

export interface SugestaoDeValor {
  campo: string;
  rotulo: string;
  valor: string;
}

/** `null` para mensagem sem corpo textual (mídia sem transcrição) — nunca vira linha vazia. */
export function linhaDaMensagem(direction: string, body: string | null): string | null {
  const texto = (body ?? "").trim();
  if (texto === "") return null;
  const quem = direction === "inbound" ? "Cliente" : "Atendente";
  return `${quem}: ${texto}`;
}

/**
 * Monta o texto da conversa na ordem em que as mensagens chegam (mais antiga
 * primeiro — quem chama já ordena assim, ver Task 4). Mensagem de mídia sem
 * texto derivado é pulada, nunca vira "Cliente: " vazio.
 */
export function montarTranscricao(mensagens: Array<{ direction: string; body: string | null }>): string {
  return mensagens
    .map((m) => linhaDaMensagem(m.direction, m.body))
    .filter((linha): linha is string => linha !== null)
    .join("\n");
}

const respostaShape = {
  sugestoes: z
    .array(z.object({ campo: z.string(), valor: z.string() }))
    .describe(
      "Só os campos da lista recebida que a conversa REALMENTE respondeu. Não invente valor " +
        "para o que não foi dito, e não sugira campo fora da lista.",
    ),
};

/**
 * Sugere valores para os campos que faltam no documento, lendo a conversa —
 * D5/D6 da spec de 26/09: a IA só sugere (nunca grava) e só o que está
 * vazio (a lista `campos` já vem filtrada pelo chamador para os que faltam).
 *
 * Sem campos ou sem transcrição, nem chama o modelo — não há o que sugerir e
 * a chamada custaria orçamento à toa.
 */
export async function sugerirValoresDaConversa(input: {
  campos: CampoParaSugestao[];
  transcricao: string;
  pool: pg.Pool;
  cfg: LlmEdgeConfig;
  tenantId: string;
}): Promise<SugestaoDeValor[]> {
  if (input.campos.length === 0 || input.transcricao.trim() === "") return [];

  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        "Campos que faltam preencher nesta proposta — responda SÓ os que a conversa abaixo respondeu de verdade:",
        ...input.campos.map((c) => `- ${c.caminho}: ${c.rotulo}`),
        "",
        "Conversa com o cliente:",
        input.transcricao,
      ].join("\n"),
    },
  ];

  const { result } = await runModelCall(input.pool, input.cfg, {
    tenantId: input.tenantId,
    purpose: "proposal_fill_from_conversation",
    system:
      "Você lê uma conversa de atendimento e sugere valores só para os campos que a lista pede, " +
      "chamando a ferramenta sugerir_valores. Regras: (1) só sugira campo que está na lista recebida — " +
      "nunca invente um caminho novo; (2) só sugira valor que a conversa realmente disse — nunca deduza " +
      "ou complete por conta própria; (3) campo sem resposta clara na conversa fica de fora da lista, " +
      "nunca com valor vazio ou chutado.",
    messages,
    tools: {
      sugerir_valores: tool({ inputSchema: z.object(respostaShape), execute: async (args) => args }),
    },
  });

  const chamada = result.toolCalls?.find((c) => c.toolName === "sugerir_valores");
  if (!chamada) return [];
  const parsed = z.object(respostaShape).safeParse(chamada.input);
  if (!parsed.success) return [];

  const porCaminho = new Map(input.campos.map((c) => [c.caminho, c.rotulo]));
  return parsed.data.sugestoes
    .filter((s) => porCaminho.has(s.campo) && s.valor.trim() !== "")
    .map((s) => ({ campo: s.campo, rotulo: porCaminho.get(s.campo)!, valor: s.valor.trim() }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/preencher-com-conversa.test.ts`
Expected: PASS

- [ ] **Step 5: Sabotar** — copie o arquivo, apague o `.filter((s) => porCaminho.has(s.campo) && s.valor.trim() !== "")` (deixe só o `.map(...)`), rode o teste: os casos "alucinação" e "valor vazio" falham. Restaure da cópia.

- [ ] **Step 6: Gates**

```bash
pnpm typecheck
pnpm lint
```

- [ ] **Step 7: Commit**

```bash
git add lib/propostas/preencher-com-conversa.ts lib/propostas/preencher-com-conversa.test.ts
git commit -m "feat(propostas): modulo puro de sugestao de valores a partir da conversa (P2)"
```

---

### Task 2: Registro do ponto de IA

**Files:**
- Modify: `lib/ai/pontos/registro.ts`

**Interfaces:**
- Consumes: nenhuma (só o `purpose` literal `"proposal_fill_from_conversation"` que a Task 1 já emite).

Meça antes: o formato exato do vizinho `proposal_assistant` (`sed -n '245,256p' lib/ai/pontos/registro.ts`) — copie a forma, não o texto.

- [ ] **Step 1: Acrescentar a entrada** — logo depois do objeto que termina em `registraEm: "llm_calls",` do ponto `proposal_assistant`, acrescente:

```typescript
  {
    id: "proposal_fill_from_conversation",
    rotulo: "Preencher proposta com a conversa",
    oQueFaz:
      "Lê a conversa com o cliente e sugere valores para os campos que faltam preencher no documento da proposta, para uma pessoa revisar e confirmar campo por campo.",
    papel: "atender",
    exige: { tools: true },
    emissor: "lib/propostas/preencher-com-conversa.ts",
    sintomaDeFalha:
      "O botão 'Preencher com a conversa' não sugere nada, e quem revisa preenche cada campo lendo a conversa manualmente.",
    registraEm: "llm_calls",
  },
```

- [ ] **Step 2: Rodar e ver passar**

Run: `npx vitest run tests/unit/pontos-de-ia-completude.test.ts tests/unit/pontos-de-ia-decisao-rapida.test.ts tests/unit/pontos-de-ia-resolver.test.ts`
Expected: PASS

- [ ] **Step 3: Gates + Commit**

```bash
pnpm typecheck && pnpm lint
git add lib/ai/pontos/registro.ts
git commit -m "feat(propostas): registra o ponto de IA proposal_fill_from_conversation (P2)"
```

---

### Task 3: O orçamento de IA passa a aceitar o `purpose` de quem chama

Hoje `orcamentoDeIaDisponivel` fixa `purpose: "proposal_assistant"` dentro da chamada a `decidirOrcamento` — correto para o único chamador que existe, mas `decidirOrcamento` usa esse valor para checar a lista de purposes isentos (`PURPOSES_ISENTOS`), e fixá-lo faria uma futura checagem de disponibilidade para OUTRO purpose mentir sobre isenção. Este plano não usa uma tela de disponibilidade separada (Task 4 degrada inline), mas corrigir agora evita que o próximo consumidor herde o mesmo descuido.

**Files:**
- Modify: `lib/propostas/orcamento-de-ia-disponivel.ts`
- Modify: `lib/propostas/orcamento-de-ia-disponivel.test.ts`

Meça antes de colar: a assinatura atual e a chamada a `decidirOrcamento` (`sed -n '37,80p' lib/propostas/orcamento-de-ia-disponivel.ts`, já lido acima nesta sessão — confira que não mudou).

- [ ] **Step 1: Teste** — acrescente ao arquivo de teste um caso que prova que o `purpose` passado chega a `decidirOrcamento` (mock de `decidirOrcamento` ou inspeção do efeito de isenção, conforme o mock já existente no arquivo — siga o padrão dos casos vizinhos que testam `chave`).

- [ ] **Step 2: Implementar** — troque a assinatura:

```typescript
export async function orcamentoDeIaDisponivel(
  db: SupabaseClient,
  organizationId: string,
  chave: ChaveDeOrcamento = "on",
): Promise<OrcamentoDeIaDisponivel> {
```

por:

```typescript
export async function orcamentoDeIaDisponivel(
  db: SupabaseClient,
  organizationId: string,
  chave: ChaveDeOrcamento = "on",
  purpose = "proposal_assistant",
): Promise<OrcamentoDeIaDisponivel> {
```

E troque, dentro do `decidirOrcamento({...})`, a linha:

```typescript
      purpose: "proposal_assistant",
```

por:

```typescript
      purpose,
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run lib/propostas/orcamento-de-ia-disponivel.test.ts "app/api/v1/proposals/[id]/assistant/disponibilidade"`
Expected: PASS (o chamador existente não passa o 4º argumento — comportamento idêntico ao de hoje, `purpose` cai no default).

- [ ] **Step 4: Gates + Commit**

```bash
pnpm typecheck && pnpm lint
git add lib/propostas/orcamento-de-ia-disponivel.ts lib/propostas/orcamento-de-ia-disponivel.test.ts
git commit -m "fix(propostas): orcamentoDeIaDisponivel aceita o purpose de quem chama (P2)"
```

---

### Task 4: A rota — lê a conversa, filtra os campos, devolve as sugestões

**Files:**
- Create: `app/api/v1/proposals/[id]/preencher-com-conversa/route.ts`
- Create: `app/api/v1/proposals/[id]/preencher-com-conversa/route.test.ts`

**Interfaces:**
- Consumes: `montarDocumentoDaProposta` (P1, `@/lib/propostas/documento/documento-da-proposta`); `montarTranscricao`, `sugerirValoresDaConversa` (Task 1); `orcamentoDeIaDisponivel` com `purpose` (Task 3).
- Produces: `POST /api/v1/proposals/[id]/preencher-com-conversa` (sem corpo) → `{ disponivel: boolean; motivo: string | null; sugestoes: Array<{ campo: string; rotulo: string; valor: string }> }`.

Meça antes de colar: os imports e o molde de mocks de `app/api/v1/proposals/[id]/assistant/route.ts` e `route.test.ts` (`vi.hoisted` + `vi.mock` de `require-role`, `impersonate/support`, `supabase/server` ou `supabase/admin`, `propostas/porta`) — copie a forma exata, os nomes podem ter mudado desde 26/09.

- [ ] **Step 1: Teste da rota** — no molde de `assistant/route.test.ts`, com estes casos (um `it` cada):

1. Suporte só-leitura → 403, nunca lê proposta nem chama IA.
2. Proposta não encontrada → 404.
3. Proposta não `rascunho` → 409 `proposal_context_stale`.
4. Proposta sem `template_slug` (documento não montado) → `{ disponivel: true, motivo: null, sugestoes: [] }`, sem chamar `sugerirValoresDaConversa`.
5. Documento montado mas `camposFaltando` só tem `onde !== "briefing"` (ex.: só falta prazo) → `{ disponivel: true, motivo: null, sugestoes: [] }`, sem chamar `sugerirValoresDaConversa`.
6. Proposta sem `conversation_id` → mesma resposta do caso 5, sem consultar `messages`.
7. Caminho feliz: `camposFaltando` com um item `onde: "briefing"`, mensagens mockadas, `sugerirValoresDaConversa` mockada devolvendo uma sugestão → `{ disponivel: true, motivo: null, sugestoes: [{...}] }`.
8. `sugerirValoresDaConversa` rejeita com `LlmBudgetExceededError` → `{ disponivel: false, motivo: <mensagem>, sugestoes: [] }`, HTTP 200 (mesmo padrão do `/assistant`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/api/v1/proposals/[id]/preencher-com-conversa/route.test.ts"`
Expected: FAIL — rota não existe.

- [ ] **Step 3: Implementar**

```typescript
// app/api/v1/proposals/[id]/preencher-com-conversa/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { env } from "@/lib/env";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { normalizarChaveDeOrcamento } from "@/lib/agent-engine/edge/llm/orcamento";
import { LlmBudgetExceededError, LlmProviderUnknownError, LlmModelNotEnabledError } from "@/lib/agent-engine/edge/llm/run-model-call";
import { getSkillsPool } from "@/lib/ai/skills/db";
import { montarDocumentoDaProposta, type PropostaParaDocumento } from "@/lib/propostas/documento/documento-da-proposta";
import type { ContatoParaDocumento } from "@/lib/propostas/documento/montar-dados";
import { montarTranscricao, sugerirValoresDaConversa } from "@/lib/propostas/preencher-com-conversa";
import { orcamentoDeIaDisponivel } from "@/lib/propostas/orcamento-de-ia-disponivel";
import { sePropostasDesligadas } from "@/lib/propostas/porta";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const LIMITE_DE_MENSAGENS = 60;

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: proposta } = await admin
    .from("crm_proposals")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });
  const p = proposta as PropostaParaDocumento & { status: string; conversation_id: string | null; contact_id: string | null };
  if (p.status !== "rascunho") {
    return fail("proposal_context_stale", t("Só é possível preencher o documento de uma proposta em rascunho."), 409, { requestId });
  }

  const { data: contato } = p.contact_id
    ? await admin.from("contacts").select("name, display_name").eq("organization_id", authz.org.orgId).eq("id", p.contact_id).maybeSingle()
    : { data: null };

  const documento = await montarDocumentoDaProposta(admin, authz.org.orgId, p, contato as ContatoParaDocumento | null);
  const camposDeBriefing = (documento?.camposFaltando ?? []).filter((c) => c.onde === "briefing");

  // Nada para sugerir: nem consulta mensagens, nem chama a IA (economiza
  // orçamento e evita um round-trip inútil quando só falta prazo/pagamento).
  if (camposDeBriefing.length === 0 || !p.conversation_id) {
    return ok({ disponivel: true, motivo: null, sugestoes: [] }, { requestId });
  }

  const { data: mensagens } = await admin
    .from("messages")
    .select("direction, body")
    .eq("organization_id", authz.org.orgId)
    .eq("conversation_id", p.conversation_id)
    .in("direction", ["inbound", "outbound"])
    .order("sent_at", { ascending: false })
    .limit(LIMITE_DE_MENSAGENS);
  const transcricao = montarTranscricao(((mensagens ?? []) as Array<{ direction: string; body: string | null }>).slice().reverse());

  try {
    const sugestoes = await sugerirValoresDaConversa({
      campos: camposDeBriefing.map((c) => ({ caminho: c.caminho, rotulo: c.rotulo })),
      transcricao,
      pool: getSkillsPool(),
      cfg: llmEdgeConfigFromEnv(env),
      tenantId: authz.org.orgId,
    });
    return ok({ disponivel: true, motivo: null, sugestoes }, { requestId });
  } catch (err) {
    if (
      err instanceof LlmBudgetExceededError ||
      err instanceof LlmProviderUnknownError ||
      err instanceof LlmModelNotEnabledError
    ) {
      return ok({ disponivel: false, motivo: err.message, sugestoes: [] }, { requestId });
    }
    throw err;
  }
}
```

O `orcamentoDeIaDisponivel` (Task 3) não é chamado aqui à toa: como o `/assistant/route.ts` original, a checagem prévia de orçamento é só para HABILITAR/desabilitar o botão numa tela antes do clique (N5) — este plano não adiciona uma tela de disponibilidade nova por simplicidade (o botão fica sempre clicável; o `try/catch` acima já degrada com a mesma mensagem). Se o dono pedir o mesmo aviso "sem clicar" que o `/assistant` tem, uma tarefa futura pode acrescentar `GET .../preencher-com-conversa/disponibilidade` chamando `orcamentoDeIaDisponivel(admin, orgId, chave, "proposal_fill_from_conversation")` — a Task 3 já deixou isso possível.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "app/api/v1/proposals/[id]/preencher-com-conversa/route.test.ts"`
Expected: PASS

- [ ] **Step 5: Traduções** — confira `grep -n "Só é possível preencher o documento" lib/i18n/dicionario.ts`; se não existir, acrescente ao `DICIONARIO`:

```typescript
  "Só é possível preencher o documento de uma proposta em rascunho.": {
    es: "Solo es posible completar el documento de una propuesta en borrador.",
  },
```

- [ ] **Step 6: Sabotar** — copie a rota, troque o `if (camposDeBriefing.length === 0 || !p.conversation_id)` por `if (false)`, rode o teste: os casos 4, 5 e 6 falham (chamariam `sugerirValoresDaConversa` à toa). Restaure da cópia.

- [ ] **Step 7: Gates**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 8: Commit**

```bash
git add "app/api/v1/proposals/[id]/preencher-com-conversa" lib/i18n/dicionario.ts
git commit -m "feat(propostas): rota que sugere valores a partir da conversa (P2)"
```

---

### Task 5: A tela — botão, sugestão pré-preenche a caixa, revisão continua igual

**Files:**
- Modify: `app/app/proposals/[id]/_components/DocumentoCanvas.tsx`
- Modify: `app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: `POST /preencher-com-conversa` (Task 4).
- Produces: nenhuma interface nova exportada — `CampoQueFalta` ganha uma prop interna `valorInicial?: string`.

Meça antes de colar: a forma atual de `CampoQueFalta` e do bloco de pendências em `DocumentoCanvas.tsx` pode ter mudado desde a escrita deste plano (26/09) se o P1 foi ajustado na revisão cega — confira com `sed -n '1,260p' "app/app/proposals/[id]/_components/DocumentoCanvas.tsx"` antes de colar os trechos abaixo.

- [ ] **Step 1: Teste** — acrescente ao `describe("DocumentoCanvas — P1 (edição)", ...)`:

```typescript
  it("botão 'Preencher com a conversa' só aparece com campo de briefing faltando e papel de revisão", async () => {
    get.mockResolvedValue({ data: COM_MODELO });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    await screen.findByText("Resumo");
    expect(screen.getByRole("button", { name: "Preencher com a conversa" })).toBeInTheDocument();
  });

  it("sem papel de revisão, o botão não aparece", async () => {
    get.mockResolvedValue({ data: COM_MODELO });
    render(<DocumentoCanvas propostaId="p1" emRascunho />);
    await screen.findByText("Resumo");
    expect(screen.queryByRole("button", { name: "Preencher com a conversa" })).toBeNull();
  });

  it("clicar em 'Preencher com a conversa' pré-preenche a caixa do campo sugerido, sem gravar nada", async () => {
    get.mockResolvedValue({ data: COM_MODELO });
    post.mockResolvedValue({
      data: { disponivel: true, motivo: null, sugestoes: [{ campo: "project.name", rotulo: "Nome do projeto", valor: "Site da Imobiliária Rio" }] },
    });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    await screen.findByText("Resumo");
    fireEvent.click(screen.getByRole("button", { name: "Preencher com a conversa" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/proposals/p1/preencher-com-conversa", {}));
    const campo = await screen.findByLabelText("Nome do projeto");
    expect(campo).toHaveValue("Site da Imobiliária Rio");
    expect(patch).not.toHaveBeenCalled();
  });

  it("nenhuma sugestão: mostra aviso, não mexe nas caixas", async () => {
    get.mockResolvedValue({ data: COM_MODELO });
    post.mockResolvedValue({ data: { disponivel: true, motivo: null, sugestoes: [] } });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    await screen.findByText("Resumo");
    fireEvent.click(screen.getByRole("button", { name: "Preencher com a conversa" }));
    await waitFor(() => expect(screen.getByText("A conversa não respondeu nenhum dos campos que faltam.")).toBeInTheDocument());
  });
```

E, no topo do arquivo de teste, acrescente `post` ao mock existente do `apiClient` (`vi.hoisted(() => vi.fn())` + incluir `post` no objeto de `vi.mock("@/lib/api/client", ...)`) e resete no `beforeEach`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx"`
Expected: FAIL nos 4 casos novos.

- [ ] **Step 3: `CampoQueFalta` ganha `valorInicial`** — troque:

```tsx
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
```

por:

```tsx
function CampoQueFalta({
  campo,
  editavel,
  ocupado,
  valorInicial,
  onPreencher,
  t,
}: {
  campo: CampoFaltando;
  editavel: boolean;
  ocupado: boolean;
  valorInicial?: string;
  onPreencher: (valor: string) => void;
  t: Traduz;
}) {
  const [valor, setValor] = useState(valorInicial ?? "");
```

- [ ] **Step 4: `DocumentoCanvas` ganha o botão e o estado de sugestões** — logo depois de `const [recarga, setRecarga] = useState(0);`, acrescente:

```tsx
  const [sugestoes, setSugestoes] = useState<Record<string, string>>({});
  const [preenchendo, setPreenchendo] = useState(false);
  const [avisoDeSugestao, setAvisoDeSugestao] = useState<string | null>(null);

  async function preencherComConversa() {
    setPreenchendo(true);
    setAvisoDeSugestao(null);
    try {
      const res = await apiClient.post<
        ApiSuccess<{ disponivel: boolean; motivo: string | null; sugestoes: Array<{ campo: string; rotulo: string; valor: string }> }>
      >(`/api/v1/proposals/${propostaId}/preencher-com-conversa`, {});
      if (!res.data.disponivel) {
        setAvisoDeSugestao(res.data.motivo ?? t("A IA não está disponível agora."));
        return;
      }
      if (res.data.sugestoes.length === 0) {
        setAvisoDeSugestao(t("A conversa não respondeu nenhum dos campos que faltam."));
        return;
      }
      setSugestoes(Object.fromEntries(res.data.sugestoes.map((s) => [s.campo, s.valor])));
    } catch (error) {
      showApiError(error);
    } finally {
      setPreenchendo(false);
    }
  }
```

Dentro do bloco de pendências (`{totalDePendencias > 0 && (...)}`), logo depois de `{camposFaltando.length > 0 && (` + `<p>{t("O que falta preencher:")}</p>`, acrescente o botão e o aviso, e passe `valorInicial` e a `key` para `CampoQueFalta`:

```tsx
              <p>{t("O que falta preencher:")}</p>
              {editavel && camposFaltando.some((c) => c.onde === "briefing") && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={preenchendo || ocupado} onClick={preencherComConversa}>
                    {preenchendo ? t("Lendo a conversa…") : t("Preencher com a conversa")}
                  </Button>
                  {avisoDeSugestao && <span className="text-gray-500">{avisoDeSugestao}</span>}
                </div>
              )}
              <ul className="space-y-2">
                {camposFaltando.map((c) => (
                  <CampoQueFalta
                    key={`${c.caminho}:${sugestoes[c.caminho] ?? ""}`}
                    campo={c}
                    editavel={editavel}
                    ocupado={ocupado}
                    valorInicial={sugestoes[c.caminho]}
                    t={t}
                    onPreencher={(valor) =>
                      executar(() => apiClient.patch(`/api/v1/proposals/${propostaId}/documento`, { campo: c.caminho, valor }))
                    }
                  />
                ))}
              </ul>
```

(troque só o `<ul>` de pendências existente por este; o `<p>{t("O que falta preencher:")}</p>` que já existia fica, só ganha o bloco do botão logo abaixo.)

- [ ] **Step 5: Traduções** — acrescente ao `DICIONARIO`:

```typescript
  "Preencher com a conversa": { es: "Completar con la conversación" },
  "Lendo a conversa…": { es: "Leyendo la conversación…" },
  "A conversa não respondeu nenhum dos campos que faltam.": {
    es: "La conversación no respondió ninguno de los campos que faltan.",
  },
```

Confira que `"A IA não está disponível agora."` já existe (`grep -n "A IA não está disponível agora" lib/i18n/dicionario.ts`); é a mesma chave que o `AssistantPanel` já usa.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run "app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx" tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: PASS

- [ ] **Step 7: Sabotar** — copie o componente, troque a `key` do `CampoQueFalta` de volta para `c.caminho` (sem a sugestão), rode o teste "pré-preenche a caixa": tem de falhar (o componente não remonta e a caixa continua vazia). Restaure da cópia.

- [ ] **Step 8: Gates**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 9: Commit**

```bash
git add "app/app/proposals/[id]/_components/DocumentoCanvas.tsx" "app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx" lib/i18n/dicionario.ts
git commit -m "feat(propostas): botao 'preencher com a conversa' pre-preenche os campos que faltam (P2)"
```

---

### Task 6: Fragmento e fechamento

- [ ] **Step 1** — crie `.changes/preencher-proposta-com-a-conversa.md`:

```markdown
---
impacto: capacidade_nova
secao: adicionado
titulo: A proposta pode ser preenchida a partir da conversa com o cliente
---

No editor da proposta, quando faltar preencher algo que o cliente já disse na conversa, o botão "Preencher com a conversa" lê o histórico e sugere um valor para cada campo em aberto. Nada é gravado sozinho: a sugestão aparece na caixa do campo, você revisa (e pode editar) e confirma clicando em "Preencher", como se tivesse digitado.
```

- [ ] **Step 2: Régua final**

```bash
npx vitest run lib/propostas "app/api/v1/proposals" "app/app/proposals" tests/unit/pontos-de-ia-completude.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/pacote-reserva-vaga-da-critica.test.ts > "$TMP/p2-depois.log" 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests " "$TMP/p2-depois.log" | tail -2
pnpm typecheck && pnpm lint && pnpm release:conferir
git add .changes/preencher-proposta-com-a-conversa.md
git commit -m "docs(release): fragmento do P2 da proposta"
```

`pacote-reserva-vaga-da-critica.test.ts` está na régua de propósito: este plano não deveria mexer no teto de ferramentas do agente (nenhuma tool nova) — se esse teste mudar de resultado, **pare e reporte**, algo saiu do previsto.

- [ ] **Step 3: Relatório para a sessão Claude** — commits, rodapés antes/depois, gates, as sabotagens (Tasks 1, 4, 5).

## Roteiro de prova na tela (para o dono)

1. Pedir orçamento no WhatsApp de teste, dizendo o segmento e um pouco do escopo, sem dizer tudo.
2. Abrir o rascunho: "O que falta preencher" mostra os campos vazios.
3. Clicar **Preencher com a conversa**: os campos que o cliente já respondeu aparecem preenchidos na caixa (não gravados).
4. Editar um deles e clicar **Preencher** em cada — o texto das seções muda.
5. Voltar ao WhatsApp de teste, o cliente responde mais um detalhe, clicar **Preencher com a conversa** de novo: só os campos que ainda faltam ganham sugestão nova.
6. **Erro de propósito:** clicar o botão numa proposta sem nenhum campo de briefing faltando (só falta prazo) — o botão nem aparece.

## Self-Review

- Spec Item 2 revisado: os 3 comportamentos do §0 (Task 1: sugere sem gravar; Task 4: só os campos que faltam; Task 5: a pessoa revisa e confirma). D5 (só o vazio — o filtro por `camposFaltando` já garante isso, herdado do P1), D6 (a trava continua sendo a revisão humana, não um filtro de conteúdo automático), D16 (nenhuma tool nova — Global Constraints), D17 (purpose registrado — Task 2), D18 (`orcamentoDeIaDisponivel` correto para múltiplos purposes — Task 3).
- Review Focus: as 5 linhas têm teste na tarefa que diz (Task 1, 2, 4, 5).
- Nenhuma tarefa toca `lib/mcp/tools/propostas.ts` nem o pacote de ferramentas do agente — a régua final roda `pacote-reserva-vaga-da-critica.test.ts` para provar.
