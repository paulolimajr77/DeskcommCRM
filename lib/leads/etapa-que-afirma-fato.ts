/**
 * A MÁQUINA NÃO AFIRMA UM FATO — A PESSOA SIM.
 *
 * ─── O DEFEITO, MEDIDO EM PRODUÇÃO (2026-09-16) ───
 *
 * Às 09:45 o negócio foi movido de "Entendendo a necessidade" para "Proposta
 * enviada" a partir da mensagem em que o agente PROMETEU a proposta. Ninguém
 * enviou proposta nenhuma: o classificador leu INTENÇÃO como FATO, e
 * `lib/leads/agent-stage-sync.ts` moveu o card com um `.update({ stage_id })`
 * direto.
 *
 * A trava contra isso foi posta no `moveLeadHandler` — e medido DEPOIS, SEIS
 * caminhos escrevem `crm_leads.stage_id`, e a trava cobria UM. O defeito de
 * produção passou por um dos cinco descobertos.
 *
 * ─── A REGRA, NA VOZ DO DONO DO PRODUTO ───
 *
 * > A máquina não afirma fato; a pessoa sim.
 *
 * - `user` move e cria à vontade: a pessoa que arrasta o card É a confirmação
 *   de que aquilo aconteceu. Nenhuma pergunta, nenhuma tela nova.
 * - `ai_agent`, `api_token` e `webhook_source` são recusados: um classificador
 *   lendo INTENÇÃO como FATO é exatamente o defeito medido, e nenhuma máquina
 *   consegue confirmar que um documento saiu.
 *
 * ─── POR QUE A LISTA DE QUEM PASSA É FECHADA ───
 *
 * A regra escreve `=== "user"` e NUNCA uma lista negra de
 * `ai_agent | api_token | webhook_source`. Um tipo de ator NOVO, amanhã, tem de
 * nascer RECUSADO — não liberado por esquecimento. A lista de quem passa é
 * fechada; a de quem é recusado é aberta. É a decisão inteira.
 *
 * ─── POR QUE A REGRA LÊ A COLUNA, NUNCA O NOME ───
 *
 * A lista de etapas é escrita pelo dono, em qualquer nicho: "Proposta enviada",
 * "Contrato assinado", "Pagamento recebido", "Laudo entregue", "Chaves
 * entregues". Cada nicho tem as suas, e o mesmo substantivo significa coisas
 * diferentes em empresas diferentes. Reconhecer por nome acerta uma empresa e
 * erra todas as outras. Esta função nem olha o nome — só `afirma_fato`.
 */

export type VeredictoDaAfirmacao =
  | { permitido: true }
  | { permitido: false; motivo: "maquina_nao_afirma_fato" };

/** O que a regra precisa saber da etapa de destino. Nada além disto. */
export interface EtapaDeDestino {
  /**
   * `crm_stages.afirma_fato`.
   *
   * Opcional e anulável: a coluna é `not null default false`, mas um clone com
   * o baseline antigo devolve a linha SEM a chave. Nesta regra, ausência,
   * `null` e `false` são a MESMA coisa — `afirma_fato !== true`.
   */
  afirma_fato?: boolean | null;
}

/** O que a regra precisa saber de quem age. Compatível com `Actor` por estrutura. */
export interface QuemAge {
  type: string;
}

/**
 * Decide se quem age pode entrar na etapa que afirma um fato.
 *
 * ─── A REGRA, POR ESCADAS ───
 *
 * 1. `etapa.afirma_fato !== true` → `{ permitido: true }`, SEM olhar o ator.
 *
 *    É o padrão e é o estado de 100% das etapas que existem hoje: ninguém
 *    sente diferença até marcar a caixa. O `!== true` — e não
 *    `!etapa.afirma_fato` — é deliberado: ausência, `null` e `false` são a
 *    MESMA coisa aqui, e um clone com baseline antigo devolve a linha sem a
 *    chave.
 *
 * 2. `quem.type === "user"` → `{ permitido: true }`.
 *
 *    A pessoa que move É a evidência. Nenhuma pergunta.
 *
 * 3. Qualquer outro tipo → `{ permitido: false, motivo:
 *    "maquina_nao_afirma_fato" }`.
 *
 *    A máquina não afirma fato. Não importa qual máquina: classificador,
 *    automação, webhook, token de API. Importa que não é pessoa.
 *
 * PURA: não lê banco, não lê relógio, não lê env, não consulta nome de etapa.
 */
export function podeEntrarNaEtapa(
  etapa: EtapaDeDestino,
  quem: QuemAge,
): VeredictoDaAfirmacao {
  if (etapa.afirma_fato !== true) return { permitido: true };
  if (quem.type === "user") return { permitido: true };
  return { permitido: false, motivo: "maquina_nao_afirma_fato" };
}
