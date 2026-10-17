/**
 * `propor_modelo_dos_auxiliares`: propõe o modelo de um ponto de IA ou o padrão
 * da empresa. Credencial NUNCA entra; provedor, modelo e ponto só valem se
 * aparecem na leitura de `GET /api/v1/ai/providers` (a fonte da tela).
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ChamarRota from "@/lib/assistente/metricas/chamar-rota";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import {
  desligarFontes,
  ID_DA_PROPOSTA,
  ligarFontes,
  soLeituraEPostDePropostas,
  THREAD,
  TURNO,
  type ConfigDeFontes,
} from "./auxiliar-de-proposta";

const registro = vi.hoisted(() => ({ chamadas: [] as Array<{ caminho: string; metodo: string }> }));
vi.mock("@/lib/assistente/metricas/chamar-rota", async (original) => {
  const real = await original<typeof ChamarRota>();
  return {
    ...real,
    chamarRotaPorDentro: vi.fn((...args: Parameters<typeof real.chamarRotaPorDentro>) => {
      registro.chamadas.push({ caminho: args[1], metodo: args[3]?.metodo ?? "GET" });
      return real.chamarRotaPorDentro(...args);
    }),
  };
});

const BASE = { resumo: "Usar um modelo mais barato nos auxiliares", motivo: "A pessoa quer reduzir o custo." };

const PROVEDORES_OK = {
  pontos: [
    { id: "followup_classify", fixo: null, efetivo: { provider: "anthropic", modelId: "claude-sonnet-4-6", credentialId: null, origem: "padrao_da_organizacao" } },
    { id: "transcricao_de_audio", fixo: { razao: "o produto escolhe sozinho" }, efetivo: { provider: "openai", modelId: "whisper-1", origem: "fixo" } },
  ],
  padrao: { provider: "anthropic", defaultModel: "claude-sonnet-4-6" },
  provedores: [{ id: "anthropic" }, { id: "openai" }],
  credenciais: [{ id: "c1", provider: "anthropic", label: "Chave", validated_at: "2026-10-01T00:00:00Z", is_active: true }],
  modelos: [
    { provider: "anthropic", model_id: "claude-sonnet-4-6" },
    { provider: "anthropic", model_id: "claude-haiku-4-5" },
    { provider: "openai", model_id: "gpt-5-mini" },
  ],
};

const FONTES_OK: ConfigDeFontes = { provedores: PROVEDORES_OK };

beforeEach(() => {
  registro.chamadas.length = 0;
});
afterEach(() => {
  desligarFontes();
  vi.restoreAllMocks();
});

describe("propor_modelo_dos_auxiliares", () => {
  it("só admin recebe a ferramenta", () => {
    expect(montarParaTeste("admin").ferramentas).toHaveProperty("propor_modelo_dos_auxiliares");
    for (const papel of ["manager", "agent", "viewer"] as const) {
      expect(montarParaTeste(papel).ferramentas, papel).not.toHaveProperty("propor_modelo_dos_auxiliares");
    }
  });

  it("definir_ponto: propõe com o antes lido do ponto; só leitura e o POST de propostas", async () => {
    // Sabotagem: fazer a ferramenta chamar `PUT /api/v1/ai/providers` → o `soLeituraEPostDePropostas` fica vermelho.
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin", {}, { turno: { threadId: THREAD, turnId: TURNO } });

    const saida = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_ponto",
      ...BASE,
      purpose: "followup_classify",
      provider: "anthropic",
      model_id: "claude-haiku-4-5",
    });

    expect(saida).toMatchObject({
      ok: true,
      mensagem: expect.stringContaining("aguardando a aprovação do administrador"),
      proposta: { id: ID_DA_PROPOSTA, tipo: "modelo_auxiliares", operacao: "definir_ponto", risco: "atencao" },
    });
    expect(fontes.corpoDaProposta()).toMatchObject({
      kind: "modelo_auxiliares",
      antes: { ponto: "followup_classify", provedor: "anthropic", modelo: "claude-sonnet-4-6", origem: "padrao_da_organizacao" },
      payload: {
        operacao: "definir_ponto",
        corpo: { purpose: "followup_classify", provider: "anthropic", model_id: "claude-haiku-4-5" },
      },
      thread_id: THREAD,
      turn_id: TURNO,
    });
    expect(soLeituraEPostDePropostas(registro.chamadas)).toBe(true);
    expect(registro.chamadas.filter((c) => c.metodo !== "GET")).toEqual([
      { caminho: "/api/v1/ai/assistente/propostas", metodo: "POST" },
    ]);
  });

  it("a proposta NUNCA leva credential_id, base_url nem is_enabled", async () => {
    // Sabotagem: acrescentar `credential_id` ao payload montado em propor-modelo-dos-auxiliares.ts
    // → este caso (e o `payload.test`) ficam vermelhos.
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_ponto",
      ...BASE,
      purpose: "followup_classify",
      provider: "anthropic",
      model_id: "claude-haiku-4-5",
    });

    const texto = JSON.stringify(fontes.corpoDaProposta());
    expect(texto).not.toContain("credential");
    expect(texto).not.toContain("base_url");
    expect(texto).not.toContain("is_enabled");
    // E o esquema da ferramenta não aceita credential_id nem se o modelo insistir.
    const insistindo = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_ponto",
      ...BASE,
      purpose: "followup_classify",
      provider: "anthropic",
      model_id: "claude-haiku-4-5",
      credential_id: "c1",
    });
    expect(insistindo).toEqual({ ok: false, motivo: "parametro_invalido" });
  });

  it("definir_padrao: propõe com o padrão atual no antes", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_padrao",
      ...BASE,
      provider: "anthropic",
      default_model: "claude-haiku-4-5",
    });

    expect(saida).toMatchObject({ ok: true, proposta: { operacao: "definir_padrao" } });
    expect(fontes.corpoDaProposta()).toMatchObject({
      antes: { provedor: "anthropic", modelo: "claude-sonnet-4-6" },
      payload: { operacao: "definir_padrao", corpo: { provider: "anthropic", default_model: "claude-haiku-4-5" } },
    });
  });

  it("modelo que não está no catálogo do provedor: PRECISO CONFIRMAR, sem POST — nunca string inventada", async () => {
    // Sabotagem: apagar a conferência `modelos.some(...)` → o POST sai com "modelo-inventado" e este caso fica vermelho.
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const inventado = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_padrao",
      ...BASE,
      provider: "anthropic",
      default_model: "modelo-inventado",
    });
    // O modelo existe, mas é de OUTRO provedor.
    const deOutro = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_padrao",
      ...BASE,
      provider: "anthropic",
      default_model: "gpt-5-mini",
    });

    expect(inventado).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(deOutro).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(fontes.envios()).toBe(0);
  });

  it("provedor que a instalação não oferece (ou que o sistema não conhece): sem POST", async () => {
    const fontes = ligarFontes({ provedores: { ...PROVEDORES_OK, provedores: [{ id: "anthropic" }] } });
    const { ferramentas } = montarParaTeste("admin");

    const naoOferecido = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_padrao",
      ...BASE,
      provider: "openai",
      default_model: "gpt-5-mini",
    });
    const desconhecido = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_padrao",
      ...BASE,
      provider: "provedor-inventado",
      default_model: "x",
    });

    expect(naoOferecido).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(desconhecido).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(fontes.envios()).toBe(0);
  });

  it("catálogo vazio (instalação sem sincronização): PRECISO CONFIRMAR, nunca palpite", async () => {
    const fontes = ligarFontes({ provedores: { ...PROVEDORES_OK, modelos: [] } });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_padrao",
      ...BASE,
      provider: "anthropic",
      default_model: "claude-haiku-4-5",
    });

    expect(saida).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(fontes.envios()).toBe(0);
  });

  it("ponto que não existe ou que é fixo no produto: PRECISO CONFIRMAR", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const inexistente = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_ponto",
      ...BASE,
      purpose: "ponto_que_nao_existe",
      provider: "anthropic",
      model_id: "claude-haiku-4-5",
    });
    const fixo = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_ponto",
      ...BASE,
      purpose: "transcricao_de_audio",
      provider: "openai",
      model_id: "gpt-5-mini",
    });

    expect(inexistente).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(fixo).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(fontes.envios()).toBe(0);
  });

  it("provedor sem chave validada: a proposta vai, com aviso honesto (a IA não preenche chave)", async () => {
    ligarFontes({ provedores: { ...PROVEDORES_OK, credenciais: [] } });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; avisos: string[] }>(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_padrao",
      ...BASE,
      provider: "anthropic",
      default_model: "claude-haiku-4-5",
    });

    expect(saida.ok).toBe(true);
    expect(saida.avisos.join(" ")).toContain("Ainda não há chave validada");
    expect(saida.avisos.join(" ")).toContain("A IA nunca preenche chave");
  });

  it("com chave validada do provedor, não há aviso", async () => {
    ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "propor_modelo_dos_auxiliares", {
      operacao: "definir_padrao",
      ...BASE,
      provider: "anthropic",
      default_model: "claude-haiku-4-5",
    });

    expect(saida).not.toHaveProperty("avisos");
  });

  it("campo que não vale para a operação ou ausente: parametro_invalido, sem leitura", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    for (const entrada of [
      { operacao: "definir_ponto", ...BASE, provider: "anthropic", model_id: "claude-haiku-4-5" },
      { operacao: "definir_ponto", ...BASE, purpose: "followup_classify", provider: "anthropic" },
      { operacao: "definir_padrao", ...BASE, provider: "anthropic", model_id: "claude-haiku-4-5" },
      { operacao: "definir_padrao", ...BASE, provider: "anthropic" },
    ]) {
      expect(await chamar(ferramentas, "propor_modelo_dos_auxiliares", entrada), JSON.stringify(entrada)).toMatchObject({
        ok: false,
        motivo: "parametro_invalido",
      });
    }
    expect(fontes.chamadas).toEqual([]);
  });

  it("leitura fora do ar, sem o formato esperado ou que lança: indisponivel, nunca lança", async () => {
    const { ferramentas } = montarParaTeste("admin");
    const pedido = { operacao: "definir_padrao", ...BASE, provider: "anthropic", default_model: "claude-haiku-4-5" } as const;

    ligarFontes({ ...FONTES_OK, falhar: { provedores: 500 } });
    expect(await chamar(ferramentas, "propor_modelo_dos_auxiliares", pedido)).toEqual({ ok: false, motivo: "indisponivel" });
    ligarFontes({ ...FONTES_OK, falhar: { provedores: "lancar" } });
    expect(await chamar(ferramentas, "propor_modelo_dos_auxiliares", pedido)).toEqual({ ok: false, motivo: "indisponivel" });
    ligarFontes({ provedores: { pontos: [] } });
    expect(await chamar(ferramentas, "propor_modelo_dos_auxiliares", pedido)).toEqual({ ok: false, motivo: "indisponivel" });
  });
});
