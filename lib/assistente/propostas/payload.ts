/**
 * O CONTEÚDO DE UMA PROPOSTA DE CONFIGURAÇÃO (F2b, T19) — o que o assistente
 * pode pedir, campo a campo, e NADA além disso.
 *
 * Três regras que este arquivo sustenta:
 *
 *  1. O destino é do CÓDIGO, nunca do dado. O `payload` guarda só
 *     `{ operacao, <ids alvo>, corpo }`; rota e método moram em `operacoes.ts`.
 *     Chave `rota`/`url`/`path`/`method`/`metodo` em qualquer nível é recusada
 *     (`temChaveDeDestino`), além de cada objeto ser `.strict()`.
 *  2. Cada operação aceita um SUBCONJUNTO CURADO do que a rota-alvo aceita.
 *     Os campos de cada rota foram medidos na T19 (cabeçalho de cada bloco).
 *     Campo que a rota aceita e este arquivo não lista — `config` do roteador,
 *     `is_active`, `credential_id`, `base_url`, `is_won`/`is_lost`,
 *     `win_probability`, upload/URL de conhecimento — é RECUSADO aqui.
 *  3. Nada de apagar: não existe operação de exclusão em nenhum tipo.
 *
 * Puro de propósito (só `zod` e as listas de vocabulário): a rota de propostas,
 * as cinco ferramentas `propor_*` e a tela da T21 leem daqui.
 */
import { z } from "zod";

import { ehProvedorSuportado } from "@/lib/ai/pontos/provedores";
import { escritaPermitida } from "@/lib/assistente/portas/regras";

import type { TipoDeProposta } from "./tipos";

/** Teto do `payload` serializado (spec §7b: a proposta é uma ação, não um arquivo). */
export const LIMITE_DO_PAYLOAD_EM_BYTES = 64 * 1024;
/** Teto do retrato "antes" serializado. */
export const LIMITE_DO_ANTES_EM_BYTES = 32 * 1024;
/** Texto corrido de uma fonte de conhecimento escrita pela conversa. */
export const LIMITE_DO_TEXTO_DE_CONHECIMENTO = 20_000;
/** Perguntas e respostas de uma fonte de FAQ escrita pela conversa. */
export const LIMITE_DE_ITENS_DE_FAQ = 50;

const uuid = z.string().uuid();
const texto = (min: number, max: number) => z.string().trim().min(min).max(max);

function algumCampoPreenchido(corpo: Record<string, unknown>): boolean {
  return Object.values(corpo).some((valor) => valor !== undefined);
}

// ─── roteador ───────────────────────────────────────────────────────────────
// Medido em app/api/v1/ai/routers/route.ts (`createRouterSchema`): name 1–120,
// channel_session_id uuid, fallback_agent_id uuid|null opcional, config (livre).
// Medido em routers/[id]/route.ts (`patchRouterSchema`): name, is_active,
// fallback_agent_id, config. Medido em routers/[id]/members/route.ts
// (`memberInputSchema`): agent_id, intent_name 1–120, intent_description 1–2000,
// examples, flow_pointer_id, pipeline_id, stage_id.
// Aceito aqui: SEM `config`, SEM `is_active`, SEM flow_pointer_id/pipeline_id/stage_id.

const membroDoRoteador = z.strictObject({
  agent_id: uuid,
  intent_name: texto(1, 120),
  intent_description: texto(1, 2000),
  examples: z.array(texto(1, 300)).max(10).optional(),
});

const esquemaDeRoteador = z.discriminatedUnion("operacao", [
  z.strictObject({
    operacao: z.literal("criar"),
    corpo: z.strictObject({
      name: texto(1, 120),
      channel_session_id: uuid,
      fallback_agent_id: uuid.nullable().optional(),
    }),
  }),
  z.strictObject({
    operacao: z.literal("alterar"),
    router_id: uuid,
    corpo: z
      .strictObject({
        name: texto(1, 120).optional(),
        fallback_agent_id: uuid.nullable().optional(),
      })
      .refine(algumCampoPreenchido, { message: "Diga o que mudar no roteador." }),
  }),
  z.strictObject({
    operacao: z.literal("membros"),
    router_id: uuid,
    corpo: z.strictObject({
      // `min(1)`: a rota SUBSTITUI a lista inteira; lista vazia seria apagar tudo.
      members: z
        .array(membroDoRoteador)
        .min(1)
        .max(20)
        .refine(
          (membros) =>
            new Set(membros.map((m) => m.intent_name.trim().toLowerCase())).size === membros.length,
          { message: "Duas intenções não podem ter o mesmo nome." },
        ),
    }),
  }),
]);

// ─── conhecimento ───────────────────────────────────────────────────────────
// Medido em app/api/v1/ai/knowledge/sources/route.ts (`createSourceSchema`):
// agent_id uuid opcional, source_type (texto livre canonizado em faq|documento|
// conversas|catalogo — `lib/ai/rag/tipos-de-fonte.ts`), name 2–120, items
// [{question, answer, tags, locale}], markdown_blob, source_metadata.
// Aceito aqui: SÓ `faq` (items) e `documento` (markdown_blob) — o texto que a
// conversa escreve. `conversas` e `catalogo` são automáticos; upload e URL
// moram em outras rotas. Sem `tags`, sem `source_metadata`.

const itemDeFaq = z.strictObject({
  question: texto(1, 500),
  answer: texto(1, 4000),
  locale: z.enum(["pt-BR", "es"]).optional(),
});

const esquemaDeConhecimento = z.discriminatedUnion("operacao", [
  z.strictObject({
    operacao: z.literal("criar"),
    corpo: z.discriminatedUnion("source_type", [
      z.strictObject({
        source_type: z.literal("faq"),
        name: texto(2, 120),
        items: z.array(itemDeFaq).min(1).max(LIMITE_DE_ITENS_DE_FAQ),
        agent_id: uuid.optional(),
      }),
      z.strictObject({
        source_type: z.literal("documento"),
        name: texto(2, 120),
        markdown_blob: texto(1, LIMITE_DO_TEXTO_DE_CONHECIMENTO),
        agent_id: uuid.optional(),
      }),
    ]),
  }),
]);

// ─── memória ────────────────────────────────────────────────────────────────
// Medido em app/api/v1/ai/memory/entries/route.ts (`postSchema`): title 1–200,
// body 1–10000. Medido em memory/entries/[id]/route.ts (`patchSchema`):
// status archived|active. Aceito aqui: criar (title, body) e arquivar
// (status FIXO "archived" — reativar não é proposta).

const esquemaDeMemoria = z.discriminatedUnion("operacao", [
  z.strictObject({
    operacao: z.literal("criar"),
    corpo: z.strictObject({ title: texto(1, 200), body: texto(1, 10_000) }),
  }),
  z.strictObject({
    operacao: z.literal("arquivar"),
    entry_id: uuid,
    corpo: z.strictObject({ status: z.literal("archived") }),
  }),
]);

// ─── modelo dos auxiliares ──────────────────────────────────────────────────
// Medido em app/api/v1/ai/providers/route.ts: PUT (`corpoDoPut`) purpose,
// provider (lista de provedores suportados), model_id, credential_id, base_url,
// is_enabled; PATCH (`corpoDoPatch`) provider, default_model.
// Aceito aqui: SEM `credential_id` (credencial nunca é preenchida pela IA),
// SEM `base_url`, SEM `is_enabled`.

const provedor = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine(ehProvedorSuportado, { message: "Provedor que o sistema não conhece." });

const esquemaDeModeloAuxiliares = z.discriminatedUnion("operacao", [
  z.strictObject({
    operacao: z.literal("definir_ponto"),
    corpo: z.strictObject({
      purpose: z
        .string()
        .trim()
        .min(1)
        .max(60)
        .regex(/^[a-z][a-z0-9_]*$/, { message: "Nome de ponto inválido." }),
      provider: provedor,
      model_id: texto(1, 200),
    }),
  }),
  z.strictObject({
    operacao: z.literal("definir_padrao"),
    corpo: z.strictObject({ provider: provedor, default_model: texto(1, 200) }),
  }),
]);

// ─── funil ──────────────────────────────────────────────────────────────────
// Medido em app/api/v1/pipelines/route.ts (`bodySchema`): name 1–80,
// description ≤280|null. Medido em pipelines/[id]/stages/route.ts: name 1–80,
// expected_duration_hours. Medido em stages/[stageId]/route.ts: name,
// is_won, is_lost, depois_de, win_probability, avisar_na_central,
// expected_duration_hours. Aceito aqui: nome, descrição e posição (`depois_de`).
// SEM is_won/is_lost (mudam o que "ganho" e "perda" significam), SEM
// win_probability, avisar_na_central e expected_duration_hours (automação e
// radar). Não existe campo de cor em nenhuma das duas rotas.

const esquemaDeFunil = z.discriminatedUnion("operacao", [
  z.strictObject({
    operacao: z.literal("criar_funil"),
    corpo: z.strictObject({
      name: texto(1, 80),
      description: z.string().trim().max(280).nullable().optional(),
    }),
  }),
  z.strictObject({
    operacao: z.literal("criar_etapa"),
    pipeline_id: uuid,
    corpo: z.strictObject({ name: texto(1, 80) }),
  }),
  z.strictObject({
    operacao: z.literal("alterar_etapa"),
    pipeline_id: uuid,
    stage_id: uuid,
    corpo: z
      .strictObject({
        name: texto(1, 80).optional(),
        depois_de: uuid.nullable().optional(),
      })
      .refine(algumCampoPreenchido, { message: "Diga o que mudar na etapa." }),
  }),
]);

// ─── ação ─────────────────────────────────────────────────────────────────────
// Exceção consciente à regra do cabeçalho deste arquivo: a chave `metodo`
// normalmente recusa porque daria ao dado o poder de escolher o destino. Para
// `acao`, `porta` é um ID do catálogo (não caminho livre) e `metodo` é o
// verbo da chamada interna — ambos são validados pela lista branca
// `escritaPermitida` (regras.ts), que só libera o aprovado pelo Paulo. Não é
// um destino livre: o código da aplicação confere `escritaPermitida` de novo
// na hora de aplicar (rota de aplicar, T4) e nunca expõe rota/URL/path ao modelo.

const esquemaDeAcao = z.strictObject({
  porta: z.string().min(1).max(200),
  metodo: z.enum(["POST", "PATCH", "PUT"]),
  valores: z.record(z.string(), z.string()).optional(),
  corpo: z.unknown().optional(),
}).refine(
  (dados) => escritaPermitida(dados.porta, dados.metodo),
  { message: "A porta não libera esse método de escrita.", path: ["porta"] },
);

/** O esquema do `payload` de cada tipo de proposta. */
export const ESQUEMA_DO_PAYLOAD_POR_TIPO = {
  roteador: esquemaDeRoteador,
  conhecimento: esquemaDeConhecimento,
  memoria: esquemaDeMemoria,
  modelo_auxiliares: esquemaDeModeloAuxiliares,
  funil: esquemaDeFunil,
  acao: esquemaDeAcao,
} as const satisfies Record<TipoDeProposta, z.ZodType>;

/** As operações que cada tipo aceita, lidas dos próprios esquemas (nenhuma lista paralela). */
export const OPERACOES_ACEITAS: Readonly<Record<TipoDeProposta, readonly string[]>> = {
  roteador: esquemaDeRoteador.options.map((o) => o.shape.operacao.value),
  conhecimento: esquemaDeConhecimento.options.map((o) => o.shape.operacao.value),
  memoria: esquemaDeMemoria.options.map((o) => o.shape.operacao.value),
  modelo_auxiliares: esquemaDeModeloAuxiliares.options.map((o) => o.shape.operacao.value),
  funil: esquemaDeFunil.options.map((o) => o.shape.operacao.value),
  acao: [],
};

/** Chaves que dariam ao DADO o poder de escolher o destino. Nunca entram num payload. */
const CHAVES_DE_DESTINO = new Set(["rota", "url", "path", "method", "metodo"]);

/**
 * Procura, em qualquer profundidade, uma chave que escolheria o destino da
 * aplicação. Devolve o caminho da primeira achada (para a mensagem) ou `null`.
 */
export function temChaveDeDestino(valor: unknown, caminho = "payload"): string | null {
  if (Array.isArray(valor)) {
    for (let i = 0; i < valor.length; i += 1) {
      const achada = temChaveDeDestino(valor[i], `${caminho}[${i}]`);
      if (achada !== null) return achada;
    }
    return null;
  }
  if (valor === null || typeof valor !== "object") return null;
  for (const [chave, sub] of Object.entries(valor as Record<string, unknown>)) {
    if (CHAVES_DE_DESTINO.has(chave.toLowerCase())) return `${caminho}.${chave}`;
    const achada = temChaveDeDestino(sub, `${caminho}.${chave}`);
    if (achada !== null) return achada;
  }
  return null;
}

function bytesDe(valor: unknown): number {
  return new TextEncoder().encode(JSON.stringify(valor)).length;
}

const campos = {
  resumo: texto(3, 300),
  motivo: texto(3, 2000),
  // Retrato do estado atual (null na criação). Objeto livre: é só leitura da tela.
  antes: z.record(z.string(), z.unknown()).nullable().optional(),
  thread_id: uuid.optional(),
  turn_id: uuid.optional(),
};

/**
 * O corpo do POST de propostas: união discriminada por `kind`, com o `payload`
 * já validado pelo esquema do tipo. `kind` fora de `TIPOS_DE_PROPOSTA` (inclusive
 * `critico`, que não existe) é recusado.
 */
export const esquemaDoCorpoDaProposta = z
  .discriminatedUnion("kind", [
    z.strictObject({ ...campos, kind: z.literal("roteador"), payload: esquemaDeRoteador }),
    z.strictObject({ ...campos, kind: z.literal("conhecimento"), payload: esquemaDeConhecimento }),
    z.strictObject({ ...campos, kind: z.literal("memoria"), payload: esquemaDeMemoria }),
    z.strictObject({ ...campos, kind: z.literal("modelo_auxiliares"), payload: esquemaDeModeloAuxiliares }),
    z.strictObject({ ...campos, kind: z.literal("funil"), payload: esquemaDeFunil }),
    z.strictObject({ ...campos, kind: z.literal("acao"), payload: esquemaDeAcao }),
  ])
  .superRefine((proposta, ctx) => {
    // `acao` é exceção consciente: `porta`+`metodo` no payload são validados pela
    // lista branca `escritaPermitida` (regras.ts), não são caminho livre. Não
    // aplicamos `temChaveDeDestino` a `acao` — a porta já foi aprovada por quem
    // escreveu as regras de escrita (T1), e o aplicar confere `escritaPermitida`
    // de novo antes de escrever (rota de aplicar, T4).
    if (proposta.kind !== "acao") {
      const destino = temChaveDeDestino(proposta.payload);
      if (destino !== null) {
        ctx.addIssue({ code: "custom", path: ["payload"], message: `O payload não escolhe destino (${destino}).` });
      }
    }
    if (bytesDe(proposta.payload) > LIMITE_DO_PAYLOAD_EM_BYTES) {
      ctx.addIssue({ code: "custom", path: ["payload"], message: "O payload passa de 64 KB." });
    }
    if (proposta.antes != null && bytesDe(proposta.antes) > LIMITE_DO_ANTES_EM_BYTES) {
      ctx.addIssue({ code: "custom", path: ["antes"], message: "O retrato 'antes' passa de 32 KB." });
    }
  });

export type CorpoDaProposta = z.infer<typeof esquemaDoCorpoDaProposta>;
