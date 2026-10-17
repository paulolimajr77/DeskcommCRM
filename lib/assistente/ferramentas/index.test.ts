/**
 * O conjunto das ferramentas do assistente: quais são, o que cada esquema de
 * entrada aceita (e, principalmente, o que NÃO aceita) e que nenhum `execute`
 * lança.
 */
// @vitest-environment node
import { asSchema, type ToolSet } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContextoDeConsulta } from "@/lib/assistente/metricas";
import { criarBancoFalso } from "@/lib/assistente/metricas/consultas/banco-falso";
import { logger } from "@/lib/logger";

import { chamar, ctxDe, montarParaTeste, OUTRA_ORG } from "./auxiliar-de-teste";
import { criarColetorDoTurno, MAXIMO_DE_PASSOS_DO_ASSISTENTE, montarFerramentasDoAssistente } from "./index";

const PROIBIDAS = [
  "organization_id",
  "organizacao",
  "org",
  "org_id",
  "tenant_id",
  "papel",
  "role",
  "user_id",
  "usuario",
  "url",
  "path",
  "caminho",
  "sql",
];

const PROPRIEDADES_ESPERADAS: Record<string, string[]> = {
  listar_metricas: [],
  consultar_metrica: ["metrica", "parametros"],
  listar_telas: ["busca"],
  abrir_tela: ["destino"],
  ler_guia: ["guia"],
  ler_configuracao_de_ia: [],
  listar_agentes: ["incluir_arquivados"],
  listar_funis: [],
  listar_materiais: [],
  criar_rascunho_de_agente: ["nome", "descricao", "prompt", "pacotes", "funis", "materiais"],
  listar_modelos_de_followup: [],
  listar_etapas_do_funil: ["funil_id"],
  instalar_modelo_de_followup: ["model_id", "etapa_id", "nome"],
  montar_pacote_do_nicho: ["nicho", "negocio", "descricao", "nome_do_agente", "followups"],
  testar_agente: ["agente_id", "mensagens"],
  propor_roteador: [
    "operacao", "resumo", "motivo", "router_id", "name", "channel_session_id", "fallback_agent_id",
    "members", "agent_id", "intent_name", "intent_description", "examples",
  ],
  propor_conhecimento: [
    "source_type", "resumo", "motivo", "name", "items", "question", "answer", "locale", "markdown_blob", "agent_id",
  ],
  propor_memoria: ["operacao", "resumo", "motivo", "title", "body", "entry_id"],
  propor_modelo_dos_auxiliares: ["operacao", "resumo", "motivo", "purpose", "provider", "model_id", "default_model"],
  propor_funil: ["operacao", "resumo", "motivo", "pipeline_id", "stage_id", "name", "description", "depois_de"],
};

const FERRAMENTAS_DE_PROPOSTA = [
  "propor_roteador",
  "propor_conhecimento",
  "propor_memoria",
  "propor_modelo_dos_auxiliares",
  "propor_funil",
];

/** Todos os nomes de propriedade de um JSON Schema, em qualquer profundidade. */
function nomesDePropriedades(esquema: unknown): string[] {
  const nomes: string[] = [];
  const visitar = (no: unknown): void => {
    if (Array.isArray(no)) {
      no.forEach(visitar);
      return;
    }
    if (no === null || typeof no !== "object") return;
    const objeto = no as Record<string, unknown>;
    const propriedades = objeto.properties;
    if (propriedades !== null && typeof propriedades === "object") {
      for (const [nome, sub] of Object.entries(propriedades)) {
        nomes.push(nome);
        visitar(sub);
      }
    }
    for (const [chave, valor] of Object.entries(objeto)) {
      if (chave !== "properties") visitar(valor);
    }
  };
  visitar(esquema);
  return nomes;
}

async function esquemaDeEntradaDe(ferramentas: ToolSet, nome: string): Promise<Record<string, unknown>> {
  const ferramenta = ferramentas[nome];
  if (!ferramenta) throw new Error(`ferramenta ${nome} ausente`);
  const json = await asSchema(ferramenta.inputSchema).jsonSchema;
  return json as Record<string, unknown>;
}

describe("montarFerramentasDoAssistente", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("viewer e agent têm SÓ as cinco de leitura — as 4 de configuração não existem", () => {
    for (const papel of ["viewer", "agent"] as const) {
      const { ferramentas } = montarParaTeste(papel);

      expect(Object.keys(ferramentas).sort()).toEqual([
        "abrir_tela",
        "auditar_empresa",
        "consultar_metrica",
        "ler_guia",
        "listar_metricas",
        "listar_telas",
      ]);
    }
  });

  it("manager e admin têm as cinco de leitura MAIS as 4 de configuração e as 2 de follow-up", () => {
    const { ferramentas } = montarParaTeste("manager");

    expect(Object.keys(ferramentas).sort()).toEqual([
      "abrir_tela",
      "auditar_empresa",
      "consultar_metrica",
      "ler_configuracao_de_ia",
      "ler_guia",
      "listar_agentes",
      "listar_etapas_do_funil",
      "listar_funis",
      "listar_materiais",
      "listar_metricas",
      "listar_modelos_de_followup",
      "listar_telas",
    ]);
    expect(ferramentas).not.toHaveProperty("instalar_modelo_de_followup");
    expect(ferramentas).not.toHaveProperty("criar_rascunho_de_agente");
  });

  it("só admin tem criar_rascunho_de_agente, instalar_modelo_de_followup, montar_pacote_do_nicho, testar_agente e as cinco propor_* — manager, viewer e agent não", () => {
    const { ferramentas: doAdmin } = montarParaTeste("admin");
    expect(Object.keys(doAdmin).sort()).toEqual([
      "abrir_tela",
      "auditar_empresa",
      "consultar_metrica",
      "criar_rascunho_de_agente",
      "instalar_modelo_de_followup",
      "ler_configuracao_de_ia",
      "ler_guia",
      "listar_agentes",
      "listar_etapas_do_funil",
      "listar_funis",
      "listar_materiais",
      "listar_metricas",
      "listar_modelos_de_followup",
      "listar_telas",
      "montar_pacote_do_nicho",
      "propor_conhecimento",
      "propor_funil",
      "propor_memoria",
      "propor_modelo_dos_auxiliares",
      "propor_roteador",
      "testar_agente",
    ]);
    for (const papel of ["manager", "viewer", "agent"] as const) {
      const { ferramentas } = montarParaTeste(papel);
      expect(ferramentas).not.toHaveProperty("criar_rascunho_de_agente");
      expect(ferramentas).not.toHaveProperty("instalar_modelo_de_followup");
      expect(ferramentas).not.toHaveProperty("montar_pacote_do_nicho");
      expect(ferramentas).not.toHaveProperty("testar_agente");
      // Sabotagem: mover as propor_* para o catálogo de manager em index.ts → este laço fica vermelho.
      for (const nome of FERRAMENTAS_DE_PROPOSTA) expect(ferramentas, nome).not.toHaveProperty(nome);
    }
  });

  it("o teto de passos do turno é 6", () => {
    expect(MAXIMO_DE_PASSOS_DO_ASSISTENTE).toBe(6);
  });

  it("cada esquema de entrada tem exatamente as propriedades esperadas", async () => {
    const { ferramentas } = montarParaTeste("admin");

    for (const [nome, esperadas] of Object.entries(PROPRIEDADES_ESPERADAS)) {
      const esquema = await esquemaDeEntradaDe(ferramentas, nome);
      expect({ nome, propriedades: nomesDePropriedades(esquema).sort() }).toEqual({
        nome,
        propriedades: [...esperadas].sort(),
      });
    }
  });

  it("nenhum esquema aceita organização, papel, usuário, URL, caminho ou SQL", async () => {
    const { ferramentas } = montarParaTeste("admin");

    for (const nome of Object.keys(ferramentas)) {
      const esquema = await esquemaDeEntradaDe(ferramentas, nome);
      const proibidas = nomesDePropriedades(esquema).filter((propriedade) => PROIBIDAS.includes(propriedade));
      expect({ nome, proibidas }).toEqual({ nome, proibidas: [] });
    }
  });

  it("o percorredor de esquema enxerga propriedade proibida aninhada (a trava não é cega)", () => {
    const esquema = {
      type: "object",
      properties: {
        a: { type: "object", properties: { organization_id: { type: "string" } } },
        b: { anyOf: [{ type: "object", properties: { sql: { type: "string" } } }] },
      },
    };

    expect(nomesDePropriedades(esquema).sort()).toEqual(["a", "b", "organization_id", "sql"]);
  });

  it("todo esquema de entrada é estrito: additionalProperties false na raiz", async () => {
    const { ferramentas } = montarParaTeste("admin");

    for (const nome of Object.keys(ferramentas)) {
      const esquema = await esquemaDeEntradaDe(ferramentas, nome);
      expect({ nome, adicionais: esquema.additionalProperties }).toEqual({ nome, adicionais: false });
    }
  });

  it.each([
    ["listar_metricas", { x: 1 }],
    ["consultar_metrica", { metrica: 123 }],
    ["listar_telas", { busca: 42 }],
    ["abrir_tela", { destino: ["/app/inbox"] }],
    ["ler_guia", { guia: {} }],
    ["ler_configuracao_de_ia", { x: 1 }],
    ["listar_agentes", { incluir_arquivados: "sim" }],
    ["listar_funis", { x: 1 }],
    ["listar_materiais", { x: 1 }],
    ["criar_rascunho_de_agente", { nome: 123 }],
    ["listar_modelos_de_followup", { x: 1 }],
    ["listar_etapas_do_funil", { funil_id: 123 }],
    ["instalar_modelo_de_followup", { model_id: 123 }],
    ["montar_pacote_do_nicho", { nicho: 123 }],
    ["testar_agente", { agente_id: 123 }],
    ["propor_roteador", { operacao: 123 }],
    ["propor_conhecimento", { source_type: 123 }],
    ["propor_memoria", { operacao: 123 }],
    ["propor_modelo_dos_auxiliares", { operacao: 123 }],
    ["propor_funil", { operacao: 123 }],
  ])("%s com entrada de tipo errado não lança e devolve parametro_invalido", async (nome, entrada) => {
    const { ferramentas, sessao } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, nome, entrada);

    expect(saida).toEqual({ ok: false, motivo: "parametro_invalido" });
    expect(sessao.consultas.length).toBe(0);
  });

  it.each([
    "listar_metricas",
    "consultar_metrica",
    "listar_telas",
    "abrir_tela",
    "ler_guia",
    "ler_configuracao_de_ia",
    "listar_agentes",
    "listar_funis",
    "listar_materiais",
    "criar_rascunho_de_agente",
    "listar_modelos_de_followup",
    "listar_etapas_do_funil",
    "instalar_modelo_de_followup",
    "montar_pacote_do_nicho",
    "testar_agente",
    ...FERRAMENTAS_DE_PROPOSTA,
  ])(
    "%s com entrada nula não lança e devolve parametro_invalido",
    async (nome) => {
      const { ferramentas } = montarParaTeste("admin");

      expect(await chamar(ferramentas, nome, null)).toEqual({ ok: false, motivo: "parametro_invalido" });
    },
  );

  it("organization_id no corpo da chamada é recusado pelo esquema estrito e o banco não é tocado", async () => {
    const { ferramentas, sessao, coletor } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "consultar_metrica", {
      metrica: "conversas_por_visao",
      organization_id: OUTRA_ORG,
    });

    expect(saida).toEqual({ ok: false, motivo: "parametro_invalido" });
    expect(sessao.consultas.length).toBe(0);
    expect(coletor.metricas).toEqual([]);
  });

  it("exceção dentro de uma ferramenta vira indisponivel, sem a mensagem do erro", async () => {
    const aviso = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const base = ctxDe("admin", criarBancoFalso({}).client);
    const ctx: ContextoDeConsulta = {
      ...base,
      get papel(): ContextoDeConsulta["papel"] {
        throw new Error("SEGREDO-DO-ERRO");
      },
    };
    const ferramentas = montarFerramentasDoAssistente({ ctx, skills: [], coletor: criarColetorDoTurno() });

    const saida = await chamar(ferramentas, "listar_metricas", {});

    expect(saida).toEqual({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(saida)).not.toContain("SEGREDO-DO-ERRO");
    expect(aviso).toHaveBeenCalledWith("assistente.ferramentas.falhou", {
      ferramenta: "listar_metricas",
      detalhe: "SEGREDO-DO-ERRO",
    });
  });
});

describe("criarColetorDoTurno", () => {
  it("nasce vazio e cada turno recebe o seu, sem compartilhar listas", () => {
    const um = criarColetorDoTurno();
    const dois = criarColetorDoTurno();
    um.metricas.push("conversas_por_visao");

    expect(um).toEqual({ metricas: ["conversas_por_visao"], acoes: [] });
    expect(dois).toEqual({ metricas: [], acoes: [] });
  });
});
