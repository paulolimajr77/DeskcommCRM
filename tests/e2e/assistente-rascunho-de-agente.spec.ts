/**
 * Assistente interno, F2a (T17). Prova, na perspectiva do administrador: pedir
 * "monta o agente da minha clínica" no chat cria o agente como RASCUNHO.
 *
 * O PAR (`docs/doctrine/prova-em-par.md`) mede os DOIS lados com o mesmo
 * pedido: (a) pela tela, o cartão "Criado como rascunho" aparece com o nome
 * do agente; (b) fora do agente, `GET /api/v1/ai/agents` (mesma sessão)
 * mostra o agente existente, em estado rascunho, e nenhuma versão publicada
 * (`published_version_id` nulo). Só conta quando os dois concordam — se
 * discordarem, o que se mediu foi o modelo, e o defeito continua onde estava.
 *
 * As respostas vêm do DUBLÊ do modelo (`INTERNAL_AGENT_RUN_STUB`): provam o
 * caminho painel → rota → ferramenta real → tela. A ferramenta
 * `montar_pacote_do_nicho` executa de verdade, com a sessão do admin (cria o
 * rascunho pela mesma rota da tela, com `requireRole` + `audit()` + RLS).
 * Nenhum modelo real é chamado.
 *
 * Login como admin (papel mínimo da escrita — só `admin` tem as ferramentas
 * de escrita e o bloco de conduta). A credencial de IA validada que
 * `criar_rascunho_de_agente` exige é garantida abaixo com o service role
 * (etiqueta própria, apagada no fim) — sem ela a ferramenta recusaria com
 * PRECISO CONFIRMAR e não haveria cartão para medir.
 */
import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { test, expect, type Page } from "./helpers/test";
import { cifrarChaveDeTeste } from "./helpers/chave-de-ia-de-teste";
import { lerCreds, loginComoAdmin, type CredsE2E } from "./helpers/login-admin";

const ETIQUETA_DA_CREDENCIAL = "E2E Assistente Rascunho";

let creds: CredsE2E = lerCreds();
let credencialId: string | null = null;
let organizacaoId: string | null = null;

test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => {
  const env = credenciaisSupabaseDeTeste();
  const admin = createClient(env.url, env.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: org } = await admin
    .from("organizations")
    .select("id, settings")
    .eq("slug", "e2e-test-org")
    .maybeSingle();
  if (!org) throw new Error("org e2e-test-org ausente — rode scripts/seed-e2e-credentials.ts antes");
  organizacaoId = (org as { id: string }).id;
  const llm = (org as { settings: { llm?: { provider?: string } } }).settings?.llm ?? {};
  const provedor = typeof llm.provider === "string" ? llm.provider : "anthropic";

  await admin.from("ai_provider_credentials").delete().eq("organization_id", organizacaoId).eq("label", ETIQUETA_DA_CREDENCIAL);
  const { data: cred, error } = await admin
    .from("ai_provider_credentials")
    .insert({
      organization_id: organizacaoId,
      provider: provedor,
      label: ETIQUETA_DA_CREDENCIAL,
      // CIFRADA de verdade: o seam decifra a credencial da organização, e bytes de
      // enfeite derrubam o turno com TypeError (ver o helper).
      ...cifrarChaveDeTeste("chave-de-teste-e2e"),
      is_active: true,
      validated_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  if (error || !cred) throw new Error(`não consegui semear a credencial do e2e: ${error?.message}`);
  credencialId = (cred as { id: string }).id;
});

test.afterAll(async () => {
  if (organizacaoId === null) return;
  const env = credenciaisSupabaseDeTeste();
  const admin = createClient(env.url, env.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // O que o pacote criou nesta org: agentes com o nome do dublê + versões.
  const { data: agentes } = await admin
    .from("ai_agents")
    .select("id")
    .eq("organization_id", organizacaoId)
    .like("name", "Agente Clinica E2E %");
  for (const agente of (agentes ?? []) as Array<{ id: string }>) {
    await admin.from("ai_agent_versions").delete().eq("agent_id", agente.id);
    await admin.from("ai_agents").delete().eq("id", agente.id);
  }
  // O follow-up instalado como rascunho pelo pacote: o montador não passa
  // `nome`, então a rota grava o nome do modelo
  // ("Consulta · retomar quem sumiu na marcação"). Nome exato, nunca
  // substring: a substring varreria fluxos de outras specs no banco
  // compartilhado da parte.
  await admin
    .from("followup_flow_pointers")
    .delete()
    .eq("organization_id", organizacaoId)
    .eq("name", "Consulta · retomar quem sumiu na marcação");
  if (credencialId !== null) {
    await admin.from("ai_provider_credentials").delete().eq("id", credencialId);
  }
});

const painelDoAssistente = (page: Page) => page.getByRole("complementary", { name: "Assistente" });

/** Abre o painel pelo ícone do topo. A URL não muda: o assistente não é uma página. */
async function abrirAssistente(page: Page): Promise<void> {
  const urlAntes = page.url();
  await page.getByTestId("assistente-link").click();
  await expect(painelDoAssistente(page)).toBeVisible();
  expect(page.url()).toBe(urlAntes);
}

test("par: pedir o agente da clínica no chat cria o rascunho (tela × GET direto)", async ({ page }) => {
  creds = await loginComoAdmin(page, creds);
  await abrirAssistente(page);

  // O MESMO pedido dos dois lados do par.
  await page.getByTestId("assistente-pergunta").fill("monta o agente da minha clínica");
  await page.getByTestId("assistente-perguntar").click();

  // Lado (a) — pela tela: o cartão "Criado como rascunho" com o nome do agente.
  const cartaoDoAgente = page
    .getByTestId("assistente-cartao")
    .filter({ hasText: "Agente" })
    .first();
  await expect(cartaoDoAgente).toBeVisible({ timeout: 60_000 });
  await expect(cartaoDoAgente).toContainText("Criado como rascunho");
  await expect(cartaoDoAgente).toContainText("Nada foi publicado.");
  const nome = await cartaoDoAgente.getAttribute("aria-label");
  expect(nome, "o cartão traz o nome do agente criado").toBeTruthy();

  // Lado (b) — fora do agente: o MESMO nome existe no GET direto, em rascunho,
  // sem nada publicado. Mesma sessão, mesmo escopo RLS.
  const direto = await page.request.get("/api/v1/ai/agents");
  expect(direto.ok()).toBe(true);
  const corpo = (await direto.json()) as {
    data: Array<{ id: string; name: string; published_version_id: string | null }>;
  };
  const agente = corpo.data.find((a) => a.name === nome);
  // Os dois lados concordam: o cartão nomeia quem o banco guarda.
  expect(agente, `o agente "${nome}" existe no GET direto`).toBeDefined();
  expect(agente!.published_version_id, "nada foi publicado").toBeNull();
});
