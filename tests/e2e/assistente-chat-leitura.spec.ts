/**
 * Assistente interno, F1 leitura. Prova, na perspectiva do usuário real:
 * (1) o ícone no topo abre o PAINEL LATERAL do assistente (a URL não muda: não
 * existe página em tela cheia); (2) o painel acompanha a pessoa na troca de
 * página; (3) o ⌘K abre o mesmo painel; (4) o botão de resumo devolve números
 * da operação; (5) uma pergunta de guia devolve trecho do guia.
 * Login como agent (papel mínimo do chat).
 *
 * As expectativas de CONTEÚDO das respostas (4 e 5) são do tempo da F1 e ficam
 * como estão até a T9 (e2e com o dublê do modelo).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "./helpers/test";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

interface Creds {
  password: string;
  users: Record<string, { email: string }>;
}

function loadCreds(): Creds {
  if (!fs.existsSync(CREDS_PATH)) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
}

const creds = loadCreds();

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app\//);
}

const painelDoAssistente = (page: Page) => page.getByRole("complementary", { name: "Assistente" });

/** Abre o painel pelo ícone do topo. A URL não muda: o assistente não é uma página. */
async function abrirAssistente(page: Page): Promise<void> {
  const urlAntes = page.url();
  await page.getByTestId("assistente-link").click();
  await expect(painelDoAssistente(page)).toBeVisible();
  expect(page.url()).toBe(urlAntes);
}

test("o atalho no topo abre o assistente e o resumo devolve números", async ({ page }) => {
  await login(page, creds.users.agent!.email);
  await abrirAssistente(page);

  await page.getByTestId("assistente-resumo").click();
  const mensagens = page.getByTestId("assistente-mensagens");
  await expect(mensagens).toContainText(/conversas em atendimento/);
  await expect(mensagens).toContainText(/negócios abertos/);
});

test("pergunta de guia devolve trecho do guia, não silêncio", async ({ page }) => {
  await login(page, creds.users.agent!.email);
  await abrirAssistente(page);

  await page.getByTestId("assistente-pergunta").fill("qual a taxa de ganho do funil?");
  await page.getByTestId("assistente-perguntar").click();
  await expect(page.getByTestId("assistente-mensagens")).toContainText(/Leitura correta de números/);
});

test("o painel sobrevive à troca de página: continua aberto, com o texto digitado", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, creds.users.agent!.email);
  await abrirAssistente(page);

  const rascunho = "rascunho que ainda não enviei";
  await page.getByTestId("assistente-pergunta").fill(rascunho);

  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Contatos", exact: true })
    .click();
  await page.waitForURL(/\/app\/contacts/);

  await expect(painelDoAssistente(page)).toBeVisible();
  await expect(page.getByTestId("assistente-pergunta")).toHaveValue(rascunho);
});

test("⌘K → Conversar com o assistente abre o mesmo painel", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, creds.users.agent!.email);
  const urlAntes = page.url();

  await page.keyboard.press("Control+K");
  await page.getByRole("option", { name: /Conversar com o assistente/ }).click();

  await expect(painelDoAssistente(page)).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  expect(page.url()).toBe(urlAntes);
  // É o mesmo painel que o ícone do topo abre e fecha.
  await expect(page.getByTestId("assistente-link")).toHaveAttribute("aria-expanded", "true");
});

test("/app/assistente não existe mais: não há página em tela cheia", async ({ page }) => {
  await login(page, creds.users.agent!.email);
  const r = await page.request.get("/app/assistente", { maxRedirects: 0 });
  expect(r.status()).toBe(404);
});
