"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import {
  diffLegivel,
  type DiffLegivel,
} from "@/lib/assistente/propostas/diff-legivel";
import type { Tradutor } from "@/lib/assistente/propostas/tradutor";
import { formatadorDeData } from "@/lib/cobranca/fuso";

const QUERY_KEY = ["assistente", "propostas"];

/**
 * A FILA DE PROPOSTAS DO ASSISTENTE no painel (F2b, T21).
 *
 * A única fonte é `GET /api/v1/ai/assistente/propostas` — nada de banco direto
 * na tela. O `vencida`, o `antes` e os nomes vêm prontos do GET (o `antes` foi
 * lido das rotas de leitura NO MOMENTO da proposta, pelas ferramentas
 * `propor_*`; "quem pediu" é resolvido com UMA leitura de `GET /api/v1/team`).
 *
 * Atualização (escolha registrada na ordem): o painel não tem realtime nem
 * polling — a fila carrega QUANDO O PAINEL ABRE via `useQuery({ enabled: aberto })`
 * e DEPOIS DE CADA AÇÃO via `invalidateQueries` no `onSuccess` da mutação.
 * O botão "Recarregar" chama `refetch()` da query. O contador da aba
 * sobe/desce da MESMA lista.
 *
 * A fila é de decisão: as 50 mais recentes vêm numa leitura, `pendente`
 * primeiro, e o filtro "ver também" (aplicadas/rejeitadas/expiradas/todas) é
 * client-side sobre a MESMA lista — nenhuma fila de organização real passa
 * disso sem a busca por status que o GET já oferece.
 */

interface PropostaDaFila {
  id: string;
  kind: string;
  operacao: string | null;
  risk: string;
  status: string;
  resumo: string;
  motivo: string;
  antes: unknown;
  payload: unknown;
  requested_by: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  applied_by: string | null;
  applied_at: string | null;
  apply_result: unknown;
  expires_at: string;
  created_at: string;
  vencida: boolean;
}

const UM_DIA_EM_MS = 86_400_000;

/** Rótulo do TIPO em português (o `kind` é vocabulário do banco, não da tela). */
function rotuloDoTipo(t: Tradutor, kind: string): string {
  switch (kind) {
    case "roteador":
      return t("Roteador");
    case "conhecimento":
      return t("Conhecimento");
    case "memoria":
      return t("Memória");
    case "modelo_auxiliares":
      return t("Modelo dos auxiliares");
    case "funil":
      return t("Funil");
    default:
      return kind;
  }
}

/** Rótulo da OPERAÇÃO em português. */
function rotuloDaOperacao(t: Tradutor, operacao: string | null): string {
  switch (operacao) {
    case "criar":
      return t("criar");
    case "alterar":
      return t("alterar");
    case "membros":
      return t("intenções");
    case "arquivar":
      return t("arquivar");
    case "definir_ponto":
      return t("definir ponto");
    case "definir_padrao":
      return t("definir padrão");
    case "criar_funil":
      return t("criar funil");
    case "criar_etapa":
      return t("criar etapa");
    case "alterar_etapa":
      return t("alterar etapa");
    default:
      return operacao ?? "";
  }
}

/** O prazo em frase: "vence em N dias" / "venceu" / o estado já decidido. */
function fraseDoPrazo(t: Tradutor, p: PropostaDaFila): string {
  if (p.status === "aplicada") return t("Aplicada");
  if (p.status === "rejeitada") return t("Rejeitada");
  if (p.status === "expirada") return t("Expirou sem decisão.");
  if (p.vencida) return p.status === "pendente" ? t("Venceu sem decisão.") : t("Venceu sem aplicação.");
  const restante = new Date(p.expires_at).getTime() - Date.now();
  const dias = Math.max(1, Math.ceil(restante / UM_DIA_EM_MS));
  return `${t("Vence em")} ${dias} ${dias === 1 ? t("dia") : t("dias")}`;
}

type Filtro = "decidir" | "aplicada" | "rejeitada" | "expirada" | "todas";

export function PropostasDoAssistente({
  aberto,
  aoContarPendentes,
}: {
  /** O painel está aberto? Cada abertura recarrega a fila (via `enabled` da query). */
  aberto: boolean;
  /** O contador de pendentes da aba. */
  aoContarPendentes: (pendentes: number) => void;
}) {
  const t = useT();
  const idioma = useIdioma();
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("decidir");
  /** id do cartão com erro de ação → frase legível. */
  const [errosDeAcao, setErrosDeAcao] = useState<Record<string, string>>({});
  /** id do cartão com a rejeição aberta (textarea de motivo). */
  const [rejeicaoAberta, setRejeicaoAberta] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** user_id → nome (UMA leitura de /api/v1/team; sem ela, o rótulo genérico). */
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  const nomesCarregados = useRef(false);

  const nomeDe = useCallback(
    (userId: string): string => nomes.get(userId) ?? t("um administrador"),
    [nomes, t],
  );

  // A fila carrega QUANDO O PAINEL ABRE (e não quando a aba é só olhada) —
  // a escolha da ordem: sem realtime, sem polling; ações recarregam o cartão
  // via `invalidateQueries` no `onSuccess` de cada mutação.
  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: aberto,
    queryFn: async () => {
      const r = await apiClient.get<{ data: PropostaDaFila[] }>(
        "/api/v1/ai/assistente/propostas?limit=50"
      );
      return Array.isArray(r.data) ? r.data : [];
    },
  });

  const propostas = query.data ?? null;
  // Erro da carga: DERIVADO da query (sem setState em efeito). 401 pede novo login.
  const erroGeral: string | null = !query.isError
    ? null
    : query.error instanceof ApiError && query.error.status === 401
      ? t("Entre de novo para ver as propostas.")
      : t("Não consegui carregar as propostas.");
  const carregando = query.isFetching;

  /** A resposta da ação já traz a proposta nova: o cartão muda na hora, e o refetch confirma. */
  const poNaFila = (r: { data?: PropostaDaFila } | undefined) => {
    const nova = r?.data;
    if (nova === undefined || typeof nova.id !== "string") return;
    qc.setQueryData<PropostaDaFila[]>(QUERY_KEY, (atual) =>
      (atual ?? []).map((x) => (x.id === nova.id ? nova : x)),
    );
  };

  const aprovarMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiClient.post<{ data?: PropostaDaFila }>(
        `/api/v1/ai/assistente/propostas/${id}/aprovar`,
        undefined
      );
      return r;
    },
    onSuccess: (r) => {
      poNaFila(r);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      setRejeicaoAberta(null);
      setMotivo("");
    },
  });

  const rejeitarMut = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const corpo = motivo.trim() === "" ? {} : { motivo: motivo.trim() };
      const r = await apiClient.post<{ data?: PropostaDaFila }>(
        `/api/v1/ai/assistente/propostas/${id}/rejeitar`,
        corpo
      );
      return r;
    },
    onSuccess: (r) => {
      poNaFila(r);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      setRejeicaoAberta(null);
      setMotivo("");
    },
  });

  const aplicarMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiClient.post<{ data?: PropostaDaFila }>(
        `/api/v1/ai/assistente/propostas/${id}/aplicar`,
        undefined
      );
      return r;
    },
    onSuccess: (r) => {
      poNaFila(r);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  // Os nomes de "quem pediu": UMA leitura da equipe, na primeira carga com sucesso.
  useEffect(() => {
    if (propostas === null || nomesCarregados.current) return;
    nomesCarregados.current = true;
    void (async () => {
      try {
        const r = await apiClient.get<unknown[]>("/api/v1/team");
        const mapa = new Map<string, string>();
        for (const m of r) {
          const linha = m as { user_id?: unknown; full_name?: unknown; email?: unknown };
          if (typeof linha.user_id !== "string") continue;
          mapa.set(
            linha.user_id,
            typeof linha.full_name === "string" && linha.full_name.trim() !== ""
              ? linha.full_name
              : typeof linha.email === "string"
                ? linha.email
                : "",
          );
        }
        setNomes(mapa);
      } catch {
        // Sem a lista de equipe: os cartões mostram o rótulo genérico.
      }
    })();
  }, [propostas]);

  const pendentes = (propostas ?? []).filter((p) => p.status === "pendente").length;
  useEffect(() => {
    aoContarPendentes(pendentes);
  }, [pendentes, aoContarPendentes]);

  /** A ação na rota da T20; a resposta ATUALIZA o cartão (ou vira erro legível). */
  async function agir(id: string, acao: "aprovar" | "rejeitar" | "aplicar") {
    if (ocupado !== null) return;
    setOcupado(id);
    setErrosDeAcao((atuais) => {
      const { [id]: _fora, ...resto } = atuais;
      return resto;
    });
    try {
      if (acao === "aprovar") {
        await aprovarMut.mutateAsync(id);
      } else if (acao === "rejeitar") {
        await rejeitarMut.mutateAsync({ id, motivo });
      } else {
        await aplicarMut.mutateAsync(id);
      }
      return;
    } catch (erro) {
      const codigo =
        erro instanceof Error && "code" in erro
          ? (erro as { code?: unknown }).code
          : undefined;
      const mensagem =
        erro instanceof Error && "message" in erro
          ? (erro as { message?: string }).message
          : undefined;
      const details =
        erro instanceof Error && "details" in erro
          ? (erro as { details?: unknown }).details
          : undefined;
      if (codigo === "proposta_em_aplicacao") {
        setErrosDeAcao((atuais) => ({
          ...atuais,
          [id]: t("Esta proposta já está sendo aplicada agora. Aguarde um instante."),
        }));
        return;
      }
      if (codigo === "proposta_expirada") {
        // O servidor acabou de marcar `expirada`: a fila recarrega para mostrar.
        void query.refetch();
        return;
      }
      if (codigo === "proposta_falhou_ao_aplicar") {
        const http =
          details && typeof details === "object" && "http_status" in details
            ? String((details as { http_status?: unknown }).http_status)
            : null;
        const codigoDoDestino =
          details &&
          typeof details === "object" &&
          "codigo_do_destino" in details
            ? (details as { codigo_do_destino?: unknown }).codigo_do_destino
            : null;
        const origem =
          http === null && codigoDoDestino === null
            ? t("sem resposta do destino")
            : `${http ?? "?"}${
                codigoDoDestino === null ? "" : ` · ${codigoDoDestino}`
              }`;
        setErrosDeAcao((atuais) => ({
          ...atuais,
          [id]: `${mensagem ?? t("A aplicação falhou no destino.")} ${t(
            "O destino respondeu"
          )} ${origem}. ${t("A proposta continua aprovada — você pode tentar de novo.")}`,
        }));
        return;
      }
      setErrosDeAcao((atuais) => ({
        ...atuais,
        [id]: mensagem ?? t("Não foi possível concluir a ação."),
      }));
    } finally {
      setOcupado(null);
    }
  }

  const visiveis = (propostas ?? []).filter((p) => {
    if (filtro === "todas") return true;
    if (filtro === "decidir") return p.status === "pendente" || p.status === "aprovada";
    return p.status === filtro;
  });
  // pendente primeiro; dentro do grupo, a mais nova primeiro (a ordem do GET).
  const ordem: Record<string, number> = { pendente: 0, aprovada: 1, aplicada: 2, rejeitada: 3, expirada: 4 };
  visiveis.sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9) || (a.created_at < b.created_at ? 1 : -1));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <select
          aria-label={t("Ver também")}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
          data-testid="propostas-filtro"
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <option value="decidir">{t("Esperando decisão")}</option>
          <option value="aplicada">{t("Aplicadas")}</option>
          <option value="rejeitada">{t("Rejeitadas")}</option>
          <option value="expirada">{t("Expiradas")}</option>
          <option value="todas">{t("Todas as propostas")}</option>
        </select>
        <button
          type="button"
          onClick={() => void query.refetch()}
          data-testid="propostas-recarregar"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t("Recarregar")}
        </button>
      </div>

      {erroGeral !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {erroGeral}
        </p>
      ) : null}
      {carregando ? (
        <p role="status" data-testid="propostas-carregando" className="text-sm text-text-muted">
          {t("Carregando as propostas…")}
        </p>
      ) : null}
      {!carregando && propostas !== null && visiveis.length === 0 ? (
        <p data-testid="propostas-vazias" className="text-sm text-text-muted">
          {t("Nenhuma proposta nesta visão.")}
        </p>
      ) : null}

      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {visiveis.map((p) => {
          const diff: DiffLegivel = diffLegivel(t as Tradutor, {
            kind: p.kind,
            operacao: p.operacao,
            antes: p.antes,
            payload: p.payload,
          });
          const erroDeAcao = errosDeAcao[p.id];
          const podeDecidir = p.status === "pendente" && !p.vencida;
          const podeAplicar = p.status === "aprovada" && !p.vencida;
          return (
            <li
              key={p.id}
              data-testid={`proposta-${p.id}`}
              data-status={p.status}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-text-muted">
                  {rotuloDoTipo(t, p.kind)} · {rotuloDaOperacao(t, p.operacao)}
                </p>
                <span
                  data-testid="proposta-risco"
                  className={
                    p.risk === "atencao"
                      ? "shrink-0 rounded-full border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
                      : "shrink-0 rounded-full border border-emerald-600/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400"
                  }
                >
                  {p.risk === "atencao" ? t("Atenção") : t("Seguro")}
                </span>
              </div>
              <p className="text-sm font-medium">{p.resumo}</p>

              {diff.linhas.length > 0 ? (
                <div className="flex flex-col gap-1 rounded-md bg-muted/60 p-2">
                  {diff.linhas.map((linha, i) => (
                    <div key={`${linha.rotulo}-${i}`} className="text-xs">
                      <span className="font-medium">{linha.rotulo}: </span>
                      {linha.de !== null && linha.de !== "" && linha.de !== linha.para ? (
                        <>
                          <span className="text-text-muted line-through">{linha.de}</span>
                          {" → "}
                        </>
                      ) : null}
                      <span>{linha.para ?? "—"}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {diff.avisos.map((aviso, i) => (
                <p key={`${p.id}-aviso-${i}`} role="note" className="rounded-md border border-dashed px-3 py-2 text-xs text-text-muted">
                  {aviso}
                </p>
              ))}

              <p data-testid={`proposta-quem-${p.id}`} className="text-xs text-text-muted">
                {t("Pedido por")} {nomeDe(p.requested_by)} · {formatadorDeData(idioma, null, { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(p.created_at))}
              </p>
              <p data-testid="proposta-prazo" className="text-xs font-medium">
                {fraseDoPrazo(t, p)}
              </p>

              {p.status === "rejeitada" && p.decision_reason !== null && p.decision_reason !== "" ? (
                <p className="rounded-md bg-muted/60 p-2 text-xs">
                  <span className="font-medium">{t("Motivo da rejeição")}: </span>
                  {p.decision_reason}
                </p>
              ) : null}

              {erroDeAcao !== undefined ? (
                <p role="alert" data-testid={`proposta-erro-${p.id}`} className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
                  {erroDeAcao}
                </p>
              ) : null}

              {p.vencida && (p.status === "pendente" || p.status === "aprovada") ? null : null}

              <div className="flex flex-wrap gap-2">
                {podeDecidir ? (
                  <>
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => void agir(p.id, "aprovar")}
                      data-testid={`proposta-aprovar-${p.id}`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      {t("Aprovar")}
                    </button>
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => {
                        setRejeicaoAberta(rejeicaoAberta === p.id ? null : p.id);
                        setMotivo("");
                      }}
                      data-testid={`proposta-rejeitar-${p.id}`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      {t("Rejeitar")}
                    </button>
                  </>
                ) : null}
                {podeAplicar ? (
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => void agir(p.id, "aplicar")}
                    data-testid={`proposta-aplicar-${p.id}`}
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {t("Aplicar")}
                  </button>
                ) : null}
              </div>

              {rejeicaoAberta === p.id && podeDecidir ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    aria-label={t("Motivo da rejeição (opcional)")}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    data-testid={`proposta-motivo-${p.id}`}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => void agir(p.id, "rejeitar")}
                      data-testid={`proposta-confirmar-rejeicao-${p.id}`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      {t("Confirmar rejeição")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejeicaoAberta(null);
                        setMotivo("");
                      }}
                      data-testid={`proposta-cancelar-rejeicao-${p.id}`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      {t("Cancelar")}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
