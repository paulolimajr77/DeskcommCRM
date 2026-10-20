/**
 * Assistente interno — os CARTÕES DE PROPOSTA DENTRO DA CONVERSA (decisão do
 * dono, 18/10/2026: o painel deixou de ter abas).
 *
 * Antes existia uma aba "Propostas", com contador, filtro e um formulário de
 * rejeição em dois passos. Agora a mudança esperando decisão chega como MENSAGEM
 * na conversa — "Tem N mudanças esperando você." com os cartões ao lado — e a
 * decisão é um clique: **Aplicar** (aprova e aplica em sequência) ou **Não**.
 *
 * SEED: duas propostas `pendente` (uma de conhecimento/FAQ, uma de roteador)
 * gravadas pelo service role NO MESMO caminho das specs `assistente-*`
 * (banco de teste do baseline, filtrando a organização `e2e-test-org` e
 * assinando `requested_by` com o id do próprio admin). A TELA lê só o
 * `GET /api/v1/ai/assistente/propostas` — nada de banco na render.
 *
 * O PAR (`docs/doctrine/prova-em-par.md`): (a) pela tela, o cartão diz
 * "Aplicada"; (b) fora da tela, `GET /api/v1/ai/knowledge/sources` (mesma
 * sessão) mostra a fonte criada. E a REJEITADA nunca criou nada: o
 * `GET /api/v1/ai/routers` não tem roteador nenhum com o nome proposto.
 * Os dois lados têm de concordar.
 */
import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { test, expect } from "./helpers/test";
import { lerCreds, loginComoAdmin, type CredsE2E } from "./helpers/login-admin";

const ORG_SLUG = "e2e-test-org";
const RESUMO_FAQ = "E2E Propostas: FAQ da clínica";
const RESUMO_ROTEADOR = "E2E Propostas: roteador do número";
const NOME_DA_FONTE = "E2E Propostas FAQ";
const NOME_DO_ROTEADOR = "E2E Propostas Roteador";

const creds: CredsE2E = lerCreds();
let organizacaoId: string | null = null;
let adminUserId: string | null = null;

test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => {
  const env = credenciaisSupabaseDeTeste();
  const admin = createClient(env.url, env.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: org } = await admin.from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
  if (!org) throw new Error(`org ${ORG_SLUG} ausente — rode scripts/seed-e2e-credentials.ts antes`);
  organizacaoId = (org as { id: string }).id;

  const { data: users } = await admin.auth.admin.listUsers();
  const adminUser = (users?.users ?? []).find((u) => u.email === creds.users.admin?.email);
  if (!adminUser) throw new Error("admin do e2e não encontrado em auth.users");
  adminUserId = adminUser.id;

  // O estado deste spec é dele: limpa propostas antigas com a mesma assinatura.
  await admin.from("config_proposals").delete().eq("organization_id", organizacaoId).like("resumo", "E2E Propostas:%");

  const { error } = await admin.from("config_proposals").insert([
    {
      organization_id: organizacaoId,
      kind: "conhecimento",
      risk: "seguro",
      resumo: RESUMO_FAQ,
      motivo: "A equipe perguntou isto na conversa e a resposta está no guia.",
      antes: null,
      payload: {
        operacao: "criar",
        corpo: { source_type: "faq", name: NOME_DA_FONTE, items: [{ question: "Qual o horário?", answer: "Das 8h às 18h." }] },
      },
      status: "pendente",
      requested_by: adminUserId,
    },
    {
      organization_id: organizacaoId,
      kind: "roteador",
      risk: "atencao",
      resumo: RESUMO_ROTEADOR,
      motivo: "O número novo precisa escolher entre os dois atendentes.",
      antes: null,
      payload: {
        operacao: "criar",
        corpo: { name: NOME_DO_ROTEADOR, channel_session_id: "11111111-2222-4333-8444-5555555555e1" },
      },
      status: "pendente",
      requested_by: adminUserId,
    },
  ] as never);
  if (error) throw new Error(`seed das propostas falhou: ${error.message}`);
});

test.afterAll(async () => {
  if (organizacaoId === null) return;
  const env = credenciaisSupabaseDeTeste();
  const admin = createClient(env.url, env.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // A fonte que a aplicação criou (a rejeitada não criou nada).
  const { data: fontes } = await admin
    .from("ai_knowledge_sources")
    .select("id")
    .eq("organization_id", organizacaoId)
    .eq("name", NOME_DA_FONTE);
  for (const fonte of fontes ?? []) {
    await admin.from("ai_knowledge_sources").delete().eq("id", (fonte as { id: string }).id);
  }
  await admin.from("config_proposals").delete().eq("organization_id", organizacaoId).like("resumo", "E2E Propostas:%");
});

/**
 * Abre o painel. Sem aba para clicar: o admin que abre com pendências vê o
 * ANÚNCIO e os cartões na própria conversa.
 */
async function abrirPropostas(page: import("./helpers/test").Page): Promise<void> {
  await page.getByTestId("assistente-link").click();
  await expect(page.getByRole("complementary", { name: "Assistente" })).toBeVisible();
  // O número depende de quantas já foram decididas por testes anteriores desta
  // sequência (a rejeitada sai da contagem); o anúncio existe enquanto houver pendente.
  await expect(page.getByText(/^Tem (1 mudança|\d+ mudanças) esperando você\.$/)).toBeVisible();
}

/**
 * O cartão de uma proposta: é o único `data-testid` que começa por `proposta-`,
 * TEM `data-status` e contém o resumo. Os filhos (`proposta-risco`,
 * `proposta-prazo`, `proposta-aplicar-…`) não têm `data-status`.
 */
function cartaDaTela(page: import("./helpers/test").Page, resumo: string) {
  return page.locator('[data-testid^="proposta-"][data-status]', { hasText: resumo });
}

test("o anúncio marca 2 e os cartões mostram prazo, risco com texto e o aviso", async ({ page }) => {
  await loginComoAdmin(page, creds);
  await abrirPropostas(page);
  // Primeiro caso da sequência: nada foi decidido ainda, então são as duas.
  await expect(page.getByText("Tem 2 mudanças esperando você.", { exact: true })).toBeVisible();

  const faq = cartaDaTela(page, RESUMO_FAQ);
  const roteador = cartaDaTela(page, RESUMO_ROTEADOR);
  await expect(faq).toBeVisible();
  await expect(roteador).toBeVisible();
  // Prazo (item 4 do sistema vivo: pendente visível com responsável e prazo)…
  await expect(faq.getByTestId("proposta-prazo")).toContainText("Vence em");
  await expect(roteador.getByTestId("proposta-prazo")).toContainText("Vence em");
  // …e quem pediu (o próprio admin, nomeado pela leitura da equipe).
  await expect(faq.locator('[data-testid^="proposta-quem-"]')).toContainText("Pedido por");
  // Risco com cor E TEXTO (nunca só cor).
  await expect(faq.getByTestId("proposta-risco")).toHaveText("Seguro");
  await expect(roteador.getByTestId("proposta-risco")).toHaveText("Atenção");
  // O aviso obrigatório: roteador NASCE ATIVO, dito ANTES de aplicar.
  await expect(roteador).toContainText("nasce ativo");
  // E os dois caminhos de decisão, no cartão.
  await expect(faq.getByTestId(/^proposta-aplicar-/)).toBeVisible();
  await expect(faq.getByTestId(/^proposta-nao-/)).toBeVisible();
});

test("Não no cartão rejeita — e a proposta rejeitada NUNCA cria nada (par com o GET direto)", async ({ page }) => {
  await loginComoAdmin(page, creds);
  await abrirPropostas(page);

  const roteador = cartaDaTela(page, RESUMO_ROTEADOR);
  await roteador.getByTestId(/^proposta-nao-/).click();

  // A decisão vira MENSAGEM na conversa, e o cartão muda de estado na hora.
  await expect(page.getByText("Não apliquei: nada mudou.", { exact: true })).toBeVisible();
  await expect(cartaDaTela(page, RESUMO_ROTEADOR)).toHaveAttribute("data-status", "rejeitada");
  await expect(cartaDaTela(page, RESUMO_ROTEADOR).getByTestId("proposta-prazo")).toHaveText("Rejeitada");
  // Rejeitada não tem mais botão nenhum.
  await expect(cartaDaTela(page, RESUMO_ROTEADOR).getByTestId(/^proposta-nao-/)).toHaveCount(0);

  // PAR, lado da ferramenta: o roteador proposto NÃO existe no CRM.
  const roteadores = await page.evaluate(async () => {
    const r = await fetch("/api/v1/ai/routers");
    return (await r.json()) as { data?: { routers?: Array<{ name?: string }> } };
  });
  const nomes = (roteadores.data?.routers ?? []).map((r) => r.name ?? "");
  expect(nomes).not.toContain(NOME_DO_ROTEADOR);

  // F4, o laço de retorno — PAR: a rejeição vira sinal no painel de Evolução.
  // Lado da ferramenta: o GET direto da rota de evolução conta a rejeição do roteador.
  const doGet = await page.evaluate(async () => {
    const r = await fetch("/api/v1/ai/evolution");
    return (await r.json()) as {
      data?: { config_loop?: { estado: string; por_kind: Array<{ kind: string; rejeitadas: number; propostas: number }> } };
    };
  });
  expect(doGet.data?.config_loop?.estado).toBe("ok");
  const roteadorGet = doGet.data?.config_loop?.por_kind.find((k) => k.kind === "roteador");
  expect(roteadorGet?.rejeitadas ?? 0).toBeGreaterThanOrEqual(1);

  // Lado da tela: o bloco do assistente em /app/ai/evolution mostra a MESMA contagem.
  await page.goto("/app/ai/evolution");
  const linha = page.getByTestId("bloco-assistente").getByTestId("config-loop-roteador");
  await expect(linha).toBeVisible();
  // Colunas da linha: tipo, sugeridas, aprovadas, aplicadas, recusadas, sem decisão, aprovadas e não aplicadas.
  const celulas = await linha.locator("td").allTextContents();
  expect(Number(celulas[4])).toBe(roteadorGet?.rejeitadas);
  expect(Number(celulas[1])).toBe(roteadorGet?.propostas);
});

test("Aplicar aprova e aplica num clique — a tela diz Aplicada E o GET direto mostra a fonte criada (par)", async ({
  page,
}) => {
  await loginComoAdmin(page, creds);
  await abrirPropostas(page);

  const faq = cartaDaTela(page, RESUMO_FAQ);
  await faq.getByTestId(/^proposta-aplicar-/).click();

  // PAR, lado da tela: a conversa anuncia o desfecho e o cartão diz Aplicada.
  await expect(page.getByText(`Pronto: ${RESUMO_FAQ}`, { exact: true })).toBeVisible();
  await expect(cartaDaTela(page, RESUMO_FAQ)).toHaveAttribute("data-status", "aplicada");
  await expect(cartaDaTela(page, RESUMO_FAQ).getByTestId("proposta-prazo")).toHaveText("Aplicada");
  // Aplicada também não tem mais botão.
  await expect(cartaDaTela(page, RESUMO_FAQ).getByTestId(/^proposta-aplicar-/)).toHaveCount(0);

  // PAR, lado da ferramenta: a fonte EXISTE, com o nome proposto.
  const fontes = await page.evaluate(async () => {
    const r = await fetch("/api/v1/ai/knowledge/sources");
    return (await r.json()) as { data?: Array<{ name?: string }> };
  });
  const nomes = (fontes.data ?? []).map((f) => f.name ?? "");
  expect(nomes).toContain(NOME_DA_FONTE);
});
