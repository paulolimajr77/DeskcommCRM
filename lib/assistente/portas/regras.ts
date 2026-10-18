/**
 * Regras de leitura e escrita do catálogo de portas do assistente interno.
 *
 * Nenhuma porta de escrita está liberada por padrão: `ESCRITA_PERMITIDA` começa
 * vazia e só será preenchida depois que o Paulo aprovar a `LISTA-BRANCA-PROPOSTA`.
 * Até lá, `escritaPermitida()` retorna sempre `false`.
 */

import type { Metodo, PortaDoCatalogo } from "./tipos";
import { CATALOGO_DE_PORTAS } from "./catalogo.gerado";

/**
 * Prefixos de caminho (já normalizados, sem `/api/v1/`) cuja leitura é sempre
 * recusada, independentemente do método.
 *
 * Motivo de cada bloco:
 * - `cron/`, `admin/`, `auth/`, `webhooks/`, `webhook-sources/`, `lgpd/`,
 *   `mcp/`, `system/`, `tenants/`, `onboarding/`, `extensions/`, `health/`
 *   → superfícies de plataforma, infra, webhook de entrada, LGPD, autenticação,
 *   administração de tenant e provisionamento. Nunca são dados do dia a dia da
 *   organização que o assistente operador precisa ler.
 * - `ai/credentials/` → chaves e credenciais de integração da IA.
 * - `messages/` → envio de mensagem outbound (ação irreversível para o cliente).
 * - `campaigns/` → disparo de campanha (ação em massa, irreversível).
 * - `team/` → convite, mudança de papel e remoção de pessoas da equipe.
 * - `settings/api-tokens/` → chaves/credenciais de integração fora de
 *   `ai/credentials/` (tokens `dsk_` de API).
 */
export const PREFIXOS_PROIBIDOS: readonly string[] = [
  "cron/",
  "admin/",
  "auth/",
  "webhooks/",
  "webhook-sources/",
  "lgpd/",
  "ai/credentials/",
  "mcp/",
  "system/",
  "tenants/",
  "onboarding/",
  "extensions/",
  "health/",
  "messages/",
  "campaigns/",
  "team/",
  "settings/api-tokens/",
] as const;

/**
 * Porta branca de escrita. COMEÇA VAZIA. Não preencher até o Paulo aprovar a
 * `LISTA-BRANCA-PROPOSTA` (entregue no relatório da Tarefa 1, não no repo).
 * Cada entrada deve existir no `CATALOGO_DE_PORTAS` com aquele método.
 */
export const ESCRITA_PERMITIDA: readonly {
  porta: string;
  metodo: "POST" | "PATCH" | "PUT";
  descricao: string;
}[] = [];

/**
 * Verdadeiro se `id` existe no catálogo, expõe `GET` e não começa com um
 * prefixo proibido.
 */
export function portaDeLeituraPermitida(id: string): boolean {
  const porta = CATALOGO_DE_PORTAS.find((p) => p.id === id);
  if (!porta) return false;
  if (!porta.metodos.includes("GET")) return false;
  return !PREFIXOS_PROIBIDOS.some((prefixo) => id.startsWith(prefixo));
}

/**
 * Verdadeiro se a escrita em `id` com `metodo` é permitida.
 *
 * `DELETE` é sempre recusado (sem exceção). Para `POST`/`PATCH`/`PUT` só vale
 * se a entrada constar de `ESCRITA_PERMITIDA` e a porta não for proibida.
 */
export function escritaPermitida(
  id: string,
  metodo: Metodo,
): boolean {
  if (metodo === "DELETE") return false;
  if (metodo !== "POST" && metodo !== "PATCH" && metodo !== "PUT") return false;
  if (PREFIXOS_PROIBIDOS.some((prefixo) => id.startsWith(prefixo))) return false;
  return ESCRITA_PERMITIDA.some(
    (e) => e.porta === id && e.metodo === metodo,
  );
}
