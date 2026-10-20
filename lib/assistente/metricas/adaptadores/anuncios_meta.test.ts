/**
 * Testes do ADAPTADOR `anuncios_meta`. As duas rotas (`ads/meta/accounts` e
 * `ads/meta/campaigns`) são trocadas por handlers falsos; o cache e o relógio
 * dele são os reais, limpos a cada caso. Papel mínimo `manager`.
 */
// @vitest-environment node
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { limparCacheDeAnuncios, sobreporRelogioDoCache } from "@/lib/assistente/metricas/anuncios/cache-ttl";
import { metricaAnunciosMeta, sobreporHandlersDeAnuncios } from "@/lib/assistente/metricas/adaptadores/anuncios_meta";
import { criarBancoFalso } from "@/lib/assistente/metricas/consultas/banco-falso";
import { chavesProibidasEm } from "@/lib/assistente/metricas/projecao";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import type { ContextoDeConsulta, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";
import { rotuloDoIndicador } from "@/lib/plataformas-de-anuncio/meta/tabela-de-campanhas";

const ORG = "11111111-2222-4333-8444-555555555555";
const AGORA = "2026-10-14T10:00:00-03:00";
const SEMANA = { tipo: "intervalo" as const, de: "2026-10-07", ate: "2026-10-13" };

const COMPRAS = "actions:offsite_conversion.fb_pixel_purchase";
const CONVERSAS = "actions:onsite_conversion.messaging_conversation_started_7d";
const CADASTROS = "actions:offsite_conversion.fb_pixel_lead";

interface CampanhaSaida {
  nome: string;
  status: string | null;
  tipo_de_resultado: string;
  rotulo_do_resultado: string | null;
  resultados: number | null;
  custo_por_resultado: number | null;
  custo_por_venda: number | null;
  gasto: number | null;
  impressoes: number | null;
  alcance: number | null;
  cpm: number | null;
  ctr: number | null;
  cpc: number | null;
  frequencia: number | null;
}
interface TotaisSaida {
  gasto: number | null;
  impressoes: number | null;
}
interface DadosEsperados {
  conta: { nome: string; moeda: string };
  periodo: { de: string; ate: string };
  campanhas: CampanhaSaida[];
  campanhas_omitidas: number;
  totais: TotaisSaida;
  comparacao: null | {
    periodo: { de: string; ate: string };
    totais: TotaisSaida;
    campanhas: CampanhaSaida[];
    campanhas_omitidas: number;
  };
}

function dadosDe(r: ResultadoDeMetrica): DadosEsperados {
  if (!r.ok || r.dados === null || r.dados === undefined) throw new Error("esperava dados");
  return r.dados as DadosEsperados;
}

function avisosDe(r: ResultadoDeMetrica): string[] {
  if (!r.ok) throw new Error("esperava ok");
  return r.avisos;
}

function campanha(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    campanhaId: "ID-INTERNO-DA-CAMPANHA",
    nome: "Campanha",
    status: "ACTIVE",
    veiculacao: "ACTIVE",
    objetivo: "OUTCOME_SALES",
    resultado: { valor: 10, custoPorResultado: 50, indicador: COMPRAS },
    gasto: 500,
    impressoes: 1000,
    alcance: 800,
    cpm: 5,
    ctr: 1.2,
    connectRate: 33,
    frequencia: 1.25,
    cpc: 0.5,
    hookRate: 12,
    thruPlays: 40,
    ...parcial,
  };
}

function conta(id: string, nome: string, moeda = "BRL"): Record<string, unknown> {
  return { id, nome, moeda, status: 1 };
}

function pacoteDeCampanhas(campanhas: Record<string, unknown>[], avisos: string[] = []) {
  return {
    campanhas,
    periodo: { from: "2026-10-07", to: "2026-10-13" },
    account_id: "act_111",
    lido_em: "2026-10-14T10:00:00-03:00",
    avisos,
  };
}

function respostaOk(dados: unknown): Response {
  return new Response(JSON.stringify({ data: dados }), { status: 200 });
}

function respostaDeErro(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: "MENSAGEM-CRUA-DA-ROTA" } }), { status });
}

/** Handler falso que registra os parâmetros de cada chamada. */
function falso(fabrica: (parametros: URLSearchParams) => Response | Promise<Response>) {
  const chamadas: URLSearchParams[] = [];
  const handler = vi.fn(async (req: NextRequest) => {
    const parametros = new URL(req.url).searchParams;
    chamadas.push(parametros);
    return fabrica(parametros);
  });
  return { handler, chamadas };
}

const CONTAS_PADRAO = { contas: [conta("act_111", "Conta A"), conta("act_222", "Conta B")], conta_padrao: "act_111" };

function instalar(opcoes: {
  contas?: unknown;
  respostaDeContas?: Response;
  campanhas?: (parametros: URLSearchParams) => Response | Promise<Response>;
}) {
  const deContas = falso(() => opcoes.respostaDeContas ?? respostaOk(opcoes.contas ?? CONTAS_PADRAO));
  const deCampanhas = falso(opcoes.campanhas ?? (() => respostaOk(pacoteDeCampanhas([campanha()]))));
  sobreporHandlersDeAnuncios({ contas: deContas.handler, campanhas: deCampanhas.handler });
  return { contas: deContas, campanhas: deCampanhas };
}

function ctxDe(papel: ContextoDeConsulta["papel"] = "manager"): ContextoDeConsulta {
  return {
    orgId: ORG,
    papel,
    idioma: "pt-BR",
    fuso: "America/Sao_Paulo",
    agoraIso: AGORA,
    bancoDosModulos: criarBancoFalso({}).client,
  };
}

function executar(params: Parameters<typeof metricaAnunciosMeta.executar>[1] = { periodo: SEMANA }) {
  return metricaAnunciosMeta.executar(ctxDe(), params);
}

describe("anuncios_meta — adaptador", () => {
  beforeEach(() => {
    limparCacheDeAnuncios();
    sobreporRelogioDoCache(null);
    sobreporHandlersDeAnuncios(null);
  });
  afterEach(() => {
    limparCacheDeAnuncios();
    sobreporRelogioDoCache(null);
    sobreporHandlersDeAnuncios(null);
  });

  describe("conta", () => {
    it("usa a conta padrão e manda conta e datas certas à rota de campanhas", async () => {
      const { campanhas } = instalar({ contas: { ...CONTAS_PADRAO, conta_padrao: "act_222" } });
      const r = await executar();
      expect(dadosDe(r).conta).toEqual({ nome: "Conta B", moeda: "BRL" });
      expect(campanhas.chamadas).toHaveLength(1);
      expect(campanhas.chamadas[0]?.get("account_id")).toBe("act_222");
      expect(campanhas.chamadas[0]?.get("from")).toBe("2026-10-07");
      expect(campanhas.chamadas[0]?.get("to")).toBe("2026-10-13");
    });

    it("sem padrão e com uma única conta, usa essa", async () => {
      instalar({ contas: { contas: [conta("act_9", "Única")], conta_padrao: null } });
      expect(dadosDe(await executar()).conta.nome).toBe("Única");
    });

    it.each([
      ["duas contas e nenhuma padrão", { contas: [conta("a", "A"), conta("b", "B")], conta_padrao: null }],
      ["nenhuma conta", { contas: [], conta_padrao: null }],
      ["padrão que não está na lista", { contas: [conta("a", "A")], conta_padrao: "outra" }],
    ])("%s → indisponivel pedindo a conta padrão, sem chamar campanhas", async (_nome, contas) => {
      const { campanhas } = instalar({ contas });
      const r = await executar();
      expect(r).toMatchObject({
        ok: false,
        motivo: "indisponivel",
        detalhe: "defina a conta padrão em Configurações › Meta Ads",
      });
      expect(campanhas.handler).not.toHaveBeenCalled();
    });

    it("a moeda da conta aparece no aviso", async () => {
      instalar({ contas: { contas: [conta("act_111", "Conta USD", "USD")], conta_padrao: "act_111" } });
      expect(avisosDe(await executar())[0]).toContain("(USD)");
    });
  });

  describe("erros da plataforma", () => {
    it.each([
      ["ads_sem_conexao", "o Meta Ads não está conectado; conecte em Configurações › Meta Ads"],
      ["ads_token_invalido", "o token do Meta Ads foi recusado; gere um novo em Configurações › Meta Ads"],
      ["ads_permissao_insuficiente", "o token do Meta Ads não tem permissão de leitura (ads_read) para esta conta"],
      ["ads_limite_de_chamadas", "a plataforma limitou as chamadas; tente em alguns minutos"],
      ["ads_cifra_indisponivel", "a chave de criptografia da instalação não está disponível (configuração do servidor)"],
      ["codigo_que_ninguem_conhece", "não consegui ler o Meta Ads agora"],
    ])("campanhas: %s → indisponivel com a frase própria e sem eco da rota", async (codigo, frase) => {
      instalar({ campanhas: () => respostaDeErro(422, codigo) });
      const r = await executar();
      expect(r).toMatchObject({ ok: false, motivo: "indisponivel", detalhe: frase });
      expect(JSON.stringify(r)).not.toContain("MENSAGEM-CRUA-DA-ROTA");
    });

    it("contas: ads_sem_conexao → indisponivel, sem chamar campanhas", async () => {
      const { campanhas } = instalar({ respostaDeContas: respostaDeErro(422, "ads_sem_conexao") });
      const r = await executar();
      expect(r).toMatchObject({
        ok: false,
        motivo: "indisponivel",
        detalhe: "o Meta Ads não está conectado; conecte em Configurações › Meta Ads",
      });
      expect(campanhas.handler).not.toHaveBeenCalled();
    });

    it("erro 502 da plataforma → frase genérica", async () => {
      instalar({ campanhas: () => respostaDeErro(502, "upstream_unavailable") });
      expect(await executar()).toMatchObject({ ok: false, motivo: "indisponivel", detalhe: "não consegui ler o Meta Ads agora" });
    });

    it.each([401, 403])("%i em contas ou em campanhas → sem_permissao com papel manager", async (status) => {
      instalar({ respostaDeContas: respostaDeErro(status, "forbidden") });
      expect(await executar()).toMatchObject({ ok: false, motivo: "sem_permissao", papel_minimo: "manager" });
      instalar({ campanhas: () => respostaDeErro(status, "forbidden") });
      expect(await executar()).toMatchObject({ ok: false, motivo: "sem_permissao", papel_minimo: "manager" });
    });

    it("formato inesperado da rota → indisponivel", async () => {
      instalar({ campanhas: () => respostaOk({ campanhas: "texto" }) });
      expect(await executar()).toMatchObject({ ok: false, motivo: "indisponivel", detalhe: "a rota respondeu num formato inesperado" });
    });

    it("a rota que quebra (lança) → indisponivel genérico", async () => {
      instalar({
        campanhas: () => {
          throw new Error("quebrou por dentro");
        },
      });
      const r = await executar();
      expect(r).toMatchObject({ ok: false, motivo: "indisponivel" });
      expect(JSON.stringify(r)).not.toContain("quebrou por dentro");
    });
  });

  describe("permissão e parâmetros (por consultarMetrica)", () => {
    it("agent é recusado sem chamar nenhuma rota", async () => {
      const { contas, campanhas } = instalar({});
      const r = await consultarMetrica(ctxDe("agent"), "anuncios_meta", {});
      expect(r).toMatchObject({ ok: false, motivo: "sem_permissao", papel_minimo: "manager" });
      expect(contas.handler).not.toHaveBeenCalled();
      expect(campanhas.handler).not.toHaveBeenCalled();
    });

    it.each([
      ["401 dias", { periodo: { tipo: "ultimos_dias", dias: 401 } }],
      ["comparar_com_anterior que não é booleano", { comparar_com_anterior: "sim" }],
      ["chave desconhecida", { foo: 1 }],
    ])("parâmetro inválido (%s) → parametro_invalido, sem chamar rota", async (_nome, params) => {
      const { contas } = instalar({});
      const r = await consultarMetrica(ctxDe(), "anuncios_meta", params);
      expect(r).toMatchObject({ ok: false, motivo: "parametro_invalido" });
      expect(contas.handler).not.toHaveBeenCalled();
    });

    it("90 dias passa; 91 dias é recusado antes de chamar a rota de campanhas", async () => {
      const { campanhas } = instalar({});
      const noventa = await executar({ periodo: { tipo: "intervalo", de: "2026-07-16", ate: "2026-10-13" } });
      expect(noventa.ok).toBe(true);
      expect(campanhas.handler).toHaveBeenCalledTimes(1);
      campanhas.handler.mockClear();
      const noventaEUm = await executar({ periodo: { tipo: "intervalo", de: "2026-07-15", ate: "2026-10-13" } });
      expect(noventaEUm).toMatchObject({
        ok: false,
        motivo: "parametro_invalido",
        detalhe: "o período de anúncios vai até 90 dias",
      });
      expect(campanhas.handler).not.toHaveBeenCalled();
    });
  });

  describe("cache", () => {
    it("a segunda pergunta igual não chama as rotas e avisa que veio do cache", async () => {
      const { contas, campanhas } = instalar({});
      const primeira = await executar();
      expect(avisosDe(primeira).some((a) => a.startsWith("Resposta guardada"))).toBe(false);
      const segunda = await executar();
      expect(contas.handler).toHaveBeenCalledTimes(1);
      expect(campanhas.handler).toHaveBeenCalledTimes(1);
      expect(avisosDe(segunda)).toContain(
        "Resposta guardada: lida há menos de 1 min; perguntas repetidas não gastam cota da plataforma.",
      );
    });

    it("período diferente chama de novo as campanhas (mas não as contas)", async () => {
      const { contas, campanhas } = instalar({});
      await executar({ periodo: SEMANA });
      await executar({ periodo: { tipo: "intervalo", de: "2026-10-01", ate: "2026-10-07" } });
      expect(campanhas.handler).toHaveBeenCalledTimes(2);
      expect(contas.handler).toHaveBeenCalledTimes(1);
    });

    it("falha não é guardada: erro e depois sucesso chama a rota de novo", async () => {
      let falhar = true;
      const { campanhas } = instalar({
        campanhas: () => (falhar ? respostaDeErro(429, "ads_limite_de_chamadas") : respostaOk(pacoteDeCampanhas([campanha()]))),
      });
      expect((await executar()).ok).toBe(false);
      falhar = false;
      expect((await executar()).ok).toBe(true);
      expect(campanhas.handler).toHaveBeenCalledTimes(2);
    });

    it("expira depois de 5 minutos e conta a idade enquanto vale", async () => {
      let agoraMs = 1_000_000;
      sobreporRelogioDoCache(() => agoraMs);
      const { campanhas } = instalar({});
      await executar();
      agoraMs += 4 * 60 * 1000;
      const dentro = await executar();
      expect(campanhas.handler).toHaveBeenCalledTimes(1);
      expect(avisosDe(dentro).some((a) => a.includes("lida há 4 min"))).toBe(true);
      agoraMs += 2 * 60 * 1000;
      await executar();
      expect(campanhas.handler).toHaveBeenCalledTimes(2);
    });

    it("organizações diferentes não dividem o cache", async () => {
      const { campanhas } = instalar({});
      await executar();
      await metricaAnunciosMeta.executar({ ...ctxDe(), orgId: "22222222-3333-4444-8555-666666666666" }, { periodo: SEMANA });
      expect(campanhas.handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("comparação com o período anterior", () => {
    it("pedida: faz exatamente 1 chamada extra, com o período anterior de mesma duração", async () => {
      const { campanhas } = instalar({
        campanhas: (p) =>
          respostaOk(pacoteDeCampanhas([campanha({ nome: p.get("from") === "2026-09-30" ? "Anterior" : "Atual" })])),
      });
      const r = await executar({ periodo: SEMANA, comparar_com_anterior: true });
      expect(campanhas.handler).toHaveBeenCalledTimes(2);
      expect(campanhas.chamadas[1]?.get("from")).toBe("2026-09-30");
      expect(campanhas.chamadas[1]?.get("to")).toBe("2026-10-06");
      const dados = dadosDe(r);
      expect(dados.comparacao?.periodo).toEqual({ de: "2026-09-30", ate: "2026-10-06" });
      expect(dados.comparacao?.campanhas[0]?.nome).toBe("Anterior");
      expect(dados.campanhas[0]?.nome).toBe("Atual");
    });

    it("não pedida (ou false): 1 chamada só e comparacao null", async () => {
      const { campanhas } = instalar({});
      expect(dadosDe(await executar({ periodo: SEMANA, comparar_com_anterior: false })).comparacao).toBeNull();
      expect(dadosDe(await executar({ periodo: SEMANA })).comparacao).toBeNull();
      expect(campanhas.handler).toHaveBeenCalledTimes(1);
    });

    it("falha no período anterior: comparacao null, aviso, e a falha não fica guardada", async () => {
      let anteriorFalha = true;
      const { campanhas } = instalar({
        campanhas: (p) =>
          p.get("from") === "2026-09-30" && anteriorFalha
            ? respostaDeErro(502, "upstream_unavailable")
            : respostaOk(pacoteDeCampanhas([campanha()])),
      });
      const primeira = await executar({ periodo: SEMANA, comparar_com_anterior: true });
      expect(dadosDe(primeira).comparacao).toBeNull();
      expect(avisosDe(primeira)).toContain("Não consegui ler o período anterior; a comparação ficou de fora.");
      anteriorFalha = false;
      const segunda = await executar({ periodo: SEMANA, comparar_com_anterior: true });
      expect(dadosDe(segunda).comparacao?.periodo).toEqual({ de: "2026-09-30", ate: "2026-10-06" });
      expect(campanhas.chamadas.filter((p) => p.get("from") === "2026-09-30")).toHaveLength(2);
    });
  });

  describe("campanhas na saída", () => {
    it("custo_por_venda só existe quando o resultado é Compras; o tipo e o rótulo acompanham", async () => {
      instalar({
        campanhas: () =>
          respostaOk(
            pacoteDeCampanhas([
              campanha({ nome: "Vendas", gasto: 400, resultado: { valor: 8, custoPorResultado: 50, indicador: COMPRAS } }),
              campanha({ nome: "Conversas", gasto: 300, resultado: { valor: 30, custoPorResultado: 10, indicador: CONVERSAS } }),
              campanha({ nome: "Cadastros", gasto: 200, resultado: { valor: 20, custoPorResultado: 5, indicador: CADASTROS } }),
              campanha({ nome: "Outra", gasto: 100, resultado: { valor: 2, custoPorResultado: 9, indicador: "actions:link_click" } }),
              campanha({ nome: "Sem indicador", gasto: 50, resultado: { valor: null, custoPorResultado: null, indicador: null } }),
            ]),
          ),
      });
      const { campanhas } = dadosDe(await executar());
      expect(campanhas.map((c) => [c.nome, c.tipo_de_resultado, c.custo_por_resultado, c.custo_por_venda])).toEqual([
        ["Vendas", "compras", 50, 50],
        ["Conversas", "conversas", 10, null],
        ["Cadastros", "cadastros", 5, null],
        ["Outra", "outro", 9, null],
        ["Sem indicador", "sem_indicador", null, null],
      ]);
      expect(campanhas[0]?.rotulo_do_resultado).toBe(rotuloDoIndicador(COMPRAS));
      expect(campanhas[0]?.rotulo_do_resultado).not.toBeNull();
      expect(campanhas[4]?.rotulo_do_resultado).toBeNull();
    });

    it("campo que a plataforma não mediu continua null (nunca vira 0), inclusive nos totais", async () => {
      instalar({
        campanhas: () =>
          respostaOk(
            pacoteDeCampanhas([
              campanha({
                resultado: { valor: null, custoPorResultado: null, indicador: null },
                gasto: null,
                impressoes: null,
                alcance: null,
                cpm: null,
                ctr: null,
                cpc: null,
                frequencia: null,
              }),
            ]),
          ),
      });
      const dados = dadosDe(await executar());
      expect(dados.campanhas[0]).toMatchObject({
        resultados: null,
        custo_por_resultado: null,
        custo_por_venda: null,
        gasto: null,
        impressoes: null,
        alcance: null,
        cpm: null,
        ctr: null,
        cpc: null,
        frequencia: null,
      });
      expect(dados.totais).toEqual({ gasto: null, impressoes: null });
    });

    it("totais somam só o que existe e nunca somam o alcance; gasto zero medido é 0, não null", async () => {
      instalar({
        campanhas: () =>
          respostaOk(
            pacoteDeCampanhas([
              campanha({ nome: "A", gasto: 100, impressoes: 1000, alcance: 800 }),
              campanha({ nome: "B", gasto: null, impressoes: 500, alcance: 700 }),
              campanha({ nome: "C", gasto: 50.5, impressoes: null, alcance: 600 }),
            ]),
          ),
      });
      const dados = dadosDe(await executar());
      expect(dados.totais).toEqual({ gasto: 150.5, impressoes: 1500 });
      expect(Object.keys(dados.totais)).toEqual(["gasto", "impressoes"]);

      limparCacheDeAnuncios();
      instalar({ campanhas: () => respostaOk(pacoteDeCampanhas([campanha({ gasto: 0, impressoes: 0 })])) });
      expect(dadosDe(await executar()).totais).toEqual({ gasto: 0, impressoes: 0 });
    });

    it("31 campanhas: 30 por gasto decrescente, 1 omitida, aviso exato, e os totais somam as 31", async () => {
      const muitas = Array.from({ length: 31 }, (_, i) => campanha({ nome: `Campanha ${i + 1}`, gasto: i + 1, impressoes: 10 }));
      instalar({ campanhas: () => respostaOk(pacoteDeCampanhas(muitas)) });
      const r = await executar();
      const dados = dadosDe(r);
      expect(dados.campanhas).toHaveLength(30);
      expect(dados.campanhas_omitidas).toBe(1);
      expect(dados.campanhas[0]?.nome).toBe("Campanha 31");
      expect(dados.campanhas[29]?.nome).toBe("Campanha 2");
      expect(dados.campanhas.some((c) => c.nome === "Campanha 1")).toBe(false);
      expect(dados.totais).toEqual({ gasto: 496, impressoes: 310 });
      expect(avisosDe(r)).toContain("Só as 30 campanhas de maior gasto foram incluídas.");
    });

    it("exatamente 30 campanhas: nenhuma omitida e sem o aviso de corte", async () => {
      const trinta = Array.from({ length: 30 }, (_, i) => campanha({ nome: `C${i}`, gasto: i }));
      instalar({ campanhas: () => respostaOk(pacoteDeCampanhas(trinta)) });
      const r = await executar();
      expect(dadosDe(r).campanhas_omitidas).toBe(0);
      expect(avisosDe(r)).not.toContain("Só as 30 campanhas de maior gasto foram incluídas.");
    });

    it("campanhaId, connectRate, hookRate, thruPlays e chaves proibidas nunca saem", async () => {
      instalar({});
      const r = await executar();
      const texto = JSON.stringify(r);
      for (const proibido of ["ID-INTERNO-DA-CAMPANHA", "campanhaId", "connectRate", "hookRate", "thruPlays", '"name"']) {
        expect(texto).not.toContain(proibido);
      }
      expect(chavesProibidasEm(r.ok ? r.dados : null)).toEqual([]);
    });

    it("nome de campanha com 200 letras é cortado em 120 e não derruba a resposta", async () => {
      instalar({ campanhas: () => respostaOk(pacoteDeCampanhas([campanha({ nome: "x".repeat(200) })])) });
      const dados = dadosDe(await executar());
      expect(dados.campanhas[0]?.nome).toBe("x".repeat(120));
    });

    it("sem campanhas: dados null, a moeda e o aviso exato", async () => {
      instalar({ campanhas: () => respostaOk(pacoteDeCampanhas([])) });
      const r = await executar();
      expect(r).toMatchObject({ ok: true, dados: null });
      expect(avisosDe(r)).toEqual(["Valores na moeda da conta (BRL).", "Sem campanhas no período."]);
    });
  });

  describe("avisos", () => {
    it("o primeiro aviso é sempre o da moeda e da divergência com o CRM", async () => {
      instalar({});
      expect(avisosDe(await executar())[0]).toBe(
        "Valores na moeda da conta (BRL). Dados da plataforma de anúncios; podem divergir do faturamento do CRM.",
      );
    });

    it("avisos da rota entram no máximo 2, cortados em 200 caracteres", async () => {
      instalar({
        campanhas: () => respostaOk(pacoteDeCampanhas([campanha()], ["a".repeat(300), "segundo", "terceiro"])),
      });
      const avisos = avisosDe(await executar());
      expect(avisos).toContain("a".repeat(200));
      expect(avisos).toContain("segundo");
      expect(avisos).not.toContain("terceiro");
    });

    it("período que inclui hoje avisa que o último dia está em andamento", async () => {
      instalar({});
      const parcial = await executar({ periodo: { tipo: "semana_atual" } });
      expect(avisosDe(parcial)).toContain("O período inclui o dia de hoje, que ainda está em andamento.");
      const fechado = await executar({ periodo: SEMANA });
      expect(avisosDe(fechado)).not.toContain("O período inclui o dia de hoje, que ainda está em andamento.");
    });
  });
});
