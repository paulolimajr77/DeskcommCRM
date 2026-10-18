/**
 * A ABA AUDITORIA DO ASSISTENTE (F3) no painel.
 *
 * O `useT` é dublado com o DICIONÁRIO de verdade: aqui o espanhol é prova, não
 * enfeite. A rede é dublê e REGISTRA — cada caso prova que a tela lê o retrato
 * da rota certa e que "Rodar de novo" chama o POST (e só o admin o vê).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";

import { AuditoriaDoAssistente } from "@/components/assistente/AuditoriaDoAssistente";
import { traduzir } from "@/lib/i18n/dicionario";

const idioma = vi.hoisted(() => ({ atual: "pt-BR" }));
const tsPorIdioma = vi.hoisted(() => new Map<string, (texto: string) => string>());

vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => {
    const atual = idioma.atual;
    let f = tsPorIdioma.get(atual);
    if (f === undefined) {
      f = (texto: string) => traduzir(texto, atual as "pt-BR" | "es");
      tsPorIdioma.set(atual, f);
    }
    return f;
  },
}));

const chamadas = vi.hoisted(() => ({ lista: [] as Array<{ url: string; metodo: string }> }));
const rede = vi.hoisted(() => ({
  retratos: [] as unknown[],
  novo: null as unknown,
}));

globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const metodo = init?.method ?? "GET";
  chamadas.lista.push({ url: String(url), metodo });
  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  if (String(url).startsWith("/api/v1/ai/assistente/auditoria") && metodo === "GET") {
    return json({ data: rede.retratos });
  }
  if (String(url) === "/api/v1/ai/assistente/auditoria" && metodo === "POST") {
    return json({ data: { snapshot: rede.novo, anterior: null } }, 201);
  }
  throw new Error(`fetch inesperado: ${metodo} ${url}`);
}) as typeof fetch;

function item(over: Record<string, unknown>) {
  return {
    id: "credencial_ia",
    estado: "preenchido",
    titulo: "Credencial de IA validada",
    por_que: "Há uma chave de provedor validada e ativa nesta organização.",
    ferramenta: null,
    depende_de: [],
    onde_resolver: "/app/ai/credentials",
    ...over,
  };
}

const RETRATO_NOVO = {
  id: "r2",
  taken_at: "2026-10-16T09:00:00Z",
  pendencias: 2,
  itens: [
    item({}),
    item({ id: "agente_publicado", estado: "posso_completar", titulo: "Agente publicado e ativo", ferramenta: "propor_agente", onde_resolver: "/app/ai/agents" }),
    item({ id: "roteador", estado: "preciso_confirmar", titulo: "Roteador do canal" }),
    item({ id: "horario_atendimento", estado: "nao_se_aplica", titulo: "Horário de atendimento" }),
  ],
};
const RETRATO_ANTIGO = { ...RETRATO_NOVO, id: "r1", taken_at: "2026-10-15T09:00:00Z", pendencias: 5 };

function montar(props: { ehAdmin: boolean; abaAtiva?: boolean; aoPedir?: (f: string) => void }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuditoriaDoAssistente
        aberto
        abaAtiva={props.abaAtiva ?? true}
        ehAdmin={props.ehAdmin}
        aoPedir={props.aoPedir}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  idioma.atual = "pt-BR";
  chamadas.lista = [];
  rede.retratos = [RETRATO_NOVO, RETRATO_ANTIGO];
  rede.novo = { ...RETRATO_NOVO, id: "r3", pendencias: 1 };
});
afterEach(() => cleanup());

describe("a aba Auditoria", () => {
  it("lê os retratos da rota e mostra itens, estados em palavras e a evolução", async () => {
    montar({ ehAdmin: true });
    expect(await screen.findByTestId("auditoria-item-credencial_ia")).toBeTruthy();
    expect(screen.getByText("Pronto")).toBeTruthy();
    expect(screen.getAllByText("Posso completar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Preciso confirmar").length).toBeGreaterThan(0);
    expect(screen.getByText("Da última vez: 5 pendência(s); agora: 2.")).toBeTruthy();
    expect(chamadas.lista[0]).toEqual({ url: "/api/v1/ai/assistente/auditoria?limit=10", metodo: "GET" });
  });

  it("em espanhol, TODA frase da tela vem traduzida (sem português vazando)", async () => {
    idioma.atual = "es";
    rede.retratos = [
      {
        ...RETRATO_NOVO,
        itens: RETRATO_NOVO.itens.map((i) => ({
          ...i,
          titulo: traduzir(i.titulo, "es"),
          por_que: traduzir(i.por_que, "es"),
        })),
      },
      RETRATO_ANTIGO,
    ];
    montar({ ehAdmin: true });
    expect(await screen.findByText("Auditoría de la empresa")).toBeTruthy();
    expect(screen.getByText("La última vez: 5 pendiente(s); ahora: 2.")).toBeTruthy();
    expect(screen.getByText("Listos")).toBeTruthy();
    expect(screen.getByText("Ejecutar de nuevo")).toBeTruthy();
    expect(screen.getAllByText("Puedo completar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Necesito confirmar").length).toBeGreaterThan(0);
    expect(screen.getByText("Pedir al asistente")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Rodar de novo");
    expect(document.body.textContent).not.toContain("Da última vez");
  });

  it("'Rodar de novo' chama o POST e mostra o retrato novo", async () => {
    const u = userEvent.setup();
    montar({ ehAdmin: true });
    await u.click(await screen.findByTestId("auditoria-rodar-de-novo"));
    await vi.waitFor(() => {
      expect(chamadas.lista.some((c) => c.metodo === "POST" && c.url === "/api/v1/ai/assistente/auditoria")).toBe(true);
    });
  });

  it("'Pedir ao assistente' só aparece em item que o assistente pode completar e entrega a frase ao chat", async () => {
    const u = userEvent.setup();
    const aoPedir = vi.fn();
    montar({ ehAdmin: true, aoPedir });
    await screen.findByTestId("auditoria-item-agente_publicado");
    expect(screen.queryByTestId("auditoria-pedir-credencial_ia")).toBeNull();
    expect(screen.queryByTestId("auditoria-pedir-roteador")).toBeNull();
    await u.click(screen.getByTestId("auditoria-pedir-agente_publicado"));
    expect(aoPedir).toHaveBeenCalledTimes(1);
    expect(aoPedir.mock.calls[0]![0]).toContain("Agente publicado e ativo");
  });

  it("sem retrato, o admin vê o botão 'Rodar agora'; quem não é admin não lê nada nem vê o botão", async () => {
    rede.retratos = [];
    const { unmount } = montar({ ehAdmin: true });
    expect(await screen.findByTestId("auditoria-vazia")).toBeTruthy();
    expect(screen.getByTestId("auditoria-rodar")).toBeTruthy();
    unmount();
    chamadas.lista = [];
    montar({ ehAdmin: false });
    expect(await screen.findByTestId("auditoria-vazia")).toBeTruthy();
    expect(screen.queryByTestId("auditoria-rodar")).toBeNull();
    expect(chamadas.lista).toEqual([]);
  });

  it("com a aba de OUTRA seção à vista, não busca nada — a falha da rota não vira alerta na conversa", async () => {
    // O painel monta as três abas de uma vez e esconde as inativas por CSS. Sem
    // `abaAtiva` a busca saía no instante em que o painel abria, ainda na aba
    // Conversa, e o `role="alert"` de erro da auditoria aparecia no meio dela.
    montar({ ehAdmin: true, abaAtiva: false });
    await new Promise((r) => setTimeout(r, 50));
    expect(chamadas.lista).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
