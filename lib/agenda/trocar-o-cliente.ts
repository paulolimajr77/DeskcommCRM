/**
 * Quando trocar o cliente de um compromisso JÁ MARCADO é seguro — e quando não é.
 *
 * ## Por que a pergunta existe
 *
 * A tela de remarcar escondia o bloco do cliente, e escondia com razão: a rota
 * não aceitava `contact_id` nem `conversation_id`. Trocar o cliente de um
 * compromisso simplesmente não existia no produto. Quem marcasse para a pessoa
 * errada só tinha o caminho de cancelar e marcar de novo.
 *
 * ## A linha que separa o seguro do perigoso
 *
 * É a ENTREGA, não o horário. Enquanto nada foi mandado ao cliente, o vínculo é
 * só uma anotação: trocar não alcança ninguém de fora. Depois que a entrega foi
 * autorizada, o endereço do compromisso já saiu — ou está a caminho — para uma
 * conversa concreta.
 *
 * Trocar o cliente nesse ponto criaria um compromisso que:
 *
 *   • diz pertencer à pessoa B,
 *   • enquanto a pessoa A tem, no WhatsApp dela, o link daquela reunião.
 *
 * Nenhuma das duas informações fica falsa sozinha — juntas, mentem. E o produto
 * não tem como recolher o que já chegou no aparelho de alguém.
 *
 * Por isso a resposta aqui é RECUSAR, e não "trocar e reenviar": reenviar
 * avisaria B e deixaria A com o link mesmo assim. Quem precisa mesmo trocar
 * cancela e marca de novo — que é explícito, aparece na linha do tempo dos dois
 * lados, e não depende de ninguém adivinhar o que aconteceu.
 */

/** Os estados que `meeting_delivery.state` assume. `none` é "nada foi pedido". */
export type EstadoDaEntrega = string | null | undefined;

export function podeTrocarOCliente(estadoDaEntrega: EstadoDaEntrega): boolean {
  // Ausente e `none` são a mesma coisa: compromisso que nunca pediu entrega.
  // Compromisso sem contato nenhum também cai aqui — e deve: vincular um
  // cliente onde não havia é o caso mais comum de correção.
  return !estadoDaEntrega || estadoDaEntrega === "none";
}

/** O motivo, em português, para quem está na tela. */
export const MOTIVO_NAO_PODE_TROCAR =
  "Os dados desta reunião já foram enviados ao cliente atual. Para marcar com outra pessoa, cancele este compromisso e marque um novo.";
