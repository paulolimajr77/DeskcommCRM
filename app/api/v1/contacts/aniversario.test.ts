/**
 * GET /api/v1/contatos - filtro `aniversario` por período (hoje / semana / mês),
 * calculado no fuso da organização.
 *
 * O handler chama `supabase.from("organizations").select("timezone")` para
 * descobrir o fuso da org, depois `.in("birthday_md", valores)` na lista de
 * contatos. Este teste controla a data do sistema e o fuso da org para provar
 * cada período, incluindo a semana que atravessa o ano.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listContactsHandler } from "./_handler";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const TZ_SAO_PAULO = "America/Sao_Paulo";

interface ContatoMock {
  id: string;
  birthday_md: number | null;
  nome: string;
}

function contato(c: ContatoMock) {
  return {
    id: c.id,
    organization_id: ORG_ID,
    name: c.nome,
    display_name: c.nome,
    birthday_md: c.birthday_md,
    kind: "person",
    is_merged_into: null,
    is_personal: false,
  } as Record<string, unknown>;
}

/**
 * Mock do supabase-client. Grava a cadeia de chamadas e devolve dados
 * pré-configurados. `from("organizations")` devolve timezone da org;
 * `from("contacts")` devolve a lista de contatos passada no construtor.
 */
function supabaseMock(
  timezone: string,
  contatos: ContatoMock[],
) {
  let chamadoOrganizations = false;
  let filtroBirthdayMd: number[] | null = null;

  const contatosFiltrados = contatos.map((c) => contato(c));

  const queryBuilder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(function (this: Record<string, unknown>, coluna: string, valor: unknown) {
      if (coluna === "birthday_md") filtroBirthdayMd = Array.isArray(valor) ? (valor as number[]) : [valor as number];
      return this;
    }),
    in: vi.fn().mockImplementation(function (this: Record<string, unknown>, coluna: string, valores: unknown[]) {
      if (coluna === "birthday_md") filtroBirthdayMd = valores as number[];
      return this;
    }),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: chamadoOrganizations ? undefined : { timezone },
      error: null,
    }),
    then: vi.fn().mockImplementation((resolve) => resolve({ data: [], error: null })),
  };

  const from = vi.fn().mockImplementation((tabela: string) => {
    if (tabela === "organizations") {
      chamadoOrganizations = true;
      return queryBuilder;
    }
    if (tabela === "contacts") {
      chamadoOrganizations = false;
      return {
        ...queryBuilder,
        then: vi.fn().mockImplementation((resolve) => {
          let resultado = contatosFiltrados as unknown as ContatoMock[];
          const fbmd = filtroBirthdayMd ?? [];
          if (fbmd.length > 0) {
            resultado = resultado.filter((c) =>
              c.birthday_md !== null && fbmd.includes(c.birthday_md),
            );
          }
          resolve({ data: resultado, error: null });
        }),
      };
    }
    return queryBuilder;
  });

  const supabase = { from };
  return { supabase, contatosFiltrados };
}

const ctx = {
  organization_id: ORG_ID,
  actor: { type: "user", id: USER_ID },
  requestId: "req-teste",
  idioma: "pt-BR" as const,
} as Record<string, unknown>;

describe("listContactsHandler - filtro aniversario", () => {
  beforeEach(() => {
    // vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aniversario=hoje: só contatos cujo birthday_md é hoje, no fuso da org", async () => {
    // 14/09/2026 (segunda) em São Paulo → birthday_md = 914.
    vi.setSystemTime(new Date("2026-09-14T10:00:00Z").getTime());

    const { supabase } = supabaseMock(TZ_SAO_PAULO, [
      { id: "c1", birthday_md: 914, nome: "Aniversaria hoje" },
      { id: "c2", birthday_md: 915, nome: "Não hoje" },
      { id: "c3", birthday_md: null, nome: "Sem data" },
    ]);

    const resultado = await listContactsHandler(supabase as unknown as SupabaseClient, ctx as unknown as HandlerCtx, { aniversario: "hoje" }, undefined);

    const ids = (resultado.contacts as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toEqual(["c1"]);
  });

  it("aniversario=semana: inclui aniversário nos dois lados da travessia de ano", async () => {
    // 29/12/2026 (terça-feira) em São Paulo.
    // Semana: segunda 28/12 a domingo 03/01.
    // 02/01 (birthday_md = 102) deve aparecer; 06/01 (106) não.
    vi.setSystemTime(new Date("2026-12-29T10:00:00Z").getTime());

    const { supabase } = supabaseMock(TZ_SAO_PAULO, [
      { id: "c1", birthday_md: 1228, nome: "28/12" },
      { id: "c2", birthday_md: 102, nome: "02/01 (dentro da semana)" },
      { id: "c3", birthday_md: 106, nome: "06/01 (fora da semana)" },
    ]);

    const resultado = await listContactsHandler(supabase as unknown as SupabaseClient, ctx as unknown as HandlerCtx, { aniversario: "semana" }, undefined);

    const ids = (resultado.contacts as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain("c1");
    expect(ids).toContain("c2");
    expect(ids).not.toContain("c3");
  });

  it("aniversario=semana: não depende do fuso da máquina (23h30 domingo 03/01 SP = 04/01 em UTC)", async () => {
    // 23h30 de domingo 03/01/2027 em America/Sao_Paulo (UTC-3, sem horário de verão)
    // = 02h30 de segunda 04/01/2027 em UTC. O fuso da máquina é irrelevante:
    // a semana é 28/12 a 03/01 no calendário da org.
    vi.setSystemTime(new Date("2027-01-04T02:30:00Z").getTime());

    const { supabase } = supabaseMock(TZ_SAO_PAULO, [
      { id: "c1", birthday_md: 1228, nome: "28/12 (dentro)" },
      { id: "c2", birthday_md: 103, nome: "03/01 (dentro, hoje)" },
      { id: "c3", birthday_md: 104, nome: "04/01 (fora da semana)" },
    ]);

    const resultado = await listContactsHandler(supabase as unknown as SupabaseClient, ctx as unknown as HandlerCtx, { aniversario: "semana" }, undefined);

    const ids = (resultado.contacts as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain("c1");
    expect(ids).toContain("c2");
    expect(ids).not.toContain("c3");
  });

  it("aniversario=mes: só contatos do mês atual", async () => {
    // 15/03/2026 em São Paulo → mês 3, dias 1..31.
    vi.setSystemTime(new Date("2026-03-15T10:00:00Z").getTime());

    const { supabase } = supabaseMock(TZ_SAO_PAULO, [
      { id: "c1", birthday_md: 315, nome: "15/03 (dentro)" },
      { id: "c2", birthday_md: 415, nome: "15/04 (fora)" },
    ]);

    const resultado = await listContactsHandler(supabase as unknown as SupabaseClient, ctx as unknown as HandlerCtx, { aniversario: "mes" }, undefined);

    const ids = (resultado.contacts as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toEqual(["c1"]);
  });

  it("sem aniversario: não filtra por birthday_md", async () => {
    vi.setSystemTime(new Date("2026-09-14T10:00:00Z").getTime());

    const { supabase } = supabaseMock(TZ_SAO_PAULO, [
      { id: "c1", birthday_md: 914, nome: "Faz aniversário hoje" },
      { id: "c2", birthday_md: 101, nome: "01/01" },
    ]);

    const resultado = await listContactsHandler(supabase as unknown as SupabaseClient, ctx as unknown as HandlerCtx, {}, undefined);

    const ids = (resultado.contacts as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toEqual(["c1", "c2"]);
  });

  it("usa o fuso da organização vindo do banco", async () => {
    vi.setSystemTime(new Date("2026-12-29T10:00:00Z").getTime());

    // Fuso America/Manaus: 29/12 lá também (mesmo dia, -1h de SP, mas ainda 29/12).
    const { supabase } = supabaseMock("America/Manaus", [
      { id: "c1", birthday_md: 1229, nome: "29/12" },
    ]);

    await listContactsHandler(supabase as unknown as SupabaseClient, ctx as unknown as HandlerCtx, { aniversario: "semana" }, undefined);

    // Verifica que a query de organizations pediu o timezone.
    expect(supabase.from).toHaveBeenCalledWith("organizations");
  });

  it("sem timezone na org, cai no padrão", async () => {
    vi.setSystemTime(new Date("2026-09-14T10:00:00Z").getTime());

    const { supabase } = supabaseMock("", [
      { id: "c1", birthday_md: 914, nome: "14/09" },
    ]);

    const resultado = await listContactsHandler(supabase as unknown as SupabaseClient, ctx as unknown as HandlerCtx, { aniversario: "hoje" }, undefined);

    expect((resultado.contacts as Array<{ id: string }>).map((c) => c.id)).toEqual(["c1"]);
  });
});
