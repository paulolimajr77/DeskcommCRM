/**
 * A TAREFA QUE NASCE DE UMA APROVAÇÃO DE PRÓXIMA AÇÃO.
 *
 * ─── O DEFEITO, MEDIDO EM PRODUÇÃO (2026-09-16) ───
 *
 * O dono aprovou a proposta do assistente — "Enviar orçamento personalizado…" —
 * e o que aquele clique produziu foi UMA LINHA DE TIMELINE e
 * `update lead_state set next_action = null`. E só. Nenhuma tarefa, nenhum
 * dono, nenhum prazo, nenhum aviso.
 *
 * Ele aprovou sem saber o que aquilo acionava, PORQUE NÃO ACIONAVA NADA. O
 * botão "Aprovar" apagava a única superfície onde a pendência existia: a
 * demanda ficava invisível pelo próprio ato de cuidar dela. Aprovar é dizer
 * "é para fazer", e dizer "é para fazer" precisa deixar alguém com a tarefa de
 * fazer — não com um card mudo.
 *
 * ─── O QUE ESTA FUNÇÃO É, E O QUE ELA NÃO É ───
 *
 * Ela NÃO insere nada. É PURA de propósito: recebe o que o pedido já provou
 * (org, negócio, contato, texto aprovado, quem aprovou) e um relógio injetável
 * (`agora`), e devolve a linha que a rota vai inserir em `crm_tasks`. Quem
 * insere é a rota — se esta função soubesse do Supabase, o teste do módulo
 * viraria teste de rota, e o que precisa ser provado aqui é pequeno e exato:
 * o formato da linha, os prazos, e quem é o dono.
 *
 * O destino `public.crm_tasks` já existe inteiro: migration 0210, rota
 * `/api/v1/tasks`, tipos em `lib/tarefas/tipos.ts`, tela em `/app/tasks` e
 * porta na navegação. Zero migration para esta entrega.
 */

/** 24 h. O prazo padrão de uma aprovação de próxima ação. */
export const PRAZO_DA_APROVACAO_MS = 24 * 60 * 60 * 1000;

/** O teto de `crm_tasks.title` que a rota pública já pratica (`/api/v1/tasks`, zod max 255). */
export const LIMITE_DO_TITULO = 255;

export interface AprovacaoQueViraTarefa {
  organizationId: string;
  leadId: string;
  contactId: string;
  /** O texto que a pessoa LEU e aprovou. Já vem trimado e não-vazio. */
  textoAprovado: string;
  /** Quem clicou em Aprovar. Vira dono E autor. */
  quemAprovou: string;
  /** Injetável no teste; a rota passa `new Date()`. */
  agora: Date;
}

export interface LinhaDeTarefa {
  organization_id: string;
  title: string;
  description: string | null;
  due_date: string;
  priority: "medium";
  status: "pending";
  lead_id: string;
  contact_id: string;
  assigned_to: string;
  created_by: string;
}

/**
 * Monta a linha de `crm_tasks` que uma aprovação de próxima ação gera.
 *
 * ─── POR QUE `due_date` NUNCA É `null` ───
 *
 * `estaAtrasada()` (lib/tarefas/tipos.ts) devolve `false` para tarefa sem
 * prazo SEMPRE, e `faixaDePrazo()` a manda para a faixa `sem_prazo` — o fim da
 * lista, onde ninguém olha. Uma tarefa sem prazo NUNCA vira atrasada, e é
 * exatamente a invisibilidade que este conserto ataca: ela nasceria escondida
 * num lugar diferente do anterior. Não há knob de organização com prazo
 * padrão (medido); 24 h é a constante deste módulo, e o prazo existe para a
 * lista de atrasadas voltar a enxergar a demanda.
 *
 * ─── POR QUE O TEXTO LONGO VAI PARA `description` ───
 *
 * `title` é o que a lista de tarefas mostra; ele tem teto de 255. Cortar e
 * jogar o fim fora seria perder o que a proposta pede — a proposta é o
 * briefing, não um rótulo. Então o recorte termina em `…` (que CONTA para o
 * limite) e o texto INTEIRO viaja na `description`, que não tem teto e não é
 * o que a lista corta.
 *
 * ─── POR QUE `assigned_to` E `created_by` SÃO O MESMO USUÁRIO ───
 *
 * Quem aprovou assume por padrão, e a tela de tarefas deixa reatribuir depois.
 * Um dono errado é corrigível; dono NENHUM é a tarefa que ninguém vê.
 *
 * ─── POR QUE `priority: "medium"` E `status: "pending"` SÃO LITERAIS ───
 *
 * A aprovação não carrega urgência declarada. Inventar `high` faria toda
 * proposta aprovada gritar mais alto que as tarefas que a pessoa priorizou à
 * mão, e o "high" deixaria de significar "isto é urgente" para significar
 * "isto veio do assistente".
 *
 * PURA e IMUTÁVEL: não altera `entrada`, não lê `Date.now()`, não lê
 * `process.env`.
 */
export function tarefaDaAprovacao(entrada: AprovacaoQueViraTarefa): LinhaDeTarefa {
  const due = new Date(entrada.agora.getTime() + PRAZO_DA_APROVACAO_MS);
  const texto = entrada.textoAprovado;
  const excede = texto.length > LIMITE_DO_TITULO;

  // O `…` entra na conta do limite: recortar sem descontar o caractere do
  // ellipsis faria um título de 256 num campo de 255.
  const title = excede
    ? `${texto.slice(0, LIMITE_DO_TITULO - 1)}…`
    : texto;
  const description = excede ? texto : null;

  return {
    organization_id: entrada.organizationId,
    title,
    description,
    due_date: due.toISOString(),
    priority: "medium",
    status: "pending",
    lead_id: entrada.leadId,
    contact_id: entrada.contactId,
    assigned_to: entrada.quemAprovou,
    created_by: entrada.quemAprovou,
  };
}
