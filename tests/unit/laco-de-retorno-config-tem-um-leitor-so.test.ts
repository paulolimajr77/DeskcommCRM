/**
 * O LAÇO DE RETORNO DO ASSISTENTE TEM UM LEITOR SÓ (F4, invariante 7).
 *
 * O painel de Evolução mostra o que aconteceu com as propostas de configuração
 * (`config_proposals`). A leitura mora em `lib/ai/evolution/propostas-de-config.ts`
 * e o raciocínio em `aggregate.ts` (puro). Duas coisas não podem acontecer:
 *
 *   - a ROTA ler a tabela por conta própria — seria um segundo leitor, fora do
 *     filtro de organização e da lista de colunas (sem `payload`/`motivo`) que o
 *     leitor oficial garante;
 *   - o AGREGADOR ganhar acesso a banco — deixaria de ser testável sem Postgres.
 *
 * Nota: `telemetria-tem-um-leitor-so.test.ts` vigia OUTRA tabela (`ai_invocations`).
 * Ele não enxerga `config_proposals`; esta cerca é a que enxerga.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const ler = (caminho: string) => readFileSync(caminho, "utf8");

const ROTA = ler("app/api/v1/ai/evolution/route.ts");
const LEITOR = ler("lib/ai/evolution/propostas-de-config.ts");
const AGREGADOR = ler("lib/ai/evolution/aggregate.ts");

describe("laço de retorno do assistente: um leitor só", () => {
  it("a rota não lê config_proposals nem config_snapshots por conta própria", () => {
    // Sem comentários e sem o RÓTULO do aviso de falha (`fonteFalhou("config_proposals", …)`),
    // que nomeia a fonte no log e não a consulta.
    const codigo = ROTA.replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/fonteFalhou\("config_proposals"/g, "fonteFalhou(ROTULO");
    expect(codigo, "a rota voltou a ler a tabela direto: passe por lerPropostasDeConfig").not.toMatch(
      /config_proposals|config_snapshots/,
    );
    expect(ROTA).toContain("lerPropostasDeConfig(");
  });

  it("o leitor oficial lê a tabela, filtra a organização e não puxa conteúdo", () => {
    expect(LEITOR).toContain('.from("config_proposals")');
    expect(LEITOR).toContain('.eq("organization_id", orgId)');
    const colunas = LEITOR.match(/\.select\("([^"]+)"\)/)?.[1] ?? "";
    expect(colunas).not.toBe("");
    for (const proibida of ["payload", "antes", "motivo", "decision_reason", "resumo", "apply_result", "*"]) {
      expect(colunas, `o leitor puxou ${proibida}, que pode ter prompt ou texto do cliente`).not.toContain(proibida);
    }
  });

  it("o agregador continua puro: sem banco", () => {
    expect(AGREGADOR).not.toMatch(/\.from\(|supabase|createClient/);
  });
});
