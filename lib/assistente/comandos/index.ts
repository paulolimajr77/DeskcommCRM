/**
 * OS COMANDOS DO ASSISTENTE — o que se digita com "/" no campo do chat.
 *
 * Um comando é uma PERGUNTA COM NOME: em vez de o modelo decidir o que fazer,
 * a rota do chat reconhece o texto e responde de forma determinística (só lê,
 * com a sessão da pessoa). Isso importa por três razões:
 *
 *  1. determinismo — o mesmo comando devolve o mesmo formato, sem custo de
 *     modelo e sem depender de chave de IA configurada;
 *  2. papel — quem pode o quê é decidido AQUI, com o papel da sessão
 *     (`roleAtLeast`), nunca com a tela escondendo botão;
 *  3. isolamento — tudo que um comando lê passa pelas rotas `/api/v1` por
 *     dentro, e essas resolvem a organização pela SESSÃO. Nenhum comando
 *     aceita organização, empresa ou id de outra pessoa como parâmetro.
 *
 * Este arquivo é PURO: só o reconhecimento do texto e o texto da ajuda. Quem
 * lê dado é `executar.ts`.
 */

/** Os comandos que o SISTEMA conhece. `nova` é resolvido pela tela (limpar a conversa). */
export const COMANDOS = ["resumo", "checkup", "pendentes", "ajuda", "nova"] as const;

export type ComandoDoAssistente = (typeof COMANDOS)[number];

/**
 * O comando no começo do texto. Só o PRIMEIRO token vale: "quero um resumo" é
 * pergunta; "/resumo" é comando. Minúsculas para `/RESUMO` valer também.
 */
const COMANDO_NO_INICIO = /^\/([a-z_]+)/;

export function comandoDaPergunta(pergunta: string): ComandoDoAssistente | null {
  const encontrado = COMANDO_NO_INICIO.exec(pergunta.trim().toLowerCase());
  if (encontrado === null) return null;
  const nome = encontrado[1] ?? "";
  return (COMANDOS as readonly string[]).includes(nome) ? (nome as ComandoDoAssistente) : null;
}

/** O único comando que exige administrador: a fila de propostas é decisão de escrita. */
export function comandoSoDeAdmin(comando: ComandoDoAssistente): boolean {
  return comando === "pendentes";
}

export interface LinhaDaAjuda {
  comando: ComandoDoAssistente;
  explicacao: string;
  soAdmin: boolean;
}

/** O menu do campo e o texto do `/ajuda` saem DAQUI — uma lista, dois lugares. */
export function linhasDaAjuda(t: (texto: string) => string): LinhaDaAjuda[] {
  return [
    {
      comando: "resumo",
      explicacao: t(
        "Conversas abertas, negócios novos hoje, agendamentos de hoje, mensagens sem resposta e pendências de configuração.",
      ),
      soAdmin: false,
    },
    {
      comando: "checkup",
      explicacao: t("Roda a auditoria da configuração e mostra o que está pronto e o que falta."),
      soAdmin: false,
    },
    {
      comando: "pendentes",
      explicacao: t("Mostra as mudanças que esperam a sua decisão."),
      soAdmin: true,
    },
    {
      comando: "ajuda",
      explicacao: t("Lista os comandos e exemplos de pedidos."),
      soAdmin: false,
    },
    {
      comando: "nova",
      explicacao: t("Começa uma conversa nova, sem apagar o histórico."),
      soAdmin: false,
    },
  ];
}
