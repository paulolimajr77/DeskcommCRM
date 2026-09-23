/**
 * A CHAVE DA TELA ENTREGA A FERRAMENTA QUE O PROMPT MANDA USAR.
 *
 * ─── O DEFEITO, MEDIDO (D3) ──────────────────────────────────────────────
 *
 * `PublishedAgentConfig.leadFieldsEnabled` e `.leadFieldsProposeNew` são lidos
 * do banco (`agent-config.ts`), o prompt do turno manda usar
 * `crm_update_lead`/`crm_propose_lead_field` quando a chave está ligada — e a
 * ponte `pickToolsFromMcp` NUNCA montava nenhuma das duas. Falha sem culpado:
 * o dono vê a tela dizendo "ligado", o modelo recebe a ordem, e a ferramenta
 * não está lá. Nem erro, nem aviso — só silêncio.
 *
 * ─── O PADRÃO QUE RESOLVE ────────────────────────────────────────────────
 *
 * O MESMO que `handoffToolEnabled` já usa no final de `pickToolsFromMcp`:
 * auto-injeta a ferramenta quando a chave está ligada e ela ainda não está no
 * `result`. A garantia é a MESMA — a chave ACRESCENTA, nunca remove: o dono
 * pode ter escolhido a ferramenta à mão em modo avançado (`toolIds`
 * explícito), e desligar a chave não pode tirar o que ele pôs lá.
 *
 * ─── POR QUE ESTA CERCA EXISTE ───────────────────────────────────────────
 *
 * Sem ela, acrescentar uma terceira chave amanhã reintroduz o defeito em
 * silêncio. A lista `CHAVES_QUE_ESCREVEM_NO_PROMPT` fixa o CONTRATO: toda
 * chave que o prompt cita tem de entregar a ferramenta que ele nomeia.
 */
import { describe, expect, it } from "vitest";

import { pickToolsFromMcp } from "@/lib/ai/runtime/tools";
import type { McpAuthResult } from "@/lib/mcp/auth";
import type { McpContext } from "@/lib/mcp/types";

const ORG = "11111111-1111-4111-8111-111111111111";

/**
 * As duas chaves da tela «campos do funil» que o prompt cita, cada uma com a
 * ferramenta que ela tem de entregar. A cerca do caso "CERCA" percorre esta
 * lista — uma entrada nova aqui vira uma asserção nova, sem tocar em mais nada.
 */
const CHAVES_QUE_ESCREVEM_NO_PROMPT: Array<{
  flag: "leadFieldsEnabled" | "leadFieldsProposeNew";
  ferramentasCitadas: string[];
}> = [
  { flag: "leadFieldsEnabled", ferramentasCitadas: ["crm_update_lead"] },
  { flag: "leadFieldsProposeNew", ferramentasCitadas: ["crm_propose_lead_field"] },
];

function contexto() {
  const ctx = {
    organizationId: ORG,
    role: "ai_operator",
    actor: { type: "ai_agent", id: "agente-1", role: "ai_operator" },
    apiTokenId: "tok-1",
    requestId: "run-1",
    supabase: {} as never,
  } as unknown as McpContext;
  const auth = {
    organizationId: ORG,
    role: "ai_operator",
    actor: ctx.actor,
    apiTokenId: "tok-1",
    scopes: ["mcp:read", "mcp:write", "actor:ai_agent", "role:ai_operator"],
  } as unknown as McpAuthResult;
  return { ctx, auth };
}

describe("a chave entrega a ferramenta", () => {
  it("ligar lead_fields_enabled acrescenta crm_update_lead mesmo fora de tool_ids", () => {
    const { ctx, auth } = contexto();
    const base = {
      supabase: ctx.supabase,
      ctx,
      auth,
      handoffToolEnabled: false,
      handoffSignal: { triggered: false },
    };
    const t = pickToolsFromMcp({ ...base, toolIds: [], leadFieldsEnabled: true });
    expect(Object.keys(t)).toContain("crm_update_lead");
  });

  it("ligar lead_fields_propose_new acrescenta crm_propose_lead_field", () => {
    const { ctx, auth } = contexto();
    const base = {
      supabase: ctx.supabase,
      ctx,
      auth,
      handoffToolEnabled: false,
      handoffSignal: { triggered: false },
    };
    const t = pickToolsFromMcp({ ...base, toolIds: [], leadFieldsProposeNew: true });
    expect(Object.keys(t)).toContain("crm_propose_lead_field");
  });

  it("DEGENERADO — desligar a chave NÃO remove a ferramenta escolhida à mão", () => {
    // A chave ACRESCENTA, nunca remove: o dono pode tê-la escolhido em modo
    // avançado, e uma chave que tira o que o dono pôs é a chave decidindo por ele.
    const { ctx, auth } = contexto();
    const base = {
      supabase: ctx.supabase,
      ctx,
      auth,
      handoffToolEnabled: false,
      handoffSignal: { triggered: false },
    };
    const t = pickToolsFromMcp({ ...base, toolIds: ["crm_update_lead"], leadFieldsEnabled: false });
    expect(Object.keys(t)).toContain("crm_update_lead");
  });

  it("CERCA — nenhuma chave nomeia no prompt uma ferramenta que ela não entrega", () => {
    // D3, em forma de guarda: o bloco do prompt mandava usar `crm_update_lead` e
    // a chave não a entregava. Falha sem culpado — a tela dizia ligado, o prompt
    // dava a ordem, e a ferramenta não estava lá.
    for (const chave of CHAVES_QUE_ESCREVEM_NO_PROMPT) {
      const { ctx, auth } = contexto();
      const base = {
        supabase: ctx.supabase,
        ctx,
        auth,
        handoffToolEnabled: false,
        handoffSignal: { triggered: false },
      };
      const t = pickToolsFromMcp({ ...base, toolIds: [], [chave.flag]: true });
      for (const nome of chave.ferramentasCitadas) expect(Object.keys(t)).toContain(nome);
    }
  });
});
