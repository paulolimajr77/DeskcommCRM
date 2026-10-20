// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { aggregateEvolution, type ConfigLoopInput, type EvolutionInput } from "@/lib/ai/evolution/aggregate";

let payloadAtual: ReturnType<typeof aggregateEvolution>;
vi.mock("@/hooks/ai/useEvolution", () => ({
  useEvolution: () => ({ data: payloadAtual, error: null }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { EvolutionClient } from "./_client";

const range = { from: new Date("2026-07-01T00:00:00Z"), to: new Date("2026-07-03T00:00:00Z") };

function payload(configLoop?: ConfigLoopInput) {
  const input: EvolutionInput = {
    range,
    memoryEntries: [],
    proposalsApplied: [],
    skillInstalls: [],
    skillActivations: [],
    routerDecisions: [],
    knowledgeSearches: [],
    stageTransitions: [],
    costCents: 0,
    inboundCount: 0,
    handoffCount: 0,
    pipelines: [],
    configLoop,
  };
  return aggregateEvolution(input);
}

const l = (kind: string, status: string, decided: boolean) => ({
  kind,
  status,
  decided_at: decided ? "2026-07-02T10:00:00Z" : null,
  applied_at: status === "aplicada" ? "2026-07-02T11:00:00Z" : null,
});

function tela(idioma: string) {
  return render(
    <IdiomaProvider locale={idioma}>
      <EvolutionClient defaultRange={{ from: "2026-07-01", to: "2026-07-03" }} />
    </IdiomaProvider>,
  );
}

afterEach(cleanup);

describe("bloco do assistente na página de Evolução (F4)", () => {
  const comDados: ConfigLoopInput = {
    estado: "ok",
    rows: [l("roteador", "rejeitada", true), l("roteador", "aplicada", true), l("funil", "pendente", false)],
  };

  it("PT: mostra a taxa e a linha por tipo", () => {
    payloadAtual = payload(comDados);
    tela("pt-BR");
    const bloco = screen.getByTestId("bloco-assistente");
    expect(within(bloco).getByText("O que o assistente propôs")).toBeTruthy();
    expect(within(bloco).getByTestId("config-loop-taxa").textContent).toBe("50%");
    const linha = within(bloco).getByTestId("config-loop-roteador");
    expect(linha.textContent).toContain("Roteador");
    expect(within(bloco).getByTestId("config-loop-funil").textContent).toContain("Funil");
  });

  it("ES: o mesmo bloco, em espanhol", () => {
    payloadAtual = payload(comDados);
    tela("es");
    const bloco = screen.getByTestId("bloco-assistente");
    expect(within(bloco).getByText("Lo que propuso el asistente")).toBeTruthy();
    expect(within(bloco).getByText("Rechazadas")).toBeTruthy();
    expect(within(bloco).getByText("Sin decisión")).toBeTruthy();
    expect(bloco.textContent).not.toContain("Recusadas");
  });

  it("manager (restrito): diz que é restrito, não mostra zero", () => {
    payloadAtual = payload({ estado: "restrito" });
    tela("pt-BR");
    const bloco = screen.getByTestId("bloco-assistente");
    expect(within(bloco).getByTestId("config-loop-restrito")).toBeTruthy();
    expect(within(bloco).queryByTestId("config-loop-taxa")).toBeNull();
  });

  it("sem proposta no período e sem decisão: estados honestos", () => {
    payloadAtual = payload({ estado: "ok", rows: [] });
    tela("pt-BR");
    expect(screen.getByTestId("config-loop-vazio")).toBeTruthy();
    cleanup();
    payloadAtual = payload({ estado: "ok", rows: [l("memoria", "pendente", false)] });
    tela("pt-BR");
    expect(screen.getByTestId("config-loop-taxa").textContent).toBe("—");
  });

  it("falha de leitura: 'indisponível', nunca 0%", () => {
    payloadAtual = payload({ estado: "indisponivel" });
    tela("es");
    const bloco = screen.getByTestId("bloco-assistente");
    expect(within(bloco).getByTestId("config-loop-indisponivel").textContent).toContain("No pudimos leer");
  });
});
