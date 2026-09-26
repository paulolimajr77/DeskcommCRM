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
});
