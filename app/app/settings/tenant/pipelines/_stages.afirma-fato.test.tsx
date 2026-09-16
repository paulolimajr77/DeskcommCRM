/**
 * A CAIXA «esta etapa afirma um fato» — do valor que chega ao corpo que sai.
 *
 * A coluna `crm_stages.afirma_fato` (migration 0274) nasceu com guarda no
 * `moveLeadHandler` e SEM um único lugar onde ser marcada: recurso completo por
 * dentro e inerte por fora. Estes casos medem a porta que faltava.
 *
 * O caso ⭐ é o que separa "a caixa existe" de "a caixa funciona": ele confere o
 * corpo do PATCH E o id da etapa. Mandar o patch certo para a etapa errada é o
 * defeito que nenhuma outra asserção pega.
 *
 * E o CONTROLE DE NICHO é a doutrina em forma de teste: uma etapa chamada
 * «Proposta enviada» com a coluna em `false` renderiza DESMARCADA. A lista de
 * etapas é escrita pelo dono, em qualquer nicho — reconhecer por nome acerta uma
 * empresa e erra todas as outras.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { EstadoDoMapeamento, EtapaDoFunil } from "@/hooks/pipelines/useAgentMapping";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { StagesSection } from "./_stages";

// Polyfills que o Radix exige e o jsdom não tem.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const PIPE = "11111111-1111-4111-8111-111111111111";

const VAZIO = {
  new: null,
  contacted: null,
  qualifying: null,
  qualified: null,
  negotiating: null,
  won: null,
  lost: null,
};

function estado(
  etapas: EtapaDoFunil[],
  mapeamento: Partial<EstadoDoMapeamento["mapeamento"]> = {},
): EstadoDoMapeamento {
  return { etapas, mapeamento: { ...VAZIO, ...mapeamento } };
}

function montar() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <StagesSection pipelineId={PIPE} ancoraMapeamento={`mapeamento-${PIPE}`} />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  Object.assign(window, { scrollTo: vi.fn() });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: estado([]) } as never);
  vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
});

describe("a caixa «esta etapa afirma um fato»", () => {
  it("aparece para cada etapa, refletindo o valor que veio da rota", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: estado([
        { id: "e1", name: "Proposta enviada", is_won: false, is_lost: false, afirma_fato: true },
        { id: "e2", name: "Negociando", is_won: false, is_lost: false, afirma_fato: false },
      ]),
    } as never);

    montar();

    const caixa1 = await screen.findByTestId("afirma-fato-e1");
    const caixa2 = screen.getByTestId("afirma-fato-e2");

    expect(caixa1).toBeChecked();
    expect(caixa2).not.toBeChecked();
  });

  it("⭐ ligar a caixa manda { afirma_fato: true } no PATCH daquela etapa", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: estado([
        { id: "e1", name: "Proposta enviada", is_won: false, is_lost: false, afirma_fato: false },
      ]),
    } as never);

    const user = userEvent.setup();
    montar();

    const caixa = await screen.findByTestId("afirma-fato-e1");
    await user.click(caixa);

    await waitFor(() => expect(vi.mocked(apiClient.patch)).toHaveBeenCalledTimes(1));
    const [url, body] = vi.mocked(apiClient.patch).mock.calls[0]!;
    expect(url).toContain("/stages/e1");
    expect(body).toEqual({ afirma_fato: true });
  });

  it("desligar manda { afirma_fato: false }", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: estado([
        { id: "e1", name: "Proposta enviada", is_won: false, is_lost: false, afirma_fato: true },
      ]),
    } as never);

    const user = userEvent.setup();
    montar();

    const caixa = await screen.findByTestId("afirma-fato-e1");
    await user.click(caixa);

    await waitFor(() => expect(vi.mocked(apiClient.patch)).toHaveBeenCalledTimes(1));
    const [url, body] = vi.mocked(apiClient.patch).mock.calls[0]!;
    expect(url).toContain("/stages/e1");
    expect(body).toEqual({ afirma_fato: false });
  });

  it("CONTROLE — etapa que vem SEM a chave renderiza desmarcada e não quebra", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: estado([
        { id: "e1", name: "Etapa antiga", is_won: false, is_lost: false },
      ] as EtapaDoFunil[]),
    } as never);

    montar();

    const caixa = await screen.findByTestId("afirma-fato-e1");
    expect(caixa).not.toBeChecked();
  });

  it("CONTROLE DE NICHO — a caixa NÃO é pré-marcada por nome", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: estado([
        { id: "e1", name: "Proposta enviada", is_won: false, is_lost: false, afirma_fato: false },
      ]),
    } as never);

    montar();

    const caixa = await screen.findByTestId("afirma-fato-e1");
    expect(caixa).not.toBeChecked();
  });
});
