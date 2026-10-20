/**
 * GET/POST /api/v1/ai/assistente/auditoria — F3: auditoria da configuração da empresa.
 *
 * POST (admin; requireSupportWrite antes): roda as leituras POR DENTRO das rotas
 * `/api/v1` com a sessão da pessoa (nunca service role, nunca SQL direto),
 * calcula o estado de cada verificação (`calcularAuditoria`), grava 1 linha em
 * `config_snapshots` e devolve `{ snapshot, anterior }` (o anterior para mostrar
 * a evolução). Audita `assistente.auditoria_rodada` com SÓ `pendencias` e a
 * contagem por estado — nunca texto livre de itens. Limite: uma rodada por
 * organização a cada 60 s (409 legível se repetir).
 *
 * GET (qualquer membro): os últimos N retratos (padrão 10) da organização da
 * sessão, do mais novo para o mais velho.
 *
 * O catálogo de verificações vive em `lib/assistente/auditoria/verificacoes.ts`;
 * o cálculo puro em `calcularAuditoria`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { chamarRotaPorDentro, type HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { calcularAuditoria } from "@/lib/assistente/auditoria/calcular";
import { type LeituraDeVerificacao } from "@/lib/assistente/auditoria/verificacoes";

export const dynamic = "force-dynamic";

/** Teto de páginas para o GET. */
const LIMITE_MAXIMO_PAGINA = 50;

/** Janela de rate limit: 1 rodada por organização a cada 60 s. */
const INTERVALO_MINIMO_MS = 60_000;

/** Handlers internos, resolvidos por importação preguiçosa (dubláveis em teste). */
let handlerProvedores: HandlerDeRota | null = null;
let handlerCanais: HandlerDeRota | null = null;
let handlerPipelines: HandlerDeRota | null = null;
let handlerAgentes: HandlerDeRota | null = null;
let handlerRoteadores: HandlerDeRota | null = null;
let handlerFontes: HandlerDeRota | null = null;
let handlerFollowups: HandlerDeRota | null = null;

async function hProvedores(): Promise<HandlerDeRota> {
  if (handlerProvedores) return handlerProvedores;
  const modulo = await import("@/app/api/v1/ai/providers/route");
  return (handlerProvedores = modulo.GET);
}
async function hCanais(): Promise<HandlerDeRota> {
  if (handlerCanais) return handlerCanais;
  const modulo = await import("@/app/api/v1/channel-sessions/route");
  return (handlerCanais = modulo.GET);
}
async function hPipelines(): Promise<HandlerDeRota> {
  if (handlerPipelines) return handlerPipelines;
  const modulo = await import("@/app/api/v1/pipelines/route");
  return (handlerPipelines = modulo.GET);
}
async function hAgentes(): Promise<HandlerDeRota> {
  if (handlerAgentes) return handlerAgentes;
  const modulo = await import("@/app/api/v1/ai/agents/route");
  return (handlerAgentes = modulo.GET);
}
async function hRoteadores(): Promise<HandlerDeRota> {
  if (handlerRoteadores) return handlerRoteadores;
  const modulo = await import("@/app/api/v1/ai/routers/route");
  return (handlerRoteadores = modulo.GET);
}
async function hFontes(): Promise<HandlerDeRota> {
  if (handlerFontes) return handlerFontes;
  const modulo = await import("@/app/api/v1/ai/knowledge/sources/route");
  return (handlerFontes = modulo.GET);
}
async function hFollowups(): Promise<HandlerDeRota> {
  if (handlerFollowups) return handlerFollowups;
  const modulo = await import("@/app/api/v1/ai/followup-flows/route");
  return (handlerFollowups = modulo.GET);
}

/** Chama uma rota interna e devolve `{ status, corpo }` ou `{ falhou }`. */
async function chamadaInterna(
  resolver: () => Promise<HandlerDeRota>,
  caminho: string,
): Promise<{ status: number; corpo: unknown } | { falhou: string }> {
  const handler = await resolver();
  return chamarRotaPorDentro(handler, caminho, {});
}

/** Tipos de projeção (lista positiva) para cada rota lida. */
interface CredencialBruta {
  id?: string;
  provider?: string;
  label?: string;
  validated_at?: string | null;
  is_active?: boolean;
}
interface CanalBruto {
  id?: string;
  status?: string;
  /** O nome do telefone é `phone_number` (CHANNEL_COLUMNS); `numero` não existe. */
  phone_number?: string;
}
interface FunilBruto {
  id?: string;
  name?: string;
}
interface AgenteBruto {
  id?: string;
  name?: string;
  is_active?: boolean;
  paused_at?: string | null;
  archived_at?: string | null;
  published_version_id?: string | null;
  /** O join da LISTAGEM: `ai_agent_versions!fk(provider, model)` — sem `credential_id`. */
  versao_publicada?: {
    provider?: string;
    model?: string;
    credential_id?: string | null;
  } | null;
}
interface RoteadorBruto {
  id?: string;
  name?: string;
  is_active?: boolean;
  channel_session_id?: string | null;
  fallback_agent_id?: string | null;
}
interface FonteBruta {
  id?: string;
  name?: string;
  source_type?: string;
}
interface FollowupBruto {
  id?: string;
  name?: string;
  status?: string;
}
interface EtapaBruta {
  id?: string;
  name?: string;
}

/**
 * O corpo de uma resposta interna BEM-SUCEDIDA; `undefined` em falha ou status
 * de erro. Antes cada leitura repetia `"status" in resp && resp.status === 200`.
 */
function corpoOk(resposta: { status: number; corpo: unknown } | { falhou: string }): unknown {
  if ("falhou" in resposta) return undefined;
  return resposta.status >= 200 && resposta.status < 300 ? resposta.corpo : undefined;
}

/**
 * O `data` de uma resposta `{ data, meta }`, quando é OBJETO (não array).
 * Serve às rotas cujo `data` é um envelope — `{ credenciais: [...] }`,
 * `{ routers: [...] }` — e não a lista em si.
 */
function dadosDe(corpo: unknown): Record<string, unknown> | undefined {
  if (corpo === null || typeof corpo !== "object") return undefined;
  const campo = (corpo as { data?: unknown }).data;
  if (campo === null || typeof campo !== "object" || Array.isArray(campo)) return undefined;
  return campo as Record<string, unknown>;
}

/**
 * A LISTA de uma resposta `{ data }`. Duas formas reais convivem nas rotas
 * `/api/v1` e as duas são lidas aqui:
 *
 *  - `data` é o próprio array — pipelines, channel-sessions, agents, knowledge/
 *    sources, followup-flows e `pipelines/[id]/stages` devolvem assim;
 *  - `data` é um ENVELOPE e a lista mora numa chave — `ai/providers` devolve
 *    `{ credenciais: [...] }` e `ai/routers` devolve `{ routers: [...] }`.
 *
 * A versão anterior só aceitava a primeira forma: com chave da OpenAI validada
 * e cadastrada, `credenciais` ficava `[]` e a auditoria dizia "sem chave"; com
 * um roteador ativo, dizia "sem roteador". Era leitura errada, não dado errado.
 */
function extrairDados(corpo: unknown, chave?: string): unknown[] | undefined {
  if (corpo === null || typeof corpo !== "object") return undefined;
  const campo = (corpo as { data?: unknown }).data;
  if (Array.isArray(campo)) return campo;
  if (chave === undefined) return undefined;
  const doEnvelope = campo === null || typeof campo !== "object" ? undefined : (campo as Record<string, unknown>)[chave];
  return Array.isArray(doEnvelope) ? doEnvelope : undefined;
}

/** Monta `LeituraDeVerificacao` a partir das respostas das rotas internas. */
async function lerTudo(orgId: string): Promise<LeituraDeVerificacao> {
  void orgId; // orgId já vem da sessão; as rotas internas resolvem a org por si mesmas.
  const [
    respProvedores,
    respCanais,
    respPipelines,
    respAgentes,
    respRoteadores,
    respFontes,
    respFollowups,
  ] = await Promise.all([
    chamadaInterna(hProvedores, "/api/v1/ai/providers"),
    chamadaInterna(hCanais, "/api/v1/channel-sessions"),
    chamadaInterna(hPipelines, "/api/v1/pipelines"),
    chamadaInterna(hAgentes, "/api/v1/ai/agents"),
    chamadaInterna(hRoteadores, "/api/v1/ai/routers"),
    chamadaInterna(hFontes, "/api/v1/ai/knowledge/sources"),
    chamadaInterna(hFollowups, "/api/v1/ai/followup-flows"),
  ]);

  // `ai/providers` devolve `{ data: { ..., credenciais: [...] , instalacaoTemChave } }`:
  // a lista mora em `data.credenciais`, e a chave da INSTALAÇÃO vem em
  // `instalacaoTemChave` (o mesmo booleano que a tela de Credenciais usa para
  // dizer "o atendimento usa a chave que veio na instalação").
  const corpoProvedores = corpoOk(respProvedores);
  const provedoresIA: LeituraDeVerificacao["provedoresIA"] = (
    extrairDados(corpoProvedores, "credenciais") ?? []
  ).map((c: unknown) => {
    const x = c as CredencialBruta;
    return {
      id: x.id ?? "",
      provider: x.provider ?? "",
      label: x.label ?? "",
      validated_at: x.validated_at ?? null,
      is_active: x.is_active ?? true,
    };
  });
  const instalacaoTemChave = dadosDe(corpoProvedores)?.instalacaoTemChave === true;

  const canaisWhatsApp: LeituraDeVerificacao["canaisWhatsApp"] = (
    extrairDados(corpoOk(respCanais)) ?? []
  ).map((c: unknown) => {
    const x = c as CanalBruto;
    // O campo real é `phone_number` (CHANNEL_COLUMNS em channel-sessions): `numero`
    // nunca existiu e a leitura saía sempre vazia.
    return { id: x.id ?? "", status: x.status ?? "", numero: x.phone_number ?? "" };
  });

  const funis: LeituraDeVerificacao["funis"] = (
    extrairDados(corpoOk(respPipelines)) ?? []
  ).map((f: unknown) => {
    const x = f as FunilBruto;
    return { id: x.id ?? "", name: x.name ?? "" };
  });

  const agentes: LeituraDeVerificacao["agentes"] = (
    extrairDados(corpoOk(respAgentes)) ?? []
  ).map((a: unknown) => {
    const x = a as AgenteBruto;
    return {
      id: x.id ?? "",
      name: x.name ?? "",
      is_active: x.is_active ?? false,
      paused_at: x.paused_at ?? null,
      archived_at: x.archived_at ?? null,
      published_version_id: x.published_version_id ?? null,
      // O join real da listagem é `versao_publicada:ai_agent_versions!fk(provider, model)`
      // (AGENT_COLUMNS_COM_VERSAO em ai/agents) — NÃO `versao`, e sem
      // `credential_id`. Ler a chave errada deixava `versao_publicada` nula.
      versao_publicada:
        x.versao_publicada !== null && typeof x.versao_publicada === "object"
          ? {
              provider: x.versao_publicada.provider ?? "",
              model: x.versao_publicada.model ?? "",
              credential_id: x.versao_publicada.credential_id ?? null,
            }
          : null,
    };
  });

  // `ai/routers` devolve `{ data: { routers: [...] } }`.
  const roteadores: LeituraDeVerificacao["roteadores"] = (
    extrairDados(corpoOk(respRoteadores), "routers") ?? []
  ).map((r: unknown) => {
    const x = r as RoteadorBruto;
    return {
      id: x.id ?? "",
      name: x.name ?? "",
      is_active: x.is_active ?? false,
      channel_session_id: x.channel_session_id ?? null,
      fallback_agent_id: x.fallback_agent_id ?? null,
    };
  });

  const fontesConhecimento: LeituraDeVerificacao["fontesConhecimento"] = (
    extrairDados(corpoOk(respFontes)) ?? []
  ).map((f: unknown) => {
    const x = f as FonteBruta;
    return { id: x.id ?? "", name: x.name ?? "", source_type: x.source_type ?? "" };
  });

  const followups: LeituraDeVerificacao["followups"] = (
    extrairDados(corpoOk(respFollowups)) ?? []
  ).map((f: unknown) => {
    const x = f as FollowupBruto;
    return { id: x.id ?? "", name: x.name ?? "", status: x.status ?? "" };
  });

  // Etapas: chama cada pipeline. Se não houver pipelines, fica vazio.
  const etapasDoFunil: LeituraDeVerificacao["etapasDoFunil"] = [];
  for (const f of funis) {
    try {
      const resp = await chamadaInterna(hPipelines, `/api/v1/pipelines/${f.id}/stages`);
      const dados = extrairDados(corpoOk(resp)) ?? [];
      for (const e of dados) {
        const x = e as EtapaBruta;
        etapasDoFunil.push({ id: x.id ?? "", name: x.name ?? "", pipeline_id: f.id });
      }
    } catch {
      // Falha ao ler etapas de um pipeline específico: ignora, não trava a auditoria.
    }
  }

  return {
    provedoresIA,
    // Sem chave da instalação e sem credencial validada, a IA não responde —
    // a lista de credenciais vazia só é "sem chave" quando este booleano é falso.
    instalacaoTemChave,
    canaisWhatsApp,
    funis,
    etapasDoFunil,
    agentes,
    roteadores,
    fontesConhecimento,
    followups,
  };
}

/** POST — roda a auditoria, grava o retrato, devolve { snapshot, anterior }. */
export async function POST(_req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "assistente_auditoria" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  // Rate limit: 1 rodada por organização a cada 60 s.
  const supabase = await createClient();
  const { data: ultima } = await supabase
    .from("config_snapshots")
    .select("taken_at")
    .eq("organization_id", orgId)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultima?.taken_at) {
    const desdeUltimo = Date.now() - new Date(ultima.taken_at).getTime();
    if (desdeUltimo < INTERVALO_MINIMO_MS) {
      return fail(
        "too_many_requests",
        t("Aguardar antes de rodar a auditoria novamente (máximo 1 por minuto)."),
        409,
        { requestId },
      );
    }
  }

  // Lê todas as rotas internas.
  const leitura = await lerTudo(orgId);

  // Calcula o estado puro.
  const { itens, pendencias } = calcularAuditoria(t, leitura);

  // Retrato: lista de { id, estado, titulo, por_que, ferramenta, depende_de }.
  const retrato = itens.map((i) => ({
    id: i.id,
    estado: i.estado,
    titulo: i.titulo,
    por_que: i.por_que,
    ferramenta: i.ferramenta,
    depende_de: i.depende_de,
    onde_resolver: i.onde_resolver,
  }));

  // Resultado puro: contagem por estado.
  const contagemPorEstado: Record<string, number> = {};
  for (const i of itens) {
    contagemPorEstado[i.estado] = (contagemPorEstado[i.estado] ?? 0) + 1;
  }

  // O retrato anterior (para mostrar evolução na tela).
  const { data: anterior } = await supabase
    .from("config_snapshots")
    .select("id, resultado, pendencias, taken_at")
    .eq("organization_id", orgId)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Grava o novo retrato.
  const { data: criada, error } = await supabase
    .from("config_snapshots")
    .insert({
      organization_id: orgId,
      taken_by: userId,
      resultado: { itens: retrato, contagem_por_estado: contagemPorEstado },
      pendencias,
    })
    .select("id, taken_at, resultado, pendencias")
    .single();

  if (error || !criada) {
    return fail("internal_error", t("Não consegui gravar o retrato da auditoria."), 500, {
      requestId,
    });
  }

  // Audita: SÓ pendencias e contagem por estado, nunca texto livre.
  await audit({
    action: "assistente.auditoria_rodada",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "config_snapshots",
    resourceId: criada.id,
    metadata: {
      pendencias,
      contagem_por_estado: contagemPorEstado,
    },
    requestId,
  });

  const snapshot = {
    id: criada.id,
    taken_at: criada.taken_at,
    itens: retrato,
    pendencias,
    contagem_por_estado: contagemPorEstado,
  };

  const anteriorLimpio = anterior
    ? {
        id: (anterior as { id?: unknown }).id ?? "",
        taken_at: (anterior as { taken_at?: unknown }).taken_at ?? "",
        pendencias: (anterior as { pendencias?: number }).pendencias ?? 0,
        contagem_por_estado:
          (anterior as { resultado?: { contagem_por_estado?: Record<string, number> } }).resultado
            ?.contagem_por_estado ?? {},
      }
    : null;

  return ok(
    { snapshot, anterior: anteriorLimpio },
    { status: 201, requestId },
  );
}

/** GET — últimos N retratos da organização da sessão. */
export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "assistente_auditoria" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const parsed = z
    .strictObject({ limit: z.coerce.number().int().min(1).max(LIMITE_MAXIMO_PAGINA).default(10) })
    .safeParse(Object.fromEntries(new URL(_req.url).searchParams));
  if (!parsed.success) {
    return fail("validation_failed", t("Consulta inválida."), 422, {
      requestId,
      details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const { limit } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("config_snapshots")
    .select("id, taken_at, pendencias, resultado")
    .eq("organization_id", orgId)
    .order("taken_at", { ascending: false })
    .limit(limit);

  if (error) {
    return fail("internal_error", t("Não consegui listar os retratos."), 500, { requestId });
  }

  const retratos = (data ?? []).map((linha) => ({
    id: linha.id,
    taken_at: linha.taken_at,
    pendencias: linha.pendencias,
    itens:
      (linha.resultado as { itens?: unknown[] } | null)?.itens ??
      (Array.isArray(linha.resultado) ? linha.resultado : []),
  }));

  return ok(retratos, { requestId });
}
