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
  ler_porta: ["porta", "valores", "filtros"],
  procurar_porta: ["pergunta"],
  propor_mudanca: [
    "porta", "metodo", "valores", "corpo", "resumo", "motivo",
  ],
  montar_pacote_do_nicho: [
    "nicho", "negocio", "descricao", "nome_do_agente", "followups",
  ],
  testar_agente: ["agente_id", "mensagens"],
  auditar_empresa: [],
};

const FERRAMENTAS_DE_LEITURA = [
  "abrir_tela",
  "auditar_empresa",
  "consultar_metrica",
  "ler_guia",
  "ler_porta",
  "listar_metricas",
  "listar_telas",
  "procurar_porta",
];

const FERRAMENTAS_SO_ADMIN = [
  "propor_mudanca",
  "montar_pacote_do_nicho",
  "testar_agente",
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

  it("viewer, agent e manager não recebem nenhuma das 3 ferramentas de escrita", () => {
    for (const papel of ["viewer", "agent", "manager"] as const) {
      const { ferramentas } = montarParaTeste(papel);

      expect(Object.keys(ferramentas).sort()).toEqual([...FERRAMENTAS_DE_LEITURA].sort());
      for (const f of FERRAMENTAS_SO_ADMIN) {
        expect(ferramentas).not.toHaveProperty(f);
      }
    }
  });

  it("admin recebe as 3 ferramentas de escrita + as de leitura", () => {
    const { ferramentas: doAdmin } = montarParaTeste("admin");
    const adminChaves = Object.keys(doAdmin).sort();
    expect(adminChaves).toEqual([...FERRAMENTAS_DE_LEITURA, ...FERRAMENTAS_SO_ADMIN].sort());
    for (const f of FERRAMENTAS_SO_ADMIN) {
      expect(doAdmin).toHaveProperty(f);
    }
  });

  it("o teto de passos do turno é 15", () => {
    expect(MAXIMO_DE_PASSOS_DO_ASSISTENTE).toBe(15);
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
    ["ler_porta", { porta: 123 }],
    ["procurar_porta", { pergunta: 123 }],
    ["propor_mudanca", { porta: 123 }],
    ["montar_pacote_do_nicho", { nicho: 123 }],
    ["testar_agente", { agente_id: "não-é-uuid" }],
    ["auditar_empresa", { x: 1 }],
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
    "ler_porta",
    "procurar_porta",
    "propor_mudanca",
    "montar_pacote_do_nicho",
    "testar_agente",
    "auditar_empresa",
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
