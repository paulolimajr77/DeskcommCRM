/**
 * O BOTÃO DE ÁUDIO DO CHAT — grava, transcreve e deixa o texto NO CAMPO.
 *
 * O que este arquivo prova:
 *
 *   (a) gravar → parar → o texto transcrito aparece no campo e a pergunta NÃO é
 *       enviada sozinha (nenhuma chamada à rota do chat);
 *   (b) o texto vai para o fim do que já estava escrito;
 *   (c) sem permissão de microfone, a tela diz "libere o microfone";
 *   (d) a rota recusou ("precisa de uma chave da OpenAI"): a frase do servidor
 *       aparece e o campo fica como estava;
 *   (e) durante a gravação o contador está visível e, em espanhol, os rótulos
 *       saem em espanhol.
 *
 * `MediaRecorder` e `getUserMedia` são dublês que REGISTRAM; a rede é dublê.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ChatDoAssistente } from "@/components/assistente/ChatDoAssistente";
import { traduzir } from "@/lib/i18n/dicionario";

const idioma = vi.hoisted(() => ({ atual: "pt-BR" as "pt-BR" | "es" }));
const tsPorIdioma = vi.hoisted(() => new Map<string, (texto: string) => string>());

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ push: vi.fn() }),
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

const rede = vi.hoisted(() => ({
  chamadas: [] as string[],
  transcricao: { status: 200, corpo: { data: { texto: "quero ver os leads de hoje" } } as unknown },
}));

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const u = String(url);
  const metodo = init?.method ?? "GET";
  rede.chamadas.push(`${metodo} ${u}`);
  if (u.startsWith("/api/v1/ai/assistente/threads?")) return json({ data: { threads: [] } });
  if (u === "/api/v1/ai/assistente/transcrever") return json(rede.transcricao.corpo, rede.transcricao.status);
  throw new Error(`fetch inesperado: ${metodo} ${u}`);
}) as typeof fetch;

/** Dublê do gravador: ao parar, entrega um pedaço de áudio e dispara `onstop`. */
class GravadorFalso {
  static suportados = ["audio/webm;codecs=opus", "audio/webm"];
  static isTypeSupported(tipo: string): boolean {
    return GravadorFalso.suportados.includes(tipo);
  }
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((ev: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: MediaStream, opcoes?: { mimeType?: string }) {
    this.mimeType = opcoes?.mimeType ?? "audio/webm";
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(512)], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.();
  }
}

function microfone(permitido: boolean) {
  const faixa = { stop: vi.fn() };
  const stream = { getTracks: () => [faixa] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        if (!permitido) throw new DOMException("negado", "NotAllowedError");
        return stream;
      }),
    },
  });
  return faixa;
}

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <ChatDoAssistente aberto ehAdmin={false} aoAbrirTela={() => {}} />
    </QueryClientProvider>,
  );
}

describe("o chat do assistente — botão de áudio", () => {
  beforeEach(() => {
    vi.stubGlobal("MediaRecorder", GravadorFalso);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    idioma.atual = "pt-BR";
    rede.chamadas = [];
    rede.transcricao = { status: 200, corpo: { data: { texto: "quero ver os leads de hoje" } } };
  });

  it("gravar, parar: o texto aparece no campo e a pergunta NÃO é enviada sozinha", async () => {
    const faixa = microfone(true);
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByTestId("assistente-audio"));
    expect(await screen.findByTestId("assistente-audio-contador")).toBeTruthy();
    await usuario.click(screen.getByTestId("assistente-audio"));

    await waitFor(() =>
      expect((screen.getByTestId("assistente-pergunta") as HTMLInputElement).value).toBe(
        "quero ver os leads de hoje",
      ),
    );
    expect(rede.chamadas).toContain("POST /api/v1/ai/assistente/transcrever");
    // Nada foi enviado ao assistente: quem envia é a pessoa.
    expect(rede.chamadas.some((c) => c.includes("/assistente/chat"))).toBe(false);
    // O microfone foi solto.
    expect(faixa.stop).toHaveBeenCalled();
  });

  it("o texto transcrito vai para o fim do que já estava escrito", async () => {
    microfone(true);
    const usuario = userEvent.setup();
    montar();

    await usuario.type(screen.getByTestId("assistente-pergunta"), "Me diga");
    await usuario.click(screen.getByTestId("assistente-audio"));
    await usuario.click(screen.getByTestId("assistente-audio"));

    await waitFor(() =>
      expect((screen.getByTestId("assistente-pergunta") as HTMLInputElement).value).toBe(
        "Me diga quero ver os leads de hoje",
      ),
    );
    expect(rede.chamadas.some((c) => c.includes("/assistente/chat"))).toBe(false);
  });

  it("sem permissão de microfone, a tela diz para liberar o microfone", async () => {
    microfone(false);
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByTestId("assistente-audio"));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("Libere o microfone no navegador");
    expect(rede.chamadas).not.toContain("POST /api/v1/ai/assistente/transcrever");
  });

  it("a rota recusou por falta de chave: a frase aparece e o campo fica como estava", async () => {
    microfone(true);
    rede.transcricao = {
      status: 422,
      corpo: {
        error: {
          code: "transcription_unavailable",
          message: "A transcrição precisa de uma chave da OpenAI em Credenciais.",
        },
      },
    };
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByTestId("assistente-audio"));
    await usuario.click(screen.getByTestId("assistente-audio"));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("chave da OpenAI em Credenciais");
    expect((screen.getByTestId("assistente-pergunta") as HTMLInputElement).value).toBe("");
  });

  it("em espanhol os rótulos do botão saem em espanhol", async () => {
    idioma.atual = "es";
    microfone(true);
    montar();

    expect(screen.getByTestId("assistente-audio").getAttribute("aria-label")).toBe("Grabar audio");
    const usuario = userEvent.setup();
    await usuario.click(screen.getByTestId("assistente-audio"));
    await waitFor(() =>
      expect(screen.getByTestId("assistente-audio").getAttribute("aria-label")).toBe("Detener la grabación"),
    );
  });
});
