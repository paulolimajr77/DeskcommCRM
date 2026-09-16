/**
 * O SINO CONTA O QUE NINGUÉM OLHOU — E O ACERVO NÃO SOME DA CENTRAL.
 *
 * Migration 0275 deu `seen_at` a `agent_inbox_items`. A regra de negócio (a
 * rota some duas contagens distintas, `open_count` e `unseen_count`) já tem
 * cobertura própria e SABOTADA em `app/api/v1/ai/inbox/route.test.ts`. Este
 * arquivo prova a metade que falta: a FIAÇÃO — o sino lê o campo certo do
 * corpo da resposta, e a Central não escondeu nada ao ganhar essa noção.
 *
 * ─── A régua de aceite da spec, ao contrário ────────────────────────────────
 *
 * "Um aviso critical novo tem de ser distinguível de oito antigos SEM abrir a
 * Central" é o caso 1. O CONTROLE (caso 2) é a metade que a régua não diz em
 * voz alta: esconder o acervo NÃO é o conserto — a Central continua mostrando
 * os nove, visto ou não, porque o acervo é útil ali e só é ruído no sino.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "user-1", is_platform_admin: false, support: null },
    activeOrg: { orgId: "org-1", name: "Clínica", role: "agent" },
  }),
  usePermission: () => true,
}));
vi.mock("@/lib/navigation/interface", () => ({
  // A gate de visibilidade do sino não é o que este arquivo mede — sempre
  // libera "/app/ai/inbox" para não confundir "sino escondido pela interface"
  // com "sino contando o número errado".
  destinosDaInterface: () => [{ href: "/app/ai/inbox" }],
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from "@/lib/api/client";
import { AlertsBell } from "@/components/shell/AlertsBell";
import { AgentInboxList } from "@/app/app/ai/inbox/_components/AgentInboxList";
import type { AgentInboxItem } from "@/hooks/ai/useAgentInbox";

const OITO_ANTIGOS_VISTOS: AgentInboxItem[] = Array.from({ length: 8 }, (_, i) => ({
  id: `antigo-${i}`,
  kind: "handoff",
  severity: "info",
  title: `Aviso antigo ${i}`,
  body: null,
  ref_kind: null,
  ref_id: null,
  status: "open",
  created_at: "2026-09-01T10:00:00Z",
  destination: { estado: "indisponivel", orientacao: "" } as AgentInboxItem["destination"],
}));

const UM_CRITICAL_NOVO: AgentInboxItem = {
  id: "novo-1",
  kind: "budget_exceeded",
  severity: "critical",
  title: "Orçamento de IA estourado",
  body: null,
  ref_kind: null,
  ref_id: null,
  status: "open",
  created_at: "2026-09-16T09:00:00Z",
  destination: { estado: "indisponivel", orientacao: "" } as AgentInboxItem["destination"],
};

function montarQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

describe("o sino conta o que ninguém olhou", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("um aviso critical NOVO é distinguível de oito antigos SEM abrir a Central", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        items: [...OITO_ANTIGOS_VISTOS, UM_CRITICAL_NOVO],
        open_count: 9,
        unseen_count: 1,
      },
    } as never);

    const qc = montarQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <AlertsBell />
      </QueryClientProvider>,
    );

    const badge = await screen.findByTestId("alerts-bell-count");
    expect(badge).toHaveTextContent("1");
  });

  it("CONTROLE — o acervo continua inteiro na tela da Central (esconder não é o conserto)", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        items: [...OITO_ANTIGOS_VISTOS, UM_CRITICAL_NOVO],
        open_count: 9,
        unseen_count: 1,
      },
    } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { marked_count: 1 } } as never);

    const qc = montarQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <AgentInboxList canResolve={false} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("inbox-item")).toHaveLength(9);
    });
  });

  it("a Central marca como vistos ao abrir — chama o POST uma vez", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { items: [UM_CRITICAL_NOVO], open_count: 1, unseen_count: 1 },
    } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { marked_count: 1 } } as never);

    const qc = montarQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <AgentInboxList canResolve={false} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/api/v1/ai/inbox/mark-seen", {});
    });
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
