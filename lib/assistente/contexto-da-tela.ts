/**
 * O CONTEXTO DA TELA DO ASSISTENTE — qual agente a pessoa está vendo.
 *
 * O painel do assistente acompanha a pessoa em qualquer página e manda ao chat
 * o CAMINHO em que ela está (`contexto.caminho`). Daí sai o "melhore o prompt
 * DESTE agente": se o caminho é a tela de um agente, o servidor descobre qual.
 *
 * ## Por que o id NÃO vem do cliente
 *
 * O cliente manda só o caminho; o id é extraído AQUI por um padrão fixo, e só
 * vale se o agente existir NA ORGANIZAÇÃO DA SESSÃO (consulta parametrizada
 * com `organization_id`). Id de outra organização, inexistente, ou caminho que
 * não casa: devolve `null` em silêncio — sem erro e sem dizer que o agente
 * existe em outro lugar. O contexto não vai para a auditoria e não mexe em
 * limite nem em replay: ele só acrescenta uma linha ao `system` do turno.
 */
import type { Pool } from "pg";

import { logger } from "@/lib/logger";

/** `/app/ai/agents/<uuid>` com ou sem subcaminho. Único padrão de contexto desta tarefa. */
const CAMINHO_DO_AGENTE =
  /^\/app\/ai\/agents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/|$)/;

export interface AgenteEmTela {
  id: string;
  nome: string;
}

/** O id do agente que o caminho aponta, ou `null` se o caminho não é a tela de um agente. */
export function idDoAgenteNoCaminho(caminho: string): string | null {
  return CAMINHO_DO_AGENTE.exec(caminho)?.[1] ?? null;
}

/**
 * O agente que a pessoa está vendo, se o caminho aponta para um agente DESTA
 * organização. Nunca lança: falha de leitura é o mesmo que "sem contexto".
 */
export async function agenteVistoNaTela(
  db: Pick<Pool, "query">,
  orgId: string,
  caminho: string | undefined,
): Promise<AgenteEmTela | null> {
  if (caminho === undefined) return null;
  const id = idDoAgenteNoCaminho(caminho);
  if (id === null) return null;
  try {
    const { rows } = await db.query<{ id: string; name: string }>(
      "select id, name from public.ai_agents where id = $1 and organization_id = $2 limit 1",
      [id, orgId],
    );
    const linha = rows[0];
    if (linha === undefined) return null;
    return { id: linha.id, nome: linha.name };
  } catch (erro) {
    // Só o nome do erro: a mensagem pode carregar detalhe do banco.
    logger.warn("assistente.chat.contexto_da_tela_falhou", {
      organization_id: orgId,
      erro: erro instanceof Error ? erro.name : "desconhecido",
    });
    return null;
  }
}
