# Proposta P4B — aviso no WhatsApp da equipe quando a IA rascunha

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Fechar a parte 4B da spec: onde o "Aviso no WhatsApp" já está configurado e ligado, o rascunho da IA vira uma mensagem ao número da equipe, com a chave de ligar/desligar em Configurações › Propostas.

**Architecture:** Um segundo consumidor do evento `proposal.ready_for_review` (emitido pelo P4A). A regra é uma função pura (`lib/propostas/aviso-no-whatsapp.ts`) com dependências injetadas, no mesmo desenho do aviso de caso (`lib/escalacao/aviso-ao-suporte.ts`), e reusando dele o que já é exportado: a leitura da configuração e do canal (`createSupabaseAvisoDb`), o transporte (`criarTransporteDoAviso`), o espaçamento anti-bloqueio (`criarPacingDoCanal`), a checagem de endereço público (`urlPublicaUsavel`) e o primeiro nome (`primeiroNome`). Sem tabela nova (D12 da spec): a baixa do evento é a trava contra envio em dobro. A chave mora em `organizations.settings.proposals.avisar_no_whatsapp`, gravada pela rota de configurações de propostas que já mescla o jsonb com segurança.

**Tech Stack:** `event_log` + dreno, Supabase JS, Zod, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md`](../specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md) — §1.7, §2 Item 4B; decisões D7 e D12.

**Depende de:** P4A (o evento `proposal.ready_for_review` e o aviso da Central).

## Como este plano é executado (opencode)

As mesmas regras do P1 (seção "Como este plano é executado"): worktree própria sobre a base que a sessão Claude indicar, medir antes de colar, só testes da tarefa + `typecheck` + `lint`, sabotagem com cópia em `$TMP`, um commit por tarefa, **não empurrar**.

## Global Constraints

- **Nada de tabela, coluna, migration ou função de banco** neste plano (D12). Se alguma tarefa parecer exigir, pare e reporte.
- A janela de horário **não** se aplica (o destinatário é a equipe, não o cliente — a mesma decisão do aviso de caso, escrita no cabeçalho de `aviso-ao-suporte.ts`); espaçamento e teto diário **se aplicam**, e o envio **conta** no `pacing_ledger`.
- Imports de topo leves: o dreno carrega consumidores sob `tsx` e `tests/unit/drain-loop-carrega-deps-sob-tsx.test.ts` vigia isso. O consumidor de produção importa só o que o `aviso-ao-suporte.handler.ts` já importa, mais o módulo puro deste plano.
- O texto nunca é guardado; a auditoria leva só ids e contagens — nunca o telefone (use `mascara`) nem o nome do cliente.
- A regra devolve só `ok`, `skipped` ou `retry`; `error` sai apenas do `catch` do consumidor, para defeito de programa (mesma disciplina do aviso de caso).
- Todo texto que sai por `traduzir(...)` ganha entrada em espanhol (a cerca de espanhol varre `lib/`).

## Review Focus

- **Organização que nunca configurou o Aviso no WhatsApp** (o caso da organização do teste de 26/09) — pula em `sem_configuracao`, com duas leituras e zero rede. Task 2 testa.
- **Chave desligada em Configurações › Propostas** — pula antes de ler a configuração do aviso. Task 2 testa.
- **Proposta enviada ou descartada antes do dreno** — não envia. Task 2 testa.
- **Canal desconectado** — tenta de novo em 5 min até 6 tentativas; depois desiste e audita a falha. Task 2 testa.
- **Dreno rodando dentro de uma requisição** — adia 15 s sem tocar a rede (o atalho de desenvolvimento roda o dreno dentro do webhook). Task 2 testa.

---

### Task 0: Worktree

- [ ] **Step 1**

```bash
cd "D:/PROJETOS VIBE CODING/DeskcommCRM"
git status --short
git worktree add "../deskcomm-proposta-p4b" -b feat/proposta-p4b-whatsapp <BASE-INFORMADA-PELA-SESSAO>
cd "../deskcomm-proposta-p4b" && pnpm install --frozen-lockfile
grep -n "proposal.ready_for_review" lib/propostas/aviso-de-revisao.ts   # o P4A tem de estar na base
```

---

### Task 1: A chave em Configurações › Propostas

**Files:**
- Modify: `lib/propostas/padroes-da-organizacao.ts`
- Modify: `lib/propostas/padroes-da-organizacao.test.ts`
- Modify: `app/api/v1/settings/proposals/route.ts`
- Modify: `app/app/settings/tenant/proposals/_client.tsx`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Produces: `PadroesDaProposta.avisarNoWhatsApp: boolean` (ausente no jsonb = `true`); a rota aceita `avisar_no_whatsapp?: boolean`.

- [ ] **Step 1: Teste** — acrescente ao fim de `lib/propostas/padroes-da-organizacao.test.ts`:

```typescript
describe("avisar no WhatsApp (P4B)", () => {
  it("ausente = ligado (quem configurou o Aviso no WhatsApp já escolheu receber)", () => {
    expect(resolverPadroesDaProposta({ proposals: {} }).avisarNoWhatsApp).toBe(true);
    expect(resolverPadroesDaProposta(null).avisarNoWhatsApp).toBe(true);
  });
  it("false explícito desliga", () => {
    expect(resolverPadroesDaProposta({ proposals: { avisar_no_whatsapp: false } }).avisarNoWhatsApp).toBe(false);
  });
});
```

Confira o import no topo do arquivo de teste: `resolverPadroesDaProposta` tem de estar importado (`grep -n "import" lib/propostas/padroes-da-organizacao.test.ts`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/padroes-da-organizacao.test.ts`
Expected: FAIL — `avisarNoWhatsApp` undefined

- [ ] **Step 3: Implementar**

Em `lib/propostas/padroes-da-organizacao.ts`:

```typescript
export interface PadroesDaProposta {
  defaultValidDays: number;
  defaultConditions: string | null;
  followupDias: number;
}
```
vira
```typescript
export interface PadroesDaProposta {
  defaultValidDays: number;
  defaultConditions: string | null;
  followupDias: number;
  /** P4B — ausente = ligado; só `false` explícito desliga. */
  avisarNoWhatsApp: boolean;
}
```
e no `return` de `resolverPadroesDaProposta`, depois de `followupDias: ...,`, acrescente:
```typescript
    avisarNoWhatsApp: propostas?.avisar_no_whatsapp !== false,
```

Em `app/api/v1/settings/proposals/route.ts`, troque:
```typescript
  followup_dias: z.number().int().positive().max(365).optional(),
});
```
por:
```typescript
  followup_dias: z.number().int().positive().max(365).optional(),
  avisar_no_whatsapp: z.boolean().optional(),
});
```
e no `GET`, troque:
```typescript
  const proposals = { followup_dias: 3, ...(propostasGravadas ?? { enabled: false, default_valid_days: 15, default_conditions: null }) };
```
por:
```typescript
  const proposals = {
    followup_dias: 3,
    avisar_no_whatsapp: true,
    ...(propostasGravadas ?? { enabled: false, default_valid_days: 15, default_conditions: null }),
  };
```

Em `app/app/settings/tenant/proposals/_client.tsx`:
1. `interface Config { enabled: boolean; default_valid_days: number; default_conditions: string | null }` vira `interface Config { enabled: boolean; default_valid_days: number; default_conditions: string | null; avisar_no_whatsapp?: boolean }`.
2. Logo antes do `<Button onClick={salvar} ...>`, acrescente:

```tsx
      <div className="flex items-start gap-2">
        <Switch
          id="proposals_avisar_whatsapp"
          checked={cfg.avisar_no_whatsapp !== false}
          onCheckedChange={(v) => setCfg({ ...cfg, avisar_no_whatsapp: v })}
        />
        <div className="space-y-1">
          <Label htmlFor="proposals_avisar_whatsapp">
            {t("Avisar no WhatsApp da equipe quando a IA rascunhar uma proposta")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("Usa o número configurado em Aviso no WhatsApp. Sem ele configurado e ligado, nada é enviado.")}
          </p>
        </div>
      </div>
```

Traduções (confira antes com `grep`):
```typescript
  "Avisar no WhatsApp da equipe quando a IA rascunhar uma proposta": {
    es: "Avisar en el WhatsApp del equipo cuando la IA redacte una propuesta",
  },
  "Usa o número configurado em Aviso no WhatsApp. Sem ele configurado e ligado, nada é enviado.": {
    es: "Usa el número configurado en Aviso en WhatsApp. Sin él configurado y activado, no se envía nada.",
  },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/padroes-da-organizacao.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/padroes-da-organizacao.ts lib/propostas/padroes-da-organizacao.test.ts app/api/v1/settings/proposals/route.ts "app/app/settings/tenant/proposals/_client.tsx" lib/i18n/dicionario.ts
git commit -m "feat(propostas): chave de aviso no WhatsApp da equipe nas configurações de propostas (P4B)"
```

---

### Task 2: A regra do aviso de proposta, pura

**Files:**
- Create: `lib/propostas/aviso-no-whatsapp.ts`
- Create: `lib/propostas/aviso-no-whatsapp.test.ts`
- Modify: `lib/audit/actions.ts`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes (tipos de `@/lib/escalacao/aviso-ao-suporte`): `ConfigDoAviso`, `CanalDoAviso`, `TransporteDoAviso`, `PacingDoAviso`, `IDADE_MAXIMA_DO_EVENTO_MS`, `TETO_DE_TENTATIVAS_DO_CANAL`, `TETO_DE_TENTATIVAS_DE_ENVIO`, `ADIAMENTO_DO_CANAL_MS`, `ADIAMENTO_DO_DRENO_EM_REQUEST_MS`, `mascara`; `urlPublicaUsavel` (`@/lib/escalacao/url-publica`); `primeiroNome` (`@/lib/escalacao/texto-do-aviso`); `EventRow` (`@/lib/event-log/dispatcher`); `traduzir`, `Idioma`.
- Produces:
  - `EVENTO_PROPOSTA_PRONTA = "proposal.ready_for_review"`
  - `interface AvisoDePropostaDb { preferencia(orgId): Promise<boolean>; carregaConfig(orgId): Promise<ConfigDoAviso | null>; carregaProposta(orgId, id): Promise<{ titulo: string | null; status: string; contact_id: string | null } | null>; avisoAberto(orgId, id): Promise<boolean>; nomeDoContato(orgId, contactId): Promise<string | null>; carregaCanal(orgId, canalId): Promise<CanalDoAviso | null>; registraJidDoAviso(orgId, jid): Promise<void>; marcaDaOrganizacao(orgId): Promise<{ nome: string; idioma: Idioma }> }`
  - `interface AvisoDePropostaDeps { db; transporte; pacing; clock; urlPublica; origemDoDreno; audita }`
  - `montarAvisoDeProposta(e: { marca: string; idioma: Idioma; titulo: string | null; cliente: string | null; link: string }): string`
  - `aplicaAvisoDeProposta(deps, row: EventRow): Promise<{ status: "ok" | "skipped" | "retry"; detail: string; retry_at?: string }>`

- [ ] **Step 1: Auditoria** — em `lib/audit/actions.ts`, depois de `"proposal.recovered_from_stuck",`, acrescente:

```typescript
  // P4B — aviso ao número da equipe quando a IA rascunha (sem tabela de
  // entrega: a baixa do evento é a trava). Metadata leva ids e o destino MASCARADO.
  "proposal.aviso_whatsapp_enviado",
  "proposal.aviso_whatsapp_falhou",
```

- [ ] **Step 2: Escrever o teste**

```typescript
// lib/propostas/aviso-no-whatsapp.test.ts
import { describe, expect, it, vi } from "vitest";

import { aplicaAvisoDeProposta, montarAvisoDeProposta, type AvisoDePropostaDeps } from "./aviso-no-whatsapp";

const AGORA = new Date("2026-09-26T12:00:00.000Z");

function evento(over: Record<string, unknown> = {}) {
  return {
    id: "e1",
    organization_id: "org-1",
    event_type: "proposal.ready_for_review",
    entity_kind: "proposal",
    entity_id: "prop-1",
    payload: { proposal_id: "prop-1", lead_id: "lead-1" },
    metadata: {},
    consumed_by: [],
    attempts: 0,
    created_at: "2026-09-26T11:59:00.000Z",
    ...over,
  } as never;
}

function deps(over: Partial<{
  preferencia: boolean;
  config: unknown;
  proposta: unknown;
  avisoAberto: boolean;
  canal: unknown;
  urlPublica: string;
  origem: "worker" | "request";
  pacing: unknown;
  enviaFalha: boolean;
}> = {}) {
  const envia = vi.fn(async () => {
    if (over.enviaFalha) throw new Error("recusado");
    return { externalId: "ext-1" };
  });
  const audita = vi.fn();
  const registraEnvio = vi.fn(async () => undefined);
  const d: AvisoDePropostaDeps = {
    db: {
      preferencia: async () => over.preferencia ?? true,
      carregaConfig: async () =>
        (over.config === undefined
          ? { organization_id: "org-1", channel_session_id: "canal-1", telefone_destino: "+5511999990000", destino_jid: null, ligado: true }
          : over.config) as never,
      carregaProposta: async () =>
        (over.proposta === undefined ? { titulo: "Site catálogo", status: "rascunho", contact_id: "c-1" } : over.proposta) as never,
      avisoAberto: async () => over.avisoAberto ?? true,
      nomeDoContato: async () => "Maria Silva",
      carregaCanal: async () =>
        (over.canal === undefined ? { id: "canal-1", status: "WORKING", archived_at: null, aceitaMensagemLivre: true } : over.canal) as never,
      registraJidDoAviso: async () => undefined,
      marcaDaOrganizacao: async () => ({ nome: "Acme", idioma: "pt-BR" as const }),
    },
    transporte: {
      configurado: async () => true,
      resolveDestino: async () => "5511999990000@c.us",
      envia,
    },
    pacing: {
      decide: async () => (over.pacing ?? { liberado: true }) as never,
      registraEnvio,
    },
    clock: () => AGORA,
    urlPublica: over.urlPublica ?? "https://crm.exemplo.com.br",
    origemDoDreno: () => over.origem ?? "worker",
    audita,
  };
  return { d, envia, audita, registraEnvio };
}

describe("montarAvisoDeProposta", () => {
  it("marca, título, primeiro nome e link", () => {
    const texto = montarAvisoDeProposta({ marca: "Acme", idioma: "pt-BR", titulo: "Site catálogo", cliente: "Maria Silva", link: "https://x/app/proposals/p" });
    expect(texto).toContain("Acme");
    expect(texto).toContain("Site catálogo");
    expect(texto).toContain("Maria");
    expect(texto).not.toContain("Silva");
    expect(texto).toContain("https://x/app/proposals/p");
  });
});

describe("aplicaAvisoDeProposta", () => {
  it("caminho feliz: envia ao número da equipe, conta no pacing e audita com destino mascarado", async () => {
    const { d, envia, audita, registraEnvio } = deps();
    const r = await aplicaAvisoDeProposta(d, evento());
    expect(r.status).toBe("ok");
    expect(envia).toHaveBeenCalledWith("org-1", expect.anything(), "5511999990000@c.us", expect.stringContaining("/app/proposals/prop-1"));
    expect(registraEnvio).toHaveBeenCalled();
    expect(audita).toHaveBeenCalledWith(
      expect.objectContaining({ action: "proposal.aviso_whatsapp_enviado", metadata: expect.objectContaining({ destino_mascarado: "••••0000" }) }),
    );
  });

  it("organização sem Aviso no WhatsApp configurado: pula sem rede", async () => {
    const { d, envia } = deps({ config: null });
    expect(await aplicaAvisoDeProposta(d, evento())).toMatchObject({ status: "skipped", detail: "sem_configuracao" });
    expect(envia).not.toHaveBeenCalled();
  });

  it("aviso configurado mas desligado: pula", async () => {
    const { d } = deps({ config: { organization_id: "org-1", channel_session_id: "canal-1", telefone_destino: "+55", destino_jid: null, ligado: false } });
    expect((await aplicaAvisoDeProposta(d, evento())).detail).toBe("sem_configuracao");
  });

  it("chave desligada em Configurações › Propostas: pula", async () => {
    const { d, envia } = deps({ preferencia: false });
    expect((await aplicaAvisoDeProposta(d, evento())).detail).toBe("desligado_em_propostas");
    expect(envia).not.toHaveBeenCalled();
  });

  it("proposta que saiu de rascunho: não envia", async () => {
    const { d, envia } = deps({ proposta: { titulo: "x", status: "enviada", contact_id: null } });
    expect((await aplicaAvisoDeProposta(d, evento())).detail).toBe("proposta_fora_de_rascunho");
    expect(envia).not.toHaveBeenCalled();
  });

  it("aviso da Central já resolvido: não envia", async () => {
    const { d, envia } = deps({ avisoAberto: false });
    expect((await aplicaAvisoDeProposta(d, evento())).detail).toBe("aviso_ja_resolvido");
    expect(envia).not.toHaveBeenCalled();
  });

  it("evento com mais de 30 minutos: não envia", async () => {
    const { d, envia } = deps();
    const r = await aplicaAvisoDeProposta(d, evento({ created_at: "2026-09-26T11:00:00.000Z" }));
    expect(r.detail).toBe("evento_velho");
    expect(envia).not.toHaveBeenCalled();
  });

  it("dreno dentro de requisição: adia sem tocar a rede", async () => {
    const { d, envia } = deps({ origem: "request" });
    expect((await aplicaAvisoDeProposta(d, evento())).status).toBe("retry");
    expect(envia).not.toHaveBeenCalled();
  });

  it("canal desconectado: tenta de novo; na 6ª tentativa desiste e audita a falha", async () => {
    const canal = { id: "canal-1", status: "STOPPED", archived_at: null, aceitaMensagemLivre: true };
    const primeira = deps({ canal });
    expect((await aplicaAvisoDeProposta(primeira.d, evento())).status).toBe("retry");
    const ultima = deps({ canal });
    const r = await aplicaAvisoDeProposta(ultima.d, evento({ attempts: 5 }));
    expect(r).toMatchObject({ status: "skipped", detail: "canal_desconectado" });
    expect(ultima.audita).toHaveBeenCalledWith(expect.objectContaining({ action: "proposal.aviso_whatsapp_falhou" }));
  });

  it("espaçamento anti-bloqueio: tenta de novo quando o pacing libera", async () => {
    const liberaEm = new Date("2026-09-26T12:00:07.000Z");
    const { d, envia } = deps({ pacing: { liberado: false, motivo: "espacamento", liberaEm } });
    expect(await aplicaAvisoDeProposta(d, evento())).toMatchObject({ status: "retry", retry_at: liberaEm.toISOString() });
    expect(envia).not.toHaveBeenCalled();
  });

  it("envio recusado: tenta de novo; na 3ª desiste e audita", async () => {
    expect((await aplicaAvisoDeProposta(deps({ enviaFalha: true }).d, evento())).status).toBe("retry");
    const ultima = deps({ enviaFalha: true });
    expect((await aplicaAvisoDeProposta(ultima.d, evento({ attempts: 2 }))).status).toBe("skipped");
    expect(ultima.audita).toHaveBeenCalledWith(expect.objectContaining({ action: "proposal.aviso_whatsapp_falhou" }));
  });

  it("instalação sem endereço público: não envia link que não abre", async () => {
    const { d, envia } = deps({ urlPublica: "http://localhost:3000" });
    expect((await aplicaAvisoDeProposta(d, evento())).detail).toBe("sem_endereco_publico");
    expect(envia).not.toHaveBeenCalled();
  });
});
```

Medido ao escrever: `urlPublicaUsavel("http://localhost:3000")` é `false` (`hostPrivado` recusa `localhost`, `lib/escalacao/url-publica.ts:38`), e `mascara("+5511999990000")` devolve `"••••0000"` (`lib/escalacao/aviso-ao-suporte.ts:571-574`).

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/aviso-no-whatsapp.test.ts`
Expected: FAIL — `Cannot find module './aviso-no-whatsapp'`

- [ ] **Step 4: Implementar**

```typescript
// lib/propostas/aviso-no-whatsapp.ts
/**
 * P4B — o rascunho da IA vira mensagem ao número da EQUIPE, onde o "Aviso no
 * WhatsApp" está configurado. Mesmo desenho do aviso de caso
 * (`lib/escalacao/aviso-ao-suporte.ts`): regra pura, dependências injetadas,
 * nunca devolve `error`.
 *
 * Sem tabela de entrega (D12 da spec de 26/09): a baixa do evento é a trava.
 * Uma queda exatamente entre o envio e a baixa pode repetir o aviso — para a
 * equipe, nunca para o cliente.
 */
import type { EventRow } from "@/lib/event-log/dispatcher";
import {
  ADIAMENTO_DO_CANAL_MS,
  ADIAMENTO_DO_DRENO_EM_REQUEST_MS,
  IDADE_MAXIMA_DO_EVENTO_MS,
  TETO_DE_TENTATIVAS_DE_ENVIO,
  TETO_DE_TENTATIVAS_DO_CANAL,
  mascara,
  type CanalDoAviso,
  type ConfigDoAviso,
  type PacingDoAviso,
  type TransporteDoAviso,
} from "@/lib/escalacao/aviso-ao-suporte";
import { primeiroNome } from "@/lib/escalacao/texto-do-aviso";
import { urlPublicaUsavel } from "@/lib/escalacao/url-publica";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export const EVENTO_PROPOSTA_PRONTA = "proposal.ready_for_review";

export interface AvisoDePropostaDb {
  preferencia(orgId: string): Promise<boolean>;
  carregaConfig(orgId: string): Promise<ConfigDoAviso | null>;
  carregaProposta(orgId: string, propostaId: string): Promise<{ titulo: string | null; status: string; contact_id: string | null } | null>;
  avisoAberto(orgId: string, propostaId: string): Promise<boolean>;
  nomeDoContato(orgId: string, contactId: string): Promise<string | null>;
  carregaCanal(orgId: string, channelSessionId: string): Promise<CanalDoAviso | null>;
  registraJidDoAviso(orgId: string, jid: string): Promise<void>;
  marcaDaOrganizacao(orgId: string): Promise<{ nome: string; idioma: Idioma }>;
}

export interface AvisoDePropostaDeps {
  db: AvisoDePropostaDb;
  transporte: TransporteDoAviso;
  pacing: PacingDoAviso;
  clock: () => Date;
  urlPublica: string;
  origemDoDreno: () => "worker" | "request";
  audita: (entrada: {
    action: "proposal.aviso_whatsapp_enviado" | "proposal.aviso_whatsapp_falhou";
    organizationId: string;
    propostaId: string;
    metadata: Record<string, unknown>;
  }) => void;
}

export interface DesfechoDoAvisoDeProposta {
  status: "ok" | "skipped" | "retry";
  detail: string;
  retry_at?: string;
}

const skipped = (detail: string): DesfechoDoAvisoDeProposta => ({ status: "skipped", detail });
const retry = (quando: Date, detail: string): DesfechoDoAvisoDeProposta => ({ status: "retry", detail, retry_at: quando.toISOString() });

export function linkDaProposta(base: string, propostaId: string): string {
  return `${base.replace(/\/+$/, "")}/app/proposals/${propostaId}`;
}

export function montarAvisoDeProposta(e: { marca: string; idioma: Idioma; titulo: string | null; cliente: string | null; link: string }): string {
  const t = (texto: string): string => traduzir(texto, e.idioma);
  const linhas = [`📄 ${e.marca}: ${t("a IA rascunhou uma proposta")}`, ""];
  const titulo = (e.titulo ?? "").trim().slice(0, 80);
  if (titulo) linhas.push(`${t("Proposta")}: ${titulo}`);
  const cliente = primeiroNome(e.cliente);
  if (cliente) linhas.push(`${t("Cliente")}: ${cliente}`);
  linhas.push("", `${t("Revisar e enviar")}: ${e.link}`, "");
  linhas.push(t("Responder aqui não chega ao cliente — abra o link para revisar."));
  return linhas.join("\n");
}

function passouDoTeto(row: EventRow, agora: Date): boolean {
  if (!row.created_at) return false;
  const emitido = Date.parse(row.created_at);
  return !Number.isNaN(emitido) && agora.getTime() - emitido > IDADE_MAXIMA_DO_EVENTO_MS;
}

export async function aplicaAvisoDeProposta(deps: AvisoDePropostaDeps, row: EventRow): Promise<DesfechoDoAvisoDeProposta> {
  if (row.event_type !== EVENTO_PROPOSTA_PRONTA) return skipped("evento_ignorado");
  const agora = deps.clock();
  const orgId = row.organization_id;

  if (deps.origemDoDreno() === "request") {
    return retry(new Date(agora.getTime() + ADIAMENTO_DO_DRENO_EM_REQUEST_MS), "adiado: dreno dentro da requisição");
  }

  const propostaId =
    (typeof row.payload.proposal_id === "string" ? row.payload.proposal_id : null) ??
    (typeof row.entity_id === "string" ? row.entity_id : null);
  if (!propostaId) return skipped("payload_incompleto");

  if (!(await deps.db.preferencia(orgId))) return skipped("desligado_em_propostas");

  const cfg = await deps.db.carregaConfig(orgId);
  if (!cfg || !cfg.ligado || !cfg.channel_session_id) return skipped("sem_configuracao");
  const canalId = cfg.channel_session_id;

  if (passouDoTeto(row, agora)) return skipped("evento_velho");

  const proposta = await deps.db.carregaProposta(orgId, propostaId);
  if (!proposta || proposta.status !== "rascunho") return skipped("proposta_fora_de_rascunho");
  if (!(await deps.db.avisoAberto(orgId, propostaId))) return skipped("aviso_ja_resolvido");

  const tentativa = row.attempts + 1;
  const falha = (codigo: string): DesfechoDoAvisoDeProposta => {
    deps.audita({
      action: "proposal.aviso_whatsapp_falhou",
      organizationId: orgId,
      propostaId,
      metadata: { codigo, canal: canalId, tentativas: tentativa },
    });
    return skipped(codigo);
  };

  const canal = await deps.db.carregaCanal(orgId, canalId);
  if (!canal || canal.archived_at) return falha("canal_arquivado");
  if (!canal.aceitaMensagemLivre) return falha("canal_nao_aceita_aviso_livre");
  if (canal.status !== "WORKING") {
    if (tentativa >= TETO_DE_TENTATIVAS_DO_CANAL) return falha("canal_desconectado");
    return retry(new Date(agora.getTime() + ADIAMENTO_DO_CANAL_MS), `canal ${canal.status}`);
  }

  if (!urlPublicaUsavel(deps.urlPublica)) return falha("sem_endereco_publico");

  if (!(await deps.transporte.configurado(orgId, canal))) {
    if (tentativa >= TETO_DE_TENTATIVAS_DE_ENVIO) return falha("transporte_ausente");
    return retry(new Date(agora.getTime() + ADIAMENTO_DO_CANAL_MS), "transporte fora do ar");
  }

  const pacing = await deps.pacing.decide(orgId, canalId, agora);
  if (!pacing.liberado) return retry(pacing.liberaEm, `pacing:${pacing.motivo}`);

  const to = await deps.transporte.resolveDestino(orgId, canal, cfg.telefone_destino);
  if (!to) return falha("destino_invalido");

  const marca = await deps.db.marcaDaOrganizacao(orgId);
  const cliente = proposta.contact_id ? await deps.db.nomeDoContato(orgId, proposta.contact_id) : null;
  const body = montarAvisoDeProposta({
    marca: marca.nome,
    idioma: marca.idioma,
    titulo: proposta.titulo,
    cliente,
    link: linkDaProposta(deps.urlPublica, propostaId),
  });

  try {
    await deps.transporte.envia(orgId, canal, to, body);
  } catch {
    if (tentativa >= TETO_DE_TENTATIVAS_DE_ENVIO) return falha("falha_no_envio");
    return retry(new Date(agora.getTime() + ADIAMENTO_DO_CANAL_MS), "envio recusado");
  }

  // Depois do envio TUDO falha aberto: a mensagem já saiu, e lançar aqui faria
  // o dreno reprocessar e a equipe receber de novo.
  try {
    await deps.pacing.registraEnvio(orgId, canalId, agora);
  } catch {
    /* o ledger é best-effort depois do envio — ver comentário acima */
  }
  try {
    await deps.db.registraJidDoAviso(orgId, to);
  } catch {
    /* idem */
  }
  deps.audita({
    action: "proposal.aviso_whatsapp_enviado",
    organizationId: orgId,
    propostaId,
    metadata: { canal: canalId, tentativas: tentativa, destino_mascarado: mascara(cfg.telefone_destino) },
  });
  return { status: "ok", detail: `enviado canal=${canalId}` };
}
```

Meça antes de colar: os nomes e tipos importados de `aviso-ao-suporte.ts` (`grep -n "^export" lib/escalacao/aviso-ao-suporte.ts`) e o caminho de `Idioma` (`grep -rn "export type Idioma" lib/i18n/`). Se o `lint` reprovar os `catch {}` vazios com comentário, troque por `logger.warn(...)` como faz `depoisDoEnvio` no aviso de caso.

Traduções (confira antes com `grep`; `"Cliente"` e `"Proposta"` podem já existir):
```typescript
  "a IA rascunhou uma proposta": { es: "la IA redactó una propuesta" },
  "Revisar e enviar": { es: "Revisar y enviar" },
  "Responder aqui não chega ao cliente — abra o link para revisar.": {
    es: "Responder aquí no llega al cliente — abre el enlace para revisar.",
  },
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run lib/propostas/aviso-no-whatsapp.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/branding.test.ts`
Expected: PASS

- [ ] **Step 6: Sabotar** — copie o arquivo, apague a linha `if (!proposta || proposta.status !== "rascunho") return skipped("proposta_fora_de_rascunho");`, rode: "proposta que saiu de rascunho: não envia" falha. Restaure da cópia.

- [ ] **Step 7: Commit**

```bash
git add lib/propostas/aviso-no-whatsapp.ts lib/propostas/aviso-no-whatsapp.test.ts lib/audit/actions.ts lib/i18n/dicionario.ts
git commit -m "feat(propostas): regra do aviso de proposta ao WhatsApp da equipe (P4B)"
```

---

### Task 3: O consumidor de produção e o registro

**Files:**
- Create: `lib/propostas/aviso-no-whatsapp.handler.ts`
- Modify: `lib/event-log/register-handlers.ts`

**Interfaces:**
- Consumes: `aplicaAvisoDeProposta`, `EVENTO_PROPOSTA_PRONTA` (Task 2); `createSupabaseAvisoDb` (`@/lib/escalacao/aviso-ao-suporte`); `criarTransporteDoAviso` (`@/lib/escalacao/aviso-ao-suporte.handler`); `criarPacingDoCanal`; `resolverPadroesDaProposta` (Task 1); `nomeDoContato`.
- Produces: `avisoDePropostaNoWhatsAppHandler: EventHandler` com `key: "propostas-aviso-no-whatsapp.v1"` e `events: [EVENTO_PROPOSTA_PRONTA]`.

- [ ] **Step 1: Implementar o consumidor**

```typescript
// lib/propostas/aviso-no-whatsapp.handler.ts
/**
 * Adapter fino: pluga `aplicaAvisoDeProposta` no dreno do `event_log`, reusando
 * a leitura, o transporte e o pacing do aviso de caso. Imports de topo iguais
 * aos de `lib/escalacao/aviso-ao-suporte.handler.ts` — o dreno carrega isto
 * sob `tsx`, e import pesado de topo já o parou (#648).
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { audit } from "@/lib/audit";
import { criarPacingDoCanal } from "@/lib/agent-engine/pacing/ledger-supabase";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { env } from "@/lib/env";
import { createSupabaseAvisoDb } from "@/lib/escalacao/aviso-ao-suporte";
import { criarTransporteDoAviso } from "@/lib/escalacao/aviso-ao-suporte.handler";
import { origemDoDreno } from "@/lib/event-log/origem-do-dreno";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVENTO_PROPOSTA_PRONTA, aplicaAvisoDeProposta } from "./aviso-no-whatsapp";
import { resolverPadroesDaProposta } from "./padroes-da-organizacao";

export const AVISO_DE_PROPOSTA_HANDLER_KEY = "propostas-aviso-no-whatsapp.v1";

export const avisoDePropostaNoWhatsAppHandler: EventHandler = {
  key: AVISO_DE_PROPOSTA_HANDLER_KEY,
  events: [EVENTO_PROPOSTA_PRONTA],
  async handle(row): Promise<HandlerResult> {
    try {
      const admin = createAdminClient();
      const doCaso = createSupabaseAvisoDb(admin);
      const desfecho = await aplicaAvisoDeProposta(
        {
          db: {
            async preferencia(orgId) {
              const { data } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
              return resolverPadroesDaProposta((data as { settings?: unknown } | null)?.settings).avisarNoWhatsApp;
            },
            carregaConfig: (orgId) => doCaso.carregaConfig(orgId),
            async carregaProposta(orgId, propostaId) {
              const { data } = await admin
                .from("crm_proposals")
                .select("titulo, status, contact_id")
                .eq("organization_id", orgId)
                .eq("id", propostaId)
                .maybeSingle();
              return (data as { titulo: string | null; status: string; contact_id: string | null } | null) ?? null;
            },
            async avisoAberto(orgId, propostaId) {
              const { data } = await admin
                .from("agent_inbox_items")
                .select("id")
                .eq("organization_id", orgId)
                .eq("kind", "proposta_pronta_para_revisao")
                .eq("ref_id", propostaId)
                .eq("status", "open")
                .maybeSingle();
              return data !== null;
            },
            async nomeDoContato(orgId, contactId) {
              const { data } = await admin
                .from("contacts")
                .select("name, display_name")
                .eq("organization_id", orgId)
                .eq("id", contactId)
                .maybeSingle();
              return nomeDoContato(data as { name: string | null; display_name: string | null } | null);
            },
            carregaCanal: (orgId, canalId) => doCaso.carregaCanal(orgId, canalId),
            registraJidDoAviso: (orgId, jid) => doCaso.registraJidDoAviso(orgId, jid),
            marcaDaOrganizacao: (orgId) => doCaso.marcaDaOrganizacao(orgId),
          },
          transporte: await criarTransporteDoAviso(admin),
          pacing: await criarPacingDoCanal(admin),
          clock: () => new Date(),
          urlPublica: env.NEXT_PUBLIC_APP_URL,
          origemDoDreno,
          audita: (entrada) => {
            void audit({
              action: entrada.action,
              organizationId: entrada.organizationId,
              resourceType: "crm_proposals",
              resourceId: entrada.propostaId,
              bypassedRls: true,
              metadata: entrada.metadata,
            });
          },
        },
        row,
      );
      return {
        consumer_key: AVISO_DE_PROPOSTA_HANDLER_KEY,
        status: desfecho.status,
        ...(desfecho.retry_at ? { retry_at: desfecho.retry_at } : {}),
        detail: desfecho.detail,
      };
    } catch (err) {
      return { consumer_key: AVISO_DE_PROPOSTA_HANDLER_KEY, status: "error", detail: err instanceof Error ? err.message : String(err) };
    }
  },
};
```

Meça antes de colar: que `audit(...)` aceita `bypassedRls` (é o que o consumidor do aviso de caso passa — `grep -n "bypassedRls" lib/escalacao/aviso-ao-suporte.handler.ts lib/audit/*.ts`) e que o `.select("settings").eq("id", orgId)` de `organizations` é como `buscarPadroesDaOrganizacao` lê (`lib/propostas/padroes-da-organizacao.ts`).

- [ ] **Step 2: Registrar** — em `lib/event-log/register-handlers.ts`:

acrescente o import junto aos outros:
```typescript
import { avisoDePropostaNoWhatsAppHandler } from "@/lib/propostas/aviso-no-whatsapp.handler";
```
e troque:
```typescript
  registerHandler(avisoDeCasoAoSuporteHandler);
```
por:
```typescript
  registerHandler(avisoDeCasoAoSuporteHandler);
  // Mesmo critério do de cima: sai por rede de terceiro, depois de quem só
  // escreve no banco. Consome o MESMO evento que a notificação do navegador.
  registerHandler(avisoDePropostaNoWhatsAppHandler);
```

- [ ] **Step 3: Rodar as cercas do dreno**

Run: `npx vitest run tests/unit/drain-loop-carrega-deps-sob-tsx.test.ts tests/unit/evento-de-fato-nao-fica-pendente.test.ts tests/unit/event-log-drain-loop.test.ts lib/propostas/`
Expected: PASS

- [ ] **Step 4: Gates e commit**

```bash
pnpm typecheck && pnpm lint && pnpm lint:channels
git add lib/propostas/aviso-no-whatsapp.handler.ts lib/event-log/register-handlers.ts
git commit -m "feat(propostas): consumidor do aviso de proposta ao WhatsApp da equipe, registrado no dreno (P4B)"
```

(`lint:channels` porque o consumidor encosta no transporte de canal: a cerca proíbe nome de provedor fora de `lib/channels/` — este arquivo não cita nenhum.)

---

### Task 4: Fragmento e fechamento

- [ ] **Step 1** — crie `.changes/proposta-avisa-no-whatsapp-da-equipe.md`:

```markdown
---
impacto: capacidade_nova
secao: adicionado
titulo: Rascunho de proposta da IA avisa no WhatsApp da equipe
---

Onde o "Aviso no WhatsApp" já está configurado e ligado, a equipe passa a receber uma mensagem no número de plantão quando o assistente rascunha uma proposta, com o título, o primeiro nome do cliente e o link para revisar. A chave fica em Configurações › Propostas e vem ligada; desligar é um clique. A mensagem respeita o espaçamento e o limite diário do número, e não sai se a proposta já tiver sido enviada ou descartada.
```

- [ ] **Step 2**

```bash
pnpm release:conferir
npx vitest run lib/propostas lib/notifications tests/unit/drain-loop-carrega-deps-sob-tsx.test.ts tests/unit/evento-de-fato-nao-fica-pendente.test.ts > "$TMP/p4b-depois.log" 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " "$TMP/p4b-depois.log" | tail -3
git add .changes/proposta-avisa-no-whatsapp-da-equipe.md
git commit -m "docs(release): fragmento do P4B da proposta"
```

- [ ] **Step 3: Relatório para a sessão Claude** — commits, rodapés, gates, a sabotagem. **Não empurre.**

## Roteiro de prova na tela (para o dono)

1. Em **IA › Aviso no WhatsApp**, configure o número de plantão e ligue (hoje a organização do teste de 26/09 não tem essa configuração).
2. Em **Configurações › Propostas**, confira que "Avisar no WhatsApp da equipe…" está ligado.
3. Provoque um rascunho pela conversa: a mensagem chega no número de plantão com o link; o link abre a proposta.
4. **Erro de propósito:** desligue a chave em Configurações › Propostas e provoque outro rascunho — nada chega. Religue, provoque, e descarte o rascunho em menos de um minuto — nada chega.

## Self-Review

- Spec 4B: comportamentos 1 (Task 1), 2 (Tasks 2 e 3), 3 (reuso de transporte/pacing, sem tabela — Task 2), 4 (Task 2: rascunho + aviso aberto; falha definitiva auditada).
- D12 respeitada: nenhum arquivo em `supabase/`.
- Review Focus coberto na Task 2.
