/**
 * O PAINEL LATERAL DO ASSISTENTE É A ÚNICA SUPERFÍCIE DELE (T8, F1b).
 *
 * Decisão do dono, 14/10/2026: não existe página em tela cheia. O ícone de IA
 * do topo e o item "Conversar com o assistente" do ⌘K abrem O MESMO painel,
 * montado na casca e escondido (não desmontado) quando fechado — por isso a
 * conversa, a rolagem e o texto digitado sobrevivem à troca de página.
 *
 * ─── O que este arquivo prova ───────────────────────────────────────────────
 *
 *   (a) o painel sobrevive à troca de `pathname`: o MESMO nó do DOM, com a
 *       conversa e o texto digitado; e a casca o monta fora do `<main>`;
 *   (b) o botão do topo abre e o mesmo botão fecha;
 *   (c) o item do ⌘K abre o mesmo painel e fecha a paleta, sem `router.push`;
 *   (d) "Abrir {tela}" só navega no clique e recusa o que não é `/app/`;
 *   (e) a página `/app/assistente`, o atalho-link e a entrada do catálogo
 *       não existem mais.
 *
 * ─── O que NÃO prova ────────────────────────────────────────────────────────
 *
 * Geometria. O jsdom não faz layout: o painel ao lado da tela (desktop) e em
 * tela cheia acima do rodapé (celular) é medido no navegador. Aqui só o TEXTO
 * do contrato com o rodapé é cobrado (`--rodape-ocupado`).
 */
import { useState } from "react";
import { readFileSync, existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChatDoAssistente } from "@/components/assistente/ChatDoAssistente";
import { AssistentePainelProvider } from "@/components/assistente/AssistentePainelProvider";
import { PainelDoAssistente } from "@/components/assistente/PainelDoAssistente";
import { BotaoDoAssistente } from "@/components/shell/BotaoDoAssistente";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { NAV_CATALOG, NAV_GROUPS } from "@/lib/navigation/catalogo";

const rota = vi.hoisted(() => ({ caminho: "/app/inbox" }));
const push = vi.hoisted(() => vi.fn());
const authRef = vi.hoisted(() => ({
  user: { is_platform_admin: false },
  activeOrg: { orgId: "org-1", name: "Org", role: "admin" } as {
    orgId: string;
    name: string;
    role: string;
  } | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => rota.caminho,
  useRouter: () => ({ push }),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => authRef }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

// ─── fetch dublê ────────────────────────────────────────────────────────────

interface RespostaFalsa {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function resposta(corpo: unknown, status = 200): RespostaFalsa {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo };
}

const NOME_DA_CHAVE = "assistente:conversa-da-aba";

const rede = vi.hoisted(() => ({
  chat: undefined as undefined | ((corpo: Record<string, unknown>) => Promise<unknown>),
  mensagensDaThread: undefined as undefined | (() => unknown),
}));
const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
  if (url.startsWith("/api/v1/ai/assistente/threads?")) return resposta({ data: { threads: [] } });
  if (/\/api\/v1\/ai\/assistente\/threads\/[^/]+\/messages/.test(url)) {
    return (rede.mensagensDaThread?.() ?? resposta({ data: { mensagens: [] } })) as RespostaFalsa;
  }
  if (url === "/api/v1/ai/assistente/chat") {
    const corpo = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
    return (await rede.chat?.(corpo)) as RespostaFalsa;
  }
  throw new Error(`fetch inesperado: ${url}`);
});

function respostaDoChat(extra: Record<string, unknown> = {}): RespostaFalsa {
  return resposta({
    data: {
      thread_id: "thread-1",
      turn_id: "t",
      resposta: "Há 7 conversas em atendimento.",
      fonte: "modelo",
      aviso: null,
      acoes: [],
      metricas: [],
      replay: false,
      ...extra,
    },
  });
}

// ─── harness ────────────────────────────────────────────────────────────────

function PaletaControlada() {
  const [aberta, setAberta] = useState(true);
  return <CommandPalette open={aberta} onOpenChange={setAberta} />;
}

function Casca({ comPaleta = false }: { comPaleta?: boolean }) {
  return (
    <AssistentePainelProvider>
      <BotaoDoAssistente />
      {comPaleta ? <PaletaControlada /> : null}
      <PainelDoAssistente />
    </AssistentePainelProvider>
  );
}

const painelAcessivel = () => screen.queryByRole("complementary", { name: "Assistente" });
const painelNoDom = () => screen.getByTestId("assistente-painel");

async function perguntar(usuario: ReturnType<typeof userEvent.setup>, texto: string) {
  await usuario.type(screen.getByTestId("assistente-pergunta"), texto);
  await usuario.click(screen.getByTestId("assistente-perguntar"));
}

function emularCelular() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (consulta: string) => ({
      matches: false, // "(min-width: 768px)" falso = celular
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  rede.chat = async () => respostaDoChat();
  rede.mensagensDaThread = undefined;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  push.mockClear();
  rota.caminho = "/app/inbox";
  authRef.activeOrg = { orgId: "org-1", name: "Org", role: "admin" };
  // Remove o dublê de matchMedia (o jsdom não define o seu).
  Reflect.deleteProperty(window, "matchMedia");
  try {
    window.sessionStorage.clear();
  } catch {
    // sem armazenamento: nada a limpar
  }
});

// ─── (a) sobrevive à troca de página ────────────────────────────────────────

describe("(a) o painel sobrevive à troca de página", () => {
  it("mesmo nó do DOM, mesma conversa, mesmo texto digitado depois de o caminho mudar", async () => {
    const usuario = userEvent.setup();
    const { rerender } = render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));

    await perguntar(usuario, "quantas conversas?");
    const bolha = await screen.findByText("Há 7 conversas em atendimento.");
    await usuario.type(screen.getByTestId("assistente-pergunta"), "rascunho que ainda não enviei");
    const campo = screen.getByTestId("assistente-pergunta");
    const painel = painelNoDom();

    rota.caminho = "/app/kanban";
    rerender(<Casca />);

    expect(painelNoDom()).toBe(painel);
    expect(screen.getByTestId("assistente-pergunta")).toBe(campo);
    expect((campo as HTMLInputElement).value).toBe("rascunho que ainda não enviei");
    expect(screen.getByText("Há 7 conversas em atendimento.")).toBe(bolha);
    expect(painelAcessivel()).not.toBeNull();
  });

  it("fechado, o painel continua no DOM (escondido e inerte) — a conversa não é desmontada", async () => {
    const usuario = userEvent.setup();
    render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));
    await perguntar(usuario, "quantas conversas?");
    const bolha = await screen.findByText("Há 7 conversas em atendimento.");

    await usuario.click(screen.getByTestId("assistente-fechar"));

    expect(painelNoDom()).toHaveAttribute("hidden");
    expect(painelNoDom()).toHaveAttribute("inert");
    expect(painelAcessivel()).toBeNull();
    expect(screen.getByText("Há 7 conversas em atendimento.")).toBe(bolha);
  });

  it("a casca monta o painel FORA do <main>, dentro do provedor, e sem chave por caminho", () => {
    const casca = readFileSync("app/app/_components/AppShell.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const painel = casca.indexOf("<PainelDoAssistente />");
    const fimDoMain = casca.indexOf("</main>");
    expect(painel, "a casca não monta o painel").toBeGreaterThan(-1);
    expect(painel, "o painel voltou para dentro do <main>").toBeGreaterThan(fimDoMain);
    expect(casca.indexOf("<AssistentePainelProvider>")).toBeLessThan(casca.indexOf("<TopBar />"));
    expect(casca.indexOf("</AssistentePainelProvider>")).toBeGreaterThan(painel);
    // Chave por caminho desmontaria o painel a cada troca de página.
    expect(casca).not.toMatch(/key=\{[^}]*(pathname|caminho)/);
  });

  it("reabre a conversa guardada na aba e esquece a que a rota não reconhece (404)", async () => {
    window.sessionStorage.setItem(NOME_DA_CHAVE, "thread-guardada");
    rede.mensagensDaThread = () =>
      resposta({ data: { mensagens: [{ id: "m1", author_kind: "ai", body: "Conversa de antes." }] } });
    const usuario = userEvent.setup();
    render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));
    expect(await screen.findByText("Conversa de antes.")).toBeTruthy();

    cleanup();
    window.sessionStorage.setItem(NOME_DA_CHAVE, "thread-de-outra-org");
    rede.mensagensDaThread = () => resposta({ error: { code: "not_found", message: "Conversa não encontrada." } }, 404);
    render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));
    await waitFor(() => expect(window.sessionStorage.getItem(NOME_DA_CHAVE)).toBeNull());
    expect(screen.queryByText("Conversa de antes.")).toBeNull();
  });

  it("envia o caminho da tela e SÓ o caminho", async () => {
    rota.caminho = "/app/ai/agents/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/prompt";
    const corpos: Array<Record<string, unknown>> = [];
    rede.chat = async (corpo) => {
      corpos.push(corpo);
      return respostaDoChat();
    };
    const usuario = userEvent.setup();
    render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));
    await perguntar(usuario, "melhore o prompt deste agente");
    await screen.findByText("Há 7 conversas em atendimento.");
    expect(corpos[0]!.contexto).toEqual({ caminho: rota.caminho });
  });
});

// ─── (b) o botão do topo abre e fecha ───────────────────────────────────────

describe("(b) o botão do topo abre e o mesmo botão fecha", () => {
  it("alterna o painel e conta a verdade em aria-expanded", async () => {
    const usuario = userEvent.setup();
    render(<Casca />);
    const botao = screen.getByTestId("assistente-link");

    expect(botao.tagName).toBe("BUTTON");
    expect(botao).toHaveAttribute("aria-label", "Assistente");
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(botao.getAttribute("aria-controls")).toBe(painelNoDom().id);
    expect(painelAcessivel()).toBeNull();

    await usuario.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(painelAcessivel()).not.toBeNull();
    expect(painelNoDom()).not.toHaveAttribute("hidden");
    expect(push, "o botão não navega").not.toHaveBeenCalled();

    await usuario.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(painelAcessivel()).toBeNull();
    expect(painelNoDom()).toHaveAttribute("hidden");
  });

  it("ao abrir, o foco vai para o campo de pergunta; ao fechar, volta para o botão", async () => {
    const usuario = userEvent.setup();
    render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));
    expect(document.activeElement).toBe(screen.getByTestId("assistente-pergunta"));

    await usuario.click(screen.getByTestId("assistente-fechar"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("assistente-link")));
  });

  it("sem organização ativa não há botão", () => {
    authRef.activeOrg = null;
    render(<Casca />);
    expect(screen.queryByTestId("assistente-link")).toBeNull();
  });

  it("Escape fecha no celular (diálogo) e NÃO fecha no desktop (complementar)", async () => {
    const usuario = userEvent.setup();
    const desktop = render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));
    await usuario.keyboard("{Escape}");
    expect(painelAcessivel(), "no desktop o Escape não fecha a coluna de trabalho").not.toBeNull();
    desktop.unmount();

    emularCelular();
    render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));
    const dialogo = screen.getByRole("dialog", { name: "Assistente" });
    expect(dialogo).not.toHaveAttribute("hidden");
    await usuario.keyboard("{Escape}");
    expect(painelNoDom()).toHaveAttribute("hidden");
  });

  it("o contrato com o rodapé: no celular o fundo do painel sobe pela faixa que as peças fixas ocupam", () => {
    const fonte = readFileSync("components/assistente/PainelDoAssistente.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(fonte).toMatch(/bottom-\[var\(--rodape-ocupado,0px\)\]/);
    // Sem medida de rodapé escrita à mão (a #1305 inteira é sobre isso).
    expect(fonte).not.toMatch(/(?:^|\s)bottom-\d/);
    expect(fonte).not.toMatch(/calc\(100dvh/);
  });
});

// ─── (c) o ⌘K abre o MESMO painel ───────────────────────────────────────────

describe("(c) o item do ⌘K abre o mesmo painel", () => {
  const ITEM = /Conversar com o assistente/;

  it("clicar no item fecha a paleta, abre o painel e NÃO navega", async () => {
    const usuario = userEvent.setup();
    render(<Casca comPaleta />);
    expect(painelAcessivel()).toBeNull();

    await usuario.click(screen.getByRole("option", { name: ITEM }));

    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    await waitFor(() => expect(painelAcessivel()).not.toBeNull());
    expect(push).not.toHaveBeenCalled();
    // É o MESMO botão que enxerga o estado.
    expect(screen.getByTestId("assistente-link")).toHaveAttribute("aria-expanded", "true");
  });

  it("Enter com a paleta recém-aberta (o assistente vem no topo) abre o painel, sem navegar", async () => {
    const usuario = userEvent.setup();
    render(<Casca comPaleta />);
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Conversar com o assistente");
    await usuario.keyboard("{Enter}");
    await waitFor(() => expect(painelAcessivel()).not.toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  it("a busca o acha por assistente, conversar, perguntar e ia — e não por um termo alheio", async () => {
    const usuario = userEvent.setup();
    render(<Casca comPaleta />);
    const busca = screen.getByRole("combobox");
    for (const termo of ["assistente", "conversar", "perguntar", "ia"]) {
      await usuario.clear(busca);
      await usuario.type(busca, termo);
      expect(screen.queryByRole("option", { name: ITEM }), termo).not.toBeNull();
    }
    await usuario.clear(busca);
    await usuario.type(busca, "zzzzzz");
    expect(screen.queryByRole("option", { name: ITEM })).toBeNull();
    expect(screen.getByText(/Nada encontrado/i)).toBeTruthy();
  });

  it("as setas passam do assistente para a primeira tela sem pular, e Enter navega", async () => {
    const usuario = userEvent.setup();
    render(<Casca comPaleta />);
    await usuario.keyboard("{ArrowDown}");
    const primeira = screen.getAllByRole("option").find((o) => o.getAttribute("data-href") !== null)!;
    expect(primeira).toHaveAttribute("aria-selected", "true");
    await usuario.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith(primeira.getAttribute("data-href"));
  });

  it("o item não entra na contagem de telas nem nas categorias", () => {
    render(<Casca comPaleta />);
    const todas = screen.getByRole("button", { name: /^Todas \(\d+\)/ });
    const telas = screen.getAllByRole("option").filter((o) => o.getAttribute("data-href") !== null);
    expect(todas.textContent).toContain(`(${telas.length})`);
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /Assistente/ })).toBeNull();
  });

  it("sem painel montado, a paleta não oferece o item (nada a abrir)", () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    expect(screen.queryByRole("option", { name: ITEM })).toBeNull();
  });
});

// ─── (d) "Abrir {tela}" ─────────────────────────────────────────────────────

describe("(d) o botão Abrir {tela} só navega no clique e só para dentro de /app/", () => {
  it("mostra só os botões internos; nenhum navega sozinho; o clique navega e o painel fica", async () => {
    rede.chat = async () =>
      respostaDoChat({
        acoes: [
          { tipo: "abrir_tela", rotulo: "Abrir Funis", href: "/app/kanban" },
          { tipo: "abrir_tela", rotulo: "Abrir site de fora", href: "https://evil.example/app/x" },
          { tipo: "abrir_tela", rotulo: "Abrir sem protocolo", href: "//evil.example/app/x" },
          { tipo: "abrir_tela", rotulo: "Abrir a API", href: "/api/v1/contacts" },
          { tipo: "abrir_tela", rotulo: "Abrir script", href: "javascript:alert(1)" },
          { tipo: "abrir_tela", rotulo: "Abrir quase", href: "/application" },
        ],
      });
    const usuario = userEvent.setup();
    render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));
    await perguntar(usuario, "onde vejo meus funis?");
    await screen.findByText("Há 7 conversas em atendimento.");

    const botoes = screen.getAllByTestId("assistente-acao");
    expect(botoes.map((b) => b.textContent)).toEqual(["Abrir Funis"]);
    expect(push, "nada navega antes do clique").not.toHaveBeenCalled();

    await usuario.click(botoes[0]!);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/app/kanban");
    // O painel não fecha nem desmonta ao navegar (no desktop).
    expect(painelAcessivel()).not.toBeNull();
    expect(within(painelNoDom()).getByText("Há 7 conversas em atendimento.")).toBeTruthy();
  });

  it("o aviso do piso aparece como nota, separado do texto", async () => {
    const aviso = "Conecte uma chave de IA em IA › Provedores para o assistente responder com inteligência.";
    rede.chat = async () => respostaDoChat({ fonte: "piso", aviso, resposta: `${aviso}\n\nResumo do piso.` });
    const usuario = userEvent.setup();
    render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));
    await perguntar(usuario, "resumo da operação");
    await screen.findByText("Resumo do piso.");
    expect(screen.getByRole("note")).toHaveTextContent(aviso);
    expect(screen.getAllByText(aviso)).toHaveLength(1);
  });

  it("mostra 'Pensando…' enquanto espera e a frase do envelope quando a rota recusa", async () => {
    let soltar: (r: RespostaFalsa) => void = () => {};
    rede.chat = () => new Promise<RespostaFalsa>((resolver) => (soltar = resolver));
    const usuario = userEvent.setup();
    render(<Casca />);
    await usuario.click(screen.getByTestId("assistente-link"));
    await perguntar(usuario, "quantas conversas?");
    expect(await screen.findByTestId("assistente-pensando")).toHaveTextContent("Pensando…");

    soltar(
      resposta(
        { error: { code: "rate_limited", message: "Você chegou ao limite de perguntas de hoje. Peça a um administrador para ajustar em Uso de IA › Orçamento." } },
        429,
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Você chegou ao limite de perguntas de hoje.");
    expect(screen.queryByTestId("assistente-pensando")).toBeNull();
    // A pergunta volta para o campo: nada se perde.
    expect((screen.getByTestId("assistente-pergunta") as HTMLInputElement).value).toBe("quantas conversas?");
  });
});

// ─── (e) a página, o atalho-link e a entrada do catálogo não existem mais ──

describe("(e) não existe página em tela cheia", () => {
  it("a rota /app/assistente e o atalho-link foram removidos", () => {
    expect(existsSync("app/app/assistente"), "a página provisória voltou").toBe(false);
    expect(existsSync("components/shell/AssistenteLink.tsx"), "o atalho-link voltou").toBe(false);
  });

  it("o catálogo de navegação não tem a entrada nem o grupo do assistente", () => {
    expect(NAV_CATALOG.some((d) => String(d.href).startsWith("/app/assistente"))).toBe(false);
    expect((NAV_GROUPS as ReadonlyArray<{ id: string }>).some((g) => g.id === "assistente")).toBe(false);
    expect((NAV_CATALOG as ReadonlyArray<{ group: string }>).some((d) => d.group === "assistente")).toBe(false);
  });
});

// O chat sozinho (sem painel em volta) continua montável: nada nele exige o provedor.
describe("o chat não depende do provedor do painel", () => {
  it("monta fora do painel", () => {
    render(<ChatDoAssistente aberto={false} aoAbrirTela={() => {}} />);
    expect(screen.getByTestId("assistente-pergunta")).toBeTruthy();
  });
});
