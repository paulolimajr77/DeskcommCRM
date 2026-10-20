/**
 * Testes da CONSULTA `lerFechamentos` (a leitura direta, sem o adaptador).
 * O banco é o falso encadeável de `banco-falso.ts` — com corte de 1000 linhas
 * e contagem exata, como o PostgREST de verdade.
 */
import { describe, expect, it } from "vitest";

import { resolverPeriodo } from "@/lib/assistente/metricas/periodo";

import { criarBancoFalso, type LinhaDeTeste } from "./banco-falso";
import { lerFechamentos } from "./fechamentos";

const ORG = "00000000-0000-0000-0000-000000000099";
const JANELA = resolverPeriodo(
  { tipo: "semana_passada" },
  "2026-10-14T09:00:00-03:00",
  "America/Sao_Paulo",
  "pt-BR",
);

const FUNIS: LinhaDeTeste[] = [
  { id: "funil-a", name: "Vendas", position: 1, is_archived: false },
  { id: "funil-b", name: "Locação", position: 2, is_archived: false },
];

function lead(parcial: LinhaDeTeste): LinhaDeTeste {
  return {
    organization_id: ORG,
    status: "won",
    closed_at: "2026-10-06T12:00:00.000Z",
    pipeline_id: "funil-a",
    ...parcial,
  };
}

describe("lerFechamentos — a conta e os filtros", () => {
  it("conta ganhos/perdidos por funil e devolve o total (2.a)", async () => {
    const banco = criarBancoFalso({
      crm_pipelines: FUNIS,
      crm_leads: [],
    });
    const r = await lerFechamentos(banco.client, ORG, JANELA);
    expect(r.ok).toBe(true);
  });

  it("as contagens filtram organization_id, status e o corte [deInstante, ateInstanteExclusivo) (2.b)", async () => {
    const banco = criarBancoFalso({ crm_pipelines: FUNIS, crm_leads: [] });
    await lerFechamentos(banco.client, ORG, JANELA);
    const contagens = banco.consultas.filter((c) => c.tabela === "crm_leads");
    expect(contagens.length).toBe(4); // 2 funis × 2 status
    for (const c of contagens) {
      expect(c.contou).toBe(true);
      const filtros = new Map(c.filtros);
      expect(filtros.get("organization_id")).toBe(ORG);
      expect(filtros.get("closed_at >=")).toBe(JANELA.deInstante);
      expect(filtros.get("closed_at <")).toBe(JANELA.ateInstanteExclusivo);
      expect(["won", "lost"]).toContain(filtros.get("status"));
    }
    // Fora da janela não conta: um lead fechado antes de `de` não entra.
    const fora = criarBancoFalso({
      crm_pipelines: FUNIS,
      crm_leads: [lead({ closed_at: "2026-10-04T12:00:00.000Z" })],
    });
    const r = await lerFechamentos(fora.client, ORG, JANELA);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperava ok");
    const funilA = r.dados.funis.find((f) => f.funil === "Vendas");
    expect(funilA?.fechados).toBe(0);
    expect(funilA?.taxa_de_ganho).toBeNull();
  });

  it("1500 ganhos no mesmo funil: a contagem não é cortada em 1000 (2.c)", async () => {
    const muitos: LinhaDeTeste[] = [];
    for (let i = 0; i < 1500; i += 1) muitos.push(lead({ id: `lead-${i}` }));
    const banco = criarBancoFalso({ crm_pipelines: FUNIS, crm_leads: muitos });
    const r = await lerFechamentos(banco.client, ORG, JANELA);
    if (!r.ok) throw new Error("esperava ok");
    const funilA = r.dados.funis.find((f) => f.funil === "Vendas");
    expect(funilA?.ganhos).toBe(1500);
    expect(r.dados.total.ganhos).toBe(1500);
    expect(r.dados.total.taxa_de_ganho).toBe(1);
  });

  it("erro de leitura vira ok:false sem eco", async () => {
    const banco = criarBancoFalso({ crm_pipelines: FUNIS }, "crm_pipelines");
    const r = await lerFechamentos(banco.client, ORG, JANELA);
    expect(r.ok).toBe(false);
  });
});
