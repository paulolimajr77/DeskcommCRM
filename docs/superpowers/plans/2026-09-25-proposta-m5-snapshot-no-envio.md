# Proposta M5 — Snapshot no Envio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a Onda 5 ("envio") da onda de modelos. Medido antes de escrever, em `app/api/v1/proposals/[id]/send/route.ts` (401 linhas): autorização humana (`requireRole("manager")`), número (`alocarNumero`, D9), PDF, envio pelo WhatsApp, timeline (`emitLeadActivity`) e follow-up automático (N2) **já existem** — é a onda C2/D3/N2 da spec-mãe, mesclada há muito tempo. O que falta, medido: nada grava `template_snapshot`/`rendered_snapshot` — as duas colunas que a M0 criou e que a spec (§5.5) exige preencher exatamente no envio ("TEMPLATE, PROPOSTA e DOCUMENTO são 3 coisas" — o snapshot é o que fica congelado pra sempre, mesmo que o modelo mude depois). Esta onda é EXATAMENTE esse fechamento.

**Architecture:** Uma única adição, isolada e best-effort, dentro da rota que já existe: antes do envio de fato, se a proposta tem `template_slug`, resolve o modelo (M0), monta os dados (M3) e renderiza o documento (M2), aplicando as sobrescritas manuais (M3) — e grava os dois JSONs no MESMO `.update()` que já marca a proposta como `enviada`. Falha ao montar o snapshot NUNCA bloqueia o envio (mesmo padrão que o arquivo já usa para imagem de produto e para o agendamento de follow-up) — proposta sem modelo escolhido é o caso comum hoje e continua enviando exatamente como antes.

**Tech Stack:** TypeScript, Next.js Route Handlers, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-proposta-comercial-templates-design.md` (§5.5 — TEMPLATE/PROPOSAL/DOCUMENT; §11 — Onda 5). M0-M4 já mescladas em `feat/proposta-comercial`.

## Global Constraints — leia antes de tocar no arquivo

- **`app/api/v1/proposals/[id]/send/route.ts` é o arquivo mais sensível desta feature inteira** — número jurídico da proposta (D9), máquina de estados de envio (D3), herança de retorno automático entre v1/v2 (C3b+E1), proposta órfã (D10). **A ÚNICA mudança permitida neste arquivo é a descrita no Step 3 da Task 1** — nenhuma linha de numeração, throttle, envio de mensagem, `substitui_id` ou follow-up muda. Se qualquer coisa parecer exigir tocar em outra parte do arquivo, PARE e avise — não há segunda tarefa neste plano para "consertar de passagem".
- **O snapshot é BEST-EFFORT, como o resto do arquivo já trata coisas acessórias** (imagem de produto §121-152, agendamento de retorno §347-389): erro ao resolver modelo/renderizar documento vira `logger.warn` e os dois campos ficam `null` — NUNCA impede o envio, nunca vira exceção que reverte a proposta pra rascunho.
- **Só a proposta ATUAL entra no `.update()` do estado "sent | delivered | read → enviada"** (linhas ~282-289 hoje) — não no de falha nem no de fila, porque só uma emissão EFETIVA congela o documento que foi entregue (mesmo raciocínio de `sent_at`/`sent_by_user_id`, que também só entram nesse branch).
- **Não se muda qual PDF é enviado ao cliente** (continua `renderPropostaPdf`, o de itens) — trocar isso por um PDF com as seções do documento é uma decisão maior, separada, a se tomar com o Paulo depois deste plano fechar. Este plano só faz o registro/auditoria do que foi usado, não muda o que o cliente recebe.
- Nenhuma migration — `template_snapshot`/`rendered_snapshot` já existem (M0, migration 0411).

## Review Focus

- **Proposta SEM `template_slug` (o caso comum hoje) continua enviando exatamente como antes** — os dois campos ficam `null`, nada mais muda. Task 1 testa.
- **`resolverModelo` devolvendo `null`** (slug aponta pra um modelo que não existe/foi desativado) não pode lançar — os dois campos ficam `null`, envio segue. Não precisa de teste dedicado: é o mesmo caminho do "sem template_slug" olhando o `if (modelo)`.
- **Seção sobrescrita manualmente (M3, `secoes_editadas`) entra no `rendered_snapshot` com o texto FINAL editado**, não com o `[a definir]` que o modelo geraria sozinho — é exatamente o "documento que o cliente recebeu de verdade". Task 1 testa.
- **O snapshot só é gravado no branch de sucesso efetivo** (`enviada`) — uma falha de WhatsApp (branch `failed`) ou fila (`queued`) não grava snapshot nenhum ainda, porque a proposta pode ser reenviada e o conteúdo pode mudar até lá. Task 1 testa (reaproveitando o teste de falha já existente, só conferindo que `template_snapshot` não está no `dados` daquele update específico).

---

### Task 1: `send/route.ts` grava `template_snapshot`/`rendered_snapshot` no envio efetivo

**Files:**
- Modify: `app/api/v1/proposals/[id]/send/route.ts`
- Modify: `app/api/v1/proposals/[id]/send/route.test.ts`

**Interfaces:**
- Consumes: `resolverModelo` (`@/lib/propostas/modelos/resolver`, M0), `montarDadosDoDocumento` (`@/lib/propostas/documento/montar-dados`, M3), `renderizarDocumento` (`@/lib/propostas/documento/renderer`, M2).

- [ ] **Step 1: Adicionar o mock de `resolverModelo` e escrever os testes**

No topo de `send/route.test.ts`, adicionar ao objeto `mocks` (dentro do `vi.hoisted`, junto aos outros):

```typescript
  resolverModelo: vi.fn(),
```

E adicionar o `vi.mock` correspondente, junto aos outros `vi.mock(...)`:

```typescript
vi.mock("@/lib/propostas/modelos/resolver", () => ({ resolverModelo: mocks.resolverModelo }));
```

Dentro de `montarMundoDeEnvio`, logo depois de `mocks.requireSupportWrite.mockResolvedValue(...)`, adicionar o default do mock novo (proposta sem `template_slug` → nunca é chamado de verdade, mas o mock precisa de uma implementação para não quebrar quando ELA tiver `template_slug`):

```typescript
  mocks.resolverModelo.mockImplementation(async (_db: unknown, _org: string, slug: string) => ({
    slug,
    version: 1,
    sectionOrder: ["resumo"],
    sections: [
      { id: "resumo", title: "Resumo", titleEs: null, body: "Projeto: {{project.name}}", bodyEs: null, required: true, conditional: false },
    ],
    origem: "base",
  }));
```

Adicionar os testes, dentro do `describe("POST /api/v1/proposals/[id]/send", ...)` já existente (ao lado dos outros `it`):

```typescript
it("proposta COM template_slug: grava template_snapshot e rendered_snapshot no envio efetivo (M5)", async () => {
  const mundo = montarMundoDeEnvio({
    propostaOriginal: {
      template_slug: "site_institucional",
      briefing_json: { project: { name: "Site Catálogo" } },
    },
  });
  const res = await mundo.POST();
  expect(res.status).toBe(200);
  expect(mundo.propostaEnviada?.template_snapshot).toMatchObject({ slug: "site_institucional" });
  expect(mundo.propostaEnviada?.rendered_snapshot).toMatchObject({
    secoes: [{ id: "resumo", body: "Projeto: Site Catálogo" }],
  });
});

it("seção sobrescrita à mão (M3) entra no rendered_snapshot com o texto FINAL, não com [a definir] (Review Focus)", async () => {
  const mundo = montarMundoDeEnvio({
    propostaOriginal: {
      template_slug: "site_institucional",
      briefing_json: {},
      secoes_editadas: { resumo: "Texto escrito à mão pelo gestor." },
    },
  });
  const res = await mundo.POST();
  expect(res.status).toBe(200);
  expect(mundo.propostaEnviada?.rendered_snapshot).toMatchObject({
    secoes: [{ id: "resumo", body: "Texto escrito à mão pelo gestor." }],
  });
});

it("proposta SEM template_slug: os dois campos ficam null, envio continua igual (Review Focus)", async () => {
  const mundo = montarMundoDeEnvio({});
  const res = await mundo.POST();
  expect(res.status).toBe(200);
  expect(mundo.propostaEnviada?.status).toBe("enviada");
  expect(mundo.propostaEnviada?.template_snapshot ?? null).toBeNull();
  expect(mundo.propostaEnviada?.rendered_snapshot ?? null).toBeNull();
  expect(mocks.resolverModelo).not.toHaveBeenCalled();
});

it("WhatsApp falha (branch de retorno a rascunho): o update daquele branch NÃO inclui template_snapshot (Review Focus)", async () => {
  const mundo = montarMundoDeEnvio({
    propostaOriginal: { template_slug: "site_institucional" },
    envioResultado: { id: "msg-1", status: "failed", error_message: "canal desconectado" },
  });
  await mundo.POST();
  const updateDeFalha = mundo.updatesCrmProposals.find(
    (u) => u.id === PROPOSTA_ID && (u.dados as Record<string, unknown>).status === "rascunho",
  );
  expect(updateDeFalha?.dados).not.toHaveProperty("template_snapshot");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "app/api/v1/proposals/[id]/send/route.test.ts"`
Expected: FAIL — os 4 casos novos falham (`template_snapshot`/`rendered_snapshot` não existem no update; `resolverModelo` não é chamado nunca ainda)

- [ ] **Step 3: Implementar**

Em `app/api/v1/proposals/[id]/send/route.ts`:

1. Adicionar os 3 imports novos, junto aos existentes (por volta da linha 11-15):

```typescript
import { resolverModelo } from "@/lib/propostas/modelos/resolver";
import { montarDadosDoDocumento } from "@/lib/propostas/documento/montar-dados";
import { renderizarDocumento } from "@/lib/propostas/documento/renderer";
```

2. Logo ANTES do `// ─── PDF, upload e envio ───` (por volta da linha 209, depois de `const destinatarioNome = ...`), inserir o bloco de snapshot:

```typescript
  // M5 — snapshot do modelo/documento usados nesta emissão (spec §5.5:
  // TEMPLATE, PROPOSTA e DOCUMENTO são 3 coisas — o que congela aqui nunca
  // muda depois, mesmo que o modelo evolua). Best-effort: proposta sem
  // modelo escolhido é o caso comum hoje, e falha ao montar isto nunca pode
  // impedir o envio (mesmo padrão da imagem de produto e do follow-up,
  // acima e abaixo neste arquivo).
  let templateSnapshot: unknown = null;
  let renderedSnapshot: unknown = null;
  if (propostaAlvo.template_slug) {
    try {
      const modelo = await resolverModelo(admin, authz.org.orgId, propostaAlvo.template_slug as string);
      if (modelo) {
        const dados = montarDadosDoDocumento(propostaAlvo as { briefing_json: unknown });
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

3. No `.update(...)` do branch "sent | delivered | read → enviada de verdade" (por volta da linha 282-289 hoje), acrescentar as duas chaves:

```typescript
    .update({
      status: "enviada", pdf_path: pdfPath, sent_at: new Date().toISOString(),
      sent_by_user_id: authz.user.id, message_id: mensagem.id, destinatario_nome: destinatarioNome,
      template_snapshot: templateSnapshot, rendered_snapshot: renderedSnapshot,
    })
```

Nenhuma outra linha do arquivo muda.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "app/api/v1/proposals/[id]/send/route.test.ts"`
Expected: PASS — os 4 casos novos e os 27 pré-existentes (31/31)

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/proposals/[id]/send/route.ts" "app/api/v1/proposals/[id]/send/route.test.ts"
git commit -m "feat(propostas): envio grava template_snapshot/rendered_snapshot (M5)"
```

---

## Verificação final

- [ ] `npx vitest run lib/propostas/ "app/api/v1/proposals/"` — tudo verde.
- [ ] Push para `fork` e conferir os 4 checks (`ci`, `e2e`, `perf`, `Publicar imagem Docker`).
- [ ] **Não incluído neste plano, decisão separada:** trocar o PDF enviado ao cliente pelo PDF com as seções do documento (hoje o cliente recebe só a lista de itens) — perguntar ao Paulo se/quando ele quer essa mudança.
