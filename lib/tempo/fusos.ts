/**
 * Os fusos horários que a tela oferece — e a checagem de que o fuso EXISTE.
 *
 * ─── O defeito, medido ─────────────────────────────────────────────────────
 *
 * O campo do fuso da janela de envio era texto livre, validado só por
 * `z.string().min(1).max(64)`. Qualquer coisa passava. E o motor usa
 * `Intl.DateTimeFormat({ timeZone })`, que LANÇA `RangeError` num fuso que não
 * existe:
 *
 *   America/Asuncion   → 23h        ✓
 *   America/Asunción   → RangeError  ← o acento que um hispanofalante escreve
 *   Asuncion           → RangeError
 *
 * Ou seja: um acento no campo salvava sem reclamar e derrubava a avaliação da
 * janela em TODO envio daquele canal. O defeito não aparece na tela que o
 * causou — aparece no worker, horas depois, como envio que não sai.
 *
 * ─── Duas defesas, e as duas fazem falta ───────────────────────────────────
 *
 * A LISTA impede o erro de digitação, que é a origem real. A CHECAGEM defende a
 * API, que aceita qualquer cliente e não passa pela tela — e defende a lista de
 * si mesma, se alguém acrescentar um código errado aqui.
 */

/**
 * Fusos oferecidos — a lista ÚNICA de toda tela que pergunta "onde você está".
 *
 * ─── A divergência que isto encerra, medida em 2026-09-11 ──────────────────
 *
 * Havia QUATRO listas, e nenhuma sabia das outras:
 *
 * | onde                                   | quantos | o que faltava                 |
 * |----------------------------------------|---------|-------------------------------|
 * | aqui (`FUSOS_OFERECIDOS`)              |      14 | Cuiabá, Rio Branco, Europa/EUA|
 * | `app/onboarding/welcome/_form.tsx`     |      12 | os 7 hispano-americanos       |
 * | `app/app/settings/tenant/_form.tsx`    |       6 | tudo, menos 5 do Brasil + UTC |
 * | `app/app/settings/profile/_form.tsx`   |       6 | idem, copiada da anterior     |
 *
 * O efeito não era estético. Quem escolhia **Cuiabá** no onboarding — onde ela
 * era oferecida — e depois abria Configurações › Organização encontrava o campo
 * **em branco**: o `Select` não tem item para um valor que a lista dele não
 * contém. A pessoa não conseguia nem confirmar o próprio fuso, e ao tocar no
 * campo era obrigada a escolher um errado. Mato Grosso e Acre não são
 * exóticos — são UTC−4, uma hora de diferença em toda janela de envio, todo
 * lembrete e toda oferta de horário.
 *
 * E as três cópias usavam vocabulários diferentes para a MESMA pergunta: o
 * onboarding dizia "Cuiabá e Mato Grosso", as configurações mostravam
 * `America/Cuiaba` cru — o identificador é do sistema, o que a pessoa
 * reconhece é a cidade.
 *
 * ─── O que a lista contém, e por que não encolheu ─────────────────────────
 *
 * A UNIÃO das quatro, nunca a interseção: tirar um fuso que alguma tela já
 * oferecia deixaria órfão o valor de quem o escolheu, com o mesmo campo em
 * branco que este trabalho existe para fechar.
 *
 * Não é a lista IANA inteira (são centenas). Faltar um é um pedido de uma
 * linha; oferecer trezentos faz o operador procurar o dele numa lista que não
 * termina — e a busca é justamente onde ele digita errado.
 *
 * ⚠️ O rótulo é para HUMANO e o código é para máquina. Quem acrescentar uma
 * linha aqui escreve a cidade que a pessoa reconhece, não o identificador.
 */
export const FUSOS_OFERECIDOS: { codigo: string; rotulo: string }[] = [
  // Brasil primeiro: é o público que instala.
  { codigo: "America/Sao_Paulo", rotulo: "São Paulo, Rio, Brasília, Sul e Sudeste (Brasil)" },
  { codigo: "America/Recife", rotulo: "Recife, Salvador e Nordeste (Brasil)" },
  { codigo: "America/Fortaleza", rotulo: "Fortaleza e Ceará (Brasil)" },
  { codigo: "America/Belem", rotulo: "Belém e Pará (Brasil)" },
  { codigo: "America/Manaus", rotulo: "Manaus e Amazonas (Brasil)" },
  { codigo: "America/Cuiaba", rotulo: "Cuiabá e Mato Grosso (Brasil)" },
  { codigo: "America/Rio_Branco", rotulo: "Rio Branco e Acre (Brasil)" },
  // Vizinhos de língua espanhola — o produto atende em espanhol.
  { codigo: "America/Argentina/Buenos_Aires", rotulo: "Buenos Aires (Argentina)" },
  { codigo: "America/Montevideo", rotulo: "Montevidéu (Uruguai)" },
  { codigo: "America/Asuncion", rotulo: "Assunção (Paraguai)" },
  { codigo: "America/Santiago", rotulo: "Santiago (Chile)" },
  { codigo: "America/La_Paz", rotulo: "La Paz (Bolívia)" },
  { codigo: "America/Lima", rotulo: "Lima (Peru)" },
  { codigo: "America/Bogota", rotulo: "Bogotá (Colômbia)" },
  { codigo: "America/Mexico_City", rotulo: "Cidade do México (México)" },
  // Fora da América Latina: vieram do onboarding, e quem opera de fora existe.
  { codigo: "Europe/Lisbon", rotulo: "Lisboa (Portugal)" },
  { codigo: "Europe/Madrid", rotulo: "Madri (Espanha)" },
  { codigo: "America/New_York", rotulo: "Nova York (Estados Unidos)" },
  { codigo: "America/Los_Angeles", rotulo: "Los Angeles (Estados Unidos)" },
  { codigo: "UTC", rotulo: "Outro (horário universal — UTC)" },
];

/**
 * O fuso de quem ainda não escolheu — e o mesmo valor das outras duas pontas:
 * o DEFAULT da coluna `organizations.timezone` (baseline.sql) e o
 * `availabilityScheduleSchema` da jornada (`lib/schemas/routing.ts`).
 *
 * Existe para quem precisa DEGRADAR: leitor que encontra a coluna com um valor
 * que o `Intl` recusa não pode lançar nem inventar UTC — UTC daria três horas
 * de erro numa instalação brasileira, calado. Cair no mesmo valor que o banco
 * já usa como padrão mantém uma verdade só.
 *
 * ⚠️ NÃO é o fuso do pacing. `PACING_DEFAULTS.timezone` tem o mesmo texto e
 * responde a outra pergunta (a janela anti-ban daquele CANAL, override por
 * linha em `channel_knobs`). Coincidem hoje; unificar os dois faria uma
 * decisão de anti-ban mudar o relógio do agente.
 */
export const FUSO_PADRAO = "America/Sao_Paulo";

/**
 * O runtime consegue usar este fuso?
 *
 * Pergunta ao `Intl`, e não a uma lista: é o `Intl` que o motor da janela usa, e
 * uma lista nossa responderia "sim" para um código que ele recusa. A base de
 * fusos muda (países criam e apagam zonas), e quem sabe qual versão está
 * instalada é o próprio runtime.
 */
export function fusoValido(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
