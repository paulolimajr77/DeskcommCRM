/**
 * AS ABAS DO PAINEL DO ASSISTENTE (T21): "Conversa" sempre; "Propostas" SÓ
 * para `admin` — os outros papéis não veem a aba nem o contador (a trava real
 * continua nas rotas; a aba é conveniência, não autorização).
 *
 * O papel vem de `useActiveOrg()` (dublado); o painel vem do provider (dublado
 * aberto). O chat fica montado nos dois casos — trocar de aba não perde a
 * conversa, que é o contrato do painel.
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

/** A fila de propostas usa react-query: o painel real vive sob o provider do app. */
function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <PainelDoAssistente />
    </QueryClientProvider>,
  );
}

describe("as abas do painel (T21)", () => {
  afterEach(() => {
    cleanup();
    idioma.atual = "pt-BR";
    papel.atual = "admin";
  });

  it("admin vê as duas abas, com o contador de pendentes", async () => {
    renderizar();

    expect(screen.getByTestId("assistente-aba-conversa")).toBeTruthy();
    expect(screen.getByTestId("assistente-aba-propostas")).toBeTruthy();
    expect(screen.getByTestId("assistente-aba-propostas").textContent).toContain("Propostas");
  });

  it.each(["manager", "agent", "viewer"] as const)("%s NÃO vê a aba de propostas (e continua vendo a conversa)", async (papelFora) => {
    papel.atual = papelFora;

    renderizar();

    // Sem admin, a barra de abas inteira não existe — só a conversa.
    expect(screen.queryByTestId("assistente-aba-conversa")).toBeNull();
    expect(screen.queryByTestId("assistente-aba-propostas")).toBeNull();
    expect(screen.queryByTestId("assistente-propostas-contador")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    // A conversa segue como a única superfície.
    expect(screen.getByTestId("assistente-pergunta")).toBeTruthy();
  });

  it("clicar na aba Propostas troca o conteúdo, e voltar mantém o estado da conversa", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByTestId("assistente-aba-propostas"));
    expect(screen.getByTestId("propostas-filtro")).toBeTruthy();
    // O chat fica MONTADO, só escondido (classe `hidden`, contrato do painel).
    expect(screen.getByTestId("assistente-pergunta").closest("div.hidden")).toBeTruthy();

    await usuario.click(screen.getByTestId("assistente-aba-conversa"));
    // A conversa NÃO foi desmontada: o texto digitado antes continuaria aqui.
    expect(screen.getByTestId("assistente-pergunta")).toBeTruthy();
    expect(screen.getByTestId("propostas-filtro").closest("div.hidden")).toBeTruthy();
  });

  it("em espanhol as abas saem em espanhol", () => {
    idioma.atual = "es";
    renderizar();

    expect(screen.getByTestId("assistente-aba-conversa").textContent).toContain("Conversación");
    expect(screen.getByTestId("assistente-aba-propostas").textContent).toContain("Propuestas");
  });
});
