/**
 * O invólucro de toda ferramenta do assistente: o `execute` NUNCA lança.
 *
 * Entrada que não cabe no esquema (o SDK valida antes, mas quem chama o
 * `execute` direto não passa por ele) vira `parametro_invalido`; qualquer
 * exceção do corpo vira `indisponivel` — o erro é registrado no log, e a
 * mensagem dele NUNCA sobe ao modelo (pode trazer texto do banco).
 */
import type { z } from "zod";

import { logger } from "@/lib/logger";

import type { FalhaDeFerramenta } from "./tipos";

export function protegida<E extends z.ZodType, S>(
  ferramenta: string,
  esquema: E,
  corpo: (entrada: z.infer<E>) => Promise<S>,
): (bruto: unknown) => Promise<S | FalhaDeFerramenta> {
  return async (bruto: unknown) => {
    try {
      const validacao = esquema.safeParse(bruto);
      if (!validacao.success) return { ok: false, motivo: "parametro_invalido" } as const;
      return await corpo(validacao.data);
    } catch (erro) {
      logger.warn("assistente.ferramentas.falhou", {
        ferramenta,
        detalhe: erro instanceof Error ? erro.message : String(erro),
      });
      return { ok: false, motivo: "indisponivel" } as const;
    }
  };
}
