// app/app/proposals/[id]/_components/AssistantPanel.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { AssistantPanel } from "./AssistantPanel";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

describe("AssistantPanel — disponibilidade antes do clique (N5)", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ data: { disponivel: true, motivo: null } });
  });

  it("orçamento estourado: campo nasce DESABILITADO com o motivo, antes de qualquer clique", async () => {
    get.mockResolvedValue({
      data: { disponivel: false, motivo: "O orçamento mensal de IA desta organização foi atingido." },
    });
    render(<AssistantPanel propostaId="prop-1" revision={1} onAplicado={vi.fn()} />);
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/proposals/prop-1/assistant/disponibilidade"),
    );
    const campo = screen.getByPlaceholderText(/baixa 10%/i);
    expect(campo).toBeDisabled();
    expect(screen.getByText(/orçamento mensal de IA desta organização foi atingido/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^gerar$/i })).toBeDisabled();
  });

  it("orçamento disponível: campo habilitado, sem motivo", async () => {
    render(<AssistantPanel propostaId="prop-1" revision={1} onAplicado={vi.fn()} />);
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/proposals/prop-1/assistant/disponibilidade"),
    );
    expect(screen.getByPlaceholderText(/baixa 10%/i)).toBeEnabled();
  });
});
