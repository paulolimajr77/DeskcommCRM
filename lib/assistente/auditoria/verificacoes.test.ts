/**
 * Testes puros do catálogo de verificações (F3) — sem fetch, sem banco, sem
 * Next. Cada caso passa os dados crus já lidos das rotas e confere o estado
 * calculado, incluindo dependências ("falta X para ativar").
 */
import { describe, expect, it } from "vitest";

import { lerVerificacao, type EstadoVerificacao } from "@/lib/assistente/auditoria/verificacoes";
import { traduzir } from "@/lib/i18n/dicionario";

const t = (texto: string) => traduzir(texto, "pt-BR");

const leituraVazia = {
  provedoresIA: [],
  instalacaoTemChave: false,
  canaisWhatsApp: [],
  funis: [],
  etapasDoFunil: [],
  agentes: [],
  roteadores: [],
  fontesConhecimento: [],
  followups: [],
};

describe("lerVerificacao — credencial_ia", () => {
  it("preenchido quando há credencial validada e ativa", () => {
    const leitura = {
      ...leituraVazia,
      provedoresIA: [
        { id: "c1", provider: "anthropic", label: "Minha chave", validated_at: "2026-10-01T00:00:00Z", is_active: true },
      ],
    };
    const item = lerVerificacao(t, "credencial_ia", leitura, new Map());
    expect(item.estado).toBe("preenchido");
    expect(item.ferramenta).toBeNull();
    expect(item.depende_de).toEqual([]);
  });

  it("preciso_confirmar quando não há credencial válida", () => {
    const leitura = {
      ...leituraVazia,
      provedoresIA: [
        { id: "c1", provider: "anthropic", label: "Sem validação", validated_at: null, is_active: true },
      ],
    };
    const item = lerVerificacao(t, "credencial_ia", leitura, new Map());
    expect(item.estado).toBe("preciso_confirmar");
    expect(item.por_que).toContain("validada");
    expect(item.ferramenta).toBeNull();
  });
});

describe("lerVerificacao — canal_whatsapp", () => {
  it("preenchido quando há canal WORKING", () => {
    const leitura = {
      ...leituraVazia,
      canaisWhatsApp: [{ id: "s1", status: "WORKING", numero: "+5511999999999" }],
    };
    const item = lerVerificacao(t, "canal_whatsapp", leitura, new Map());
    expect(item.estado).toBe("preenchido");
    expect(item.ferramenta).toBeNull();
  });

  it("preciso_confirmar quando não há canal WORKING", () => {
    const leitura = {
      ...leituraVazia,
      canaisWhatsApp: [{ id: "s1", status: "PAIRING", numero: "+5511999999999" }],
    };
    const item = lerVerificacao(t, "canal_whatsapp", leitura, new Map());
    expect(item.estado).toBe("preciso_confirmar");
    expect(item.ferramenta).toBeNull();
  });
});

describe("lerVerificacao — funil_etapas", () => {
  it("preenchido quando há funil com etapa", () => {
    const leitura = {
      ...leituraVazia,
      funis: [{ id: "f1", name: "Vendas" }],
      etapasDoFunil: [{ id: "e1", name: "Prospecção", pipeline_id: "f1" }],
    };
    const item = lerVerificacao(t, "funil_etapas", leitura, new Map());
    expect(item.estado).toBe("preenchido");
  });

  it("posso_completar via criar_funil quando não há funil", () => {
    const leitura = { ...leituraVazia, funis: [], etapasDoFunil: [] };
    const item = lerVerificacao(t, "funil_etapas", leitura, new Map());
    expect(item.estado).toBe("posso_completar");
    expect(item.ferramenta).toBe("criar_funil");
  });

  it("posso_completar via criar_etapa quando há funil sem etapa", () => {
    const leitura = {
      ...leituraVazia,
      funis: [{ id: "f1", name: "Vendas" }],
      etapasDoFunil: [],
    };
    const item = lerVerificacao(t, "funil_etapas", leitura, new Map());
    expect(item.estado).toBe("posso_completar");
    expect(item.ferramenta).toBe("criar_etapa");
  });
});

describe("lerVerificacao — agente_publicado", () => {
  it("preenchido quando há agente publicado e ativo COM chave utilizável do provedor", () => {
    const leitura = {
      ...leituraVazia,
      // O agente publicado só responde se o provedor da versão tem chave
      // validada (ou se a chave é a da instalação). Sem esta linha, a chave
      // utilizável não existe e o estado vira `preciso_confirmar`.
      provedoresIA: [
        { id: "c1", provider: "anthropic", label: "Minha chave", validated_at: "2026-10-01T00:00:00Z", is_active: true },
      ],
      agentes: [
        {
          id: "a1",
          name: "Agente de vendas",
          is_active: true,
          paused_at: null,
          archived_at: null,
          published_version_id: "v1",
          versao_publicada: { provider: "anthropic", model: "claude-3", credential_id: "c1" },
        },
      ],
    };
    const item = lerVerificacao(t, "agente_publicado", leitura, new Map());
    expect(item.estado).toBe("preenchido");
    expect(item.ferramenta).toBeNull();
  });

  it("preenchido quando a chave veio da INSTALAÇÃO, mesmo sem credencial cadastrada", () => {
    const leitura = {
      ...leituraVazia,
      instalacaoTemChave: true,
      agentes: [
        {
          id: "a1",
          name: "Agente de vendas",
          is_active: true,
          paused_at: null,
          archived_at: null,
          published_version_id: "v1",
          versao_publicada: { provider: "anthropic", model: "claude-3", credential_id: null },
        },
      ],
    };
    const item = lerVerificacao(t, "agente_publicado", leitura, new Map());
    expect(item.estado).toBe("preenchido");
  });

  it("preciso_confirmar quando o agente está publicado mas não há chave utilizável", () => {
    const leitura = {
      ...leituraVazia,
      provedoresIA: [
        // Chave de OUTRO provedor: não serve para a versão publicada.
        { id: "c1", provider: "openai", label: "Chave OpenAI", validated_at: "2026-10-01T00:00:00Z", is_active: true },
      ],
      agentes: [
        {
          id: "a1",
          name: "Agente de vendas",
          is_active: true,
          paused_at: null,
          archived_at: null,
          published_version_id: "v1",
          versao_publicada: { provider: "anthropic", model: "claude-3", credential_id: null },
        },
      ],
    };
    const item = lerVerificacao(t, "agente_publicado", leitura, new Map());
    expect(item.estado).toBe("preciso_confirmar");
    expect(item.por_que).toContain("anthropic");
    expect(item.onde_resolver).toBe("/app/ai/providers");
  });

  it("posso_completar via criar_rascunho_de_agente quando não há agente", () => {
    const leitura = { ...leituraVazia, agentes: [] };
    const item = lerVerificacao(t, "agente_publicado", leitura, new Map());
    expect(item.estado).toBe("posso_completar");
    expect(item.ferramenta).toBe("criar_rascunho_de_agente");
  });
});

describe("lerVerificacao — roteador depende de canal e agente", () => {
  it("preciso_confirmar quando canal não está pronto", () => {
    const leitura = {
      ...leituraVazia,
      canaisWhatsApp: [],
      agentes: [
        {
          id: "a1",
          name: "Agente",
          is_active: true,
          paused_at: null,
          archived_at: null,
          published_version_id: "v1",
        },
      ],
      roteadores: [],
    };
    const estados = new Map<string, EstadoVerificacao>([["agente_publicado", "preenchido"]]);
    const item = lerVerificacao(t, "roteador", leitura, estados);
    expect(item.estado).toBe("preciso_confirmar");
    expect(item.ferramenta).toBeNull();
    expect(item.depende_de).toContain("canal_whatsapp");
  });

  it("preenchido quando há roteador ativo com canal", () => {
    const leitura = {
      ...leituraVazia,
      canaisWhatsApp: [{ id: "s1", status: "WORKING", numero: "+5511999999999" }],
      agentes: [
        {
          id: "a1",
          name: "Agente",
          is_active: true,
          paused_at: null,
          archived_at: null,
          published_version_id: "v1",
        },
      ],
      roteadores: [{ id: "r1", name: "Roteador principal", is_active: true, channel_session_id: "s1", fallback_agent_id: null }],
    };
    const estados = new Map<string, EstadoVerificacao>([
      ["canal_whatsapp", "preenchido"],
      ["agente_publicado", "preenchido"],
    ]);
    const item = lerVerificacao(t, "roteador", leitura, estados);
    expect(item.estado).toBe("preenchido");
    expect(item.ferramenta).toBeNull();
  });

  it("posso_completar via propor_roteador quando canal e agente estão prontos mas não há roteador", () => {
    const leitura = {
      ...leituraVazia,
      canaisWhatsApp: [{ id: "s1", status: "WORKING", numero: "+5511999999999" }],
      agentes: [
        {
          id: "a1",
          name: "Agente",
          is_active: true,
          paused_at: null,
          archived_at: null,
          published_version_id: "v1",
        },
      ],
      roteadores: [],
    };
    const estados = new Map<string, EstadoVerificacao>([
      ["canal_whatsapp", "preenchido"],
      ["agente_publicado", "preenchido"],
    ]);
    const item = lerVerificacao(t, "roteador", leitura, estados);
    expect(item.estado).toBe("posso_completar");
    expect(item.ferramenta).toBe("propor_roteador");
  });
});

describe("lerVerificacao — conhecimento", () => {
  it("preenchido quando há fonte FAQ ou documento", () => {
    const leitura = {
      ...leituraVazia,
      fontesConhecimento: [{ id: "k1", name: "Perguntas frequentes", source_type: "faq" }],
    };
    const item = lerVerificacao(t, "conhecimento", leitura, new Map());
    expect(item.estado).toBe("preenchido");
  });

  it("posso_completar via propor_conhecimento quando não há fonte", () => {
    const leitura = { ...leituraVazia, fontesConhecimento: [] };
    const item = lerVerificacao(t, "conhecimento", leitura, new Map());
    expect(item.estado).toBe("posso_completar");
    expect(item.ferramenta).toBe("propor_conhecimento");
  });
});

describe("lerVerificacao — followup_instalado", () => {
  it("preenchido quando há follow-up ativo", () => {
    const leitura = {
      ...leituraVazia,
      followups: [{ id: "fl1", name: "Boas-vindas", status: "ativo" }],
    };
    const item = lerVerificacao(t, "followup_instalado", leitura, new Map());
    expect(item.estado).toBe("preenchido");
  });

  it("posso_completar via instalar_modelo_de_followup quando não há", () => {
    const leitura = { ...leituraVazia, followups: [] };
    const item = lerVerificacao(t, "followup_instalado", leitura, new Map());
    expect(item.estado).toBe("posso_completar");
    expect(item.ferramenta).toBe("instalar_modelo_de_followup");
  });
});

describe("lerVerificacao — horario_atendimento", () => {
  it("sempre nao_se_aplica nesta versão", () => {
    const item = lerVerificacao(t, "horario_atendimento", leituraVazia, new Map());
    expect(item.estado).toBe("nao_se_aplica");
    expect(item.ferramenta).toBeNull();
  });
});
