/**
 * Assistente interno, F1 leitura. Prova, na perspectiva do usuário real:
 * (1) o atalho no topo leva a /app/assistente; (2) o botão de resumo devolve
 * números da operação; (3) uma pergunta de guia devolve trecho do guia.
 * Login como agent (papel mínimo do chat).
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

async function gotoAssistente(page: Page): Promise<void> {
  await page.getByTestId("assistente-link").click();
  await page.waitForURL(/\/app\/assistente/);
  await expect(page.getByRole("heading", { name: "Assistente" })).toBeVisible();
}

test("o atalho no topo abre o assistente e o resumo devolve números", async ({ page }) => {
  await login(page, creds.users.agent!.email);
  await gotoAssistente(page);

  await page.getByTestId("assistente-resumo").click();
  const mensagens = page.getByTestId("assistente-mensagens");
  await expect(mensagens).toContainText(/conversas em atendimento/);
  await expect(mensagens).toContainText(/negócios abertos/);
});

test("pergunta de guia devolve trecho do guia, não silêncio", async ({ page }) => {
  await login(page, creds.users.agent!.email);
  await gotoAssistente(page);

  await page.getByTestId("assistente-pergunta").fill("como ler o funil?");
  await page.getByTestId("assistente-perguntar").click();
  await expect(page.getByTestId("assistente-mensagens")).toContainText(/stage_changed/);
});
