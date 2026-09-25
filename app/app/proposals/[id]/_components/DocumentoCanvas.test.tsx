// app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentoCanvas } from "./DocumentoCanvas";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data: body }), { status })),
  );
}

describe("DocumentoCanvas", () => {
  it("sem modelo escolhido, mostra aviso em vez de tela vazia ou erro (Review Focus)", async () => {
    mockFetch({ modeloSlug: null, secoes: [], variaveisFaltando: [], prontidao: null, resumoComercial: null });
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText(/nenhum modelo escolhido/i)).toBeInTheDocument());
  });

  it("com seções, mostra o título e o corpo de cada uma", async () => {
    mockFetch({
      modeloSlug: "site_institucional",
      secoes: [{ id: "resumo", title: "Resumo", body: "Projeto: Site Catálogo", faltantes: [] }],
      variaveisFaltando: [],
      prontidao: { status: "pronta_para_envio", checklist: {} },
      resumoComercial: null,
    });
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText("Resumo")).toBeInTheDocument());
    expect(screen.getByText("Projeto: Site Catálogo")).toBeInTheDocument();
  });

  it("com pendências, mostra a lista do que falta", async () => {
    mockFetch({
      modeloSlug: "site_institucional",
      secoes: [{ id: "resumo", title: "Resumo", body: "Projeto: [a definir]", faltantes: ["project.name"] }],
      variaveisFaltando: ["project.name"],
      prontidao: { status: "incompleta", checklist: { cliente: false } },
      resumoComercial: null,
    });
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText(/1 pendência/i)).toBeInTheDocument());
  });
});
