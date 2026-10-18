/**
 * O CARTÃO DE CHECKUP NA CONVERSA (decisão do dono, 18/10/2026).
 *
 * O `/checkup` responde com este cartão dentro da conversa. Aqui se prova o que
 * ele diz e, principalmente, os DOIS caminhos de cada item de "Posso completar":
 * "Resolver" leva à tela onde a pessoa resolve, e "Pedir ao assistente" deixa a
 * frase pronta no campo do chat — é por esse segundo que a proposta nasce.
 *
 * O `useT` é dublado com o DICIONÁRIO de verdade: aqui o espanhol é prova.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CartaoDeCheckup,
  type ItemDoCheckupNaTela,
  type RetratoNaTela,
} from "@/components/assistente/CartaoDeCheckup";
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

function item(over: Partial<ItemDoCheckupNaTela> = {}): ItemDoCheckupNaTela {
  return {
    id: "credencial_ia",
    estado: "preenchido",
    titulo: "Credencial de IA validada",
    por_que: "Há uma chave de provedor validada e ativa nesta organização.",
    ferramenta: null,
    depende_de: [],
    onde_resolver: "/app/ai/credentials",
    ...over,
  };
}

const RETRATO: RetratoNaTela = {
  id: "r2",
  taken_at: "2026-10-16T09:00:00Z",
  pendencias: 2,
  itens: [
    item({}),
    item({
      id: "agente_publicado",
      estado: "posso_completar",
      titulo: "Agente publicado e ativo",
      ferramenta: "propor_agente",
      onde_resolver: "/app/ai/agents",
    }),
    item({ id: "roteador", estado: "preciso_confirmar", titulo: "Roteador do canal" }),
    item({ id: "horario_atendimento", estado: "nao_se_aplica", titulo: "Horário de atendimento" }),
  ],
};

const ANTERIOR = { id: "r1", taken_at: "2026-10-15T09:00:00Z", pendencias: 5 };

function montar(over: { rodou?: boolean; anterior?: typeof ANTERIOR | null; aoPedir?: (f: string) => void } = {}) {
  return render(
    <CartaoDeCheckup
      rodou={over.rodou ?? false}
      snapshot={RETRATO}
      anterior={over.anterior === undefined ? ANTERIOR : over.anterior}
      aoPedir={over.aoPedir ?? (() => {})}
    />,
  );
}

describe("o cartão de checkup", () => {
  afterEach(() => {
    cleanup();
    idioma.atual = "pt-BR";
  });

  it("conta por estado, em palavras, e compara com a rodada anterior", () => {
    montar();

    expect(screen.getByTestId("auditoria-contagem-preenchido").textContent).toContain("1");
    // "Pronto" (item) e "Prontos" (contagem do grupo) são palavras diferentes de propósito.
    expect(screen.getByText("Pronto")).toBeTruthy();
    expect(screen.getByText("Prontos")).toBeTruthy();
    expect(screen.getAllByText("Posso completar").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Preciso confirmar").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Não se aplica").length).toBeGreaterThan(1);
    expect(screen.getByTestId("checkup-evolucao").textContent).toBe(
      "Da última vez: 5 pendência(s); agora: 2.",
    );
    expect(screen.getByTestId("checkup-pendencias").textContent).toContain("2");
    // Sem retrato novo, o cartão diz que este é o ÚLTIMO.
    expect(screen.getByText("Esta é a última auditoria da configuração.")).toBeTruthy();
  });

  it("quando a rodada acabou de acontecer, o cartão DIZ isso", () => {
    montar({ rodou: true });
    expect(screen.getByText("Rodei a auditoria da configuração.")).toBeTruthy();
    expect(screen.getByTestId("assistente-cartao-checkup")).toHaveAttribute("data-rodou", "sim");
  });

  it("sem rodada anterior, a frase é a da primeira rodada", () => {
    montar({ anterior: null });
    expect(screen.getByTestId("checkup-evolucao").textContent).toBe("Primeira rodada: 2 pendência(s).");
  });

  it("'Resolver' leva à tela de cada item", () => {
    montar();
    expect(screen.getByTestId("auditoria-resolver-credencial_ia")).toHaveAttribute(
      "href",
      "/app/ai/credentials",
    );
    expect(screen.getByTestId("auditoria-resolver-agente_publicado")).toHaveAttribute(
      "href",
      "/app/ai/agents",
    );
  });

  it("'Pedir ao assistente' só aparece no item que o assistente pode completar — e entrega a frase ao chat", async () => {
    const usuario = userEvent.setup();
    const aoPedir = vi.fn();
    montar({ aoPedir });

    // Só o `posso_completar` COM ferramenta tem o botão.
    expect(screen.queryByTestId("auditoria-pedir-credencial_ia")).toBeNull();
    expect(screen.queryByTestId("auditoria-pedir-roteador")).toBeNull();
    expect(screen.queryByTestId("auditoria-pedir-horario_atendimento")).toBeNull();

    await usuario.click(screen.getByTestId("auditoria-pedir-agente_publicado"));
    expect(aoPedir).toHaveBeenCalledTimes(1);
    expect(aoPedir.mock.calls[0]![0]).toBe("Pode completar isto para mim: Agente publicado e ativo");
  });

  it("em espanhol, TODA frase do cartão vem traduzida (sem português vazando)", () => {
    idioma.atual = "es";
    montar();

    expect(screen.getByText("Auditoría de la empresa")).toBeTruthy();
    expect(screen.getByTestId("checkup-evolucao").textContent).toBe(
      "La última vez: 5 pendiente(s); ahora: 2.",
    );
    expect(screen.getByText("Listos")).toBeTruthy();
    expect(screen.getByText("Pedir al asistente")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Da última vez");
    expect(document.body.textContent).not.toContain("Esta é a última auditoria");
  });
});
