/**
 * Ferramenta `consultar_metrica` — roda UMA métrica do catálogo e devolve o
 * resultado como está (`consultarMetrica` já valida parâmetro, papel e módulo,
 * e devolve a união fechada `ok` / `sem_permissao` / `modulo_ausente` /
 * `parametro_invalido` / `indisponivel`).
 *
 * A organização e o papel vêm de `entrada.ctx` (montado pela rota a partir da
 * sessão); o modelo só escolhe o id e os parâmetros da métrica — e cada
 * métrica tem esquema estrito, então um `organization_id` nos parâmetros é
 * `parametro_invalido`.
 *
 * COLETOR: o id só entra em `coletor.metricas` quando a consulta devolveu
 * `ok: true` COM dado (`dados !== null`) — é isso que a rota grava na
 * auditoria, e "consultei e veio vazio" ou "falhou" não é métrica usada.
 * Sem repetição.
 *
 * TAMANHO: resultado que passa de 20.000 caracteres de JSON é recusado — um
 * resultado desse tamanho estoura o contexto do modelo e custa caro sem ajudar.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { consultarMetrica } from "@/lib/assistente/metricas";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

export const LIMITE_DE_CARACTERES_DO_RESULTADO = 20_000;

const esquemaDeEntrada = z.strictObject({
  metrica: z.string().max(60),
  parametros: z.record(z.string(), z.unknown()).optional(),
});

export function criarConsultarMetrica(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Consulta UMA métrica de negócio e devolve os números com a régua (definição, janela, fuso) " +
      "e avisos. Se não souber o id ou os parâmetros, chame `listar_metricas` antes. " +
      "`metrica` é o id; `parametros` é um objeto com os parâmetros daquela métrica " +
      "(o JSON Schema de cada uma vem em `listar_metricas`). " +
      "O período vai em `parametros.periodo`, sempre como objeto com `tipo`: " +
      '{"tipo":"semana_passada"} (segunda a domingo da semana que passou; é o padrão da maioria); ' +
      '{"tipo":"semana_atual"} (segunda até hoje, parcial); ' +
      '{"tipo":"ultimos_dias","dias":30} (dias completos terminando ontem, de 1 a 400); ' +
      '{"tipo":"mes_atual"} (dia 1 até hoje, parcial); ' +
      '{"tipo":"mes_passado"} (o mês anterior inteiro); ' +
      '{"tipo":"intervalo","de":"2026-10-01","ate":"2026-10-07"} (datas AAAA-MM-DD, o `ate` conta como dia incluído). ' +
      'Exemplo de chamada: {"metrica":"conversas_por_visao"} (foto do inbox agora; esta métrica não tem parâmetros — as de período pedem {"periodo":{"tipo":"semana_passada"}}). ' +
      "Se o resultado vier com `sem_permissao`, `modulo_ausente` ou `indisponivel`, diga isso à " +
      "pessoa com clareza; nunca invente o número.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("consultar_metrica", esquemaDeEntrada, async ({ metrica, parametros }) => {
      const resultado = await consultarMetrica(entrada.ctx, metrica, parametros ?? {});
      if (JSON.stringify(resultado).length > LIMITE_DE_CARACTERES_DO_RESULTADO) {
        return { ok: false as const, motivo: "indisponivel" as const, detalhe: "resultado grande demais" };
      }
      const temDado = resultado.ok && resultado.dados !== null && resultado.dados !== undefined;
      if (temDado && !entrada.coletor.metricas.includes(resultado.metrica)) {
        entrada.coletor.metricas.push(resultado.metrica);
      }
      return resultado;
    }),
  });
}
