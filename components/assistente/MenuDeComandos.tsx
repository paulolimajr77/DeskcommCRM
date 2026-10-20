"use client";

import { useT } from "@/hooks/i18n/useT";
import type { LinhaDaAjuda } from "@/lib/assistente/comandos";
import { cn } from "@/lib/utils";

/**
 * O MENU DE COMANDOS do campo de pergunta (decisão do dono, 18/10/2026).
 *
 * Digitar "/" abre a lista com os comandos e UMA linha de explicação para cada;
 * as setas andam, Enter escolhe. Digitar o comando inteiro também funciona — o
 * menu é atalho, não pedágio: quem sabe o nome digita e envia.
 *
 * A lista chega PRONTA do chamador, já filtrada pelo papel: o menu de quem não é
 * administrador não mostra `/pendentes`. Isso é conveniência — quem decide é o
 * servidor, que responde a mesma coisa para o comando digitado à mão.
 */
export function MenuDeComandos({
  linhas,
  indice,
  aoEscolher,
}: {
  linhas: LinhaDaAjuda[];
  /** Qual linha está destacada (o índice já vem limitado pela lista). */
  indice: number;
  aoEscolher: (comando: string) => void;
}) {
  const t = useT();
  return (
    <ul
      role="listbox"
      aria-label={t("Comandos")}
      data-testid="assistente-menu-comandos"
      className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border bg-background p-1 shadow-md"
    >
      {linhas.map((linha, i) => (
        <li
          key={linha.comando}
          role="option"
          aria-selected={i === indice}
          data-testid={`assistente-comando-${linha.comando}`}
          // `onMouseDown` (e não `onClick`): o clique tira o foco do campo, e o
          // `blur` fecharia o menu antes do clique chegar. Prevenir o padrão
          // mantém o foco onde a pessoa estava digitando.
          onMouseDown={(e) => {
            e.preventDefault();
            aoEscolher(linha.comando);
          }}
          className={cn(
            "flex cursor-pointer flex-col gap-0.5 rounded-sm px-2 py-1.5 text-sm",
            i === indice ? "bg-muted" : "hover:bg-muted/60",
          )}
        >
          <span className="font-medium">{`/${linha.comando}`}</span>
          <span className="text-xs text-text-muted">{linha.explicacao}</span>
        </li>
      ))}
    </ul>
  );
}
