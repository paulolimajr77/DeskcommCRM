import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ChatDoAssistente } from "@/components/assistente/ChatDoAssistente";
import { traduzir } from "@/lib/i18n/dicionario";

const idioma = vi.hoisted(() => ({ atual: "pt-BR" as "pt-BR" | "es" }));
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

const NL = String.fromCharCode(10);

globalThis.fetch = (async (url: string) => {
  if (url.startsWith("/api/v1/ai/assistente/threads?")) {
    return { ok: true, status: 200, json: async () => ({ data: { threads: [{ id: "t1", created_at: "2026-01-01T00:00:00Z", last_message_at: null }] } }) };
  }
  if (url === "/api/v1/ai/assistente/threads/t1/messages") {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          mensagens: [
            { id: "m1", author_kind: "ai" as const, body: `Primeiro parágrafo.${NL}${NL}Segundo parágrafo com lista:${NL}- item um${NL}- item dois${NL}- item três` },
          ],
        },
      }),
    };
  }
  throw new Error(`fetch inesperado: ${url}`);
}) as typeof fetch;

function montar() {
  // Simula uma conversa guardada para que o chat carregue as mensagens da thread t1.
  window.sessionStorage.setItem("assistente:conversa-da-aba", "t1");
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <ChatDoAssistente aberto ehAdmin={true} aoAbrirTela={() => {}} />
    </QueryClientProvider>,
  );
}

describe("bolha do assistente — HTML válido", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    idioma.atual = "pt-BR";
    window.sessionStorage.removeItem("assistente:conversa-da-aba");
  });

  it("não tem parágrafo dentro de parágrafo, nem lista dentro de parágrafo", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("Primeiro parágrafo.")).toBeTruthy());

    const mensagens = screen.getByTestId("assistente-mensagens");
    // O container da bolha do assistente é um <div>, não <p>: não deve conter
    // <p> dentro de <p>, nem <ul>/<ol> dentro de <p>.
    expect(mensagens.querySelector("p p")).toBeNull();
    expect(mensagens.querySelector("p ul")).toBeNull();
    expect(mensagens.querySelector("p ol")).toBeNull();

    // Mas o conteúdo do assistente está lá, renderizado corretamente.
    expect(screen.getByText("Primeiro parágrafo.")).toBeTruthy();
    expect(screen.getByText("Segundo parágrafo com lista:")).toBeTruthy();
    expect(screen.getByText("item um")).toBeTruthy();
    expect(screen.getByText("item dois")).toBeTruthy();
    expect(screen.getByText("item três")).toBeTruthy();
  });
});
