/**
 * Assistente interno, F3 — o CHECKUP dentro da conversa, de ponta a ponta.
 *
 * Antes isto era uma aba ("Auditoria") com o botão "Rodar agora". Agora é o
 * comando `/checkup`: quem administra roda uma rodada nova e recebe o retrato
 * como CARTÃO na conversa; quem não administra vê a última.
 *
 * O PAR (`docs/doctrine/prova-em-par.md`): (a) pela tela, o cartão mostra a
 * contagem por estado de cada item do retrato; (b) fora da tela,
 * `GET /api/v1/ai/assistente/auditoria` (mesma sessão) devolve o MESMO retrato.
 * As duas contagens têm de concordar. A rodada nova é limitada a 1 por minuto por
 * organização — por isso o estado é limpo antes de cada caso e a repetição é
 * provada como 409 legível.
 *
 * Banco de teste do baseline, organização `e2e-test-org`; os retratos que a
 * spec cria são apagados no fim (service role, filtrando a organização).
 */
import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { test, expect, type Page } from "./helpers/test";
import { lerCreds, loginComoAdmin, type CredsE2E } from "./helpers/login-admin";

const ORG_SLUG = "e2e-test-org";
const ESTADOS = ["preenchido", "posso_completar", "preciso_confirmar", "nao_se_aplica"] as const;

const creds: CredsE2E = lerCreds();
let organizacaoId: string | null = null;

test.describe.configure({ timeout: 240_000 });

function clienteDeServico() {
  const env = credenciaisSupabaseDeTeste();
  return createClient(env.url, env.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function limparRetratos(): Promise<void> {
  if (organizacaoId === null) return;
  await clienteDeServico().from("config_snapshots").delete().eq("organization_id", organizacaoId);
}

test.beforeAll(async () => {
  const { data: org } = await clienteDeServico().from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
  if (!org) throw new Error(`org ${ORG_SLUG} ausente — rode scripts/seed-e2e-credentials.ts antes`);
  organizacaoId = (org as { id: string }).id;
});

test.beforeEach(limparRetratos);
test.afterAll(limparRetratos);

/** Abre o painel (sem aba para clicar) e manda o comando pelo campo. */
async function mandarComando(page: Page, comando: string): Promise<void> {
  await page.getByTestId("assistente-link").click();
  await expect(page.getByRole("complementary", { name: "Assistente" })).toBeVisible();
  await page.getByTestId("assistente-pergunta").fill(comando);
  await page.getByTestId("assistente-perguntar").click();
}

test("/checkup roda a rodada e o cartão concorda com o GET direto (par)", async ({ page }) => {
  await loginComoAdmin(page, creds);
  await mandarComando(page, "/checkup");

  // Lado (a) — pela tela: o cartão, com a rodada que acabou de acontecer.
  const cartao = page.getByTestId("assistente-cartao-checkup");
  await expect(cartao).toBeVisible();
  await expect(cartao).toHaveAttribute("data-rodou", "sim");
  const naTela: Record<string, number> = {};
  for (const estado of ESTADOS) {
    const texto = await page.getByTestId(`auditoria-contagem-${estado}`).innerText();
    naTela[estado] = Number(texto.trim().split(/\s+/)[0]);
  }
  const itensNaTela = await page.locator('[data-testid^="auditoria-item-"]').count();

  // Lado (b) — fora da tela: o MESMO retrato, na mesma sessão.
  const direto = await page.request.get("/api/v1/ai/assistente/auditoria?limit=1");
  expect(direto.ok()).toBe(true);
  const corpo = (await direto.json()) as { data: Array<{ pendencias: number; itens: Array<{ estado: string }> }> };
  expect(corpo.data).toHaveLength(1);
  const retrato = corpo.data[0]!;
  const noGet: Record<string, number> = {};
  for (const estado of ESTADOS) noGet[estado] = retrato.itens.filter((i) => i.estado === estado).length;

  expect(naTela).toEqual(noGet);
  expect(itensNaTela).toBe(retrato.itens.length);
  expect(retrato.pendencias).toBe(noGet.posso_completar! + noGet.preciso_confirmar!);

  // E o que a conversa diz bate com a mesma contagem.
  await expect(page.getByTestId("checkup-pendencias")).toContainText(String(retrato.pendencias));
});

test("rodar duas vezes seguidas: a segunda é recusada com 409 legível e nada novo é gravado", async ({ page }) => {
  await loginComoAdmin(page, creds);
  const primeira = await page.request.post("/api/v1/ai/assistente/auditoria");
  expect(primeira.status()).toBe(201);
  const segunda = await page.request.post("/api/v1/ai/assistente/auditoria");
  expect(segunda.status()).toBe(409);
  const corpo = (await segunda.json()) as { error: { message: string } };
  expect(corpo.error.message).toContain("máximo 1 por minuto");

  const lista = await page.request.get("/api/v1/ai/assistente/auditoria");
  const retratos = ((await lista.json()) as { data: unknown[] }).data;
  expect(retratos).toHaveLength(1);
});

test("com a rodada do minuto já gasta, o /checkup mostra a ÚLTIMA auditoria em vez de erro", async ({ page }) => {
  await loginComoAdmin(page, creds);
  // Gasta o minuto por fora (a rota é a mesma que o comando usa).
  const primeira = await page.request.post("/api/v1/ai/assistente/auditoria");
  expect(primeira.status()).toBe(201);

  await mandarComando(page, "/checkup");

  const cartao = page.getByTestId("assistente-cartao-checkup");
  await expect(cartao).toBeVisible();
  // Não rodou agora — caiu para a leitura — e o cartão DIZ isso.
  await expect(cartao).toHaveAttribute("data-rodou", "nao");
  await expect(cartao).toContainText("Esta é a última auditoria da configuração.");
});
