"use client";

import { useSyncExternalStore } from "react";

/** Abaixo de `md` (768px) o painel é tela cheia; de `md` para cima, coluna ao lado da tela. */
const CONSULTA_DESKTOP = "(min-width: 768px)";

function assinar(aoMudar: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const lista = window.matchMedia(CONSULTA_DESKTOP);
  lista.addEventListener("change", aoMudar);
  return () => lista.removeEventListener("change", aoMudar);
}

function instantaneo(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia(CONSULTA_DESKTOP).matches;
}

/**
 * A largura é de celular? No servidor e na hidratação devolve `false`
 * (`useSyncExternalStore` usa o snapshot do servidor ali), então o primeiro
 * render nunca diverge do HTML; o valor real entra logo depois.
 */
export function useEhCelular(): boolean {
  return useSyncExternalStore(assinar, instantaneo, () => false);
}
