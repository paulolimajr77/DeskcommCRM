/**
 * O RAMO DO ASSISTENTE NO DUBLÊ DE MODELO DO E2E.
 *
 * Não existia teste de `previewFixtureRegistry` (só o uso em
 * `request-deps.ts`, sob `INTERNAL_AGENT_RUN_STUB`) — este arquivo nasce com o
 * ramo novo. O dublê é exercitado pelo `doGenerate` do modelo fake, sem rede.
 */
import { describe, expect, it } from "vitest";

import { MARCA_DO_ASSISTENTE } from "./assistente/prompt";
import { previewFixtureRegistry } from "./preview-fixture";

type ConteudoDoDuble =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: string };

interface RespostaDoDuble {
  content: ConteudoDoDuble[];
}

type FabricaDoModelo = (apiKey: string, modelId: string) => {
  doGenerate: (opcoes: unknown) => Promise<RespostaDoDuble>;
};

function fabrica(): FabricaDoModelo {
  const registro = previewFixtureRegistry() as unknown as Record<string, FabricaDoModelo>;
  const f = registro.anthropic;
  if (typeof f !== "function") throw new Error("o dublê não expõe o provider fake esperado");
  return f;
}

function opcoes(prompt: unknown[], tools?: Array<{ type: string; name: string }>): unknown {
  return { prompt, tools };
}

const SYSTEM_DO_ASSISTENTE = `${MARCA_DO_ASSISTENTE} — prompt de teste]`;
const FERRAMENTAS_DO_ASSISTENTE = [{ type: "function", name: "listar_metricas" }];

describe("previewFixtureRegistry — o ramo do assistente", () => {
  it("1ª etapa: com a marca e sem resultado, pede `listar_metricas`", async () => {
    const r = await fabrica()("chave", "modelo").doGenerate(
      opcoes([{ role: "system", content: SYSTEM_DO_ASSISTENTE }], FERRAMENTAS_DO_ASSISTENTE),
    );
    expect(r.content).toHaveLength(1);
    expect(r.content[0]).toMatchObject({ type: "tool-call", toolName: "listar_metricas" });
  });

  it("2ª etapa: com o resultado da ferramenta no prompt, devolve o texto", async () => {
    const r = await fabrica()("chave", "modelo").doGenerate(
      opcoes(
        [
          { role: "system", content: SYSTEM_DO_ASSISTENTE },
          { role: "tool", content: [{ toolName: "listar_metricas", resultado: "ok" }] },
        ],
        FERRAMENTAS_DO_ASSISTENTE,
      ),
    );
    expect(r.content).toEqual([{ type: "text", text: "Resposta de teste do assistente." }]);
  });

  it("prompt SEM a marca segue o comportamento antigo", async () => {
    // A guarda contra regressão do ramo vizinho: o assistente não pode mudar o
    // que o dublê devolve para os outros turnos.
    const r = await fabrica()("chave", "modelo").doGenerate(
      opcoes([{ role: "system", content: "Turno interno de memória" }], [
        { type: "function", name: "search_knowledge" },
        { type: "function", name: "send_message" },
      ]),
    );
    expect(r.content[0]).toMatchObject({ type: "tool-call", toolName: "search_knowledge" });
  });
});
