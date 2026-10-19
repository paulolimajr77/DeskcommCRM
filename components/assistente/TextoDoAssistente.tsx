"use client";

/**
 * Renderiza o corpo da mensagem do assistente como elementos React leves,
 * sem `dangerouslySetInnerHTML` e sem dependência de renderizador de Markdown.
 *
 * Regras:
 *  - Linha em branco separa parágrafos.
 *  - Linha que começa com `- `, `* ` ou `N. ` → item de lista (`<ul>`/`<ol>`),
 *    agrupando linhas seguidas do mesmo tipo.
 *  - Linha que começa com `#`..`###` → parágrafo em negrito (sem tag de título).
 *  - `**x**` → `<strong>`, `` `x` `` → `<code>` com fundo discreto.
 *  - `_x_`/`*x*` só fora de palavra → `<em>` (mesma regra de
 *    `markdownParaTextoSimples`, para não estragar `fn_user_org_ids()`).
 *  - `[texto](url)` mostra só o texto (não vira `<a>`: texto da IA é dado,
 *    não link clicável escolhido por ela).
 *  - Todo restante vira nó de texto do React (escapado): `<script>`,
 *    `<img onerror>` etc. aparecem como texto, nunca como elemento.
 */
export function TextoDoAssistente({ texto }: { texto: string }): React.ReactNode {
  // Normaliza todas as quebras de linha (\r\n, \r, \n) para \n antes de processar.
  const linhas = texto.replace(/\r\n|\r/g, "\n").split("\n");

  const elementos: React.ReactNode[] = [];
  let i = 0;

  while (i < linhas.length) {
    const linha = linhas[i];
    if (!linha) {
      i++;
      continue;
    }
    const trim = linha.trim();

    // Linha em branco: apenas avança (separador de parágrafo/bloco).
    if (trim === "") {
      i++;
      continue;
    }

    // Verifica se é linha de lista.
    const ehListaUL = /^[-*]\s+/.test(trim);
    const ehListaOL = /^\d+\.\s+/.test(trim);

    if (ehListaUL || ehListaOL) {
      // Agrupa linhas de lista consecutivas do mesmo tipo.
      const tipo = ehListaUL ? "ul" : "ol";
      const itens: React.ReactNode[] = [];

      while (i < linhas.length) {
        const l = linhas[i];
        if (!l) break;
        const t2 = l.trim();
        if (t2 === "") break;
        if (tipo === "ul" && !/^[-*]\s+/.test(t2)) break;
        if (tipo === "ol" && !/^\d+\.\s+/.test(t2)) break;

        const conteudo = t2.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
        itens.push(
          <li key={itens.length} className="ml-2">
            {processarInline(conteudo)}
          </li>,
        );
        i++;
      }

      elementos.push(
        tipo === "ul" ? (
          <ul className="list-disc ml-4" key={`ul-${elementos.length}`}>
            {itens}
          </ul>
        ) : (
          <ol className="list-decimal ml-4" key={`ol-${elementos.length}`}>
            {itens}
          </ol>
        ),
      );
      continue;
    }

    // Não é lista: é um parágrafo (ou heading → parágrafo em negrito).
    if (/^#{1,6}\s/.test(trim)) {
      elementos.push(
        <p key={`p-${elementos.length}`} className="font-bold">
          {processarInline(trim.replace(/^#{1,6}\s+/, ""))}
        </p>,
      );
    } else {
      elementos.push(
        <p key={`p-${elementos.length}`}>{processarInline(trim)}</p>,
      );
    }
    i++;
  }

  return elementos.length > 0 ? elementos : null;
}

/** Processa marcação inline dentro de uma linha/parágrafo. */
function processarInline(texto: string): React.ReactNode {
  const padrao =
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]*\)|(?<!\w)_([^_\n]+)_(?!\w)|(?<!\w)\*([^*\n]+)\*(?!\w))/;
  const match = texto.match(padrao);

  if (!match) {
    return texto; // nó de texto escapado pelo React
  }

  const completo = match[0]!;
  const indice = texto.indexOf(completo);
  const antes = texto.slice(0, indice);
  const depois = texto.slice(indice + completo.length);

  let elemento: React.ReactNode;

  if (completo.startsWith("**") && completo.endsWith("**")) {
    elemento = <strong key="s">{processarInline(completo.slice(2, -2))}</strong>;
  } else if (completo.startsWith("`") && completo.endsWith("`")) {
    elemento = (
      <code key="c" className="bg-muted px-1 rounded text-xs">
        {processarInline(completo.slice(1, -1))}
      </code>
    );
  } else if (completo.startsWith("[")) {
    // Link: mostra só o texto, não vira <a>.
    const textoLink = completo.match(/\[([^\]]+)\]\(/)?.[1] ?? completo;
    elemento = processarInline(textoLink);
  } else if (completo.startsWith("_")) {
    elemento = <em key="e">{processarInline(completo.slice(1, -1))}</em>;
  } else {
    elemento = <em key="e">{processarInline(completo.slice(1, -1))}</em>;
  }

  return [antes && antes, elemento, processarInline(depois)].filter(Boolean);
}
