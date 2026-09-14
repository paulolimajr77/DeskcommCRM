import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HandlerCtx } from "@/lib/api/handlers/types";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { updateLeadSchema } from "@/lib/schemas/leads";

import { updateLeadHandler } from "./_handler";

/**
 * A CERCA DO MERGE DE `custom_fields`. Não há defeito aqui — há uma linha cuja
 * quebra apaga trabalho de gente em silêncio.
 *
 * O agente passou a anotar os campos personalizados do funil UM DE CADA VEZ,
 * conforme o cliente fala: hoje o segmento, daqui a dez minutos o prazo, amanhã
 * o tipo de projeto. Cada anotação é um PATCH com UMA chave. Isso só é seguro
 * porque `updateLeadHandler` faz
 *
 *     patch.custom_fields = { ...prev, ...input.custom_fields };
 *
 * e não atribuição direta. Trocar por `patch.custom_fields = input.custom_fields`
 * não estoura nada: o UPDATE seria aceito, a resposta seria 200, e o que o
 * cliente respondeu e a atendente digitou à mão sumiria da ficha. Ninguém
 * receberia erro — o dado simplesmente não estaria mais lá.
 *
 * Por isso o banco falso abaixo APLICA o patch por cima da linha, em vez de só
 * guardá-lo: `jsonb` no Postgres não faz merge sozinho, o UPDATE SUBSTITUI a
 * coluna inteira pelo valor enviado. O que este teste mede é o estado final da
 * linha — que é o que o usuário vê —, e não o que o handler pretendia.
 */

vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => undefined),
  isServiceRoleConfigured: () => true,
  hashEmail: (v: string) => v,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc: async () => ({ data: null, error: null }) })),
}));
vi.mock("@/lib/leads/activity-emitter", () => ({
  emitLeadActivity: vi.fn(async () => ({ ok: true })),
  stageChangeReason: () => "",
}));
vi.mock("@/lib/leads/activity-write-failure", () => ({
  registraFalhaDeAtividade: vi.fn(async () => undefined),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const USUARIO = "33333333-3333-4333-8333-333333333333";

const ctx: HandlerCtx = {
  organization_id: ORG,
  actor: { type: "user", id: USUARIO },
  requestId: "req-cerca-campos-do-funil",
};

/**
 * Banco falso com a semântica que importa: o UPDATE **substitui** a coluna.
 * Quem faz merge é o handler; se ele parar de fazer, a perda aparece aqui.
 */
function bancoFalso(customFieldsAtuais: Record<string, unknown>) {
  const linha: Record<string, unknown> = {
    id: LEAD,
    organization_id: ORG,
    contact_id: null,
    title: "Carlos — Clínica Vida",
    description: null,
    tags: [],
    custom_fields: customFieldsAtuais,
  };
  let patchEnviado: Record<string, unknown> | null = null;

  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    is: () => consulta,
    order: () => consulta,
    limit: () => consulta,
    update: (patch: Record<string, unknown>) => {
      patchEnviado = patch;
      Object.assign(linha, patch);
      return consulta;
    },
    maybeSingle: async () => ({ data: { ...linha }, error: null }),
    single: async () => ({ data: { ...linha }, error: null }),
  };

  return {
    supabase: {
      from: () => consulta,
      rpc: async () => ({ data: null, error: null }),
    } as unknown as SupabaseClient,
    linha,
    /** O patch que chegou ao banco — a asserção de causa, não só de efeito. */
    patch: () => patchEnviado,
  };
}

/** Passa pelo schema real: um teste que pula o zod não prova o caminho de verdade. */
function entrada(bruto: Record<string, unknown>) {
  return updateLeadSchema.parse(bruto);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("campos personalizados do funil sobrevivem a anotação em pingue-pongue", () => {
  it("anotar um campo novo NÃO apaga os que já estavam lá", async () => {
    // O caso de verdade: o agente anotou o segmento na segunda-feira, a
    // atendente digitou o prazo à mão na terça, e hoje o cliente falou o tipo
    // de projeto. Os três têm de coexistir.
    const banco = bancoFalso({ segmento: "clinica", prazo: "30 dias" });

    const atualizado = await updateLeadHandler(
      banco.supabase,
      ctx,
      LEAD,
      entrada({ custom_fields: { tipo_projeto: "site" } }),
    );

    expect(banco.patch()?.custom_fields).toEqual({
      segmento: "clinica",
      prazo: "30 dias",
      tipo_projeto: "site",
    });
    expect(banco.linha.custom_fields).toEqual({
      segmento: "clinica",
      prazo: "30 dias",
      tipo_projeto: "site",
    });
    expect(atualizado.custom_fields).toEqual({
      segmento: "clinica",
      prazo: "30 dias",
      tipo_projeto: "site",
    });
  });

  it("a MESMA chave é sobrescrita — corrigir um campo é legítimo", async () => {
    // Esta asserção não vigia o merge (atribuição direta daria o mesmo
    // resultado); ela existe para o lado oposto: uma "proteção" que impedisse
    // atualizar um campo já preenchido estaria errada. O cliente disse clínica
    // e depois corrigiu para estética — vale a última palavra dele.
    const banco = bancoFalso({ segmento: "clinica" });

    await updateLeadHandler(
      banco.supabase,
      ctx,
      LEAD,
      entrada({ custom_fields: { segmento: "estetica" } }),
    );

    expect(banco.linha.custom_fields).toEqual({ segmento: "estetica" });
  });

  it("PATCH sem `custom_fields` não encosta no jsonb", async () => {
    // O caso degenerado que mais assusta: alguém renomeia o negócio pela tela e
    // o formulário manda só o título. Se a coluna entrasse no patch aqui, toda
    // edição de título zeraria o que o agente e a atendente anotaram.
    const banco = bancoFalso({ segmento: "clinica", prazo: "30 dias" });

    await updateLeadHandler(
      banco.supabase,
      ctx,
      LEAD,
      entrada({ title: "Carlos — Clínica Vida Odonto" }),
    );

    expect(banco.patch()).not.toHaveProperty("custom_fields");
    expect(banco.linha.custom_fields).toEqual({ segmento: "clinica", prazo: "30 dias" });
    expect(banco.linha.title).toBe("Carlos — Clínica Vida Odonto");
  });

  it("`custom_fields: {}` explícito reescreve a coluna com o MESMO conteúdo (medido)", async () => {
    // COMPORTAMENTO ATUAL, medido e documentado — não é o que se desenharia do
    // zero, mas é o que vale hoje e é seguro:
    //
    //   1. `{}` passa pelo zod (`z.record(...).optional()` aceita objeto vazio);
    //   2. `input.custom_fields !== undefined` é VERDADE, então a coluna ENTRA
    //      no patch — diferente do caso acima, em que a chave nem aparece;
    //   3. o merge de `{}` sobre o que existia devolve o que existia, então
    //      nada se perde;
    //   4. como o valor é idêntico ao anterior, `camposAlterados` não lista o
    //      campo, a lista fica vazia e NENHUMA atividade é escrita na linha do
    //      tempo — "salvar sem mexer em nada não é acontecimento".
    //
    // Ou seja: `{}` é um write no-op, não um "limpe tudo". Quem um dia quiser
    // que `{}` limpe a ficha vai ter de decidir isso de propósito — e este teste
    // é quem vai avisar que a decisão está sendo tomada.
    const banco = bancoFalso({ segmento: "clinica", prazo: "30 dias" });

    await updateLeadHandler(banco.supabase, ctx, LEAD, entrada({ custom_fields: {} }));

    expect(banco.patch()).toHaveProperty("custom_fields");
    expect(banco.patch()?.custom_fields).toEqual({ segmento: "clinica", prazo: "30 dias" });
    expect(banco.linha.custom_fields).toEqual({ segmento: "clinica", prazo: "30 dias" });
    expect(emitLeadActivity).not.toHaveBeenCalled();
  });
});
