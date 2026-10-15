/**
 * O PISO do assistente interno — a resposta fixa, sem modelo, que a rota do
 * chat devolve quando a IA não pode responder (sem chave, limite de gasto,
 * falha do modelo ou texto vazio).
 *
 * É o comportamento da F1, movido da rota SEM mudar: um resumo da operação
 * (três contagens, todas com `organization_id`), um trecho de guia
 * (`assistente-*` via `loadSkills` + `matchSkills`, o mesmo matcher do turno
 * inbound) ou a frase honesta de "ainda não consegui". Ter o piso num módulo
 * próprio deixa a rota enxuta e permite provar as três saídas sozinhas.
 *
 * Leitura pura: nenhuma escrita, nenhuma chamada de modelo. O `orgId` vem da
 * sessão (quem chama é a rota); aqui ele só entra nos `where`.
 */
import { loadSkills, matchSkills } from "@/lib/agent-engine/agent/skills";
import type { Queryable } from "@/lib/agent-engine/queue/queue";

export interface EntradaDoPiso {
  orgId: string;
  pergunta: string;
  /** Tradutor do idioma da pessoa (`traduzir(texto, idioma)`). */
  t: (texto: string) => string;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** A pergunta pede um resumo/contagem da operação? */
export function ehResumo(pergunta: string): boolean {
  const n = normalizar(pergunta);
  return (
    n.includes("resumo") || (n.includes("quant") && (n.includes("abert") || n.includes("conversa") || n.includes("lead")))
  );
}

/** O trecho de guia que a resposta mostra: a descrição e o começo do corpo. */
const TAMANHO_DO_TRECHO_DO_GUIA = 1200;

export async function respostaDoPiso(pool: Queryable, entrada: EntradaDoPiso): Promise<string> {
  const { orgId, pergunta, t } = entrada;

  if (ehResumo(pergunta)) {
    const conversas = await pool.query<{ n: string }>(
      `select count(*)::text as n from public.conversations
       where organization_id = $1 and status in ('open','pending','claimed','ai_handling')`,
      [orgId],
    );
    const leads = await pool.query<{ n: string }>(
      "select count(*)::text as n from public.crm_leads where organization_id = $1 and status = 'open'",
      [orgId],
    );
    const funis = await pool.query<{ n: string }>(
      "select count(*)::text as n from public.crm_pipelines where organization_id = $1",
      [orgId],
    );
    return (
      t("Resumo da operação: ") +
      t("{conversas} conversas em atendimento, {leads} negócios abertos em {funis} funis.")
        .replace("{conversas}", conversas.rows[0]?.n ?? "0")
        .replace("{leads}", leads.rows[0]?.n ?? "0")
        .replace("{funis}", funis.rows[0]?.n ?? "0")
    );
  }

  const skills = (await loadSkills(pool, orgId)).filter((s) => s.name.startsWith("assistente-"));
  const { matched } = matchSkills(skills, pergunta);
  const guia = matched[0];
  if (guia !== undefined) {
    return `${guia.description}\n\n${guia.body.slice(0, TAMANHO_DO_TRECHO_DO_GUIA)}`;
  }

  return t("Ainda não consegui responder isso. Posso mostrar um resumo da operação ou trechos dos guias.");
}
