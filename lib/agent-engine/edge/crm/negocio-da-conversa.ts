/**
 * O NEGÓCIO DESTA CONVERSA — o ponteiro que faltava entre o CONTATO e o CARD.
 *
 * ═══ O DEFEITO, MEDIDO EM PRODUÇÃO (2026-09-16) ═══
 *
 * O agente perguntou os campos que o dono declarou, o cliente respondeu quatro,
 * e NENHUM foi gravado. O contexto do turno entrega um campo chamado `lead_id`
 * que carrega o id do CONTATO — o nome mente, e o modelo acreditava. Ao lado
 * dele não havia caminho nenhum até o número do NEGÓCIO: o caminho existe
 * (listar os negócios e casar pelo contato), mas não estava escrito em lugar
 * nenhum do prompt, custava um passo a mais de um orçamento de dez, e o atalho
 * errado estava à mão. Nas duas conversas medidas o agente inventou um uuid ou
 * não tentou: ZERO vezes o caminho certo.
 *
 * ═══ POR QUE UMA RESPOSTA, E NÃO A LISTA CRUA ═══
 *
 * Devolver todos os negócios do contato faria o chamador reimplementar "qual
 * deles está em jogo agora" — a MESMA pergunta que `resolveActiveLeadForContact`
 * (`lib/leads/active-lead.ts`) já responde, e que o roteamento de atividade, o
 * gate de escopo de funil e a fronteira de escrita do turno já usam. São QUATRO
 * consumidores da mesma regra; um quinto reimplementando faria duas partes do
 * sistema discordarem sobre o mesmo cliente — o modo de falha que o cabeçalho
 * daquela função existe para impedir.
 *
 * Então este módulo é FINO de propósito: SELECT das colunas que a regra exige, e
 * tradução do desfecho dela para um vocabulário que o modelo entende — "um",
 * "nenhum" ou "varios (quantos)". A lógica de qual negócio é qual NÃO nasce
 * aqui; nasce lá, e é lá que as correções futuras se aplicam.
 */
import type { Queryable } from '../../queue/queue';
import {
  resolveActiveLeadForContact,
  type LeadCandidate,
} from '@/lib/leads/active-lead';

/** O desfecho, em vocabulário que o prompt consegue ler. */
export type NegocioDaConversa =
  | { tipo: 'um'; leadId: string }
  /** Não há um único negócio ABERTO. `null` no contexto, e o modelo SEGUE. */
  | { tipo: 'nenhum' }
  /** Mais de um candidato empatado. `null` no contexto, e o modelo PERGUNTA. */
  | { tipo: 'varios'; quantos: number };

/**
 * O id do negócio desta conversa, ou a razão de não haver um só.
 *
 * `ids.tenantId` filtra a query E é o mesmo `organization_id` que o
 * `assertMesmaOrg` de `resolveActiveLeadForContact` conferiria — sem ele, uma
 * lista misturada faria a função ROTEAR a escrita de um tenant para o negócio
 * de OUTRO, e o vazamento pareceria decisão correta. O filtro mora na query
 * (fonte da verdade) e o `assertMesmaOrg` fica como rede de segurança para o
 * caso de alguém remover o `where` sem ver que é ele quem protege.
 *
 * O `pipeline_id` do SELECT NÃO é usado aqui — mas `LeadCandidate` o exige, e
 * `resolveActiveLeadForContact` o usa para preferir o pipeline default quando o
 * contato tem mais de um negócio aberto em pipelines diferentes.
 */
export async function negocioDaConversa(
  db: Queryable,
  ids: { tenantId: string; contactId: string },
): Promise<NegocioDaConversa> {
  const { rows } = await db.query<LeadCandidate>(
    `select id, organization_id, pipeline_id, status, last_activity_at, created_at
     from crm_leads
     where organization_id = $1 and contact_id = $2`,
    [ids.tenantId, ids.contactId],
  );

  const r = resolveActiveLeadForContact(rows);
  if (r.routed) return { tipo: 'um', leadId: r.leadId };

  // Ambíguo é um desfecho de NEGÓCIO, não um erro: a pessoa tem mais de um
  // negócio aberto e a escolha é dela (ou de quem atende). A contagem vai junto
  // porque a mensagem do modelo muda com ela — "você tem dois negócios" soa
  // diferente de "você tem cinco".
  if (r.reason === 'ambiguous_open_leads') {
    return { tipo: 'varios', quantos: r.candidateIds.length };
  }

  return { tipo: 'nenhum' };
}
