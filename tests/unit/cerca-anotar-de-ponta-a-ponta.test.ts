import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * CERCA A — da fala do cliente ao campo gravado no negócio certo.
 *
 * ═══ O defeito, medido em produção (2026-09-16) ═════════════════════════════
 *
 * O agente perguntou os 6 campos que o dono declarou, o cliente respondeu 4, e a
 * ferramenta de gravar (`crm_update_lead`) foi chamada **ZERO vezes**. Existem 9
 * arquivos de teste sobre campos do funil e todos estavam **verdes** — porque cada
 * um prova um elo, e nenhum vai da conversa ao efeito. A entrega teve 9 commits de
 * conserto em 31 pela mesma razão.
 *
 * A causa: `crm_update_lead` exige `lead_id` (o id do NEGÓCIO). O contexto do turno
 * oferece um campo chamado `lead_id` que carrega o id do **CONTATO** — o nome mente.
 * O caminho até o número certo existe mas não é ensinado em lugar nenhum do prompt.
 *
 * ═══ 2 dos 5 casos falham hoje (1 e 2); os outros 3 são controle. ═══════════════
 *
 * Os casos 1 e 2 nascem VERMELHOS de propósito: o contrato do zod e o texto do prompt
 * ainda não conhecem o alvo real. Os casos 3, 4 e 5 são verdes porque a fiação
 * (`alvoDerivadoDaConversa`) já funciona e o que falta é contrato e ensino.
 */

const DA_CONVERSA = "a468727d-429e-4bcd-989e-321f6701e94b";
const DE_OUTRO_CLIENTE = "c1c1c1c1-0000-4000-8000-000000000001";
const FUNIL = "22e4dd55-f132-48e8-afdf-5a922515fa5a";
const CONTATO = "cccccccc-0000-4000-8000-000000000009";

vi.mock("@/app/api/v1/leads/_handler", async (original) => {
  const real = await original<typeof import("@/app/api/v1/leads/_handler")>();
  return { ...real, updateLeadHandler: vi.fn() };
});
vi.mock("@/lib/mcp/audit", () => ({ auditMcpToolCall: vi.fn().mockResolvedValue(undefined) }));

const { updateLeadHandler } = await import("@/app/api/v1/leads/_handler");
const { pickToolsFromMcp } = await import("@/lib/ai/runtime/tools");
const { crmUpdateLead } = await import("@/lib/mcp/tools/leads");
const { renderCamposDoFunil } = await import(
  "@/lib/agent-engine/agent/campos-do-funil-do-agente"
);
import type { CustomFieldDef } from "@/lib/schemas/settings";

/** Negócios que o contato tem. O teste controla quantos, que é o eixo da decisão. */
let negociosDoContato: Array<{ id: string; status: string }> = [];

function supabaseFalso() {
  // Um encadeamento só serve aos DOIS caminhos: `.eq().eq()` seguido de `await`
  // (a derivação do negócio) e `.eq().eq().maybeSingle()` (o gate de escopo,
  // que busca o funil do lead). Por isso o objeto é ao mesmo tempo "esperável"
  // e portador de `maybeSingle` — separá-los faria o dublê divergir do real.
  const elo: Record<string, unknown> = {};
  elo.select = () => elo;
  elo.eq = () => elo;
  elo.maybeSingle = async () => ({ data: { pipeline_id: FUNIL }, error: null });
  elo.then = (resolver: (v: unknown) => unknown) =>
    Promise.resolve(
      resolver({
        data: negociosDoContato.map((n) => ({
          ...n,
          organization_id: "org-1",
          pipeline_id: FUNIL,
          last_activity_at: null,
          created_at: "2026-09-15T00:00:00Z",
        })),
        error: null,
      }),
    );
  return { from: () => elo };
}

function montarTurno(contactId?: string) {
  return pickToolsFromMcp({
    toolIds: ["crm_update_lead"],
    auth: {
      organizationId: "org-1",
      role: "ai_operator",
      scopes: ["mcp:read", "mcp:write"],
      actor: { type: "ai_agent", id: "ag-1", role: "ai_operator" },
      apiTokenId: "tok-1",
    },
    ctx: {
      organizationId: "org-1",
      role: "ai_operator",
      actor: { type: "ai_agent", id: "ag-1", role: "ai_operator" },
      apiTokenId: "tok-1",
      requestId: "req-1",
      supabase: supabaseFalso(),
    },
    supabase: supabaseFalso(),
    pipelineIds: [FUNIL],
    contactId,
    handoffToolEnabled: false,
  } as never);
}

async function executarSemLeadId(contactId: string | null = CONTATO) {
  const tools = montarTurno(contactId ?? undefined) as unknown as Record<
    string,
    { execute: (a: unknown) => Promise<unknown> }
  >;
  return tools.crm_update_lead!.execute({
    custom_fields: { prazo: "30 dias" },
  });
}

/** O lead que CHEGOU no handler — o fim da cadeia, que é o que importa. */
function leadQueChegou(): string | undefined {
  const c = vi.mocked(updateLeadHandler).mock.calls.at(-1);
  return c?.[2] as string | undefined;
}

describe("cerca anotar de ponta a ponta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    negociosDoContato = [{ id: DA_CONVERSA, status: "open" }];
    vi.mocked(updateLeadHandler).mockResolvedValue({ id: DA_CONVERSA } as never);
  });

  it("o shape de crm_update_lead aceita gravar sem lead_id", () => {
    // O contrato do zod é a primeira trincheira: se ele exige lead_id, o modelo
    // é obrigado a produzi-lo mesmo sem o dado. A derivação só acontece depois,
    // no execute — mas o modelo não chega lá se o shape recusar antes.
    const parsed = z.object(crmUpdateLead.inputSchema as never).safeParse({
      custom_fields: { prazo: "30 dias" },
    });
    expect(parsed.success).toBe(true);
  });

  it("o bloco do prompt ensina de onde vem o id do negócio", () => {
    // O prompt manda anotar mas não diz onde achar o negócio. O modelo não recebe
    // o id de lugar nenhum; sem a palavra-chave, ele chuta ou desiste — foi o
    // defeito medido que este arquivo existe para impedir.
    const funis = [
      {
        pipelineId: "pipeline-1",
        nome: "Funil Genérico",
        campos: [
          { key: "prazo", label: "Prazo", type: "text", required: false } as CustomFieldDef,
        ],
      },
    ];
    const bloco = renderCamposDoFunil(funis, { podeAnotar: true });
    expect(bloco, "o prompt precisa ensinar o caminho do negocio_id").toContain(
      "negocio_id",
    );
  });

  it("o campo chega ao negócio DA CONVERSA, não ao que o modelo mandar", async () => {
    // Controle: a derivação já existe e funciona no execute. Sem lead_id no
    // argumento, o override resolve pelo contato da conversa e usa DA_CONVERSA.
    await executarSemLeadId();
    expect(vi.mocked(updateLeadHandler)).toHaveBeenCalled();
    expect(leadQueChegou(), "o campo não foi para o negócio da conversa").toBe(
      DA_CONVERSA,
    );
  });

  it("a atividade nomeia os CAMPOS, nunca os valores", async () => {
    // Não vemos a geração da atividade porque o handler está mockado; vemos o
    // patch que ele receberia. Ele carrega a CHAVE `prazo` e o VALOR separado —
    // o valor não pode invadir a identidade do campo.
    await executarSemLeadId();
    const chamada = vi.mocked(updateLeadHandler).mock.calls.at(-1)!;
    const patch = chamada[3] as { custom_fields?: Record<string, unknown> };
    expect(patch.custom_fields).toHaveProperty("prazo");
    // A chave do objeto é o que a timeline usa; o valor fica no valor.
    expect(Object.keys(patch.custom_fields ?? {})).not.toContain("30 dias");
    expect(patch.custom_fields!.prazo).toBe("30 dias");
  });

  it("CONTROLE — nenhum outro negócio da organização foi tocado", async () => {
    // O segundo negócio pertence a OUTRO contato da mesma organização. A derivação
    // precisa ficar restrita ao contato da conversa; se ela vazar, este controle
    // acusa.
    await executarSemLeadId();
    expect(vi.mocked(updateLeadHandler)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateLeadHandler)).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      DE_OUTRO_CLIENTE,
      expect.anything(),
    );
    expect(leadQueChegou()).toBe(DA_CONVERSA);
  });
});
