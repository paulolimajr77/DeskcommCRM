import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * Épico Operação Visível (F1) — marca como VISTOS todos os avisos abertos da org.
 *
 * POST sem corpo. A Central precisa distinguir "aberto" de "aberto e ninguém
 * olhou": sem isso, o sino do header conta ACERVO (`status='open'`), e oito
 * avisos antigos mais um crítico novo produzem o mesmo número de ontem — quem
 * olha aprende a não olhar.
 *
 * ─── O defeito, e por que esta entrega é PREVENÇÃO ─────────────────────────
 *
 * Medido: a Central desta organização tem ZERO avisos abertos hoje. Isto não
 * conserta um incidente — impede o modo de falha clássico de contador de
 * acervo: quando o número deixa de mudar, o olho deixa de ir até ele. O sino
 * passa a contar `status='open' and seen_at is null` (migration 0275), e QUEM
 * grava `seen_at` é esta rota.
 *
 * ⚠️ Ela é chamada PELA CENTRAL, ao abrir a tela — nunca pelo sino. O sino só
 * LÊ (`useAgentInbox`); quem marca como visto é quem de fato olhou a lista.
 * Marcar no sino transformaria o ato de passar o olho no header em "vi tudo",
 * que é o oposto do que a coluna existe para guardar.
 *
 * ─── Por que não há Zod aqui, se a doutrina manda validar todo input ───────
 *
 * Porque NÃO HÁ input externo. Não há corpo lido, não há query, não há
 * parâmetro de rota: a organização vem do cookie validado contra as
 * memberships (`requireRole` → `resolveActiveOrg`) e o ator vem do JWT
 * (`getUser`). O único predicado do `update` — a própria org, `status='open'`
 * e `seen_at is null` — é resolvido no servidor. Um `z.object({}).strict()`
 * sobre um corpo que ninguém lê validaria nada e criaria um modo de falha
 * novo. Se um dia esta rota aceitar um recorte (um `kind`, uma faixa de data),
 * ele nasce com Zod.
 *
 * ─── O audit não leva resource_id, e isso é o conserto de um bug ──────────
 *
 * `api_audit_log.resource_id` é `uuid`. Um rótulo como `"bulk"` ali devolve
 * `invalid input syntax for type uuid`, e como o audit é fire-and-forget a
 * mutação segue verde enquanto a trilha some — exatamente o modo de falha que
 * o cabeçalho de `lib/audit/index.ts` documenta, e que
 * `tests/unit/audit-resource-id-e-uuid` reprova. O lote não tem UM recurso: o
 * campo vai nulo e a contagem vai no metadata, o mesmo desenho de
 * `app/api/v1/leads/bulk/route.ts`.
 *
 * Rodada sem efeito (nenhum aviso novo para marcar) não audita: não houve
 * mutação, e auditar o vazio é a mesma poluição que a doutrina já barrou nos
 * crons. Numa aba deixada aberta com polling de 60s, o caso é COMUM — o
 * `seen_at` só é escrito uma vez por item, e a partir da segunda rodada o
 * update devolve zero linhas.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();

  // Mesmo piso da leitura e do aviso avulso (`agent` — spec 13 §4, viewer é
  // read-only). Marcar visto não é mais largo que resolver: não apaga nada,
  // reabrir continua permitido, e a linha vista segue visível na aba
  // "Abertos" — só sai da contagem do sino.
  const authz = await requireRole("agent", { requestId, resource: "agent_inbox_items" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user: authUser, org } = authz;

  // Service role bypassa RLS: o filtro por organização é EXPLÍCITO e vem da org
  // ativa resolvida do cookie, nunca do corpo. Sem ele o update alcançaria os
  // avisos de todos os tenants da instalação.
  //
  // ⚠️ `is("seen_at", null)` é a diferença que separa esta rota de virar um
  // `resolve-all` de `seen_at`: sem ele, reabrir a Central sobrescreveria o
  // `seen_at` de um item visto há uma semana com "agora", e a única informação
  // que a coluna guarda — QUANDO alguém olhou pela primeira vez — se perderia
  // toda vez que a tela recarrega.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_inbox_items")
    .update({ seen_at: new Date().toISOString() })
    .eq("organization_id", org.orgId)
    .eq("status", "open")
    .is("seen_at", null)
    .select("id");
  if (error) {
    return fail("internal_error", t("Falha ao marcar os avisos como vistos."), 500, { requestId });
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    await audit({
      action: "ai.inbox_items_marked_seen",
      actorUserId: authUser.id,
      organizationId: org.orgId,
      resourceType: "agent_inbox_items",
      resourceId: null,
      requestId,
      metadata: { count },
    });
  }

  return ok({ marked_count: count }, { requestId });
}
