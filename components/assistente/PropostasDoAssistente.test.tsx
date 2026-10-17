/**
 * A FILA DE PROPOSTAS DO ASSISTENTE (T21) no painel.
 *
 * O `useT` é dublado com o DICIONÁRIO de verdade (padrão do teste do cartão):
 * aqui o espanhol é prova, não enfeite. A rede é dublê e REGISTRA — cada
 * caso prova que o clique chama a rota da T20 certa, com o corpo certo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";

import { PropostasDoAssistente } from "@/components/assistente/PropostasDoAssistente";
import { traduzir } from "@/lib/i18n/dicionario";

const idioma = vi.hoisted(() => ({ atual: "pt-BR" }));
/**
 * O `t` dublado é ESTÁVEL POR IDIOMA, como o contrato do `useT` real pede
 * (`IdiomaProvider.tsx`: "Identidade estável" — sem isso, todo useEffect que
 * dependa de `t` reexecuta a cada render).
 */
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

const rede = vi.hoisted(() => ({
  propostas: undefined as undefined | (() => Promise<unknown>),
  acao: undefined as undefined | ((url: string, init?: RequestInit) => Promise<unknown>),
  /** O servidor dublê lembra da decisão: o refetch depois da ação devolve a proposta já mudada. */
  decididas: new Map<string, Record<string, unknown>>(),
}));

/** O `apiClient` lê `headers` e `ok`: os dublês viram `Response` de verdade. */
async function comoResponse(bruto: unknown): Promise<Response> {
  if (bruto instanceof Response) return bruto;
  const b = bruto as { status: number; json: () => Promise<unknown> };
  return new Response(JSON.stringify(await b.json()), {
    status: b.status,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (typeof url === "string" && url.startsWith("/api/v1/ai/assistente/propostas?")) {
    if (rede.propostas === undefined) throw new Error("sem dublê da fila");
    const r = await comoResponse(await rede.propostas());
    const corpo = (await r.json()) as { data: Array<Record<string, unknown>> };
    corpo.data = corpo.data.map((x) => rede.decididas.get(String(x.id)) ?? x);
    return new Response(JSON.stringify(corpo), { status: r.status, headers: { "content-type": "application/json" } });
  }
  if (typeof url === "string" && url.includes("/api/v1/ai/assistente/propostas/")) {
    const r = await comoResponse(await rede.acao?.(url, init));
    if (r.ok) {
      const nova = ((await r.clone().json()) as { data?: Record<string, unknown> }).data;
      if (nova) rede.decididas.set(String(nova.id), nova);
    }
    return r;
  }
  if (url === "/api/v1/team") {
    return comoResponse({
      status: 200,
      json: async () => [{ user_id: "user-1", full_name: "Ana Admin", email: "ana@exemplo.com" }],
    });
  }
  throw new Error(`fetch inesperado: ${url}`);
}) as typeof fetch;

const ID = "11111111-2222-4333-8444-555555555555";

function proposta(over: Record<string, unknown>) {
  return {
    id: ID,
    kind: "memoria",
    operacao: "criar",
    risk: "seguro",
    status: "pendente",
    resumo: "Guardar o horário de atendimento",
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
    ...over,
  };
}

function fila(...propostas: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify({ data: propostas, meta: { cursor: null, has_more: false } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function respostaAcao(
  ok: boolean,
  status: number,
  corpo: unknown,
): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderizar(over: { aoContarPendentes?: (n: number) => void } = {}) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <PropostasDoAssistente aberto aoContarPendentes={over.aoContarPendentes ?? (() => {})} />
    </QueryClientProvider>,
  );
}

describe("a fila de propostas", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    idioma.atual = "pt-BR";
    rede.propostas = undefined;
    rede.acao = undefined;
    rede.decididas.clear();
  });

  it("lista pendente PRIMEIRO, com tipo e operação em português, prazo, risco com TEXTO e quem pediu", async () => {
    const memoria = proposta({ id: "11111111-2222-4333-8444-555555555511", resumo: "Guardar o horário de atendimento" });
    const ponto = proposta({
      id: "11111111-2222-4333-8444-555555555512",
      kind: "modelo_auxiliares",
      operacao: "definir_ponto",
      risk: "atencao",
      status: "aprovada",
      resumo: "Trocar o modelo do assistente",
      antes: { ponto: "assistente_chat", provedor: "anthropic", modelo: "claude-x", origem: "binding" },
      payload: { operacao: "definir_ponto", corpo: { purpose: "assistente_chat", provider: "openai", model_id: "gpt-y" } },
      decided_by: "user-1",
      decided_at: "2026-10-16T10:00:00Z",
      expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    });
    rede.propostas = async () => fila(ponto, memoria); // o GET vem desc; a tela reordena

    renderizar();

    const cartoes = await screen.findAllByTestId(/^proposta-1111/);
    expect(cartoes.map((c) => c.getAttribute("data-status"))).toEqual(["pendente", "aprovada"]);
    expect(screen.getByText("Memória · criar")).toBeTruthy();
    expect(screen.getByText("Modelo dos auxiliares · definir ponto")).toBeTruthy();
    expect(screen.getByText("Vence em 3 dias")).toBeTruthy();
    // Risco com cor E TEXTO (nunca só cor).
    expect(screen.getAllByTestId("proposta-risco").map((r) => r.textContent)).toEqual(["Seguro", "Atenção"]);
    // Quem pediu, nomeado pela leitura única da equipe (chega um ciclo depois).
    await screen.findAllByText(/Ana Admin/);
    expect(screen.getAllByTestId(/^proposta-quem-1111/).map((q) => q.textContent)).toEqual([
      "Pedido por Ana Admin · 16/10/2026",
      "Pedido por Ana Admin · 16/10/2026",
    ]);
    // O antes/depois em português, sem JSON cru.
    expect(screen.getByText("Provedor:")).toBeTruthy();
    expect(screen.getByText("anthropic")).toBeTruthy();
    expect(screen.getByText("gpt-y")).toBeTruthy();
    // Nada de JSON cru no cartão.
    expect(document.body.textContent).not.toContain('"operacao"');
  });

  it("botões por estado: pendente aprova/rejeita, aprovada aplica, aplicada não tem botão, vencida não tem botão nenhum", async () => {
    const pendente = proposta({ id: "11111111-2222-4333-8444-555555555521", resumo: "Guardar o horário de atendimento" });
    const aprovada = proposta({
      id: "11111111-2222-4333-8444-555555555522",
      status: "aprovada",
      resumo: "Trocar o modelo do assistente",
      decided_by: "user-1",
      decided_at: "2026-10-16T10:00:00Z",
    });
    const aplicada = proposta({
      id: "11111111-2222-4333-8444-555555555523",
      status: "aplicada",
      resumo: "Arquivar o horário antigo",
      applied_by: "user-1",
      applied_at: "2026-10-16T10:00:00Z",
      apply_result: { destino: "x", http_status: 200 },
    });
    const vencida = proposta({
      id: "11111111-2222-4333-8444-555555555524",
      vencida: true,
      resumo: "Proposta que o tempo levou",
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    rede.propostas = async () => fila(aplicada, aprovada, vencida, pendente);

    renderizar();

    await screen.findByText("Guardar o horário de atendimento");
    expect(screen.getByTestId(`proposta-aprovar-${pendente.id}`)).toBeTruthy();
    expect(screen.getByTestId(`proposta-rejeitar-${pendente.id}`)).toBeTruthy();
    expect(screen.getByTestId(`proposta-aplicar-${aprovada.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`proposta-aprovar-${aplicada.id}`)).toBeNull();
    expect(screen.queryByTestId(`proposta-aplicar-${aplicada.id}`)).toBeNull();
    // Vencida: SEM botões, com o texto obrigatório.
    expect(screen.queryByTestId(`proposta-aprovar-${vencida.id}`)).toBeNull();
    expect(screen.queryByTestId(`proposta-aplicar-${vencida.id}`)).toBeNull();
    expect(screen.getByText("Venceu sem decisão.")).toBeTruthy();
  });

  it("aprovar chama a rota da T20 e o cartão passa a aprovada com o botão Aplicar", async () => {
    const usuario = userEvent.setup();
    const p = proposta({ id: "11111111-2222-4333-8444-555555555531" });
    rede.propostas = async () => fila(p);
    const acao = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        respostaAcao(
          true,
          200,
          { data: { ...p, status: "aprovada", decided_by: "user-1", decided_at: "2026-10-16T10:00:00Z" } },
        ),
    );
    rede.acao = acao;

    renderizar();
    await usuario.click(await screen.findByTestId(`proposta-aprovar-${p.id}`));

    expect(acao.mock.calls[0]![0]).toContain(`/propostas/${p.id}/aprovar`);
    await screen.findByTestId(`proposta-aplicar-${p.id}`);
  });

  it("o ERRO de aplicar aparece legível no cartão (http + código do destino) e a proposta continua aprovada", async () => {
    // Sabotagem: esconder o erro (não renderizar `proposta-erro-*`) → este caso fica vermelho.
    const usuario = userEvent.setup();
    const p = proposta({ id: "11111111-2222-4333-8444-555555555541", status: "aprovada", decided_by: "user-1", decided_at: "2026-10-16T10:00:00Z" });
    rede.propostas = async () => fila(p);
    rede.acao = async () =>
      respostaAcao(
        false,
        502,
        {
          error: {
            code: "proposta_falhou_ao_aplicar",
            message: "A aplicação falhou — a proposta continua aprovada para tentar de novo.",
            details: { http_status: 502, codigo_do_destino: "upstream_error" },
          },
        },
      );

    renderizar();
    await usuario.click(await screen.findByTestId(`proposta-aplicar-${p.id}`));

    const erro = await screen.findByTestId(`proposta-erro-${p.id}`);
    expect(erro.textContent).toContain("502");
    expect(erro.textContent).toContain("upstream_error");
    expect(erro.textContent).toContain("continua aprovada");
    // E o botão Aplicar continua, para tentar de novo.
    expect(screen.getByTestId(`proposta-aplicar-${p.id}`)).toBeTruthy();
  });

  it("409 proposta_em_aplicacao → 'já está sendo aplicada, aguarde'", async () => {
    const usuario = userEvent.setup();
    const p = proposta({ id: "11111111-2222-4333-8444-555555555542", status: "aprovada", decided_by: "user-1", decided_at: "2026-10-16T10:00:00Z" });
    rede.propostas = async () => fila(p);
    rede.acao = async () =>
      respostaAcao(false, 409, { error: { code: "proposta_em_aplicacao", message: "Esta proposta já está sendo aplicada agora." } });

    renderizar();
    await usuario.click(await screen.findByTestId(`proposta-aplicar-${p.id}`));

    const erro = await screen.findByTestId(`proposta-erro-${p.id}`);
    expect(erro.textContent).toContain("já está sendo aplicada");
  });

  it("rejeitar abre o motivo (≤1000), confirma com o corpo certo e o cartão mostra a rejeição", async () => {
    const usuario = userEvent.setup();
    const p = proposta({ id: "11111111-2222-4333-8444-555555555543" });
    rede.propostas = async () => fila(p);
    rede.acao = async (url, init) => {
      expect(String(url)).toContain(`/propostas/${p.id}/rejeitar`);
      expect((init?.body as string)).toContain("O agente atende errado neste nicho");
      return respostaAcao(true, 200, {
        data: { ...p, status: "rejeitada", decision_reason: "O agente atende errado neste nicho" },
      });
    };

    renderizar();
    await usuario.click(await screen.findByTestId(`proposta-rejeitar-${p.id}`));
    await usuario.type(screen.getByTestId(`proposta-motivo-${p.id}`), "O agente atende errado neste nicho");
    await usuario.click(screen.getByTestId(`proposta-confirmar-rejeicao-${p.id}`));

    // Rejeitada sai da visão "Esperando decisão" (é decisão tomada): o filtro
    // mostra ela — e o motivo vem junto no cartão.
    await usuario.selectOptions(screen.getByTestId("propostas-filtro"), "rejeitada");
    expect((await screen.findByTestId(`proposta-quem-${p.id}`)).textContent).toContain("Pedido por");
    expect(await screen.findByText("O agente atende errado neste nicho")).toBeTruthy();
    expect(screen.getByText(/Motivo da rejeição/)).toBeTruthy();
  });

  it("o aviso do roteador NASCE ATIVO aparece no cartão ANTES de aprovar", async () => {
    // Sabotagem: apagar o aviso do formatador → este caso fica vermelho.
    rede.propostas = async () =>
      fila(
        proposta({
          id: "11111111-2222-4333-8444-555555555544",
          kind: "roteador",
          operacao: "criar",
          resumo: "Criar o roteador do número",
          payload: { operacao: "criar", corpo: { name: "Clínica", channel_session_id: "11111111-2222-4333-8444-555555555551" } },
        }),
      );

    renderizar();

    await screen.findByText("Criar o roteador do número");
    expect(screen.getByText(/nasce ativo/)).toBeTruthy();
  });

  it("o contador de pendentes chega ao painel e cai depois de aprovar", async () => {
    const usuario = userEvent.setup();
    const contados: number[] = [];
    const p1 = proposta({ id: "11111111-2222-4333-8444-555555555545" });
    const p2 = proposta({ id: "11111111-2222-4333-8444-555555555546" });
    rede.propostas = async () => fila(p1, p2);
    rede.acao = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ data: { ...p1, status: "aprovada", decided_by: "user-1", decided_at: "2026-10-16T10:00:00Z" } }),
      }) as Response;

    renderizar({ aoContarPendentes: (n) => contados.push(n) });
    await usuario.click(await screen.findByTestId(`proposta-aprovar-${p1.id}`));

    await screen.findByTestId(`proposta-aplicar-${p1.id}`);
    expect(contados).toContain(2);
    expect(contados[contados.length - 1]).toBe(1);
  });

  it("não-admin é recusado pela rota: a fila mostra o aviso e não a lista", async () => {
    rede.propostas = async () =>
      ({ ok: false, status: 403, json: async () => ({ error: { code: "forbidden_role", message: "Requer role >= admin." } }) }) as Response;

    renderizar();

    await screen.findByText("Não consegui carregar as propostas.");
    expect(screen.queryByTestId(/^proposta-1111/)).toBeNull();
  });

  it("em espanhol os rótulos da fila saem em espanhol", async () => {
    idioma.atual = "es";
    rede.propostas = async () => fila(proposta({ id: "11111111-2222-4333-8444-555555555547" }));

    renderizar();

    await screen.findByText("Memoria · crear");
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeTruthy();
    expect(screen.getByText("Vence en 3 días")).toBeTruthy();
    expect((await screen.findByTestId(`proposta-quem-11111111-2222-4333-8444-555555555547`)).textContent).toContain(
      "Solicitado por Ana Admin",
    );
  });
});
