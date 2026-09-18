import { describe, expect, it, vi } from "vitest";
import { alocarNumero } from "./numeracao";

function admFalso(sequenciaDeErros: Array<{ code: string } | null>) {
  let chamada = 0;
  return {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              select: () => ({
                single: async () => {
                  const erro = sequenciaDeErros[chamada++] ?? null;
                  return erro ? { data: null, error: erro } : { data: { id: "prop-1", numero: 7, ano: 2026 }, error: null };
                },
              }),
            }),
          }),
        }),
      }),
      rpc: () => Promise.resolve({ data: 7, error: null }),
    }),
    rpc: () => Promise.resolve({ data: 7, error: null }),
  } as unknown as Parameters<typeof alocarNumero>[0];
}

describe("alocarNumero", () => {
  it("sucesso de primeira: devolve numero/ano", async () => {
    const admin = admFalso([null]);
    const r = await alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" });
    expect(r).toEqual({ numero: 7, ano: 2026 });
  });

  it("colisão (23505) tenta de novo até 5 vezes e então sucede", async () => {
    const admin = admFalso([{ code: "23505" }, { code: "23505" }, null]);
    const r = await alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" });
    expect(r).toEqual({ numero: 7, ano: 2026 });
  });

  it("5 colisões seguidas: desiste e lança erro reconhecível", async () => {
    const admin = admFalso(Array(5).fill({ code: "23505" }));
    await expect(alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" })).rejects.toThrow(
      /numero_indisponivel/,
    );
  });

  it("erro que NÃO é 23505 propaga sem retry", async () => {
    const admin = admFalso([{ code: "42P01" }]);
    await expect(alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" })).rejects.toBeTruthy();
  });
});
