/**
 * Garante que lib/assistente/portas/catalogo.gerado.ts esta em dia com o
 * gerador. Rode o gerador (pnpm portas:gerar) sempre que adicionar/remover
 * rotas em app/api/v1/. Qualquer divergencia -> vermelho.
 *
 * O esperado e gerado a partir das rotas REAIS em app/api/v1 (via varrerRotas),
 * nao do proprio arquivo gerado, para que remover/alterar uma linha do arquivo
 * seja detectada.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { montarConteudoCatalogo, varrerRotas } from "../../scripts/gerar-catalogo-de-portas";

const CAMINHO_GERADO =
  "D:/PROJETOS VIBE CODING/DeskcommCRM-agente-interno/lib/assistente/portas/catalogo.gerado.ts";

describe("catalogo de portas em dia", () => {
  it("o arquivo commitado coincide com a saida pura do gerador", () => {
    const esperado = montarConteudoCatalogo(varrerRotas());
    const atual = readFileSync(CAMINHO_GERADO, "utf8");
    expect(atual).toBe(esperado);
  });

  it("nao esta vazio", () => {
    expect(varrerRotas().length).toBeGreaterThan(0);
  });
});
