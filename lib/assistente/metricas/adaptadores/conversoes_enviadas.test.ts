/**
 * Testes do ADAPTADOR `conversoes_enviadas`. Papel mínimo `admin`. A leitura
 * usa o cliente de SERVIÇO (sobreposto aqui por um banco falso); o cliente da
 * sessão nunca é tocado. O banco falso é o encadeável de `consultas/banco-falso`.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  metricaConversoesEnviadas,
  sobreporClienteAdminDeConversoes,
} from "@/lib/assistente/metricas/adaptadores/conversoes_enviadas";
import { criarBancoFalso, type LinhaDeTeste } from "@/lib/assistente/metricas/consultas/banco-falso";
import { chavesProibidasEm } from "@/lib/assistente/metricas/projecao";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import type { ContextoDeConsulta, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";

const ORG = "11111111-2222-4333-8444-555555555555";
const OUTRA_ORG = "22222222-3333-4444-8555-666666666666";
const AGORA = "2026-10-14T09:00:00-03:00";
const DENTRO = "2026-10-06T12:00:00.000Z";

const AVISO_DESLIGADO =
  "O envio para o Meta está desligado: as vendas não são reportadas até ligar em Configurações › Conversões.";
const AVISO_SEM_DADOS = "Sem tentativas de envio de conversão no período.";
const AVISO_TRUNCADO =
  "Havia mais tentativas do que a leitura alcança (limite de 5000); os números são das mais recentes.";

interface DadosEsperados {
  por_plataforma: {
    plataforma: string;
    contagens: { entregue: number; falha: number; aguardando: number; nao_enviado: number };
    motivos: { codigo: string; quantidade: number; significado: string | null }[];
    valor_entregue_cents_por_moeda: { moeda: string; valor_cents: number; quantidade: number }[];
    total_de_tentativas: number;
  }[];
  truncado: boolean;
  conexao_meta: "nao_conectada" | "desligada" | "ligada";
}

function dadosDe(r: ResultadoDeMetrica): DadosEsperados {
  if (!r.ok || r.dados === null || r.dados === undefined) throw new Error("esperava dados");
  return r.dados as DadosEsperados;
}

function avisosDe(r: ResultadoDeMetrica): string[] {
  if (!r.ok) throw new Error("esperava ok");
  return r.avisos;
}

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

function conexao(parcial: LinhaDeTeste = {}): LinhaDeTeste {
  return {
    organization_id: ORG,
    platform: "meta_ads",
    enabled: true,
    dataset_id: "DATASET-SECRETO",
    test_event_code: null,
    access_token_encrypted: "TOKEN-CIFRADO-SECRETO",
    ...parcial,
  };
}

/** Monta o banco de serviço falso, o instala e devolve também um banco de sessão intocado. */
function montar(envios: LinhaDeTeste[], conexoes: LinhaDeTeste[] = [], erroEm?: string) {
  const servico = criarBancoFalso({ ad_conversion_dispatches: envios, ad_platform_connections: conexoes }, erroEm);
  sobreporClienteAdminDeConversoes(servico.client);
  const sessao = criarBancoFalso({});
  return { servico, sessao };
}

function ctxDe(papel: ContextoDeConsulta["papel"], sessao: ContextoDeConsulta["bancoDosModulos"]): ContextoDeConsulta {
  return { orgId: ORG, papel, idioma: "pt-BR", fuso: "America/Sao_Paulo", agoraIso: AGORA, bancoDosModulos: sessao };
}

describe("conversoes_enviadas — adaptador", () => {
  beforeEach(() => sobreporClienteAdminDeConversoes(null));
  afterEach(() => sobreporClienteAdminDeConversoes(null));

  it("manager é recusado por consultarMetrica sem tocar nenhum banco", async () => {
    const { servico, sessao } = montar([envio()], [conexao()]);
    const r = await consultarMetrica(ctxDe("manager", sessao.client), "conversoes_enviadas", {});
    expect(r).toMatchObject({ ok: false, motivo: "sem_permissao", papel_minimo: "admin" });
    expect(servico.consultas.length).toBe(0);
    expect(sessao.consultas.length).toBe(0);
  });

  it.each([
    ["período com 401 dias", { periodo: { tipo: "ultimos_dias", dias: 401 } }],
    ["chave desconhecida", { foo: 1 }],
    ["plataforma que não existe", { plataforma: "tiktok_ads" }],
  ])("parâmetro inválido (%s) → parametro_invalido, sem tocar o banco", async (_nome, params) => {
    const { servico, sessao } = montar([envio()], [conexao()]);
    const r = await consultarMetrica(ctxDe("admin", sessao.client), "conversoes_enviadas", params);
    expect(r).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    expect(servico.consultas.length).toBe(0);
  });

  it("caminho feliz: usa o cliente de serviço, nunca o da sessão, e devolve motivos com significado", async () => {
    const { servico, sessao } = montar(
      [envio(), envio({ status: "skipped", reason: "sem_valor" }), envio({ status: "skipped", reason: "sem_valor" })],
      [conexao()],
    );
    const r = await metricaConversoesEnviadas.executar(ctxDe("admin", sessao.client), {});
    const dados = dadosDe(r);
    const meta = dados.por_plataforma[0];
    expect(meta?.plataforma).toBe("meta_ads");
    expect(meta?.contagens).toEqual({ entregue: 1, falha: 0, aguardando: 0, nao_enviado: 2 });
    expect(meta?.motivos[0]).toEqual({
      codigo: "sem_valor",
      quantidade: 2,
      significado: "A venda fechou sem valor preenchido.",
    });
    expect(meta?.valor_entregue_cents_por_moeda).toEqual([{ moeda: "BRL", valor_cents: 10000, quantidade: 1 }]);
    expect(dados.conexao_meta).toBe("ligada");
    expect(avisosDe(r)).toEqual([]);
    expect(chavesProibidasEm(r.ok ? r.dados : null)).toEqual([]);
    expect(servico.consultas.length).toBeGreaterThan(0);
    expect(sessao.consultas.length).toBe(0);
  });

  it("toda leitura, inclusive a da conexão, carrega o organization_id da sessão", async () => {
    const { servico, sessao } = montar([envio(), envio({ organization_id: OUTRA_ORG })], [conexao()]);
    const r = await metricaConversoesEnviadas.executar(ctxDe("admin", sessao.client), {});
    expect(dadosDe(r).por_plataforma[0]?.total_de_tentativas).toBe(1);
    const tabelas = new Set(servico.consultas.map((c) => c.tabela));
    expect(tabelas).toEqual(new Set(["ad_conversion_dispatches", "ad_platform_connections"]));
    for (const consulta of servico.consultas) {
      expect(consulta.filtros).toContainEqual(["organization_id", ORG]);
    }
  });

  it("conexão desligada → conexao_meta desligada e o aviso exato", async () => {
    const { sessao } = montar([envio()], [conexao({ enabled: false })]);
    const r = await metricaConversoesEnviadas.executar(ctxDe("admin", sessao.client), {});
    expect(dadosDe(r).conexao_meta).toBe("desligada");
    expect(avisosDe(r)).toEqual([AVISO_DESLIGADO]);
  });

  it("sem conexão (ou só de outra organização) → nao_conectada e nenhum aviso de desligado", async () => {
    const { sessao } = montar([envio()], [conexao({ organization_id: OUTRA_ORG, enabled: true })]);
    const r = await metricaConversoesEnviadas.executar(ctxDe("admin", sessao.client), {});
    expect(dadosDe(r).conexao_meta).toBe("nao_conectada");
    expect(avisosDe(r)).toEqual([]);
  });

  it("desligada com filtro google_ads: não avisa do Meta e só devolve o Google", async () => {
    const { sessao } = montar([envio(), envio({ platform: "google_ads" })], [conexao({ enabled: false })]);
    const r = await metricaConversoesEnviadas.executar(ctxDe("admin", sessao.client), { plataforma: "google_ads" });
    expect(dadosDe(r).por_plataforma.map((p) => p.plataforma)).toEqual(["google_ads"]);
    expect(avisosDe(r)).toEqual([]);
  });

  it("5200 tentativas: truncado e o aviso exato", async () => {
    const muitas: LinhaDeTeste[] = [];
    for (let i = 0; i < 5200; i += 1) muitas.push(envio());
    const { sessao } = montar(muitas, [conexao()]);
    const r = await metricaConversoesEnviadas.executar(ctxDe("admin", sessao.client), {});
    expect(dadosDe(r).truncado).toBe(true);
    expect(dadosDe(r).por_plataforma[0]?.total_de_tentativas).toBe(5000);
    expect(avisosDe(r)).toEqual([AVISO_TRUNCADO]);
  });

  it("sem tentativas: dados null e o aviso exato", async () => {
    const { sessao } = montar([], [conexao()]);
    const r = await metricaConversoesEnviadas.executar(ctxDe("admin", sessao.client), {});
    expect(r).toMatchObject({ ok: true, dados: null });
    expect(avisosDe(r)).toEqual([AVISO_SEM_DADOS]);
  });

  it("sem tentativas e envio desligado: os dois avisos, o do Meta primeiro", async () => {
    const { sessao } = montar([], [conexao({ enabled: false })]);
    const r = await metricaConversoesEnviadas.executar(ctxDe("admin", sessao.client), {});
    expect(avisosDe(r)).toEqual([AVISO_DESLIGADO, AVISO_SEM_DADOS]);
  });

  it("erro de leitura: indisponivel, sem ecoar a mensagem do banco", async () => {
    const { sessao } = montar([envio()], [conexao()], "ad_conversion_dispatches");
    const r = await metricaConversoesEnviadas.executar(ctxDe("admin", sessao.client), {});
    expect(r).toMatchObject({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(r)).not.toContain("leitura recusada pelo banco");
  });

  it("nada de lead, detalhe, token ou identificador da conexão na saída", async () => {
    const { sessao } = montar(
      [envio({ lead_id: "LEAD-SECRETO", detail: "DETALHE-SECRETO", event_id: "EVENTO-SECRETO" })],
      [conexao()],
    );
    const r = await metricaConversoesEnviadas.executar(ctxDe("admin", sessao.client), {});
    const texto = JSON.stringify(r);
    for (const segredo of [
      "LEAD-SECRETO",
      "DETALHE-SECRETO",
      "EVENTO-SECRETO",
      "TOKEN-CIFRADO-SECRETO",
      "DATASET-SECRETO",
    ]) {
      expect(texto).not.toContain(segredo);
    }
  });
});
