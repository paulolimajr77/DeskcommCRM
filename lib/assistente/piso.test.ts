/**
 * O piso do assistente: a resposta fixa (sem modelo) que a rota devolve quando
 * a IA não pode responder. As três saídas — resumo, trecho de guia e a frase
 * honesta de "ainda não consegui" — saem de um pool dublê que responde por
 * FORMA de consulta e registra cada statement, para provar também que toda
 * leitura carrega o `organization_id` recebido.
 */
import { describe, expect, it, vi } from "vitest";

import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { traduzir } from "@/lib/i18n/dicionario";

import { ehResumo, respostaDoPiso } from "./piso";

const ORG = "11111111-2222-4333-8444-555555555555";

interface SkillDoBanco {
  id: string;
  organization_id: string | null;
  name: string;
  description: string;
  body: string;
  matcher: { any_keywords: string[] };
  manifest: unknown[];
}

function skill(name: string, keywords: string[], body = "corpo curto"): SkillDoBanco {
  return {
    id: `id-${name}`,
    organization_id: null,
    name,
    description: `descrição de ${name}`,
    body,
    matcher: { any_keywords: keywords },
    manifest: [],
  };
}

/** Pool dublê: contagens por tabela, skills por lista, e o registro de tudo que foi perguntado. */
function poolFalso(
  opcoes: {
    skills?: SkillDoBanco[];
    contagens?: { conversas: string; leads: string; funis: string } | null;
  } = {},
) {
  const chamadas: Array<{ sql: string; params: unknown[] }> = [];
  const contagens = opcoes.contagens === undefined ? { conversas: "7", leads: "3", funis: "2" } : opcoes.contagens;
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    chamadas.push({ sql, params });
    if (/from skill_pointers/.test(sql)) return { rows: opcoes.skills ?? [] };
    if (contagens === null) return { rows: [] };
    if (/from public\.conversations/.test(sql)) return { rows: [{ n: contagens.conversas }] };
    if (/from public\.crm_leads/.test(sql)) return { rows: [{ n: contagens.leads }] };
    if (/from public\.crm_pipelines/.test(sql)) return { rows: [{ n: contagens.funis }] };
    return { rows: [] };
  });
  return { pool: { query } as unknown as Queryable, chamadas };
}

const emPortugues = (texto: string) => traduzir(texto, "pt-BR");
const emEspanhol = (texto: string) => traduzir(texto, "es");

describe("respostaDoPiso — resumo da operação", () => {
  it("devolve as três contagens na frase exata, em português", async () => {
    const { pool } = poolFalso();
    const resposta = await respostaDoPiso(pool, { orgId: ORG, pergunta: "resumo da operação", t: emPortugues });
    expect(resposta).toBe("Resumo da operação: 7 conversas em atendimento, 3 negócios abertos em 2 funis.");
  });

  it("devolve a mesma frase em espanhol quando a pessoa usa espanhol", async () => {
    const { pool } = poolFalso();
    const resposta = await respostaDoPiso(pool, { orgId: ORG, pergunta: "resumo da operação", t: emEspanhol });
    expect(resposta).toBe("Resumen de la operación: 7 conversaciones en atención, 3 negocios abiertos en 2 embudos.");
  });

  it("as três contagens carregam o organization_id recebido como único parâmetro", async () => {
    const { pool, chamadas } = poolFalso();
    await respostaDoPiso(pool, { orgId: ORG, pergunta: "quantas conversas abertas?", t: emPortugues });
    expect(chamadas).toHaveLength(3);
    expect(chamadas.map((c) => c.params)).toEqual([[ORG], [ORG], [ORG]]);
    for (const c of chamadas) expect(c.sql).toContain("organization_id = $1");
  });

  it("tabela sem linha vira zero, nunca vazio nem undefined na frase", async () => {
    const { pool } = poolFalso({ contagens: null });
    const resposta = await respostaDoPiso(pool, { orgId: ORG, pergunta: "resumo", t: emPortugues });
    expect(resposta).toBe("Resumo da operação: 0 conversas em atendimento, 0 negócios abertos em 0 funis.");
  });
});

describe("respostaDoPiso — trecho de guia", () => {
  it("devolve a descrição e os primeiros 1200 caracteres do corpo da skill que casou", async () => {
    const corpo = "a".repeat(1200) + "b".repeat(300);
    const { pool } = poolFalso({ skills: [skill("assistente-metricas", ["funil"], corpo)] });
    const resposta = await respostaDoPiso(pool, { orgId: ORG, pergunta: "como ler o funil?", t: emPortugues });
    expect(resposta).toBe(`descrição de assistente-metricas\n\n${"a".repeat(1200)}`);
    expect(resposta).not.toContain("b");
  });

  it("não consulta as contagens da operação quando a pergunta é de guia", async () => {
    const { pool, chamadas } = poolFalso({ skills: [skill("assistente-metricas", ["funil"])] });
    await respostaDoPiso(pool, { orgId: ORG, pergunta: "como ler o funil?", t: emPortugues });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.sql).toContain("from skill_pointers");
    expect(chamadas[0]?.params).toEqual([ORG]);
  });

  it("skill que não começa com assistente- nunca sai, mesmo casando a palavra", async () => {
    const { pool } = poolFalso({ skills: [skill("agente-de-vendas", ["funil"], "segredo do agente")] });
    const resposta = await respostaDoPiso(pool, { orgId: ORG, pergunta: "como ler o funil?", t: emPortugues });
    expect(resposta).not.toContain("segredo do agente");
    expect(resposta).toBe("Ainda não consegui responder isso. Posso mostrar um resumo da operação ou trechos dos guias.");
  });
});

describe("respostaDoPiso — ainda não consegui", () => {
  it("sem skill que case, devolve a frase honesta exata, sem prometer data nem fase", async () => {
    const { pool } = poolFalso();
    const resposta = await respostaDoPiso(pool, { orgId: ORG, pergunta: "qual o sentido da vida?", t: emPortugues });
    expect(resposta).toBe("Ainda não consegui responder isso. Posso mostrar um resumo da operação ou trechos dos guias.");
    expect(resposta).not.toContain("F2");
  });

  it("a frase honesta sai em espanhol", async () => {
    const { pool } = poolFalso();
    const resposta = await respostaDoPiso(pool, { orgId: ORG, pergunta: "qual o sentido da vida?", t: emEspanhol });
    expect(resposta).toBe("Todavía no pude responder eso. Puedo mostrar un resumen de la operación o fragmentos de las guías.");
  });
});

describe("ehResumo", () => {
  it("reconhece 'resumo' e 'quantos leads', com ou sem acento e maiúscula", () => {
    expect(ehResumo("Resumo da operação")).toBe(true);
    expect(ehResumo("QUANTAS conversas abertas?")).toBe(true);
    expect(ehResumo("quantos leads temos")).toBe(true);
  });

  it("não confunde pergunta de guia nem frase solta com resumo", () => {
    expect(ehResumo("como ler o funil?")).toBe(false);
    expect(ehResumo("quanto custa?")).toBe(false);
  });
});
