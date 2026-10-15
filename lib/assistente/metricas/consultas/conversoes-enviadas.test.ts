/**
 * Testes de `lerConversoesEnviadas` — janela [deInstante, ateInstanteExclusivo),
 * filtro de organização e de plataforma, situação por linha, motivos, atraso,
 * valor por moeda e paginação. O banco é o falso encadeável.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { criarBancoFalso, type LinhaDeTeste } from "./banco-falso";
import { lerConversoesEnviadas, type DadosLidosDeConversoes } from "./conversoes-enviadas";
import { resolverPeriodo } from "@/lib/assistente/metricas/periodo";

const ORG = "11111111-2222-4333-8444-555555555555";
const OUTRA_ORG = "22222222-3333-4444-8555-666666666666";
const AGORA = "2026-10-14T09:00:00-03:00";
const JANELA = resolverPeriodo({ tipo: "semana_passada" }, AGORA, "America/Sao_Paulo", "pt-BR");
const DENTRO = "2026-10-06T12:00:00.000Z";

function envio(parcial: LinhaDeTeste = {}): LinhaDeTeste {
  return {
    organization_id: ORG,
    platform: "meta_ads",
    event_name: "Purchase",
    status: "sent",
    reason: null,
    value_cents: 10000,
    currency: "BRL",
    event_occurred_at: "2026-10-06T10:00:00.000Z",
    attempted_at: DENTRO,
    ...parcial,
  };
}

async function ler(
  linhas: LinhaDeTeste[],
  plataforma?: "meta_ads" | "google_ads",
): Promise<{ dados: DadosLidosDeConversoes; consultas: ReturnType<typeof criarBancoFalso>["consultas"] }> {
  const banco = criarBancoFalso({ ad_conversion_dispatches: linhas });
  const r = await lerConversoesEnviadas(banco.client, ORG, JANELA, plataforma);
  if (!r.ok) throw new Error("esperava ok");
  return { dados: r.dados, consultas: banco.consultas };
}

function daPlataforma(dados: DadosLidosDeConversoes, plataforma: string) {
  const achada = dados.por_plataforma.find((p) => p.plataforma === plataforma);
  if (!achada) throw new Error(`plataforma ${plataforma} ausente`);
  return achada;
}

describe("lerConversoesEnviadas", () => {
  it("separa as quatro situações: entregue, falha, aguardando e não enviado", async () => {
    const { dados } = await ler([
      envio({ status: "sent" }),
      envio({ status: "error", reason: "recusado_pela_plataforma" }),
      envio({ status: "skipped", reason: "aguardando_processamento" }),
      envio({ status: "skipped", reason: "sem_valor" }),
    ]);
    const meta = daPlataforma(dados, "meta_ads");
    expect(meta.contagens).toEqual({ entregue: 1, falha: 1, aguardando: 1, nao_enviado: 1 });
    expect(meta.total_de_tentativas).toBe(4);
    expect(dados.truncado).toBe(false);
  });

  it("toda consulta carrega organization_id da sessão e linha de outra organização fica de fora", async () => {
    const { dados, consultas } = await ler([envio(), envio({ organization_id: OUTRA_ORG })]);
    expect(daPlataforma(dados, "meta_ads").total_de_tentativas).toBe(1);
    expect(consultas.length).toBeGreaterThan(0);
    for (const consulta of consultas) {
      expect(consulta.tabela).toBe("ad_conversion_dispatches");
      expect(consulta.filtros).toContainEqual(["organization_id", ORG]);
    }
  });

  it("a janela é [de, até): o instante inicial entra, o final e o anterior não", async () => {
    const { dados, consultas } = await ler([
      envio({ attempted_at: JANELA.deInstante }),
      envio({ attempted_at: JANELA.ateInstanteExclusivo }),
      envio({ attempted_at: "2026-10-01T12:00:00.000Z" }),
    ]);
    expect(daPlataforma(dados, "meta_ads").total_de_tentativas).toBe(1);
    expect(consultas[0]?.filtros).toContainEqual(["attempted_at >=", JANELA.deInstante]);
    expect(consultas[0]?.filtros).toContainEqual(["attempted_at <", JANELA.ateInstanteExclusivo]);
  });

  it("filtro de plataforma: só a pedida é lida", async () => {
    const linhas = [envio(), envio({ platform: "google_ads" }), envio({ platform: "google_ads" })];
    const { dados, consultas } = await ler(linhas, "google_ads");
    expect(dados.por_plataforma.map((p) => p.plataforma)).toEqual(["google_ads"]);
    expect(daPlataforma(dados, "google_ads").total_de_tentativas).toBe(2);
    expect(consultas[0]?.filtros).toContainEqual(["platform", "google_ads"]);
  });

  it("atraso: só entregue passa de 7 dias; exatamente 7, sem data e não entregue não contam", async () => {
    const { dados } = await ler([
      envio({ event_occurred_at: "2026-09-27T12:00:00.000Z" }), // 9 dias
      envio({ event_occurred_at: "2026-09-29T12:00:00.000Z" }), // exatamente 7 dias
      envio({ event_occurred_at: null }),
      envio({ status: "error", reason: "recusado_pela_plataforma", event_occurred_at: "2026-09-10T12:00:00.000Z" }),
    ]);
    expect(daPlataforma(dados, "meta_ads").entregues_com_atraso_maior_que_7_dias).toBe(1);
  });

  it("valor entregue: moedas separadas e nunca somadas; conta só entregue com valor e moeda", async () => {
    const { dados } = await ler([
      envio({ value_cents: 10000, currency: "BRL" }),
      envio({ value_cents: 5000, currency: "brl" }),
      envio({ value_cents: 2000, currency: "USD" }),
      envio({ value_cents: null, currency: "BRL" }),
      envio({ value_cents: 9999, currency: null }),
      envio({ status: "error", reason: "recusado_pela_plataforma", value_cents: 7777, currency: "BRL" }),
    ]);
    expect(daPlataforma(dados, "meta_ads").valor_entregue_cents_por_moeda).toEqual([
      { moeda: "BRL", valor_cents: 15000, quantidade: 2 },
      { moeda: "USD", valor_cents: 2000, quantidade: 1 },
    ]);
  });

  it("motivos: no máximo 12, do mais frequente ao menos; significado só do código que existe", async () => {
    const linhas: LinhaDeTeste[] = [];
    for (let i = 0; i < 3; i += 1) linhas.push(envio({ status: "skipped", reason: "sem_valor" }));
    for (let i = 0; i < 2; i += 1) linhas.push(envio({ status: "error", reason: "codigo_que_nao_existe" }));
    for (let i = 0; i < 12; i += 1) {
      linhas.push(envio({ status: "error", reason: `outro_codigo_${String(i).padStart(2, "0")}` }));
    }
    const { dados } = await ler(linhas);
    const motivos = daPlataforma(dados, "meta_ads").motivos;
    expect(motivos).toHaveLength(12);
    expect(motivos[0]).toEqual({
      codigo: "sem_valor",
      quantidade: 3,
      significado: "A venda fechou sem valor preenchido.",
    });
    expect(motivos[1]).toEqual({ codigo: "codigo_que_nao_existe", quantidade: 2, significado: null });
  });

  it("agrupa em Map: plataforma __proto__ vira linha normal e Object.prototype fica intacto", async () => {
    const { dados } = await ler([envio({ platform: "__proto__" }), envio()]);
    expect(dados.por_plataforma.map((p) => p.plataforma).sort()).toEqual(["__proto__", "meta_ads"]);
    expect(({} as Record<string, unknown>).contagens).toBeUndefined();
  });

  it("1200 tentativas: lê tudo (duas páginas) e não marca truncado", async () => {
    const linhas: LinhaDeTeste[] = [];
    for (let i = 0; i < 1200; i += 1) linhas.push(envio());
    const { dados, consultas } = await ler(linhas);
    expect(daPlataforma(dados, "meta_ads").total_de_tentativas).toBe(1200);
    expect(dados.truncado).toBe(false);
    expect(consultas.map((c) => c.faixas[0])).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(consultas[0]?.contou).toBe(true);
    expect(consultas[1]?.contou).toBe(false);
  });

  it("5200 tentativas: para em 5 páginas (5000 linhas) e marca truncado", async () => {
    const linhas: LinhaDeTeste[] = [];
    for (let i = 0; i < 5200; i += 1) linhas.push(envio());
    const { dados, consultas } = await ler(linhas);
    expect(daPlataforma(dados, "meta_ads").total_de_tentativas).toBe(5000);
    expect(dados.truncado).toBe(true);
    expect(consultas).toHaveLength(5);
  });

  it("erro de leitura devolve ok:false", async () => {
    const banco = criarBancoFalso({ ad_conversion_dispatches: [envio()] }, "ad_conversion_dispatches");
    const r = await lerConversoesEnviadas(banco.client, ORG, JANELA);
    expect(r).toEqual({ ok: false });
  });

  it("lead_id, detail e identificadores do envio não saem", async () => {
    const { dados } = await ler([
      envio({
        lead_id: "LEAD-SECRETO",
        detail: "DETALHE-SECRETO",
        event_id: "EVENTO-SECRETO",
        remote_request_id: "REMOTO-SECRETO",
      }),
    ]);
    const texto = JSON.stringify(dados);
    for (const segredo of ["LEAD-SECRETO", "DETALHE-SECRETO", "EVENTO-SECRETO", "REMOTO-SECRETO", "lead_id", "detail"]) {
      expect(texto).not.toContain(segredo);
    }
  });
});
