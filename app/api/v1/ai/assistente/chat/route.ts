/**
 * POST /api/v1/ai/assistente/chat — turno de leitura do assistente interno (F1).
 *
 * F1 é determinístico e sem modelo: a pergunta vira resposta por três
 * caminhos — resumo operacional (contas diretas no banco), trecho de guia
 * (`assistente-*` via loadSkills + matchSkills) ou fallback honesto.
 * Escrita SÓ em `config_threads`/`config_messages`, pelo pool de serviço com
 * `organization_id` da sessão em todo statement. Idempotência por `turn_id`
 * (unique parcial), sem `comIdempotencia` — a resposta ficaria copiada em
 * `idempotency_keys`, fora da cascata de LGPD e sem expurgo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { loadSkills, matchSkills } from "@/lib/agent-engine/agent/skills";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const corpoDoPost = z
  .object({
    thread_id: z.string().uuid().optional(),
    turn_id: z.string().uuid(),
    pergunta: z.string().trim().min(3).max(1000),
  })
  .strict();

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function ehResumo(pergunta: string): boolean {
  const n = normalizar(pergunta);
  return (
    n.includes("resumo") || (n.includes("quant") && (n.includes("abert") || n.includes("conversa") || n.includes("lead")))
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const authz = await requireRole("agent", { requestId, resource: "assistente" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

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
  const { thread_id, turn_id, pergunta } = parsed.data;
  const pool = getRequestPool();

  let threadId: string;
  if (thread_id !== undefined) {
    const { rows } = await pool.query<{ id: string }>(
      "select id from public.config_threads where id = $1 and organization_id = $2",
      [thread_id, orgId],
    );
    if (rows.length === 0) {
      return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
    }
    threadId = thread_id;
  } else {
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.config_threads (organization_id, kind, created_by)
       values ($1, 'leitura', $2) returning id`,
      [orgId, authz.user.id],
    );
    threadId = rows[0]!.id;
  }

  try {
    await pool.query(
      `insert into public.config_messages (thread_id, organization_id, turn_id, author_kind, author_user_id, body)
       values ($1, $2, $3, 'human', $4, $5)`,
      [threadId, orgId, turn_id, authz.user.id, pergunta],
    );
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23505") {
      const { rows } = await pool.query<{ author_kind: string; body: string }>(
        `select author_kind, body from public.config_messages
         where organization_id = $1 and thread_id = $2 and turn_id = $3
         order by created_at`,
        [orgId, threadId, turn_id],
      );
      return ok({ thread_id: threadId, turn_id, mensagens: rows, replay: true }, { requestId });
    }
    throw e;
  }

  let resposta: string;
  let fonte: "metrica" | "guia" | "inicial";
  if (ehResumo(pergunta)) {
    const conversas = await pool.query<{ n: string }>(
      `select count(*)::text as n from public.conversations
       where organization_id = $1 and status in ('open','pending','claimed','ai_handling')`,
      [orgId],
    );
    const leads = await pool.query<{ n: string }>(
      "select count(*)::text as n from public.crm_leads where organization_id = $1 and status = 'open'",
      [orgId],
    );
    const funis = await pool.query<{ n: string }>(
      "select count(*)::text as n from public.crm_pipelines where organization_id = $1",
      [orgId],
    );
    resposta = t("Resumo da operação: ") +
      t("{conversas} conversas em atendimento, {leads} negócios abertos em {funis} funis.")
        .replace("{conversas}", conversas.rows[0]?.n ?? "0")
        .replace("{leads}", leads.rows[0]?.n ?? "0")
        .replace("{funis}", funis.rows[0]?.n ?? "0");
    fonte = "metrica";
  } else {
    const skills = (await loadSkills(pool, orgId)).filter((s) => s.name.startsWith("assistente-"));
    const { matched } = matchSkills(skills, pergunta);
    if (matched.length > 0) {
      const guia = matched[0]!;
      resposta = `${guia.description}\n\n${guia.body.slice(0, 1200)}`;
      fonte = "guia";
    } else {
      resposta = t(
        "Ainda estou aprendendo a responder isso. Na F1 eu respondo resumos da operação e trechos dos guias — a conversa com IA chega na F2.",
      );
      fonte = "inicial";
    }
  }

  await pool.query(
    `insert into public.config_messages (thread_id, organization_id, turn_id, author_kind, body)
     values ($1, $2, $3, 'ai', $4)`,
    [threadId, orgId, turn_id, resposta],
  );
  await pool.query("update public.config_threads set last_message_at = now() where id = $1 and organization_id = $2", [
    threadId,
    orgId,
  ]);

  await audit({
    action: "ai.assistente_asked",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "config_thread",
    resourceId: threadId,
    metadata: { turn_id, fonte },
    requestId,
  });

  return ok({ thread_id: threadId, turn_id, resposta, fonte, replay: false }, { requestId });
}
