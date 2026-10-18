/**
 * O FORMATADOR LEGÍVEL do antes/depois (T21) — puro, com o `traduzir` real.
 *
 * Três provas:
 *  1. COBERTURA: toda (tipo, operação) do mapa de destinos (`operacoes.ts`)
 *     tem formatador aqui — operação nova sem formatador deixa este teste
 *     vermelho (sabotagem (iii) da ordem).
 *  2. CONTEÚDO: cada formato produz as linhas certas, sem JSON cru — e o
 *     valor atual vem do `antes` que a ferramenta de propor gravou.
 *  3. IDIOMA: as frases saem em espanhol com o MESMO `traduzir`.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DESTINO_DAS_OPERACOES } from "@/lib/assistente/propostas/operacoes";
import {
  diffLegivel,
  QUANTIDADE_DE_FORMATADORES,
  temFormatador,
  type LinhaDoDiff,
} from "@/lib/assistente/propostas/diff-legivel";
import { traduzir } from "@/lib/i18n/dicionario";

const t = (texto: string) => traduzir(texto, "pt-BR");
const tEs = (texto: string) => traduzir(texto, "es");

const RESUMO = (linhas: LinhaDoDiff[]) => linhas.map((l) => ({ rotulo: l.rotulo, de: l.de, para: l.para }));

describe("cobertura: toda operação do mapa tem formatador", () => {
  it("o registro casa 1:1 com DESTINO_DAS_OPERACOES", () => {
    let esperadas = 0;
    for (const [tipo, porOperacao] of Object.entries(DESTINO_DAS_OPERACOES)) {
      for (const operacao of Object.keys(porOperacao)) {
        esperadas += 1;
        // A sonda nomeia o buraco: operação nova sem formatador reprova AQUI
        // (sabotagem (iii) da ordem apaga um formatador e este caso fica vermelho).
        expect(temFormatador(tipo, operacao), `sem formatador: ${tipo}:${operacao}`).toBe(true);
      }
    }
    expect(QUANTIDADE_DE_FORMATADORES()).toBe(esperadas);
  });

  it("operacao fora do mapa não lança — devolve vazio (a tela nunca quebra por dado velho)", () => {
    const saida = diffLegivel(t, { kind: "memoria", operacao: null, antes: null, payload: null });
    expect(saida).toEqual({ linhas: [], avisos: [] });
  });
});

describe("cada formato em português", () => {
  it("roteador:criar — 'vai criar' com o aviso de que NASCE ATIVO", () => {
    const saida = diffLegivel(t, {
      kind: "roteador",
      operacao: "criar",
      antes: null,
      payload: { operacao: "criar", corpo: { name: "Clínica", channel_session_id: "11111111-2222-4333-8444-555555555551" } },
    });
    expect(RESUMO(saida.linhas)).toEqual([{ rotulo: "Nome do roteador", de: null, para: "Clínica" }]);
    expect(saida.avisos.join(" ")).toContain("nasce ativo");
  });

  it("roteador:alterar — o nome atual vira o 'de'", () => {
    const saida = diffLegivel(t, {
      kind: "roteador",
      operacao: "alterar",
      antes: { nome: "Clínica", agente_de_reserva_id: null, ativo: true },
      payload: { operacao: "alterar", router_id: "x", corpo: { name: "Clínica Nova" } },
    });
    expect(RESUMO(saida.linhas)).toEqual([{ rotulo: "Nome do roteador", de: "Clínica", para: "Clínica Nova" }]);
  });

  it("roteador:membros — as duas listas INTEIRAS e o aviso de substituição", () => {
    const saida = diffLegivel(t, {
      kind: "roteador",
      operacao: "membros",
      antes: { nome: "Clínica", intencoes: [{ nome: "Urgência", descricao: "d" }] },
      payload: {
        operacao: "membros",
        router_id: "x",
        corpo: { members: [{ agent_id: "a", intent_name: "Urgência", intent_description: "d" }, { agent_id: "b", intent_name: "Exame", intent_description: "d" }] },
      },
    });
    expect(RESUMO(saida.linhas)).toEqual([
      { rotulo: "Intenções do roteador", de: "Urgência", para: "Urgência, Exame" },
    ]);
    expect(saida.avisos.join(" ")).toContain("substitui");
  });

  it("conhecimento:criar — FAQ com a contagem de perguntas", () => {
    const saida = diffLegivel(t, {
      kind: "conhecimento",
      operacao: "criar",
      antes: null,
      payload: {
        operacao: "criar",
        corpo: { source_type: "faq", name: "Dúvidas comuns", items: [{ question: "q", answer: "a" }, { question: "q2", answer: "a2" }] },
      },
    });
    expect(RESUMO(saida.linhas)).toEqual([
      { rotulo: "Tipo de material", de: null, para: "Perguntas frequentes (FAQ)" },
      { rotulo: "Nome", de: null, para: "Dúvidas comuns" },
      { rotulo: "Perguntas e respostas", de: null, para: "2 perguntas com resposta" },
    ]);
  });

  it("conhecimento:criar — documento mostra o texto cortado", () => {
    const saida = diffLegivel(t, {
      kind: "conhecimento",
      operacao: "criar",
      antes: null,
      payload: { operacao: "criar", corpo: { source_type: "documento", name: "Política", markdown_blob: "a".repeat(500) } },
    });
    const texto = saida.linhas.find((l) => l.rotulo === "Texto")!;
    expect(texto.para!.length).toBeLessThanOrEqual(201);
    expect(texto.para!.endsWith("…")).toBe(true);
  });

  it("memoria:criar — título e conteúdo", () => {
    const saida = diffLegivel(t, {
      kind: "memoria",
      operacao: "criar",
      antes: null,
      payload: { operacao: "criar", corpo: { title: "Horário", body: "Atendemos das 8h às 18h." } },
    });
    expect(RESUMO(saida.linhas)).toEqual([
      { rotulo: "Título", de: null, para: "Horário" },
      { rotulo: "Conteúdo", de: null, para: "Atendemos das 8h às 18h." },
    ]);
  });

  it("memoria:arquivar — a entrada e o estado indo para arquivada", () => {
    const saida = diffLegivel(t, {
      kind: "memoria",
      operacao: "arquivar",
      antes: { titulo: "Horário antigo", texto: "…", estado: "ativa" },
      payload: { operacao: "arquivar", entry_id: "x", corpo: { status: "archived" } },
    });
    expect(RESUMO(saida.linhas)).toEqual([
      { rotulo: "Entrada da memória", de: null, para: "Horário antigo" },
      { rotulo: "Estado", de: "ativa", para: "arquivada — sai do que os agentes consultam" },
    ]);
  });

  it("modelo_auxiliares:definir_ponto — provedor e modelo ATUAIS do `antes`, com o aviso da credencial preservada", () => {
    const saida = diffLegivel(t, {
      kind: "modelo_auxiliares",
      operacao: "definir_ponto",
      antes: { ponto: "assistente_chat", provedor: "anthropic", modelo: "claude-x", origem: "binding" },
      payload: { operacao: "definir_ponto", corpo: { purpose: "assistente_chat", provider: "openai", model_id: "gpt-y" } },
    });
    expect(RESUMO(saida.linhas)).toEqual([
      { rotulo: "Ponto de IA", de: null, para: "assistente_chat" },
      { rotulo: "Provedor", de: "anthropic", para: "openai" },
      { rotulo: "Modelo", de: "claude-x", para: "gpt-y" },
    ]);
    expect(saida.avisos.join(" ")).toContain("preservada");
  });

  it("modelo_auxiliares:definir_padrao — o padrão atual vira o 'de', com o aviso de alcance", () => {
    const saida = diffLegivel(t, {
      kind: "modelo_auxiliares",
      operacao: "definir_padrao",
      antes: { provedor: "anthropic", modelo: "claude-x" },
      payload: { operacao: "definir_padrao", corpo: { provider: "anthropic", default_model: "claude-z" } },
    });
    expect(RESUMO(saida.linhas)).toEqual([
      { rotulo: "Provedor", de: "anthropic", para: "anthropic" },
      { rotulo: "Modelo padrão", de: "claude-x", para: "claude-z" },
    ]);
    expect(saida.avisos.join(" ")).toContain("de uma vez");
  });

  it("funil:criar_funil — nome e descrição", () => {
    const saida = diffLegivel(t, {
      kind: "funil",
      operacao: "criar_funil",
      antes: null,
      payload: { operacao: "criar_funil", corpo: { name: "Pós-venda", description: "Quem já comprou" } },
    });
    expect(RESUMO(saida.linhas)).toEqual([
      { rotulo: "Nome do funil", de: null, para: "Pós-venda" },
      { rotulo: "Descrição", de: null, para: "Quem já comprou" },
    ]);
  });

  it("funil:criar_etapa — o funil atual e a etapa nova", () => {
    const saida = diffLegivel(t, {
      kind: "funil",
      operacao: "criar_etapa",
      antes: { funil: "Vendas", etapas: ["Novo", "Em negociação"] },
      payload: { operacao: "criar_etapa", pipeline_id: "x", corpo: { name: "Follow-up" } },
    });
    expect(RESUMO(saida.linhas)).toEqual([
      { rotulo: "Funil", de: null, para: "Vendas" },
      { rotulo: "Nova etapa", de: null, para: "Follow-up" },
    ]);
  });

  it("funil:alterar_etapa — nome e posição legíveis", () => {
    const saida = diffLegivel(t, {
      kind: "funil",
      operacao: "alterar_etapa",
      antes: { funil: "Vendas", etapa: "Follow-up", posicao: 2, ordem_das_etapas: ["Novo", "Follow-up"] },
      payload: { operacao: "alterar_etapa", pipeline_id: "x", stage_id: "y", corpo: { name: "Follow-up 2", depois_de: null } },
    });
    expect(RESUMO(saida.linhas)).toEqual([
      { rotulo: "Nome da etapa", de: "Follow-up", para: "Follow-up 2" },
      { rotulo: "Posição no funil", de: "posição 2", para: "primeira do funil" },
    ]);
  });
});

describe("espanhol pelo mesmo tradutor", () => {
  it("roteador:criar e definir_ponto saem em espanhol", () => {
    const saida = diffLegivel(tEs, {
      kind: "roteador",
      operacao: "criar",
      antes: null,
      payload: { operacao: "criar", corpo: { name: "Clínica", channel_session_id: "11111111-2222-4333-8444-555555555551" } },
    });
    expect(saida.linhas[0]!.rotulo).toBe("Nombre del router");
    expect(saida.avisos[0]).toContain("nace activo");

    const ponto = diffLegivel(tEs, {
      kind: "modelo_auxiliares",
      operacao: "definir_ponto",
      antes: { ponto: "assistente_chat", provedor: "anthropic", modelo: "claude-x", origem: "binding" },
      payload: { operacao: "definir_ponto", corpo: { purpose: "assistente_chat", provider: "openai", model_id: "gpt-y" } },
    });
    expect(ponto.linhas.map((l) => l.rotulo)).toEqual(["Punto de IA", "Proveedor", "Modelo"]);
    expect(ponto.avisos[0]).toContain("credencial");
  });
});
