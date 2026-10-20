"use client";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

/** Um item da leitura da configuração, tal como a rota da auditoria devolve. */
export interface ItemDoCheckupNaTela {
  id: string;
  estado: string;
  titulo: string;
  por_que: string;
  ferramenta: string | null;
  depende_de: string[];
  onde_resolver: string;
}

/** Um retrato salvo da configuração. */
export interface RetratoNaTela {
  id: string;
  taken_at: string;
  pendencias: number;
  itens: ItemDoCheckupNaTela[];
}

/** Frase do estado para leigo. */
function fraseDoEstado(t: (texto: string) => string, estado: string): string {
  switch (estado) {
    case "preenchido":
      return t("Pronto");
    case "posso_completar":
      return t("Posso completar");
    case "preciso_confirmar":
      return t("Preciso confirmar");
    case "nao_se_aplica":
      return t("Não se aplica");
    default:
      return estado;
  }
}

/** Cor de destaque do estado. */
function corDoEstado(estado: string): string {
  switch (estado) {
    case "preenchido":
      return "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20";
    case "posso_completar":
      return "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20";
    case "preciso_confirmar":
      return "text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20";
    default:
      return "text-slate-500 bg-slate-50 dark:text-slate-400 dark:bg-slate-900/20";
  }
}

/**
 * O CARTÃO DO CHECKUP DENTRO DA CONVERSA (decisão do dono, 18/10/2026).
 *
 * O `/checkup` devolve este cartão como mensagem: a contagem por estado, a
 * comparação com a rodada anterior e a lista item a item. Cada item de
 * "Posso completar" tem dois caminhos, e é de propósito que os dois existem:
 *
 *  - **Resolver** leva à tela onde a pessoa resolve (a mesma rota que a aba
 *    antiga usava) — para quem quer fazer à mão;
 *  - **Pedir ao assistente** deixa a frase pronta no campo do chat. É o caminho
 *    que vira CARTAO de proposta: o modelo chama `propor_*`, o cartão chega na
 *    conversa, e a decisão volta a ser um clique de administrador.
 *
 * Nada aqui decide sozinho: quem rodou a auditoria, o que é pendência e por que
 * é a rota (`verificacoes.ts`/`calcular.ts`) — este componente só desenha.
 */
export function CartaoDeCheckup({
  rodou,
  snapshot,
  anterior,
  aoPedir,
}: {
  /** `true` quando a rodada acabou de acontecer (o POST respondeu). */
  rodou: boolean;
  snapshot: RetratoNaTela;
  /** O retrato anterior, para a frase de comparação. */
  anterior: { id: string; taken_at: string; pendencias: number } | null;
  /** Deixa a frase pronta no campo do chat. */
  aoPedir: (frase: string) => void;
}) {
  const t = useT();

  const itens = snapshot.itens;
  const pendencias = snapshot.pendencias;

  /** Conta por estado. */
  const contagem: Record<string, number> = {};
  for (const i of itens) {
    contagem[i.estado] = (contagem[i.estado] ?? 0) + 1;
  }

  const grupos = [
    { id: "preenchido" as const, label: t("Prontos"), cor: "text-emerald-700" },
    { id: "posso_completar" as const, label: t("Posso completar"), cor: "text-amber-700" },
    { id: "preciso_confirmar" as const, label: t("Preciso confirmar"), cor: "text-orange-700" },
    { id: "nao_se_aplica" as const, label: t("Não se aplica"), cor: "text-slate-500" },
  ];

  const textoEvolucao = anterior
    ? t("Da última vez: {antes} pendência(s); agora: {agora}.")
        .replace("{antes}", String(anterior.pendencias))
        .replace("{agora}", String(pendencias))
    : t("Primeira rodada: {n} pendência(s).").replace("{n}", String(pendencias));

  return (
    <div
      data-testid="assistente-cartao-checkup"
      data-rodou={rodou ? "sim" : "nao"}
      className="flex max-w-full flex-col gap-3 rounded-md border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("Auditoria da empresa")}</h3>
        <span data-testid="checkup-pendencias" className="text-xs font-medium">
          {t("Pendências agora")}: {pendencias}
        </span>
      </div>

      <p className="text-xs text-text-muted">
        {rodou ? t("Rodei a auditoria da configuração.") : t("Esta é a última auditoria da configuração.")}
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {grupos.map((g) => {
          const n = contagem[g.id] ?? 0;
          return (
            <div
              key={g.id}
              data-testid={`auditoria-contagem-${g.id}`}
              className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1.5", g.cor)}
            >
              <span className="font-medium">{n}</span>
              <span>{g.label}</span>
            </div>
          );
        })}
      </div>

      <p data-testid="checkup-evolucao" className="text-xs text-text-muted">
        {textoEvolucao}
      </p>

      <ul className="flex flex-col gap-2">
        {itens.map((i) => {
          const podePedir = i.estado === "posso_completar" && i.ferramenta !== null;
          return (
            <li
              key={i.id}
              data-testid={`auditoria-item-${i.id}`}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-text-muted">{i.titulo}</p>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-xs font-bold",
                      corDoEstado(i.estado),
                    )}
                  >
                    {fraseDoEstado(t, i.estado)}
                  </span>
                </div>
                {i.onde_resolver ? (
                  <a
                    href={i.onde_resolver}
                    className="text-xs text-primary hover:underline"
                    data-testid={`auditoria-resolver-${i.id}`}
                  >
                    {t("Resolver")}
                  </a>
                ) : null}
              </div>
              <p className="text-xs text-text-muted">{i.por_que}</p>
              {podePedir ? (
                <button
                  type="button"
                  onClick={() => aoPedir(`${t("Pode completar isto para mim:")} ${i.titulo}`)}
                  data-testid={`auditoria-pedir-${i.id}`}
                  className="rounded-md border px-3 py-1 text-xs text-primary hover:bg-muted"
                >
                  {t("Pedir ao assistente")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
