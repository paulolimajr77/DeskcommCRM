"use client";

import { ChatDoAssistente } from "@/components/assistente/ChatDoAssistente";
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
 * ─── UMA CONVERSA SÓ, SEM ABAS (decisão do dono, 18/10/2026) ─────────────────
 *
 * Havia três abas — "Conversa", "Propostas" e "Auditoria" — e o defeito era de
 * desenho: a pessoa perguntava na conversa, a resposta ficava numa aba e a
 * decisão em outra. Agora tudo acontece DENTRO da conversa: proposta é cartão
 * com Aplicar/Não, checkup é cartão com o retrato da configuração, e as
 * pendências são anunciadas quando o administrador abre o painel. Sobrou uma
 * superfície, e é por isso que este componente não tem mais estado.
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
  // Mudar configuração (agente, roteador, conhecimento, memória, funil,
  // follow-up, modelo) é decisão de administrador. A tela usa isto para NÃO
  // oferecer o que a pessoa não pode decidir — e o comando `/pendentes` e a
  // rota de propostas recusam de novo, NO SERVIDOR, com o papel da sessão.
  const ehAdmin = org?.role === "admin";
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
      <ChatDoAssistente
        aberto={aberto}
        ehAdmin={ehAdmin}
        aoAbrirTela={() => {
          // No celular o painel cobre a tela: sem sair da frente, a pessoa clicaria
          // em "Abrir X" e não veria nada acontecer. No desktop ele fica onde está.
          if (ehCelular) fechar();
        }}
      />
    </aside>
  );
}
