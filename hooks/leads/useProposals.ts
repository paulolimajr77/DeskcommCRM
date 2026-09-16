"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";

export interface PropostaPendente {
  lead_id: string;
  lead_title: string;
  stage_name: string | null;
  contact_name: string | null;
  next_action: string;
  seq: number;
  proposed_at: string;
}

export interface DecisaoPassada {
  activity_id: string;
  lead_id: string;
  lead_title: string;
  decision: "approve" | "dismiss";
  next_action: string;
  decided_by: string | null;
  decided_at: string;
}

export interface Propostas {
  pending: PropostaPendente[];
  history: DecisaoPassada[];
}

const QUERY_KEY = ["proposals"] as const;

export function useProposals() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await apiClient.get<{ data: Propostas }>("/api/v1/leads/proposals");
      return res.data;
    },
  });
}

/**
 * Decide pela MESMA rota que o card do kanban usa
 * (`POST /api/v1/leads/{id}/next-action`), incluindo o `approved_seq`.
 *
 * ⚠️ O `seq` não é enfeite: ele é a trava que impede aprovar uma proposta que
 * já mudou. Numa LISTA isso importa mais que no card — a aba pode ficar aberta
 * enquanto o agente reescreve a próxima ação, e sem a trava o clique aprovaria
 * um texto que ninguém leu. O 409 devolvido nesse caso é sucesso do mecanismo,
 * não erro: recarregamos e a proposta nova aparece.
 */
export function useDecidirProposta() {
  const qc = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: async (args: {
      leadId: string;
      decision: "approve" | "dismiss";
      seq: number;
    }) =>
      apiClient.post<{ data: { lead_id: string; decision: string; task_id: string | null } }>(
        `/api/v1/leads/${args.leadId}/next-action`,
        { decision: args.decision, approved_seq: args.seq },
      ),
    onSuccess: (res) => {
      // O aviso é condicionado ao `task_id`, não ao `decision`: descartar não
      // cria trabalho e não deve anunciar nada — e se um dia a rota deixar de
      // criar a tarefa, o aviso some junto com o fato em vez de sobreviver como
      // frase mentirosa.
      if (res.data.task_id) {
        toast.success(t("Virou tarefa, com você como responsável — está em Tarefas."));
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        qc.invalidateQueries({ queryKey: QUERY_KEY });
      }
      showApiError(err);
    },
    onSettled: () => {
      // Invalida a lista E o board: a decisão tira a proposta dos dois lugares,
      // e deixar um deles velho faria o card mostrar um botão que não existe
      // mais — o mesmo estado fantasma que a trava de seq combate.
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["board"] });
    },
  });
}
