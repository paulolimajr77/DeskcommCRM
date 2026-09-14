/**
 * Excluir contato: a RECUSA vem antes da primeira exclusão.
 *
 * O defeito medido em produção (2026-09-14): `deleteContactHandler` apagava
 * mensagens e conversas e SÓ ENTÃO tentava apagar a ficha. Quem tinha
 * compromisso na agenda tomava 409 `state_conflict` — com o histórico já
 * destruído e o contato de pé. Não há transação envolvendo estas chamadas
 * (cada uma é um request PostgREST), então não há rollback: a operação
 * "falhou" depois de causar a perda que ela prometia causar só no sucesso.
 *
 * O caso 2 é o que vigia a ordem, e é ele que fica vermelho se alguém mover a
 * checagem da agenda para baixo das exclusões: ele não olha só o erro — olha
 * o que foi apagado ANTES do erro.
 *
 * O caso 3 é o controle positivo: compromisso CANCELADO não recusa nada. Sem
 * ele, um handler que recusasse toda vez que a tabela tivesse qualquer linha
 * passaria nos outros dois e reintroduziria a prisão que a migration 0247
 * conserta — cancelar é `update status`, a linha fica, e nenhuma rota do
 * produto apaga um compromisso.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { ApiError } from "@/lib/api/types";
import type { HandlerCtx } from "@/lib/api/handlers/types";

import { deleteContactHandler } from "@/app/api/v1/contacts/_handler";

const ORG = "22222222-2222-4222-8222-222222222222";
const CONTATO = "44444444-4444-4444-8444-444444444444";
const USER = "11111111-1111-4111-8111-111111111111";

interface Config {
  /** Quantos compromissos AINDA MARCADOS (pending/confirmed) o contato tem. */
  marcados: number;
}

/**
 * Supabase de mentira que grava a ORDEM das operações. É a ordem que este
 * arquivo prova; o resultado de cada chamada é secundário.
 */
function criarSupabase(cfg: Config) {
  const feito: string[] = [];

  function resolver(tabela: string, op: string) {
    if (tabela === "calendar_appointments") {
      feito.push("leu:calendar_appointments");
      return { count: cfg.marcados, error: null, data: null };
    }
    if (tabela === "contacts" && op === "select") {
      return { data: { id: CONTATO, organization_id: ORG }, error: null };
    }
    if (tabela === "contacts" && op === "delete") {
      return { data: { id: CONTATO }, error: null };
    }
    return { data: null, error: null };
  }

  const sb = {
    from(tabela: string) {
      const estado = { op: "select" };
      const chain: Record<string, unknown> = {
        select: () => chain,
        delete: () => {
          estado.op = "delete";
          feito.push(`apagou:${tabela}`);
          return chain;
        },
        eq: () => chain,
        in: () => chain,
        maybeSingle: () => Promise.resolve(resolver(tabela, estado.op)),
        then: (ok: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
          Promise.resolve(resolver(tabela, estado.op)).then(ok, falhou),
      };
      return chain;
    },
    rpc: () => ({
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
    }),
  };

  return { sb: sb as never, feito };
}

function ctx(): HandlerCtx {
  return {
    organization_id: ORG,
    requestId: "req-1",
    idioma: "pt-BR",
    actor: { kind: "user", userId: USER, role: "admin" },
  } as unknown as HandlerCtx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("excluir contato", () => {
  it("apaga o contato quando não há compromisso marcado", async () => {
    const { sb, feito } = criarSupabase({ marcados: 0 });

    await expect(deleteContactHandler(sb, ctx(), CONTATO)).resolves.toEqual({ id: CONTATO });

    expect(feito).toContain("apagou:messages");
    expect(feito).toContain("apagou:conversations");
    expect(feito).toContain("apagou:contacts");
  });

  it("⛔ recusa ANTES de apagar qualquer coisa quando há compromisso marcado", async () => {
    const { sb, feito } = criarSupabase({ marcados: 2 });

    await expect(deleteContactHandler(sb, ctx(), CONTATO)).rejects.toBeInstanceOf(ApiError);

    // A prova que importa: nada foi destruído no caminho da recusa.
    expect(feito.filter((f) => f.startsWith("apagou:"))).toEqual([]);
    // E a leitura da agenda aconteceu — a recusa é medida, não suposta.
    expect(feito).toContain("leu:calendar_appointments");
  });

  it("a recusa diz o que fazer, em vez de nomear a tabela", async () => {
    const { sb } = criarSupabase({ marcados: 1 });

    await expect(deleteContactHandler(sb, ctx(), CONTATO)).rejects.toMatchObject({
      status: 409,
      code: "state_conflict",
    });

    const erro = await deleteContactHandler(sb, ctx(), CONTATO).catch((e: ApiError) => e);
    expect((erro as ApiError).message).toMatch(/desmarque/i);
  });
});
