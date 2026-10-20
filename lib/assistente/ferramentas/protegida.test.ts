/**
 * O invólucro `protegida`: o `execute` de toda ferramenta nunca lança, e a
 * mensagem do erro nunca chega ao modelo.
 */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { logger } from "@/lib/logger";

import { protegida } from "./protegida";

const esquema = z.strictObject({ n: z.number() });

describe("protegida", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("entrada que não cabe no esquema devolve parametro_invalido e NÃO chama o corpo", async () => {
    const corpo = vi.fn(async (entrada: { n: number }) => ({ ok: true as const, dobro: entrada.n * 2 }));
    const execute = protegida("teste", esquema, corpo);

    expect(await execute({ n: "três" })).toEqual({ ok: false, motivo: "parametro_invalido" });
    expect(await execute({ n: 3, extra: true })).toEqual({ ok: false, motivo: "parametro_invalido" });
    expect(await execute(null)).toEqual({ ok: false, motivo: "parametro_invalido" });
    expect(corpo).toHaveBeenCalledTimes(0);
  });

  it("entrada válida chega ao corpo já validada e o resultado volta como está", async () => {
    const execute = protegida("teste", esquema, async (entrada) => ({ ok: true as const, dobro: entrada.n * 2 }));

    expect(await execute({ n: 21 })).toEqual({ ok: true, dobro: 42 });
  });

  it("exceção no corpo vira indisponivel, sem a mensagem do erro, e fica registrada no log", async () => {
    const aviso = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const execute = protegida("teste", esquema, async () => {
      throw new Error("SEGREDO-DO-ERRO");
    });

    const saida = await execute({ n: 1 });

    expect(saida).toEqual({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(saida)).not.toContain("SEGREDO-DO-ERRO");
    expect(aviso).toHaveBeenCalledWith("assistente.ferramentas.falhou", {
      ferramenta: "teste",
      detalhe: "SEGREDO-DO-ERRO",
    });
  });
});
