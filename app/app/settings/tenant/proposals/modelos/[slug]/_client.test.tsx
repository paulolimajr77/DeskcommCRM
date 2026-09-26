// app/app/settings/tenant/proposals/modelos/[slug]/_client.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHAVE_DO_MODELO_IMPORTADO } from "../_client";
import { EditorDeModelo } from "./_client";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post, patch } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

const MODELO_EMPRESA = {
  nome: "E-commerce nosso",
  descricao: null,
  sections: [
    { id: "summary", title: "Resumo", body: "Texto um.", required: true, conditional: false },
    { id: "terms", title: "Termos", body: "Texto dois.", required: true, conditional: false },
  ],
  sectionOrder: ["summary", "terms"],
  origem: "empresa",
};

describe("EditorDeModelo", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    patch.mockReset();
    push.mockReset();
    replace.mockReset();
    window.sessionStorage.clear();
    get.mockResolvedValue({ data: MODELO_EMPRESA });
    patch.mockResolvedValue({ data: { slug: "ecommerce", version: 3 } });
    post.mockResolvedValue({ data: { slug: "empresa_portal" } });
  });

  it("modelo da plataforma abre só leitura (sem botão Salvar modelo)", async () => {
    get.mockResolvedValue({
      data: { ...MODELO_EMPRESA, origem: "plataforma", nome: "E-commerce" },
    });
    render(<EditorDeModelo slug="ecommerce" />);
    await waitFor(() => expect(screen.getByDisplayValue("E-commerce")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Salvar modelo" })).not.toBeInTheDocument();
  });

  it("editar título e salvar chama PATCH com section_order na ordem da tela", async () => {
    render(<EditorDeModelo slug="ecommerce" />);
    const titulo = await screen.findByDisplayValue("Resumo");
    fireEvent.change(titulo, { target: { value: "Resumo novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar modelo" }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/settings/proposal-templates/ecommerce",
        expect.objectContaining({ section_order: ["summary", "terms"] }),
      ),
    );
    const corpo = patch.mock.calls[0]![1] as { sections: Array<{ title: string }> };
    expect(corpo.sections[0]?.title).toBe("Resumo novo");
  });

  it("↓ troca a ordem enviada", async () => {
    render(<EditorDeModelo slug="ecommerce" />);
    await screen.findByDisplayValue("Resumo");
    fireEvent.click(screen.getAllByRole("button", { name: "Descer seção" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Salvar modelo" }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/settings/proposal-templates/ecommerce",
        expect.objectContaining({ section_order: ["terms", "summary"] }),
      ),
    );
  });

  it("com slug novo e sessionStorage preenchido, salvar chama POST acao novo", async () => {
    window.sessionStorage.setItem(
      CHAVE_DO_MODELO_IMPORTADO,
      JSON.stringify({ nome: "Portal", sections: MODELO_EMPRESA.sections, sectionOrder: ["summary", "terms"] }),
    );
    render(<EditorDeModelo slug="novo" />);
    await screen.findByDisplayValue("Portal");
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar modelo" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/settings/proposal-templates",
        expect.objectContaining({ acao: "novo", nome: "Portal" }),
      ),
    );
  });
});
