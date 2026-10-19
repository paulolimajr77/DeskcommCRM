import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TextoDoAssistente } from "./TextoDoAssistente";

const NL = String.fromCharCode(10); // quebra de linha real, independentemente do SO

describe("TextoDoAssistente", () => {
  it("**negrito** vira <strong> e não deixa * na tela", () => {
    render(<TextoDoAssistente texto="**Atenção**: x" />);
    expect(screen.getByText("Atenção")).toBeTruthy();
    expect(screen.queryByText(/\*/)).toBeNull();
    const strong = screen.getByRole("strong");
    expect(strong.textContent).toBe("Atenção");
  });

  it("três linhas - a, - b, - c → um <ul> com 3 <li>", () => {
    const { container } = render(
      <TextoDoAssistente texto={`- a${NL}- b${NL}- c`} />,
    );
    const html = container.innerHTML;
    expect(html).toContain("<ul");
    expect(html).toContain(">a<");
    expect(html).toContain(">b<");
    expect(html).toContain(">c<");
    expect((html.match(/<li/g) ?? [])).toHaveLength(3);
  });

  it("fn_user_org_ids() sai intacto (ênfase só fora de palavra)", () => {
    render(
      <TextoDoAssistente texto={`use fn_user_org_ids()${NL}e *não* fn_x()`} />,
    );
    expect(screen.getByText(/fn_user_org_ids\(\)/)).toBeTruthy();
  });

  it("<script> aparece como texto, não como elemento", () => {
    render(<TextoDoAssistente texto="<script>alert(1)</script>" />);
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
  });

  it("<img onerror> aparece como texto, não como elemento", () => {
    render(<TextoDoAssistente texto='<img onerror="x">' />);
    expect(screen.getByText('<img onerror="x">')).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("código em crase vira <code>", () => {
    render(<TextoDoAssistente texto="use `fn_x()` aqui" />);
    const code = screen.getByRole("code");
    expect(code).toBeTruthy();
    expect(code.textContent).toBe("fn_x()");
  });

  it("_ênfase_ fora de palavra vira <em>", () => {
    render(<TextoDoAssistente texto="_destaque_ aqui" />);
    const em = screen.getByRole("emphasis");
    expect(em).toBeTruthy();
    expect(em.textContent).toBe("destaque");
  });

  it("[texto](url) mostra só o texto, sem <a>", () => {
    render(<TextoDoAssistente texto="veja [aqui](https://exemplo.com)" />);
    expect(screen.getByText("veja aqui")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("linha em branco separa parágrafos", () => {
    const { container } = render(
      <TextoDoAssistente texto={`parágrafo um${NL}${NL}parágrafo dois`} />,
    );
    const html = container.innerHTML;
    expect((html.match(/<p/g) ?? [])).toHaveLength(2);
    expect(html).toContain("parágrafo um");
    expect(html).toContain("parágrafo dois");
  });

  it("heading # vira parágrafo em negrito", () => {
    render(<TextoDoAssistente texto="# Título" />);
    const p = screen.getByRole("paragraph");
    expect(p).toHaveClass("font-bold");
    expect(screen.getByText("Título")).toBeTruthy();
  });

  it("lista numerada 1. 2. 3. vira <ol>", () => {
    const { container } = render(
      <TextoDoAssistente texto={`1. um${NL}2. dois${NL}3. três`} />,
    );
    const html = container.innerHTML;
    expect(html).toContain("<ol");
    expect(html).toContain(">um<");
    expect(html).toContain(">dois<");
    expect(html).toContain(">três<");
    expect((html.match(/<li/g) ?? [])).toHaveLength(3);
  });

  it("texto vazio não quebra", () => {
    const { container } = render(<TextoDoAssistente texto="" />);
    expect(container).toBeTruthy();
  });
});
