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
/**
 * O DUBLÊ DO BANCO PRECISA MESCLAR DE VERDADE.
 *
 * O merge saiu do handler e foi para `fn_lead_anotar_campos` (migration 0269),
 * porque no aplicativo ele perdia escrita concorrente em silêncio. Um dublê que
 * devolvesse `null` faria este arquivo medir o mock, não o produto — então ele
 * faz o que a função faz: `||` raso sobre o que já está na linha.
 *
 * `chamadasDaRpc` é a asserção de CAUSA: prova que o handler DELEGOU, e não que
 * ele voltou a mesclar por conta própria e deu certo por coincidência.
 */
const chamadasDaRpc: Array<{ nome: string; args: Record<string, unknown> }> = [];
let campoDoBancoFalso: Record<string, unknown> = {};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadasDaRpc.push({ nome, args });
      if (nome !== "fn_lead_anotar_campos") return { data: null, error: null };
      campoDoBancoFalso = {
        ...campoDoBancoFalso,
        ...(args.p_campos as Record<string, unknown>),
      };
      return { data: { ...campoDoBancoFalso }, error: null };
    },
  })),
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
const AGENTE = "44444444-4444-4444-8444-444444444444";

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
  chamadasDaRpc.length = 0;
  campoDoBancoFalso = {};
});

describe("campos personalizados do funil sobrevivem a anotação em pingue-pongue", () => {
  it("anotar um campo novo NÃO apaga os que já estavam lá", async () => {
    // O caso de verdade: o agente anotou o segmento na segunda-feira, a
    // atendente digitou o prazo à mão na terça, e hoje o cliente falou o tipo
    // de projeto. Os três têm de coexistir.
    const banco = bancoFalso({ segmento: "clinica", prazo: "30 dias" });
    campoDoBancoFalso = { segmento: "clinica", prazo: "30 dias" };

    const atualizado = await updateLeadHandler(
      banco.supabase,
      ctx,
      LEAD,
      entrada({ custom_fields: { tipo_projeto: "site" } }),
    );

    // ⛔ A COLUNA NÃO PODE ESTAR NO PATCH. Esta é a asserção que vale hoje: se
    // ela voltar, o merge voltou para o aplicativo e a corrida volta junto.
    expect(
      banco.patch(),
      "custom_fields voltou ao UPDATE — o merge saiu do banco",
    ).not.toHaveProperty("custom_fields");

    // E DELEGOU, com os argumentos certos. Sem isto, um handler que
    // simplesmente ignorasse `custom_fields` também passaria na asserção acima.
    const anotou = chamadasDaRpc.filter((c) => c.nome === "fn_lead_anotar_campos");
    expect(anotou, "o handler não chamou fn_lead_anotar_campos").toHaveLength(1);
    expect(anotou[0]!.args.p_lead).toBe(LEAD);
    expect(anotou[0]!.args.p_org).toBe(ORG);
    // Manda SÓ o que chegou, nunca o objeto inteiro relido: mandar o inteiro
    // reintroduziria a leitura velha por outro caminho.
    expect(anotou[0]!.args.p_campos).toEqual({ tipo_projeto: "site" });

    // E a resposta ao cliente traz o que o BANCO devolveu, com os três juntos.
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
    campoDoBancoFalso = { segmento: "clinica" };

    const atualizado = await updateLeadHandler(
      banco.supabase,
      ctx,
      LEAD,
      entrada({ custom_fields: { segmento: "estetica" } }),
    );

    expect(atualizado.custom_fields).toEqual({ segmento: "estetica" });
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

    campoDoBancoFalso = { segmento: "clinica", prazo: "30 dias" };

    const atualizado = await updateLeadHandler(
      banco.supabase,
      ctx,
      LEAD,
      entrada({ custom_fields: {} }),
    );

    // ⚠️ ATUALIZADO NA 0269: a coluna NÃO entra mais no patch (quem mescla é o
    // banco), e por isso o item 2 do comentário acima deixou de valer. O resto
    // vale igual, e por um caminho melhor: `{}` chega à função, o `||` devolve
    // o que existia, e como nada mudou nenhuma atividade é escrita.
    expect(banco.patch()).not.toHaveProperty("custom_fields");
    expect(atualizado.custom_fields).toEqual({ segmento: "clinica", prazo: "30 dias" });
    expect(
      emitLeadActivity,
      "salvar sem mexer em nada virou acontecimento na linha do tempo",
    ).not.toHaveBeenCalled();
  });
});

describe("precedência: o agente não sobrescreve o que já está preenchido", () => {
  /**
   * ⛔ PRECEDÊNCIA EM CÓDIGO, NÃO EM INSTRUÇÃO.
   *
   * O bloco do prefixo já diz ao modelo "não sobrescreva campo já preenchido"
   * (regra 4). Instrução o modelo desobedece — e desobedecer aqui apaga o que
   * uma pessoa digitou, que é o dano que não se desfaz sozinho.
   *
   * ## Presença, e não autoria — e isto foi MEDIDO, não escolhido por gosto
   *
   * A prosa do plano dizia "não sobrescreva o que GENTE escreveu". Medi: não há
   * como saber. `crm_lead_activities` guarda `performed_by_user_id`, mas o
   * `fields` da atividade diz apenas `custom_fields` — nunca QUAL chave. Saber a
   * autoria por campo exigiria uma coluna nova só para isso.
   *
   * O próprio teste do plano usa presença (`custom_fields: { segmento: … }` →
   * não sobrescreve), então a regra que vale é: **chave com valor não vazio não
   * é sobrescrita pelo agente.** É mais restritiva que autoria — o agente
   * também não corrige o que ele mesmo escreveu — e essa restrição a mais é
   * segura: mudar dado já registrado merece o olho de uma pessoa.
   *
   * ## Só o AGENTE é barrado
   *
   * Quem edita pela tela do dossiê passa pelo MESMO handler. Barrar ali
   * impediria a atendente de corrigir um campo — o oposto do que se quer.
   * `ctx.actor.type` é quem distingue.
   */
  const CTX_AGENTE: HandlerCtx = {
    organization_id: ORG,
    actor: { type: "ai_agent", id: "run-1", role: "ai_operator", agent_id: AGENTE },
    requestId: "req-precedencia",
  };

  it("⛔ chave JÁ preenchida não é sobrescrita pelo agente", async () => {
    const banco = bancoFalso({ segmento: "clinica" });
    campoDoBancoFalso = { segmento: "clinica" };

    const atualizado = await updateLeadHandler(
      banco.supabase,
      CTX_AGENTE,
      LEAD,
      entrada({ custom_fields: { segmento: "estetica" } }),
    );

    // O valor gravado NÃO muda.
    expect(atualizado.custom_fields).toEqual({ segmento: "clinica" });
    // E a chave conflitante nem chega à função de merge — barrar depois de
    // gravar não é barrar.
    const anotou = chamadasDaRpc.filter((c) => c.nome === "fn_lead_anotar_campos");
    expect(anotou, "o agente escreveu por cima e só depois alguém reclamou").toHaveLength(0);
  });

  it("chave VAZIA é gravada direto — não há o que proteger", async () => {
    const banco = bancoFalso({ segmento: "clinica" });
    campoDoBancoFalso = { segmento: "clinica" };

    await updateLeadHandler(
      banco.supabase,
      CTX_AGENTE,
      LEAD,
      entrada({ custom_fields: { prazo: "30 dias" } }),
    );

    const anotou = chamadasDaRpc.filter((c) => c.nome === "fn_lead_anotar_campos");
    expect(anotou).toHaveLength(1);
    expect(anotou[0]!.args.p_campos).toEqual({ prazo: "30 dias" });
  });

  it("escrita MISTA: passa a nova e segura a conflitante", async () => {
    // O caso que uma implementação de tudo-ou-nada erraria: recusar o lote
    // inteiro perderia o campo novo, que não tinha conflito nenhum.
    const banco = bancoFalso({ segmento: "clinica" });
    campoDoBancoFalso = { segmento: "clinica" };

    await updateLeadHandler(
      banco.supabase,
      CTX_AGENTE,
      LEAD,
      entrada({ custom_fields: { segmento: "estetica", prazo: "30 dias" } }),
    );

    const anotou = chamadasDaRpc.filter((c) => c.nome === "fn_lead_anotar_campos");
    expect(anotou).toHaveLength(1);
    expect(anotou[0]!.args.p_campos).toEqual({ prazo: "30 dias" });
  });

  it("valor VAZIO no banco não conta como preenchido", async () => {
    // `""` e `null` são ausência, não decisão de ninguém. Tratá-los como
    // preenchido travaria o campo para sempre no primeiro salvamento em branco.
    const banco = bancoFalso({ segmento: "", prazo: null });
    campoDoBancoFalso = { segmento: "", prazo: null };

    await updateLeadHandler(
      banco.supabase,
      CTX_AGENTE,
      LEAD,
      entrada({ custom_fields: { segmento: "clinica", prazo: "30 dias" } }),
    );

    const anotou = chamadasDaRpc.filter((c) => c.nome === "fn_lead_anotar_campos");
    expect(anotou[0]!.args.p_campos).toEqual({ segmento: "clinica", prazo: "30 dias" });
  });

  it("CONTROLE: a MESMA escrita por uma PESSOA sobrescreve", async () => {
    // Sem este caso, uma implementação que barrasse todo mundo passaria nos
    // quatro acima — e a atendente não conseguiria mais corrigir um campo.
    const banco = bancoFalso({ segmento: "clinica" });
    campoDoBancoFalso = { segmento: "clinica" };

    await updateLeadHandler(
      banco.supabase,
      ctx,
      LEAD,
      entrada({ custom_fields: { segmento: "estetica" } }),
    );

    const anotou = chamadasDaRpc.filter((c) => c.nome === "fn_lead_anotar_campos");
    expect(anotou, "a pessoa foi barrada junto com o agente").toHaveLength(1);
    expect(anotou[0]!.args.p_campos).toEqual({ segmento: "estetica" });
  });
});
