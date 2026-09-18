import type { ProposalRow } from "./tipos";

export type DecisaoDeVersao =
  | { tipo: "patch_no_mesmo" }
  | { tipo: "nova_versao"; herdaNumero: number; herdaAno: number; novaVersao: number; substituiId: string };

/**
 * Rascunho: edita no lugar (spec §5.4 — "revisar um rascunho não cria
 * versão"). Enviada: revisar cria v2, que HERDA numero/ano da v1 — "a
 * conversa com o cliente é sobre a 0042, não sobre dois documentos". Aceita,
 * recusada, vencida, cancelada, substituida: não são editáveis por este
 * caminho — a UI oferece "duplicar" para recomeçar do zero, não "editar".
 */
export function decidirVersao(atual: ProposalRow): DecisaoDeVersao {
  if (atual.status === "rascunho") return { tipo: "patch_no_mesmo" };
  if (atual.status === "enviada") {
    if (atual.numero === null || atual.ano === null) {
      throw new Error("estado_inconsistente: proposta enviada sem numero/ano");
    }
    return {
      tipo: "nova_versao",
      herdaNumero: atual.numero,
      herdaAno: atual.ano,
      novaVersao: atual.versao + 1,
      substituiId: atual.id,
    };
  }
  throw new Error(`status_nao_editavel: ${atual.status}`);
}
