# Proposta P4A — quem revisa fica sabendo: Central, navegador e lista

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Fechar a parte 4A da spec: o aviso de proposta pronta para revisão passa a nomear a proposta e o cliente, a pesar como `warn`, a só se fechar quando a proposta está de fato pronta, a chegar como notificação do navegador a quem pode enviá-la, e o rascunho da IA aparece primeiro na lista.

**Architecture:** O aviso (`lib/propostas/aviso-de-revisao.ts`) continua sendo o único lugar que abre e fecha o item da Central. Ao abrir um item NOVO ele grava também o evento `proposal.ready_for_review` no `event_log`; o consumidor de notificação do navegador que já existe (`lib/notifications/push.handler.ts`) passa a consumir esse evento e entrega ao dono do negócio, se ele tiver papel `manager`+, ou a todos os `manager`+ da organização. O fechamento automático passa a usar o documento calculado num lugar só (P1), exigindo zero pendência.

**Tech Stack:** Supabase JS, `event_log` + dreno, `web-push`, React 19, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md`](../specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md) — §1.7, §2 Item 4A.

**Depende de:** P1 (`montarDocumentoDaProposta`).

## Como este plano é executado (opencode)

As mesmas regras do P1 (seção "Como este plano é executado"): worktree própria sobre a base que a sessão Claude indicar, medir antes de colar, só testes da tarefa + `typecheck` + `lint`, sabotagem com cópia em `$TMP`, um commit por tarefa, **não empurrar**.

## Global Constraints

- O `event_type` do evento é escrito como **literal** dentro do `.insert({ ... })`, antes de qualquer objeto aninhado: é assim que `tests/unit/evento-de-fato-nao-fica-pendente.test.ts` (regex `EMISSAO_INSERT`) enxerga a emissão e cobra consumidor.
- O evento só nasce quando um item NOVO é aberto na Central — nunca a cada `PATCH /documento` (campo preenchido à mão ou via P2 "Preencher com a conversa") sobre um aviso já aberto (senão cada campo preenchido vira uma notificação nova).
- Toda leitura com client admin filtra `organization_id` com o valor do evento, nunca do payload.
- Falha ao gravar o evento ou ao notificar **nunca** derruba o rascunho: o aviso é fire-and-forget, como já é hoje.
- Título e corpo do aviso vão para a Central como estão (ela não os traduz: `app/app/ai/inbox/_components/AgentInboxList.tsx:159-163` mostra `item.title`/`item.body` crus); só o rótulo do tipo passa por `t()`.
- Nome do cliente sai de `nomeDoContato` (`lib/contacts/rotulo-do-contato.ts`) — nunca de uma cadeia `name ?? display_name` remontada (há cerca contra a cópia).

## Review Focus

- **Organização sem nenhum `manager`/`admin` ativo** — a notificação é pulada com motivo `sem_destinatario`, sem erro. Task 2 testa.
- **Dono do negócio é `agent`** — ele não consegue enviar (a rota exige `manager`), então a notificação vai aos gestores. Task 2 testa.
- **Proposta enviada ou descartada antes de o dreno rodar** — a notificação é pulada (`proposta_fora_de_rascunho`). Task 2 testa.
- **Aviso com modelo e preço ok, mas campo do documento vazio** — não fecha sozinho. Task 1 testa.
- **Título de proposta enorme** — o título do aviso corta em 80 caracteres. Task 1 testa.

---

### Task 0: Worktree

- [ ] **Step 1**

```bash
cd "D:/PROJETOS VIBE CODING/DeskcommCRM"
git status --short
git worktree add "../deskcomm-proposta-p4a" -b feat/proposta-p4a-aviso <BASE-INFORMADA-PELA-SESSAO>
cd "../deskcomm-proposta-p4a" && pnpm install --frozen-lockfile
ls lib/propostas/documento/documento-da-proposta.ts   # P1 tem de estar na base
```

---

### Task 1: O aviso nomeia, pesa `warn`, emite o evento e só fecha quando pronto

**Files:**
- Modify (reescrita inteira): `lib/propostas/aviso-de-revisao.ts`
- Modify (reescrita inteira): `lib/propostas/aviso-de-revisao.test.ts`

**Interfaces:**
- Consumes: `montarDocumentoDaProposta` (P1), `nomeDoContato`.
- Produces:
  - `EVENTO_PROPOSTA_PRONTA_PARA_REVISAO = "proposal.ready_for_review"`
  - `tituloDoAviso(titulo: string | null, cliente: string | null): string`
  - `avisarQuePropostaPrecisaDeRevisao(...)` e `resolverAvisoDeRevisaoSeProntaOuEncerrada(...)` com a MESMA assinatura de hoje (os quatro chamadores não mudam).

- [ ] **Step 1: Reescrever o teste**

```typescript
// lib/propostas/aviso-de-revisao.test.ts
import { describe, expect, it } from "vitest";

import {
  EVENTO_PROPOSTA_PRONTA_PARA_REVISAO,
  avisarQuePropostaPrecisaDeRevisao,
  resolverAvisoDeRevisaoSeProntaOuEncerrada,
  tituloDoAviso,
} from "./aviso-de-revisao";

interface Opts {
  avisoAbertoExistente?: boolean;
  proposta?: Record<string, unknown> | null;
  contato?: { name: string | null; display_name: string | null } | null;
}

function montarSupabaseMock(opts: Opts) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.update = (patch: Record<string, unknown>) => {
      updates.push({ table, patch });
      return chain;
    };
    chain.insert = (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return chain;
    };
    chain.maybeSingle = async () => {
      if (table === "agent_inbox_items") return { data: opts.avisoAbertoExistente ? { id: "aviso-1" } : null, error: null };
      if (table === "crm_proposals") return { data: opts.proposta ?? null, error: null };
      if (table === "contacts") return { data: opts.contato ?? null, error: null };
      return { data: null, error: null };
    };
    return chain;
  };
  return { from, inserts, updates };
}

/** Proposta com o site institucional REAL do código e tudo preenchido. */
const PRONTA = {
  template_slug: "site_institucional",
  pricing_status: "catalog",
  secoes_editadas: null,
  briefing_json: {
    client: { name: "Maria", company: "Imobiliária Exemplo" },
    project: { name: "Site", objective: "gerar contatos" },
    scope: { pages_list: "Home, Contato" },
    included: { list: "Layout" },
    excluded: { list: "Hospedagem" },
  },
  total_cents: 100000,
  moeda: "BRL",
  prazo_dias_uteis: 30,
  valid_until: "2026-10-16",
  created_at: "2026-09-26T00:00:00.000Z",
  contact_id: null,
};

describe("tituloDoAviso", () => {
  it("nomeia a proposta e o cliente", () => {
    expect(tituloDoAviso("Site catálogo", "Maria")).toBe("Proposta «Site catálogo» de Maria está pronta para revisão");
  });
  it("sem cliente, só a proposta", () => {
    expect(tituloDoAviso("Site catálogo", null)).toBe("Proposta «Site catálogo» está pronta para revisão");
  });
  it("corta título enorme em 80 caracteres", () => {
    expect(tituloDoAviso("x".repeat(300), null)).toBe(`Proposta «${"x".repeat(80)}» está pronta para revisão`);
  });
});

describe("avisarQuePropostaPrecisaDeRevisao", () => {
  it("abre o aviso com warn e título nomeado, e emite o evento", async () => {
    const db = montarSupabaseMock({
      proposta: { titulo: "Site catálogo", lead_id: "lead-1", contact_id: "c-1" },
      contato: { name: "Maria", display_name: null },
    });
    await avisarQuePropostaPrecisaDeRevisao(db as never, "org-1", "prop-1");
    const aviso = db.inserts.find((i) => i.table === "agent_inbox_items")?.row;
    expect(aviso).toMatchObject({
      organization_id: "org-1",
      kind: "proposta_pronta_para_revisao",
      severity: "warn",
      title: "Proposta «Site catálogo» de Maria está pronta para revisão",
      ref_kind: "proposal",
      ref_id: "prop-1",
      status: "open",
    });
    const evento = db.inserts.find((i) => i.table === "event_log")?.row;
    expect(evento).toMatchObject({
      organization_id: "org-1",
      event_type: EVENTO_PROPOSTA_PRONTA_PARA_REVISAO,
      entity_kind: "proposal",
      entity_id: "prop-1",
      payload: { proposal_id: "prop-1", lead_id: "lead-1" },
    });
  });

  it("aviso já aberto: não insere de novo NEM emite evento (preencher campo de novo não reabre notificação)", async () => {
    const db = montarSupabaseMock({ avisoAbertoExistente: true });
    await avisarQuePropostaPrecisaDeRevisao(db as never, "org-1", "prop-1");
    expect(db.inserts).toEqual([]);
  });
});

describe("resolverAvisoDeRevisaoSeProntaOuEncerrada", () => {
  it("resolve quando modelo, preço E documento estão prontos", async () => {
    const db = montarSupabaseMock({ proposta: PRONTA });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toEqual([{ table: "agent_inbox_items", patch: { status: "resolved" } }]);
  });

  it("NÃO resolve com campo do documento vazio, mesmo com modelo e preço ok", async () => {
    const db = montarSupabaseMock({ proposta: { ...PRONTA, prazo_dias_uteis: null } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toEqual([]);
  });

  it("NÃO resolve sem modelo confirmado", async () => {
    const db = montarSupabaseMock({ proposta: { ...PRONTA, template_slug: null } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toEqual([]);
  });

  it("NÃO resolve com preço 'missing'", async () => {
    const db = montarSupabaseMock({ proposta: { ...PRONTA, pricing_status: "missing" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toEqual([]);
  });

  it("forcar: resolve sem ler a proposta", async () => {
    const db = montarSupabaseMock({ proposta: null });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1", { forcar: true });
    expect(db.updates).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/aviso-de-revisao.test.ts`
Expected: FAIL — `tituloDoAviso`/`EVENTO_PROPOSTA_PRONTA_PARA_REVISAO` não exportados; severidade `info`; resolve sem conferir o documento

- [ ] **Step 3: Reescrever o módulo**

```typescript
// lib/propostas/aviso-de-revisao.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { logger } from "@/lib/logger";
import { montarDocumentoDaProposta, type PropostaParaDocumento } from "./documento/documento-da-proposta";
import type { ContatoParaDocumento } from "./documento/montar-dados";

/**
 * Consumido por `lib/notifications/push.handler.ts`. O literal está repetido
 * dentro do `.insert` abaixo de propósito: é lá que a cerca de eventos o lê.
 */
export const EVENTO_PROPOSTA_PRONTA_PARA_REVISAO = "proposal.ready_for_review";

const TITULO_MAXIMO = 80;

export function tituloDoAviso(titulo: string | null, cliente: string | null): string {
  const nome = (titulo ?? "").trim().slice(0, TITULO_MAXIMO) || "sem título";
  return cliente ? `Proposta «${nome}» de ${cliente} está pronta para revisão` : `Proposta «${nome}» está pronta para revisão`;
}

async function contatoDaProposta(
  supabase: SupabaseClient,
  organizationId: string,
  contactId: string | null,
): Promise<ContatoParaDocumento | null> {
  if (!contactId) return null;
  const { data } = await supabase
    .from("contacts")
    .select("name, display_name")
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle();
  return (data as ContatoParaDocumento | null) ?? null;
}

/**
 * Abre o aviso "proposta pronta para revisão" na Central quando a IA
 * rascunha — e, SÓ quando abre um item novo, emite o evento que vira
 * notificação no navegador (P4A). Fire-and-forget: nada aqui derruba o
 * rascunho.
 */
export async function avisarQuePropostaPrecisaDeRevisao(
  supabase: SupabaseClient,
  organizationId: string,
  propostaId: string,
): Promise<void> {
  try {
    const { data: existente } = await supabase
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("kind", "proposta_pronta_para_revisao")
      .eq("ref_id", propostaId)
      .eq("status", "open")
      .maybeSingle();
    if (existente) return;

    const { data: linha } = await supabase
      .from("crm_proposals")
      .select("titulo, lead_id, contact_id")
      .eq("organization_id", organizationId)
      .eq("id", propostaId)
      .maybeSingle();
    const proposta = linha as { titulo: string | null; lead_id: string | null; contact_id: string | null } | null;
    const cliente = nomeDoContato(await contatoDaProposta(supabase, organizationId, proposta?.contact_id ?? null));

    const { error } = await supabase.from("agent_inbox_items").insert({
      organization_id: organizationId,
      kind: "proposta_pronta_para_revisao",
      severity: "warn",
      title: tituloDoAviso(proposta?.titulo ?? null, cliente),
      body: "A IA rascunhou esta proposta. Confirme o modelo, preencha o que falta no documento e confira os preços antes de enviar.",
      ref_kind: "proposal",
      ref_id: propostaId,
      status: "open",
    });
    if (error) {
      logger.error("[aviso-de-revisao] falha ao abrir aviso na Central", { error: error.message, propostaId });
      return;
    }

    const { error: erroDoEvento } = await supabase.from("event_log").insert({
      organization_id: organizationId,
      event_type: "proposal.ready_for_review",
      entity_kind: "proposal",
      entity_id: propostaId,
      payload: { proposal_id: propostaId, lead_id: proposta?.lead_id ?? null },
    });
    if (erroDoEvento) {
      logger.warn("[aviso-de-revisao] aviso aberto, mas o evento de notificação não foi gravado", {
        error: erroDoEvento.message,
        propostaId,
      });
    }
  } catch (e) {
    logger.error("[aviso-de-revisao] falha inesperada ao abrir aviso", { error: String(e), propostaId });
  }
}

/**
 * Fecha o aviso quando a proposta está DE FATO pronta — modelo confirmado,
 * preço definido e zero pendência no documento (P4A) — ou, com
 * `forcar: true`, incondicionalmente (enviada ou descartada).
 */
export async function resolverAvisoDeRevisaoSeProntaOuEncerrada(
  supabase: SupabaseClient,
  organizationId: string,
  propostaId: string,
  opts: { forcar?: boolean } = {},
): Promise<void> {
  try {
    if (!opts.forcar) {
      const { data } = await supabase
        .from("crm_proposals")
        .select(
          "template_slug, pricing_status, secoes_editadas, briefing_json, total_cents, moeda, prazo_dias_uteis, valid_until, created_at, contact_id",
        )
        .eq("organization_id", organizationId)
        .eq("id", propostaId)
        .maybeSingle();
      const proposta = data as (PropostaParaDocumento & { pricing_status: string; contact_id: string | null }) | null;
      if (!proposta || proposta.template_slug === null || proposta.pricing_status === "missing") return;

      const contato = await contatoDaProposta(supabase, organizationId, proposta.contact_id);
      const documento = await montarDocumentoDaProposta(supabase, organizationId, proposta, contato);
      if (!documento || documento.camposFaltando.length > 0) return;
    }

    const { error } = await supabase
      .from("agent_inbox_items")
      .update({ status: "resolved" })
      .eq("organization_id", organizationId)
      .eq("kind", "proposta_pronta_para_revisao")
      .eq("ref_id", propostaId)
      .eq("status", "open");
    if (error) {
      logger.error("[aviso-de-revisao] falha ao resolver aviso na Central", { error: error.message, propostaId });
    }
  } catch (e) {
    logger.error("[aviso-de-revisao] falha inesperada ao resolver aviso", { error: String(e), propostaId });
  }
}
```

- [ ] **Step 4: Rodar e ver passar** — inclui os chamadores, que mockam este módulo

Run: `npx vitest run lib/propostas/aviso-de-revisao.test.ts lib/mcp/tools/propostas.test.ts "app/api/v1/proposals"`
Expected: PASS

- [ ] **Step 5: Sabotar** — copie o arquivo, troque `if (!documento || documento.camposFaltando.length > 0) return;` por `if (!documento) return;`, rode: "NÃO resolve com campo do documento vazio" falha. Restaure da cópia.

- [ ] **Step 6: Commit**

```bash
git add lib/propostas/aviso-de-revisao.ts lib/propostas/aviso-de-revisao.test.ts
git commit -m "feat(propostas): aviso de revisão nomeia proposta e cliente, pesa warn e só fecha quando pronto (P4A)"
```

---

### Task 2: A notificação do navegador conhece a proposta

**Files:**
- Modify: `lib/notifications/push.handler.ts`
- Create: `lib/notifications/push-da-proposta.test.ts`

**Interfaces:**
- Consumes: `EVENTO_PROPOSTA_PRONTA_PARA_REVISAO` (Task 1); `enviarPushAoUsuario` (`./web_push`); `ROLE_RANK`, `Role` (`@/lib/auth/types`).
- Produces: `webPushInboundHandler.events` inclui `"proposal.ready_for_review"`.

- [ ] **Step 1: Escrever o teste**

```typescript
// lib/notifications/push-da-proposta.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const enviarPushAoUsuario = vi.hoisted(() => vi.fn(async () => ({ sent: 1, gone: 0 })));
const createAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/vapid", () => ({ vapidPronto: () => true }));
vi.mock("./web_push", () => ({ enviarPushAoUsuario, enviarPushDaOrg: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: vi.fn(async () => ({ nome: "X" })) }));

import { webPushInboundHandler } from "./push.handler";

const ORG = "org-1";

function mundo(opts: {
  proposta?: { titulo: string; lead_id: string | null; status: string } | null;
  dono?: string | null;
  membros?: Array<{ user_id: string; role: string }>;
}) {
  createAdminClient.mockReturnValue({
    from: (tabela: string) => {
      const cadeia: Record<string, unknown> = {};
      cadeia.select = () => cadeia;
      cadeia.eq = () => cadeia;
      cadeia.is = async () => ({ data: tabela === "user_organizations" ? opts.membros ?? [] : [], error: null });
      cadeia.maybeSingle = async () => {
        if (tabela === "crm_proposals") return { data: opts.proposta === undefined ? { titulo: "Site", lead_id: "lead-1", status: "rascunho" } : opts.proposta };
        if (tabela === "crm_leads") return { data: { title: "Negócio", owner_user_id: opts.dono ?? null, pipeline_id: null } };
        return { data: null };
      };
      return cadeia;
    },
  });
}

function evento() {
  return {
    id: "e1",
    organization_id: ORG,
    event_type: "proposal.ready_for_review",
    entity_kind: "proposal",
    entity_id: "prop-1",
    payload: { proposal_id: "prop-1", lead_id: "lead-1" },
    metadata: {},
    consumed_by: [],
    attempts: 0,
  };
}

beforeEach(() => {
  enviarPushAoUsuario.mockClear();
});

describe("notificação de proposta pronta para revisão", () => {
  it("o consumidor declara o evento (a cerca de eventos depende disto)", () => {
    expect(webPushInboundHandler.events).toContain("proposal.ready_for_review");
  });

  it("dono do negócio é gestor: só ele recebe, com link para a proposta", async () => {
    mundo({ dono: "u-dono", membros: [{ user_id: "u-dono", role: "manager" }, { user_id: "u-admin", role: "admin" }] });
    const r = await webPushInboundHandler.handle(evento() as never);
    expect(r.status).toBe("ok");
    expect(enviarPushAoUsuario).toHaveBeenCalledTimes(1);
    expect(enviarPushAoUsuario).toHaveBeenCalledWith(
      ORG,
      "u-dono",
      expect.objectContaining({ href: "/app/proposals/prop-1", tag: "proposal-review:prop-1" }),
    );
  });

  it("dono do negócio é agent: vão os gestores", async () => {
    mundo({ dono: "u-agente", membros: [{ user_id: "u-agente", role: "agent" }, { user_id: "u-g1", role: "manager" }, { user_id: "u-g2", role: "admin" }] });
    await webPushInboundHandler.handle(evento() as never);
    expect(enviarPushAoUsuario.mock.calls.map((c) => c[1])).toEqual(["u-g1", "u-g2"]);
  });

  it("organização sem gestor ativo: pula sem erro", async () => {
    mundo({ membros: [{ user_id: "u-agente", role: "agent" }] });
    const r = await webPushInboundHandler.handle(evento() as never);
    expect(r).toMatchObject({ status: "skipped", detail: "sem_destinatario" });
  });

  it("proposta que já saiu de rascunho: pula", async () => {
    mundo({ proposta: { titulo: "Site", lead_id: "lead-1", status: "enviada" }, membros: [{ user_id: "u-g1", role: "manager" }] });
    const r = await webPushInboundHandler.handle(evento() as never);
    expect(r).toMatchObject({ status: "skipped", detail: "proposta_fora_de_rascunho" });
    expect(enviarPushAoUsuario).not.toHaveBeenCalled();
  });
});
```

Medido ao escrever: `EventRow` (`lib/event-log/dispatcher.ts:17`) tem exatamente estes campos, com `created_at` opcional — o mesmo objeto que `lib/notifications/push.handler.test.ts` já passa.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/notifications/push-da-proposta.test.ts`
Expected: FAIL — o evento não está em `events` e cai no ramo de lead (`sem_lead` ou lead)

- [ ] **Step 3: Implementar** — em `lib/notifications/push.handler.ts`:

a) Imports e constante: acrescente o import

```typescript
import { ROLE_RANK, type Role } from "@/lib/auth/types";
```

e, logo depois de `export const WEB_PUSH_INBOUND_KEY = "web-push-inbound.v1";`, a constante LOCAL:

```typescript
/**
 * Espelho de EVENTO_PROPOSTA_PRONTA_PARA_REVISAO (lib/propostas/aviso-de-revisao.ts).
 * Não é importado de lá de propósito: aquele módulo arrasta o catálogo de
 * modelos, e o dreno carrega handlers por import dinâmico sob `tsx` — import
 * de topo pesado já parou o dreno por dez dias (#648). O teste prende os dois.
 */
const EVENTO_PROPOSTA_PRONTA_PARA_REVISAO = "proposal.ready_for_review";
```

b) Antes de `export const webPushInboundHandler`, acrescente:

```typescript
/**
 * Quem pode ENVIAR a proposta (a rota exige manager): o dono do negócio, se
 * ele for gestor; senão todos os gestores ativos da organização.
 */
async function destinatariosDaRevisao(organizationId: string, donoDoNegocio: string | null): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_organizations")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .is("revoked_at", null);
  const gestores = ((data ?? []) as Array<{ user_id: string; role: string }>)
    .filter((m) => Object.hasOwn(ROLE_RANK, m.role) && ROLE_RANK[m.role as Role] >= ROLE_RANK.manager)
    .map((m) => m.user_id);
  if (donoDoNegocio && gestores.includes(donoDoNegocio)) return [donoDoNegocio];
  return gestores;
}

async function handlePropostaParaRevisao(row: EventRow): Promise<HandlerResult> {
  const propostaId =
    (typeof row.payload.proposal_id === "string" ? row.payload.proposal_id : null) ??
    (typeof row.entity_id === "string" ? row.entity_id : null);
  if (!propostaId) return { consumer_key: WEB_PUSH_INBOUND_KEY, status: "skipped", detail: "sem_proposta" };

  const admin = createAdminClient();
  const { data } = await admin
    .from("crm_proposals")
    .select("titulo, lead_id, status")
    .eq("id", propostaId)
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  const proposta = data as { titulo: string | null; lead_id: string | null; status: string } | null;
  if (!proposta || proposta.status !== "rascunho") {
    return { consumer_key: WEB_PUSH_INBOUND_KEY, status: "skipped", detail: "proposta_fora_de_rascunho" };
  }

  const dono = proposta.lead_id ? (await leadBits(row.organization_id, proposta.lead_id)).ownerUserId : null;
  const destinatarios = await destinatariosDaRevisao(row.organization_id, dono);
  if (destinatarios.length === 0) {
    return { consumer_key: WEB_PUSH_INBOUND_KEY, status: "skipped", detail: "sem_destinatario" };
  }

  const payload: PushPayload = {
    title: "Proposta pronta para revisão",
    body: truncar(proposta.titulo?.trim() || "Rascunho criado pela IA"),
    tag: `proposal-review:${propostaId}`,
    href: `/app/proposals/${propostaId}`,
  };
  let enviados = 0;
  for (const userId of destinatarios) {
    enviados += (await enviarPushAoUsuario(row.organization_id, userId, payload)).sent;
  }
  return { consumer_key: WEB_PUSH_INBOUND_KEY, status: "ok", detail: `sent:${enviados}` };
}
```

c) Troque:
```typescript
  events: ["message.received", "lead.assigned", "lead.won", "lead.lost", "user.mentioned"],
```
por:
```typescript
  events: ["message.received", "lead.assigned", "lead.won", "lead.lost", "user.mentioned", EVENTO_PROPOSTA_PRONTA_PARA_REVISAO],
```

d) Logo depois de `if (row.event_type === "message.received") return handleInbound(row);`, acrescente:
```typescript
    if (row.event_type === EVENTO_PROPOSTA_PRONTA_PARA_REVISAO) return handlePropostaParaRevisao(row);
```

Meça antes de colar: `leadBits` e `truncar` já são usados neste arquivo (`grep -n "function leadBits\|truncar" lib/notifications/push.handler.ts`); `EventRow`, `HandlerResult` e `PushPayload` já estão importados (`grep -n "^import" lib/notifications/push.handler.ts`).

e) Acrescente ao teste do Step 1, dentro do `describe`, o caso que prende a constante local à do emissor:

```typescript
  it("a constante do consumidor é a mesma do emissor", async () => {
    const { EVENTO_PROPOSTA_PRONTA_PARA_REVISAO } = await import("@/lib/propostas/aviso-de-revisao");
    expect(webPushInboundHandler.events).toContain(EVENTO_PROPOSTA_PRONTA_PARA_REVISAO);
  });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/notifications/ tests/unit/evento-de-fato-nao-fica-pendente.test.ts tests/unit/evento-comando-tem-consumidor.test.ts`
Expected: PASS — a cerca de eventos agora acha a emissão (Task 1) E o consumidor (esta tarefa)

- [ ] **Step 5: Sabotar a cerca** — copie `push.handler.ts`, tire o evento da lista `events`, rode `tests/unit/evento-de-fato-nao-fica-pendente.test.ts`: tem de falhar apontando `proposal.ready_for_review` como órfão. Restaure da cópia.

- [ ] **Step 6: Commit**

```bash
git add lib/notifications/push.handler.ts lib/notifications/push-da-proposta.test.ts
git commit -m "feat(propostas): notificação do navegador quando a IA rascunha uma proposta (P4A)"
```

---

### Task 3: O rascunho da IA aparece primeiro, marcado

**Files:**
- Modify: `app/api/v1/proposals/route.ts`
- Modify: `app/app/proposals/_client.tsx`
- Create: `app/app/proposals/_client.test.tsx`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Produces: `GET /api/v1/proposals` devolve também `drafted_by_agent_id`; a tela ordena "rascunho da IA" primeiro e o marca "Aguardando revisão".

- [ ] **Step 1: Teste**

```tsx
// app/app/proposals/_client.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { ProposalsClient } from "./_client";

const base = { total_cents: 0, moeda: "BRL", numero: null, ano: null, versao: 1 };

describe("lista de propostas", () => {
  it("rascunho da IA vem primeiro e diz que aguarda revisão", async () => {
    get.mockResolvedValue({
      data: [
        { ...base, id: "a", titulo: "Enviada antiga", status: "enviada", drafted_by_agent_id: null, created_at: "2026-09-27T00:00:00Z" },
        { ...base, id: "b", titulo: "Da IA", status: "rascunho", drafted_by_agent_id: "ag-1", created_at: "2026-09-20T00:00:00Z" },
        { ...base, id: "c", titulo: "Manual", status: "rascunho", drafted_by_agent_id: null, created_at: "2026-09-26T00:00:00Z" },
      ],
    });
    render(<ProposalsClient podeCriar={false} />);
    await waitFor(() => expect(screen.getByText("Da IA")).toBeInTheDocument());
    const titulos = screen.getAllByRole("link").map((l) => l.textContent);
    expect(titulos.indexOf("Da IA")).toBeLessThan(titulos.indexOf("Enviada antiga"));
    expect(screen.getByText("Aguardando revisão")).toBeInTheDocument();
    expect(screen.getAllByText("Aguardando revisão")).toHaveLength(1);
  });
});
```

Medido ao escrever: o único outro link da tela é "Nova proposta", e ele só aparece com `podeCriar` (`app/app/proposals/_client.tsx:69-73`); com `podeCriar={false}` os links são só os títulos.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run app/app/proposals/_client.test.tsx`
Expected: FAIL — ordem por data e sem "Aguardando revisão"

- [ ] **Step 3: Implementar**

Em `app/api/v1/proposals/route.ts`, troque:
```typescript
    .select("id, lead_id, titulo, status, total_cents, moeda, numero, ano, versao, valid_until, created_at")
```
por:
```typescript
    .select("id, lead_id, titulo, status, total_cents, moeda, numero, ano, versao, valid_until, created_at, drafted_by_agent_id")
```

Em `app/app/proposals/_client.tsx`:

1. Na `interface PropostaResumo`, acrescente `drafted_by_agent_id: string | null;`.
2. Troque `if (!controller.signal.aborted) setPropostas(res.data);` por:
```tsx
        if (!controller.signal.aborted) setPropostas(ordenarParaRevisao(res.data));
```
3. Antes de `export function ProposalsClient`, acrescente:
```tsx
function aguardaRevisao(p: PropostaResumo): boolean {
  return p.status === "rascunho" && p.drafted_by_agent_id !== null;
}

/** Rascunho da IA primeiro — é o que espera uma decisão; o resto na ordem da rota (mais novo primeiro). */
function ordenarParaRevisao(lista: PropostaResumo[]): PropostaResumo[] {
  return [...lista.filter(aguardaRevisao), ...lista.filter((p) => !aguardaRevisao(p))];
}
```
4. Troque a célula de status:
```tsx
                  <td className="p-3">{statusLabels[p.status]}</td>
```
por:
```tsx
                  <td className="p-3">
                    {aguardaRevisao(p) ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        {t("Aguardando revisão")}
                      </span>
                    ) : (
                      statusLabels[p.status]
                    )}
                  </td>
```

Tradução (confira com `grep` antes): `"Aguardando revisão": { es: "Esperando revisión" },`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run app/app/proposals/_client.test.tsx app/api/v1/proposals/route.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: PASS

- [ ] **Step 5: Gates e commit**

```bash
pnpm typecheck && pnpm lint
git add app/api/v1/proposals/route.ts app/app/proposals/_client.tsx app/app/proposals/_client.test.tsx lib/i18n/dicionario.ts
git commit -m "feat(propostas): rascunho da IA aparece primeiro na lista, marcado 'Aguardando revisão' (P4A)"
```

---

### Task 4: Fragmento e fechamento

- [ ] **Step 1** — crie `.changes/proposta-pronta-para-revisao-avisa-de-verdade.md`:

```markdown
---
impacto: capacidade_nova
secao: adicionado
titulo: Proposta rascunhada pela IA avisa quem precisa revisá-la
---

Quando o assistente rascunha uma proposta, o aviso na Central passa a dizer qual proposta e de qual cliente, com peso de atenção, e só sai de lá quando a proposta está de fato pronta — modelo confirmado, preços definidos e nenhum campo do documento vazio. Quem pode enviar a proposta também recebe uma notificação no navegador (é preciso ter permitido notificações uma vez). Na lista de propostas, o rascunho da IA aparece primeiro, marcado "Aguardando revisão".
```

- [ ] **Step 2**

```bash
pnpm release:conferir
npx vitest run lib/propostas lib/notifications "app/api/v1/proposals" "app/app/proposals" tests/unit/evento-de-fato-nao-fica-pendente.test.ts > "$TMP/p4a-depois.log" 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " "$TMP/p4a-depois.log" | tail -3
pnpm typecheck && pnpm lint
git add .changes/proposta-pronta-para-revisao-avisa-de-verdade.md
git commit -m "docs(release): fragmento do P4A da proposta"
```

- [ ] **Step 3: Relatório para a sessão Claude** — commits, rodapés, gates, as duas sabotagens. **Não empurre.**

## Roteiro de prova na tela (para o dono)

1. No navegador do CRM, permita notificações (sino do topo / preferências de notificação).
2. Provoque um rascunho pela conversa no WhatsApp de teste.
3. Confira: a notificação do navegador chega; o sino mostra 1; a Central mostra "Proposta «…» de <cliente> está pronta para revisão", em amarelo; a lista de propostas mostra o rascunho no topo com "Aguardando revisão".
4. Preencha tudo e confirme modelo e preços: o aviso sai da Central.
5. **Erro de propósito:** preencha tudo menos o prazo — o aviso continua aberto.

## Self-Review

- Spec 4A: comportamentos 1 (Task 1), 2 (Task 1), 3 (Tasks 1 e 2), 4 (Task 3). Review Focus coberto nas Tasks 1 e 2.
- A cerca de eventos é satisfeita pelos dois lados: emissão literal (Task 1) e consumidor registrado (Task 2); a sabotagem da Task 2 prova que ela vigia.
- O consumidor não importa o módulo do aviso (risco medido do dreno sob `tsx`); o teste prende as duas constantes juntas.
