/**
 * `ler_guia`: só os guias `assistente-*` saem — uma skill de agente da
 * organização (outro nome) nunca é lida por aqui, mesmo que a lista chegue
 * inteira. O corpo sai inteiro (sem corte): no máximo 200 linhas pelo teto do
 * seed da aplicação.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { chamar, montarParaTeste, skillDe } from "./auxiliar-de-teste";

const SKILLS = [
  skillDe("assistente-operacao", "Passo a passo da operação diária."),
  skillDe("assistente-metricas", "m".repeat(190).split("").join("\n")),
  skillDe("outra-coisa", "SEGREDO-DA-SKILL-DO-AGENTE"),
];

describe("ler_guia", () => {
  it("sem guia, lista só os assistente-* com nome e descrição", async () => {
    const { ferramentas } = montarParaTeste("viewer", {}, { skills: SKILLS });

    const saida = await chamar(ferramentas, "ler_guia", {});

    expect(saida).toEqual({
      ok: true,
      guias: [
        { nome: "assistente-operacao", descricao: "descrição de assistente-operacao" },
        { nome: "assistente-metricas", descricao: "descrição de assistente-metricas" },
      ],
    });
    expect(JSON.stringify(saida)).not.toContain("outra-coisa");
  });

  it("pedir pelo nome uma skill que não é assistente-* devolve guia_inexistente, sem vazar o corpo", async () => {
    const { ferramentas } = montarParaTeste("viewer", {}, { skills: SKILLS });

    const saida = await chamar(ferramentas, "ler_guia", { guia: "outra-coisa" });

    expect(saida).toEqual({ ok: false, motivo: "guia_inexistente" });
    expect(JSON.stringify(saida)).not.toContain("SEGREDO-DA-SKILL-DO-AGENTE");
  });

  it("corpo de 190 linhas sai inteiro, sem cortado", async () => {
    const { ferramentas } = montarParaTeste("viewer", {}, { skills: SKILLS });

    const saida = await chamar<{ ok: boolean; nome: string; corpo: string }>(
      ferramentas,
      "ler_guia",
      { guia: "assistente-metricas" },
    );

    expect(saida.ok).toBe(true);
    expect(saida.nome).toBe("assistente-metricas");
    expect(saida.corpo.split("\n")).toHaveLength(190);
    expect("cortado" in saida).toBe(false);
  });

  it("corpo curto sai inteiro sem cortado", async () => {
    const { ferramentas } = montarParaTeste("viewer", {}, { skills: SKILLS });

    const saida = await chamar(ferramentas, "ler_guia", { guia: "assistente-operacao" });

    expect(saida).toEqual({
      ok: true,
      nome: "assistente-operacao",
      descricao: "descrição de assistente-operacao",
      corpo: "Passo a passo da operação diária.",
    });
    expect("cortado" in saida).toBe(false);
  });

  it("guia que não existe devolve guia_inexistente", async () => {
    const { ferramentas } = montarParaTeste("viewer", {}, { skills: SKILLS });

    expect(await chamar(ferramentas, "ler_guia", { guia: "assistente-nao-existe" })).toEqual({
      ok: false,
      motivo: "guia_inexistente",
    });
  });

  it("espaços em volta do nome do guia são ignorados", async () => {
    const { ferramentas } = montarParaTeste("viewer", {}, { skills: SKILLS });

    const saida = await chamar<{ ok: boolean; nome: string }>(ferramentas, "ler_guia", {
      guia: "  assistente-operacao ",
    });

    expect(saida.ok).toBe(true);
    expect(saida.nome).toBe("assistente-operacao");
  });

  it("sem nenhuma skill a lista vem vazia", async () => {
    const { ferramentas } = montarParaTeste("viewer", {}, { skills: [] });

    expect(await chamar(ferramentas, "ler_guia", {})).toEqual({ ok: true, guias: [] });
  });
});
