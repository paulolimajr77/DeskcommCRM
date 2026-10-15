"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * O estado do painel do assistente: aberto ou fechado, e mais nada.
 *
 * O painel é a ÚNICA superfície do assistente (decisão do dono, 14/10/2026):
 * não existe página em tela cheia. Quem abre — o ícone do topo e o item do ⌘K —
 * fala com o MESMO painel por este contexto, e é por isso que o provedor mora
 * no `AppShell`, acima da `TopBar`, da paleta e do painel.
 *
 * Só o `aberto` vive aqui. A conversa, a rolagem e o texto digitado vivem no
 * `ChatDoAssistente`, que fica montado enquanto o shell existir (o painel
 * fechado é só escondido); por isso trocar de página não os perde.
 */

/** O `id` do botão do topo: para onde o foco volta quando o painel fecha e não há outro lugar. */
export const ID_DO_BOTAO_DO_ASSISTENTE = "assistente-botao";

/** O `id` do painel: o `aria-controls` do botão do topo aponta para ele. */
export const ID_DO_PAINEL_DO_ASSISTENTE = "assistente-painel";

export interface PainelDoAssistente {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
  alternar: () => void;
}

const PainelCtx = createContext<PainelDoAssistente | null>(null);

export function AssistentePainelProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  // Quem tinha o foco quando o painel abriu: ao fechar, o foco volta para lá.
  const anterior = useRef<HTMLElement | null>(null);
  // Espelho de `aberto` para `abrir` ler sem depender dele: abrir de novo, com o painel
  // já aberto (⌘K), não pode trocar a origem do foco pelo campo da paleta que vai sumir.
  const abertoAgora = useRef(false);

  const abrir = useCallback(() => {
    if (
      !abertoAgora.current &&
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
    ) {
      anterior.current = document.activeElement;
    }
    abertoAgora.current = true;
    setAberto(true);
  }, []);

  const fechar = useCallback(() => {
    abertoAgora.current = false;
    setAberto(false);
    if (typeof document === "undefined") return;
    // Depois deste ciclo: o painel ainda está visível nele, e foco em elemento
    // escondido não vale. Se quem abriu já saiu da tela (a paleta ⌘K se
    // desmonta), o foco volta para o botão do topo.
    window.setTimeout(() => {
      const origem = anterior.current;
      anterior.current = null;
      const alvo =
        origem !== null && origem.isConnected
          ? origem
          : document.getElementById(ID_DO_BOTAO_DO_ASSISTENTE);
      alvo?.focus();
    }, 0);
  }, []);

  const alternar = useCallback(() => {
    if (aberto) fechar();
    else abrir();
  }, [aberto, abrir, fechar]);

  const valor = useMemo(
    () => ({ aberto, abrir, fechar, alternar }),
    [aberto, abrir, fechar, alternar],
  );
  return <PainelCtx.Provider value={valor}>{children}</PainelCtx.Provider>;
}

/**
 * Fora do provedor devolve `null` e não lança: a paleta ⌘K e o botão do topo são
 * montados em testes isolados, e sem painel não há o que abrir — nesse caso eles
 * simplesmente não oferecem a porta.
 */
export function useAssistentePainel(): PainelDoAssistente | null {
  return useContext(PainelCtx);
}
