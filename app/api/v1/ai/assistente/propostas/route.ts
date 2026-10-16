/**
 * POST /api/v1/ai/assistente/propostas — o assistente PROPÕE uma mudança ao vivo
 * (F2b, T19). Grava UMA linha `pendente` em `config_proposals` (1 proposta = 1
 * artefato) e nada mais: propor não cria, não altera e não apaga nada no negócio.
 * Quem aplica é a T20, depois do clique de aprovar do administrador (GET e as
 * ações `aprovar`/`aplicar`/`rejeitar` entram lá).
 *
 * ## O que a ordem das linhas garante
 *
 *  1. `requireSupportWrite()` ANTES de qualquer efeito (gate
 *     `suporte-cobertura-de-efeitos`). É guarda de efeito, não de papel.
 *  2. `requireRole("admin")` — papel DA SESSÃO. manager/agent/viewer recebem 403.
 *  3. O corpo passa por `lib/assistente/propostas/payload.ts` (Zod estrito por
 *     tipo e operação). Chave de destino (`rota`, `url`, `path`, `method`,
 *     `metodo`) em qualquer nível do `payload` é recusada: o destino é do
 *     código (`operacoes.ts`), nunca do dado.
 *  4. O INSERT usa o cliente da SESSÃO (`createClient`), nunca o de serviço: é a
 *     RLS da 0690 que prende `requested_by = auth.uid()`, `status = 'pendente'`
 *     e o papel admin. `organization_id` sai da sessão; se vier no corpo, o
 *     esquema estrito recusa. O `risk` sai do código, por tipo.
 *  5. Reenvio do mesmo turno não duplica: o índice único parcial
 *     `(organization_id, turn_id, kind)` responde 23505 e a rota devolve a
 *     proposta que já existe (200), sem novo audit.
 *  6. `audit()` leva só `kind`, `operacao` e `risk` — nunca o texto do payload.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { destinoDaOperacao, riscoDoTipo } from "@/lib/assistente/propostas/operacoes";
import { esquemaDoCorpoDaProposta, temChaveDeDestino } from "@/lib/assistente/propostas/payload";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const COLUNAS_DA_RESPOSTA = "id, kind, risk, status, resumo, expires_at, payload";

interface LinhaDaProposta {
  id: string;
  kind: string;
  risk: string;
  status: string;
  resumo: string;
  expires_at: string;
  payload: { operacao?: unknown } | null;
}

/** A resposta pública: nunca devolve o payload, só a operação que ele carrega. */
function dadosDaResposta(linha: LinhaDaProposta) {
  return {
    id: linha.id,
    kind: linha.kind,
    operacao: typeof linha.payload?.operacao === "string" ? linha.payload.operacao : null,
    risk: linha.risk,
    status: linha.status,
    resumo: linha.resumo,
    expires_at: linha.expires_at,
  };
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "assistente_propostas" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return fail("invalid_request", t("Corpo inválido."), 400, { requestId });
  }

  // Mensagem própria para o erro mais perigoso: o dado tentando escolher o destino.
  const payloadBruto = bruto !== null && typeof bruto === "object" ? (bruto as { payload?: unknown }).payload : undefined;
  const destino = temChaveDeDestino(payloadBruto);
  if (destino !== null) {
    return fail("validation_failed", t("O conteúdo da proposta não pode escolher o destino."), 422, {
      requestId,
      details: [{ path: destino, message: "chave de destino não permitida" }],
    });
  }

  const parsed = esquemaDoCorpoDaProposta.safeParse(bruto);
  if (!parsed.success) {
    return fail("validation_failed", t("Proposta inválida."), 422, {
      requestId,
      details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const proposta = parsed.data;
  // Defesa em profundidade: o esquema já amarra a operação ao tipo, mas o mapa
  // de destinos é o que a T20 vai ler — sem destino, a proposta nunca poderia ser aplicada.
  if (destinoDaOperacao(proposta.kind, proposta.payload.operacao) === null) {
    return fail("validation_failed", t("Proposta inválida."), 422, { requestId });
  }

  // A sessão da pessoa (RLS vale) — nunca o cliente de serviço.
  const supabase = await createClient();

  // O vínculo com a conversa só vale se a conversa for desta organização:
  // a FK sozinha aceitaria o id de uma conversa de outra empresa.
  if (proposta.thread_id !== undefined) {
    const { data: conversa, error: erroDaConversa } = await supabase
      .from("config_threads")
      .select("id")
      .eq("id", proposta.thread_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (erroDaConversa) {
      return fail("internal_error", t("Não consegui gravar a proposta."), 500, { requestId });
    }
    if (!conversa) {
      return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
    }
  }

  const { data: criada, error } = await supabase
    .from("config_proposals")
    .insert({
      organization_id: orgId,
      thread_id: proposta.thread_id ?? null,
      turn_id: proposta.turn_id ?? null,
      kind: proposta.kind,
      risk: riscoDoTipo(proposta.kind),
      resumo: proposta.resumo,
      motivo: proposta.motivo,
      antes: proposta.antes ?? null,
      payload: proposta.payload,
      status: "pendente",
      requested_by: userId,
    })
    .select(COLUNAS_DA_RESPOSTA)
    .single();

  if (error || !criada) {
    // Reenvio do mesmo turno: devolve a que já existe, sem duplicar e sem novo audit.
    if (error?.code === "23505" && proposta.turn_id !== undefined) {
      const { data: existente } = await supabase
        .from("config_proposals")
        .select(COLUNAS_DA_RESPOSTA)
        .eq("organization_id", orgId)
        .eq("turn_id", proposta.turn_id)
        .eq("kind", proposta.kind)
        .maybeSingle();
      if (existente) return ok(dadosDaResposta(existente as LinhaDaProposta), { requestId });
    }
    return fail("internal_error", t("Não consegui gravar a proposta."), 500, { requestId });
  }

  const linha = criada as LinhaDaProposta;
  // SEM o texto do payload: `api_audit_log` é append-only e não sai pela cascata de LGPD.
  await audit({
    action: "assistente.proposta_criada",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "config_proposals",
    resourceId: linha.id,
    metadata: {
      kind: proposta.kind,
      operacao: proposta.payload.operacao,
      risk: linha.risk,
    },
    requestId,
  });

  return ok(dadosDaResposta(linha), { status: 201, requestId });
}
