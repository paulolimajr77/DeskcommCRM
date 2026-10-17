/**
 * Assistente interno, F2b (T21) — a fila de propostas no painel, decisão de
 * ponta a ponta.
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
const MOTIVO = "O número já tem roteador ativo — não é isto que a operação precisa.";

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

async function abrirPropostas(page: import("./helpers/test").Page): Promise<void> {
  await page.getByTestId("assistente-link").click();
  await expect(page.getByRole("complementary", { name: "Assistente" })).toBeVisible();
  await page.getByTestId("assistente-aba-propostas").click();
}

function propostaDaTela(page: import("./helpers/test").Page, resumo: string) {
  return page.locator("li[data-status]", { hasText: resumo });
}

test("a fila mostra as duas pendentes com prazo, risco com texto e o contador marca 2", async ({ page }) => {
  await loginComoAdmin(page, creds);
  await abrirPropostas(page);

  await expect(page.getByTestId("assistente-propostas-contador")).toHaveText("2");
  const faq = propostaDaTela(page, RESUMO_FAQ);
  const roteador = propostaDaTela(page, RESUMO_ROTEADOR);
  await expect(faq).toBeVisible();
  await expect(roteador).toBeVisible();
  // Prazo (item 4 do sistema vivo: pendente visível com responsável e prazo)…
  await expect(faq.getByTestId("proposta-prazo")).toContainText("Vence em");
  await expect(roteador.getByTestId("proposta-prazo")).toContainText("Vence em");
  // …e quem pediu (o próprio admin, nomeado pela leitura da equipe).
  // …e quem pediu (o próprio admin, nomeado pela leitura da equipe).
  await expect(faq.locator('[data-testid^="proposta-quem-"]')).toContainText("Solicitado por");
  // Risco com cor E TEXTO (nunca só cor).
  await expect(faq.getByTestId("proposta-risco")).toHaveText("Seguro");
  await expect(roteador.getByTestId("proposta-risco")).toHaveText("Atenção");
  // O aviso obrigatório: roteador NASCE ATIVO, dito ANTES de aplicar.
  await expect(roteador).toContainText("nasce ativo");
});

test("rejeitar o roteador com motivo — e ele NUNCA cria nada (par com o GET direto)", async ({ page }) => {
  await loginComoAdmin(page, creds);
  await abrirPropostas(page);

  const roteador = propostaDaTela(page, RESUMO_ROTEADOR);
  await roteador.getByTestId(/^proposta-rejeitar-/).click();
  await roteador.getByTestId(/^proposta-motivo-/).fill(MOTIVO);
  await roteador.getByTestId(/^proposta-confirmar-rejeicao-/).click();

  // A visão padrão é "esperando decisão": a rejeitada sai dela e o contador cai.
  await expect(page.getByTestId("assistente-propostas-contador")).toHaveText("1");
  await page.getByTestId("propostas-filtro").selectOption("rejeitada");
  const rejeitada = propostaDaTela(page, RESUMO_ROTEADOR);
  await expect(rejeitada).toBeVisible();
  await expect(rejeitada).toContainText(MOTIVO);

  // PAR, lado da ferramenta: o roteador proposto NÃO existe no CRM.
  const roteadores = await page.evaluate(async () => {
    const r = await fetch("/api/v1/ai/routers");
    return (await r.json()) as { data?: Array<{ name?: string }> };
  });
  const nomes = (roteadores.data ?? []).map((r) => r.name ?? "");
  expect(nomes).not.toContain(NOME_DO_ROTEADOR);
});

test("aprovar e aplicar a FAQ — a tela diz Aplicada E o GET direto mostra a fonte criada (par)", async ({ page }) => {
  await loginComoAdmin(page, creds);
  await abrirPropostas(page);

  const faq = propostaDaTela(page, RESUMO_FAQ);
  await faq.getByTestId(/^proposta-aprovar-/).click();
  const aplicar = faq.getByTestId(/^proposta-aplicar-/);
  await expect(aplicar).toBeVisible();
  await aplicar.click();

  // PAR, lado da tela: o cartão diz Aplicada (e sai da fila de decisão).
  await expect(page.getByTestId("assistente-propostas-contador")).toHaveText("0");
  await page.getByTestId("propostas-filtro").selectOption("aplicada");
  const aplicada = propostaDaTela(page, RESUMO_FAQ);
  await expect(aplicada).toBeVisible();
  await expect(aplicada).toContainText("Aplicada");

  // PAR, lado da ferramenta: a fonte EXISTE, com o nome proposto.
  const fontes = await page.evaluate(async () => {
    const r = await fetch("/api/v1/ai/knowledge/sources");
    return (await r.json()) as { data?: Array<{ name?: string }> };
  });
  const nomes = (fontes.data ?? []).map((f) => f.name ?? "");
  expect(nomes).toContain(NOME_DA_FONTE);
});
