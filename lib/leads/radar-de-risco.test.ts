// lib/leads/radar-de-risco.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { carregaRadarDeRisco } from "./radar-de-risco";

interface LinhaDeProposta {
  id: string;
  lead_id: string | null;
  status: string;
  numero: number | null;
  ano: number | null;
  valid_until: string | null;
  versao: number;
  created_at: string;
}

const ORG_ID = "22222222-2222-4222-8222-222222222222";

function montarAdmin(propostas: LinhaDeProposta[]) {
  const chamadas: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = {
    from: vi.fn((tabela: string) => {
      const filtros: Array<[string, unknown]> = [];
      chamadas.push({ tabela, filtros });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cadeia: any = {
        select: () => cadeia,
        eq: (campo: string, valor: unknown) => {
          filtros.push([campo, valor]);
          return cadeia;
        },
        not: (campo: string, op: string, valor: unknown) => {
          filtros.push([`not:${campo}:${op}`, valor]);
          return cadeia;
        },
        order: () => cadeia,
        limit: () => cadeia,
        is: () => cadeia,
        in: () => cadeia,
        gt: () => cadeia,
        then: (resolve: (r: { data: unknown[]; error: null }) => void) => {
          if (tabela === "crm_proposals") return resolve({ data: [...propostas], error: null });
          return resolve({ data: [], error: null });
        },
      };
      return cadeia;
    }),
  };
  return { admin, chamadas };
}

describe("carregaRadarDeRisco — propostas vencidas sem retomada (N3)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("negócio com proposta VENCIDA e SEM proposta mais nova: entra em propostas_vencidas_sem_retomada", async () => {
    const { admin } = montarAdmin([
      { id: "prop-1", lead_id: "lead-1", status: "vencida", numero: 1, ano: 2026, valid_until: "2026-01-01", versao: 1, created_at: "2026-01-01T00:00:00Z" },
    ]);
    const radar = await carregaRadarDeRisco(admin, { organizationId: ORG_ID });
    expect(radar.propostas_vencidas_sem_retomada.map((p) => p.lead_id)).toContain("lead-1");
    expect(radar.propostas_vencidas_sem_retomada[0]).toMatchObject({ proposal_id: "prop-1", numero: 1, ano: 2026 });
  });

  it("negócio com proposta vencida MAS já tem proposta mais nova enviada/aceita: NÃO entra (Review Focus 2)", async () => {
    const { admin } = montarAdmin([
      { id: "prop-v1", lead_id: "lead-1", status: "vencida", numero: 1, ano: 2026, valid_until: "2026-01-01", versao: 1, created_at: "2026-01-01T00:00:00Z" },
      { id: "prop-v2", lead_id: "lead-1", status: "enviada", numero: 1, ano: 2026, valid_until: "2026-06-01", versao: 2, created_at: "2026-02-01T00:00:00Z" },
    ]);
    const radar = await carregaRadarDeRisco(admin, { organizationId: ORG_ID });
    expect(radar.propostas_vencidas_sem_retomada.map((p) => p.lead_id)).not.toContain("lead-1");
  });

  it("todas as consultas filtram organization_id (isolamento)", async () => {
    const { admin, chamadas } = montarAdmin([]);
    await carregaRadarDeRisco(admin, { organizationId: ORG_ID });
    const dePropostas = chamadas.filter((c) => c.tabela === "crm_proposals");
    expect(dePropostas.length).toBeGreaterThan(0);
    for (const c of dePropostas) {
      expect(c.filtros).toContainEqual(["organization_id", ORG_ID]);
    }
  });
});
