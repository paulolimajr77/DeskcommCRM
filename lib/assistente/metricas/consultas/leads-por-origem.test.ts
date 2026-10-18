/**
 * Consultas de `leads_por_origem` — janela [deInstante, ateInstanteExclusivo).
 */
import { describe, expect, it } from "vitest";

import { criarBancoFalso } from "./banco-falso";
import { lerLeadsPorOrigem } from "./leads-por-origem";
import { resolverPeriodo } from "@/lib/assistente/metricas/periodo";

const ORG = "00000000-0000-0000-0000-000000000099";
const JANELA = resolverPeriodo({ tipo: "semana_passada" }, "2026-10-14T09:00:00-03:00", "America/Sao_Paulo", "pt-BR");

describe("lerLeadsPorOrigem", () => {
  it("grupo por origem, quantidade e status atual", async () => {
    const banco = criarBancoFalso({
      crm_leads: [
        { organization_id: ORG, source: "Site", created_at: "2026-10-06", status: "won" },
        { organization_id: ORG, source: "Site", created_at: "2026-10-07", status: "open" },
        { organization_id: ORG, source: "Indicação", created_at: "2026-10-08", status: "lost" },
        { organization_id: ORG, source: null, created_at: "2026-10-09", status: "open" },
      ],
    });
    const r = await lerLeadsPorOrigem(banco.client, ORG, JANELA);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("ok");
    const site = r.dados.origens.find((o) => o.origem === "site");
    expect(site).toBeDefined();
    expect(site?.criados).toBe(2);
  });
  it("origem __proto__ vira linha normal, sem tocar protótipo", async () => {
    const banco = criarBancoFalso({
      crm_leads: [
        { organization_id: ORG, source: "__proto__", created_at: "2026-10-06", status: "won" },
      ],
    });
    const r = await lerLeadsPorOrigem(banco.client, ORG, JANELA);
    if (!r.ok) throw new Error("ok");
    expect(r.dados.origens.length).toBe(1);
  });
  it("erro de leitura → ok:false", async () => {
    const banco = criarBancoFalso({ crm_leads: [] }, "crm_leads");
    const r = await lerLeadsPorOrigem(banco.client, ORG, JANELA);
    expect(r.ok).toBe(false);
  });
  it("2300 negócios: o falso registra 3 páginas e o total exato sai inteiro (sem truncar)", async () => {
    const muitos = [];
    for (let i = 0; i < 2300; i += 1) {
      muitos.push({ organization_id: ORG, source: "site", created_at: "2026-10-07", status: "open" });
    }
    const banco = criarBancoFalso({ crm_leads: muitos });
    const r = await lerLeadsPorOrigem(banco.client, ORG, JANELA);
    if (!r.ok) throw new Error("ok");
    expect(r.dados.total_criados).toBe(2300);
    expect(r.dados.truncado).toBe(false);
    const faixas = banco.consultas.filter((c) => c.tabela === "crm_leads").flatMap((c) => c.faixas);
    expect(faixas.length).toBe(3);
  });
});
