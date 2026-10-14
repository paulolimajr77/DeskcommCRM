/**
 * Testes do ADAPTADOR `propostas_aceitas_por_produto` — a métrica inteira
 * contra o banco falso. DUAS chaves são medidas aqui: a da INSTALAÇÃO
 * (`platform_config` com `MODULO_PROPOSTAS = "ligado"` — é o que
 * `modulosLigados` realmente lê) e a da EMPRESA
 * (`organizations.settings.proposals.enabled`).
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { metricaPropostasAceitasPorProduto } from "@/lib/assistente/metricas/adaptadores/propostas_aceitas_por_produto";
import { criarBancoFalso, type LinhaDeTeste } from "@/lib/assistente/metricas/consultas/banco-falso";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import { resolverPeriodo } from "@/lib/assistente/metricas/periodo";
import type { ContextoDeConsulta, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";

const ORG = "00000000-0000-0000-0000-000000000099";
const AGORA = "2026-10-14T09:00:00-03:00";
const JANELA = resolverPeriodo({ tipo: "semana_passada" }, AGORA, "America/Sao_Paulo", "pt-BR");
const AVISO_FIXO = "Valor PROPOSTO em propostas aceitas; não é faturamento.";

interface LinhaProduto {
  produto: string;
  moeda: string;
  propostas: number;
  quantidade: number;
  valor_proposto_cents: number;
}
interface DadosEsperados {
  propostas_aceitas: number;
  por_produto: LinhaProduto[];
  linhas_omitidas: number;
  truncado: boolean;
}

function dadosDe(r: ResultadoDeMetrica): DadosEsperados {
  if (!r.ok || r.dados === null || r.dados === undefined) throw new Error("esperava dados");
  return r.dados as DadosEsperados;
}

function avisosDe(r: ResultadoDeMetrica): string[] {
  if (!r.ok) throw new Error("esperava ok");
  return r.avisos;
}

function ctxDe(papel: ContextoDeConsulta["papel"], client: ContextoDeConsulta["bancoDosModulos"]): ContextoDeConsulta {
  return { orgId: ORG, papel, idioma: "pt-BR", fuso: "America/Sao_Paulo", agoraIso: AGORA, bancoDosModulos: client };
}

/** Linha de `organizations` com a chave da EMPRESA ligada ou desligada. */
function org(ligada: boolean): LinhaDeTeste {
  return { id: ORG, settings: { proposals: { enabled: ligada } } };
}

/** Linhas de `platform_config` que ligam o módulo `propostas` na INSTALAÇÃO. */
function platformConfig(ligada: boolean): LinhaDeTeste[] {
  return ligada ? [{ chave: "MODULO_PROPOSTAS", valor: "ligado" }] : [];
}

let serialDaProposta = 0;
function proposta(parcial: LinhaDeTeste = {}): LinhaDeTeste {
  serialDaProposta += 1;
  return {
    id: `prop-${serialDaProposta}`,
    organization_id: ORG,
    status: "aceita",
    moeda: "BRL",
    decided_at: "2026-10-07T12:00:00.000Z",
    crm_proposal_items: [],
    ...parcial,
  };
}

function item(parcial: LinhaDeTeste = {}): LinhaDeTeste {
  return { product_id: "prod-1", quantidade: 1, preco_unitario_cents: 1000, desconto_cents: 0, ...parcial };
}

/** Dataset mínimo que faz a métrica responder ok: empresa ligada + uma proposta. */
function baseOk(itens: LinhaDeTeste[] = [item()]): Record<string, LinhaDeTeste[]> {
  return {
    organizations: [org(true)],
    crm_proposals: [proposta({ crm_proposal_items: itens })],
    catalog_products: [{ id: "prod-1", nome: "Consultoria", organization_id: ORG }],
  };
}

describe("propostas_aceitas_por_produto — adaptador", () => {
  it("chave da EMPRESA desligada → modulo_ausente SEM ler crm_proposals; ligada → ok", async () => {
    const bancoOff = criarBancoFalso({
      organizations: [org(false)],
      crm_proposals: [proposta({ crm_proposal_items: [item()] })],
      catalog_products: [],
    });
    const rOff = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", bancoOff.client), {});
    expect(rOff).toMatchObject({ ok: false, motivo: "modulo_ausente", modulo: "propostas" });
    expect(bancoOff.consultas.filter((c) => c.tabela === "crm_proposals").length).toBe(0);

    const bancoOn = criarBancoFalso(baseOk());
    const rOn = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", bancoOn.client), {});
    expect(rOn.ok).toBe(true);
  });

  it("ok traz SEMPRE o aviso fixo — inclusive vazio", async () => {
    const vazio = criarBancoFalso({ organizations: [org(true)], crm_proposals: [], catalog_products: [] });
    const rVazio = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", vazio.client), {});
    expect(avisosDe(rVazio)).toContain(AVISO_FIXO);

    const cheio = criarBancoFalso(baseOk());
    const rCheio = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", cheio.client), {});
    expect(avisosDe(rCheio)).toContain(AVISO_FIXO);
  });

  it("a descricao do item NUNCA sai no resultado", async () => {
    const banco = criarBancoFalso(
      baseOk([item({ descricao: "blusinha especial para a Maria Clara" })]),
    );
    const r = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", banco.client), {});
    expect(JSON.stringify(r)).not.toContain("Maria Clara");
    expect(JSON.stringify(r)).not.toContain("blusinha");
    expect(JSON.stringify(r)).not.toContain("descricao");
  });

  it("BRL e USD do mesmo produto viram DUAS linhas, nunca somadas", async () => {
    const banco = criarBancoFalso({
      organizations: [org(true)],
      crm_proposals: [
        proposta({ moeda: "BRL", crm_proposal_items: [item({ preco_unitario_cents: 1000 })] }),
        proposta({ moeda: "USD", crm_proposal_items: [item({ preco_unitario_cents: 100 })] }),
      ],
      catalog_products: [{ id: "prod-1", nome: "Consultoria", organization_id: ORG }],
    });
    const r = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", banco.client), {});
    const dados = dadosDe(r);
    const linhas = dados.por_produto.filter((l) => l.produto === "Consultoria");
    expect(linhas.length).toBe(2);
    expect(linhas.map((l) => l.moeda).sort()).toEqual(["BRL", "USD"]);
    expect(linhas.find((l) => l.moeda === "BRL")?.valor_proposto_cents).toBe(1000);
    expect(linhas.find((l) => l.moeda === "USD")?.valor_proposto_cents).toBe(100);
  });

  it("item sem produto → 'Itens sem produto do catálogo'; produto apagado do catálogo → '(produto removido)'", async () => {
    const banco = criarBancoFalso({
      organizations: [org(true)],
      crm_proposals: [
        proposta({ crm_proposal_items: [item({ product_id: null })] }),
        proposta({ crm_proposal_items: [item({ product_id: "prod-sumiu-nao-esta-no-catalogo" })] }),
      ],
      catalog_products: [],
    });
    const r = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", banco.client), {});
    const dados = dadosDe(r);
    const nomes = dados.por_produto.map((l) => l.produto);
    expect(nomes).toContain("Itens sem produto do catálogo");
    expect(nomes).toContain("(produto removido)");
  });

  it("nome de produto com mais de 80 caracteres sai cortado em 80", async () => {
    const nomeLongo = "N".repeat(120);
    const banco = criarBancoFalso({
      organizations: [org(true)],
      crm_proposals: [proposta({ crm_proposal_items: [item()] })],
      catalog_products: [{ id: "prod-1", nome: nomeLongo, organization_id: ORG }],
    });
    const r = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.por_produto[0]?.produto.length).toBe(80);
    expect(dados.por_produto[0]?.produto).toBe(nomeLongo.slice(0, 80));
  });

  it("31 produtos → 30 linhas, linhas_omitidas 1 e o aviso exato", async () => {
    const catalogo: LinhaDeTeste[] = [];
    const propostas: LinhaDeTeste[] = [];
    for (let i = 0; i < 31; i += 1) {
      catalogo.push({ id: `prod-${i}`, nome: `Produto ${i}`, organization_id: ORG });
      propostas.push(proposta({ crm_proposal_items: [item({ product_id: `prod-${i}` })] }));
    }
    const banco = criarBancoFalso({ organizations: [org(true)], crm_proposals: propostas, catalog_products: catalogo });
    const r = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.por_produto.length).toBe(30);
    expect(dados.linhas_omitidas).toBe(1);
    expect(avisosDe(r)).toContain("Só as 30 maiores linhas foram incluídas.");
  });

  it("600 propostas aceitas → propostas_aceitas 600 e truncado false", async () => {
    const propostas: LinhaDeTeste[] = [];
    for (let i = 0; i < 600; i += 1) propostas.push(proposta({ crm_proposal_items: [item()] }));
    const banco = criarBancoFalso({
      organizations: [org(true)],
      crm_proposals: propostas,
      catalog_products: [{ id: "prod-1", nome: "Consultoria", organization_id: ORG }],
    });
    const r = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.propostas_aceitas).toBe(600);
    expect(dados.truncado).toBe(false);
  });

  it("2600 propostas aceitas → truncado true e o aviso exato", async () => {
    const propostas: LinhaDeTeste[] = [];
    for (let i = 0; i < 2600; i += 1) propostas.push(proposta({ crm_proposal_items: [item()] }));
    const banco = criarBancoFalso({
      organizations: [org(true)],
      crm_proposals: propostas,
      catalog_products: [{ id: "prod-1", nome: "Consultoria", organization_id: ORG }],
    });
    const r = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.propostas_aceitas).toBe(2600);
    expect(dados.truncado).toBe(true);
    expect(avisosDe(r)).toContain(
      "Havia mais propostas aceitas do que a leitura alcança (limite de 2500); os números são das mais recentes.",
    );
  });

  it("janela por decided_at: antes de deInstante e em ateInstanteExclusivo ficam fora; só status aceita; outra organização fora", async () => {
    const banco = criarBancoFalso({
      organizations: [org(true)],
      crm_proposals: [
        proposta({ decided_at: "2026-10-02T12:00:00.000Z", crm_proposal_items: [item()] }),
        proposta({ decided_at: JANELA.ateInstanteExclusivo, crm_proposal_items: [item()] }),
        proposta({ status: "recusada", crm_proposal_items: [item()] }),
        proposta({ organization_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", crm_proposal_items: [item()] }),
        proposta({ crm_proposal_items: [item()] }),
      ],
      catalog_products: [{ id: "prod-1", nome: "Consultoria", organization_id: ORG }],
    });
    const r = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", banco.client), {});
    const dados = dadosDe(r);
    expect(dados.propostas_aceitas).toBe(1);
    expect(dados.por_produto[0]?.valor_proposto_cents).toBe(1000);
    // E os filtros gravados carregam a janela exclusiva:
    const leituras = banco.consultas.filter((c) => c.tabela === "crm_proposals");
    const filtros = new Map(leituras[0]?.filtros ?? []);
    expect(filtros.get("decided_at >=")).toBe(JANELA.deInstante);
    expect(filtros.get("decided_at <")).toBe(JANELA.ateInstanteExclusivo);
    expect(filtros.get("status")).toBe("aceita");
    expect(filtros.get("organization_id")).toBe(ORG);
  });

  it("zero propostas → dados null e o aviso exato junto do aviso fixo", async () => {
    const banco = criarBancoFalso({ organizations: [org(true)], crm_proposals: [], catalog_products: [] });
    const r = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", banco.client), {});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperava ok");
    expect(r.dados).toBeNull();
    expect(r.avisos).toContain("Sem propostas aceitas no período.");
    expect(r.avisos).toContain(AVISO_FIXO);
  });

  it("erro de leitura → indisponivel, sem ecoar a mensagem do banco", async () => {
    const banco = criarBancoFalso({ organizations: [org(true)], crm_proposals: [] }, "crm_proposals");
    const r = await metricaPropostasAceitasPorProduto.executar(ctxDe("viewer", banco.client), {});
    expect(r).toMatchObject({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(r)).not.toContain("leitura recusada pelo banco");
  });

  it("papel viewer PODE consultar: com a instalação ligada a resposta é ok, nunca sem_permissao", async () => {
    const banco = criarBancoFalso({
      platform_config: platformConfig(true),
      ...baseOk(),
    });
    const r = await consultarMetrica(ctxDe("viewer", banco.client), "propostas_aceitas_por_produto", {});
    expect(r.ok).toBe(true);
    if (r.ok === false) {
      expect((r as { motivo: string }).motivo).not.toBe("sem_permissao");
    }
  });

  it("chave da INSTALAÇÃO desligada → modulo_ausente por consultarMetrica (modulosLigados lê platform_config)", async () => {
    // A semana inteira de dados existe na empresa, mas a INSTALAÇÃO não tem o módulo.
    const banco = criarBancoFalso({
      platform_config: platformConfig(false),
      organizations: [org(true)],
      crm_proposals: [proposta({ crm_proposal_items: [item()] })],
      catalog_products: [],
    });
    const r = await consultarMetrica(ctxDe("viewer", banco.client), "propostas_aceitas_por_produto", {});
    expect(r).toMatchObject({ ok: false, motivo: "modulo_ausente", modulo: "propostas" });
    expect(banco.consultas.filter((c) => c.tabela === "crm_proposals").length).toBe(0);
  });

  it("chave da INSTALAÇÃO ligada em platform_config → consultarMetrica chega ao executar", async () => {
    const banco = criarBancoFalso({
      platform_config: platformConfig(true),
      ...baseOk(),
    });
    const r = await consultarMetrica(ctxDe("viewer", banco.client), "propostas_aceitas_por_produto", {});
    expect(r.ok).toBe(true);
    const dados = dadosDe(r);
    expect(dados.propostas_aceitas).toBe(1);
  });
});
