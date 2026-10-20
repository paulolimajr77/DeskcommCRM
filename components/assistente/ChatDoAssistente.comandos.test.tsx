/**
 * OS COMANDOS COM BARRA E A DECISÃO DENTRO DA CONVERSA (decisão do dono, 18/10/2026).
 *
 * ─── O que este arquivo prova ───────────────────────────────────────────────
 *
 *   (a) "/" abre o menu, as setas andam e Enter escolhe; o comando inteiro
 *       digitado também funciona (o menu é atalho, não pedágio);
 *   (b) `/nova` é gesto LOCAL: limpa a conversa sem ir ao servidor;
 *   (c) quem não administra não vê `/pendentes` no menu — e, digitando à mão, é
 *       o SERVIDOR quem responde (a tela não é a autorização);
 *   (d) o admin que abre o painel com pendências vê o anúncio e os CARTÕES;
 *   (e) responder "pode" aplica a ÚLTIMA mudança pendente da conversa — e só
 *       ela — com o desfecho ("Pronto: …") virando mensagem;
 *   (f) a decisão de um clique no cartão chama aprovar e aplicar EM SEQUÊNCIA;
 *   (g) o cartão de checkup chega na conversa e "Pedir ao assistente" prepara a
 *       frase no campo.
 *
 * A rede é dublê e REGISTRA: cada caso prova a rota chamada. O `useT` é dublado
 * com o DICIONÁRIO de verdade (o espanhol do caminho novo é prova).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const rede = vi.hoisted(() => ({
  /** A fila oficial (`GET /api/v1/ai/assistente/propostas`). */
  fila: [] as Array<Record<string, unknown>>,
  /** O `data` da resposta do chat. */
  resposta: null as unknown,
  chamadas: [] as string[],
}));

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const ACAO_DE_PROPOSTA = /^\/api\/v1\/ai\/assistente\/propostas\/([^/]+)\/(aprovar|aplicar|rejeitar)$/;

globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const u = String(url);
  const metodo = init?.method ?? "GET";
  rede.chamadas.push(`${metodo} ${u}`);
  if (u.startsWith("/api/v1/ai/assistente/threads?")) return json({ data: { threads: [] } });
  if (u.startsWith("/api/v1/ai/assistente/propostas?")) return json({ data: rede.fila });
  const acao = ACAO_DE_PROPOSTA.exec(u);
  if (acao !== null) {
    const alvo = rede.fila.find((p) => p.id === acao[1]) ?? {};
    const status = acao[2] === "rejeitar" ? "rejeitada" : acao[2] === "aplicar" ? "aplicada" : "aprovada";
    return json({ data: { ...alvo, status } });
  }
  if (u === "/api/v1/team") return json([]);
  if (u === "/api/v1/ai/assistente/chat") return json({ data: rede.resposta });
  throw new Error(`fetch inesperado: ${metodo} ${u}`);
}) as typeof fetch;

function proposta(id: string, resumo: string): Record<string, unknown> {
  return {
    id,
    kind: "memoria",
    operacao: "criar",
    risk: "seguro",
    status: "pendente",
    resumo,
    motivo: "A pessoa pediu.",
    antes: null,
    payload: { operacao: "criar", corpo: { title: "Horário", body: "Das 8h às 18h." } },
    requested_by: "user-1",
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    applied_by: null,
    applied_at: null,
    apply_result: null,
    expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    created_at: "2026-10-16T09:00:00Z",
    vencida: false,
  };
}

function montar(over: { ehAdmin?: boolean } = {}) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <ChatDoAssistente
        aberto
        ehAdmin={over.ehAdmin ?? true}
        aoAbrirTela={() => {}}
      />
    </QueryClientProvider>,
  );
}

/** Digita no campo e manda. A pausa deixa o `setPergunta` chegar ao input antes do clique. */
async function enviar(usuario: ReturnType<typeof userEvent.setup>, texto: string) {
  const campo = screen.getByTestId("assistente-pergunta");
  await usuario.clear(campo);
  await usuario.type(campo, texto);
  await usuario.click(screen.getByTestId("assistente-perguntar"));
}

describe("o chat do assistente — comandos e decisões", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    idioma.atual = "pt-BR";
    rede.fila = [];
    rede.resposta = null;
    rede.chamadas = [];
  });

  it("'/' abre o menu, as setas andam e Enter escolhe o comando (que ainda precisa ser enviado)", async () => {
    const usuario = userEvent.setup();
    rede.resposta = { thread_id: "t1", resposta: "Aqui estão os números.", acoes: [] };
    montar();

    await usuario.type(screen.getByTestId("assistente-pergunta"), "/");
    await screen.findByTestId("assistente-menu-comandos");

    // resumo → checkup → pendentes, na ordem da lista.
    await usuario.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect((screen.getByTestId("assistente-pergunta") as HTMLInputElement).value).toBe("/pendentes");
    // Escolher NÃO envia: o menu fecha e o campo espera.
    expect(rede.chamadas.some((c) => c.startsWith("POST /api/v1/ai/assistente/chat"))).toBe(false);

    await usuario.click(screen.getByTestId("assistente-perguntar"));
    expect(await screen.findByText("Aqui estão os números.")).toBeTruthy();
    expect(rede.chamadas).toContain("POST /api/v1/ai/assistente/chat");
  });

  it("digitar o comando inteiro também funciona (o menu é atalho, não pedágio)", async () => {
    const usuario = userEvent.setup();
    rede.resposta = { thread_id: "t1", resposta: "Resumo de hoje.", acoes: [] };
    montar();

    await enviar(usuario, "/resumo");

    expect(await screen.findByText("Resumo de hoje.")).toBeTruthy();
    expect(rede.chamadas).toContain("POST /api/v1/ai/assistente/chat");
  });

  it("'/nova' limpa a conversa SEM ir ao servidor", async () => {
    const usuario = userEvent.setup();
    rede.resposta = { thread_id: "t1", resposta: "Olá.", acoes: [] };
    montar();

    await enviar(usuario, "quantas conversas abertas?");
    await screen.findByText("Olá.");
    const enviosAntes = rede.chamadas.filter((c) => c.startsWith("POST /api/v1/ai/assistente/chat")).length;

    await enviar(usuario, "/nova");

    await waitFor(() => expect(screen.queryByText("Olá.")).toBeNull());
    expect(rede.chamadas.filter((c) => c.startsWith("POST /api/v1/ai/assistente/chat")).length).toBe(
      enviosAntes,
    );
  });

  it("quem não administra não vê /pendentes no menu — e digitá-lo à mão vai ao servidor, que é quem recusa", async () => {
    const usuario = userEvent.setup();
    rede.resposta = {
      thread_id: "t1",
      resposta: "Este comando é só para administradores.",
      acoes: [],
    };
    montar({ ehAdmin: false });

    await usuario.type(screen.getByTestId("assistente-pergunta"), "/pendentes");
    expect(screen.queryByTestId("assistente-menu-comandos")).toBeNull();
    expect(screen.queryByTestId("assistente-comando-pendentes")).toBeNull();

    await usuario.click(screen.getByTestId("assistente-perguntar"));
    expect(await screen.findByText("Este comando é só para administradores.")).toBeTruthy();
    expect(rede.chamadas).toContain("POST /api/v1/ai/assistente/chat");
  });

  it("o admin que abre o painel com pendências vê o ANÚNCIO e os cartões", async () => {
    rede.fila = [
      proposta("11111111-2222-4333-8444-555555555501", "Guardar o horário de atendimento"),
      proposta("11111111-2222-4333-8444-555555555502", "Arquivar a memória antiga"),
    ];
    montar();

    expect(await screen.findByText("Tem 2 mudanças esperando você.")).toBeTruthy();
    expect(await screen.findByTestId("proposta-11111111-2222-4333-8444-555555555501")).toBeTruthy();
    expect(screen.getByTestId("proposta-11111111-2222-4333-8444-555555555502")).toBeTruthy();
  });

  it("responder 'pode' aplica a ÚLTIMA pendente da conversa — e só ela", async () => {
    const usuario = userEvent.setup();
    const primeira = "11111111-2222-4333-8444-555555555511";
    const ultima = "11111111-2222-4333-8444-555555555512";
    rede.fila = [proposta(primeira, "Guardar o horário"), proposta(ultima, "Arquivar a memória antiga")];
    montar();

    await screen.findByText("Tem 2 mudanças esperando você.");
    await enviar(usuario, "pode");

    await waitFor(() => {
      expect(rede.chamadas).toContain(`POST /api/v1/ai/assistente/propostas/${ultima}/aprovar`);
      expect(rede.chamadas).toContain(`POST /api/v1/ai/assistente/propostas/${ultima}/aplicar`);
    });
    // A primeira NÃO é tocada: a decisão por texto é da última.
    expect(rede.chamadas.some((c) => c.includes(primeira))).toBe(false);
    // Nada foi perguntado ao modelo: decidir não é conversar.
    expect(rede.chamadas.some((c) => c.startsWith("POST /api/v1/ai/assistente/chat"))).toBe(false);
    // E o desfecho vira mensagem na conversa.
    expect(await screen.findByText("Pronto: Arquivar a memória antiga")).toBeTruthy();
  });

  it("um clique em Aplicar no cartão aprova e aplica EM SEQUÊNCIA", async () => {
    const usuario = userEvent.setup();
    const id = "11111111-2222-4333-8444-555555555521";
    rede.fila = [proposta(id, "Guardar o horário de atendimento")];
    montar();

    await screen.findByTestId(`proposta-${id}`);
    await usuario.click(screen.getByTestId(`proposta-aplicar-${id}`));

    await waitFor(() => {
      const aprovacoes = rede.chamadas.filter((c) => c.includes(`${id}/aprovar`));
      const aplicacoes = rede.chamadas.filter((c) => c.includes(`${id}/aplicar`));
      expect(aprovacoes).toHaveLength(1);
      expect(aplicacoes).toHaveLength(1);
    });
    expect(await screen.findByText("Pronto: Guardar o horário de atendimento")).toBeTruthy();
  });

  it("um clique em Não rejeita e a conversa diz o que aconteceu", async () => {
    const usuario = userEvent.setup();
    const id = "11111111-2222-4333-8444-555555555531";
    rede.fila = [proposta(id, "Guardar o horário de atendimento")];
    montar();

    await screen.findByTestId(`proposta-${id}`);
    await usuario.click(screen.getByTestId(`proposta-nao-${id}`));

    await waitFor(() => {
      expect(rede.chamadas.filter((c) => c.includes(`${id}/rejeitar`))).toHaveLength(1);
    });
    expect(await screen.findByText("Não apliquei: nada mudou.")).toBeTruthy();
  });

  it("o cartão de checkup chega na conversa e 'Pedir ao assistente' prepara a frase", async () => {
    const usuario = userEvent.setup();
    rede.resposta = {
      thread_id: "t1",
      resposta: "Rodei a auditoria da configuração.",
      acoes: [
        {
          tipo: "checkup",
          rodou: true,
          snapshot: {
            id: "r2",
            taken_at: "2026-10-18T09:00:00Z",
            pendencias: 1,
            itens: [
              {
                id: "agente_publicado",
                estado: "posso_completar",
                titulo: "Agente publicado e ativo",
                por_que: "Há modelo publicado sem chave utilizável.",
                ferramenta: "propor_agente",
                depende_de: [],
                onde_resolver: "/app/ai/agents",
              },
            ],
          },
          anterior: { id: "r1", taken_at: "2026-10-17T09:00:00Z", pendencias: 5 },
        },
      ],
    };
    montar();

    await enviar(usuario, "/checkup");

    await screen.findByTestId("assistente-cartao-checkup");
    expect(screen.getByTestId("assistente-cartao-checkup")).toHaveAttribute("data-rodou", "sim");
    expect(screen.getAllByText("Rodei a auditoria da configuração.").length).toBe(2);
    expect(screen.getByTestId("auditoria-item-agente_publicado")).toBeTruthy();
    expect(screen.getByText("Da última vez: 5 pendência(s); agora: 1.")).toBeTruthy();

    await usuario.click(screen.getByTestId("auditoria-pedir-agente_publicado"));
    expect((screen.getByTestId("assistente-pergunta") as HTMLInputElement).value).toBe(
      "Pode completar isto para mim: Agente publicado e ativo",
    );
  });

  it("quem não administra não recebe anúncio de pendências — a fila nem é lida", async () => {
    rede.fila = [proposta("11111111-2222-4333-8444-555555555541", "Guardar o horário")];
    montar({ ehAdmin: false });

    await new Promise((r) => setTimeout(r, 30));
    expect(rede.chamadas.some((c) => c.includes("/ai/assistente/propostas?"))).toBe(false);
    expect(screen.queryByText(/mudan[çc]a[s]? esperando você/)).toBeNull();
  });
});
