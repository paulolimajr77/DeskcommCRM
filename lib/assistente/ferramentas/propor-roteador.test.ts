/**
 * `propor_roteador`: propõe criar/alterar um roteador ou trocar a lista de
 * intenções. Só LÊ (canais, roteadores, agentes) e chama o POST de propostas;
 * id que não aparece na leitura vira PRECISO CONFIRMAR sem propor.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ChamarRota from "@/lib/assistente/metricas/chamar-rota";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import {
  AGENTE_A,
  AGENTE_B,
  CANAL,
  desligarFontes,
  DE_FORA,
  ID_DA_PROPOSTA,
  ligarFontes,
  ROTEADOR,
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

const BASE = { resumo: "Separar vendas e suporte", motivo: "A pessoa quer um roteador no número principal." };

const FONTES_OK: ConfigDeFontes = {
  canais: [{ id: CANAL, display_name: "Principal" }],
  roteadores: { routers: [] },
  agentes: [{ id: AGENTE_A, name: "Vendas" }, { id: AGENTE_B, name: "Suporte" }],
  roteador: {
    [ROTEADOR]: {
      router: { id: ROTEADOR, name: "Roteador antigo", channel_session_id: CANAL, is_active: true, fallback_agent_id: AGENTE_A, config: {} },
      members: [
        { id: "m1", agent_id: AGENTE_A, intent_name: "Vendas", intent_description: "Quer comprar", examples: ["quero comprar"], flow_pointer_id: null, pipeline_id: null, stage_id: null },
      ],
    },
  },
};

beforeEach(() => {
  registro.chamadas.length = 0;
});
afterEach(() => {
  desligarFontes();
  vi.restoreAllMocks();
});

describe("propor_roteador — quem tem", () => {
  it("só admin recebe a ferramenta", () => {
    expect(montarParaTeste("admin").ferramentas).toHaveProperty("propor_roteador");
    for (const papel of ["manager", "agent", "viewer"] as const) {
      expect(montarParaTeste(papel).ferramentas, papel).not.toHaveProperty("propor_roteador");
    }
  });
});

describe("propor_roteador — criar", () => {
  it("caminho feliz: só leituras e o POST de propostas; a proposta nasce sem mudar nada", async () => {
    // Sabotagem: fazer `proporRoteador` chamar `POST /api/v1/ai/routers` (a rota de escrita) →
    // o `soLeituraEPostDePropostas` abaixo fica vermelho.
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin", {}, { turno: { threadId: THREAD, turnId: TURNO } });

    const saida = await chamar(ferramentas, "propor_roteador", {
      operacao: "criar",
      ...BASE,
      name: "Roteador principal",
      channel_session_id: CANAL,
      fallback_agent_id: AGENTE_A,
    });

    expect(saida).toMatchObject({
      ok: true,
      mensagem: expect.stringContaining("Proposta criada, aguardando a aprovação do administrador"),
      proposta: { id: ID_DA_PROPOSTA, tipo: "roteador", operacao: "criar", risco: "atencao", resumo: BASE.resumo },
    });
    expect(fontes.corpoDaProposta()).toEqual({
      kind: "roteador",
      resumo: BASE.resumo,
      motivo: BASE.motivo,
      antes: null,
      payload: {
        operacao: "criar",
        corpo: { name: "Roteador principal", channel_session_id: CANAL, fallback_agent_id: AGENTE_A },
      },
      thread_id: THREAD,
      turn_id: TURNO,
    });
    expect(fontes.envios()).toBe(1);
    expect(soLeituraEPostDePropostas(registro.chamadas)).toBe(true);
    expect(soLeituraEPostDePropostas(fontes.chamadas)).toBe(true);
    expect(registro.chamadas.filter((c) => c.metodo !== "GET")).toEqual([
      { caminho: "/api/v1/ai/assistente/propostas", metodo: "POST" },
    ]);
  });

  it("sem turno no contexto, a proposta nasce sem thread_id e turn_id", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    await chamar(ferramentas, "propor_roteador", { operacao: "criar", ...BASE, name: "R", channel_session_id: CANAL });

    expect(fontes.corpoDaProposta()).not.toHaveProperty("thread_id");
    expect(fontes.corpoDaProposta()).not.toHaveProperty("turn_id");
  });

  it("canal que não é da organização: PRECISO CONFIRMAR e nenhum POST", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string; detalhe: string }>(ferramentas, "propor_roteador", {
      operacao: "criar",
      ...BASE,
      name: "R",
      channel_session_id: DE_FORA,
    });

    expect(saida).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(saida.detalhe).toContain("PRECISO CONFIRMAR");
    expect(fontes.envios()).toBe(0);
  });

  it("número que já tem roteador ativo: PRECISO CONFIRMAR (a aplicação seria um 409)", async () => {
    const fontes = ligarFontes({
      ...FONTES_OK,
      roteadores: { routers: [{ id: ROTEADOR, channel_session_id: CANAL, is_active: true }] },
    });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "propor_roteador", { operacao: "criar", ...BASE, name: "R", channel_session_id: CANAL });

    expect(saida).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(fontes.envios()).toBe(0);
  });

  it("agente de reserva que não é da organização: PRECISO CONFIRMAR", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "propor_roteador", {
      operacao: "criar",
      ...BASE,
      name: "R",
      channel_session_id: CANAL,
      fallback_agent_id: DE_FORA,
    });

    expect(saida).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(fontes.envios()).toBe(0);
  });

  it("faltando campo obrigatório ou com campo que não vale: parametro_invalido, sem leitura nem POST", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const faltando = await chamar(ferramentas, "propor_roteador", { operacao: "criar", ...BASE, name: "R" });
    const sobrando = await chamar(ferramentas, "propor_roteador", {
      operacao: "criar",
      ...BASE,
      name: "R",
      channel_session_id: CANAL,
      router_id: ROTEADOR,
    });

    expect(faltando).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    expect(sobrando).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    expect(fontes.chamadas).toEqual([]);
  });
});

describe("propor_roteador — alterar", () => {
  it("monta o antes com o estado atual e propõe só o que mudou", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "propor_roteador", {
      operacao: "alterar",
      ...BASE,
      router_id: ROTEADOR,
      name: "Roteador novo",
    });

    expect(saida).toMatchObject({ ok: true, proposta: { operacao: "alterar" } });
    expect(fontes.corpoDaProposta()).toMatchObject({
      antes: { nome: "Roteador antigo", agente_de_reserva_id: AGENTE_A, ativo: true },
      payload: { operacao: "alterar", router_id: ROTEADOR, corpo: { name: "Roteador novo" } },
    });
    expect(soLeituraEPostDePropostas(registro.chamadas)).toBe(true);
  });

  it("roteador que não é da organização (404 na leitura): PRECISO CONFIRMAR, sem POST", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "propor_roteador", { operacao: "alterar", ...BASE, router_id: DE_FORA, name: "X" });

    expect(saida).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(fontes.envios()).toBe(0);
  });

  it("sem nada a mudar, ou com campo de outra operação: parametro_invalido", async () => {
    ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const vazio = await chamar(ferramentas, "propor_roteador", { operacao: "alterar", ...BASE, router_id: ROTEADOR });
    const canalNaoMuda = await chamar(ferramentas, "propor_roteador", {
      operacao: "alterar",
      ...BASE,
      router_id: ROTEADOR,
      channel_session_id: CANAL,
    });

    expect(vazio).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    expect(canalNaoMuda).toMatchObject({ ok: false, motivo: "parametro_invalido" });
  });

  it("falha da leitura (500) é indisponivel, e a que lança também — nunca lança", async () => {
    ligarFontes({ ...FONTES_OK, falhar: { roteador: 500 } });
    const { ferramentas } = montarParaTeste("admin");
    const quinhentos = await chamar(ferramentas, "propor_roteador", { operacao: "alterar", ...BASE, router_id: ROTEADOR, name: "X" });
    expect(quinhentos).toEqual({ ok: false, motivo: "indisponivel" });

    ligarFontes({ ...FONTES_OK, falhar: { roteador: "lancar" } });
    const lancou = await chamar(ferramentas, "propor_roteador", { operacao: "alterar", ...BASE, router_id: ROTEADOR, name: "X" });
    expect(lancou).toEqual({ ok: false, motivo: "indisponivel" });
  });
});

describe("propor_roteador — membros", () => {
  const membros = [
    { agent_id: AGENTE_A, intent_name: "Vendas", intent_description: "Quer comprar", examples: ["quero comprar"] },
    { agent_id: AGENTE_B, intent_name: "Suporte", intent_description: "Tem um problema" },
  ];

  it("propõe a lista inteira e guarda no antes a lista atual", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "propor_roteador", { operacao: "membros", ...BASE, router_id: ROTEADOR, members: membros });

    expect(saida).toMatchObject({ ok: true, proposta: { operacao: "membros" } });
    expect(fontes.corpoDaProposta()).toMatchObject({
      antes: {
        nome: "Roteador antigo",
        intencoes: [{ agente_id: AGENTE_A, nome: "Vendas", descricao: "Quer comprar", exemplos: ["quero comprar"] }],
      },
      payload: { operacao: "membros", router_id: ROTEADOR, corpo: { members: membros } },
    });
    expect(soLeituraEPostDePropostas(registro.chamadas)).toBe(true);
  });

  it("agente de fora da organização: PRECISO CONFIRMAR, sem POST", async () => {
    const fontes = ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "propor_roteador", {
      operacao: "membros",
      ...BASE,
      router_id: ROTEADOR,
      members: [{ agent_id: DE_FORA, intent_name: "X", intent_description: "Y" }],
    });

    expect(saida).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(fontes.envios()).toBe(0);
  });

  it("intenção atual com roteiro, funil ou etapa de destino: não propõe (a troca apagaria o vínculo)", async () => {
    // Sabotagem: apagar o bloco `comDestino` de propor-roteador.ts → este caso fica vermelho.
    const comVinculo = {
      ...FONTES_OK,
      roteador: {
        [ROTEADOR]: {
          router: { id: ROTEADOR, name: "R", is_active: true },
          members: [{ agent_id: AGENTE_A, intent_name: "Vendas", intent_description: "x", pipeline_id: ROTEADOR }],
        },
      },
    };
    const fontes = ligarFontes(comVinculo);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ detalhe: string }>(ferramentas, "propor_roteador", {
      operacao: "membros",
      ...BASE,
      router_id: ROTEADOR,
      members: membros,
    });

    expect(saida).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(saida.detalhe).toContain("apagaria esses vínculos");
    expect(fontes.envios()).toBe(0);
  });

  it("lista vazia, intenção repetida ou campos de funil: parametro_invalido", async () => {
    ligarFontes(FONTES_OK);
    const { ferramentas } = montarParaTeste("admin");

    const vazia = await chamar(ferramentas, "propor_roteador", { operacao: "membros", ...BASE, router_id: ROTEADOR, members: [] });
    const repetida = await chamar(ferramentas, "propor_roteador", {
      operacao: "membros",
      ...BASE,
      router_id: ROTEADOR,
      members: [membros[0], { ...membros[0] }],
    });
    const comFunil = await chamar(ferramentas, "propor_roteador", {
      operacao: "membros",
      ...BASE,
      router_id: ROTEADOR,
      members: [{ ...membros[0], pipeline_id: ROTEADOR }],
    });

    expect(vazia).toEqual({ ok: false, motivo: "parametro_invalido" });
    expect(repetida).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    expect(comFunil).toEqual({ ok: false, motivo: "parametro_invalido" });
  });
});

describe("propor_roteador — a rota de propostas responde", () => {
  const pedido = { operacao: "criar", ...BASE, name: "R", channel_session_id: CANAL } as const;

  it("403 vira PRECISO CONFIRMAR; 422 vira parametro_invalido; 500 e corpo sem data viram indisponivel", async () => {
    const { ferramentas } = montarParaTeste("admin");

    ligarFontes({ ...FONTES_OK, propostas: { status: 403 } });
    expect(await chamar(ferramentas, "propor_roteador", pedido)).toMatchObject({ ok: false, motivo: "preciso_confirmar" });

    ligarFontes({ ...FONTES_OK, propostas: { status: 422 } });
    expect(await chamar(ferramentas, "propor_roteador", pedido)).toMatchObject({ ok: false, motivo: "parametro_invalido" });

    ligarFontes({ ...FONTES_OK, propostas: { status: 500 } });
    expect(await chamar(ferramentas, "propor_roteador", pedido)).toEqual({ ok: false, motivo: "indisponivel" });

    ligarFontes({ ...FONTES_OK, propostas: { semData: true } });
    expect(await chamar(ferramentas, "propor_roteador", pedido)).toEqual({ ok: false, motivo: "indisponivel" });

    ligarFontes({ ...FONTES_OK, falhar: { propostas: "lancar" } });
    expect(await chamar(ferramentas, "propor_roteador", pedido)).toEqual({ ok: false, motivo: "indisponivel" });
  });

  it("proposta já existente no turno (idempotência) com outro resumo: diz que a nova NÃO foi criada", async () => {
    // Sabotagem: apagar a comparação `dados.resumo !== validacao.data.resumo` em proposta-comum.ts
    // → o tool diria "criada" para uma proposta que a rota não gravou: este caso fica vermelho.
    ligarFontes({ ...FONTES_OK, propostas: { status: 200, resumoDevolvido: "Outro resumo, de antes" } });
    const { ferramentas } = montarParaTeste("admin", {}, { turno: { threadId: THREAD, turnId: TURNO } });

    const saida = await chamar<{ detalhe: string }>(ferramentas, "propor_roteador", pedido);

    expect(saida).toMatchObject({ ok: false, motivo: "preciso_confirmar" });
    expect(saida.detalhe).toContain("NÃO foi criada");
  });

  it("reenvio do MESMO pedido no turno (200 com o mesmo resumo) conta como a proposta criada", async () => {
    ligarFontes({ ...FONTES_OK, propostas: { status: 200 } });
    const { ferramentas } = montarParaTeste("admin", {}, { turno: { threadId: THREAD, turnId: TURNO } });

    expect(await chamar(ferramentas, "propor_roteador", pedido)).toMatchObject({ ok: true });
  });
});
