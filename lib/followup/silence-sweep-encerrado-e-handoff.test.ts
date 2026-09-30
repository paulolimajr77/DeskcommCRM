import { describe, expect, it, vi } from "vitest";

import { runSilenceSweep, type SilencePointer, type SilenceSweepDb } from "./silence-sweep";

/**
 * QUEM JÁ SAIU DO PROCESSO DE VENDA NÃO RECEBE LEMBRETE DE RETOMADA.
 *
 * Medido em produção (30/09/2026): um lead respondeu "Parar não é daqui", a IA
 * saiu de campo e, ~10 min depois, o gatilho de silêncio inscreveu o contato no
 * fluxo de retomada (primeiro lembrete em 2 h). O gatilho só olha "há quanto
 * tempo o contato não escreve" — e um contato perdido, ou em handoff, é
 * silencioso pelo mesmo motivo que um contato esquecido.
 *
 * Versão RÁPIDA, com `SilenceSweepDb` fake em memória. Os dois métodos novos são
 * opcionais na interface: os outros dublês do gatilho seguem valendo.
 */
function fakeDb(opts: {
  handoffPolicy?: SilencePointer["handoff_policy"];
  negocioEncerrado?: Set<string>;
  emHandoff?: Set<string>;
  insert?: SilenceSweepDb["insertEnrollment"];
  semOsMetodosNovos?: boolean;
}): SilenceSweepDb & { chamadasNegocio: string[][]; chamadasHandoff: string[][] } {
  const chamadasNegocio: string[][] = [];
  const chamadasHandoff: string[][] = [];
  const base: SilenceSweepDb = {
    loadActiveSilencePointers: async () => [
      {
        id: "p-1",
        organization_id: "org-1",
        active_version_id: "v-1",
        threshold_minutes: 120,
        segments: [],
        handoff_policy: opts.handoffPolicy,
      },
    ],
    loadSilentContactIds: async () => ["contato-a", "contato-b", "contato-c"],
    loadContatosComRetornoVivo: async () => new Set<string>(),
    loadTriggerNode: async () => ({ id: "t-1", pedeAgente: false }),
    loadContactIdsEmCooldown: async () => new Set<string>(),
    insertEnrollment: opts.insert ?? (async () => ({ inserted: true })),
  };
  if (opts.semOsMetodosNovos) {
    return Object.assign(base, { chamadasNegocio, chamadasHandoff });
  }
  return Object.assign(base, {
    chamadasNegocio,
    chamadasHandoff,
    loadContatosComNegocioEncerrado: async (_org: string, ids: string[]) => {
      chamadasNegocio.push(ids);
      return opts.negocioEncerrado ?? new Set<string>();
    },
    loadContatosEmHandoff: async (_org: string, ids: string[]) => {
      chamadasHandoff.push(ids);
      return opts.emHandoff ?? new Set<string>();
    },
  });
}

const DEPS_BASE = {
  gateDb: { loadEnabledPublishedFollowupAgents: async () => [] },
  clock: () => new Date("2026-09-30T12:00:00Z"),
};

describe("runSilenceSweep — negócio encerrado", () => {
  it("contato cujo negócio já foi perdido/ganho NÃO é inscrito; os outros são", async () => {
    const insert = vi.fn(async () => ({ inserted: true }));
    const db = fakeDb({ negocioEncerrado: new Set(["contato-a"]), insert });

    const summary = await runSilenceSweep({ db, ...DEPS_BASE });

    expect(summary.skipped_closed_deal).toBe(1);
    expect(summary.enrolled).toBe(2);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).not.toHaveBeenCalledWith(expect.objectContaining({ contact_id: "contato-a" }));
  });

  it("pergunta uma vez por pointer, com todos os silenciosos (não uma por contato)", async () => {
    const db = fakeDb({});

    await runSilenceSweep({ db, ...DEPS_BASE });

    expect(db.chamadasNegocio).toEqual([["contato-a", "contato-b", "contato-c"]]);
  });

  it("sem negócio encerrado, ninguém é cortado (contato sem funil segue valendo)", async () => {
    const insert = vi.fn(async () => ({ inserted: true }));
    const db = fakeDb({ negocioEncerrado: new Set(), insert });

    const summary = await runSilenceSweep({ db, ...DEPS_BASE });

    expect(summary.skipped_closed_deal).toBe(0);
    expect(summary.enrolled).toBe(3);
  });

  it("falha na leitura pula o pointer inteiro: melhor não inscrever do que inscrever quem pediu para parar", async () => {
    const insert = vi.fn(async () => ({ inserted: true }));
    const db = fakeDb({ insert });
    db.loadContatosComNegocioEncerrado = async () => {
      throw new Error("banco indisponível");
    };

    const summary = await runSilenceSweep({ db, ...DEPS_BASE });

    expect(summary.pointers_failed).toBe(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it("um dublê sem o método novo segue funcionando (a interface é opcional)", async () => {
    const insert = vi.fn(async () => ({ inserted: true }));
    const db = fakeDb({ semOsMetodosNovos: true, insert });

    const summary = await runSilenceSweep({ db, ...DEPS_BASE });

    expect(summary.enrolled).toBe(3);
    expect(summary.skipped_closed_deal).toBe(0);
  });
});

describe("runSilenceSweep — handoff humano na entrada", () => {
  it("fluxo com handoff_policy 'pause': contato em handoff NÃO é inscrito", async () => {
    const insert = vi.fn(async () => ({ inserted: true }));
    const db = fakeDb({ handoffPolicy: "pause", emHandoff: new Set(["contato-b"]), insert });

    const summary = await runSilenceSweep({ db, ...DEPS_BASE });

    expect(summary.skipped_handoff).toBe(1);
    expect(summary.enrolled).toBe(2);
    expect(insert).not.toHaveBeenCalledWith(expect.objectContaining({ contact_id: "contato-b" }));
  });

  it("fluxo com handoff_policy 'cancel': idem", async () => {
    const insert = vi.fn(async () => ({ inserted: true }));
    const db = fakeDb({ handoffPolicy: "cancel", emHandoff: new Set(["contato-c"]), insert });

    const summary = await runSilenceSweep({ db, ...DEPS_BASE });

    expect(summary.skipped_handoff).toBe(1);
    expect(insert).not.toHaveBeenCalledWith(expect.objectContaining({ contact_id: "contato-c" }));
  });

  it("fluxo com handoff_policy 'allow': o operador escolheu seguir em handoff — inscreve e nem consulta", async () => {
    const insert = vi.fn(async () => ({ inserted: true }));
    const db = fakeDb({ handoffPolicy: "allow", emHandoff: new Set(["contato-b"]), insert });

    const summary = await runSilenceSweep({ db, ...DEPS_BASE });

    expect(summary.skipped_handoff).toBe(0);
    expect(summary.enrolled).toBe(3);
    expect(db.chamadasHandoff).toEqual([]);
  });

  it("pointer sem política conhecida se comporta como antes (nada de handoff é lido)", async () => {
    const db = fakeDb({ handoffPolicy: undefined, emHandoff: new Set(["contato-b"]) });

    const summary = await runSilenceSweep({ db, ...DEPS_BASE });

    expect(summary.skipped_handoff).toBe(0);
    expect(db.chamadasHandoff).toEqual([]);
  });
});
