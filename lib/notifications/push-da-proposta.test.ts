// lib/notifications/push-da-proposta.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const enviarPushAoUsuario = vi.hoisted(() => vi.fn(async () => ({ sent: 1, gone: 0 })));
const createAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/vapid", () => ({ vapidPronto: () => true }));
vi.mock("./web_push", () => ({ enviarPushAoUsuario, enviarPushDaOrg: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: vi.fn(async () => ({ nome: "X" })) }));

import { webPushInboundHandler } from "./push.handler";

const ORG = "org-1";

function mundo(opts: {
  proposta?: { titulo: string; lead_id: string | null; status: string } | null;
  dono?: string | null;
  membros?: Array<{ user_id: string; role: string }>;
}) {
  createAdminClient.mockReturnValue({
    from: (tabela: string) => {
      const cadeia: Record<string, unknown> = {};
      cadeia.select = () => cadeia;
      cadeia.eq = () => cadeia;
      cadeia.is = async () => ({ data: tabela === "user_organizations" ? opts.membros ?? [] : [], error: null });
      cadeia.maybeSingle = async () => {
        if (tabela === "crm_proposals") return { data: opts.proposta === undefined ? { titulo: "Site", lead_id: "lead-1", status: "rascunho" } : opts.proposta };
        if (tabela === "crm_leads") return { data: { title: "Negócio", owner_user_id: opts.dono ?? null, pipeline_id: null } };
        return { data: null };
      };
      return cadeia;
    },
  });
}

function evento() {
  return {
    id: "e1",
    organization_id: ORG,
    event_type: "proposal.ready_for_review",
    entity_kind: "proposal",
    entity_id: "prop-1",
    payload: { proposal_id: "prop-1", lead_id: "lead-1" },
    metadata: {},
    consumed_by: [],
    attempts: 0,
  };
}

beforeEach(() => {
  enviarPushAoUsuario.mockClear();
});

describe("notificação de proposta pronta para revisão", () => {
  it("o consumidor declara o evento (a cerca de eventos depende disto)", () => {
    expect(webPushInboundHandler.events).toContain("proposal.ready_for_review");
  });

  it("dono do negócio é gestor: só ele recebe, com link para a proposta", async () => {
    mundo({ dono: "u-dono", membros: [{ user_id: "u-dono", role: "manager" }, { user_id: "u-admin", role: "admin" }] });
    const r = await webPushInboundHandler.handle(evento() as never);
    expect(r.status).toBe("ok");
    expect(enviarPushAoUsuario).toHaveBeenCalledTimes(1);
    expect(enviarPushAoUsuario).toHaveBeenCalledWith(
      ORG,
      "u-dono",
      expect.objectContaining({ href: "/app/proposals/prop-1", tag: "proposal-review:prop-1" }),
    );
  });

  it("dono do negócio é agent: vão os gestores", async () => {
    mundo({ dono: "u-agente", membros: [{ user_id: "u-agente", role: "agent" }, { user_id: "u-g1", role: "manager" }, { user_id: "u-g2", role: "admin" }] });
    await webPushInboundHandler.handle(evento() as never);
    expect(enviarPushAoUsuario.mock.calls.map((c) => c.at(1))).toEqual(["u-g1", "u-g2"]);
  });

  it("organização sem gestor ativo: pula sem erro", async () => {
    mundo({ membros: [{ user_id: "u-agente", role: "agent" }] });
    const r = await webPushInboundHandler.handle(evento() as never);
    expect(r).toMatchObject({ status: "skipped", detail: "sem_destinatario" });
  });

  it("proposta que já saiu de rascunho: pula", async () => {
    mundo({ proposta: { titulo: "Site", lead_id: "lead-1", status: "enviada" }, membros: [{ user_id: "u-g1", role: "manager" }] });
    const r = await webPushInboundHandler.handle(evento() as never);
    expect(r).toMatchObject({ status: "skipped", detail: "proposta_fora_de_rascunho" });
    expect(enviarPushAoUsuario).not.toHaveBeenCalled();
  });

  it("a constante do consumidor é a mesma do emissor", async () => {
    const { EVENTO_PROPOSTA_PRONTA_PARA_REVISAO } = await import("@/lib/propostas/aviso-de-revisao");
    expect(webPushInboundHandler.events).toContain(EVENTO_PROPOSTA_PRONTA_PARA_REVISAO);
  });
});
