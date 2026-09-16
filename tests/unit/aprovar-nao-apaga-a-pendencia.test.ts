import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn().mockResolvedValue(null) }));

/**
 * A APROVAÇÃO CRIA TAREFA ANTES DE LIMPAR O SLOT.
 *
 * ─── O DEFEITO, MEDIDO EM PRODUÇÃO (2026-09-16) ───
 *
 * O dono aprovou a proposta do assistente — "Enviar orçamento personalizado…" —
 * e o clique produziu só uma linha de timeline e
 * `update lead_state set next_action = null`. Nenhuma tarefa, nenhum dono,
 * nenhum prazo. O sino ficou em ZERO. A demanda ficava invisível pelo próprio
 * ato de cuidar dela.
 *
 * ─── O QUE ESTE ARQUIVO PROVA ───
 *
 * A rota passou a inserir em `crm_tasks` no caminho `approve`, ANTES de limpar o
 * slot. E a ORDEM é o conserto inteiro: limpar antes e criar depois devolve o
 * defeito original, agora com um erro na tela para disfarçar. O caso 2 é a
 * guarda dessa metade — sem ele, uma inversão passaria para todos os outros.
 *
 * Os casos de CONTROLE garantem que não exageramos o conserto: descartar não
 * vira trabalho (caso 3), e autorização vencida não toca em nada (caso 4).
 * E o caso 6 é a regra de tenancy em forma de teste: a tarefa nasce na
 * organização do LEAD lido pela RLS do caller, nunca de algo que o corpo
 * pudesse forjar. Vazamento entre organizações é o FIM do produto, não um bug
 * grave — cada organização é um cliente pagante diferente.
 */

const ORG = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONTATO = "33333333-3333-4333-8333-333333333333";
const LEAD = "44444444-4444-4444-8444-444444444444";

const SEQ = 7;
const PROPOSTA_CURTA = "Enviar orçamento personalizado";

const usuario: AuthUser = {
  id: USER_ID,
  email: "ana@clinica.com.br",
  full_name: "Ana",
  avatar_url: null,
  is_platform_admin: false,
  idioma: "pt-BR" as const,
  organizations: [{ organization_id: ORG, organization_name: "Clínica", role: "agent" }],
};
const orgAtiva: ActiveOrg = { orgId: ORG, name: "Clínica", role: "agent" };

interface Mundo {
  client: unknown;
  tarefasInseridas: Array<Record<string, unknown>>;
  updatesDeLeadState: Array<{ patch: Record<string, unknown>; filtros: Array<[string, unknown]> }>;
}

/**
 * Dublê do Supabase que atende a rota da decisão.
 *
 * Ele responde por TABELA: `crm_leads` e `lead_state` devolvem as linhas que a
 * rota lê; `insert` em `crm_tasks` guarda a linha para as asserções; `update` em
 * `lead_state` registra o patch ENVIADO — que é o que prova se o slot foi limpo
 * (e em qual ordem, via caso 2).
 *
 * `emitLeadActivity` fica de FORA do mock: o módulo real rola, e o dublê o
 * atende via `insert` em `crm_lead_activities` respondendo com erro nulo.
 */
function montar(opts: { erroNaTarefa?: boolean; proposta?: string } = {}): Mundo {
  const tarefasInseridas: Array<Record<string, unknown>> = [];
  const updatesDeLeadState: Array<{
    patch: Record<string, unknown>;
    filtros: Array<[string, unknown]>;
  }> = [];

  function builder(table: string) {
    let modo: "select" | "insert" | "update" = "select";
    let pediuSelect = false;
    let linhaInsert: Record<string, unknown> | Record<string, unknown>[] | null = null;
    let patchUpdate: Record<string, unknown> = {};
    const filtros: Array<[string, unknown]> = [];

    const enc: Record<string, unknown> = {};
    enc.select = () => {
      pediuSelect = true;
      return enc;
    };
    enc.insert = (linha: Record<string, unknown> | Record<string, unknown>[]) => {
      modo = "insert";
      linhaInsert = linha;
      if (table === "crm_tasks") {
        if (Array.isArray(linha)) tarefasInseridas.push(...linha);
        else tarefasInseridas.push(linha);
      }
      return enc;
    };
    enc.update = (patch: Record<string, unknown>) => {
      modo = "update";
      patchUpdate = patch;
      return enc;
    };
    enc.eq = (col: string, val: unknown) => {
      filtros.push([col, val]);
      return enc;
    };
    enc.in = () => enc;
    enc.order = () => enc;
    enc.limit = () => enc;
    enc.is = () => enc;
    enc.neq = () => enc;
    enc.gte = () => enc;
    enc.lte = () => enc;
    enc.lt = () => enc;
    enc.not = () => enc;

    enc.maybeSingle = async () => {
      if (modo === "update") {
        updatesDeLeadState.push({ patch: patchUpdate, filtros: [...filtros] });
        return { data: null, error: null };
      }
      if (table === "crm_leads") {
        return {
          data: {
            id: LEAD,
            organization_id: ORG,
            contact_id: CONTATO,
            status: "open",
          },
          error: null,
        };
      }
      if (table === "lead_state") {
        return {
          data: {
            next_action: opts.proposta ?? PROPOSTA_CURTA,
            next_action_seq: SEQ,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    };

    enc.single = async () => {
      if (modo === "insert") {
        if (table === "crm_tasks" && opts.erroNaTarefa) {
          return { data: null, error: { message: "destino indisponível" } };
        }
        return { data: { id: "tarefa-1" }, error: null };
      }
      return { data: null, error: null };
    };

    enc.then = async (resolve: (v: unknown) => unknown) => {
      if (modo === "update") {
        updatesDeLeadState.push({ patch: patchUpdate, filtros: [...filtros] });
        return Promise.resolve(resolve({ data: null, error: null }));
      }
      // insert/select genéricos
      return Promise.resolve(resolve({ data: null, error: null }));
    };

    return enc;
  }

  const client = { from: builder } as never;
  return { client, tarefasInseridas, updatesDeLeadState };
}

async function postar(body: unknown) {
  const { POST } = await import("@/app/api/v1/leads/[id]/next-action/route");
  const req = new NextRequest(`https://crm.exemplo/api/v1/leads/${LEAD}/next-action`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return POST(req, { params: Promise.resolve({ id: LEAD }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: usuario, org: orgAtiva });
});

describe("POST /api/v1/leads/[id]/next-action — aprovar não apaga a pendência", () => {
  it("aprovar cria a tarefa E só depois limpa o slot", async () => {
    const m = montar();
    vi.mocked(createClient).mockResolvedValue(m.client as never);

    const res = await postar({ decision: "approve", approved_seq: SEQ });

    expect(res.status).toBe(200);
    expect(m.tarefasInseridas).toHaveLength(1);

    const tarefa = m.tarefasInseridas[0]!;
    expect(tarefa.organization_id).toBe(ORG);
    expect(tarefa.lead_id).toBe(LEAD);
    expect(tarefa.contact_id).toBe(CONTATO);
    expect(tarefa.assigned_to).toBe(USER_ID);
    expect(tarefa.created_by).toBe(USER_ID);
    expect(new Date(tarefa.due_date as string).getTime()).toBeGreaterThan(Date.parse("2026-09-16T00:00:00Z"));

    expect(m.updatesDeLeadState).toHaveLength(1);
    expect(m.updatesDeLeadState[0]!.patch).toEqual({ next_action: null });
  });

  it("⭐ se a tarefa NÃO pôde ser criada, o slot NÃO é limpo", async () => {
    // Este é o caso que separa este conserto de um que só parece certo.
    // Inverter a ordem — limpar antes, criar depois — deixa os outros quatro
    // verdes e devolve o defeito inteiro: o slot some, a tarefa não nasce, e o
    // erro na tela faz o dono achar que algo falhou quando na verdade o sistema
    // foi "eficiente" em silenciar a demanda.
    const m = montar({ erroNaTarefa: true });
    vi.mocked(createClient).mockResolvedValue(m.client as never);

    const res = await postar({ decision: "approve", approved_seq: SEQ });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("next_action_sem_destino");
    expect(m.updatesDeLeadState).toHaveLength(0);
  });

  it("CONTROLE — descartar limpa na hora e cria ZERO tarefas", async () => {
    // Descartar é uma decisão COMPLETA — a pessoa disse que NÃO é para fazer, e
    // não sobra trabalho. Sem este caso, uma implementação que criasse tarefa
    // nos DOIS caminhos passaria em 1 e 2.
    const m = montar();
    vi.mocked(createClient).mockResolvedValue(m.client as never);
    const res = await postar({ decision: "dismiss", approved_seq: SEQ });

    expect(res.status).toBe(200);
    expect(m.tarefasInseridas).toHaveLength(0);
    expect(m.updatesDeLeadState).toHaveLength(1);
  });

  it("CONTROLE — autorização vencida não cria tarefa nem limpa nada", async () => {
    // A recusa sai ANTES do destino. Quem clicou autorizou OUTRA proposta, e
    // criar a tarefa da proposta nova em nome de quem leu a antiga seria pior
    // que não criar nenhuma.
    const m = montar();
    vi.mocked(createClient).mockResolvedValue(m.client as never);
    const res = await postar({ decision: "approve", approved_seq: SEQ + 1 });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("next_action_changed");
    expect(m.tarefasInseridas).toHaveLength(0);
    expect(m.updatesDeLeadState).toHaveLength(0);
  });

  it("o texto inteiro da proposta chega ao destino", async () => {
    // `title` é o que a lista corta; perder o fim de uma proposta longa seria
    // perder o que ela pede.
    const textoLongo = "x".repeat(400);
    const m = montar({ proposta: textoLongo });
    vi.mocked(createClient).mockResolvedValue(m.client as never);

    const res = await postar({ decision: "approve", approved_seq: SEQ });

    expect(res.status).toBe(200);
    expect(m.tarefasInseridas[0]?.description).toBe(textoLongo);
    expect((m.tarefasInseridas[0]?.title as string).length).toBeLessThanOrEqual(255);
  });

  it("CONTROLE DE TENANT — a tarefa nasce na organização do LEAD", async () => {
    // Vazamento entre organizações é o FIM do produto, não um bug grave — cada
    // organização é um cliente pagante diferente. A organização NUNCA sai do
    // body; ela vem da linha do negócio lida pela RLS do caller.
    const m = montar();
    vi.mocked(createClient).mockResolvedValue(m.client as never);

    const corpoEnviado = { decision: "approve", approved_seq: SEQ };
    expect(JSON.stringify(corpoEnviado)).not.toContain(ORG);

    const res = await postar(corpoEnviado);
    expect(res.status).toBe(200);
    expect(m.tarefasInseridas[0]?.organization_id).toBe(ORG);
  });
});
