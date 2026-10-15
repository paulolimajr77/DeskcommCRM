import { describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";

import {
  JANELA_DO_LIMITE_HORAS,
  lerLimitesDoAssistente,
  verificarLimiteDePerguntas,
  PERGUNTAS_POR_PESSOA_PADRAO,
  MAXIMO_POR_PESSOA,
  MAXIMO_POR_ORGANIZACAO,
} from "./limites";
import { criarBancoFalso } from "./metricas/consultas/banco-falso";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "22222222-2222-4333-8444-555555555555";

describe("lerLimitesDoAssistente", () => {
  it("sem linha em ai_budgets → padrões", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [],
    });
    const limites = await lerLimitesDoAssistente(client, ORG);
    expect(limites).toEqual({
      por_pessoa: PERGUNTAS_POR_PESSOA_PADRAO,
      por_organizacao: null,
    });
  });

  it("com linha → valores dela", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 100,
          assistant_questions_per_org_day: 500,
        },
      ],
    });
    const limites = await lerLimitesDoAssistente(client, ORG);
    expect(limites).toEqual({
      por_pessoa: 100,
      por_organizacao: 500,
    });
  });

  it("org com null → null (não 0)", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 60,
          assistant_questions_per_org_day: null,
        },
      ],
    });
    const limites = await lerLimitesDoAssistente(client, ORG);
    expect(limites).toEqual({
      por_pessoa: 60,
      por_organizacao: null,
    });
  });

  it("erro de leitura → padrões", async () => {
    const { client } = criarBancoFalso({}, "ai_budgets");
    const limites = await lerLimitesDoAssistente(client, ORG);
    expect(limites).toEqual({
      por_pessoa: PERGUNTAS_POR_PESSOA_PADRAO,
      por_organizacao: null,
    });
  });
});

describe("verificarLimiteDePerguntas", () => {
  it("abaixo do limite → ok: true", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 100,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: [
        { organization_id: ORG, author_kind: "human", author_user_id: USER, created_at: new Date().toISOString() },
        { organization_id: ORG, author_kind: "human", author_user_id: USER, created_at: new Date().toISOString() },
      ],
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado).toEqual({ ok: true });
  });

  it("no limite (contagem == limite) → bloqueia com escopo pessoa", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 5,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: Array.from({ length: 5 }, (_, i) => ({
        organization_id: ORG,
        author_kind: "human",
        author_user_id: USER,
        created_at: new Date().toISOString(),
        id: i,
      })),
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.escopo).toBe("pessoa");
      expect(resultado.limite).toBe(5);
      expect(resultado.mensagem).toContain("limite de perguntas");
    }
  });

  it("mensagem PT exata", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 1,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: [
        { organization_id: ORG, author_kind: "human", author_user_id: USER, created_at: new Date().toISOString() },
      ],
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensagem).toBe(
        "Você chegou ao limite de perguntas de hoje. Peça a um administrador para ajustar em Uso de IA › Orçamento.",
      );
    }
  });

  it("com idioma es → mensagem ES exata", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 1,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: [
        { organization_id: ORG, author_kind: "human", author_user_id: USER, created_at: new Date().toISOString() },
      ],
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "es",
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensagem).toBe(
        "Has alcanzado el límite de preguntas de hoy. Pide a un administrador que lo ajuste en Uso de IA › Presupuesto.",
      );
    }
  });

  it("pergunta de outra pessoa não conta para a pessoa", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 1,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: [
        { organization_id: ORG, author_kind: "human", author_user_id: "other-user", created_at: new Date().toISOString() },
      ],
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado).toEqual({ ok: true });
  });

  it("pergunta de outra pessoa conta para a organização", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 10,
          assistant_questions_per_org_day: 2,
        },
      ],
      config_messages: [
        { organization_id: ORG, author_kind: "human", author_user_id: "other-user", created_at: new Date().toISOString() },
        { organization_id: ORG, author_kind: "human", author_user_id: "other-user", created_at: new Date().toISOString() },
      ],
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.escopo).toBe("organizacao");
      expect(resultado.limite).toBe(2);
    }
  });

  it("pergunta de outra org não conta", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 1,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: [
        { organization_id: "other-org", author_kind: "human", author_user_id: USER, created_at: new Date().toISOString() },
      ],
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado).toEqual({ ok: true });
  });

  it("mensagem com author_kind: ai não conta", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 1,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: [
        { organization_id: ORG, author_kind: "ai", author_user_id: USER, created_at: new Date().toISOString() },
      ],
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado).toEqual({ ok: true });
  });

  it("pergunta de 25h atrás não conta", async () => {
    const agora = new Date();
    const h25atras = new Date(agora.getTime() - 25 * 60 * 60 * 1000);
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 1,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: [
        { organization_id: ORG, author_kind: "human", author_user_id: USER, created_at: h25atras.toISOString() },
      ],
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
      agora,
    });
    expect(resultado).toEqual({ ok: true });
  });

  it("pergunta de 23h atrás conta", async () => {
    const agora = new Date();
    const h23atras = new Date(agora.getTime() - 23 * 60 * 60 * 1000);
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 1,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: [
        { organization_id: ORG, author_kind: "human", author_user_id: USER, created_at: h23atras.toISOString() },
      ],
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
      agora,
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.escopo).toBe("pessoa");
    }
  });

  it("por_organizacao: null => nunca bloqueia por org", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 10,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: Array.from({ length: 5000 }, (_, i) => ({
        organization_id: ORG,
        author_kind: "human",
        author_user_id: `user-${i}`,
        created_at: new Date().toISOString(),
      })),
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado).toEqual({ ok: true });
  });

  it("por_organizacao: 10 com 10 perguntas de pessoas diferentes => bloqueia org", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 100,
          assistant_questions_per_org_day: 10,
        },
      ],
      config_messages: Array.from({ length: 10 }, (_, i) => ({
        organization_id: ORG,
        author_kind: "human",
        author_user_id: `user-${i}`,
        created_at: new Date().toISOString(),
      })),
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.escopo).toBe("organizacao");
      expect(resultado.limite).toBe(10);
      expect(resultado.mensagem).toContain("organização chegou");
    }
  });

  it("pessoa E org estouraram => escopo pessoa", async () => {
    const { client } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 5,
          assistant_questions_per_org_day: 3,
        },
      ],
      config_messages: Array.from({ length: 5 }, (_, i) => ({
        organization_id: ORG,
        author_kind: "human",
        author_user_id: USER,
        created_at: new Date().toISOString(),
      })),
    });
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.escopo).toBe("pessoa");
    }
  });

  it("toda consulta carrega organization_id = orgId", async () => {
    const { client, consultas } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 100,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: [],
    });
    await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    const filtrosOrgMensagens = consultas
      .filter((q) => q.tabela === "config_messages")
      .flatMap((q) => q.filtros);
    expect(filtrosOrgMensagens).toContainEqual(["organization_id", ORG]);
  });

  it("consultaDeContagem da pessoa carrega author_user_id = userId", async () => {
    const { client, consultas } = criarBancoFalso({
      ai_budgets: [
        {
          organization_id: ORG,
          assistant_questions_per_user_day: 100,
          assistant_questions_per_org_day: null,
        },
      ],
      config_messages: [],
    });
    await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    const contagens = consultas.filter((q) => q.tabela === "config_messages");
    expect(contagens).toHaveLength(1);
    expect(contagens[0]?.filtros).toContainEqual(["author_user_id", USER]);
    expect(contagens[0]?.filtros).toContainEqual(["author_kind", "human"]);
    expect(contagens[0]?.contou).toBe(true);
  });

  it("erro ao contar => ok: true e o erro é registrado (o teto em dinheiro segue valendo)", async () => {
    vi.mocked(logger.warn).mockClear();
    const { client } = criarBancoFalso(
      {
        ai_budgets: [
          {
            organization_id: ORG,
            assistant_questions_per_user_day: 1,
            assistant_questions_per_org_day: null,
          },
        ],
        // Já estourou o limite de 1: só o erro de leitura explica o ok.
        config_messages: [
          { organization_id: ORG, author_kind: "human", author_user_id: USER, created_at: new Date().toISOString() },
        ],
      },
      "config_messages",
    );
    const resultado = await verificarLimiteDePerguntas(client, {
      orgId: ORG,
      userId: USER,
      idioma: "pt-BR",
    });
    expect(resultado).toEqual({ ok: true });
    expect(logger.warn).toHaveBeenCalledWith(
      "assistente.limites.contagem_falhou",
      expect.objectContaining({ organization_id: ORG, escopo: "pessoa" }),
    );
  });

  it("sem limite de organização, a contagem da organização nem é feita", async () => {
    const { client, consultas } = criarBancoFalso({
      ai_budgets: [
        { organization_id: ORG, assistant_questions_per_user_day: 100, assistant_questions_per_org_day: null },
      ],
      config_messages: [],
    });
    await verificarLimiteDePerguntas(client, { orgId: ORG, userId: USER, idioma: "pt-BR" });
    expect(consultas.filter((q) => q.tabela === "config_messages")).toHaveLength(1);
  });

  it("a janela é de 24 horas e os máximos são os mesmos CHECKs do banco", () => {
    expect(JANELA_DO_LIMITE_HORAS).toBe(24);
    expect(PERGUNTAS_POR_PESSOA_PADRAO).toBe(60);
    expect(MAXIMO_POR_PESSOA).toBe(10000);
    expect(MAXIMO_POR_ORGANIZACAO).toBe(100000);
  });
});
