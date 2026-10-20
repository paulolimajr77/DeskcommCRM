/**
 * O CARTÃO DE PROPOSTA NA CONVERSA (decisão do dono, 18/10/2026).
 *
 * O cartão é APRESENTAÇÃO: recebe a proposta que a fila oficial devolveu e
 * devolve a decisão por callback. Isso é o que permite os três caminhos (o modelo
 * propondo, o anúncio ao abrir o painel e o `/pendentes`) desenharem o MESMO
 * cartão — e é por isso que este arquivo não dubla rede nenhuma.
 *
 * O `useT` é dublado com o DICIONÁRIO de verdade: aqui o espanhol é prova, não
 * enfeite.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CartaoDeProposta,
  type PropostaNaTela,
} from "@/components/assistente/CartaoDeProposta";
import { traduzir } from "@/lib/i18n/dicionario";

const idioma = vi.hoisted(() => ({ atual: "pt-BR" as "pt-BR" | "es" }));
const tsPorIdioma = vi.hoisted(() => new Map<string, (texto: string) => string>());

vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => {
    let f = tsPorIdioma.get(idioma.atual);
    if (f === undefined) {
      f = (texto: string) => traduzir(texto, idioma.atual);
      tsPorIdioma.set(idioma.atual, f);
    }
    return f;
  },
}));

const ID = "11111111-2222-4333-8444-555555555555";

function proposta(over: Partial<PropostaNaTela> = {}): PropostaNaTela {
  return {
    id: ID,
    kind: "memoria",
    operacao: "criar",
    risk: "seguro",
    status: "pendente",
    resumo: "Guardar o horário de atendimento",
    motivo: "A pessoa pediu.",
    antes: null,
    payload: { operacao: "criar", corpo: { title: "Horário", body: "Das 8h às 18h." } },
    requested_by: "user-1",
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    applied_by: null,
    applied_at: null,
    apply_result: null,
    expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    created_at: "2026-10-16T09:00:00Z",
    vencida: false,
    ...over,
  };
}

function montar(
  p: PropostaNaTela | null,
  over: {
    ocupado?: boolean;
    erro?: string | null;
    aoAplicar?: (id: string) => void;
    aoNao?: (id: string) => void;
  } = {},
) {
  return render(
    <CartaoDeProposta
      id={ID}
      proposta={p}
      nomeDe={() => "Ana Admin"}
      ocupado={over.ocupado ?? false}
      erro={over.erro ?? null}
      aoAplicar={over.aoAplicar ?? (() => {})}
      aoNao={over.aoNao ?? (() => {})}
    />,
  );
}

describe("o cartão de proposta", () => {
  afterEach(() => {
    cleanup();
    idioma.atual = "pt-BR";
  });

  it("mostra tipo, operação, risco com TEXTO, resumo, antes/depois, quem pediu e prazo", () => {
    montar(
      proposta({
        kind: "modelo_auxiliares",
        operacao: "definir_ponto",
        risk: "atencao",
        resumo: "Trocar o modelo do assistente",
        antes: { ponto: "assistente_chat", provedor: "anthropic", modelo: "claude-x" },
        payload: {
          operacao: "definir_ponto",
          corpo: { purpose: "assistente_chat", provider: "openai", model_id: "gpt-y" },
        },
      }),
    );

    expect(screen.getByText("Modelo dos auxiliares · definir ponto")).toBeTruthy();
    expect(screen.getByTestId("proposta-risco").textContent).toBe("Atenção");
    expect(screen.getByText("Trocar o modelo do assistente")).toBeTruthy();
    // O antes/depois em português, sem JSON cru.
    expect(screen.getByText("Provedor:")).toBeTruthy();
    expect(screen.getByText("anthropic")).toBeTruthy();
    expect(screen.getByText("gpt-y")).toBeTruthy();
    expect(document.body.textContent).not.toContain('"operacao"');
    expect(screen.getByTestId(`proposta-quem-${ID}`).textContent).toBe(
      "Pedido por Ana Admin · 16/10/2026",
    );
    expect(screen.getByTestId("proposta-prazo").textContent).toBe("Vence em 3 dias");
  });

  it("os avisos do formatador saem ANTES do clique (o roteador nasce ativo)", () => {
    montar(
      proposta({
        kind: "roteador",
        operacao: "criar",
        resumo: "Criar o roteador do número",
        payload: { operacao: "criar", corpo: { name: "Clínica" } },
      }),
    );

    expect(screen.getByText(/nasce ativo/)).toBeTruthy();
  });

  it("Aplicar e Não por estado: pendente tem os dois; aprovada só Aplicar; aplicada e vencida nenhum", () => {
    const { unmount } = montar(proposta({}));
    expect(screen.getByTestId(`proposta-aplicar-${ID}`)).toBeTruthy();
    expect(screen.getByTestId(`proposta-nao-${ID}`)).toBeTruthy();
    unmount();

    const segunda = montar(proposta({ status: "aprovada", decided_by: "user-1" }));
    expect(screen.getByTestId(`proposta-aplicar-${ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`proposta-nao-${ID}`)).toBeNull();
    segunda.unmount();

    const terceira = montar(proposta({ status: "aplicada", applied_at: "2026-10-16T10:00:00Z" }));
    expect(screen.queryByTestId(`proposta-aplicar-${ID}`)).toBeNull();
    expect(screen.queryByTestId(`proposta-nao-${ID}`)).toBeNull();
    expect(screen.getByTestId("proposta-prazo").textContent).toBe("Aplicada");
    terceira.unmount();

    montar(proposta({ vencida: true, expires_at: new Date(Date.now() - 86_400_000).toISOString() }));
    expect(screen.queryByTestId(`proposta-aplicar-${ID}`)).toBeNull();
    expect(screen.queryByTestId(`proposta-nao-${ID}`)).toBeNull();
    expect(screen.getByText("Venceu sem decisão.")).toBeTruthy();
  });

  it("um clique em Aplicar decide; um clique em Não rejeita", async () => {
    const usuario = userEvent.setup();
    const aoAplicar = vi.fn();
    const aoNao = vi.fn();
    montar(proposta({}), { aoAplicar, aoNao });

    await usuario.click(screen.getByTestId(`proposta-aplicar-${ID}`));
    expect(aoAplicar).toHaveBeenCalledWith(ID);

    await usuario.click(screen.getByTestId(`proposta-nao-${ID}`));
    expect(aoNao).toHaveBeenCalledWith(ID);
  });

  it("enquanto a ação corre, os botões ficam desabilitados (sem duplo clique)", () => {
    montar(proposta({}), { ocupado: true });
    expect(screen.getByTestId(`proposta-aplicar-${ID}`)).toBeDisabled();
    expect(screen.getByTestId(`proposta-nao-${ID}`)).toBeDisabled();
  });

  it("o erro da ação aparece no cartão, em alerta", () => {
    montar(proposta({}), { erro: "O destino respondeu 502 · upstream_error." });
    expect(screen.getByTestId(`proposta-erro-${ID}`)).toHaveTextContent(
      "O destino respondeu 502 · upstream_error.",
    );
  });

  it("sem a fila ainda, o cartão avisa que está carregando em vez de sumir", () => {
    montar(null);
    expect(screen.getByTestId(`proposta-${ID}`)).toHaveAttribute("data-status", "carregando");
    expect(screen.getByText("Carregando a mudança…")).toBeTruthy();
  });

  it("em espanhol os rótulos do cartão saem em espanhol", () => {
    idioma.atual = "es";
    montar(proposta({}));

    expect(screen.getByText("Memoria · crear")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No" })).toBeTruthy();
    expect(screen.getByTestId("proposta-prazo").textContent).toBe("Vence en 3 días");
    expect(screen.getByTestId(`proposta-quem-${ID}`).textContent).toBe(
      "Solicitado por Ana Admin · 16/10/2026",
    );
  });
});
