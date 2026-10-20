/**
 * Ferramenta `listar_metricas` — o catálogo de métricas que existe, com o que
 * a pessoa da sessão pode usar (`disponivel_para_voce`) e o JSON Schema dos
 * parâmetros de cada uma. Sem o esquema o modelo não sabe os nomes nem o
 * formato do período (`periodo`, `plataforma`, `comparar_com_anterior`…).
 *
 * Leitura pura: não grava nada e não anota nada no coletor — só
 * `consultar_metrica` anota, quando devolve dado.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { listarMetricas, metricaPorId } from "@/lib/assistente/metricas";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({});

/**
 * O JSON Schema dos parâmetros de uma métrica, ou `null` quando o esquema não
 * pode ser convertido. `unrepresentable: "any"` já evita a maioria das falhas
 * (um campo que o JSON Schema não expressa vira "qualquer coisa"); o `try`
 * cobre o resto — uma métrica sem esquema legível continua listada.
 */
export function esquemaDosParametros(esquema: z.ZodType): Record<string, unknown> | null {
  try {
    const convertido: Record<string, unknown> = {
      ...z.toJSONSchema(esquema, { io: "input", unrepresentable: "any" }),
    };
    // O marcador de dialeto não ajuda o modelo e custa token em toda chamada.
    delete convertido.$schema;
    return convertido;
  } catch {
    return null;
  }
}

export function criarListarMetricas(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Lista as métricas de negócio que você pode consultar (conversas, faturamento, funil, " +
      "anúncios, desempenho etc.). Para cada uma traz o id, o que mede, a régua, o papel mínimo, " +
      "se está disponível para esta pessoa e os `parametros` aceitos (JSON Schema). Use ANTES de " +
      "`consultar_metrica` sempre que não souber o id exato ou o formato dos parâmetros.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("listar_metricas", esquemaDeEntrada, async () => {
      const metricas = await listarMetricas(entrada.ctx);
      return {
        ok: true as const,
        metricas: metricas.map((metrica) => {
          const definicao = metricaPorId(metrica.id);
          return {
            ...metrica,
            parametros: definicao ? esquemaDosParametros(definicao.parametros) : null,
          };
        }),
      };
    }),
  });
}
