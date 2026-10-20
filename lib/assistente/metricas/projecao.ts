/**
 * Projeção por LISTA POSITIVA de campos e varredura de chaves proibidas.
 *
 * Duas camadas, porque cada uma cobre um erro diferente:
 * 1. O esquema Zod NÃO-ESTRITO REMOVE o que não declara — é a lista positiva.
 *    Quando o formato da rota muda e o `parse` falha, o resultado é
 *    `{ ok: false }` e o adaptador responde indisponível com detalhe
 *    genérico, sem ecoar o conteúdo.
 * 2. A varredura é o cinto por cima do suspensório: se uma chave proibida
 *    sobreviver à projeção, é BUG DO ESQUEMA — o adaptador loga e responde
 *    indisponível. Nada vaza ao modelo por esquecimento.
 */
import { z } from "zod";

/** Faz o `parse` devolvendo união simples — nunca lança. */
export function projetar<T>(esquema: z.ZodType<T>, valor: unknown): { ok: true; dados: T } | { ok: false } {
  const resultado = esquema.safeParse(valor);
  return resultado.success ? { ok: true, dados: resultado.data } : { ok: false };
}

/**
 * Chaves cujo NOME, exato, nunca pode alcançar o modelo: identificação e
 * contato de cliente, texto cru de mensagem, e remuneração por pessoa.
 */
export const CHAVES_PROIBIDAS: ReadonlySet<string> = new Set([
  "email",
  "phone",
  "phone_number",
  "telefone",
  "cpf",
  "cnpj",
  "body",
  "last_message_preview",
  "contatoNome",
  "contact_name",
  "display_name",
  "negocioTitulo",
  "lead_title",
  "contact_id",
  "contatoId",
  "attendant_user_id",
  "user_id",
  "name",
  "reason",
  "notes",
  "motivo_livre",
  "owner_user_id",
  "stage_id",
  "userId",
  "agentId",
  "channel_name",
  "lost_reason",
  "motivo",
]);

/**
 * Varre o valor já PROJETADO em profundidade e devolve as chaves proibidas
 * que sobreviveram (ordenadas, sem repetição). Objetos e listas em qualquer
 * aninhamento; ciclos cortados pelo conjunto de visitados.
 */
export function chavesProibidasEm(valor: unknown): string[] {
  const achadas = new Set<string>();
  const visitados = new WeakSet<object>();
  const visita = (no: unknown): void => {
    if (no === null || typeof no !== "object") return;
    if (visitados.has(no)) return;
    visitados.add(no);
    if (Array.isArray(no)) {
      for (const item of no) visita(item);
      return;
    }
    for (const [chave, filho] of Object.entries(no)) {
      if (CHAVES_PROIBIDAS.has(chave)) achadas.add(chave);
      visita(filho);
    }
  };
  visita(valor);
  return [...achadas].sort();
}
