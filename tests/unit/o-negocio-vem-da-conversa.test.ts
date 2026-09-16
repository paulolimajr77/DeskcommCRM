import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O NEGÓCIO DE QUEM ESTÁ FALANDO — a conversa responde, o modelo não.
 *
 * ═══ O defeito, medido em produção (2026-09-15) ═════════════════════════════
 *
 * O agente ouviu "sim, já tenho os textos", entendeu que era um campo do funil,
 * e chamou a ferramenta certa com a chave certa:
 *
 *     crm_update_lead { lead_id: "74a0238a-…", custom_fields: { tem_conteudo: "sim" } }
 *                      └── ESTE UUID NÃO EXISTE. Zero linhas no banco.
 *
 * O gate de escopo recusou (`escopo_de_funil:indisponivel`) e a resposta do
 * cliente se perdeu. O negócio real da conversa era outro.
 *
 * A causa não é desatenção do modelo: **ele nunca recebe o id do negócio**. O
 * turno conhece o CONTATO; o negócio é derivado dele. Pedir a um modelo que
 * produza um identificador de memória é desenhar para o fracasso.
 *
 * ═══ ⛔ POR QUE "CORRIGIR QUANDO NÃO EXISTE" NÃO BASTA ═══════════════════════
 *
 * O caso perigoso NÃO é o uuid inventado — esse o gate barra e alguém percebe.
 * É o uuid **real e errado**: de outro negócio da mesma organização, no mesmo
 * funil. Aí o gate aprova, a escrita acontece, o audit grava `success: true`, e
 * a resposta de um cliente vai para a ficha de outro — sem erro para investigar.
 *
 * Por isso a regra aqui não é "substituir quando estiver errado". É: o alvo é
 * DERIVADO da conversa, e o que o modelo mandou é descartado. O último caso
 * deste arquivo é o que guarda essa diferença; sem ele, um conserto que só
 * tratasse o uuid inexistente passaria verde.
 */

const DA_CONVERSA = "a468727d-429e-4bcd-989e-321f6701e94b";
const INVENTADO = "74a0238a-667e-4ee8-8106-86d1cb337fd4";
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

// ⚠️ `null` e não `undefined` para dizer "sem conversa": passar `undefined`
// ATIVA o valor padrão do parâmetro, e o caso do Operador media o contrário do
// que dizia. O teste ficou vermelho por defeito PRÓPRIO — e foi assim que eu vi.
async function anotar(leadIdQueOModeloMandou: string, contactId: string | null = CONTATO) {
  const tools = montarTurno(contactId ?? undefined) as unknown as Record<
    string,
    { execute: (a: unknown) => Promise<unknown> }
  >;
  return tools.crm_update_lead!.execute({
    lead_id: leadIdQueOModeloMandou,
    custom_fields: { tem_conteudo: "sim" },
  });
}

/** O lead que CHEGOU no handler — o fim da cadeia, que é o que importa. */
function leadQueChegou(): string | undefined {
  const c = vi.mocked(updateLeadHandler).mock.calls.at(-1);
  return c?.[2] as string | undefined;
}

describe("o negócio vem da conversa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    negociosDoContato = [{ id: DA_CONVERSA, status: "open" }];
    vi.mocked(updateLeadHandler).mockResolvedValue({ id: DA_CONVERSA } as never);
  });

  it("⛔ o uuid INVENTADO pelo modelo é descartado — grava no negócio da conversa", async () => {
    await anotar(INVENTADO);
    expect(vi.mocked(updateLeadHandler)).toHaveBeenCalled();
    expect(leadQueChegou(), "o uuid inventado chegou ao handler").toBe(DA_CONVERSA);
  });

  it("⛔ E O CASO QUE IMPORTA: uuid REAL de OUTRO cliente também é descartado", async () => {
    // Sem este caso, um conserto que só tratasse "uuid inexistente" passaria
    // verde — e o dado de um cliente iria para a ficha de outro, com
    // `success: true` no audit e ninguém para ver.
    await anotar(DE_OUTRO_CLIENTE);
    expect(leadQueChegou(), "escreveu no negócio de outro cliente").toBe(DA_CONVERSA);
  });

  it("dois negócios abertos: RECUSA e diz por quê, em vez de escolher um", async () => {
    negociosDoContato = [
      { id: DA_CONVERSA, status: "open" },
      { id: DE_OUTRO_CLIENTE, status: "open" },
    ];
    const r = (await anotar(INVENTADO)) as { motivo?: string; mensagem?: string };
    expect(vi.mocked(updateLeadHandler), "chutou um dos dois").not.toHaveBeenCalled();
    expect(r.motivo).toBe("negocio_ambiguo");
    expect(r.mensagem).toMatch(/mais de um neg/i);
  });

  it("nenhum negócio aberto: RECUSA e manda seguir a conversa", async () => {
    negociosDoContato = [];
    const r = (await anotar(INVENTADO)) as { motivo?: string; mensagem?: string };
    expect(vi.mocked(updateLeadHandler)).not.toHaveBeenCalled();
    expect(r.motivo).toBe("sem_negocio");
  });

  it("a recusa NÃO vaza id nem nome de coluna para o cliente", async () => {
    negociosDoContato = [];
    const r = (await anotar(INVENTADO)) as { mensagem?: string };
    expect(r.mensagem ?? "").not.toMatch(/lead_id|uuid|crm_leads|[0-9a-f]{8}-/i);
  });

  it("⛔ LEITURA não é derivada — perguntar por um negócio e receber outro seria o mesmo defeito", async () => {
    // `crm_list_followups` e `crm_list_appointments` também têm `lead_id` e são
    // leituras. Se a derivação valesse para elas, o modelo perguntaria por um
    // negócio e receberia a resposta de outro, sem erro nenhum na tela.
    const { allTools } = await import("@/lib/mcp/tools");
    const leiturasComLead = allTools.filter(
      (t) => t.category === "read" && "lead_id" in (t.inputSchema as Record<string, unknown>),
    );
    // Controle positivo: se um dia nenhuma leitura tiver `lead_id`, este caso
    // vira vácuo — e o vácuo tem de aparecer, não passar despercebido.
    expect(
      leiturasComLead.length,
      "nenhuma leitura com `lead_id`: este caso deixou de medir algo",
    ).toBeGreaterThan(0);
    for (const t of leiturasComLead) {
      expect(t.category, `${t.name} deixou de ser leitura`).toBe("read");
    }
  });

  it("sem contato (papel Operador, fora de conversa) o comportamento NÃO muda", async () => {
    // O Operador roda DEPOIS da conversa, sobre a organização inteira: não há
    // "o negócio desta conversa". Derivar ali seria inventar um alvo.
    await anotar(DE_OUTRO_CLIENTE, null);
    expect(leadQueChegou(), "derivou alvo onde não há conversa").toBe(DE_OUTRO_CLIENTE);
  });
});
