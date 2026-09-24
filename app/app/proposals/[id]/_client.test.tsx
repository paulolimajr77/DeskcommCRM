import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
