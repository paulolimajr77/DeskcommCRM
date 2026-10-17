/**
 * Testes puros do cálculo da auditoria (F3) — confere o estado calculado de
 * cada verificação, a contagem de pendências e o comportamento das
 * dependências ("falta X para ativar").
 */
import { describe, expect, it } from "vitest";

import { calcularAuditoria } from "@/lib/assistente/auditoria/calcular";
import { traduzir } from "@/lib/i18n/dicionario";

const t = (texto: string) => traduzir(texto, "pt-BR");

const leituraVazia = {
  provedoresIA: [],
  canaisWhatsApp: [],
  funis: [],
  etapasDoFunil: [],
  agentes: [],
  roteadores: [],
  fontesConhecimento: [],
  followups: [],
};

const leituraTudoPreenchido = {
  ...leituraVazia,
  provedoresIA: [{ id: "c1", provider: "anthropic", label: "Chave", validated_at: "2026-10-01T00:00:00Z", is_active: true }],
  canaisWhatsApp: [{ id: "s1", status: "WORKING", numero: "+5511999999999" }],
  funis: [{ id: "f1", name: "Vendas" }],
  etapasDoFunil: [{ id: "e1", name: "Prospecção", pipeline_id: "f1" }],
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
  roteadores: [{ id: "r1", name: "Roteador", is_active: true, channel_session_id: "s1", fallback_agent_id: null }],
  fontesConhecimento: [{ id: "k1", name: "FAQ", source_type: "faq" }],
  followups: [{ id: "fl1", name: "Boas-vindas", status: "ativo" }],
};

describe("calcularAuditoria — estados básicos", () => {
  it("tudo preenchido → zero pendências", () => {
    const resultado = calcularAuditoria(t, leituraTudoPreenchido);
    expect(resultado.pendencias).toEqual(0);
    // horario_atendimento é nao_se_aplica nesta versão; tudo o resto é preenchido.
    expect(resultado.itens.filter((i) => i.id !== "horario_atendimento").every((i) => i.estado === "preenchido")).toBe(true);
    expect(resultado.itens.find((i) => i.id === "horario_atendimento")?.estado).toBe("nao_se_aplica");
  });

  it("tudo vazio → críticas precisam_confirmar, demais posso_completar, roteador depende de canal+agente", () => {
    const resultado = calcularAuditoria(t, leituraVazia);
    const estados = new Map(resultado.itens.map((i) => [i.id, i.estado]));
    // Críticas (sem tool) → preciso_confirmar; as demais → posso_completar.
    expect(estados.get("credencial_ia")).toBe("preciso_confirmar");
    expect(estados.get("canal_whatsapp")).toBe("preciso_confirmar");
    expect(estados.get("funil_etapas")).toBe("posso_completar");
    expect(estados.get("agente_publicado")).toBe("posso_completar");
    // roteador depende de canal_whatsapp e agente_publicado, nenhum está preenchido → preciso_confirmar
    expect(estados.get("roteador")).toBe("preciso_confirmar");
    expect(estados.get("conhecimento")).toBe("posso_completar");
    expect(estados.get("followup_instalado")).toBe("posso_completar");
    expect(estados.get("horario_atendimento")).toBe("nao_se_aplica");
    // pendências = tudo exceto horario_atendimento (nao_se_aplica)
    expect(resultado.pendencias).toBe(7);
  });
});

describe("calcularAuditoria — dependências", () => {
  it("roteador é preciso_confirmar quando canal não está preenchido", () => {
    const leitura = {
      ...leituraVazia,
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
    };
    const resultado = calcularAuditoria(t, leitura);
    const roteador = resultado.itens.find((i) => i.id === "roteador");
    expect(roteador?.estado).toBe("preciso_confirmar");
    expect(roteador?.por_que).toContain("canal");
    expect(roteador?.depende_de).toContain("canal_whatsapp");
    expect(roteador?.ferramenta).toBeNull();
  });

  it("roteador é preciso_confirmar quando agente não está preenchido", () => {
    const leitura = {
      ...leituraVazia,
      canaisWhatsApp: [{ id: "s1", status: "WORKING", numero: "+5511999999999" }],
      roteadores: [],
    };
    const resultado = calcularAuditoria(t, leitura);
    const roteador = resultado.itens.find((i) => i.id === "roteador");
    expect(roteador?.estado).toBe("preciso_confirmar");
    expect(roteador?.por_que).toContain("agente");
    expect(roteador?.depende_de).toContain("agente_publicado");
  });

  it("roteador é posso_completar quando canal e agente estão prontos", () => {
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
    const resultado = calcularAuditoria(t, leitura);
    const roteador = resultado.itens.find((i) => i.id === "roteador");
    expect(roteador?.estado).toBe("posso_completar");
    expect(roteador?.ferramenta).toBe("propor_roteador");
  });
});

describe("calcularAuditoria — contagem de pendências", () => {
  it("conta tudo que não é preenchido nem nao_se_aplica", () => {
    const resultado = calcularAuditoria(t, leituraVazia);
    // 8 verificações totais, 1 nao_se_aplica (horario_atendimento), 7 pendências.
    expect(resultado.pendencias).toBe(7);
  });

  it("não conta nao_se_aplica nem preenchido", () => {
    const leitura = {
      ...leituraVazia,
      provedoresIA: [{ id: "c1", provider: "anthropic", label: "Chave", validated_at: "2026-10-01T00:00:00Z", is_active: true }],
    };
    const resultado = calcularAuditoria(t, leitura);
    // credencial_ia preenchido; horario_atendimento nao_se_aplica; as outras 6 são pendências.
    expect(resultado.pendencias).toBe(6);
  });
});
