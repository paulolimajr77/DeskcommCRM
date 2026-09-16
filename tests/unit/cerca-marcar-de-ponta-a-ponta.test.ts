import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { McpContext } from "@/lib/mcp/types";
import type { ResultadoDaConsulta } from "@/lib/agenda/consulta";

/**
 * CERCA B — do pedido do cliente ao compromisso marcado.
 *
 * ═══ O defeito, medido em produção (2026-09-16) ═════════════════════════════
 *
 * O cliente escreveu "sim pode agendar uma call". O agente chamou
 * `crm_find_free_slots` **NOVE vezes**, recebeu lista vazia nas nove, **nunca**
 * chamou `crm_book_appointment`, e mudou de assunto. No audit, `success: true`
 * nas nove — não havia erro para ninguém investigar.
 *
 * Causa: nas nove chamadas ele mandou `dia` E `dias_a_frente` juntos. A primeira
 * linha do handler recusa essa combinação e devolve
 * `{horarios: [], motivo: "periodo_ambiguo", mensagem}`. Mas:
 *
 * - o schema **permite** os dois (ambos `.optional()`, sem `.refine()`);
 * - nenhum `.describe()` diz que são excludentes;
 * - a descrição da ferramenta manda, textualmente, ler `publicou_horarios` diante
 *   de lista vazia — e **o retorno de recusa não contém esse campo**;
 * - `horarios: []` é o primeiro campo, e lido como "esse dia não tem" produz
 *   exatamente a caminhada de nove dias observada.
 *
 * ═══ 3 dos 5 casos falham hoje (1, 3 e 4). ═══════════════════════════════════
 *
 * A prosa já tinha sido tentada e não bastou: a skill de plataforma `agendamento`
 * foi ativada no MESMO job e manda ler o motivo. Duas fontes independentes, nove
 * mensagens de erro, nove repetições da chamada inválida.
 */

vi.mock("@/lib/agenda/consulta", async (original) => {
  const real = await original<typeof import("@/lib/agenda/consulta")>();
  return {
    ...real,
    horariosLivresDaOrg: vi.fn(),
  };
});

const { horariosLivresDaOrg } = await import("@/lib/agenda/consulta");
const { crmFindFreeSlots } = await import("@/lib/mcp/tools/agendamento");

const ctx: McpContext = {
  organizationId: "org-1",
  role: "agent",
  actor: { type: "ai_agent", id: "ag-1", role: "ai_operator" },
  apiTokenId: "tok-1",
  requestId: "req-1",
  supabase: {} as unknown as SupabaseClient,
};

function respondeCom(r: ResultadoDaConsulta) {
  vi.mocked(horariosLivresDaOrg).mockResolvedValue(r);
}

const SUCESSO: ResultadoDaConsulta = {
  ok: true,
  slots: [
    { inicio: new Date("2026-09-01T14:00:00Z"), fim: new Date("2026-09-01T14:30:00Z") },
  ],
  fusoDaRegra: "America/Sao_Paulo",
  publicouHorarios: true,
  fusoSuposto: false,
  fontesDefasadas: [],
  agendaExternaNuncaLida: false,
  googleCoberturaParcial: false,
};

function descricaoDoCampo(campo: unknown): string {
  if (campo && typeof campo === "object" && "description" in campo) {
    const d = (campo as { description?: unknown }).description;
    return typeof d === "string" ? d : "";
  }
  return "";
}

describe("cerca marcar de ponta a ponta", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dia + dias_a_frente juntos são rejeitados PELO SCHEMA, antes de rodar", () => {
    // O modelo não corrige por prosa: ele não lê a descrição como roteiro de
    // exclusão. Se o Zod aceitar, o handler devolve recusa sólida, mas o modelo
    // já queimou uma chamada e decide andar para o próximo dia — a caminhada de
    // nove dias medida em produção.
    const parsed = z.object(crmFindFreeSlots.inputSchema as never).safeParse({
      event_type_slug: "consulta",
      dia: "2026-09-13",
      dias_a_frente: 7,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const caminhos = parsed.error.issues
        .map((issue) => issue.path.join("."));
      expect(caminhos.join(",")).toMatch(/dia/);
      expect(caminhos.join(",")).toMatch(/dias_a_frente/);
    }
  });

  it("com só UM dos dois, o schema aceita", () => {
    // Controle do par: se o schema recusasse qualquer `dia` ou qualquer
    // `dias_a_frente`, a exclusão seria barata demais e a ferramenta morreria.
    const soDia = z.object(crmFindFreeSlots.inputSchema as never).safeParse({
      event_type_slug: "consulta",
      dia: "2026-09-13",
    });
    expect(soDia.success).toBe(true);

    const soDias = z.object(crmFindFreeSlots.inputSchema as never).safeParse({
      event_type_slug: "consulta",
      dias_a_frente: 7,
    });
    expect(soDias.success).toBe(true);
  });

  it("os describe declaram a exclusão", () => {
    // O Zod rejeita antes do handler, mas a mensagem de erro do Zod é técnica.
    // O modelo lê o `.describe()` — se ele não disser que os campos são
    // excludentes, o modelo pode deduzir que a combinação é válida e mandar
    // ambos de novo no dia seguinte.
    const descDia = descricaoDoCampo(crmFindFreeSlots.inputSchema.dia);
    const descDias = descricaoDoCampo(crmFindFreeSlots.inputSchema.dias_a_frente);

    expect(descDia).toMatch(/não use junto|nunca use junto|um OU o outro/i);
    expect(descDias).toMatch(/não use junto|nunca use junto|um OU o outro/i);
  });

  it("TODA lista vazia carrega publicou_horarios — inclusive a de recusa", async () => {
    // A descrição da ferramenta manda ler `publicou_horarios` diante de lista
    // vazia. Quando o pedido é malformado, o retorno atual não tem o campo —
    // então a instrução escrita não tem onde se agarrar e o modelo inventa a
    // interpretação ("esse dia não tem").
    const r = (await crmFindFreeSlots.handler(
      { event_type_slug: "consulta", dia: "2026-09-13", dias_a_frente: 7 },
      ctx,
    )) as Record<string, unknown>;

    expect(r).toHaveProperty("publicou_horarios");
  });

  it("CONTROLE — a régua: lista vazia é sempre distinguível", async () => {
    // Três motivos diferentes de lista vazia não podem chegar ao modelo com a
    // mesma cara. O que os distingue precisa ser CAMPO (`motivo`,
    // `publicou_horarios`, `total_de_horarios`), nunca a prosa da `mensagem`.
    const malformado = (await crmFindFreeSlots.handler(
      { event_type_slug: "consulta", dia: "2026-09-13", dias_a_frente: 7 },
      ctx,
    )) as Record<string, unknown>;

    respondeCom({
      ...SUCESSO,
      slots: [],
      publicouHorarios: false,
    });
    const atendenteNaoPublicou = (await crmFindFreeSlots.handler(
      { event_type_slug: "consulta" },
      ctx,
    )) as Record<string, unknown>;

    respondeCom({
      ...SUCESSO,
      slots: [],
      publicouHorarios: true,
    });
    const agendaSemVaga = (await crmFindFreeSlots.handler(
      { event_type_slug: "consulta" },
      ctx,
    )) as Record<string, unknown>;

    // A assinatura é feita só de campos — se `mensagem` mudar de redação
    // amanhã, a régua segue medindo o que importa.
    const assinatura = (r: Record<string, unknown>) =>
      JSON.stringify({
        motivo: r.motivo ?? null,
        publicou_horarios: r.publicou_horarios ?? null,
        total_de_horarios: r.total_de_horarios ?? null,
      });

    expect(
      new Set([
        assinatura(malformado),
        assinatura(atendenteNaoPublicou),
        assinatura(agendaSemVaga),
      ]).size,
    ).toBe(3);
  });
});
