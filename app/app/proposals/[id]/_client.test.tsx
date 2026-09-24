import { render, screen, waitFor } from "@testing-library/react";
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
});
