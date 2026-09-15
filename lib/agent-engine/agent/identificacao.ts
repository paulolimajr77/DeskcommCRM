/**
 * Bloco de sistema RESIDENTE de identificação — manda o agente descobrir COM QUEM
 * ele está falando, em vez de atender a vida inteira um número de telefone.
 *
 * Por quê: medido numa instalação real, 2 de 3 contatos estavam sem nome no
 * cadastro. Não havia bloco de sistema nenhum sobre identificação, e a única
 * ferramenta que registra esse dado tem `description` que abre em "Registra uma
 * informação que o cliente forneceu" (`lib/mcp/tools/contacts.ts`) — isso é ordem
 * de ANOTAR o que caiu no colo, nunca de PERGUNTAR. Sem ninguém mandando perguntar,
 * ninguém perguntava.
 *
 * ⚠️ O texto é CONSTANTE, sem uma interpolação sequer, e isso não é estilo. O
 * `system` inteiro vai para o prefixo cacheado do provedor
 * (`lib/agent-engine/edge/llm/stable-prefix.ts`), cuja regra dura é "NADA volátil
 * (timestamp, random, lead, contador) entra aqui". Um bloco que variasse por
 * contato invalidaria o cache a cada conversa e encareceria todo atendimento da
 * org. Por isso o bloco FALA do campo `contact.nome_confirmado` em vez de LER o
 * valor dele: o valor viaja no sufixo, no contexto por lead, onde o volátil mora.
 *
 * ⚠️ A condição de entrada é a FERRAMENTA estar ligada, NUNCA o estado do contato —
 * é o que `deveIdentificar` decide. `crm_propose_contact_field` está fora do pacote
 * "Atender" de propósito (ver o comentário longo em
 * `lib/mcp/tools/catalogo/atendimento.ts`: o pacote já usa 18 das 25 vagas do teto),
 * então há agente publicado sem ela. Empilhar este bloco nesse agente ensinaria a
 * perguntar um dado que ele não tem para onde mandar — o mesmo defeito que o
 * comentário do `AGENDA_SYSTEM_BLOCK` descreve, e que custou "vou verificar e te
 * aviso" para sempre.
 */
export const IDENTIFICACAO_SYSTEM_BLOCK =
  "## Quem está do outro lado\n" +
  "O campo `contact.name` do contexto pode não ser o nome da pessoa: o que chega ali costuma ser " +
  "o texto que ela mesma escreveu no aparelho — um apelido, o nome do negócio, ou só o número. " +
  "Quem diz se a empresa tem o nome de verdade é `contact.nome_confirmado`.\n" +
  "Quando `nome_confirmado` for false, pergunte o nome UMA VEZ, com naturalidade, no primeiro " +
  'momento em que couber na conversa (ex.: "como posso te chamar?"). Se a pessoa não responder, ' +
  "desconversar ou não quiser dizer, siga o atendimento normalmente e NÃO pergunte de novo — " +
  "insistir queima o atendimento.\n" +
  "E-mail: peça SÓ quando houver algo concreto para enviar (proposta, orçamento, link, documento). " +
  'Pedir e-mail logo no "oi" parece golpe.\n' +
  "Telefone: NÃO pergunte — a conversa já chega por um número. Só registre um telefone se a pessoa " +
  "oferecer por conta própria um segundo número, diferente do canal por onde ela está falando.\n" +
  "O que a pessoa disser vai por crm_propose_contact_field, que cria uma PROPOSTA para alguém da " +
  "empresa confirmar. Nada entra no cadastro por conta dessa chamada: NUNCA diga ao cliente que o " +
  'cadastro foi atualizado, que "anotou no sistema" ou equivalente — agradeça e siga a conversa.';

/**
 * A decisão de empilhar o bloco, separada da montagem do turno para poder ser
 * exercitada sem subir banco, fila e modelo. `inbound-turn.ts` CHAMA esta função —
 * nunca copia a condição — para o teste vigiar a regra que roda em produção.
 */
export function deveIdentificar(toolIds: readonly string[]): boolean {
  return toolIds.includes("crm_propose_contact_field");
}
