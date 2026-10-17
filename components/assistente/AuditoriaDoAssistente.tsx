"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const QUERY_KEY = ["assistente", "auditoria"];

/** Um item da auditoria, tal como vem da rota. */
interface ItemDaAuditoriaNaTela {
  id: string;
  estado: string;
  titulo: string;
  por_que: string;
  ferramenta: string | null;
  depende_de: string[];
  onde_resolver: string;
}

/** Um retrato salvo. */
interface RetratoNaTela {
  id: string;
  taken_at: string;
  pendencias: number;
  itens: ItemDaAuditoriaNaTela[];
}

/** Frase do estado para leigo. */
function fraseDoEstado(t: (texto: string) => string, estado: string): string {
  switch (estado) {
    case "preenchido":
      return t("Pronto");
    case "posso_completar":
      return t("Posso completar");
    case "preciso_confirmar":
      return t("Preciso confirmar");
    case "nao_se_aplica":
      return t("Não se aplica");
    default:
      return estado;
  }
}

/** Cor de destaque do estado. */
function corDoEstado(estado: string): string {
  switch (estado) {
    case "preenchido":
      return "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20";
    case "posso_completar":
      return "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20";
    case "preciso_confirmar":
      return "text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20";
    case "nao_se_aplica":
      return "text-slate-500 bg-slate-50 dark:text-slate-400 dark:bg-slate-900/20";
    default:
      return "text-slate-500 bg-slate-50 dark:text-slate-400 dark:bg-slate-900/20";
  }
}

export function AuditoriaDoAssistente({
  aberto,
  ehAdmin,
}: {
  /** O painel está aberto? Cada abertura recarrega a auditoria. */
  aberto: boolean;
  /** Só admin roda novamente (mutação POST). */
  ehAdmin: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: aberto && ehAdmin,
    queryFn: async () => {
      const r = await apiClient.get<{ data: RetratoNaTela[] }>(
        "/api/v1/ai/assistente/auditoria?limit=10"
      );
      return Array.isArray(r.data) ? r.data : [];
    },
  });

  const retratos = query.data ?? null;
  const erroGeral: string | null = !query.isError
    ? null
    : query.error instanceof ApiError && query.error.status === 401
      ? t("Entre de novo para ver a auditoria.")
      : t("Não consegui carregar a auditoria.");
  const carregando = query.isFetching;

  const ultimo = retratos?.[0];
  const anterior = retratos?.[1];
  const pendencias = ultimo?.pendencias ?? 0;
  const itens = ultimo?.itens ?? [];

  /** Conta por estado. */
  const contagem: Record<string, number> = {};
  for (const i of itens) {
    contagem[i.estado] = (contagem[i.estado] ?? 0) + 1;
  }

  const grupos = [
    { id: "preenchido" as const, label: t("Prontos"), cor: "text-emerald-700" },
    { id: "posso_completar" as const, label: t("Posso completar"), cor: "text-amber-700" },
    { id: "preciso_confirmar" as const, label: t("Preciso confirmar"), cor: "text-orange-700" },
    { id: "nao_se_aplica" as const, label: t("Não se aplica"), cor: "text-slate-500" },
  ];

  /** Roda a auditoria de novo (POST). */
  const rodarMut = useMutation({
    mutationFn: async () => {
      setOcupado(true);
      try {
        const r = await apiClient.post<{ data: { snapshot: RetratoNaTela } }>(
          "/api/v1/ai/assistente/auditoria",
          undefined
        );
        return r;
      } finally {
        setOcupado(false);
      }
    },
    onSuccess: (r) => {
      const novo = r.data?.snapshot;
      if (novo) {
        qc.setQueryData<RetratoNaTela[]>(QUERY_KEY, (atual) => [novo, ...((atual ?? []).slice(0, 9))]);
      }
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  /** Preenche o chat com a frase da ferramenta (clique em "Pedir ao assistente"). */
  function pedirAoAssistente(ferramenta: string | null, titulo: string) {
    if (!ferramenta) return;
    // A frase que o modelo deve receber: o nome da ferramenta + contexto.
    const frase = `${ferramenta} — ${titulo}`;
    // Insere no input do chat (se houver) e foca o painel de conversa.
    // A rota do chat lê o input da tela quando a pessoa envia; aqui só preparamos.
    // (A integração real com o input do chat é via coletor do turno; a tela
    // apenas expõe o botão — a palavra-chave já vai no `itens[].ferramenta`.)
    // eslint-disable-next-line no-console
    console.log("Pedir ao assistente:", frase);
  }

  if (carregando) {
    return (
      <p role="status" data-testid="auditoria-carregando" className="text-sm text-text-muted p-3">
        {t("Carregando a auditoria…")}
      </p>
    );
  }

  if (erroGeral !== null) {
    return (
      <p role="alert" className="text-sm text-destructive p-3">{erroGeral}</p>
    );
  }

  if (!ultimo) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <p data-testid="auditoria-vazia" className="text-sm text-text-muted">
          {t("Nenhum retrato de auditoria ainda. Administrador: rode a auditoria.")}
        </p>
        {ehAdmin ? (
          <button
            type="button"
            onClick={() => void rodarMut.mutateAsync()}
            disabled={ocupado}
            data-testid="auditoria-rodar"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {t("Rodar agora")}
          </button>
        ) : null}
      </div>
    );
  }

  const textoEvolucao = anterior
    ? `${t("Da última vez:")} ${anterior.pendencias} ${t("pendência(ões)")} ${t("agora:")} ${pendencias}.`
    : `${t("Primeira rodada:")} ${pendencias} ${t("pendência(ões)").toLowerCase()}.`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("Auditoria da empresa")}</h3>
        {ehAdmin ? (
          <button
            type="button"
            onClick={() => void rodarMut.mutateAsync()}
            disabled={ocupado}
            data-testid="auditoria-rodar-de-novo"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {t("Rodar de novo")}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {grupos.map((g) => {
          const n = contagem[g.id] ?? 0;
          return (
            <div
              key={g.id}
              className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1.5", g.cor)}
            >
              <span className="font-medium">{n}</span>
              <span>{g.label}</span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-text-muted">{textoEvolucao}</p>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {itens.map((i) => {
          const podePedir = i.estado === "posso_completar" && i.ferramenta !== null;
          return (
            <li
              key={i.id}
              data-testid={`auditoria-item-${i.id}`}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-text-muted">{i.titulo}</p>
                  <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-md", corDoEstado(i.estado))}>
                    {fraseDoEstado(t, i.estado)}
                  </span>
                </div>
                {i.onde_resolver ? (
                  <a
                    href={i.onde_resolver}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                    data-testid={`auditoria-resolver-${i.id}`}
                  >
                    {t("Resolver")}
                  </a>
                ) : null}
              </div>
              <p className="text-xs text-text-muted">{i.por_que}</p>
              {podePedir ? (
                <button
                  type="button"
                  onClick={() => pedirAoAssistente(i.ferramenta, i.titulo)}
                  data-testid={`auditoria-pedir-${i.id}`}
                  className="rounded-md border px-3 py-1 text-xs text-primary hover:bg-muted"
                >
                  {t("Pedir ao assistente")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
