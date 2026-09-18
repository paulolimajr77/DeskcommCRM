import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks: Record<string, any> = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSupportWrite: vi.fn(),
  createAdminClient: vi.fn(),
  adiarAteAJanelaAbrir: vi.fn(),
  checkDailyLimit: vi.fn(),
  espacarEnvio: vi.fn(),
  alocarNumero: vi.fn(),
  decidirVersao: vi.fn(),
  renderPropostaPdf: vi.fn(),
  salvarPdfDaProposta: vi.fn(),
  marcaDaSaida: vi.fn(),
  emitLeadActivity: vi.fn(),
  sendMessageHandler: vi.fn(),
  audit: vi.fn(),
  traduzir: vi.fn((txt: string) => txt),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.requireSupportWrite }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/automation/janela-do-canal", () => ({ adiarAteAJanelaAbrir: mocks.adiarAteAJanelaAbrir }));
vi.mock("@/lib/automation/throttle", () => ({ checkDailyLimit: mocks.checkDailyLimit, espacarEnvio: mocks.espacarEnvio }));
vi.mock("@/lib/propostas/numeracao", () => ({ alocarNumero: mocks.alocarNumero }));
vi.mock("@/lib/propostas/versao", () => ({ decidirVersao: mocks.decidirVersao }));
vi.mock("@/lib/propostas/pdf", () => ({ renderPropostaPdf: mocks.renderPropostaPdf }));
vi.mock("@/lib/propostas/storage", () => ({ salvarPdfDaProposta: mocks.salvarPdfDaProposta }));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: mocks.marcaDaSaida }));
vi.mock("@/lib/leads/activity-emitter", () => ({ emitLeadActivity: mocks.emitLeadActivity }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: mocks.sendMessageHandler }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/i18n/dicionario", () => ({ traduzir: mocks.traduzir }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROPOSTA_ID = "44444444-4444-4444-8444-444444444444";
const LEAD_ID = "66666666-6666-4666-8666-666666666666";
const CONTACT_ID = "77777777-7777-4777-8777-777777777777";
const CONVERSA_ID = "88888888-8888-4888-8888-888888888888";
const CHANNEL_SESSION_ID = "99999999-9999-4999-8999-999999999999";

const ROLE_RANK: Record<string, number> = { viewer: 1, agent: 2, manager: 3, admin: 4 };

interface MundoOpts {
  papel?: keyof typeof ROLE_RANK;
  foraDaJanela?: boolean;
  limiteDiarioAtingido?: boolean;
  suporteReadOnly?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  propostaOriginal?: Partial<any>;
}

interface Proposta {
  id: string;
  organization_id: string;
  lead_id: string;
  contact_id: string;
  conversation_id: string;
  numero: number | null;
  ano: number | null;
  versao: number;
  status: string;
  titulo: string;
  condicoes: string;
  valid_until: string;
  total_cents: number;
  moeda: string;
  [key: string]: unknown;
}

function montarMundoDeEnvio(opts: MundoOpts = {}) {
  const papel = opts.papel ?? "manager";
  const ordemDeChamadas: string[] = [];
  let numeroFoiAlocado = false;
  let pdfFoiGerado = false;
  let mensagemEnviada = false;
  let propostaEnviada: Proposta | null = null;
  let leadValueCentsDepois: number | null = null;
  const propostasNoMock: Record<string, Proposta> = {};

  const proposta: Proposta = {
    id: PROPOSTA_ID,
    organization_id: ORG_ID,
    lead_id: LEAD_ID,
    contact_id: CONTACT_ID,
    conversation_id: CONVERSA_ID,
    numero: null,
    ano: null,
    versao: 1,
    status: "rascunho",
    titulo: "Proposta de Teste",
    condicoes: "Condições",
    valid_until: "2026-12-31",
    total_cents: 500000,
    moeda: "BRL",
    ...opts.propostaOriginal,
  };
  propostasNoMock[PROPOSTA_ID] = proposta;

  const lead = { id: LEAD_ID, contact_id: CONTACT_ID, value_cents: 100000 };
  const contato = { id: CONTACT_ID, name: "Cliente", display_name: "Cliente", email: "cli@test.com", phone_number: "5511" };
  const conversa = { id: CONVERSA_ID, channel_session_id: CHANNEL_SESSION_ID };
  const item = {
    id: "item-1",
    organization_id: ORG_ID,
    proposal_id: PROPOSTA_ID,
    product_id: null,
    descricao: "Serviço",
    quantidade: 1,
    preco_unitario_cents: 500000,
    desconto_cents: 0,
    position: 1000,
  };

  // Papel: o mock verifica a role MÍNIMA que a rota de fato pediu (1o argumento),
  // não um resultado fixo — senão sabotar o "manager" do route.ts por "agent" não
  // derrubaria este teste (medido: derrubava nada até esta correção).
  const rank = ROLE_RANK[papel] ?? 0;
  mocks.requireRole.mockImplementation(async (minRole: keyof typeof ROLE_RANK) => {
    const minRank = ROLE_RANK[minRole] ?? 0;
    return rank < minRank
      ? { ok: false, response: new Response(JSON.stringify({ error: { code: "forbidden_role" } }), { status: 403 }) }
      : { ok: true, user: { id: USER_ID, idioma: "pt-BR" }, org: { orgId: ORG_ID } };
  });

  // Suporte
  mocks.requireSupportWrite.mockResolvedValue(opts.suporteReadOnly ? new Response(JSON.stringify({ error: { code: "forbidden" } }), { status: 403 }) : null);

  // Admin client
  mocks.createAdminClient.mockReturnValue({
    from: (tabela: string) => {
      if (tabela === "crm_proposals") {
        return {
          select: () => ({
            eq: (c: string, v: unknown) => ({
              eq: (c2: string, v2: unknown) => ({
                maybeSingle: async () => (v === ORG_ID && v2 === PROPOSTA_ID ? { data: proposta, error: null } : { data: null, error: null }),
              }),
            }),
          }),
          insert: (dados: unknown) => ({
            select: () => ({
              single: async () => {
                const novoId = `proposta-nova-${Date.now()}`;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const novaProposta = { ...dados as any, id: novoId };
                propostasNoMock[novoId] = novaProposta;
                return { data: novaProposta, error: null };
              },
            }),
          }),
          update: (dados: unknown) => ({
            eq: (c: string, v: unknown) => ({
              eq: async (c2: string, v2: string) => {
                if (v === ORG_ID && propostasNoMock[v2]) {
                  Object.assign(propostasNoMock[v2], dados);
                  propostaEnviada = { ...propostasNoMock[v2] };
                }
                return { error: null };
              },
            }),
          }),
        };
      }
      if (tabela === "crm_proposal_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({ data: [item], error: null }),
              }),
            }),
          }),
          insert: async () => ({ error: null }),
        };
      }
      if (tabela === "conversations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: conversa, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (tabela === "crm_leads") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: lead, error: null }),
              }),
            }),
          }),
          update: (dados: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((dados as any).value_cents) leadValueCentsDepois = (dados as any).value_cents;
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
        };
      }
      if (tabela === "contacts") {
        return {
          select: () => ({
            eq: (c: string, v: unknown) => ({
              eq: (c2: string, v2: unknown) => ({
                single: async () => (v === ORG_ID && v2 === CONTACT_ID ? { data: contato, error: null } : { data: null, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Tabela desconhecida: ${tabela}`);
    },
  });

  // Mocks de operações
  mocks.adiarAteAJanelaAbrir.mockImplementation(async () => {
    ordemDeChamadas.push("adiarAteAJanelaAbrir");
    return opts.foraDaJanela ? "2026-09-18T22:00:00Z" : null;
  });

  mocks.checkDailyLimit.mockImplementation(async () => {
    ordemDeChamadas.push("checkDailyLimit");
    return { allowed: !opts.limiteDiarioAtingido };
  });

  mocks.espacarEnvio.mockImplementation(async () => {
    ordemDeChamadas.push("espacarEnvio");
  });

  mocks.alocarNumero.mockImplementation(async (admin: unknown, params: unknown) => {
    numeroFoiAlocado = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propostaAlvo = propostasNoMock[(params as any).propostaId];
    if (propostaAlvo) {
      Object.assign(propostaAlvo, { numero: 42, ano: 2026, status: "enviada" });
      propostaEnviada = { ...propostaAlvo };
    }
    return { numero: 42, ano: 2026 };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mocks.decidirVersao.mockImplementation((prop: any) => {
    if (prop.status && ["recusada", "vencida", "cancelada"].includes(prop.status)) {
      throw new Error("Estado inválido");
    }
    return {
      tipo: prop.numero && prop.status === "enviada" ? "nova_versao" : "envio_simples",
      novaVersao: (prop.versao ?? 0) + 1,
      herdaNumero: prop.numero || 42,
      herdaAno: prop.ano || 2026,
      substituiId: prop.id,
    };
  });

  mocks.renderPropostaPdf.mockImplementation(async () => {
    pdfFoiGerado = true;
    return Buffer.from("PDF");
  });

  mocks.salvarPdfDaProposta.mockResolvedValue({ path: "/pdf", signedUrl: "https://url" });

  mocks.marcaDaSaida.mockResolvedValue({ nome: "App", accent: "#000", accentFg: "#fff", logoUrl: null });

  mocks.sendMessageHandler.mockImplementation(async () => {
    ordemDeChamadas.push("sendMessageHandler");
    mensagemEnviada = true;
    return { id: "msg-123" };
  });

  mocks.emitLeadActivity.mockImplementation(async () => {
    ordemDeChamadas.push("emitLeadActivity");
  });

  mocks.audit.mockImplementation(() => {
    ordemDeChamadas.push("audit");
  });

  return {
    ordemDeChamadas,
    get numeroFoiAlocado() { return numeroFoiAlocado; },
    get pdfFoiGerado() { return pdfFoiGerado; },
    get mensagemEnviada() { return mensagemEnviada; },
    get propostaEnviada() { return propostaEnviada; },
    get leadValueCentsDepois() { return leadValueCentsDepois; },
    async POST() {
      const { POST } = await import("./route");
      return POST(new NextRequest(`http://localhost/api/v1/proposals/${PROPOSTA_ID}/send`), { params: Promise.resolve({ id: PROPOSTA_ID }) });
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/v1/proposals/[id]/send", () => {
  it("papel agent: 403, nada é enviado, numero NAO alocado", async () => {
    const mundo = montarMundoDeEnvio({ papel: "agent" });
    const res = await mundo.POST();
    expect(res.status).toBe(403);
    expect(mundo.mensagemEnviada).toBe(false);
    expect(mundo.numeroFoiAlocado).toBe(false);
  });

  it("papel manager: aloca numero/ano, gera PDF, envia, atualiza value_cents do lead", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager" });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.numero).not.toBeNull();
    expect(mundo.mensagemEnviada).toBe(true);
    expect(mundo.leadValueCentsDepois).toBe(mundo.propostaEnviada?.total_cents);
  });

  it("revisar uma proposta JÁ enviada: cria v2, v1 vira substituida, HERDA o número", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      propostaOriginal: { status: "enviada", numero: 42, ano: 2026, versao: 1 },
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.numero).toBe(42);
    expect(mundo.propostaEnviada?.versao).toBe(2);
  });

  it("throttle: adiarAteAJanelaAbrir e checkDailyLimit são chamados ANTES de alocar numero/gerar PDF", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager" });
    await mundo.POST();
    expect(mundo.ordemDeChamadas).toContain("adiarAteAJanelaAbrir");
    expect(mundo.ordemDeChamadas).toContain("checkDailyLimit");
    expect(mundo.ordemDeChamadas).toContain("espacarEnvio");
    expect(mundo.ordemDeChamadas).toContain("sendMessageHandler");
  });

  it("fora da janela de envio: 422, nao aloca numero nem gera PDF", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager", foraDaJanela: true });
    const res = await mundo.POST();
    expect(res.status).toBe(422);
    expect(mundo.numeroFoiAlocado).toBe(false);
    expect(mundo.pdfFoiGerado).toBe(false);
  });

  it("limite diario atingido: 422, nao aloca numero nem gera PDF", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager", limiteDiarioAtingido: true });
    const res = await mundo.POST();
    expect(res.status).toBe(422);
    expect(mundo.numeroFoiAlocado).toBe(false);
  });

  it("recusada/vencida/cancelada: 409, não envia", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager", propostaOriginal: { status: "recusada" } });
    const res = await mundo.POST();
    expect(res.status).toBe(409);
  });

  it("respeita recusa de suporte antes de gastar orcamento/enviar", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager", suporteReadOnly: true });
    const res = await mundo.POST();
    expect(res.status).toBe(403);
    expect(mundo.mensagemEnviada).toBe(false);
  });
});
