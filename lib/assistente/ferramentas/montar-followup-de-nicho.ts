/**
 * Ferramenta `montar_followup_de_nicho` (T13) — um follow-up de nicho que NÃO
 * tem modelo pronto (imobiliária, serviços, curso, loja, advocacia), criado
 * como RASCUNHO.
 *
 * O modelo da conversa informa SÓ os toques — rótulo, texto e espera de cada
 * mensagem — e como o fluxo começa (silêncio ou etapa do funil). O GRAFO nunca
 * é escrito por ele: `montarEscada` (o mesmo montador dos quatro modelos de
 * clínica) devolve o desenho, válido por construção, e a ferramenta ainda o
 * confere com `flowGraphSchema` + `validateFlowForPublish` ANTES de gravar —
 * `draft_graph` é `jsonb` sem CHECK, e um grafo inválido entraria em silêncio.
 *
 * Passos, nesta ordem — parar no primeiro que falhar:
 *   1. toques: texto sem `{`/`}` (o modo `text` do nó não preenche marcador, e
 *      "{produto}" sairia LITERAL para o cliente); do segundo toque em diante a
 *      espera é obrigatória (senão são duas mensagens coladas);
 *   2. gatilho: `silencio_horas` OU `etapa_id` (nunca os dois; nenhum = manual).
 *      A etapa é conferida na organização da sessão, como a rota `from-model`;
 *   3. montar e validar o grafo;
 *   4. `POST ai/followup-flows` (cria o ponteiro, nasce `draft`) e
 *      `PATCH ai/followup-flows/[id]` (grafo, gatilho, política de handoff).
 *
 * NUNCA publica, nunca liga o fluxo a um agente, nunca apaga. Se o PATCH falha
 * depois do POST, o rascunho vazio fica — a resposta diz o nome para a pessoa
 * apagar pela tela (nenhuma ferramenta do assistente apaga). Só `admin`.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import { IDS_DE_NICHO, nichoPorId, type IdDeNicho } from "@/lib/assistente/nichos";
import { triggerConfigSchema } from "@/lib/followup/api-schemas";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { montarEscada, type Toque } from "@/lib/followup/modelos/escada";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";

import { protegida } from "./protegida";
import { anotarCartaoDeArtefato, type EntradaDasFerramentas } from "./tipos";

const NICHOS = IDS_DE_NICHO as unknown as [IdDeNicho, ...IdDeNicho[]];

const HORA_MS = 3_600_000;
const DIA_MS = 86_400_000;

const esquemaDoToque = z.strictObject({
  rotulo: z.string().trim().min(1).max(60),
  texto: z.string().trim().min(1).max(1000),
  espera_horas: z.number().int().min(1).max(720).optional(),
});

const esquemaDeEntrada = z.strictObject({
  nicho: z.enum(NICHOS),
  nome: z.string().trim().min(1).max(80),
  toques: z.array(esquemaDoToque).min(1).max(4),
  silencio_horas: z.number().int().min(1).max(168).optional(),
  etapa_id: z.string().uuid().optional(),
});

interface HandlersDeFollowupDeNicho {
  criar: HandlerDeRota | null;
  atualizar: HandlerDeRota | null;
}

let sobrepostos: HandlersDeFollowupDeNicho | null = null;

/** Só para testes: troca os handlers reais (que exigiriam sessão) por dublês. */
export function sobreporHandlersDeFollowupDeNicho(handlers: HandlersDeFollowupDeNicho | null): void {
  sobrepostos = handlers;
}

async function handlerDeCriacao(): Promise<HandlerDeRota> {
  if (sobrepostos?.criar) return sobrepostos.criar;
  const modulo = await import("@/app/api/v1/ai/followup-flows/route");
  return modulo.POST;
}

/** O PATCH é dinâmico: o `id` sai do caminho da chamada interna, que a ferramenta mesma montou. */
async function handlerDeAtualizacao(): Promise<HandlerDeRota> {
  if (sobrepostos?.atualizar) return sobrepostos.atualizar;
  const modulo = await import("@/app/api/v1/ai/followup-flows/[id]/route");
  return (req) => {
    const id = new URL(req.url).pathname.split("/").pop() ?? "";
    return modulo.PATCH(req, { params: Promise.resolve({ id }) });
  };
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object";
}

export interface PedidoDeFollowupDeNicho {
  nicho: IdDeNicho;
  nome: string;
  toques: { rotulo: string; texto: string; espera_horas?: number }[];
  silencio_horas?: number;
  etapa_id?: string;
}

export type MotivoDeFalhaAoMontarFollowup =
  | "pedido_invalido"
  | "texto_com_marcador"
  | "falta_espera"
  | "gatilho_invalido"
  | "etapa_inexistente"
  | "ja_existe"
  | "grafo_nao_gravado"
  | "indisponivel";

export type ResultadoDeFollowupDeNicho =
  | {
      ok: true;
      followup: { id: string; nome: string; estado: "rascunho" };
      gatilho: "silencio" | "etapa" | "manual";
      toques: number;
      aviso: string;
    }
  | { ok: false; motivo: MotivoDeFalhaAoMontarFollowup; detalhe?: string };

/** Confere que a etapa existe nesta organização e não está arquivada (a mesma checagem do `from-model`). */
async function etapaValida(entrada: EntradaDasFerramentas, etapaId: string): Promise<boolean | null> {
  const { data, error } = await entrada.ctx.bancoDosModulos
    .from("crm_stages")
    .select("id, is_archived")
    .eq("id", etapaId)
    .eq("organization_id", entrada.ctx.orgId)
    .maybeSingle();
  if (error) return null;
  if (!data) return false;
  return (data as { is_archived?: boolean | null }).is_archived !== true;
}

export async function montarFollowupDeNicho(
  entrada: EntradaDasFerramentas,
  pedido: PedidoDeFollowupDeNicho,
): Promise<ResultadoDeFollowupDeNicho> {
  const { nicho, nome, toques, silencio_horas, etapa_id } = pedido;
  if (!nichoPorId(nicho)) return { ok: false, motivo: "pedido_invalido" };

  // 1. Toques: o texto sai LITERAL para o cliente — marcador não é preenchido.
  for (const [indice, toque] of toques.entries()) {
    if (/[{}]/.test(toque.texto) || /[{}]/.test(toque.rotulo)) {
      return {
        ok: false,
        motivo: "texto_com_marcador",
        detalhe:
          `PRECISO CONFIRMAR: o toque ${indice + 1} tem chaves {}. Este follow-up não preenche marcadores — ` +
          "o texto sai exatamente como está. Escreva a frase final, sem {produto} ou similares.",
      };
    }
    if (indice > 0 && toque.espera_horas === undefined) {
      return {
        ok: false,
        motivo: "falta_espera",
        detalhe: `PRECISO CONFIRMAR: quanto tempo esperar antes do toque ${indice + 1} (em horas). Sem espera, duas mensagens sairiam coladas.`,
      };
    }
  }

  // 2. Gatilho: silêncio OU etapa; nenhum = manual (o ponteiro nasce manual).
  if (silencio_horas !== undefined && etapa_id !== undefined) {
    return {
      ok: false,
      motivo: "gatilho_invalido",
      detalhe: "PRECISO CONFIRMAR: escolha UM jeito de começar — silêncio do cliente OU entrada numa etapa do funil.",
    };
  }
  if (etapa_id !== undefined) {
    const valida = await etapaValida(entrada, etapa_id);
    if (valida === null) return { ok: false, motivo: "indisponivel" };
    if (!valida) {
      return {
        ok: false,
        motivo: "etapa_inexistente",
        detalhe: "PRECISO CONFIRMAR: essa etapa não existe nesta empresa ou está arquivada. Use listar_funis e listar_etapas_do_funil.",
      };
    }
  }
  const gatilho = triggerConfigSchema.safeParse(
    silencio_horas !== undefined
      ? { kind: "silence", params: { threshold_minutes: silencio_horas * 60 }, cancel_on_reply: true }
      : etapa_id !== undefined
        ? { kind: "stage_change", params: { stage_id: etapa_id }, cancel_on_reply: true }
        : { kind: "manual", cancel_on_reply: true },
  );
  if (!gatilho.success) return { ok: false, motivo: "gatilho_invalido" };

  // 3. O grafo vem do montador; ainda assim é conferido antes de gravar.
  const grafo = flowGraphSchema.safeParse(
    montarEscada({
      prazoDeRespostaMs: 2 * DIA_MS,
      sim: { rotulo: "Quer seguir", padrao: "quero" },
      notaDeResposta: "O cliente respondeu — quem segue a conversa é o atendimento.",
      toques: toques.map(
        (t): Toque => ({
          rotulo: t.rotulo,
          texto: t.texto,
          ...(t.espera_horas === undefined ? {} : { esperaAntesMs: t.espera_horas * HORA_MS }),
        }),
      ),
    }),
  );
  const publicavel = grafo.success ? validateFlowForPublish(grafo.data) : null;
  if (!grafo.success || (publicavel && !publicavel.ok)) return { ok: false, motivo: "indisponivel" };

  // 4. POST (cria o ponteiro, nasce rascunho) + PATCH (grafo, gatilho, handoff).
  const criado = await chamarRotaPorDentro(
    await handlerDeCriacao(),
    "/api/v1/ai/followup-flows",
    {},
    { metodo: "POST", corpo: { name: nome } },
  );
  if ("falhou" in criado) return { ok: false, motivo: "indisponivel" };
  if (criado.status === 409) return { ok: false, motivo: "ja_existe" };
  if (criado.status === 422) return { ok: false, motivo: "pedido_invalido" };
  if (criado.status !== 201) return { ok: false, motivo: "indisponivel" };
  const linha = eObjeto(criado.corpo) ? (criado.corpo as { data?: unknown }).data : undefined;
  if (!eObjeto(linha) || typeof linha.id !== "string" || typeof linha.name !== "string") {
    return { ok: false, motivo: "indisponivel" };
  }
  if (linha.status !== "draft") return { ok: false, motivo: "indisponivel" };

  const gravado = await chamarRotaPorDentro(
    await handlerDeAtualizacao(),
    `/api/v1/ai/followup-flows/${linha.id}`,
    {},
    {
      metodo: "PATCH",
      corpo: { draft_graph: grafo.data, trigger_config: gatilho.data, handoff_policy: "pause" },
    },
  );
  const patchOk =
    "status" in gravado &&
    gravado.status === 200 &&
    eObjeto(gravado.corpo) &&
    eObjeto((gravado.corpo as { data?: unknown }).data) &&
    ((gravado.corpo as { data: Record<string, unknown> }).data.status === "draft");
  if (!patchOk) {
    return {
      ok: false,
      motivo: "grafo_nao_gravado",
      detalhe:
        `O rascunho vazio «${linha.name}» foi criado, mas os toques não foram gravados. ` +
        "Apague-o em IA › Follow-ups (o assistente não apaga) e peça de novo.",
    };
  }

  return {
    ok: true,
    followup: { id: linha.id, nome: linha.name, estado: "rascunho" },
    gatilho: silencio_horas !== undefined ? "silencio" : etapa_id !== undefined ? "etapa" : "manual",
    toques: toques.length,
    aviso:
      "Rascunho criado. O texto vai para clientes: leia cada toque no construtor antes de publicar. " +
      "Publicar e ligar o follow-up a um agente PUBLICADO são cliques do administrador.",
  };
}

export function criarMontarFollowupDeNicho(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Cria como RASCUNHO um follow-up de nicho que não tem modelo pronto (imobiliária, serviços, " +
      "curso, loja, advocacia). Você informa os `toques` (de 1 a 4: `rotulo`, `texto` final sem " +
      "chaves, e `espera_horas` antes do toque — obrigatória do segundo em diante) e como começa: " +
      "`silencio_horas` (cliente calado há N horas) OU `etapa_id` (negócio entra na etapa); sem " +
      "nenhum dos dois o follow-up fica manual. O desenho do fluxo é montado pelo sistema. " +
      "Nada é publicado nem ligado a agente.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("montar_followup_de_nicho", esquemaDeEntrada, async (pedido) => {
      const resultado = await montarFollowupDeNicho(entrada, pedido);
      if (resultado.ok) {
        anotarCartaoDeArtefato(entrada.coletor, entrada.ctx.idioma, {
          artefato: "followup",
          nome: resultado.followup.nome,
          href: `/app/ai/followups/${resultado.followup.id}`,
        });
      }
      return resultado;
    }),
  });
}
