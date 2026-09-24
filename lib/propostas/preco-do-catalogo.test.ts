// lib/propostas/preco-do-catalogo.test.ts
import { describe, expect, it, vi } from "vitest";
import { buscarPrecoDoCatalogo } from "./preco-do-catalogo";

function montarSupabase(resultado: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(function (this: typeof chain) { return this; }),
    eq: vi.fn(function (this: typeof chain) { return this; }),
    maybeSingle: vi.fn(async () => resultado),
  };
  return { from: vi.fn(() => chain), chain } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("buscarPrecoDoCatalogo", () => {
  it("produto ativo da própria organização: devolve o preço", async () => {
    const db = montarSupabase({ data: { preco_cents: 5000 }, error: null });
    const r = await buscarPrecoDoCatalogo(db, "org-1", "prod-1");
    expect(r).toEqual({ preco_cents: 5000 });
  });

  it("produto de OUTRA organização, apagado, ou inativo: devolve null (filtro é o próprio SELECT)", async () => {
    const db = montarSupabase({ data: null, error: null });
    const r = await buscarPrecoDoCatalogo(db, "org-1", "prod-de-outra-org");
    expect(r).toBeNull();
  });
});
