import { describe, expect, it, vi } from "vitest";

import { alocarNumero } from "./numeracao";

function mundo(opts: { numero?: number; rpcError?: { message: string } | null; updateError?: { code?: string; message: string } | null }) {
  const rpc = vi.fn(async () =>
    opts.rpcError ? { data: null, error: opts.rpcError } : { data: opts.numero ?? 7, error: null },
  );
  const single = vi.fn(async () =>
    opts.updateError
      ? { data: null, error: opts.updateError }
      : { data: { id: "prop-1", numero: opts.numero ?? 7, ano: new Date().getFullYear() }, error: null },
  );
  const admin = {
    rpc,
    from: () => ({
      update: () => ({ eq: () => ({ eq: () => ({ is: () => ({ select: () => ({ single }) }) }) }) }),
    }),
  };
  return { admin: admin as unknown as Parameters<typeof alocarNumero>[0], rpc, single };
}

describe("alocarNumero", () => {
  it("chama o contador UMA vez e devolve numero/ano", async () => {
    const { admin, rpc } = mundo({ numero: 7 });
    const r = await alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" });
    expect(r.numero).toBe(7);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("erro do contador (rpc) propaga sem retry", async () => {
    const { admin, rpc } = mundo({ rpcError: { message: "contador indisponível" } });
    await expect(alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" })).rejects.toEqual({
      message: "contador indisponível",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("erro do UPDATE (mesmo 23505) propaga sem retry — o contador não permite mais colisão de numero", async () => {
    const { admin, rpc } = mundo({ updateError: { code: "23505", message: "boom" } });
    await expect(alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" })).rejects.toEqual({
      code: "23505",
      message: "boom",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
