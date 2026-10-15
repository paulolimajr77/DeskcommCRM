import { z } from "zod";
export const textoAte = (n: number) => z.string().transform((s) => s.slice(0, n));
const PERIGOSAS = new Set(["__proto__", "constructor", "prototype"]);
export function semChavesPerigosas<V>(registro: Record<string, V>): Record<string, V> {
  return Object.fromEntries(Object.entries(registro).filter(([k]) => !PERIGOSAS.has(k)));
}
