// app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentoCanvas } from "./DocumentoCanvas";

const get = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get, patch } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

function docBase(overrides: Record<string, unknown> = {}) {
  return {
    modeloSlug: null,
    modeloSlugSugerido: null,
    secoes: [],
    variaveisFaltando: [],
    prontidao: null,
    resumoComercial: null,
    ...overrides,
  };
}

describe("DocumentoCanvas", () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
  });

  it("sem modelo escolhido, mostra aviso em vez de tela vazia ou erro (Review Focus)", async () => {
    get.mockResolvedValue({ data: docBase() });
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText(/nenhum modelo escolhido/i)).toBeInTheDocument());
  });

  it("com seções, mostra o título e o corpo de cada uma", async () => {
    get.mockResolvedValue({
      data: docBase({
        modeloSlug: "site_institucional",
        secoes: [{ id: "resumo", title: "Resumo", body: "Projeto: Site Catálogo", faltantes: [] }],
        prontidao: { status: "pronta_para_envio", checklist: {} },
      }),
    });
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText("Resumo")).toBeInTheDocument());
    expect(screen.getByText("Projeto: Site Catálogo")).toBeInTheDocument();
  });

  it("com pendências, mostra a lista do que falta", async () => {
    get.mockResolvedValue({
      data: docBase({
        modeloSlug: "site_institucional",
        secoes: [{ id: "resumo", title: "Resumo", body: "Projeto: [a definir]", faltantes: ["project.name"] }],
        variaveisFaltando: ["project.name"],
        prontidao: { status: "incompleta", checklist: { cliente: false } },
      }),
    });
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText(/1 pendência/i)).toBeInTheDocument());
  });

  it("mostra a sugestão da IA com botão de confirmar, quando não há modelo confirmado", async () => {
    get.mockResolvedValue({ data: docBase({ modeloSlugSugerido: "site_institucional" }) });
    render(<DocumentoCanvas propostaId="p1" />);
    expect(await screen.findByText(/A IA sugeriu o modelo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /usar este modelo/i })).toBeInTheDocument();
  });

  it("ao confirmar, chama PATCH /modelo com o slug sugerido", async () => {
    get.mockResolvedValue({ data: docBase({ modeloSlugSugerido: "site_institucional" }) });
    patch.mockResolvedValue({ data: { template_slug: "site_institucional" } });
    render(<DocumentoCanvas propostaId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: /usar este modelo/i }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/modelo", { template_slug: "site_institucional" }),
    );
  });

  it("sem sugestão e sem modelo, mostra um seletor manual com os 8 modelos", async () => {
    get.mockResolvedValue({ data: docBase() });
    render(<DocumentoCanvas propostaId="p1" />);
    const seletor = await screen.findByRole("combobox");
    expect(seletor).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "E-commerce" })).toBeInTheDocument();
  });
});
