import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/v1/ai/inbox/[id]/route";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

/**
 * Resolver um aviso `promise_unfulfilled` com `create_task` cria uma
 * `crm_tasks` vinculada ao negócio da conversa, marcada com `source_kind`.
 *
 * `negocioDaConversa` (lib/agent-engine/edge/crm/negocio-da-conversa.ts,
 * citado no brief) NÃO existe no repo — medido antes de escrever este teste
 * (grep vazio em lib/, app/, workers/; a única ocorrência era o próprio plano).
 * Por isso a rota resolve o negócio com uma query equivalente e mais simples,
 * direto no Supabase JS: um contato tem no máximo um negócio "aberto"
 * (`crm_leads.status = 'open'`) — não reimplementa `resolveActiveLeadForContact`
 * (desempate por pipeline default / atividade mais recente), que é regra de
 * ROTEAMENTO de turno, não de "existe um único candidato inequívoco".
 */
const ORG = "11111111-1111-4111-8111-111111111111";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const CONV_ID = "44444444-4444-4444-8444-444444444444";
const CONTACT_ID = "55555555-5555-4555-8555-555555555555";
const LEAD_ID = "66666666-6666-4666-8666-666666666666";

type Negocio = { tipo: "um"; leadId: string } | { tipo: "nenhum" } | { tipo: "varios"; quantos: number };

function montarMundoDeAviso(opts: { kind: string; refKind: string; negocio?: Negocio }) {
  const negocio: Negocio = opts.negocio ?? { tipo: "um", leadId: LEAD_ID };
  const tarefasCriadas: Array<Record<string, unknown>> = [];

  const item = {
    id: ITEM_ID,
    kind: opts.kind,
    ref_kind: opts.refKind,
    ref_id: opts.refKind === "conversation" ? CONV_ID : null,
    status: "open",
  };

  const leadRows =
    negocio.tipo === "um"
      ? [{ id: negocio.leadId }]
      : negocio.tipo === "varios"
        ? Array.from({ length: negocio.quantos }, (_, i) => ({ id: `lead-${i}` }))
        : [];

  const admin = {
    from(table: string) {
      if (table === "agent_inbox_items") {
        const chain = {
          update: () => chain,
          eq: () => chain,
          select: () => chain,
          maybeSingle: async () => ({ data: item, error: null }),
        };
        return chain;
      }
      if (table === "conversations") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: { contact_id: CONTACT_ID }, error: null }),
        };
        return chain;
      }
      if (table === "crm_leads") {
        const chain: {
          select: () => typeof chain;
          eq: () => typeof chain;
          then: (resolve: (v: unknown) => unknown) => unknown;
        } = {
          select: () => chain,
          eq: () => chain,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: leadRows, error: null }).then(resolve),
        };
        return chain;
      }
      if (table === "crm_tasks") {
        const chain = {
          insert: (payload: Record<string, unknown>) => {
            tarefasCriadas.push(payload);
            return chain;
          },
          select: () => chain,
          single: async () => ({ data: { id: "tarefa-nova" }, error: null }),
        };
        return chain;
      }
      throw new Error(`tabela não mockada no teste: ${table}`);
    },
  };

  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG, role: "agent", name: "Org" },
    user: { id: USER_ID },
  } as Awaited<ReturnType<typeof requireRole>>);
  vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

  return {
    orgId: ORG,
    userId: USER_ID,
    leadId: LEAD_ID,
    tarefasCriadas,
    PATCH: (body: unknown) =>
      PATCH(
        new NextRequest(`http://localhost/api/v1/ai/inbox/${ITEM_ID}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: ITEM_ID }) },
      ),
  };
}

describe("PATCH /api/v1/ai/inbox/[id] — create_task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(audit).mockResolvedValue(undefined as never);
  });

  it("com create_task.is_proposal=true, grava crm_tasks com source_kind=promised_proposal", async () => {
    const mundo = montarMundoDeAviso({ kind: "promise_unfulfilled", refKind: "conversation" });

    const res = await mundo.PATCH({
      status: "resolved",
      create_task: {
        title: "Enviar proposta do site institucional",
        due_date: "2026-10-01T12:00:00.000Z",
        assigned_to: mundo.userId,
        is_proposal: true,
      },
    });

    expect(res.status).toBe(200);
    const tarefa = mundo.tarefasCriadas.at(-1);
    expect(tarefa).toBeDefined();
    expect(tarefa?.source_kind).toBe("promised_proposal");
    expect(tarefa?.lead_id).toBe(mundo.leadId);
    expect(tarefa?.due_date).toBe("2026-10-01T12:00:00.000Z");
    expect(tarefa?.organization_id).toBe(mundo.orgId);
  });

  it("sem create_task, continua só mudando o status (compatibilidade)", async () => {
    const mundo = montarMundoDeAviso({ kind: "promise_unfulfilled", refKind: "conversation" });
    const res = await mundo.PATCH({ status: "ack" });
    expect(res.status).toBe(200);
    expect(mundo.tarefasCriadas).toHaveLength(0);
  });

  it("create_task só é aceito para kind=promise_unfulfilled — outro kind é 422", async () => {
    const mundo = montarMundoDeAviso({ kind: "handoff", refKind: "conversation" });
    const res = await mundo.PATCH({
      status: "resolved",
      create_task: { title: "x", due_date: "2026-10-01T12:00:00.000Z", is_proposal: true },
    });
    expect(res.status).toBe(422);
    expect(mundo.tarefasCriadas).toHaveLength(0);
  });

  it("negócio da conversa 'varios' — tarefa nasce sem lead_id, não quebra", async () => {
    const mundo = montarMundoDeAviso({
      kind: "promise_unfulfilled",
      refKind: "conversation",
      negocio: { tipo: "varios", quantos: 2 },
    });
    const res = await mundo.PATCH({
      status: "resolved",
      create_task: { title: "x", due_date: "2026-10-01T12:00:00.000Z", is_proposal: true },
    });
    expect(res.status).toBe(200);
    expect(mundo.tarefasCriadas.at(-1)?.lead_id).toBeNull();
  });
});
