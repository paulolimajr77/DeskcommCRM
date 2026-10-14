/**
 * Métrica `atividades` — "o que aconteceu na operação"
 * (GET /api/v1/reports/activities).
 *
 * ROTA: piso `viewer`. Confirma o código (`requireRole("viewer")`). A RLS faz o
 * agente ver só as próprias; viewer/manager/admin veem a org.
 * PERÍODO: a rota NÃO aceita `from`/`to` — ela pega `days` (1–90, default 7) e
 * `tz`, e monta a janela [agora − days, agora) INTERNAMENTE
 * (`janelaDoPeriodo` em `lib/reports/atividades.ts`). É "últimos N dias até
 * AGORA", portanto sempre parcial. O modelo passa `dias`; `tz` vem do fuso da
 * organização. NÃO devolvemos `periodo` resolvido — a janela que a rota mede
 * não bate com semana/mês fechados; em `dados.janela` fica explícito.
 *
 * O QUE ENTRA / NUNCA SAI: a rota devolve `atores` (cada um com `userId`,
 * `agentId`, `nome`) e `atividades` (cada uma com `contatoNome`,
 * `negocioTitulo`, `motivo`, `contatoId`). Ambas carregam identificação de
 * pessoa e texto livre — NÃO passam do esquema. Sobram `total`, `resumo`
 * (contagens por origem), `tipos` (rótulos de atividade, sem PII), `dias`
 * (dia/contagem), `vocabulario` (palavras do nicho) e `truncado`.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { chamarRotaPorDentro, traduzirResposta } from "../chamar-rota";
import { chavesProibidasEm, projetar } from "../projecao";
import type { DefinicaoDeMetrica, ResultadoDeMetrica } from "../tipos";

const ID = "atividades";
const parametros = z.strictObject({ dias: z.number().int().min(1).max(90).optional() });
export type Parametros = z.infer<typeof parametros>;

const resumo = z.object({ pessoas: z.number().int().min(0), agentes: z.number().int().min(0), automatico: z.number().int().min(0) });
const linhaTipo = z.object({ type: z.string(), rotulo: z.string(), quantidade: z.number().int().min(0), fatia: z.number().int().min(0) });
const linhaDia = z.object({ data: z.string(), rotulo: z.string(), quantidade: z.number().int().min(0) });

const esquema = z.object({
  total: z.number().int().min(0),
  resumo,
  tipos: z.array(linhaTipo),
  dias: z.array(linhaDia),
  // `atores` e `atividades` NÃO entram: a lista positiva os exclui.
  truncado: z.boolean().optional(),
  vocabulario: z.record(z.string(), z.string()),
});

const REGUA =
  "Últimos N dias até AGORA (sempre parcial — o dia de hoje está incompleto), no " +
  "fuso da organização. 'o que aconteceu' por origem da ação (pessoas × máquinas), " +
  "tipo de atividade (rótulo do negócio, sem texto de contato) e dia — e o total. " +
  "Não é semana fechada. Quem é atendente vê só as próprias (RLS). Detalhe por " +
  "pessoa ou negócio não sai aqui: é para a tela de CRM.";

type Handler = (req: NextRequest) => Promise<Response>;
let sobreposicao: Handler | null = null;
export function sobreporHandlerDeAtividades(handler: Handler | null): void {
  sobreposicao = handler;
}
async function handlerAtual(): Promise<Handler> {
  if (sobreposicao) return sobreposicao;
  const m = await import("@/app/api/v1/reports/activities/route");
  return m.GET;
}

export const metricaAtividades: DefinicaoDeMetrica<Parametros> = {
  id: ID,
  descricao: "O que a equipe e a automação fizeram: volume por origem da ação, tipo de atividade e por dia.",
  papelMinimo: "viewer",
  modulo: null,
  parametros,
  dimensoes: ["origem", "tipo_de_atividade", "dia"],
  regua: REGUA,
  executar: async (ctx, params) => {
    const dias = params.dias ?? 7;

    const resposta = await chamarRotaPorDentro(await handlerAtual(), "/api/v1/reports/activities", {
      days: String(dias),
      tz: ctx.fuso,
    });
    const veredito = traduzirResposta(resposta, "viewer");
    if (!veredito.ok) return { metrica: ID, ...veredito };

    const projetado = projetar(esquema, veredito.dados);
    if (!projetado.ok) {
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a rota respondeu num formato inesperado" };
    }
    const proibidas = chavesProibidasEm(projetado.dados);
    if (proibidas.length > 0) {
      logger.warn("assistente.metricas.chave_proibida_no_resultado", { metrica: ID, chaves: proibidas });
      return { ok: false, metrica: ID, motivo: "indisponivel", detalhe: "a resposta trouxe campos que não podem sair" };
    }

    const avisos: string[] = [];
    const total = projetado.dados.total;
    avisos.push(`Janela dos últimos ${dias} dias terminando agora (dia de hoje incompleto); não é semana fechada.`);
    let dados: unknown = {
      ...projetado.dados,
      janela: { dias, ate: "agora", fuso: ctx.fuso },
    };
    if (projetado.dados.truncado) avisos.push("A lista de atividades foi paginada e pode estar incompleta.");
    if (total === 0) {
      dados = null;
      avisos.push("Sem atividades no período.");
    }

    return { ok: true, metrica: ID, periodo: null, regua: REGUA, dados, avisos };
  },
};
