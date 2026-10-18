"use client";

import {
  ID_DO_BOTAO_DO_ASSISTENTE,
  ID_DO_PAINEL_DO_ASSISTENTE,
  useAssistentePainel,
} from "@/components/assistente/AssistentePainelProvider";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { Robot } from "@/lib/ui/icons";

/**
 * O ícone de IA do cabeçalho (spec 2026-10-14, F1b): abre e fecha o painel do
 * assistente, em qualquer página — não leva a lugar nenhum.
 *
 * Aparece quando há organização ativa: o papel mínimo do assistente é `viewer`,
 * que toda sessão com organização tem, e a rota do chat é quem aplica o papel
 * de verdade. O botão não depende mais do catálogo de navegação, porque o
 * assistente deixou de ser uma tela.
 */
export function BotaoDoAssistente() {
  const { activeOrg } = useAuth();
  const painel = useAssistentePainel();
  if (activeOrg === null || painel === null) return null;
  return <BotaoVisivel aberto={painel.aberto} alternar={painel.alternar} />;
}

function BotaoVisivel({ aberto, alternar }: { aberto: boolean; alternar: () => void }) {
  const t = useT();

  return (
    <button
      type="button"
      id={ID_DO_BOTAO_DO_ASSISTENTE}
      onClick={alternar}
      aria-label={t("Assistente")}
      aria-expanded={aberto}
      aria-controls={ID_DO_PAINEL_DO_ASSISTENTE}
      data-testid="assistente-link"
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-9 lg:w-9"
    >
      <Robot size={18} aria-hidden />
    </button>
  );
}
