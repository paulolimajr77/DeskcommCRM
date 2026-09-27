// app/app/settings/tenant/proposals/modelos/_client.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModelosDeProposta } from "./_client";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const excluir = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post, delete: excluir } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const MODELOS = [
  { slug: "site_institucional", nome: "Site institucional", origem: "plataforma", secoes: 3, version: 1 },
  { slug: "ecommerce", nome: "E-commerce nosso", origem: "personalizado", secoes: 4, version: 2 },
];

describe("ModelosDeProposta", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    excluir.mockReset();
    get.mockResolvedValue({ data: MODELOS });
    post.mockResolvedValue({ data: { slug: "ecommerce" } });
  });

  it("lista mostra Da plataforma e Personalizar", async () => {
    render(<ModelosDeProposta />);
    await waitFor(() => expect(screen.getByText("Site institucional")).toBeInTheDocument());
    expect(screen.getByText(/Da plataforma/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personalizar" })).toBeInTheDocument();
  });

  it("Personalizar chama POST com acao personalizar e base_slug", async () => {
    render(<ModelosDeProposta />);
    fireEvent.click(await screen.findByRole("button", { name: "Personalizar" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/settings/proposal-templates", {
        acao: "personalizar",
        base_slug: "site_institucional",
      }),
    );
  });

  it("Voltar ao modelo da plataforma com confirm falso não chama DELETE", async () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(<ModelosDeProposta />);
      fireEvent.click(await screen.findByRole("button", { name: "Voltar ao modelo da plataforma" }));
      await waitFor(() => expect(screen.getByText("E-commerce nosso")).toBeInTheDocument());
      expect(excluir).not.toHaveBeenCalled();
    } finally {
      confirmar.mockRestore();
    }
  });

  it("modelo da plataforma tem botão Não usar, que chama POST ocultar", async () => {
    render(<ModelosDeProposta />);
    const botoes = await screen.findAllByRole("button", { name: "Não usar" });
    fireEvent.click(botoes[0]!);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/settings/proposal-templates", {
        acao: "ocultar",
        slug: "site_institucional",
      }),
    );
  });

  it("modelo oculto mostra Desligado e botão Usar, que chama POST mostrar", async () => {
    get.mockResolvedValue({
      data: [{ slug: "ecommerce", nome: "E-commerce", origem: "plataforma", secoes: 3, version: 1, oculto: true }],
    });
    render(<ModelosDeProposta />);
    await waitFor(() =>
      expect(screen.getByText("Desligado — não aparece para a IA nem no seletor")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/settings/proposal-templates", {
        acao: "mostrar",
        slug: "ecommerce",
      }),
    );
  });

  it("modelo da empresa não tem botão Não usar", async () => {
    get.mockResolvedValue({
      data: [{ slug: "empresa_locacao", nome: "Locação", origem: "empresa", secoes: 1, version: 1 }],
    });
    render(<ModelosDeProposta />);
    await waitFor(() => expect(screen.getByText("Locação")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Não usar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Usar" })).toBeNull();
  });
});
