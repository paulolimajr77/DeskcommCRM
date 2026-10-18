/**
 * Assistente interno, F3 — a aba Auditoria no painel, de ponta a ponta.
 *
 * O PAR (`docs/doctrine/prova-em-par.md`): (a) pela tela, a aba Auditoria
 * mostra a contagem por estado de cada item do retrato; (b) fora da tela,
 * `GET /api/v1/ai/assistente/auditoria` (mesma sessão) devolve o MESMO retrato.
 * As duas contagens têm de concordar. A rodada nova é o botão "Rodar agora"
 * (POST, limitado a 1 por minuto por organização — por isso o estado é
 * limpo antes de cada caso e a repetição é provada como 409 legível).
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

async function abrirAuditoria(page: Page): Promise<void> {
  await page.getByTestId("assistente-link").click();
  await expect(page.getByRole("complementary", { name: "Assistente" })).toBeVisible();
  await page.getByTestId("assistente-aba-auditoria").click();
}

test("sem retrato a aba convida a rodar; rodar mostra os itens e a tela concorda com o GET direto (par)", async ({ page }) => {
  await loginComoAdmin(page, creds);
  await abrirAuditoria(page);

  await expect(page.getByTestId("auditoria-vazia")).toBeVisible();
  await page.getByTestId("auditoria-rodar").click();

  // Lado (a) — pela tela: a contagem de cada estado.
  await expect(page.getByTestId("auditoria-rodar-de-novo")).toBeVisible();
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
