import { describe, expect, it, vi } from "vitest";

/**
 * A ETAPA QUE AFIRMA FATO SÓ É ATINGIDA COM EVIDÊNCIA.
 *
 * ═══ O DEFEITO, MEDIDO EM PRODUÇÃO (2026-09-16) ═════════════════════════════
 *
 * Às 09:45 o negócio foi movido de "Entendendo a necessidade" para "Proposta
 * enviada" a partir da mensagem em que o agente PROMETEU a proposta. Ninguém
 * enviou proposta nenhuma — o classificador leu INTENÇÃO como FATO.
 *
 * No quadro, o negócio agora aparece ADIANTADO, e isso é pior que aparecer
 * parado: um card em "Proposta enviada" não chama a atenção de ninguém, e o
 * Radar de Risco só o alcançaria quando o cliente já tivesse desistido.
 *
 * A coluna `crm_stages.afirma_fato` (migration 0274) deixa o DONO marcar quais
 * etapas afirmam que algo já aconteceu. Quando a etapa afirma fato, o handler
 * só move o card COM EVIDÊNCIA — documento enviado na conversa, ou confirmação
 * explícita de uma pessoa. Sem evidência, o card NÃO se move.
 *
 * ═══ POR QUE A REGRA LÊ A COLUNA, NUNCA O NOME ═════════════════════════════
 *
 * A tentação era reconhecer por nome ("se a etapa se chama 'Proposta enviada',
 * então…") — e ela é errada por construção. A lista de etapas é escrita pelo
 * dono, em qualquer nicho: "Proposta enviada", "Contrato assinado", "Pagamento
 * recebido", "Laudo entregue", "Chaves entregues", "Consulta realizada". Cada
 * nicho tem as suas, e o mesmo substantivo significa coisas diferentes em
 * empresas diferentes. Uma lista de nomes no código acerta a empresa que foi
 * medida e erra todas as outras.
 *
 * O caso 4 é a DOUTRINA em forma de teste: a etapa chamada "Proposta enviada"
 * com `afirma_fato: false` MOVE sem evidência; a etapa chamada "Etapa 4" com
 * `afirma_fato: true` RECUSA. Se a regra olhasse o nome, os dois resultados
 * seriam o oposto.
 *
 * ═══ POR QUE O CAMPO `evidencia` É OPCIONAL ════════════════════════════════
 *
 * Toda chamada que existe hoje passa sem ele, e etapa com `afirma_fato = false`
 * (o padrão — e é o de TODAS as etapas existentes) não olha o campo. Exigi-lo
 * quebraria todo chamador de uma vez, para um comportamento que ninguém ligou
 * ainda.
 *
 * ═══ POR QUE A MONTAGEM VEM DO HELPER `stages-db-double.ts` ════════════════
 *
 * `tests/helpers/stages-db-double.ts` é o dublê OFICIAL de `moveLeadHandler` e
 * irmãos: ele APLICA os filtros `eq`, projeta o `select()` e registra cada
 * escrita (tipo, tabela, patch e filtros). Reconstruir um segundo dublê aqui
 * faria os dois divergirem no primeiro ajuste — e o teste passaria a medir um
 * aparelho que ninguém usa em produção. O `create-or-move-lead.test.ts` já o
 * usa contra o MESMO handler; a montagem (incluindo os `vi.mock` do topo) segue
 * aquele arquivo.
 */

// Mocks mínimos — mesmos de `create-or-move-lead.test.ts`. O `stages-db-double`
// importa `createClient` e `requireRole` de verdade (para poder usar
// `vi.mocked(...).mockResolvedValue(...)`); sem estes mocks, a importação real
// de `lib/auth/server` valida env no boot e explode antes do teste rodar.
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
// Mock ESPALHADO (não substituição) do `activity-emitter`: o módulo exporta oito
// coisas, e o handler usa mais de uma (`emitLeadActivity` e `stageChangeReason`).
// Substituir o módulo inteiro apagaria os demais exports — foi o primeiro erro
// medido nesta cerca. `emitLeadActivity` vira no-op, porque o teste mede o
// MOVIMENTO do card, não o rastro; e porque sem o dublê o caminho pós-movimento
// tentaria `emit_event` contra a rede de verdade.
vi.mock("@/lib/leads/activity-emitter", async (orig) => ({
  ...(await orig<typeof import("@/lib/leads/activity-emitter")>()),
  emitLeadActivity: vi.fn(async () => ({ ok: true })),
}));

import { moveLeadHandler } from "@/app/api/v1/leads/_handler";
import { ORG_ID, etapa, makeDb, negocio, type Escrita } from "@/tests/helpers/stages-db-double";

const LEAD = "lead-1";
const ETAPA_A = "stage-a";
const ETAPA_B = "stage-b";

/**
 * Contexto mínimo que `moveLeadHandler` lê.
 *
 * `serviceOrigin` é fornecido de propósito: com ele presente, o handler NÃO
 * chama `observeServiceOrigin(createAdminClient(), …)` — economiza o mock de
 * admin do módulo inteiro e evita qualquer tentativa de rede no caminho.
 */
function ctxFalso() {
  return {
    organization_id: ORG_ID,
    actor: { type: "user", id: "u-1" },
    requestId: "req-teste",
    idioma: "pt-BR",
    serviceOrigin: { kind: "lead", id: LEAD },
  } as never;
}

function leadBase() {
  return negocio(LEAD, "stage-origem");
}

/** Só as atualizações em `crm_leads` — é o fim da cadeia que importa. */
function updatesDoLead(escritas: Array<Escrita>) {
  return escritas.filter((e) => e.tipo === "update" && e.table === "crm_leads");
}

describe("etapa que afirma fato exige evidência", () => {
  it("etapa com `afirma_fato: true` e SEM evidência: RECUSA, e o card NÃO se move", async () => {
    // ⛔ A SEGUNDA METADE É O PONTO. Uma implementação que lançasse a exceção
    // DEPOIS de já ter chamado `.update()` passaria na primeira asserção e
    // deixaria o card adiantado mesmo assim — o defeito que esta coluna
    // existe para fechar. O helper registra CADA escrita em `db.escritas`, e é
    // por ali que a segunda metade se prova.
    const db = makeDb({
      leads: [leadBase()],
      stages: [etapa({ id: ETAPA_A, name: "Proposta enviada", afirma_fato: true })],
    });

    await expect(
      moveLeadHandler(db.client as never, ctxFalso(), LEAD, { to_stage_id: ETAPA_A }),
    ).rejects.toMatchObject({ status: 409, code: "stage_requires_evidence" });

    expect(
      updatesDoLead(db.escritas),
      "o card foi movido apesar da recusa",
    ).toEqual([]);
  });

  it("etapa com `afirma_fato: true` e COM evidência: move", async () => {
    const db = makeDb({
      leads: [leadBase()],
      stages: [etapa({ id: ETAPA_A, name: "Proposta enviada", afirma_fato: true })],
    });

    await moveLeadHandler(db.client as never, ctxFalso(), LEAD, {
      to_stage_id: ETAPA_A,
      evidencia: { tipo: "documento_enviado", referencia: "msg-123" },
    });

    const update = updatesDoLead(db.escritas)[0];
    expect(update, "o card não foi movido mesmo com evidência").toBeDefined();
    expect((update?.patch as Record<string, unknown>).stage_id).toBe(ETAPA_A);
  });

  it("CONTROLE — etapa comum (`afirma_fato: false`, o padrão) move sem evidência", async () => {
    // Sem este caso, uma implementação que recusasse SEMPRE passaria nos dois
    // primeiros casos, e o produto pararia de mover card em todo mundo que
    // nunca ligou a caixa — 100% das etapas existentes hoje.
    const db = makeDb({
      leads: [leadBase()],
      stages: [etapa({ id: ETAPA_A, name: "Entendendo a necessidade", afirma_fato: false })],
    });

    await moveLeadHandler(db.client as never, ctxFalso(), LEAD, { to_stage_id: ETAPA_A });

    const update = updatesDoLead(db.escritas)[0];
    expect(update, "o gate de evidência vazou para etapa comum").toBeDefined();
  });

  it("CONTROLE DE NICHO — a regra lê a COLUNA, nunca o NOME", async () => {
    // ⛔ A DOUTRINA EM FORMA DE TESTE. Os dois nomes são os opostos do que uma
    // lista hardcoded diria: "Proposta enviada" com `afirma_fato: false` MOVE;
    // "Etapa 4" (nome genérico) com `afirma_fato: true` RECUSA. É o que
    // acontece na vida real — a lista de etapas é escrita pelo dono, em
    // qualquer nicho, e o mesmo substantivo significa coisas diferentes em
    // empresas diferentes. Se a regra olhasse o nome, os resultados seriam o
    // oposto.
    const bancoNomeEnganoso = makeDb({
      leads: [leadBase()],
      stages: [etapa({ id: ETAPA_A, name: "Proposta enviada", afirma_fato: false })],
    });
    await moveLeadHandler(bancoNomeEnganoso.client as never, ctxFalso(), LEAD, { to_stage_id: ETAPA_A });
    expect(
      updatesDoLead(bancoNomeEnganoso.escritas)[0],
      "reconheceu a etapa pelo nome (Proposta enviada deveria MOVER com afirma_fato=false)",
    ).toBeDefined();

    const bancoNomeNeutro = makeDb({
      leads: [leadBase()],
      stages: [etapa({ id: ETAPA_B, name: "Etapa 4", afirma_fato: true })],
    });
    await expect(
      moveLeadHandler(bancoNomeNeutro.client as never, ctxFalso(), LEAD, { to_stage_id: ETAPA_B }),
    ).rejects.toMatchObject({ status: 409, code: "stage_requires_evidence" });
    expect(
      updatesDoLead(bancoNomeNeutro.escritas),
      "nome neutro (Etapa 4) escapou da regra de evidência com afirma_fato=true",
    ).toEqual([]);
  });

  it("a evidência `confirmado_por_pessoa` vale tanto quanto `documento_enviado`", async () => {
    // Medido: NÃO existe tabela de proposta, orçamento ou quote neste produto
    // (verificado no `information_schema`). Então a confirmação humana é uma
    // das duas únicas evidências possíveis hoje — junto com o documento já
    // enviado na conversa. Recusar essa forma seria inventar uma camada de
    // prova que o produto não tem.
    const db = makeDb({
      leads: [leadBase()],
      stages: [etapa({ id: ETAPA_A, name: "Contrato assinado", afirma_fato: true })],
    });

    await moveLeadHandler(db.client as never, ctxFalso(), LEAD, {
      to_stage_id: ETAPA_A,
      evidencia: { tipo: "confirmado_por_pessoa" },
    });

    const update = updatesDoLead(db.escritas)[0];
    expect(update, "confirmação humana não foi aceita como evidência").toBeDefined();
    expect((update?.patch as Record<string, unknown>).stage_id).toBe(ETAPA_A);
  });
});
