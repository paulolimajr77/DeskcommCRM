import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HandlerCtx } from "@/lib/api/handlers/types";

/**
 * Trocar QUEM será atendido, num compromisso que já existe.
 *
 * ─── O buraco ──────────────────────────────────────────────────────────────
 *
 * A tela de remarcar escondia o bloco do cliente (`{!remarcandoId ? … : null}`),
 * e escondia com razão: `AlterarInput` não tinha `contact_id` nem
 * `conversation_id`. Quem marcasse para a pessoa errada só podia cancelar e
 * marcar de novo — e o relato de quem usa foi exatamente esse: "não seleciona
 * usuário, conversa, observação".
 *
 * ─── Por que a guarda é a ENTREGA, e não o status ──────────────────────────
 *
 * Enquanto nada saiu, o vínculo é anotação interna e trocar não alcança
 * ninguém. Depois que a entrega foi autorizada, o endereço da reunião já está —
 * ou está a caminho — no WhatsApp de uma pessoa concreta. Trocar ali criaria um
 * compromisso que diz pertencer a B enquanto A tem o link no aparelho, e o
 * produto não tem como recolher o que já chegou.
 */
vi.mock("@/lib/agenda/consulta", async (original) => {
  const real = await original<typeof import("@/lib/agenda/consulta")>();
  return { ...real, horariosLivresDaOrg: vi.fn() };
});

const { alterarAgendamentoHandler } = await import("@/app/api/v1/agenda/agendamentos/_handler");
const { ApiError } = await import("@/lib/api/types");

const ORG = "aaaaaaaa-2222-4000-8000-00000000000a";
const AGENDAMENTO = "ffffffff-2222-4000-8000-00000000000f";
const CONTATO_NOVO = "11111111-2222-4000-8000-000000000011";

const ctx: HandlerCtx = {
  organization_id: ORG,
  actor: { type: "user", id: "bbbbbbbb-2222-4000-8000-00000000000b", role: "manager" },
  requestId: "req-troca",
} as unknown as HandlerCtx;

let gravado: Record<string, unknown> | null;

/**
 * Dublê CIENTE DA TABELA — de propósito.
 *
 * Um dublê que devolve a mesma linha para qualquer `from()` faz a busca do
 * contato achar o AGENDAMENTO e responder "existe". O caso do contato de outra
 * organização passaria sem exercitar nada, que é o modo de falha que este
 * arquivo existe para pegar.
 */
function clienteCom(estadoDaEntrega: string | null, contatoExiste = true): SupabaseClient {
  const linha = {
    id: AGENDAMENTO,
    revision: 1,
    event_type_id: "cccccccc-2222-4000-8000-00000000000c",
    owner_user_id: "dddddddd-2222-4000-8000-00000000000d",
    contact_id: "eeeeeeee-2222-4000-8000-00000000000e",
    conversation_id: null,
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    status: "confirmed",
    time_zone: "America/Sao_Paulo",
    meeting_delivery: estadoDaEntrega ? { state: estadoDaEntrega } : null,
  };
  const cadeiaDe = (dado: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["eq", "order", "limit", "in", "is", "not", "select"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: dado, error: null });
    c.single = async () => ({ data: dado, error: null });
    return c;
  };
  return {
    from: (tabela: string) => ({
      select: () => cadeiaDe(tabela === "contacts" ? (contatoExiste ? { id: CONTATO_NOVO } : null) : linha),
      update: (mudanca: Record<string, unknown>) => {
        gravado = mudanca;
        const c = cadeiaDe({ ...linha, ...mudanca });
        c.eq = () => c;
        return c;
      },
      insert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "fn_appointment_change") return { data: null, error: null };
      gravado = args.p_patch as Record<string, unknown>;
      return { data: { ...linha, ...gravado, revision: 2 }, error: null };
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  gravado = null;
});

describe("trocar o cliente de um compromisso pela rota", () => {
  it("troca enquanto NADA foi enviado", async () => {
    await alterarAgendamentoHandler(clienteCom("none"), ctx, {
      id: AGENDAMENTO,
      contact_id: CONTATO_NOVO,
    });
    expect(gravado).toMatchObject({ contact_id: CONTATO_NOVO });
  });

  it("troca também em compromisso que nunca teve entrega", async () => {
    await alterarAgendamentoHandler(clienteCom(null), ctx, {
      id: AGENDAMENTO,
      contact_id: CONTATO_NOVO,
    });
    expect(gravado).toMatchObject({ contact_id: CONTATO_NOVO });
  });

  for (const estado of ["sent", "queued", "waiting_for_link"]) {
    it(`⛔ RECUSA depois da entrega (${estado}), e NADA é gravado`, async () => {
      const erro = await alterarAgendamentoHandler(clienteCom(estado), ctx, {
        id: AGENDAMENTO,
        contact_id: CONTATO_NOVO,
      }).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ApiError);
      expect((erro as InstanceType<typeof ApiError>).code).toBe("agenda_cliente_ja_avisado");
      // "Nada é gravado" é metade do caso: sem isto, uma implementação que
      // lançasse DEPOIS de escrever passaria — e o dano já estaria feito.
      expect(gravado).toBeNull();
    });
  }

  it("⛔ contato de OUTRA organização é recusado com 404", async () => {
    // Mesmo cuidado do caminho de marcar: `contact_id` é entrada externa e é
    // resolvido contra a org, nunca repassado cru. Sem esta linha, a rota de
    // alterar seria a porta que o handler de marcar já fechou.
    const erro = await alterarAgendamentoHandler(clienteCom("none", false), ctx, {
      id: AGENDAMENTO,
      contact_id: CONTATO_NOVO,
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as InstanceType<typeof ApiError>).status).toBe(404);
    expect(gravado).toBeNull();
  });

  it("⛔ CONTROLE: sem mexer no cliente, a entrega enviada NÃO atrapalha", async () => {
    // Sem este par, uma guarda escrita larga demais (ler a entrega e recusar
    // sempre) reprovaria remarcar o HORÁRIO de um compromisso já enviado — que
    // é justamente o caso que a Onda 4 existe para fazer funcionar.
    await alterarAgendamentoHandler(clienteCom("sent"), ctx, {
      id: AGENDAMENTO,
      notes: "só a observação",
    });
    expect(gravado).toMatchObject({ notes: "só a observação" });
  });
});
