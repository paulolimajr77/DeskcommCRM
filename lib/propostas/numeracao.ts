import type { SupabaseClient } from "@supabase/supabase-js";

const TENTATIVAS_MAX = 5;

/**
 * Aloca numero/ano NA MESMA transação lógica do envio: lê o próximo número
 * via `fn_proposta_aloca_numero` e tenta o UPDATE que marca a proposta como
 * `enviada` com esse número. Se outra proposta pegou o mesmo número entre a
 * leitura e a escrita (23505 do índice único parcial), tenta de novo — é o
 * padrão de idempotência que o repositório já usa (Idempotency-Key, mensagem
 * WhatsApp). NÃO usa advisory lock: a spec só pede "captura de 23505 e nova
 * tentativa", e um lock explícito seria escopo que ninguém pediu.
 */
export async function alocarNumero(
  admin: SupabaseClient,
  input: { orgId: string; propostaId: string },
): Promise<{ numero: number; ano: number }> {
  const ano = new Date().getFullYear();

  for (let tentativa = 0; tentativa < TENTATIVAS_MAX; tentativa++) {
    const { data: numero, error: numeroErr } = await admin.rpc("fn_proposta_aloca_numero", {
      p_org: input.orgId,
      p_ano: ano,
    });
    if (numeroErr) throw numeroErr;

    const { data, error } = await admin
      .from("crm_proposals")
      .update({ numero, ano, status: "enviada" })
      .eq("id", input.propostaId)
      .eq("organization_id", input.orgId)
      .is("numero", null)
      .select("id, numero, ano")
      .single();

    if (!error) return { numero: data.numero as number, ano: data.ano as number };
    if ((error as { code?: string }).code !== "23505") throw error;
    // colisão: outra proposta pegou este número entre a leitura e a escrita — tenta de novo.
  }

  throw new Error("numero_indisponivel: 5 tentativas de alocação colidiram");
}
