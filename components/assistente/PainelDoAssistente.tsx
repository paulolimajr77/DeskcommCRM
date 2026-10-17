"use client";

import { useCallback, useState } from "react";

import { ChatDoAssistente } from "@/components/assistente/ChatDoAssistente";
import { PropostasDoAssistente } from "@/components/assistente/PropostasDoAssistente";
import { AuditoriaDoAssistente } from "@/components/assistente/AuditoriaDoAssistente";
import {
  ID_DO_PAINEL_DO_ASSISTENTE,
  useAssistentePainel,
} from "@/components/assistente/AssistentePainelProvider";
import { useEhCelular } from "@/components/assistente/useEhCelular";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * O painel lateral do assistente — a ÚNICA superfície dele (decisão do dono,
 * 14/10/2026; spec 2026-10-14, F1b, "Painel que acompanha a pessoa").
 *
 * ─── Montado SEMPRE ─────────────────────────────────────────────────────────
 *
 * Fechado, ele fica escondido (`hidden`, `inert`), e não desmontado: a conversa,
 * a rolagem e o texto digitado sobrevivem a fechar, reabrir e trocar de página.
 * É irmão da coluna de conteúdo dentro do `AppShell`, e componente do layout não
 * desmonta quando só a página muda (o `VoiceCallProvider` já depende disso).
 *
 * ─── Dois jeitos de ocupar a tela ───────────────────────────────────────────
 *
 *  - de `md` para cima: coluna à direita, 24rem, na altura da janela, na linha
 *    do flex da casca — abre AO LADO da tela e o conteúdo encolhe, nada fica coberto;
 *  - abaixo de `md`: tela cheia (`fixed`), com o fundo ACIMA da faixa que as
 *    peças fixas do rodapé ocupam (`--rodape-ocupado`, contrato de
 *    `lib/ui/rodape-ocupado.tsx`). É a mesma variável que o `<main>` desconta:
 *    a barra de abas e o painel de chamada continuam à vista e clicáveis, e
 *    esta peça não escreve medida de rodapé nenhuma por conta própria.
 *
 * O papel acompanha o jeito: `complementary` ao lado da tela, `dialog` quando
 * cobre tudo. `Escape` fecha só no celular — no desktop o painel é uma coluna
 * de trabalho, e fechá-lo no meio de uma frase seria perder o lugar.
 */
export function PainelDoAssistente() {
  const t = useT();
  const painel = useAssistentePainel();
  const ehCelular = useEhCelular();
  const org = useActiveOrg();
  // A fila de propostas é decisão de admin (escrita só admin): quem não é
  // admin não vê a aba NEM o contador — a trava real continua nas rotas.
  const ehAdmin = org?.role === "admin";
  const [aba, setAba] = useState<"conversa" | "propostas" | "auditoria">("conversa");
  const [pendentes, setPendentes] = useState(0);
  const [rascunho, setRascunho] = useState<{ texto: string; n: number } | null>(null);
  const aoPedirAoAssistente = useCallback((texto: string) => {
    setRascunho((atual) => ({ texto, n: (atual?.n ?? 0) + 1 }));
    setAba("conversa");
  }, []);
  const aoContarPendentes = useCallback((n: number) => setPendentes(n), []);
  if (painel === null) return null;
  const { aberto, fechar } = painel;

  return (
    <aside
      id={ID_DO_PAINEL_DO_ASSISTENTE}
      // Fechado, sem papel nenhum: um `dialog` escondido no DOM duplica o diálogo de
      // qualquer outra tela para quem o procura por `[role=dialog]` (e2e da agenda, celular).
      role={aberto ? (ehCelular ? "dialog" : "complementary") : undefined}
      aria-label={t("Assistente")}
      data-testid="assistente-painel"
      // Clicar em área sem foco (lista, cabeçalho) leva o foco para o próprio painel, e não
      // para o `body`: assim o Escape do celular chega a este `onKeyDown`.
      tabIndex={-1}
      hidden={!aberto}
      inert={!aberto}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ehCelular) {
          e.stopPropagation();
          fechar();
        }
      }}
      className={cn(
        aberto ? "flex" : "hidden",
        "flex-col bg-background outline-hidden",
        "fixed inset-x-0 top-0 bottom-[var(--rodape-ocupado,0px)] z-40",
        "md:sticky md:inset-x-auto md:top-0 md:bottom-auto md:z-auto md:h-dvh md:w-96 md:shrink-0 md:self-start md:border-l",
      )}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="text-sm font-semibold">{t("Assistente")}</h2>
        <button
          type="button"
          onClick={fechar}
          aria-label={t("Fechar")}
          data-testid="assistente-fechar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={16} aria-hidden />
        </button>
      </header>
      {ehAdmin ? (
        <div role="tablist" aria-label={t("Seções do assistente")} className="flex shrink-0 gap-1 border-b px-3">
          <button
            type="button"
            role="tab"
            aria-selected={aba === "conversa"}
            onClick={() => setAba("conversa")}
            data-testid="assistente-aba-conversa"
            className="border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground aria-selected:border-foreground aria-selected:text-foreground"
          >
            {t("Conversa")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === "propostas"}
            onClick={() => setAba("propostas")}
            data-testid="assistente-aba-propostas"
            className="inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground aria-selected:border-foreground aria-selected:text-foreground"
          >
            {t("Propostas")}
            {pendentes > 0 ? (
              <span
                data-testid="assistente-propostas-contador"
                className="rounded-full bg-destructive px-1.5 py-0.5 text-xs font-medium text-destructive-foreground"
              >
                {pendentes}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === "auditoria"}
            onClick={() => setAba("auditoria")}
            data-testid="assistente-aba-auditoria"
            className="inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground aria-selected:border-foreground aria-selected:text-foreground"
          >
            {t("Auditoria")}
          </button>
        </div>
      ) : null}
      <div className={cn("flex min-h-0 flex-1 flex-col", (!ehAdmin || aba === "conversa") ? "flex" : "hidden")}>
        <ChatDoAssistente
          aberto={aberto}
          rascunho={rascunho}
          aoAbrirTela={() => {
            // No celular o painel cobre a tela: sem sair da frente, a pessoa clicaria
            // em "Abrir X" e não veria nada acontecer. No desktop ele fica onde está.
            if (ehCelular) fechar();
          }}
        />
      </div>
      {ehAdmin ? (
        <div className={cn("flex min-h-0 flex-1 flex-col", aba === "propostas" ? "flex" : "hidden")}>
          <PropostasDoAssistente aberto={aberto} aoContarPendentes={aoContarPendentes} />
        </div>
      ) : null}
      {ehAdmin ? (
        <div className={cn("flex min-h-0 flex-1 flex-col", aba === "auditoria" ? "flex" : "hidden")}>
          <AuditoriaDoAssistente aberto={aberto} ehAdmin={ehAdmin} aoPedir={aoPedirAoAssistente} />
        </div>
      ) : null}
    </aside>
  );
}
