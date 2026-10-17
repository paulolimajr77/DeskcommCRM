/**
 * POST /api/v1/ai/assistente/propostas/[id]/aplicar — o CORAÇÃO da T20 (F2b).
 *
 * Executa UMA proposta `aprovada` pelo handler EXISTENTE do destino, na
 * SESSÃO do administrador que clicou. As travas, na ordem:
 *
 *  1. **Trava consultiva não bloqueante** por proposta
 *     (`pg_try_advisory_lock(hashtextextended('config_proposal:' || id, 0))`)
 *     numa conexão DEDICADA do pool — duas aplicações da mesma proposta nunca
 *     correm juntas. Ocupada → 409 `proposta_em_aplicacao`. A trava é liberada
 *     e o cliente devolvido ao pool no `finally`, aconteça o que acontecer.
 *  2. **GUARDRAIL 2 da spec (§6.2): nenhuma escrita a partir de proposta que
 *     não esteja `aprovada` e dentro do prazo.** Vencida → marca `expirada`
 *     (efeito da ação negada) e 409; outro estado → 409 com o status.
 *  3. **O payload é REVALIDADO** com `payload.ts` — o banco pode ter linha
 *     gravada por uma versão antiga do esquema. Inválido → 422, sem efeito.
 *  4. **O destino é SÓ do mapa** (`DESTINO_DAS_OPERACOES`, código): troca os
 *     marcadores `{router_id}`/`{entry_id}`/`{pipeline_id}`/`{stage_id}` pelos
 *     ids DO PAYLOAD (já validados como uuid). Nenhum outro texto do payload
 *     entra na rota — chave de destino no dado é recusada desde a T19.
 *  5. **Credencial preservada** (`modelo_auxiliares/definir_ponto`): antes do
 *     PUT, lê `GET /api/v1/ai/providers` por dentro e manda no corpo o
 *     `credential_id` QUE JÁ ESTAVA no binding (ou omite, se não havia). A
 *     proposta não pode escolher credencial — o aplicar só não APAGA a que
 *     existe (o PUT sem `credential_id` gravaria `null`).
 *  6. **Falha não quebra a proposta**: não-2xx ou exceção do destino → a
 *     proposta FICA `aprovada` (pode tentar de novo), com 422/502
 *     `proposta_falhou_ao_aplicar` e audit próprio. Sucesso → CAS para
 *     `aplicada` com `apply_result` (destino do mapa + http_status + id do
 *     artefato; NUNCA o corpo inteiro da resposta).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import { UUID_DA_PROPOSTA } from "@/lib/assistente/propostas/decisao";
import { destinoDaOperacao, type DestinoDaOperacao } from "@/lib/assistente/propostas/operacoes";
import { ESQUEMA_DO_PAYLOAD_POR_TIPO } from "@/lib/assistente/propostas/payload";
import {
  COLUNAS_DA_PROPOSTA,
  dadosDaProposta,
  type LinhaDaProposta,
} from "@/lib/assistente/propostas/projecao";
import { TIPOS_DE_PROPOSTA, type TipoDeProposta } from "@/lib/assistente/propostas/tipos";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";

// Os handlers de destino — EXATAMENTE os que o mapa cita. Nada de DELETE:
// nenhuma proposta apaga nada.
import { GET as providersGET, PATCH as providersPATCH, PUT as providersPUT } from "@/app/api/v1/ai/providers/route";
import { POST as knowledgePOST } from "@/app/api/v1/ai/knowledge/sources/route";
import { POST as memoryPOST } from "@/app/api/v1/ai/memory/entries/route";
import { PATCH as memoryEntryPATCH } from "@/app/api/v1/ai/memory/entries/[id]/route";
import { POST as routersPOST } from "@/app/api/v1/ai/routers/route";
import { PATCH as routersPATCH } from "@/app/api/v1/ai/routers/[id]/route";
import { PUT as routerMembersPUT } from "@/app/api/v1/ai/routers/[id]/members/route";
import { POST as pipelinesPOST } from "@/app/api/v1/pipelines/route";
import { POST as stagesPOST } from "@/app/api/v1/pipelines/[id]/stages/route";
import { PATCH as stagePATCH } from "@/app/api/v1/pipelines/[id]/stages/[stageId]/route";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/** Os ids que o payload carrega fora do `corpo` — os únicos que viram caminho. */
const CHAVES_DE_ID = ["router_id", "entry_id", "pipeline_id", "stage_id"] as const;

/** O `error.code` do envelope do destino (sem texto livre além do código). */
function codigoDaResposta(corpo: unknown): string | null {
  if (corpo === null || typeof corpo !== "object" || !("error" in corpo)) return null;
  const codigo = (corpo as { error?: { code?: unknown } }).error?.code;
  return typeof codigo === "string" ? codigo : null;
}

/** O id do recurso criado/alterado, SE a resposta o trouxer. */
function idDoArtefato(corpo: unknown): string | null {
  if (corpo === null || typeof corpo !== "object" || !("data" in corpo)) return null;
  const dados = (corpo as { data: unknown }).data;
  if (dados === null || typeof dados !== "object") return null;
  const d = dados as Record<string, unknown>;
  if (typeof d.id === "string") return d.id;
  // O PUT de provedores devolve `{ binding: { id, … } }`.
  if (d.binding !== null && typeof d.binding === "object") {
    const idDoBinding = (d.binding as { id?: unknown }).id;
    if (typeof idDoBinding === "string") return idDoBinding;
  }
  return null;
}

/** Troca os marcadores `{chave}` SÓ pelos ids do payload validado. */
function rotaDoDestino(modelo: string, ids: Record<string, string>): string | null {
  let rota = modelo;
  for (const [chave, valor] of Object.entries(ids)) {
    rota = rota.replaceAll(`{${chave}}`, valor);
  }
  // Marcador sem id no payload não deveria existir (o esquema valida); se
  // existir, a rota não é montada — nunca um caminho com `{` nele.
  return rota.includes("{") ? null : rota;
}

/**
 * O handler EXISTENTE do destino, com os params de rota já resolvidos do
 * payload. A sessão é a da requisição corrente (a do admin que clicou) — os
 * handlers leem o contexto pelos helpers do Next, não pelo argumento.
 */
function handlerDoDestino(destino: DestinoDaOperacao, ids: Record<string, string>): HandlerDeRota {
  const comParams = <C>(
    params: Record<string, string>,
    handler: (req: NextRequest, ctx: { params: Promise<C> }) => Promise<Response>,
  ): HandlerDeRota =>
    (req) => handler(req, { params: Promise.resolve(params as C) });

  if (destino.rota === "/api/v1/ai/routers" && destino.metodo === "POST") return (req) => routersPOST(req);
  if (destino.rota === "/api/v1/ai/routers/{router_id}" && destino.metodo === "PATCH") {
    return comParams({ id: ids.router_id! }, routersPATCH);
  }
  if (destino.rota === "/api/v1/ai/routers/{router_id}/members") {
    return comParams({ id: ids.router_id! }, routerMembersPUT);
  }
  if (destino.rota === "/api/v1/ai/knowledge/sources") return (req) => knowledgePOST(req);
  if (destino.rota === "/api/v1/ai/memory/entries" && destino.metodo === "POST") return (req) => memoryPOST(req);
  if (destino.rota === "/api/v1/ai/memory/entries/{entry_id}") {
    return comParams({ id: ids.entry_id! }, memoryEntryPATCH);
  }
  if (destino.rota === "/api/v1/ai/providers" && destino.metodo === "PUT") return (req) => providersPUT(req);
  if (destino.rota === "/api/v1/ai/providers" && destino.metodo === "PATCH") return (req) => providersPATCH(req);
  if (destino.rota === "/api/v1/pipelines" && destino.metodo === "POST") return (req) => pipelinesPOST(req);
  if (destino.rota === "/api/v1/pipelines/{pipeline_id}/stages") {
    return comParams({ id: ids.pipeline_id! }, stagesPOST);
  }
  if (destino.rota === "/api/v1/pipelines/{pipeline_id}/stages/{stage_id}") {
    return comParams({ id: ids.pipeline_id!, stageId: ids.stage_id! }, stagePATCH);
  }
  throw new Error(`destino sem handler: ${destino.rota} ${destino.metodo}`);
}

interface PontoDaLeitura {
  id?: unknown;
  efetivo?: { origem?: unknown; credentialId?: unknown };
}

/**
 * O `credential_id` que o binding DO PONTO já tinha, lido do GET por dentro.
 * Só o que a origem "binding" mostra é "o que já estava lá": credencial que
 * vem do padrão da organização ou da escada NÃO é do ponto — enviaria uma
 * credencial alheia para dentro do binding.
 */
async function credencialDoPonto(purpose: string): Promise<string | undefined> {
  const leitura = await chamarRotaPorDentro(providersGET, "/api/v1/ai/providers", {});
  if ("falhou" in leitura || leitura.status < 200 || leitura.status >= 300) return undefined;
  const pontos = ((leitura.corpo as { data?: { pontos?: unknown } } | null)?.data?.pontos ?? []) as PontoDaLeitura[];
  const ponto = pontos.find((p) => p.id === purpose);
  if (!ponto || ponto.efetivo?.origem !== "binding") return undefined;
  const credentialId = ponto.efetivo.credentialId;
  return typeof credentialId === "string" && credentialId !== "" ? credentialId : undefined;
}

async function aplicarComTrava(
  cliente: PoolClient,
  id: string,
  organizationId: string,
  userId: string,
  requestId: string,
  t: (texto: string) => string,
): Promise<Response> {
  // A leitura é no pool de serviço (não vale RLS): o filtro de organização é
  // NOSSO, e o valor vem da sessão — nunca do corpo.
  const leitura = await cliente.query<LinhaDaProposta>(
    `select ${COLUNAS_DA_PROPOSTA} from public.config_proposals
      where id = $1::uuid and organization_id = $2::uuid`,
    [id, organizationId],
  );
  const linha = leitura.rows[0];
  if (!linha) {
    return fail("not_found", t("Proposta não encontrada."), 404, { requestId });
  }

  // ── GUARDRAIL 2 (spec §6.2): só proposta `aprovada` e dentro do prazo. ──
  const venceu =
    (linha.status === "pendente" || linha.status === "aprovada") &&
    new Date(linha.expires_at).getTime() <= Date.now();
  if (venceu) {
    await cliente.query(
      "update public.config_proposals set status = 'expirada' where id = $1::uuid and organization_id = $2::uuid and status in ('pendente','aprovada') and expires_at <= now()",
      [id, organizationId],
    );
    return fail("proposta_expirada", t("A proposta venceu (7 dias) e não pode mais ser aplicada."), 409, {
      requestId,
    });
  }
  if (linha.status !== "aprovada") {
    return fail(
      "proposta_em_estado_invalido",
      t(`A proposta está "${linha.status}" — só uma "aprovada" pode ser aplicada.`),
      409,
      { requestId, details: { status: linha.status } },
    );
  }

  // O banco pode ter linha gravada por uma versão antiga do esquema: revalida.
  const tipo = linha.kind;
  if (!TIPOS_DE_PROPOSTA.includes(tipo as TipoDeProposta)) {
    return fail("validation_failed", t("O tipo gravado da proposta não existe mais."), 422, { requestId });
  }
  const tipoSeguro = tipo as TipoDeProposta;
  const payloadParseado = ESQUEMA_DO_PAYLOAD_POR_TIPO[tipoSeguro].safeParse(linha.payload);
  if (!payloadParseado.success) {
    return fail("validation_failed", t("O conteúdo gravado da proposta não é mais válido."), 422, {
      requestId,
      details: payloadParseado.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const payload = payloadParseado.data;

  // O destino é do CÓDIGO, nunca do dado — a chave que decide é a dupla (tipo, operação).
  const destino = destinoDaOperacao(tipoSeguro, payload.operacao);
  if (!destino) {
    return fail("validation_failed", t("A proposta não tem destino conhecido."), 422, { requestId });
  }

  const ids: Record<string, string> = {};
  for (const chave of CHAVES_DE_ID) {
    const valor = (payload as Record<string, unknown>)[chave];
    if (typeof valor === "string") ids[chave] = valor;
  }
  const rota = rotaDoDestino(destino.rota, ids);
  if (rota === null) {
    return fail("validation_failed", t("A proposta não tem os ids que o destino precisa."), 422, { requestId });
  }

  // O corpo do payload, com UMA exceção: `definir_ponto` leva a credencial que
  // o ponto JÁ tinha (o PUT sem `credential_id` a apagaria — medido na T19).
  let corpo: unknown = payload.corpo;
  if (tipoSeguro === "modelo_auxiliares" && payload.operacao === "definir_ponto") {
    const credencial = await credencialDoPonto(payload.corpo.purpose);
    corpo = credencial === undefined ? payload.corpo : { ...payload.corpo, credential_id: credencial };
  }

  // O handler EXISTENTE, pela SESSÃO do admin que clicou: ele aplica o próprio
  // RBAC, a própria validação e o próprio audit. Esta rota não autoriza nada.
  const respostaDestino = await chamarRotaPorDentro(
    handlerDoDestino(destino, ids),
    rota,
    {},
    { metodo: destino.metodo, corpo },
  );
  const okDestino = !("falhou" in respostaDestino) && respostaDestino.status >= 200 && respostaDestino.status < 300;

  // ── Falha: a proposta FICA `aprovada` — pode tentar de novo. ─────────────
  if (!okDestino) {
    const httpStatus = "falhou" in respostaDestino ? null : respostaDestino.status;
    const codigoDoDestino = "falhou" in respostaDestino ? null : codigoDaResposta(respostaDestino.corpo);
    await audit({
      action: "assistente.proposta_falhou_ao_aplicar",
      actorUserId: userId,
      organizationId,
      resourceType: "config_proposals",
      resourceId: id,
      metadata: {
        kind: tipoSeguro,
        operacao: payload.operacao,
        risk: linha.risk,
        http_status: httpStatus,
        codigo_do_destino: codigoDoDestino,
      },
      requestId,
    });
    const status = "falhou" in respostaDestino || respostaDestino.status >= 500 ? 502 : 422;
    return fail(
      "proposta_falhou_ao_aplicar",
      t("A aplicação falhou — a proposta continua aprovada para tentar de novo."),
      status,
      { requestId, details: { http_status: httpStatus, codigo_do_destino: codigoDoDestino } },
    );
  }

  // ── Sucesso: CAS para `aplicada`, com o recibo ENXUTO. ───────────────────
  const resultado = {
    destino: destino.descricao,
    http_status: respostaDestino.status,
    artefato: { tipo: tipoSeguro, id: idDoArtefato(respostaDestino.corpo) },
  };
  try {
    const gravado = await cliente.query<LinhaDaProposta>(
      `update public.config_proposals
         set status = 'aplicada', applied_by = $3::uuid, applied_at = now(), apply_result = $4::jsonb
         where id = $1::uuid and organization_id = $2::uuid and status = 'aprovada'
         returning ${COLUNAS_DA_PROPOSTA}`,
      [id, organizationId, userId, JSON.stringify(resultado)],
    );
    const aplicada = gravado.rows[0];
    if (!aplicada) {
      // RISCO (descrito, sem conserto barato): o destino JÁ criou/alterou o
      // recurso e a gravação do `aplicada` não casou — uma nova tentativa cria
      // de novo. A trava evita a corrida, não este caso.
      await audit({
        action: "assistente.proposta_falhou_ao_aplicar",
        actorUserId: userId,
        organizationId,
        resourceType: "config_proposals",
        resourceId: id,
        metadata: {
          kind: tipoSeguro,
          operacao: payload.operacao,
          risk: linha.risk,
          http_status: respostaDestino.status,
          codigo_do_destino: null,
        },
        requestId,
      });
      return fail("internal_error", t("A aplicação aconteceu, mas não consegui registrar."), 500, { requestId });
    }
    await audit({
      action: "assistente.proposta_aplicada",
      actorUserId: userId,
      organizationId,
      resourceType: "config_proposals",
      resourceId: id,
      metadata: {
        kind: tipoSeguro,
        operacao: payload.operacao,
        risk: linha.risk,
        http_status: respostaDestino.status,
      },
      requestId,
    });
    return ok(dadosDaProposta(aplicada), { requestId });
  } catch {
    // A MESMA dívida do ramo acima, agora por exceção na gravação.
    await audit({
      action: "assistente.proposta_falhou_ao_aplicar",
      actorUserId: userId,
      organizationId,
      resourceType: "config_proposals",
      resourceId: id,
      metadata: {
        kind: tipoSeguro,
        operacao: payload.operacao,
        risk: linha.risk,
        http_status: respostaDestino.status,
        codigo_do_destino: null,
      },
      requestId,
    });
    return fail("internal_error", t("A aplicação aconteceu, mas não consegui registrar."), 500, { requestId });
  }
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_DA_PROPOSTA.test(id)) {
    return fail("invalid_request", "Id inválido.", 422, { requestId });
  }

  const authz = await requireRole("admin", { requestId, resource: "assistente_propostas" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  const pool = getRequestPool();
  const cliente = await pool.connect();
  let travado = false;
  let resposta: Response;
  try {
    // A trava é POR SESSÃO (conexão): tenta sem esperar — quem chega
    // simultâneo recebe 409 e a fila da tela segue honesta.
    const trava = await cliente.query<{ travado: boolean }>(
      "select pg_try_advisory_lock(hashtextextended('config_proposal:' || $1, 0)) as travado",
      [id],
    );
    travado = trava.rows[0]?.travado === true;
    if (!travado) {
      resposta = fail("proposta_em_aplicacao", t("Esta proposta já está sendo aplicada agora."), 409, { requestId });
    } else {
      resposta = await aplicarComTrava(cliente, id, orgId, userId, requestId, t);
    }
  } catch {
    resposta = fail("internal_error", t("Não consegui aplicar a proposta."), 500, { requestId });
  }
  // A liberação é do MESMO cliente que travou e acontece SEMPRE — o catch
  // acima capturou qualquer exceção do caminho, então o fluxo chega aqui
  // garantido. Se o UNLOCK lançar, o cliente NÃO pode voltar ao pool sem
  // erro: voltaria COM A TRAVA PRESA, e a próxima tentativa da mesma proposta
  // receberia 409 até a conexão morrer. O erro vai JUNTO no release(): o
  // pg-pool descarta a conexão (client.end()), a trava morre com a sessão, e
  // a resposta da aplicação não é mascarada.
  if (travado) {
    try {
      await cliente.query("select pg_advisory_unlock(hashtextextended('config_proposal:' || $1, 0))", [id]);
    } catch (erroDaLiberacao) {
      cliente.release(erroDaLiberacao instanceof Error ? erroDaLiberacao : new Error(String(erroDaLiberacao)));
      return resposta;
    }
  }
  cliente.release();
  return resposta;
}
