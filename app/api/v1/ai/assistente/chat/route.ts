/**
 * POST /api/v1/ai/assistente/chat — turno de leitura do assistente interno (F1b).
 *
 * O MODELO de IA responde lendo dados reais por cinco ferramentas de leitura
 * (`lib/assistente/ferramentas`); a resposta fixa da F1 (resumo, trecho de guia
 * ou "ainda não consegui") continua existindo como PISO
 * (`lib/assistente/piso.ts`) e entra quando o modelo não pode responder: sem
 * chave de IA, limite de gasto, falha do modelo ou texto vazio. O assistente é
 * LEITURA — nada aqui escreve fora de `config_threads`/`config_messages`.
 *
 * ## O fluxo (a ordem é o ponto)
 *
 *  1. Guarda de suporte, `requireRole("viewer")` e corpo Zod `.strict()`.
 *     Papel e organização saem SÓ da sessão, nunca do corpo.
 *  2. Limite por MINUTO (12 por pessoa, 60 por organização): trava contra
 *     clique repetido, no mesmo estilo do chat do caso.
 *  3. Se veio `thread_id`: valida que é da organização (404) e procura o
 *     turno pelo `turn_id`. Já há linha `ai` ⇒ REPLAY (`replay: true`); há
 *     `human` sem `ai` ⇒ RETOMADA (usa o texto gravado); senão é pergunta nova.
 *  4. Só a pergunta NOVA passa pelo limite DIÁRIO de perguntas
 *     (`verificarLimiteDePerguntas`, cartão Orçamento). Estourou ⇒ 429, sem
 *     criar thread e sem gravar linha nenhuma.
 *  5. Cria a thread, se preciso, e grava o `human`.
 *  6. Monta o turno e chama o modelo. Qualquer falha cai no piso, com um
 *     aviso que diz POR QUE a IA não respondeu e um `error_code` na linha `ai`.
 *  7. Grava a linha `ai`, audita (sem o texto da pergunta) e responde.
 *
 * ## Por que replay e retomada vêm ANTES do limite diário
 *
 * O limite conta as perguntas já gravadas. Repetir um `turn_id` é a MESMA
 * pergunta: se o limite rodasse antes, o reenvio de uma resposta que a pessoa
 * já recebeu (clique duplo, nova tentativa do cliente) seria barrado com 429
 * justo no ponto em que a pergunta já foi contada e paga. Pela mesma razão a
 * retomada (human gravado, ai não) não é cobrada de novo.
 *
 * ## Por que o `ctx` das ferramentas leva o cliente de SESSÃO
 *
 * `bancoDosModulos` é `createClient()` (cookie da pessoa, RLS valendo) e nunca
 * o cliente de serviço: o que o modelo consegue ler por ali é exatamente o que
 * a pessoa já consegue ver. O cliente de serviço só existe nesta rota para o
 * limite diário (`verificarLimiteDePerguntas`, que conta as perguntas de TODA a
 * organização e filtra `organization_id` com o `orgId` da sessão), para os
 * INTERRUPTORES DE MÓDULO da instalação (`ctx.bancoDaInstalacao`: `platform_config`
 * e `modulos_instalados` não têm policy para a sessão, e lidos por ela todo módulo
 * pareceria desligado) e dentro das métricas que declaram a razão no cabeçalho.
 *
 * Escrita pelo pool de serviço com `organization_id` da sessão em todo
 * statement. Idempotência por `turn_id` (unique por organização, thread, turno e autor), sem `comIdempotencia`
 * — a resposta ficaria copiada em `idempotency_keys`, fora da cascata de LGPD e
 * sem expurgo. A auditoria nunca leva o texto da pergunta nem o da resposta.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import {
  responderComoAssistente,
  type TurnoDoAssistente,
} from "@/lib/agent-engine/agent/assistente-turn";
import { montarSystemDoAssistente } from "@/lib/agent-engine/agent/assistente/prompt";
import { fusoDaOrganizacao } from "@/lib/agent-engine/agent/fuso-da-org";
import { requestTurnDeps } from "@/lib/agent-engine/agent/request-deps";
import { loadSkills } from "@/lib/agent-engine/agent/skills";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { LlmNotConfiguredError } from "@/lib/agent-engine/edge/llm/credentials";
import { LlmBudgetExceededError } from "@/lib/agent-engine/edge/llm/run-model-call";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  criarColetorDoTurno,
  MAXIMO_DE_PASSOS_DO_ASSISTENTE,
  montarFerramentasDoAssistente,
} from "@/lib/assistente/ferramentas";
import type { AcaoDoChat } from "@/lib/assistente/ferramentas/tipos";
import { comandoDaPergunta } from "@/lib/assistente/comandos";
import { executarComando } from "@/lib/assistente/comandos/executar";
import { agenteVistoNaTela } from "@/lib/assistente/contexto-da-tela";
import { verificarLimiteDePerguntas } from "@/lib/assistente/limites";
import type { ContextoDeConsulta, Papel } from "@/lib/assistente/metricas";
import { respostaDoPiso } from "@/lib/assistente/piso";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Teto por PESSOA: cada pergunta é uma chamada paga ao modelo. */
const TETO_POR_USUARIO_POR_MINUTO = 12;
/** Teto por ORGANIZAÇÃO: 12 por pessoa com 20 pessoas seriam 240 chamadas por minuto na chave do cliente. */
const TETO_POR_ORGANIZACAO_POR_MINUTO = 60;
const JANELA_SEGUNDOS = 60;

/** Quantas mensagens anteriores o modelo enxerga, e o teto de caracteres da soma delas. */
const MAXIMO_DE_MENSAGENS_NO_HISTORICO = 20;
const MAXIMO_DE_CARACTERES_NO_HISTORICO = 8000;

const corpoDoPost = z
  .object({
    thread_id: z.string().uuid().optional(),
    turn_id: z.string().uuid(),
    pergunta: z.string().trim().min(3).max(1000),
    // Onde a pessoa está (painel do assistente). SÓ o caminho: o id do objeto aberto
    // é extraído e conferido contra a organização da sessão em `contexto-da-tela.ts`.
    contexto: z.strictObject({ caminho: z.string().max(200) }).optional(),
  })
  .strict();

type MotivoDoPiso = "llm_nao_configurada" | "limite_de_gasto" | "erro_do_modelo" | "resposta_vazia";

/** O aviso que precede o piso. A mensagem do erro NUNCA entra aqui. */
function avisoDoPiso(motivo: MotivoDoPiso, t: (texto: string) => string): string {
  switch (motivo) {
    case "llm_nao_configurada":
      return t(
        "Conecte uma chave de IA em IA › Provedores para o assistente responder com inteligência.",
      );
    case "limite_de_gasto":
      return t(
        "O limite de gasto com IA foi atingido; por enquanto respondo só com resumos e guias.",
      );
    case "erro_do_modelo":
    case "resposta_vazia":
      return t("Não consegui usar a IA agora; respondi só com resumos e guias.");
  }
}

function motivoDoErro(erro: unknown): MotivoDoPiso {
  if (erro instanceof LlmNotConfiguredError) return "llm_nao_configurada";
  if (erro instanceof LlmBudgetExceededError) return "limite_de_gasto";
  return "erro_do_modelo";
}

/**
 * O histórico em ordem cronológica, mantendo as mensagens MAIS RECENTES: se a
 * soma passa do teto de caracteres, descarta a partir da mais antiga.
 */
function recortarHistorico(cronologico: TurnoDoAssistente[]): TurnoDoAssistente[] {
  const mantidas: TurnoDoAssistente[] = [];
  let soma = 0;
  for (let i = cronologico.length - 1; i >= 0; i -= 1) {
    const mensagem = cronologico[i]!;
    if (soma + mensagem.body.length > MAXIMO_DE_CARACTERES_NO_HISTORICO) break;
    soma += mensagem.body.length;
    mantidas.unshift(mensagem);
  }
  return mantidas;
}

function erroDeUnique(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const authz = await requireRole("viewer", { requestId, resource: "assistente" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const userId = authz.user.id;
  const idioma = authz.user.idioma;
  // `ai_operator` é o agente, não uma pessoa: o catálogo de métricas não o
  // conhece. Nunca chega aqui com sessão de pessoa; se chegasse, vale o menor papel.
  const papel: Papel = authz.org.role === "ai_operator" ? "viewer" : authz.org.role;

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return fail("validation_failed", t("Corpo inválido."), 422, { requestId });
  }
  const parsed = corpoDoPost.safeParse(corpo);
  if (!parsed.success) {
    return fail("validation_failed", t("Pergunta inválida."), 422, {
      details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      requestId,
    });
  }
  const { thread_id, turn_id, pergunta, contexto } = parsed.data;

  // ─── Limite por minuto: vale para toda chamada, replay inclusive ─────────
  const porPessoa = await checkRateLimit(
    `assistente:u:${userId}`,
    TETO_POR_USUARIO_POR_MINUTO,
    JANELA_SEGUNDOS,
  );
  const porOrganizacao = await checkRateLimit(
    `assistente:o:${orgId}`,
    TETO_POR_ORGANIZACAO_POR_MINUTO,
    JANELA_SEGUNDOS,
  );
  if (!porPessoa.allowed || !porOrganizacao.allowed) {
    return fail("rate_limited", t("Muitas perguntas seguidas. Tente em um minuto."), 429, {
      requestId,
      headers: { "Retry-After": String(JANELA_SEGUNDOS) },
    });
  }

  const pool = getRequestPool();
  // Texto que manda na geração. Na retomada de turno pela metade, passa a ser
  // o body JÁ GRAVADO.
  let perguntaEfetiva = pergunta;
  let retomada = false;
  let threadId: string | null = null;

  // ─── A thread existe? O turno já aconteceu? ──────────────────────────────
  if (thread_id !== undefined) {
    const { rows } = await pool.query<{ id: string }>(
      "select id from public.config_threads where id = $1 and organization_id = $2 and created_by = $3",
      [thread_id, orgId, userId],
    );
    if (rows.length === 0) {
      return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
    }
    threadId = thread_id;

    const turno = await pool.query<{ author_kind: string; body: string | null }>(
      `select author_kind, body from public.config_messages
       where organization_id = $1 and thread_id = $2 and turn_id = $3
       order by created_at`,
      [orgId, thread_id, turn_id],
    );
    if (turno.rows.some((r) => r.author_kind === "ai")) {
      return ok({ thread_id, turn_id, mensagens: turno.rows, replay: true }, { requestId });
    }
    const humano = turno.rows.find((r) => r.author_kind === "human");
    if (humano !== undefined) {
      retomada = true;
      if (typeof humano.body === "string" && humano.body.trim() !== "")
        perguntaEfetiva = humano.body;
    }
  }

  // ─── O texto é um COMANDO? ("/resumo" e irmãos) ──────────────────────────
  //
  // Sai do texto JÁ EFETIVO (na retomada é o gravado). Comando não chama o
  // modelo: é resposta determinística, lida com a sessão, e por isso também
  // não entra no limite DIÁRIO de perguntas (que conta chamada paga ao modelo).
  const comando = comandoDaPergunta(perguntaEfetiva);

  // ─── Pergunta NOVA: passa pelo limite diário, antes de gravar qualquer coisa ─
  if (!retomada && comando === null) {
    const veredito = await verificarLimiteDePerguntas(createAdminClient(), {
      orgId,
      userId,
      idioma,
    });
    if (!veredito.ok) {
      return fail("rate_limited", veredito.mensagem, 429, {
        details: { escopo: veredito.escopo, limite: veredito.limite },
        requestId,
      });
    }
  }

  if (threadId === null) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.config_threads (organization_id, kind, created_by)
       values ($1, 'leitura', $2) returning id`,
      [orgId, userId],
    );
    threadId = rows[0]!.id;
  }

  if (!retomada) {
    try {
      await pool.query(
        `insert into public.config_messages (thread_id, organization_id, turn_id, author_kind, author_user_id, body)
         values ($1, $2, $3, 'human', $4, $5)`,
        [threadId, orgId, turn_id, userId, pergunta],
      );
    } catch (e: unknown) {
      if (!erroDeUnique(e)) throw e;
      // Corrida: outra tentativa do MESMO turno gravou o human primeiro.
      const { rows } = await pool.query<{ author_kind: string; body: string | null }>(
        `select author_kind, body from public.config_messages
         where organization_id = $1 and thread_id = $2 and turn_id = $3
         order by created_at`,
        [orgId, threadId, turn_id],
      );
      if (rows.some((r) => r.author_kind === "ai")) {
        return ok({ thread_id: threadId, turn_id, mensagens: rows, replay: true }, { requestId });
      }
      const gravada = rows.find((r) => r.author_kind === "human")?.body;
      if (typeof gravada === "string" && gravada.trim() !== "") perguntaEfetiva = gravada;
    }
  }

  // ─── O turno com o modelo; qualquer falha cai no piso ────────────────────
  const coletor = criarColetorDoTurno();
  let textoDoModelo = "";
  let callId: string | null = null;
  let motivoDoPiso: MotivoDoPiso | null = null;
  // Os cartões de um COMANDO (o retrato do `/checkup`). Comando não passa pelo
  // modelo, então o coletor do turno fica vazio e estes são os cartões da vez.
  let acoesDoComando: AcaoDoChat[] = [];
  try {
    const fuso = await fusoDaOrganizacao(pool, orgId);
    const agoraIso = new Date().toISOString();
    const ctx: ContextoDeConsulta = {
      orgId,
      papel,
      idioma,
      fuso,
      agoraIso,
      bancoDosModulos: await createClient(),
      // Só para os interruptores de módulo da instalação (sem policy para a sessão).
      bancoDaInstalacao: createAdminClient(),
    };
    if (comando !== null) {
      // COMANDO: o servidor responde sozinho, lendo com a sessão. Nenhuma
      // chamada de modelo, nenhum passo de ferramenta. O cartão do `/checkup`
      // volta em `acoes`; os outros comandos só devolvem texto.
      const saida = await executarComando(comando, ctx, t);
      textoDoModelo = saida.resposta;
      acoesDoComando = saida.acoes;
    }
    if (comando === null) {
      const skills = (await loadSkills(pool, orgId)).filter((s) =>
        s.name.startsWith("assistente-"),
      );
      // `turno`: a conversa e o turno desta pergunta, para as ferramentas `propor_*`
      // não duplicarem a proposta num reenvio. Ids da rota, nunca do modelo.
      const tools = montarFerramentasDoAssistente({
        ctx,
        skills,
        coletor,
        turno: { threadId, turnId: turn_id },
      });
      // Contexto da tela: o agente que a pessoa está vendo, só se for desta organização.
      // Não vai para a auditoria, não entra no limite nem no replay.
      const agenteEmTela = await agenteVistoNaTela(pool, orgId, contexto?.caminho);
      // O bloco "Regras de conduta" do `system` só entra para `admin` — o papel
      // vem DA SESSÃO (nunca do corpo), como as ferramentas de escrita.
      const system = montarSystemDoAssistente({ idioma, fuso, agoraIso, papel, agenteEmTela });

      // As mensagens ANTERIORES a este turno. Pegamos as mais recentes (desc) e
      // devolvemos em ordem cronológica; o recorte por caracteres vem depois.
      const anteriores = await pool.query<{ author_kind: "human" | "ai"; body: string | null }>(
        `select author_kind, body from (
         select author_kind, body, created_at, id from public.config_messages
         where organization_id = $1 and thread_id = $2 and turn_id <> $3
           and body is not null and btrim(body) <> ''
         order by created_at desc, id desc
         limit $4
       ) recentes
       order by created_at asc, id asc`,
        [orgId, threadId, turn_id, MAXIMO_DE_MENSAGENS_NO_HISTORICO],
      );
      const historico = recortarHistorico(
        anteriores.rows.flatMap((r) =>
          r.body === null ? [] : [{ author_kind: r.author_kind, body: r.body }],
        ),
      );

      const deps = requestTurnDeps();
      const saida = await responderComoAssistente(
        pool,
        deps.llmCfg,
        {
          tenantId: orgId,
          system,
          historico,
          pergunta: perguntaEfetiva,
          tools,
          maxSteps: MAXIMO_DE_PASSOS_DO_ASSISTENTE,
        },
        { registry: deps.registry, log: deps.log },
      );
      if (saida.texto.trim() === "") {
        motivoDoPiso = "resposta_vazia";
        logger.warn("assistente.chat.modelo_nao_respondeu", {
          requestId,
          organization_id: orgId,
          motivo: motivoDoPiso,
          erro: "texto_vazio",
        });
      } else {
        textoDoModelo = saida.texto;
        callId = saida.callId;
      }
    }
  } catch (erro) {
    motivoDoPiso = motivoDoErro(erro);
    // O NOME do erro e o começo da mensagem (200 caracteres) vão ao log, para o
    // próximo erro não ser cego (o vermelho do e2e da clínica só dizia
    // "TypeError"). A mensagem NUNCA vai à resposta, ao aviso nem ao
    // `error_code`; a pergunta da pessoa não entra aqui.
    logger.warn("assistente.chat.modelo_nao_respondeu", {
      requestId,
      organization_id: orgId,
      motivo: motivoDoPiso,
      erro: erro instanceof Error ? erro.name : "desconhecido",
      mensagem: erro instanceof Error ? erro.message.slice(0, 200) : "",
    });
  }

  // `comando`: a resposta veio do servidor, sem modelo (determinística).
  const fonte: "modelo" | "comando" | "piso" =
    comando !== null ? "comando" : motivoDoPiso === null ? "modelo" : "piso";
  let aviso: string | null = null;
  let resposta = textoDoModelo;
  if (motivoDoPiso !== null) {
    aviso = avisoDoPiso(motivoDoPiso, t);
    const piso = await respostaDoPiso(pool, { orgId, pergunta: perguntaEfetiva, t });
    resposta = `${aviso}\n\n${piso}`;
  }
  const metricas = fonte === "modelo" ? coletor.metricas : [];
  const acoes = fonte === "modelo" ? coletor.acoes : acoesDoComando;

  try {
    await pool.query(
      `insert into public.config_messages (thread_id, organization_id, turn_id, author_kind, body, error_code)
       values ($1, $2, $3, 'ai', $4, $5)`,
      [threadId, orgId, turn_id, resposta, motivoDoPiso],
    );
  } catch (e: unknown) {
    // Duas tentativas ao mesmo tempo: a outra gravou o ai primeiro. Devolve
    // o turno existente, sem audit e sem 500.
    if (erroDeUnique(e)) {
      const { rows } = await pool.query<{ author_kind: string; body: string | null }>(
        `select author_kind, body from public.config_messages
         where organization_id = $1 and thread_id = $2 and turn_id = $3
         order by created_at`,
        [orgId, threadId, turn_id],
      );
      return ok({ thread_id: threadId, turn_id, mensagens: rows, replay: true }, { requestId });
    }
    throw e;
  }
  await pool.query(
    "update public.config_threads set last_message_at = now() where id = $1 and organization_id = $2",
    [threadId, orgId],
  );

  // SEM a pergunta e SEM a resposta: `api_audit_log` é append-only e o que
  // entra ali não sai pela cascata de LGPD.
  await audit({
    action: "ai.assistente_asked",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "config_thread",
    resourceId: threadId,
    metadata: { turn_id, fonte, metricas, call_id: fonte === "modelo" ? callId : null },
    requestId,
  });

  return ok(
    { thread_id: threadId, turn_id, resposta, fonte, aviso, acoes, metricas, replay: false },
    { requestId },
  );
}
