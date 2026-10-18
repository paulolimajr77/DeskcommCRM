/**
 * POST /api/v1/ai/assistente/transcrever — o áudio do campo do chat vira texto.
 *
 * O texto volta para o CAMPO, para a pessoa conferir e enviar: esta rota não
 * conversa com o assistente nem envia nada.
 *
 * Guardas, nesta ordem:
 *  1. `requireSupportWrite()` — a guarda de efeito do acompanhamento (a chamada
 *     gasta chave de IA da organização);
 *  2. `requireRole("viewer")` — qualquer papel da organização; a organização é a
 *     DA SESSÃO, nunca do corpo;
 *  3. limite por pessoa (e por organização), porque cada chamada é paga;
 *  4. tipo (só áudio) e tamanho (`TAMANHO_MAXIMO_DO_AUDIO`) validados antes de
 *     qualquer chamada.
 *
 * O áudio fica só na memória: não vai para disco, storage nem log. A trilha de
 * auditoria leva a origem e o tamanho, nunca o áudio nem o texto. O custo vira
 * uma linha em `llm_calls` (ponto `transcricao_de_audio`).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { requestTurnDeps } from "@/lib/agent-engine/agent/request-deps";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  MIMES_DE_AUDIO_ACEITOS,
  TAMANHO_MAXIMO_DO_AUDIO,
} from "@/lib/assistente/transcricao/limites";
import { transcreverAudioDoChat } from "@/lib/assistente/transcricao/transcrever";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TETO_POR_USUARIO_POR_MINUTO = 10;
const TETO_POR_ORGANIZACAO_POR_MINUTO = 40;
const JANELA_SEGUNDOS = 60;
/** Folga do envelope multipart sobre o arquivo, para recusar cedo pelo cabeçalho. */
const FOLGA_DO_ENVELOPE = 64 * 1024;

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const authz = await requireRole("viewer", { requestId, resource: "assistente" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  const porPessoa = await checkRateLimit(
    `assistente:transcrever:u:${userId}`,
    TETO_POR_USUARIO_POR_MINUTO,
    JANELA_SEGUNDOS,
  );
  const porOrganizacao = await checkRateLimit(
    `assistente:transcrever:o:${orgId}`,
    TETO_POR_ORGANIZACAO_POR_MINUTO,
    JANELA_SEGUNDOS,
  );
  if (!porPessoa.allowed || !porOrganizacao.allowed) {
    return fail("rate_limited", t("Muitas transcrições seguidas. Tente em um minuto."), 429, {
      requestId,
      headers: { "Retry-After": String(JANELA_SEGUNDOS) },
    });
  }

  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > TAMANHO_MAXIMO_DO_AUDIO + FOLGA_DO_ENVELOPE) {
    return fail("payload_too_large", t("O áudio é grande demais."), 413, { requestId });
  }

  let arquivo: FormDataEntryValue | null;
  try {
    arquivo = (await req.formData()).get("audio");
  } catch {
    return fail("validation_failed", t("Envie o áudio gravado."), 422, { requestId });
  }
  if (arquivo === null || typeof arquivo === "string") {
    return fail("validation_failed", t("Envie o áudio gravado."), 422, { requestId });
  }

  const mime = arquivo.type.split(";")[0]!.trim().toLowerCase();
  if (!MIMES_DE_AUDIO_ACEITOS.includes(mime)) {
    return fail("validation_failed", t("Esse tipo de áudio não é aceito."), 422, { requestId });
  }
  if (arquivo.size > TAMANHO_MAXIMO_DO_AUDIO) {
    return fail("payload_too_large", t("O áudio é grande demais."), 413, { requestId });
  }
  if (arquivo.size === 0) {
    return fail("validation_failed", t("O áudio veio vazio."), 422, { requestId });
  }

  const audio = Buffer.from(await arquivo.arrayBuffer());
  const deps = requestTurnDeps();
  const resultado = await transcreverAudioDoChat({
    pool: getRequestPool(),
    llmCfg: deps.llmCfg,
    admin: createAdminClient(),
    orgId,
    audio,
    mime,
  });

  if (!resultado.ok) {
    switch (resultado.motivo) {
      case "sem_chave":
        return fail(
          "transcription_unavailable",
          t("A transcrição precisa de uma chave da OpenAI em Credenciais."),
          422,
          { requestId },
        );
      case "audio_vazio":
        return fail("validation_failed", t("Não ouvi fala nesse áudio. Tente gravar de novo."), 422, {
          requestId,
        });
      case "destino_recusado":
        return fail(
          "transcription_unavailable",
          t("O serviço de transcrição da instalação não foi aceito como destino. Avise quem administra."),
          422,
          { requestId },
        );
      default:
        return fail("ai_provider_error", t("Não consegui transcrever agora. Tente de novo."), 502, {
          requestId,
        });
    }
  }

  // SEM o áudio e SEM o texto: `api_audit_log` é append-only.
  await audit({
    action: "ai.assistente_transcribed",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "assistente",
    resourceId: null,
    metadata: { bytes: arquivo.size, mime },
    requestId,
  });

  return ok({ texto: resultado.texto }, { requestId });
}
