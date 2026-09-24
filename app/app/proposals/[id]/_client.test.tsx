import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api/client";

import { ProposalEditorClient } from "./_client";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("./_components/AssistantPanel", () => ({ AssistantPanel: () => null }));

const PROPOSTA_BASE = {
  id: "p1",
  titulo: "Proposta X",
  condicoes: null,
  valid_until: null,
  revision: 1,
  total_cents: 1000,
  itens: [],
  moeda: "BRL",
};

describe("ProposalEditorClient — desfecho do envio (D3)", () => {
  it("mostra o motivo da ultima falha de envio quando a proposta esta em rascunho com falha registrada", async () => {
    get.mockResolvedValue({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: "canal desconectado" } });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    await waitFor(() => expect(screen.getByText(/canal desconectado/i)).toBeInTheDocument());
  });

  it("nao mostra aviso de falha quando rascunho nunca falhou", async () => {
    get.mockResolvedValue({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: null } });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    await waitFor(() => expect(screen.getByDisplayValue("Proposta X")).toBeInTheDocument());
    expect(screen.queryByText(/o último envio falhou/i)).not.toBeInTheDocument();
  });

  it("mostra 'na fila do WhatsApp' quando enviando", async () => {
    get.mockResolvedValue({ data: { ...PROPOSTA_BASE, status: "enviando", ultima_falha_envio: null } });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    await waitFor(() => expect(screen.getByText(/na fila do whatsapp/i)).toBeInTheDocument());
  });

  it("item sem preço mostra 'A definir' no lugar do subtotal, nunca R$ 0,00", async () => {
    get.mockResolvedValue({
      data: {
        ...PROPOSTA_BASE,
        status: "rascunho",
        ultima_falha_envio: null,
        itens: [
          { id: "i1", product_id: null, descricao: "Item a definir", quantidade: 1, preco_unitario_cents: null, desconto_cents: 0, position: 1000 },
        ],
      },
    });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    expect(await screen.findByText("A definir")).toBeInTheDocument();
  });

  it("adicionar item manual novo: nasce com preço vazio ('A definir'), não com R$ 0,00", async () => {
    get.mockResolvedValue({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: null } });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    const botaoAdicionar = await screen.findByRole("button", { name: /item à mão/i });
    fireEvent.click(botaoAdicionar);
    const camposDePreco = screen.getAllByPlaceholderText("A definir");
    expect(camposDePreco.length).toBeGreaterThan(0);
  });
});

describe("ProposalEditorClient — drift de preço do catálogo (N4)", () => {
  it("item com preço de catálogo desatualizado: mostra a faixa de aviso com 'Atualizar preços' e 'Manter'", async () => {
    get.mockResolvedValue({
      data: {
        ...PROPOSTA_BASE,
        status: "rascunho",
        ultima_falha_envio: null,
        itens: [
          { id: "i1", product_id: "prod-1", descricao: "Item de catálogo", quantidade: 1, preco_unitario_cents: 5000, preco_catalogo_atual_cents: 6000, desconto_cents: 0, position: 1000 },
        ],
      },
    });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    expect(await screen.findByText(/1 item mudou de preço no catálogo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /atualizar preços/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manter/i })).toBeInTheDocument();
  });

  it("clicar 'Atualizar preços': troca o preco_unitario_cents do item pelo valor atual do catálogo, localmente (não salva sozinho)", async () => {
    get.mockResolvedValue({
      data: {
        ...PROPOSTA_BASE,
        status: "rascunho",
        ultima_falha_envio: null,
        itens: [
          { id: "i1", product_id: "prod-1", descricao: "Item de catálogo", quantidade: 1, preco_unitario_cents: 5000, preco_catalogo_atual_cents: 6000, desconto_cents: 0, position: 1000 },
        ],
      },
    });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    fireEvent.click(await screen.findByRole("button", { name: /atualizar preços/i }));
    // 6000/100 = 60 no input de preço (desabilitado para item de catálogo, mas exibe o valor).
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
    // local: não chamou PATCH sozinho.
    expect(vi.mocked(apiClient.patch)).not.toHaveBeenCalled();
  });

  it("nenhum item com drift: não mostra a faixa", async () => {
    get.mockResolvedValue({
      data: {
        ...PROPOSTA_BASE,
        status: "rascunho",
        ultima_falha_envio: null,
        itens: [
          { id: "i1", product_id: "prod-1", descricao: "Item de catálogo", quantidade: 1, preco_unitario_cents: 5000, preco_catalogo_atual_cents: 5000, desconto_cents: 0, position: 1000 },
        ],
      },
    });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    await waitFor(() => expect(screen.getByDisplayValue("Proposta X")).toBeInTheDocument());
    expect(screen.queryByText(/mudou de preço no catálogo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mudaram de preço no catálogo/i)).not.toBeInTheDocument();
  });
});

describe("ProposalEditorClient — revisar cria a v2 (D4)", () => {
  it("proposta enviada mostra o botão 'Revisar esta proposta'", async () => {
    get.mockResolvedValue({ data: { ...PROPOSTA_BASE, status: "enviada", ultima_falha_envio: null } });
    render(<ProposalEditorClient id="prop-1" podeEditar={false} />);
    expect(await screen.findByRole("button", { name: /revisar esta proposta/i })).toBeInTheDocument();
  });

  it("clicar em 'Revisar esta proposta' chama a rota e navega para a v2", async () => {
    get.mockResolvedValue({ data: { ...PROPOSTA_BASE, id: "prop-1", status: "enviada", ultima_falha_envio: null } });
    const mockPost = vi.mocked(apiClient.post).mockResolvedValue({ data: { id: "v2-id" } } as never);
    render(<ProposalEditorClient id="prop-1" podeEditar={false} />);
    const botao = await screen.findByRole("button", { name: /revisar esta proposta/i });
    fireEvent.click(botao);
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/api/v1/proposals/prop-1/revise", {}));
  });

  it("proposta rascunho/aceita/recusada/vencida: NÃO mostra o botão de revisar", async () => {
    for (const status of ["rascunho", "aceita", "recusada", "vencida"]) {
      get.mockResolvedValue({ data: { ...PROPOSTA_BASE, status, ultima_falha_envio: null } });
      const { unmount } = render(<ProposalEditorClient id="prop-1" podeEditar={false} />);
      await waitFor(() => expect(screen.getByDisplayValue("Proposta X")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: /revisar esta proposta/i })).not.toBeInTheDocument();
      unmount();
    }
  });
});
