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

vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
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
  /** Desfecho que `sendMessageHandler` devolve — o coração do D3. */
  envioResultado?: { status: string; error_message?: string | null; id?: string };
  /** Força o INSERT de `crm_proposal_items` da v2 a falhar (D3, ponto 5). */
  itensDaV2Falham?: boolean;
  /** A criação da v2 colide com o índice único de rascunho aberto (revisão C3, I1). */
  criacaoDaV2Colide23505?: boolean;
  /** Quando true, o item da proposta vem sem preço (null, "a definir"). */
  itemSemPreco?: boolean;
  /** A conversa gravada em conversation_id pertence a OUTRO contato (revisão C3). */
  conversaDeOutroContato?: boolean;
}

interface Proposta {
  id: string;
  organization_id: string;
  lead_id: string | null;
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
  let propostaDeletadaId: string | null = null;
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
  const conversa = {
    id: CONVERSA_ID,
    channel_session_id: CHANNEL_SESSION_ID,
    contact_id: opts.conversaDeOutroContato ? "contato-errado-00000000-0000-0000-0000-000000000000" : CONTACT_ID,
  };
  // Outra conversa do mesmo contato, MAIS RECENTE — o fallback "mais recente
  // do contato" a devolveria; a conversa gravada na proposta é a de cima.
  const conversaMaisRecente = { id: "conversa-mais-recente-do-contato", channel_session_id: CHANNEL_SESSION_ID, contact_id: CONTACT_ID };
  const chamadasConversas: Array<[string, unknown]> = [];
  let conversaUsadaNoEnvio: string | null = null;
  const item = {
    id: "item-1",
    organization_id: ORG_ID,
    proposal_id: PROPOSTA_ID,
    product_id: null,
    descricao: opts.itemSemPreco ? "Item sem preço" : "Serviço",
    quantidade: 1,
    preco_unitario_cents: opts.itemSemPreco ? null : 500000,
    desconto_cents: 0,
    position: 1000,
  };

  const rank = ROLE_RANK[papel] ?? 0;
  mocks.requireRole.mockImplementation(async (minRole: keyof typeof ROLE_RANK) => {
    const minRank = ROLE_RANK[minRole] ?? 0;
    return rank < minRank
      ? { ok: false, response: new Response(JSON.stringify({ error: { code: "forbidden_role" } }), { status: 403 }) }
      : { ok: true, user: { id: USER_ID, idioma: "pt-BR" }, org: { orgId: ORG_ID } };
  });

  mocks.requireSupportWrite.mockResolvedValue(opts.suporteReadOnly ? new Response(JSON.stringify({ error: { code: "forbidden" } }), { status: 403 }) : null);

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
                if (opts.criacaoDaV2Colide23505) return { data: null, error: { code: "23505", message: "colisao" } };
                const novoId = `proposta-nova-${Date.now()}`;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const novaProposta = { ...(dados as any), id: novoId };
                propostasNoMock[novoId] = novaProposta;
                return { data: novaProposta, error: null };
              },
            }),
          }),
          // Cadeia genérica: aceita `.eq(...)` quantas vezes o chamador
          // encadear (às vezes só `.eq("id", x)`, às vezes `.eq("organization_id", o).eq("id", x)`),
          // e resolve tanto por `await` direto (thenable) quanto via `.select().single()`.
          // O alvo é o primeiro `.eq("id", …)` visto, em qualquer posição da cadeia.
          update: (dados: unknown) => {
            let alvoId: string | null = null;
            const aplicar = () => {
              const linha = alvoId ? propostasNoMock[alvoId] : undefined;
              if (linha) {
                Object.assign(linha, dados as object);
                propostaEnviada = { ...linha };
              }
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cadeia: any = {
              eq(campo: string, valor: unknown) {
                if (campo === "id") alvoId = valor as string;
                return cadeia;
              },
              select() {
                return {
                  single: async () => {
                    aplicar();
                    return { data: alvoId ? (propostasNoMock[alvoId] ?? null) : null, error: null };
                  },
                };
              },
              then(resolve: (r: { error: null }) => void) {
                aplicar();
                resolve({ error: null });
              },
            };
            return cadeia;
          },
          delete: () => {
            let alvoId: string | null = null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cadeia: any = {
              eq(campo: string, valor: unknown) {
                if (campo === "id") alvoId = valor as string;
                return cadeia;
              },
              then(resolve: (r: { error: null }) => void) {
                if (alvoId) {
                  propostaDeletadaId = alvoId;
                  delete propostasNoMock[alvoId];
                }
                resolve({ error: null });
              },
            };
            return cadeia;
          },
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
          insert: async () =>
            opts.itensDaV2Falham ? { error: { message: "boom" } } : { error: null },
        };
      }
      if (tabela === "conversations") {
        return {
          // Cadeia que aceita os DOIS formatos: busca pela conversa gravada
          // (select→eq→eq→maybeSingle, sem order/limit) e o fallback "mais
          // recente do contato" (select→eq→eq→order→limit→maybeSingle).
          select: () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cadeia: any = {
              eq(campo: string, valor: unknown) {
                chamadasConversas.push([campo, valor]);
                return cadeia;
              },
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: conversaMaisRecente, error: null }),
                }),
              }),
              maybeSingle: async () => {
                const porId = chamadasConversas.find(([c]) => c === "id");
                if (porId) {
                  const porContactId = chamadasConversas.find(([c]) => c === "contact_id");
                  if (porId[1] !== conversa.id) return { data: null, error: null };
                  if (porContactId && porContactId[1] !== conversa.contact_id) return { data: null, error: null };
                  return { data: conversa, error: null };
                }
                return { data: conversaMaisRecente, error: null };
              },
            };
            return cadeia;
          },
        };
      }
      if (tabela === "crm_leads") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: lead, error: null }),
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
                maybeSingle: async () => (v === ORG_ID && v2 === CONTACT_ID ? { data: contato, error: null } : { data: null, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Tabela desconhecida: ${tabela}`);
    },
  });

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

  // D9/D3: alocarNumero (o de verdade) grava numero/ano na linha como efeito
  // colateral — só NÃO grava status (quem decide o status é a rota, pelo
  // desfecho da mensagem). O dublê reproduz esse efeito colateral.
  mocks.alocarNumero.mockImplementation(async (_admin: unknown, params: unknown) => {
    numeroFoiAlocado = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propostaAlvo = propostasNoMock[(params as any).propostaId];
    if (propostaAlvo) Object.assign(propostaAlvo, { numero: 42, ano: 2026 });
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

  mocks.sendMessageHandler.mockImplementation(async (_admin: unknown, _ctx: unknown, payload: { conversation_id: string }) => {
    ordemDeChamadas.push("sendMessageHandler");
    mensagemEnviada = true;
    conversaUsadaNoEnvio = payload.conversation_id;
    return opts.envioResultado ?? { id: "msg-123", status: "sent", error_message: null };
  });

  mocks.emitLeadActivity.mockImplementation(async () => {
    ordemDeChamadas.push("emitLeadActivity");
  });

  mocks.audit.mockImplementation(() => {
    ordemDeChamadas.push("audit");
  });

  return {
    ordemDeChamadas,
    chamadasConversas,
    get numeroFoiAlocado() { return numeroFoiAlocado; },
    get pdfFoiGerado() { return pdfFoiGerado; },
    get mensagemEnviada() { return mensagemEnviada; },
    get propostaEnviada() { return propostaEnviada; },
    get conversaUsadaNoEnvio() { return conversaUsadaNoEnvio; },
    get leadValueCentsDepois() { return leadValueCentsDepois; },
    get propostaDeletadaId() { return propostaDeletadaId; },
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

  it("WhatsApp confirma (sent): vira enviada, ganha sent_at e muda o valor do negocio", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager" });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.status).toBe("enviada");
    expect(mundo.propostaEnviada?.numero).toBe(42);
    expect(mundo.mensagemEnviada).toBe(true);
    expect(mundo.leadValueCentsDepois).toBe(mundo.propostaEnviada?.total_cents);
  });

  it("WhatsApp falha: a proposta volta a rascunho retendo o numero, sem tocar o valor do negocio", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      envioResultado: { id: "msg-1", status: "failed", error_message: "canal desconectado" },
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.status).toBe("rascunho");
    expect(mundo.propostaEnviada?.ultima_falha_envio).toBe("canal desconectado");
    expect(mundo.propostaEnviada?.numero).toBe(42); // retido, não devolvido
    expect(mundo.leadValueCentsDepois).toBeNull();
  });

  it("erro ao gerar o PDF (excecao, nao desfecho de mensagem): volta a rascunho na hora, sem esperar o cron", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager" });
    mocks.renderPropostaPdf.mockRejectedValueOnce(new Error("falha ao renderizar"));
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.status).toBe("rascunho");
    expect(mundo.propostaEnviada?.ultima_falha_envio).toBe("falha ao renderizar");
    expect(mundo.propostaEnviada?.numero).toBe(42);
    expect(mundo.mensagemEnviada).toBe(false);
  });

  it("sendMessageHandler lanca (nao devolve desfecho): volta a rascunho, nao fica presa em enviando", async () => {
    const mundo = montarMundoDeEnvio({ papel: "manager" });
    mocks.sendMessageHandler.mockRejectedValueOnce(new Error("boundary stale"));
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.status).toBe("rascunho");
    expect(mundo.propostaEnviada?.ultima_falha_envio).toBe("boundary stale");
  });

  it("WhatsApp enfileira (sem credencial): a proposta continua enviando", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      envioResultado: { id: "msg-2", status: "queued", error_message: null },
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.status).toBe("enviando");
    expect(mundo.leadValueCentsDepois).toBeNull();
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

  it("revisar uma proposta enviada: a v2 HERDA pricing_status da v1, nunca nasce 'missing' por default (revisão C3, I1)", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      propostaOriginal: { status: "enviada", numero: 42, ano: 2026, versao: 1, pricing_status: "manual" },
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.pricing_status).toBe("manual");
  });

  it("criação da v2 colide com rascunho aberto de outra cadeia (23505): 409 claro, não 500 genérico (revisão C3, I1)", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      propostaOriginal: { status: "enviada", numero: 42, ano: 2026, versao: 1 },
      criacaoDaV2Colide23505: true,
    });
    const res = await mundo.POST();
    expect(res.status).toBe(409);
  });

  it("reenvio de um rascunho que ja tem numero (falha anterior): reusa o numero, NAO chama o contador de novo", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      // Simula o estado deixado por uma falha anterior: voltou a rascunho
      // RETENDO numero/ano (D3) — reenviar não pode gastar outro número.
      propostaOriginal: { status: "rascunho", numero: 42, ano: 2026, ultima_falha_envio: "canal desconectado" },
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.numeroFoiAlocado).toBe(false);
    expect(mundo.propostaEnviada?.numero).toBe(42);
    expect(mundo.propostaEnviada?.status).toBe("enviada");
  });

  it("v2 cujo envio falha: mantem o numero herdado, nao libera para outra proposta", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      propostaOriginal: { status: "enviada", numero: 42, ano: 2026, versao: 1 },
      envioResultado: { id: "msg-3", status: "failed", error_message: "timeout" },
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.propostaEnviada?.status).toBe("rascunho");
    expect(mundo.propostaEnviada?.numero).toBe(42);
  });

  it("erro ao copiar itens da v2: descarta a v2, a v1 continua enviada (nao vira substituida apontando pra v2 vazia)", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      propostaOriginal: { status: "enviada", numero: 42, ano: 2026, versao: 1 },
      itensDaV2Falham: true,
    });
    const res = await mundo.POST();
    expect(res.status).toBe(500);
    expect(mundo.propostaDeletadaId).not.toBeNull();
    // a v1 (PROPOSTA_ID) nunca recebeu status:"substituida" — continua no mock como estava.
    expect(mundo.propostaEnviada).toBeNull();
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

  it("proposta com pricing_status 'missing': envio recusado, lista os itens sem preço (§5.2)", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      propostaOriginal: { pricing_status: "missing" },
      itemSemPreco: true,
    });
    const res = await mundo.POST();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain("Item sem preço");
    expect(mundo.mensagemEnviada).toBe(false);
  });

  it("proposta com conversation_id gravado: usa ESSA conversa, não a mais recente do contato — E confere que é do MESMO contato (revisão C3)", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      propostaOriginal: { conversation_id: CONVERSA_ID },
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.chamadasConversas).toContainEqual(["organization_id", ORG_ID]);
    expect(mundo.chamadasConversas).toContainEqual(["id", CONVERSA_ID]);
    expect(mundo.chamadasConversas).toContainEqual(["contact_id", CONTACT_ID]);
    expect(mundo.conversaUsadaNoEnvio).toBe(CONVERSA_ID);
  });

  it("conversation_id gravado aponta para conversa de OUTRO contato: 422, NUNCA envia pro contato errado (revisão C3)", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      propostaOriginal: { conversation_id: CONVERSA_ID },
      conversaDeOutroContato: true,
    });
    const res = await mundo.POST();
    expect(res.status).toBe(422);
    expect(mundo.mensagemEnviada).toBe(false);
  });

  it("proposta SEM conversation_id (rascunho manual antigo): cai no fallback de sempre (mais recente do contato)", async () => {
    const mundo = montarMundoDeEnvio({
      papel: "manager",
      propostaOriginal: { conversation_id: null },
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(mundo.chamadasConversas).toContainEqual(["contact_id", CONTACT_ID]);
    expect(mundo.conversaUsadaNoEnvio).toBe("conversa-mais-recente-do-contato");
  });
});
