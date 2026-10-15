/**
 * `ler_guia`: só os guias `assistente-*` saem — uma skill de agente da
 * organização (outro nome) nunca é lida por aqui, mesmo que a lista chegue
 * inteira. O corpo é cortado em 6000 caracteres.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { chamar, montarParaTeste, skillDe } from "./auxiliar-de-teste";
import { LIMITE_DO_CORPO_DO_GUIA } from "./ler-guia";

const SKILLS = [
  skillDe("assistente-operacao", "Passo a passo da operação diária."),
  skillDe("assistente-metricas", "m".repeat(8000)),
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

  it("corpo de 8000 caracteres sai com 6000 e cortado true", async () => {
    const { ferramentas } = montarParaTeste("viewer", {}, { skills: SKILLS });

    const saida = await chamar<{ ok: boolean; nome: string; corpo: string; cortado: boolean }>(
      ferramentas,
      "ler_guia",
      { guia: "assistente-metricas" },
    );

    expect(LIMITE_DO_CORPO_DO_GUIA).toBe(6000);
    expect(saida.ok).toBe(true);
    expect(saida.nome).toBe("assistente-metricas");
    expect(saida.corpo).toBe("m".repeat(6000));
    expect(saida.cortado).toBe(true);
  });

  it("corpo curto sai inteiro com cortado false", async () => {
    const { ferramentas } = montarParaTeste("viewer", {}, { skills: SKILLS });

    const saida = await chamar(ferramentas, "ler_guia", { guia: "assistente-operacao" });

    expect(saida).toEqual({
      ok: true,
      nome: "assistente-operacao",
      descricao: "descrição de assistente-operacao",
      corpo: "Passo a passo da operação diária.",
      cortado: false,
    });
  });

  it("corpo com exatamente 6000 caracteres não é cortado", async () => {
    const { ferramentas } = montarParaTeste("viewer", {}, { skills: [skillDe("assistente-exato", "e".repeat(6000))] });

    const saida = await chamar<{ corpo: string; cortado: boolean }>(ferramentas, "ler_guia", {
      guia: "assistente-exato",
    });

    expect(saida.corpo.length).toBe(6000);
    expect(saida.cortado).toBe(false);
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
