import { customFieldSchema, type CustomFieldDef } from "@/lib/schemas/settings";

/** Lê `pipelines.settings.fields` sem explodir se o jsonb estiver velho ou vazio. */
export function camposDoFunil(settings: Record<string, unknown> | null | undefined): CustomFieldDef[] {
  if (!settings) return [];
  const raw = settings.fields;
  if (!Array.isArray(raw)) return [];
  const out: CustomFieldDef[] = [];
  for (const item of raw) {
    const parsed = customFieldSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * O embed `crm_pipelines(settings)` do PostgREST vem objeto (FK to-one) ou,
 * se a relação vacilar, array. Os dois caem aqui — lixo vira `null`.
 */
export function settingsDoEmbed(embed: unknown): Record<string, unknown> | null {
  const alvo = Array.isArray(embed) ? embed[0] : embed;
  if (!alvo || typeof alvo !== "object") return null;
  const settings = (alvo as { settings?: unknown }).settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  return settings as Record<string, unknown>;
}

/**
 * O QUE FALTA PREENCHER, por CHAVE — nunca por valor.
 *
 * Existe para a passagem ao humano (`lib/ai/handoff/orchestrator.ts`) poder
 * DECLARAR o que ficou em branco. Quem recebe a conversa vê o que falta antes
 * de abrir a boca, em vez de descobrir no meio do atendimento.
 *
 * ## ⛔ ELA NÃO TRAVA NADA, E ISSO É DESENHO
 *
 * A função só informa. Segurar a passagem porque falta um campo transformaria
 * proteção de dado em parede na frente do cliente — e o motivo mais comum de
 * handoff é `requested_human`, que é a pessoa PEDINDO gente. Fazer o cliente
 * esperar porque o robô não descobriu o convênio é o pior atendimento
 * possível, e seria culpa de uma decisão nossa, não dele.
 *
 * ## Só CHAVES saem daqui
 *
 * O retorno vai para o `metadata` de uma atividade, que é renderizada na tela e
 * viaja em captura, exportação e ticket de suporte. §9: nada de PII nova em
 * log, reason ou evidence. Quem quiser o valor abre a ficha, sob RLS.
 *
 * ## O que conta como "em branco"
 *
 * Ausente, `null`, string vazia ou só espaços, e lista vazia. `false` e `0`
 * NÃO contam: alguém escolheu — "tem convênio? não" e "quantos funcionários? 0"
 * são respostas, e cobrá-las de novo faria o atendente perguntar o que o
 * cliente já respondeu.
 */
export function obrigatoriosEmBranco(
  campos: CustomFieldDef[],
  valores: Record<string, unknown> | null | undefined,
): string[] {
  const atuais = valores ?? {};
  return campos
    .filter((c) => c.required === true)
    .filter((c) => {
      const v = atuais[c.key];
      if (v === undefined || v === null) return true;
      if (typeof v === "string") return v.trim() === "";
      if (Array.isArray(v)) return v.length === 0;
      // Objeto sem chave nenhuma é ausência com outra roupa — um `select`
      // múltiplo que ninguém marcou, por exemplo. `false` e `0` NÃO caem aqui
      // porque não são objeto, e continuam valendo como resposta.
      if (typeof v === "object") return Object.keys(v as object).length === 0;
      return false;
    })
    .map((c) => c.key);
}
