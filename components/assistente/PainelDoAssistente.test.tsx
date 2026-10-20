/**
 * O PAINEL DO ASSISTENTE É UMA CONVERSA SÓ (decisão do dono, 18/10/2026).
 *
 * Antes havia três abas — "Conversa", "Propostas" e "Auditoria" — e o defeito era
 * de desenho: a pergunta numa aba, a decisão em outra. Este arquivo prova o
 * contrato NOVO, e prova contra o defeito antigo:
 *
 *   (a) não existe barra de abas, nem aba de propostas, nem aba de auditoria —
 *       e o botão "Resumo da operação" saiu (quem resume é o `/resumo`);
 *   (b) a conversa é a única superfície, e ela está lá;
 *   (c) o menu de comandos esconde o `/pendentes` de quem não administra —
 *       conveniência de tela; a recusa de verdade é do servidor;
 *   (d) em espanhol a tela sai em espanhol.
 *
 * O papel vem de `useActiveOrg()` (dublado) e o painel do provider (dublado,
 * aberto): é o mesmo arranjo do painel real, sem montar a casca inteira.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PainelDoAssistente } from "@/components/assistente/PainelDoAssistente";
import { traduzir } from "@/lib/i18n/dicionario";

const idioma = vi.hoisted(() => ({ atual: "pt-BR" as "pt-BR" | "es" }));
const papel = vi.hoisted(() => ({ atual: "admin" as "admin" | "manager" | "agent" | "viewer" }));
const push = vi.hoisted(() => vi.fn());
const tsPorIdioma = vi.hoisted(() => new Map<string, (texto: string) => string>());

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ push }),
}));

vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => {
    let f = tsPorIdioma.get(idioma.atual);
    if (f === undefined) {
      f = (texto: string) => traduzir(texto, idioma.atual);
      tsPorIdioma.set(idioma.atual, f);
    }
    return f;
  },
}));

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ orgId: "org-1", name: "Org", role: papel.atual, org_status: "active" }),
}));

vi.mock("@/components/assistente/useEhCelular", () => ({ useEhCelular: () => false }));

vi.mock("@/components/assistente/AssistentePainelProvider", () => ({
  ID_DO_PAINEL_DO_ASSISTENTE: "assistente-painel",
  ID_DO_BOTAO_DO_ASSISTENTE: "assistente-botao",
  useAssistentePainel: () => ({ aberto: true, abrir: vi.fn(), fechar: vi.fn(), alternar: vi.fn() }),
}));

function json(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
}

globalThis.fetch = (async (url: string) => {
  if (typeof url === "string" && url.startsWith("/api/v1/ai/assistente/threads?")) {
    return json({ data: { threads: [] } });
  }
  if (typeof url === "string" && url.startsWith("/api/v1/ai/assistente/propostas?")) {
    return json({ data: [], meta: { cursor: null, has_more: false } });
  }
  if (url === "/api/v1/team") return json([]);
  throw new Error(`fetch inesperado: ${url}`);
}) as typeof fetch;

/** O chat usa react-query: o painel real vive sob o provider do app. */
function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <PainelDoAssistente />
    </QueryClientProvider>,
  );
}

describe("o painel do assistente, chat único", () => {
  afterEach(() => {
    cleanup();
    idioma.atual = "pt-BR";
    papel.atual = "admin";
  });

  it("não tem aba nenhuma: a conversa é a única superfície, e o botão de resumo saiu", async () => {
    renderizar();

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByTestId("assistente-aba-conversa")).toBeNull();
    expect(screen.queryByTestId("assistente-aba-propostas")).toBeNull();
    expect(screen.queryByTestId("assistente-aba-auditoria")).toBeNull();
    // O resumo agora é comando: o botão que existia virou `/resumo`.
    expect(screen.queryByTestId("assistente-resumo")).toBeNull();
    expect(screen.queryByText("Resumo da operação")).toBeNull();

    // E a conversa continua inteira, com o campo de pergunta e a nova conversa.
    expect(screen.getByTestId("assistente-pergunta")).toBeTruthy();
    expect(screen.getByTestId("assistente-nova-conversa")).toBeTruthy();
    expect(screen.getByTestId("assistente-mensagens")).toBeTruthy();
  });

  it("admin: digitar / abre o menu com o comando de pendências", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(screen.getByTestId("assistente-pergunta"), "/");

    expect(await screen.findByTestId("assistente-menu-comandos")).toBeTruthy();
    expect(screen.getByTestId("assistente-comando-resumo")).toBeTruthy();
    expect(screen.getByTestId("assistente-comando-pendentes")).toBeTruthy();
    expect(screen.getByTestId("assistente-comando-ajuda")).toBeTruthy();
  });

  it.each(["manager", "agent", "viewer"] as const)(
    "%s não vê o /pendentes no menu — e vê todo o resto",
    async (papelFora) => {
      papel.atual = papelFora;
      const usuario = userEvent.setup();
      renderizar();

      await usuario.type(screen.getByTestId("assistente-pergunta"), "/");
      await screen.findByTestId("assistente-menu-comandos");

      expect(screen.queryByTestId("assistente-comando-pendentes")).toBeNull();
      expect(screen.getByTestId("assistente-comando-resumo")).toBeTruthy();
      expect(screen.getByTestId("assistente-comando-checkup")).toBeTruthy();
      expect(screen.getByTestId("assistente-comando-ajuda")).toBeTruthy();
      expect(screen.getByTestId("assistente-comando-nova")).toBeTruthy();
    },
  );

  it("em espanhol a tela sai em espanhol", () => {
    idioma.atual = "es";
    renderizar();

    expect(screen.getByTestId("assistente-nova-conversa").textContent).toContain("Nueva conversación");
    expect(document.body.textContent).not.toContain("Nova conversa");
  });
});
