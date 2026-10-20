/**
 * Métrica `anuncios_meta` — gasto e resultado por campanha do Meta Ads.
 * Papel mínimo `manager`. Parâmetros: `periodo?` (padrão `semana_passada`, até 90
 * dias) e `comparar_com_anterior?` (padrão false: cada consulta gasta COTA da
 * plataforma, então só se compara quando a pessoa pedir).
 *
 * Fontes (rotas chamadas "por dentro", ambas `manager`):
 *   1. GET /api/v1/ads/meta/accounts   → { contas, conta_padrao }
 *   2. GET /api/v1/ads/meta/campaigns  → { campanhas[], periodo, account_id, lido_em, avisos }
 *
 * Cache (`../anuncios/cache-ttl.ts`): contas 30 min, campanhas 5 min por
 * (organização, conta, de, ate). É POR INSTÂNCIA do servidor, não compartilhado.
 * Só resposta boa é guardada — falha e comparação que não veio nunca entram.
 *
 * Saída por lista positiva: no máximo 30 campanhas (maior gasto primeiro). Os
 * totais somam TODAS as campanhas lidas (inclusive as omitidas da lista) e só
 * dos valores que existem; alcance nunca é somado. `custo_por_venda` só existe
 * quando o resultado da campanha é Compras. Nada vira zero: `null` é "sem medição".
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { limparIndicador, rotuloDoIndicador } from "@/lib/plataformas-de-anuncio/meta/tabela-de-campanhas";

import { cacheDeCampanhas, cacheDeContas, relogioDoCache } from "../anuncios/cache-ttl";
import { chamarRotaPorDentro, traduzirResposta, type RespostaDaRota } from "../chamar-rota";
import { diasInclusive, PeriodoSolicitado, resolverPeriodo, somarDias } from "../periodo";
import { chavesProibidasEm, projetar } from "../projecao";
import type { DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";
import { textoAte } from "./saneamento";

const ID = "anuncios_meta";
const LIMITE_DE_CAMPANHAS = 30;
const MAXIMO_DE_DIAS = 90;

const parametros = z.strictObject({
  periodo: PeriodoSolicitado.optional(),
  comparar_com_anterior: z.boolean().optional(),
});
export type ParametrosDeAnunciosMeta = z.infer<typeof parametros>;

/** O que a rota de contas devolve (só o que usamos; o resto é descartado). */
const schemaContas = z.object({
  contas: z.array(z.object({ id: z.string(), nome: z.string(), moeda: z.string() })),
  conta_padrao: z.string().nullable(),
});
type Contas = z.infer<typeof schemaContas>;

const numeroOuNulo = z.number().nullable();

/** O que a rota de campanhas devolve (sem `campanhaId`, `connectRate`, `hookRate`, `thruPlays`). */
const schemaCampanhas = z.object({
  campanhas: z.array(
    z.object({
      nome: z.string(),
      status: z.string().nullable(),
      veiculacao: z.string().nullable(),
      objetivo: z.string().nullable(),
      resultado: z.object({
        valor: numeroOuNulo,
        custoPorResultado: numeroOuNulo,
        indicador: z.string().nullable(),
      }),
      gasto: numeroOuNulo,
      impressoes: numeroOuNulo,
      alcance: numeroOuNulo,
      cpm: numeroOuNulo,
      ctr: numeroOuNulo,
      frequencia: numeroOuNulo,
      cpc: numeroOuNulo,
    }),
  ),
  lido_em: z.string(),
  avisos: z.array(z.string()),
});
type Campanhas = z.infer<typeof schemaCampanhas>;
type CampanhaLida = Campanhas["campanhas"][number];

const naoNegativoOuNulo = z.number().min(0).nullable();

const schemaCampanhaDeSaida = z.object({
  nome: textoAte(120),
  status: textoAte(40).nullable(),
  veiculacao: textoAte(40).nullable(),
  objetivo: textoAte(40).nullable(),
  tipo_de_resultado: z.enum(["compras", "conversas", "cadastros", "outro", "sem_indicador"]),
  rotulo_do_resultado: textoAte(60).nullable(),
  resultados: naoNegativoOuNulo,
  custo_por_resultado: naoNegativoOuNulo,
  custo_por_venda: naoNegativoOuNulo,
  gasto: naoNegativoOuNulo,
  impressoes: naoNegativoOuNulo,
  alcance: naoNegativoOuNulo,
  cpm: naoNegativoOuNulo,
  ctr: naoNegativoOuNulo,
  cpc: naoNegativoOuNulo,
  frequencia: naoNegativoOuNulo,
});

const schemaDePeriodo = z.object({ de: z.string(), ate: z.string() });
const schemaDeTotais = z.object({ gasto: naoNegativoOuNulo, impressoes: naoNegativoOuNulo });

const esquemaDeSaida = z.object({
  conta: z.object({ nome: textoAte(80), moeda: textoAte(8) }),
  periodo: schemaDePeriodo,
  lido_em: textoAte(50),
  campanhas: z.array(schemaCampanhaDeSaida).max(LIMITE_DE_CAMPANHAS),
  campanhas_omitidas: z.number().int().min(0),
  totais: schemaDeTotais,
  comparacao: z
    .object({
      periodo: schemaDePeriodo,
      totais: schemaDeTotais,
      campanhas: z.array(schemaCampanhaDeSaida).max(LIMITE_DE_CAMPANHAS),
      campanhas_omitidas: z.number().int().min(0),
    })
    .nullable(),
});

const REGUA =
  "Números da plataforma de anúncios, na moeda da conta, por campanha, de dias fechados; se o período pedido " +
  "inclui hoje (semana atual, mês atual), o último dia está incompleto. Podem divergir do faturamento do CRM. " +
  "O resultado depende do objetivo da campanha (compras, conversas, cadastros): só chame de custo por venda " +
  "quando o resultado é Compras; senão diga custo por conversa ou por cadastro. Só as 30 campanhas de maior " +
  "gasto aparecem, mas os totais somam todas; alcance não é somado. Não há referência de mercado: qualquer " +
  "avaliação é hipótese sobre estes números.";

const FRASES_DE_ERRO: Record<string, string> = {
  ads_sem_conexao: "o Meta Ads não está conectado; conecte em Configurações › Meta Ads",
  ads_token_invalido: "o token do Meta Ads foi recusado; gere um novo em Configurações › Meta Ads",
  ads_permissao_insuficiente: "o token do Meta Ads não tem permissão de leitura (ads_read) para esta conta",
  ads_limite_de_chamadas: "a plataforma limitou as chamadas; tente em alguns minutos",
  ads_cifra_indisponivel: "a chave de criptografia da instalação não está disponível (configuração do servidor)",
};
const FRASE_GENERICA = "não consegui ler o Meta Ads agora";
const FRASE_SEM_CONTA = "defina a conta padrão em Configurações › Meta Ads";

type Handler = (req: NextRequest) => Promise<Response>;
interface Sobreposicao {
  contas: Handler | null;
  campanhas: Handler | null;
}

let sobrep: Sobreposicao | null = null;
/** Só para teste: troca os handlers das duas rotas. `null` volta às rotas reais. */
export function sobreporHandlersDeAnuncios(sobreposicao: Sobreposicao | null): void {
  sobrep = sobreposicao;
}

async function handlerContas(): Promise<Handler> {
  if (sobrep?.contas) return sobrep.contas;
  const modulo = await import("@/app/api/v1/ads/meta/accounts/route");
  return modulo.GET;
}

async function handlerCampanhas(): Promise<Handler> {
  if (sobrep?.campanhas) return sobrep.campanhas;
  const modulo = await import("@/app/api/v1/ads/meta/campaigns/route");
  return modulo.GET;
}

const COMPRAS = new Set(["offsite_conversion.fb_pixel_purchase", "purchase"]);
const CONVERSAS = new Set([
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
]);
const CADASTROS = new Set([
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion_lead_grouped",
  "lead",
  "leadgen_grouped",
  "offsite_conversion.fb_pixel_complete_registration",
]);

type TipoDeResultado = "compras" | "conversas" | "cadastros" | "outro" | "sem_indicador";

function tipoDeResultado(indicador: string | null): TipoDeResultado {
  const limpo = limparIndicador(indicador);
  if (!limpo) return "sem_indicador";
  if (COMPRAS.has(limpo)) return "compras";
  if (CONVERSAS.has(limpo)) return "conversas";
  if (CADASTROS.has(limpo)) return "cadastros";
  return "outro";
}

function formatarCampanha(c: CampanhaLida) {
  const tipo = tipoDeResultado(c.resultado.indicador);
  return {
    nome: c.nome,
    status: c.status,
    veiculacao: c.veiculacao,
    objetivo: c.objetivo,
    tipo_de_resultado: tipo,
    rotulo_do_resultado: rotuloDoIndicador(c.resultado.indicador),
    resultados: c.resultado.valor,
    custo_por_resultado: c.resultado.custoPorResultado,
    // Só é "custo por venda" quando o resultado da campanha É compra.
    custo_por_venda: tipo === "compras" ? c.resultado.custoPorResultado : null,
    gasto: c.gasto,
    impressoes: c.impressoes,
    alcance: c.alcance,
    cpm: c.cpm,
    ctr: c.ctr,
    cpc: c.cpc,
    frequencia: c.frequencia,
  };
}

/** Soma só o que existe; sem nenhum valor medido o total é `null`, nunca 0. */
function somaOuNulo(valores: (number | null)[]): number | null {
  let soma = 0;
  let algum = false;
  for (const v of valores) {
    if (v === null) continue;
    soma += v;
    algum = true;
  }
  return algum ? Math.round(soma * 100) / 100 : null;
}

function resumir(lidas: CampanhaLida[]) {
  const porGasto = [...lidas].sort((a, b) => (b.gasto ?? -1) - (a.gasto ?? -1));
  return {
    campanhas: porGasto.slice(0, LIMITE_DE_CAMPANHAS).map(formatarCampanha),
    campanhas_omitidas: Math.max(0, porGasto.length - LIMITE_DE_CAMPANHAS),
    totais: {
      gasto: somaOuNulo(lidas.map((c) => c.gasto)),
      impressoes: somaOuNulo(lidas.map((c) => c.impressoes)),
    },
  };
}

function codigoDoErro(resposta: RespostaDaRota): string | undefined {
  if ("falhou" in resposta) return undefined;
  const corpo = resposta.corpo;
  if (corpo === null || typeof corpo !== "object" || !("error" in corpo)) return undefined;
  const erro = (corpo as { error?: unknown }).error;
  if (erro === null || typeof erro !== "object" || !("code" in erro)) return undefined;
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === "string" ? codigo : undefined;
}

function frasePara(codigo: string | undefined): string {
  return codigo !== undefined && Object.prototype.hasOwnProperty.call(FRASES_DE_ERRO, codigo)
    ? (FRASES_DE_ERRO[codigo] ?? FRASE_GENERICA)
    : FRASE_GENERICA;
}

type Leitura<T> = { ok: true; dados: T } | { ok: false; falha: ResultadoDeMetrica };

/** Lê uma rota de anúncios. Frases próprias nos erros: a mensagem da rota nunca é ecoada. */
function lerResposta<T>(resposta: RespostaDaRota, esquema: z.ZodType<T>): Leitura<T> {
  const veredito = traduzirResposta(resposta, "manager");
  if (veredito.ok) {
    const projetado = projetar(esquema, veredito.dados);
    return projetado.ok
      ? { ok: true, dados: projetado.dados }
      : {
          ok: false,
          falha: { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a rota respondeu num formato inesperado" },
        };
  }
  if (veredito.motivo === "sem_permissao") {
    return { ok: false, falha: { ok: false, metrica: ID, motivo: "sem_permissao", papel_minimo: veredito.papel_minimo } };
  }
  return {
    ok: false,
    falha: { ok: false, metrica: ID, motivo: "indisponivel", detalhe: frasePara(codigoDoErro(resposta)) },
  };
}

async function lerContas(orgId: string): Promise<Leitura<Contas>> {
  const chave = `${orgId}|contas`;
  const guardado = cacheDeContas.pegar(chave);
  const reaproveitado = guardado ? projetar(schemaContas, guardado.valor) : null;
  if (reaproveitado?.ok) return { ok: true, dados: reaproveitado.dados };

  const handler = await handlerContas();
  const resposta = await chamarRotaPorDentro(handler, "/api/v1/ads/meta/accounts", {});
  const lido = lerResposta(resposta, schemaContas);
  if (lido.ok) cacheDeContas.guardar(chave, lido.dados);
  return lido;
}

interface CampanhasLidas {
  dados: Campanhas;
  /** Quanto tempo a resposta ficou guardada; `null` quando acabou de vir da plataforma. */
  idadeMs: number | null;
}

async function lerCampanhas(
  orgId: string,
  contaId: string,
  de: string,
  ate: string,
): Promise<Leitura<CampanhasLidas>> {
  const chave = `${orgId}|${contaId}|${de}|${ate}`;
  const guardado = cacheDeCampanhas.pegar(chave);
  const reaproveitado = guardado ? projetar(schemaCampanhas, guardado.valor) : null;
  if (guardado && reaproveitado?.ok) {
    return { ok: true, dados: { dados: reaproveitado.dados, idadeMs: relogioDoCache() - guardado.gravadoEmMs } };
  }

  const handler = await handlerCampanhas();
  const resposta = await chamarRotaPorDentro(handler, "/api/v1/ads/meta/campaigns", {
    account_id: contaId,
    from: de,
    to: ate,
  });
  const lido = lerResposta(resposta, schemaCampanhas);
  if (!lido.ok) return lido;
  cacheDeCampanhas.guardar(chave, lido.dados);
  return { ok: true, dados: { dados: lido.dados, idadeMs: null } };
}

function escolherConta(contas: Contas): Contas["contas"][number] | null {
  if (contas.conta_padrao) return contas.contas.find((c) => c.id === contas.conta_padrao) ?? null;
  return contas.contas.length === 1 ? (contas.contas[0] ?? null) : null;
}

function avisoDeCache(idadeMs: number): string {
  const minutos = Math.floor(idadeMs / 60000);
  const quando = minutos < 1 ? "menos de 1 min" : `${minutos} min`;
  return `Resposta guardada: lida há ${quando}; perguntas repetidas não gastam cota da plataforma.`;
}

export const metricaAnunciosMeta: DefinicaoDeMetrica<ParametrosDeAnunciosMeta> = {
  id: ID,
  descricao: "Gasto e resultado por campanha do Meta Ads (até 30 campanhas), com comparação opcional.",
  papelMinimo: "manager",
  modulo: null,
  parametros,
  dimensoes: ["periodo", "campanha", "resultado"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const solicitado = params.periodo ?? { tipo: "semana_passada" as const };
    const periodo = resolverPeriodo(solicitado, ctx.agoraIso, ctx.fuso, ctx.idioma);
    const dias = diasInclusive(periodo.de, periodo.ateInclusivo);
    if (dias > MAXIMO_DE_DIAS) {
      return { ok: false, metrica: ID, motivo: "parametro_invalido", detalhe: "o período de anúncios vai até 90 dias" };
    }

    const contasLidas = await lerContas(ctx.orgId);
    if (!contasLidas.ok) return contasLidas.falha;
    const conta = escolherConta(contasLidas.dados);
    if (!conta) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: FRASE_SEM_CONTA };
    }

    const lidas = await lerCampanhas(ctx.orgId, conta.id, periodo.de, periodo.ateInclusivo);
    if (!lidas.ok) return lidas.falha;
    const campanhas = lidas.dados.dados;
    const moeda = conta.moeda.slice(0, 8);

    if (campanhas.campanhas.length === 0) {
      return {
        ok: true,
        metrica: ID,
        periodo,
        regua: REGUA,
        dados: null,
        avisos: [`Valores na moeda da conta (${moeda}).`, "Sem campanhas no período."],
      };
    }

    const principal = resumir(campanhas.campanhas);

    // Comparação: o período anterior, de MESMA duração, imediatamente antes (datas civis).
    let comparacao: (ReturnType<typeof resumir> & { periodo: { de: string; ate: string } }) | null = null;
    let avisoDaComparacao: string | null = null;
    if (params.comparar_com_anterior) {
      const ateAnterior = somarDias(periodo.de, -1);
      const deAnterior = somarDias(periodo.de, -dias);
      const anteriores = await lerCampanhas(ctx.orgId, conta.id, deAnterior, ateAnterior);
      if (anteriores.ok) {
        comparacao = { periodo: { de: deAnterior, ate: ateAnterior }, ...resumir(anteriores.dados.dados.campanhas) };
      } else {
        avisoDaComparacao = "Não consegui ler o período anterior; a comparação ficou de fora.";
      }
    }

    const projetado = projetar(esquemaDeSaida, {
      conta: { nome: conta.nome, moeda: conta.moeda },
      periodo: { de: periodo.de, ate: periodo.ateInclusivo },
      lido_em: campanhas.lido_em,
      ...principal,
      comparacao,
    });
    if (!projetado.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a leitura veio num formato inesperado" };
    }
    const proibidas = chavesProibidasEm(projetado.dados);
    if (proibidas.length > 0) {
      logger.warn("assistente.metricas.chave_proibida_no_resultado", { metrica: ID, chaves: proibidas });
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a leitura trouxe campos que não podem sair" };
    }

    const avisos: string[] = [
      `Valores na moeda da conta (${moeda}). Dados da plataforma de anúncios; podem divergir do faturamento do CRM.`,
    ];
    if (principal.campanhas_omitidas > 0) avisos.push("Só as 30 campanhas de maior gasto foram incluídas.");
    avisos.push(...campanhas.avisos.slice(0, 2).map((aviso) => aviso.slice(0, 200)));
    if (periodo.parcial) avisos.push("O período inclui o dia de hoje, que ainda está em andamento.");
    if (lidas.dados.idadeMs !== null) avisos.push(avisoDeCache(lidas.dados.idadeMs));
    if (avisoDaComparacao) avisos.push(avisoDaComparacao);

    return { ok: true, metrica: ID, periodo, regua: REGUA, dados: projetado.dados, avisos };
  },
};
