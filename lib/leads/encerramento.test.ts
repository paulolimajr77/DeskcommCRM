import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor, HandlerCtx } from "@/lib/api/handlers/types";
import type { ApiError } from "@/lib/api/types";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/leads/activity-emitter", () => ({
  emitLeadActivity: vi.fn(async () => ({ ok: true })),
}));

import { encerraDemanda } from "./encerramento";

/**
 * FECHAR NEGÓCIO NUMA ETAPA QUE AFIRMA FATO — a MESMA trava que move/create,
 * agora no SÉTIMO escritor de `crm_leads.stage_id`.
 *
 * ─── Por que este arquivo existe ───────────────────────────────────────────
 *
 * `tests/unit/quem-move-card-respeita-a-etapa-que-afirma-fato.test.ts` prova
 * ALCANCE: todo escritor de `stage_id` importa a regra, ou está na allowlist.
 * Alcance não é correção — um `import` sem uso nenhum passaria naquela cerca.
 * Este arquivo prova que `encerraDemanda` (chamado pelas rotas win/lose E pela
 * ferramenta do agente `lib/mcp/tools/retencao.ts`) de fato CONSULTA o
 * veredito antes de escrever, e RECUSA quando ele nega.
 *
 * `encerraDemanda` foi achado pela cerca de AST na primeira execução dela —
 * eu tinha varrido o repositório à mão e perdido este arquivo: o objeto do
 * `.update()` é montado nove linhas antes, por identificador (`patch`), e
 * minha sonda por proximidade textual não resolvia isso.
 */

const ORG = "org-1";
const LEAD = "lead-1";
const PIPE = "pipe-1";
const STAGE_TERMINAL = "stage-terminal";

function ctx(actor: Actor): HandlerCtx {
  return { organization_id: ORG, actor, requestId: "req-1" };
}

interface Mundo {
  client: unknown;
  updatesDeCrmLeads: Array<{ patch: Record<string, unknown>; filtros: Array<[string, unknown]> }>;
}

/**
 * Dublê do Supabase que responde por TABELA e registra os `update`s de
 * `crm_leads` — é o que prova "o card não se moveu" quando a regra recusa.
 */
function montar(opts: { afirmaFato: boolean }): Mundo {
  const updatesDeCrmLeads: Mundo["updatesDeCrmLeads"] = [];

  function builder(table: string) {
    let modo: "select" | "update" = "select";
    let patchUpdate: Record<string, unknown> = {};
    const filtros: Array<[string, unknown]> = [];

    const enc: Record<string, unknown> = {};
    enc.select = () => enc;
    enc.update = (patch: Record<string, unknown>) => {
      modo = "update";
      patchUpdate = patch;
      return enc;
    };
    enc.eq = (col: string, val: unknown) => {
      filtros.push([col, val]);
      return enc;
    };
    enc.order = () => enc;
    enc.limit = () => enc;

    // O UPDATE real do módulo não chama `.maybeSingle()` — é awaited direto
    // (`await supabase.from(...).update(patch).eq(...).eq(...)`), então quem
    // resolve a Promise é `.then()`, não `.maybeSingle()`. Sem isto o double
    // nunca registra a escrita, e os dois casos que esperam `length === 1`
    // ficam vermelhos por defeito do DUBLÊ, não da regra.
    enc.then = (resolve: (v: unknown) => unknown) => {
      if (modo === "update") {
        updatesDeCrmLeads.push({ patch: patchUpdate, filtros: [...filtros] });
      }
      return Promise.resolve(resolve({ data: null, error: null }));
    };

    enc.maybeSingle = async () => {
      if (modo === "update") {
        updatesDeCrmLeads.push({ patch: patchUpdate, filtros: [...filtros] });
        return { data: null, error: null };
      }
      if (table === "crm_leads") {
        // A mesma linha serve para a leitura inicial e para o `fresh` do fim —
        // nenhum dos dois casos deste arquivo depende do valor pós-escrita.
        return {
          data: {
            id: LEAD,
            organization_id: ORG,
            pipeline_id: PIPE,
            status: "open",
          },
          error: null,
        };
      }
      if (table === "crm_stages") {
        return {
          data: { id: STAGE_TERMINAL, name: "Pagamento recebido", afirma_fato: opts.afirmaFato },
          error: null,
        };
      }
      return { data: null, error: null };
    };

    return enc;
  }

  return { client: { from: builder } as never, updatesDeCrmLeads };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("encerraDemanda — a etapa terminal que afirma fato recusa a máquina", () => {
  it("⭐ ai_agent fechando em etapa que afirma fato: RECUSA, e o card NÃO se move", async () => {
    const m = montar({ afirmaFato: true });

    await expect(
      encerraDemanda(m.client as never, ctx({ type: "ai_agent", id: "run-1", role: "agent" }), {
        leadId: LEAD,
        desfecho: "won",
      }),
    ).rejects.toMatchObject({ status: 409, code: "maquina_nao_afirma_fato" } as Partial<ApiError>);

    // A segunda metade é o ponto: recusar e mover mesmo assim seria pior que
    // não recusar. É a diferença entre "a IA não fecha aqui" e "a IA fechou
    // aqui, mas o sistema reclamou depois".
    expect(m.updatesDeCrmLeads).toHaveLength(0);
  });

  it("user fechando em etapa que afirma fato: MOVE", async () => {
    const m = montar({ afirmaFato: true });

    const r = await encerraDemanda(m.client as never, ctx({ type: "user", id: "ana-1" }), {
      leadId: LEAD,
      desfecho: "won",
    });

    expect(r.jaEstava).toBe(false);
    expect(m.updatesDeCrmLeads).toHaveLength(1);
    expect(m.updatesDeCrmLeads[0]!.patch.stage_id).toBe(STAGE_TERMINAL);
  });

  it("CONTROLE — etapa terminal que NÃO afirma fato: ai_agent fecha normalmente", async () => {
    const m = montar({ afirmaFato: false });

    const r = await encerraDemanda(
      m.client as never,
      ctx({ type: "ai_agent", id: "run-1", role: "agent" }),
      { leadId: LEAD, desfecho: "won" },
    );

    expect(r.jaEstava).toBe(false);
    expect(m.updatesDeCrmLeads).toHaveLength(1);
  });

  it("CONTROLE — webhook_source (retencao/automação) também é recusado", async () => {
    const m = montar({ afirmaFato: true });

    await expect(
      encerraDemanda(m.client as never, ctx({ type: "webhook_source", id: "retencao" }), {
        leadId: LEAD,
        desfecho: "lost",
        motivo: "price",
      }),
    ).rejects.toMatchObject({ status: 409, code: "maquina_nao_afirma_fato" });

    expect(m.updatesDeCrmLeads).toHaveLength(0);
  });
});
