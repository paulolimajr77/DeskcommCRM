/**
 * `listar_modelos_de_followup`: o catálogo de modelos da código, projetado por
 * LISTA POSITIVA. Sai só o que a pessoa precisa para escolher — id, nome,
 * nicho, resumo, o que dispara, se pede etapa, quantos toques e o horizonte em
 * dias. O grafo e os textos das mensagens NUNCA saem daqui.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  horizonteDoModeloMs,
  MODELOS_DE_FOLLOWUP,
  toquesDoModelo,
} from "@/lib/followup/modelos";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";

const DIA_MS = 86_400_000;

describe("listar_modelos_de_followup", () => {
  it("sai só a lista positiva: nada de grafo, textos de mensagem ou política de handoff", async () => {
    const { ferramentas } = montarParaTeste("manager");

    const saida = await chamar(ferramentas, "listar_modelos_de_followup", {});

    const esperado = MODELOS_DE_FOLLOWUP.map((modelo) => ({
      id: modelo.id,
      nome: modelo.nome,
      nicho: modelo.nicho,
      resumo: modelo.resumo,
      oQueDispara: modelo.oQueDispara,
      pedeEtapa: modelo.pedeEtapa,
      toques: toquesDoModelo(modelo.grafo),
      horizonte_dias: Math.round(horizonteDoModeloMs(modelo.grafo) / DIA_MS),
    }));
    expect(saida).toEqual({ ok: true, modelos: esperado });

    // Sentinela: o texto do grafo do primeiro modelo não pode vazar.
    const texto = JSON.stringify(saida);
    expect(texto).not.toContain("Ficamos de acertar o horário");
    expect(texto).not.toContain("handoffPolicy");
    expect(texto).not.toContain("grafo");
  });

  it("os toques e o horizonte batem com os helpers, calculados do grafo", () => {
    const consulta = MODELOS_DE_FOLLOWUP.find((m) => m.id === "clinica-consulta-retomada");
    expect(consulta).toBeDefined();
    if (!consulta) return;

    expect(toquesDoModelo(consulta.grafo)).toBe(3);
    expect(Math.round(horizonteDoModeloMs(consulta.grafo) / DIA_MS)).toBeGreaterThan(0);
  });
});
