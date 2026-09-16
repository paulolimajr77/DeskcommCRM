import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: null, error: null });
      chain.single = async () => ({ data: null, error: null });
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve(res({ data: null, error: null }));
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/leads/activity-emitter", async (orig) => ({
  ...(await orig<typeof import("@/lib/leads/activity-emitter")>()),
  emitLeadActivity: vi.fn(async () => ({ ok: true })),
}));

import { createLeadHandler, moveLeadHandler } from "@/app/api/v1/leads/_handler";
import { ORG_ID, PIPE, etapa, makeDb, negocio } from "@/tests/helpers/stages-db-double";

/**
 * A ETAPA QUE AFIRMA FATO SÓ DEIXA A PESSOA PASSAR.
 *
 * ─── O DEFEITO, MEDIDO EM PRODUÇÃO (2026-09-16) ─────────────────────────
 *
 * O agente PROMETEU a proposta, o classificador leu INTENÇÃO como FATO, e o
 * card foi para «Proposta enviada» — sem ninguém ter enviado nada. No quadro
 * ele aparece ADIANTADO, e isso é pior que parado: um card adiantado não chama
 * a atenção de ninguém.
 *
 * ─── A TRAVA NASCEU NO LUGAR ERRADO ──────────────────────────────────────
 *
 * A primeira trava foi posta só no `moveLeadHandler`. Medido depois: seis
 * caminhos escrevem `crm_leads.stage_id`, e ela cobria UM. O defeito real
 * passou por `lib/leads/agent-stage-sync.ts`, que a trava nem tocava. E o
 * campo `evidencia` que a primeira versão pedia não tinha UM ÚNICO EMISSOR:
 * nem o schema nem a rota de move o enviavam. Campo sem emissor, anti-pattern
 * nº 3 do CLAUDE.md em espelho.
 *
 * ─── A REGRA NOVA ────────────────────────────────────────────────────────
 *
 * A máquina não afirma fato; a pessoa sim. `quem.type === "user"` passa —
 * arrastar o card É a confirmação. `ai_agent`, `api_token` e `webhook_source`
 * são recusados com 409 `maquina_nao_afirma_fato`. Etapa com `afirma_fato !==
 * true` passa para todos, sem olhar o ator.
 *
 * A regra pura vive em `lib/leads/etapa-que-afirma-fato.ts` e tem 7 testes
 * próprios. Este arquivo não a repete: aqui se mede o HANDLER, com dublê de
 * banco de verdade, que é a camada que a função pura sozinha não prova.
 *
 * ─── POR QUE A REGRA LÊ A COLUNA, NUNCA O NOME ───────────────────────────
 *
 * A lista de etapas é escrita pelo dono, em qualquer nicho. «Proposta
 * enviada» numa imobiliária é um fato; noutra, é um rótulo vago. Reconhecer
 * por nome acerta a empresa medida e erra todas as outras. O caso 6 é a
 * doutrina em forma de teste.
 */

const LEAD = "lead-1";
const CONTATO = "contato-1";
const ETAPA_A = "stage-a";
const ETAPA_B = "stage-b";

/**
 * Contexto mínimo que os handlers leem.
 *
 * `serviceOrigin` é fornecido para o handler NÃO chamar
 * `observeServiceOrigin(createAdminClient(), …)` — o mock de admin existe,
 * mas um contexto completo não deveria depender de rede.
 */
function ctx(actor: { type: string }) {
  return {
    organization_id: ORG_ID,
    actor: { ...actor, id: "actor-id", role: "agent" },
    requestId: "req-teste",
    idioma: "pt-BR",
    serviceOrigin: { kind: "lead", id: LEAD },
  } as never;
}

/** Só as escritas de movimento/criação do lead — o fim da cadeia. */
function escritasDoLead(db: ReturnType<typeof makeDb>) {
  return db.escritas.filter((e) => e.table === "crm_leads");
}

function baseDeLead() {
  return { leads: [negocio(LEAD, "stage-origem")] };
}

describe("etapa que afirma fato: a máquina não passa", () => {
  it("⭐ etapa que afirma fato + ator `ai_agent`: RECUSA, e o card NÃO se move", async () => {
    // É o defeito de produção em forma de teste: o classificador leu INTENÇÃO
    // como FATO. A segunda metade é o ponto — recusar e mover mesmo assim seria
    // pior que não recusar.
    const db = makeDb({
      ...baseDeLead(),
      stages: [etapa({ id: ETAPA_A, name: "Proposta enviada", afirma_fato: true })],
    });

    await expect(
      moveLeadHandler(db.client as never, ctx({ type: "ai_agent" }), LEAD, {
        to_stage_id: ETAPA_A,
      }),
    ).rejects.toMatchObject({ status: 409, code: "maquina_nao_afirma_fato" });

    expect(escritasDoLead(db), "o card foi movido apesar da recusa").toEqual([]);
  });

  it("etapa que afirma fato + ator `user`: MOVE", async () => {
    // A pessoa que move É a evidência — a regra do dono do produto em ação.
    const db = makeDb({
      ...baseDeLead(),
      stages: [etapa({ id: ETAPA_A, name: "Proposta enviada", afirma_fato: true })],
    });

    await moveLeadHandler(db.client as never, ctx({ type: "user" }), LEAD, {
      to_stage_id: ETAPA_A,
    });

    const escrita = escritasDoLead(db)[0];
    expect(escrita, "o card não foi movido").toBeDefined();
    expect((escrita?.patch as Record<string, unknown>).stage_id).toBe(ETAPA_A);
  });

  it("etapa que afirma fato + ator `webhook_source`: RECUSA", async () => {
    // É o ator que a automação, o webhook de entrada e os três movedores de
    // `lib/leads/` usam — cinco dos seis escritores. Sem este caso, uma
    // implementação que só barrasse `ai_agent` passaria no caso 1.
    const db = makeDb({
      ...baseDeLead(),
      stages: [etapa({ id: ETAPA_A, name: "Proposta enviada", afirma_fato: true })],
    });

    await expect(
      moveLeadHandler(db.client as never, ctx({ type: "webhook_source" }), LEAD, {
        to_stage_id: ETAPA_A,
      }),
    ).rejects.toMatchObject({ status: 409, code: "maquina_nao_afirma_fato" });
  });

  it("etapa que afirma fato + ator `api_token`: RECUSA", async () => {
    const db = makeDb({
      ...baseDeLead(),
      stages: [etapa({ id: ETAPA_A, name: "Proposta enviada", afirma_fato: true })],
    });

    await expect(
      moveLeadHandler(db.client as never, ctx({ type: "api_token" }), LEAD, {
        to_stage_id: ETAPA_A,
      }),
    ).rejects.toMatchObject({ status: 409, code: "maquina_nao_afirma_fato" });
  });

  it("CONTROLE — etapa comum (`afirma_fato: false`) move para TODOS os quatro atores", async () => {
    // Sem este caso, uma implementação que recusasse SEMPRE passaria nos de
    // recusa. Etapa comum é o padrão: 100% das etapas existentes hoje.
    for (const tipo of ["user", "ai_agent", "api_token", "webhook_source"]) {
      const db = makeDb({
        ...baseDeLead(),
        stages: [etapa({ id: ETAPA_A, name: "Entendendo a necessidade", afirma_fato: false })],
      });

      await moveLeadHandler(db.client as never, ctx({ type: tipo }), LEAD, {
        to_stage_id: ETAPA_A,
      });

      expect(
        escritasDoLead(db).length,
        `a etapa comum não moveu para o ator ${tipo}`,
      ).toBe(1);
    }
  });

  it("CONTROLE DE NICHO — a regra lê a COLUNA, nunca o NOME", async () => {
    // A doutrina em forma de teste. «Proposta enviada» com `afirma_fato: false`
    // MOVE para o agente; «Etapa 4» (nome genérico) com `afirma_fato: true`
    // RECUSA. Se a regra olhasse o nome, os dois resultados seriam o oposto.
    const dbNomeEnganoso = makeDb({
      leads: [negocio(LEAD, "stage-origem")],
      stages: [etapa({ id: ETAPA_A, name: "Proposta enviada", afirma_fato: false })],
    });

    await moveLeadHandler(dbNomeEnganoso.client as never, ctx({ type: "ai_agent" }), LEAD, {
      to_stage_id: ETAPA_A,
    });
    expect(
      escritasDoLead(dbNomeEnganoso)[0],
      "reconheceu a etapa pelo nome",
    ).toBeDefined();

    const dbNomeNeutro = makeDb({
      leads: [negocio(LEAD, "stage-origem")],
      stages: [etapa({ id: ETAPA_B, name: "Etapa 4", afirma_fato: true })],
    });

    await expect(
      moveLeadHandler(dbNomeNeutro.client as never, ctx({ type: "ai_agent" }), LEAD, {
        to_stage_id: ETAPA_B,
      }),
    ).rejects.toMatchObject({ status: 409, code: "maquina_nao_afirma_fato" });
    expect(escritasDoLead(dbNomeNeutro), "nome neutro escapou da regra").toEqual([]);
  });

  it("⭐ CRIAR direto numa etapa que afirma fato: RECUSA para máquina", async () => {
    // Nascer ali é a MESMA afirmação que chegar ali movendo. Este caminho não
    // tinha trava nenhuma, e é alcançável — a automação, o webhook de entrada e
    // a ferramenta do agente criam lead já apontando `stage_id`.
    const db = makeDb({
      leads: [],
      stages: [etapa({ id: ETAPA_A, name: "Proposta enviada", afirma_fato: true })],
    });

    await expect(
      createLeadHandler(
        db.client as never,
        ctx({ type: "ai_agent" }),
        {
          pipeline_id: PIPE,
          stage_id: ETAPA_A,
          contact_id: CONTATO,
          name: "Novo negócio",
          custom_fields: {},
          source_metadata: {},
        } as never,
      ),
    ).rejects.toMatchObject({ status: 409, code: "maquina_nao_afirma_fato" });

    expect(
      escritasDoLead(db).filter((e) => e.tipo === "insert"),
      "máquina criou lead em etapa que afirma fato",
    ).toEqual([]);
  });

  it("⭐ CRIAR direto numa etapa que afirma fato: PASSA para pessoa", async () => {
    const db = makeDb({
      leads: [],
      stages: [etapa({ id: ETAPA_A, name: "Proposta enviada", afirma_fato: true })],
    });

    await createLeadHandler(
      db.client as never,
      ctx({ type: "user" }),
      {
        pipeline_id: PIPE,
        stage_id: ETAPA_A,
        contact_id: CONTATO,
        name: "Novo negócio",
        custom_fields: {},
        source_metadata: {},
      } as never,
    );

    expect(
      escritasDoLead(db).filter((e) => e.tipo === "insert"),
      "pessoa não conseguiu criar lead na etapa que afirma fato",
    ).toHaveLength(1);
  });

  it("CONTROLE DE CLONE ANTIGO — etapa cuja linha vem SEM a coluna move para máquina", async () => {
    // Clone que ainda não aplicou o baseline novo não manda a chave. Ele não
    // pode travar sozinho: ausência, `null` e `false` são o mesmo para a regra.
    const db = makeDb({
      ...baseDeLead(),
      stages: [
        etapa({
          id: ETAPA_A,
          name: "Etapa sem a coluna",
          afirma_fato: undefined,
        }),
      ],
    });

    await moveLeadHandler(db.client as never, ctx({ type: "ai_agent" }), LEAD, {
      to_stage_id: ETAPA_A,
    });

    expect(escritasDoLead(db).length, "clone antigo travou sozinho").toBe(1);
  });
});
