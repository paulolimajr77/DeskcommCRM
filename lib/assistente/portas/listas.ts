/**
 * Listas únicas de portas proibidas para o assistente interno.
 *
 * Este arquivo NÃO depende do catálogo (`catalogo.gerado.ts`), para que o
 * gerador (`scripts/gerar-catalogo-de-portas.ts`) e as regras
 * (`lib/assistente/portas/regras.ts`) possam importar dele sem criar ciclo
 * de importação.
 */

export type Metodo = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Verdadeiro quando `id` é exatamente `prefixo` sem a barra final, ou começa
 * com `prefixo`. Evita que "team/" caia fora da raiz "team".
 */
export function casaComPrefixo(id: string, prefixo: string): boolean {
  const semBarra = prefixo.endsWith("/") ? prefixo.slice(0, -1) : prefixo;
  return id === semBarra || id.startsWith(prefixo);
}

/**
 * Prefixos de caminho (já normalizados, sem `/api/v1/`) cujo acesso é sempre
 * recusado, para leitura e escrita.
 *
 * Motivo de cada bloco:
 * - `cron/`, `admin/`, `auth/`, `webhooks/`, `webhook-sources/`, `lgpd/`,
 *   `mcp/`, `system/`, `tenants/`, `onboarding/`, `extensions/`, `health/`
 *   → superfícies de plataforma, infra, webhook de entrada, LGPD,
 *   autenticação, administração de tenant e provisionamento.
 * - `ai/credentials/` → chaves e credenciais de integração da IA.
 * - `settings/api-tokens/` → chaves/credenciais de integração fora de
 *   `ai/credentials/` (tokens `dsk_` de API).
 *
 * `messages/`, `campaigns/` e `team/` saíram daqui: a LEITURA delas é
 * liberada (estão em AREAS_SO_LEITURA). Só a escrita fica barrada.
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
  "settings/api-tokens/",
] as const;

/**
 * Portas exatas (ids normalizados) que nunca são lidas nem escritas, nem
 * entram na lista branca. Comentário do motivo:
 * - `team/invites`: o GET devolve `accept_url`, e quem tem o link entra na
 *   organização.
 * - `messages/:id/media`: o GET redireciona para uma URL assinada do storage,
 *   que não serve ao assistente e não deve ir ao modelo.
 * - `contacts/export`: exporta a base inteira com CPF decifrado
 *   (`decrypt_cpf`).
 * - `contacts/:id/avatar`: redireciona para uma URL assinada do storage.
 * - `conversations/:id/notes/:noteId/media`: redireciona para uma URL
 *   assinada do storage.
 */
export const PORTAS_PROIBIDAS: readonly string[] = [
  "team/invites",
  "messages/:id/media",
  "contacts/export",
  "contacts/:id/avatar",
  "conversations/:id/notes/:noteId/media",
] as const;

/**
 * Sufixos de caminho (OAuth: ida e volta) cujo acesso é sempre recusado.
 * Porta de conectar conta externa nunca é do assistente; chave só pela tela.
 * Aplicado com `id.endsWith(sufixo)`.
 */
export const SUFIXOS_PROIBIDOS: readonly string[] = ["/connect", "/callback"] as const;

/**
 * Verdadeiro se `id` é proibido: casa com algum prefixo proibido, é uma porta
 * proibida exata ou termina com algum sufixo proibido.
 */
export function ehProibida(id: string): boolean {
  return (
    PREFIXOS_PROIBIDOS.some((p) => casaComPrefixo(id, p)) ||
    PORTAS_PROIBIDAS.includes(id) ||
    SUFIXOS_PROIBIDOS.some((s) => id.endsWith(s))
  );
}

/**
 * Áreas cuja LEITURA é liberada mas a ESCRITA é NUNCA permitida, mesmo que
 * alguém ponha a porta na lista branca. Motivo:
 * - `messages/` → envio de mensagem outbound (ação irreversível para o
 *   cliente).
 * - `campaigns/` → disparo de campanha (ação em massa, irreversível).
 * - `team/` → convite, mudança de papel e remoção de pessoas da equipe.
 */
export const AREAS_SO_LEITURA: readonly string[] = [
  "messages/",
  "campaigns/",
  "team/",
] as const;

/**
 * Porta branca de escrita. Preenchida com os 26 pares aprovados pelo Paulo.
 * Cada entrada deve existir no `CATALOGO_DE_PORTAS` com aquele método.
 * Nenhum DELETE entra aqui.
 */
export const ESCRITA_PERMITIDA: readonly {
  porta: string;
  metodo: "POST" | "PATCH" | "PUT";
  descricao: string;
}[] = [
  { porta: "ai/agents", metodo: "POST", descricao: "criar agente" },
  { porta: "ai/agents/:id", metodo: "PATCH", descricao: "alterar agente" },
  { porta: "ai/routers", metodo: "POST", descricao: "criar roteador" },
  { porta: "ai/routers/:id", metodo: "PATCH", descricao: "alterar roteador" },
  { porta: "ai/memory", metodo: "POST", descricao: "salvar nova versão da memória da empresa" },
  { porta: "ai/knowledge/sources", metodo: "POST", descricao: "cadastrar material de conhecimento" },
  { porta: "ai/knowledge/sources/:id", metodo: "PATCH", descricao: "alterar material de conhecimento" },
  { porta: "pipelines", metodo: "POST", descricao: "criar funil" },
  { porta: "pipelines/:id", metodo: "PATCH", descricao: "alterar funil" },
  { porta: "pipelines/:id/stages", metodo: "POST", descricao: "criar etapa do funil" },
  { porta: "pipelines/:id/stages/:stageId", metodo: "PATCH", descricao: "alterar etapa do funil" },
  { porta: "tags/vocabulario", metodo: "POST", descricao: "alterar a lista de etiquetas" },
  { porta: "contacts/:id", metodo: "PATCH", descricao: "alterar dados do contato (inclusive arquivar)" },
  { porta: "contacts/:id/personal", metodo: "POST", descricao: "marcar contato como pessoal" },
  { porta: "leads", metodo: "POST", descricao: "criar negócio" },
  { porta: "leads/:id", metodo: "PATCH", descricao: "alterar negócio" },
  { porta: "leads/:id/move", metodo: "POST", descricao: "mudar o negócio de etapa" },
  { porta: "ai/followup-flows", metodo: "POST", descricao: "criar fluxo de follow-up" },
  { porta: "ai/followup-flows/:id", metodo: "PATCH", descricao: "alterar fluxo de follow-up" },
  { porta: "tasks", metodo: "POST", descricao: "criar tarefa" },
  { porta: "tasks/:id", metodo: "PATCH", descricao: "alterar tarefa" },
  { porta: "agenda/agendamentos", metodo: "POST", descricao: "criar agendamento" },
  { porta: "agenda/agendamentos", metodo: "PATCH", descricao: "alterar agendamento" },
  { porta: "agenda/configuracao", metodo: "PATCH", descricao: "alterar configuração da agenda" },
  { porta: "campaign-templates", metodo: "POST", descricao: "criar rascunho de campanha" },
  { porta: "campaign-templates/:id", metodo: "PATCH", descricao: "alterar rascunho de campanha" },
] as const;
