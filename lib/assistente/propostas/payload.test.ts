/**
 * O conteúdo de uma proposta (T19): o subconjunto CURADO de cada rota-alvo, em
 * Zod estrito. O que este arquivo prova, e o que cada teste perde se a linha
 * indicada for sabotada, está no comentário "Sabotagem" de cada caso.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  esquemaDoCorpoDaProposta,
  ESQUEMA_DO_PAYLOAD_POR_TIPO,
  LIMITE_DE_ITENS_DE_FAQ,
  LIMITE_DO_PAYLOAD_EM_BYTES,
  LIMITE_DO_TEXTO_DE_CONHECIMENTO,
  OPERACOES_ACEITAS,
  temChaveDeDestino,
} from "./payload";
import { TIPOS_DE_PROPOSTA } from "./tipos";

const ID = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";

const BASE = { resumo: "Criar o roteador", motivo: "A pessoa pediu para separar vendas de suporte." };

/** Um exemplo mínimo válido por (tipo, operação) — o mapa inteiro das 11 operações. */
const EXEMPLOS = {
  roteador: {
    criar: { operacao: "criar", corpo: { name: "Roteador principal", channel_session_id: ID } },
    alterar: { operacao: "alterar", router_id: ID, corpo: { name: "Novo nome" } },
    membros: {
      operacao: "membros",
      router_id: ID,
      corpo: { members: [{ agent_id: ID, intent_name: "Vendas", intent_description: "Quer comprar" }] },
    },
  },
  conhecimento: {
    criar: {
      operacao: "criar",
      corpo: { source_type: "faq", name: "Perguntas comuns", items: [{ question: "Qual o horário?", answer: "Das 8h às 18h." }] },
    },
  },
  memoria: {
    criar: { operacao: "criar", corpo: { title: "Horário", body: "Atendemos de segunda a sexta." } },
    arquivar: { operacao: "arquivar", entry_id: ID, corpo: { status: "archived" } },
  },
  modelo_auxiliares: {
    definir_ponto: {
      operacao: "definir_ponto",
      corpo: { purpose: "followup_classify", provider: "anthropic", model_id: "claude-haiku-4-5" },
    },
    definir_padrao: {
      operacao: "definir_padrao",
      corpo: { provider: "anthropic", default_model: "claude-sonnet-4-6" },
    },
  },
  funil: {
    criar_funil: { operacao: "criar_funil", corpo: { name: "Pós-venda" } },
    criar_etapa: { operacao: "criar_etapa", pipeline_id: ID, corpo: { name: "Aguardando retorno" } },
    alterar_etapa: { operacao: "alterar_etapa", pipeline_id: ID, stage_id: ID_2, corpo: { name: "Em negociação" } },
  },
  acao: {
    // Exceção consciente: `metodo` no payload é permitido porque `porta`+`metodo`
    // são validados pela lista branca `escritaPermitida`, não são caminho livre.
    alterar_contato: { porta: "contacts/:id", metodo: "PATCH", valores: { id: ID }, corpo: { name: "Novo" } },
  },
} as const;

function proposta(kind: string, payload: unknown, extra: Record<string, unknown> = {}) {
  return { ...BASE, kind, payload, ...extra };
}

describe("esquemaDoCorpoDaProposta — o que entra", () => {
  const todas = Object.entries(EXEMPLOS).flatMap(([kind, ops]) =>
    Object.entries(ops).map(([operacao, payload]) => [kind, operacao, payload] as const),
  );

  it("cobre as 12 operações curadas (incluindo ação)", () => {
    expect(todas).toHaveLength(12);
  });

  it.each(todas)("aceita %s/%s com um exemplo mínimo", (kind, _operacao, payload) => {
    // Sabotagem: tornar obrigatório um campo que o exemplo não traz (ex.: tirar
    // `.optional()` de `fallback_agent_id`) → o exemplo da operação fica vermelho.
    const r = esquemaDoCorpoDaProposta.safeParse(proposta(kind, payload));
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it("aceita antes (objeto ou null), thread_id e turn_id", () => {
    const r = esquemaDoCorpoDaProposta.safeParse(
      proposta("memoria", EXEMPLOS.memoria.criar, { antes: null, thread_id: ID, turn_id: ID_2 }),
    );
    expect(r.success).toBe(true);
    const r2 = esquemaDoCorpoDaProposta.safeParse(proposta("memoria", EXEMPLOS.memoria.criar, { antes: { x: 1 } }));
    expect(r2.success).toBe(true);
  });
});

describe("esquemaDoCorpoDaProposta — o que NÃO entra", () => {
  it("campo extra no corpo de qualquer operação é recusado (.strict)", () => {
    // Sabotagem: trocar `z.strictObject` por `z.object` em UMA operação (ex.:
    // `corpo` de `criar` do roteador) → o caso dessa operação fica vermelho.
    const comExtra = (payload: Record<string, unknown>) => ({
      ...payload,
      corpo: { ...(payload.corpo as object), campo_inventado: "x" },
    });
    for (const [kind, ops] of Object.entries(EXEMPLOS)) {
      // `acao` tem `corpo: z.unknown()` — corpo livre da chamada interna, sem `.strict()`.
      if (kind === "acao") continue;
      for (const [operacao, payload] of Object.entries(ops)) {
        const r = esquemaDoCorpoDaProposta.safeParse(proposta(kind, comExtra(payload as Record<string, unknown>)));
        expect(r.success, `${kind}/${operacao} aceitou campo inventado no corpo`).toBe(false);
      }
    }
  });

  it("campo extra na RAIZ do payload e na raiz da proposta também é recusado", () => {
    for (const [kind, ops] of Object.entries(EXEMPLOS)) {
      for (const [operacao, payload] of Object.entries(ops)) {
        const raiz = esquemaDoCorpoDaProposta.safeParse(proposta(kind, { ...payload, extra: 1 }));
        expect(raiz.success, `${kind}/${operacao} aceitou campo extra na raiz do payload`).toBe(false);
      }
    }
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("memoria", EXEMPLOS.memoria.criar, { extra: 1 })).success).toBe(false);
  });

  it("organization_id no corpo ou no payload é recusado — a organização é da sessão", () => {
    expect(
      esquemaDoCorpoDaProposta.safeParse(proposta("memoria", EXEMPLOS.memoria.criar, { organization_id: ID })).success,
    ).toBe(false);
    expect(
      esquemaDoCorpoDaProposta.safeParse(
        proposta("memoria", { ...EXEMPLOS.memoria.criar, organization_id: ID }),
      ).success,
    ).toBe(false);
  });

  it("credential_id em modelo_auxiliares é recusado nas duas operações — chave nunca é preenchida pela IA", () => {
    // Sabotagem: acrescentar `credential_id: uuid.optional()` em `corpo` de
    // `definir_ponto` (payload.ts) → o primeiro `expect` fica vermelho.
    const ponto = {
      operacao: "definir_ponto",
      corpo: { purpose: "followup_classify", provider: "anthropic", model_id: "m", credential_id: ID },
    };
    const padrao = {
      operacao: "definir_padrao",
      corpo: { provider: "anthropic", default_model: "m", credential_id: ID },
    };
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("modelo_auxiliares", ponto)).success).toBe(false);
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("modelo_auxiliares", padrao)).success).toBe(false);
    // base_url e is_enabled (também aceitos pelo PUT) ficam fora pelo mesmo motivo.
    const semCredencial = { purpose: "followup_classify", provider: "anthropic", model_id: "m" };
    expect(
      esquemaDoCorpoDaProposta.safeParse(proposta("modelo_auxiliares", { operacao: "definir_ponto", corpo: semCredencial })).success,
    ).toBe(true);
    for (const campo of [{ base_url: "https://x.example" }, { is_enabled: false }]) {
      const p = { operacao: "definir_ponto", corpo: { ...semCredencial, ...campo } };
      expect(esquemaDoCorpoDaProposta.safeParse(proposta("modelo_auxiliares", p)).success).toBe(false);
    }
  });

  it("provedor desconhecido é recusado", () => {
    const p = { operacao: "definir_padrao", corpo: { provider: "provedor-inventado", default_model: "m" } };
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("modelo_auxiliares", p)).success).toBe(false);
  });

  it("conhecimento: só faq e documento — upload, URL, conversas e catálogo são recusados", () => {
    // Sabotagem: trocar o `z.discriminatedUnion("source_type", …)` por `z.string()`
    // → todos os tipos abaixo passam a ser aceitos e o laço fica vermelho.
    for (const source_type of ["upload", "url", "site", "conversas", "catalogo", "policy", "conversations", "FAQ"]) {
      const p = { operacao: "criar", corpo: { source_type, name: "Material", markdown_blob: "texto" } };
      expect(
        esquemaDoCorpoDaProposta.safeParse(proposta("conhecimento", p)).success,
        `source_type ${source_type} foi aceito`,
      ).toBe(false);
    }
  });

  it("conhecimento: faq exige items e não aceita markdown_blob; documento o inverso", () => {
    const faqComTexto = { operacao: "criar", corpo: { source_type: "faq", name: "Material", markdown_blob: "x" } };
    const docComItens = {
      operacao: "criar",
      corpo: { source_type: "documento", name: "Material", items: [{ question: "a", answer: "b" }] },
    };
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("conhecimento", faqComTexto)).success).toBe(false);
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("conhecimento", docComItens)).success).toBe(false);
  });

  it("conhecimento: markdown_blob com mais de 20.000 caracteres é recusado, e 20.000 passa", () => {
    // Sabotagem: subir o `texto(1, LIMITE_DO_TEXTO_DE_CONHECIMENTO)` para 30_000 → o primeiro expect fica vermelho.
    const doc = (n: number) => ({
      operacao: "criar",
      corpo: { source_type: "documento", name: "Manual", markdown_blob: "a".repeat(n) },
    });
    expect(LIMITE_DO_TEXTO_DE_CONHECIMENTO).toBe(20_000);
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("conhecimento", doc(20_001))).success).toBe(false);
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("conhecimento", doc(20_000))).success).toBe(true);
  });

  it("conhecimento: mais de 50 perguntas é recusado, e 50 passa", () => {
    const faq = (n: number) => ({
      operacao: "criar",
      corpo: {
        source_type: "faq",
        name: "Perguntas",
        items: Array.from({ length: n }, (_, i) => ({ question: `P${i}`, answer: `R${i}` })),
      },
    });
    expect(LIMITE_DE_ITENS_DE_FAQ).toBe(50);
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("conhecimento", faq(51))).success).toBe(false);
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("conhecimento", faq(50))).success).toBe(true);
  });

  it("operação que não existe (apagar, excluir, arquivar_funil…) é recusada em todo tipo", () => {
    // Sabotagem: acrescentar um `z.strictObject({ operacao: z.literal("apagar"), … })`
    // a qualquer tipo → o laço correspondente fica vermelho.
    for (const kind of TIPOS_DE_PROPOSTA) {
      for (const operacao of ["apagar", "excluir", "delete", "remover", "arquivar_funil", "publicar"]) {
        const r = esquemaDoCorpoDaProposta.safeParse(proposta(kind, { operacao, corpo: {} }));
        expect(r.success, `${kind}/${operacao} foi aceito`).toBe(false);
      }
    }
  });

  it("operação de um tipo no kind de outro é recusada", () => {
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("roteador", EXEMPLOS.funil.criar_funil)).success).toBe(false);
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("memoria", EXEMPLOS.roteador.criar)).success).toBe(false);
  });

  it("kind `critico` ou inventado é recusado — crítico não tem proposta", () => {
    for (const kind of ["critico", "agente", "followup", "credencial", ""]) {
      expect(esquemaDoCorpoDaProposta.safeParse(proposta(kind, EXEMPLOS.memoria.criar)).success, kind).toBe(false);
    }
  });

  it("risk no corpo é recusado — o risco é do código", () => {
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("memoria", EXEMPLOS.memoria.criar, { risk: "seguro" })).success).toBe(false);
  });

  it("roteador/membros: lista vazia, intenção repetida e vínculo de funil/roteiro são recusados", () => {
    const membro = { agent_id: ID, intent_name: "Vendas", intent_description: "Quer comprar" };
    const m = (members: unknown[]) => proposta("roteador", { operacao: "membros", router_id: ID, corpo: { members } });
    expect(esquemaDoCorpoDaProposta.safeParse(m([])).success).toBe(false); // vazio = apagar tudo
    expect(esquemaDoCorpoDaProposta.safeParse(m([membro, { ...membro, intent_name: " vendas " }])).success).toBe(false);
    for (const extra of [{ flow_pointer_id: ID }, { pipeline_id: ID }, { stage_id: ID }]) {
      expect(esquemaDoCorpoDaProposta.safeParse(m([{ ...membro, ...extra }])).success).toBe(false);
    }
  });

  it("alterar roteador/etapa sem nenhum campo a mudar é recusado; roteador não aceita channel_session_id nem is_active", () => {
    expect(
      esquemaDoCorpoDaProposta.safeParse(proposta("roteador", { operacao: "alterar", router_id: ID, corpo: {} })).success,
    ).toBe(false);
    expect(
      esquemaDoCorpoDaProposta.safeParse(
        proposta("roteador", { operacao: "alterar", router_id: ID, corpo: { channel_session_id: ID } }),
      ).success,
    ).toBe(false);
    expect(
      esquemaDoCorpoDaProposta.safeParse(
        proposta("roteador", { operacao: "alterar", router_id: ID, corpo: { is_active: false } }),
      ).success,
    ).toBe(false);
    expect(
      esquemaDoCorpoDaProposta.safeParse(
        proposta("funil", { operacao: "alterar_etapa", pipeline_id: ID, stage_id: ID_2, corpo: {} }),
      ).success,
    ).toBe(false);
  });

  it("funil: etapa não aceita is_won, is_lost, win_probability nem janela de esfriamento", () => {
    for (const campo of [{ is_won: true }, { is_lost: true }, { win_probability: 50 }, { avisar_na_central: true }, { expected_duration_hours: 24 }]) {
      const p = { operacao: "alterar_etapa", pipeline_id: ID, stage_id: ID_2, corpo: { name: "X", ...campo } };
      expect(esquemaDoCorpoDaProposta.safeParse(proposta("funil", p)).success, JSON.stringify(campo)).toBe(false);
    }
  });

  it("memória: arquivar só aceita status `archived` (reativar não é proposta)", () => {
    const p = { operacao: "arquivar", entry_id: ID, corpo: { status: "active" } };
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("memoria", p)).success).toBe(false);
  });

  it("id que não é uuid é recusado", () => {
    const p = { operacao: "alterar", router_id: "não-é-uuid", corpo: { name: "X" } };
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("roteador", p)).success).toBe(false);
  });

  it("resumo e motivo curtos demais ou longos demais são recusados", () => {
    const base = { kind: "memoria", payload: EXEMPLOS.memoria.criar };
    expect(esquemaDoCorpoDaProposta.safeParse({ ...base, resumo: "ab", motivo: "porque sim" }).success).toBe(false);
    expect(esquemaDoCorpoDaProposta.safeParse({ ...base, resumo: "x".repeat(301), motivo: "porque sim" }).success).toBe(false);
    expect(esquemaDoCorpoDaProposta.safeParse({ ...base, resumo: "Título", motivo: "ab" }).success).toBe(false);
    expect(esquemaDoCorpoDaProposta.safeParse({ ...base, resumo: "Título", motivo: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("o destino não mora no dado", () => {
  it("temChaveDeDestino acha rota, url, path, method e metodo em qualquer profundidade, em qualquer caixa", () => {
    // Sabotagem: tirar "metodo" (ou qualquer chave) de CHAVES_DE_DESTINO → o laço correspondente fica vermelho.
    for (const chave of ["rota", "url", "path", "method", "metodo", "URL", "Metodo"]) {
      expect(temChaveDeDestino({ [chave]: "x" }), chave).not.toBeNull();
      expect(temChaveDeDestino({ corpo: { fundo: [{ [chave]: "x" }] } }), `${chave} aninhada`).not.toBeNull();
    }
    expect(temChaveDeDestino({ operacao: "criar", corpo: { name: "x", url_do_site: "y" } })).toBeNull();
    expect(temChaveDeDestino(null)).toBeNull();
    expect(temChaveDeDestino("texto com a palavra rota")).toBeNull();
  });

  it("nenhum payload aceito traz chave de destino — e o esquema recusa a que alguém acrescentar, em qualquer nível", () => {
    for (const [kind, ops] of Object.entries(EXEMPLOS)) {
      for (const [operacao, payload] of Object.entries(ops)) {
        expect(esquemaDoCorpoDaProposta.safeParse(proposta(kind, payload)).success).toBe(true);
        // `acao` é exceção consciente: `metodo` no payload é válido (lista branca valida).
        if (kind === "acao") continue;
        expect(temChaveDeDestino(payload), `${kind}/${operacao}`).toBeNull();
        for (const chave of ["rota", "url", "path", "method", "metodo"]) {
          const naRaiz = { ...payload, [chave]: "/api/v1/ai/routers" };
          const noCorpo = { ...payload, corpo: { ...(payload.corpo as object), [chave]: "/api/v1/ai/routers" } };
          expect(esquemaDoCorpoDaProposta.safeParse(proposta(kind, naRaiz)).success, `${kind}/${operacao} raiz ${chave}`).toBe(false);
          expect(esquemaDoCorpoDaProposta.safeParse(proposta(kind, noCorpo)).success, `${kind}/${operacao} corpo ${chave}`).toBe(false);
        }
      }
    }
  });

  it("a chave de destino é recusada mesmo quando o resto do esquema deixaria passar (camada própria)", () => {
    // Sabotagem: apagar o bloco `temChaveDeDestino(proposta.payload)` do superRefine →
    // este caso continua vermelho só se o esquema do tipo deixasse a chave passar; aqui ele
    // monta um payload em que a chave está dentro de um objeto que o esquema aceita (`antes`
    // não conta, `payload` sim), então prova a camada, não só o `.strict()`.
    const r = esquemaDoCorpoDaProposta.safeParse(
      proposta("memoria", { ...EXEMPLOS.memoria.criar, corpo: { ...EXEMPLOS.memoria.criar.corpo, path: "/x" } }),
    );
    expect(r.success).toBe(false);
  });
});

describe("tamanho", () => {
  it("payload serializado acima de 64 KB é recusado, e abaixo passa", () => {
    // Sabotagem: subir LIMITE_DO_PAYLOAD_EM_BYTES (ou apagar o `if` de bytes do superRefine)
    // → o primeiro expect fica vermelho.
    const faq = (n: number, tamanho: number) => ({
      operacao: "criar",
      corpo: {
        source_type: "faq",
        name: "Perguntas",
        items: Array.from({ length: n }, (_, i) => ({ question: `P${i}`, answer: "r".repeat(tamanho) })),
      },
    });
    expect(LIMITE_DO_PAYLOAD_EM_BYTES).toBe(65_536);
    // 50 × 2.000 ≈ 100 KB: cada campo respeita o próprio teto, a soma não.
    const grande = esquemaDoCorpoDaProposta.safeParse(proposta("conhecimento", faq(50, 2000)));
    expect(grande.success).toBe(false);
    expect(JSON.stringify(grande.error?.issues)).toContain("64 KB");
    expect(esquemaDoCorpoDaProposta.safeParse(proposta("conhecimento", faq(10, 2000))).success).toBe(true);
  });

  it("antes acima de 32 KB é recusado", () => {
    const antes = { texto: "a".repeat(33 * 1024) };
    const r = esquemaDoCorpoDaProposta.safeParse(proposta("memoria", EXEMPLOS.memoria.criar, { antes }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("32 KB");
  });
});

describe("OPERACOES_ACEITAS", () => {
  it("lista, por tipo, exatamente as operações dos esquemas", () => {
    expect(OPERACOES_ACEITAS).toEqual({
      roteador: ["criar", "alterar", "membros"],
      conhecimento: ["criar"],
      memoria: ["criar", "arquivar"],
      modelo_auxiliares: ["definir_ponto", "definir_padrao"],
      funil: ["criar_funil", "criar_etapa", "alterar_etapa"],
      acao: [],
    });
    expect(Object.keys(ESQUEMA_DO_PAYLOAD_POR_TIPO).sort()).toEqual([...TIPOS_DE_PROPOSTA].sort());
  });
});
