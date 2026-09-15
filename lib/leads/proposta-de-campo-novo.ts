import type { CustomFieldDef } from "@/lib/schemas/settings";

/**
 * O AGENTE PROPÕE UM CAMPO QUE A EMPRESA AINDA NÃO DECLAROU.
 *
 * Ele ouve "vocês anotam de onde o cliente veio?" e percebe que não há campo
 * para isso. Propor é útil; CRIAR não é dele — criar campo muda a tela de TODOS
 * os leads daquele funil, para sempre, e isso é decisão de quem administra.
 *
 * ## ⛔ A REGRA É PURA, E ISSO NÃO É ESTILO
 *
 * Tudo o que decide vive aqui, sem banco e sem rede: o que é chave válida, o
 * que já existe, e onde está o teto. O emissor (a ferramenta MCP) só chama.
 * Assim a decisão é testável com os casos degenerados — chave repetida, chave
 * disfarçada, funil cheio — sem subir Postgres para cada um deles.
 */

/** Por que a proposta não vale. O motivo é do CHAMADOR, nunca do cliente. */
export type MotivoSemProposta =
  | "chave_invalida"
  | "ja_existe"
  | "funil_no_teto"
  | "rotulo_vazio";

export type ResultadoDaPropostaDeCampo =
  | { propor: true; key: string; label: string }
  | { propor: false; motivo: MotivoSemProposta; detalhe?: string };

/**
 * TETO DE CAMPOS POR FUNIL.
 *
 * Cada campo entra no prefixo de TODO turno daquele agente — a definição viaja
 * ao modelo a cada mensagem. Cinquenta já é uma ficha que ninguém preenche; sem
 * teto, um agente insistente transforma o funil num formulário de cinquenta
 * perguntas e o custo de cada conversa cresce junto, na chave de quem hospeda.
 *
 * O número é frouxo de propósito: ele existe para impedir o descontrole, não
 * para disciplinar quem sabe o que está fazendo.
 */
export const TETO_DE_CAMPOS_POR_FUNIL = 50;

/**
 * Chave de campo é identificador, não frase.
 *
 * Minúsculas, dígitos e sublinhado; começa por letra. A mesma forma que as
 * chaves criadas à mão na tela já têm — divergir aqui criaria duas famílias de
 * chave e a tela teria de desenhar as duas.
 */
const CHAVE_VALIDA = /^[a-z][a-z0-9_]{1,39}$/;

/**
 * Decide se a proposta do agente vale a pena virar um aviso na Central.
 *
 * Devolve a chave e o rótulo já normalizados: quem chama não decide nada, só
 * emite. Se a decisão voltar `false`, o agente recebe o motivo e segue a
 * conversa — propor é um extra, nunca o assunto.
 */
export function avaliarPropostaDeCampo(
  entrada: { key: unknown; label: unknown },
  jaExistentes: CustomFieldDef[],
): ResultadoDaPropostaDeCampo {
  const key = typeof entrada.key === "string" ? entrada.key.trim().toLowerCase() : "";
  const label = typeof entrada.label === "string" ? entrada.label.trim() : "";

  if (!CHAVE_VALIDA.test(key)) {
    return { propor: false, motivo: "chave_invalida", detalhe: key.slice(0, 40) };
  }
  if (label === "") return { propor: false, motivo: "rotulo_vazio" };

  // ⛔ COMPARA NORMALIZADO, e não o texto cru. O modelo vai propor `Segmento`,
  // `segmento ` e `SEGMENTO` em conversas diferentes, e as três são o mesmo
  // campo. Sem isto a Central enche de propostas do que já existe — e quem
  // administra aprende a ignorar a fila inteira, que é o pior desfecho.
  if (jaExistentes.some((c) => c.key.trim().toLowerCase() === key)) {
    return { propor: false, motivo: "ja_existe" };
  }

  // O teto entra DEPOIS do "já existe": propor o que já existe num funil cheio
  // é "já existe", e dizer "funil cheio" ali mandaria quem administra apagar um
  // campo para criar o que ele já tem.
  if (jaExistentes.length >= TETO_DE_CAMPOS_POR_FUNIL) {
    return { propor: false, motivo: "funil_no_teto" };
  }

  return { propor: true, key, label };
}

/**
 * A frase que quem administra lê na Central.
 *
 * ⛔ NOMEIA O CAMPO E CITA O QUE O CLIENTE DISSE — e o trecho é o que torna a
 * decisão possível: sem ele, confirmar é ato de fé. É a mesma escolha que
 * `contact_field_proposals.trecho` já faz para dado de contato.
 *
 * O trecho é recortado em 160 caracteres porque isto vai para um TÍTULO de
 * aviso; o resto da conversa está a um clique, na conversa.
 */
export function tituloDaProposta(label: string): string {
  // ⛔ O TRECHO NÃO ENTRA AQUI, e a razão é a idempotência.
  //
  // A primeira versão punha a frase do cliente no título. Mas o título É a
  // chave que impede o aviso de nascer de novo a cada turno — e o trecho vem do
  // MODELO: muda uma vírgula, muda o título, nasce aviso novo. A Central
  // encheria de cópias do mesmo pedido, e quem administra aprenderia a ignorar
  // a fila. Achado revisando o diff.
  //
  // O trecho continua existindo, e é ele que torna a decisão possível — mas no
  // CORPO do aviso, que não entra na comparação.
  return `O agente sugere um campo novo no funil: "${label.replace(/\s+/g, " ").trim().slice(0, 80)}"`;
}

/** O corpo, onde a evidência mora — sem ela, confirmar é ato de fé. */
export function corpoDaProposta(entrada: {
  key: string;
  label: string;
  funil: string | null;
  trecho: string | null | undefined;
}): string {
  const dito = (entrada.trecho ?? "")
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const origem = dito === "" ? "" : ` O cliente disse: "${dito.slice(0, 300)}".`;
  return (
    `O agente sugere criar o campo "${entrada.label}" (chave ${entrada.key})` +
    `${entrada.funil ? ` no funil "${entrada.funil}"` : ""}.${origem}` +
    ` Nada foi criado: para aceitar, vá em Configurações › Funis e acrescente o campo.` +
    ` Para recusar, marque este aviso como resolvido.`
  );
}
