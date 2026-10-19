// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ToolSet } from "ai";

import { criarLerPorta } from "./ler-porta";
import { montarParaTeste, chamar } from "./auxiliar-de-teste";

vi.mock("@/lib/assistente/portas/abrir", () => ({
  abrirPorta: vi.fn(),
}));

vi.mock("@/lib/assistente/metricas/chamar-rota", () => ({
  chamarRotaPorDentro: vi.fn(),
}));

import { abrirPorta } from "@/lib/assistente/portas/abrir";
import { chamarRotaPorDentro } from "@/lib/assistente/metricas/chamar-rota";

const mockAbrirPorta = abrirPorta as ReturnType<typeof vi.fn>;
const mockChamarRota = chamarRotaPorDentro as ReturnType<typeof vi.fn>;

describe("ler_porta", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAbrirPorta.mockReturnValue(null);
    mockChamarRota.mockResolvedValue({ status: 200, corpo: { data: { id: "abc" } } });
  });

  it("recusa porta proibida com porta_proibida", async () => {
    const { ferramentas } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "ler_porta", { porta: "cron/routing-worker" });
    expect(saida).toEqual({ ok: false, motivo: "porta_proibida" });
  });

  it("recusa porta inexistente com porta_proibida", async () => {
    const { ferramentas } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "ler_porta", { porta: "inexistente" });
    expect(saida).toEqual({ ok: false, motivo: "porta_proibida" });
  });

  it("entrada com porta vazia é recusada", async () => {
    const { ferramentas } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "ler_porta", { porta: "" });
    expect(saida).toEqual({ ok: false, motivo: "parametro_invalido" });
  });

  it("lê uma porta GET permitida quando abrirPorta retorna handler", async () => {
    mockAbrirPorta.mockReturnValue({
      handler: async () => new Response(JSON.stringify({ data: { id: "abc" } }), { status: 200 }),
      caminho: "/api/v1/ai/agents",
    });
    const { ferramentas } = montarParaTeste("admin");
    const saida = await chamar(ferramentas, "ler_porta", { porta: "ai/agents" });
    expect(saida).toEqual({ dados: { id: "abc" }, cortado: false });
  });
});
