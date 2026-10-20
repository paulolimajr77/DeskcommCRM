/**
 * As funções puras que leem e preenchem um esqueleto de prompt.
 *
 * Um marcador é `{...}`. O texto dentro das chaves, sem as chaves e sem espaços
 * nas pontas, é o NOME do marcador — e um marcador com vírgula, como
 * `{especialidades, em uma frase}`, é UM marcador só.
 *
 * Nada aqui lança: entrada estranha vira `{ ok: false, faltam: [...] }`.
 */

function regexDeMarcador(): RegExp {
  // `[^{}]+` não deixa um marcador "engolir" outro; casar o par mais interno.
  return /\{([^{}]+)\}/g;
}

/** Os nomes dos marcadores distintos, na ordem em que aparecem. */
export function placeholdersDoEsqueleto(esqueleto: string): string[] {
  const marcadores: string[] = [];
  for (const achado of esqueleto.matchAll(regexDeMarcador())) {
    const nome = (achado[1] ?? "").trim();
    if (!marcadores.includes(nome)) marcadores.push(nome);
  }
  return marcadores;
}

/**
 * Substitui cada `{marcador}` pelo valor de mesmo nome.
 *
 * Falha (sem devolver texto) quando algum marcador está sem valor, vazio ou em
 * branco — ou quando o valor contém `{` ou `}`, o que permitiria injetar um
 * marcador novo. Nesse caso o marcador entra na lista `faltam`.
 */
export function preencherEsqueleto(
  esqueleto: string,
  valores: Record<string, string>,
): { ok: true; texto: string } | { ok: false; faltam: string[] } {
  const marcadores = placeholdersDoEsqueleto(esqueleto);
  const faltam: string[] = [];

  for (const marcador of marcadores) {
    const valor = valores[marcador];
    if (typeof valor !== "string" || valor.trim() === "") {
      faltam.push(marcador);
      continue;
    }
    if (valor.includes("{") || valor.includes("}")) {
      faltam.push(marcador);
    }
  }

  if (faltam.length > 0) return { ok: false, faltam };

  const texto = esqueleto.replace(regexDeMarcador(), (_todo, dentro: string) => {
    return valores[dentro.trim()] ?? "";
  });
  return { ok: true, texto };
}
