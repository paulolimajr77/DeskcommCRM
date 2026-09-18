"use client";

import { useEffect, useRef, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";
import { formatCents } from "@/lib/money";
import type { ProposalStatus } from "@/lib/propostas/tipos";
import { AssistantPanel } from "./_components/AssistantPanel";

interface ProposalItem {
  id?: string;
  product_id: string | null;
  descricao: string;
  quantidade: number;
  preco_unitario_cents: number;
  desconto_cents: number;
  position: number;
}

interface Proposta {
  id: string;
  titulo: string;
  condicoes: string | null;
  valid_until: string | null;
  status: ProposalStatus;
  revision: number;
  total_cents: number;
  itens: ProposalItem[];
  moeda: string;
}

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  marca: string;
  categoria: string;
  preco_cents: number;
  moeda: string;
}

export function ProposalEditorClient({ id, podeEditar }: { id: string; podeEditar: boolean }) {
  const t = useT();
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [buscaProdutos, setBuscaProdutos] = useState<string>("");
  const [resultadosProdutos, setResultadosProdutos] = useState<Produto[]>([]);
  const [mostraBuscaProdutos, setMostraBuscaProdutos] = useState(false);
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortController.current = controller;

    apiClient
      .get<ApiSuccess<Proposta>>(`/api/v1/proposals/${id}`, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setProposta(res.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showApiError(error);
      });

    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const trimmedBusca = buscaProdutos.trim();
    if (!trimmedBusca) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResultadosProdutos([]);
      return;
    }

    const controller = new AbortController();

    apiClient
      .get<ApiSuccess<Produto[]>>(`/api/v1/products?busca=${encodeURIComponent(trimmedBusca)}`, {
        signal: controller.signal,
      })
      .then((res) => {
        if (!controller.signal.aborted) setResultadosProdutos(res.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showApiError(error);
      });

    return () => controller.abort();
  }, [buscaProdutos]);

  if (!proposta) return <div className="p-6">{t("Carregando…")}</div>;

  const total = proposta.itens.reduce((acc, it) => {
    const subtotal = Math.round(it.quantidade * it.preco_unitario_cents);
    return acc + Math.max(0, subtotal - it.desconto_cents);
  }, 0);

  function atualizarItem(idx: number, patch: Partial<ProposalItem>) {
    setProposta((p) =>
      p && {
        ...p,
        itens: p.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
      },
    );
  }

  function adicionarItemManual() {
    setProposta((p) =>
      p && {
        ...p,
        itens: [
          ...p.itens,
          {
            product_id: null,
            descricao: "",
            quantidade: 1,
            preco_unitario_cents: 0,
            desconto_cents: 0,
            position: (p.itens.at(-1)?.position ?? 0) + 1000,
          },
        ],
      },
    );
  }

  function adicionarItemDoCatalogo(produto: Produto) {
    setProposta((p) =>
      p && {
        ...p,
        itens: [
          ...p.itens,
          {
            product_id: produto.id,
            descricao: produto.nome,
            quantidade: 1,
            preco_unitario_cents: produto.preco_cents,
            desconto_cents: 0,
            position: (p.itens.at(-1)?.position ?? 0) + 1000,
          },
        ],
      },
    );
    setMostraBuscaProdutos(false);
    setBuscaProdutos("");
  }

  async function salvar() {
    if (!proposta) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await apiClient.patch<ApiSuccess<{ id: string; revision: number; total_cents: number }>>(
        `/api/v1/proposals/${id}`,
        {
          revision: proposta.revision,
          titulo: proposta.titulo,
          condicoes: proposta.condicoes,
          valid_until: proposta.valid_until,
          itens: proposta.itens,
        },
      );
      setProposta((p) =>
        p && {
          ...p,
          revision: res.data.revision,
          total_cents: res.data.total_cents,
        },
      );
    } catch (e) {
      const errorMsg = t("A proposta mudou desde que você abriu. Recarregue antes de editar.");
      setErro(errorMsg);
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function enviar() {
    setSalvando(true);
    setErro(null);
    try {
      await apiClient.post<ApiSuccess<{ id: string; numero: number; ano: number; message_id: string }>>(
        `/api/v1/proposals/${id}/send`,
        {},
      );
      const res = await apiClient.get<ApiSuccess<Proposta>>(`/api/v1/proposals/${id}`);
      setProposta(res.data);
    } catch (e) {
      setErro(t("Não foi possível enviar. Confira se você tem papel de gestor."));
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function decidir(decisao: "aceita" | "recusada", motivo?: string) {
    try {
      await apiClient.post(`/api/v1/proposals/${id}/decide`, { decisao, motivo });
      const res = await apiClient.get<ApiSuccess<Proposta>>(`/api/v1/proposals/${id}`);
      setProposta(res.data);
    } catch (e) {
      showApiError(e);
    }
  }

  const editavel = podeEditar && proposta.status === "rascunho";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <header>
        <input
          className="text-2xl font-semibold w-full border rounded px-2 py-1"
          value={proposta.titulo}
          disabled={!editavel}
          onChange={(e) => setProposta((p) => p && { ...p, titulo: e.target.value })}
          placeholder={t("Título da proposta")}
        />
      </header>

      {erro && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">{t("Condições")}</label>
        <textarea
          className="w-full rounded border p-2 text-sm disabled:bg-gray-100"
          value={proposta.condicoes ?? ""}
          disabled={!editavel}
          onChange={(e) => setProposta((p) => p && { ...p, condicoes: e.target.value || null })}
          placeholder={t("Ex: Prazo de 30 dias, 50% adiantado")}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t("Válido até")}</label>
        <input
          type="date"
          className="w-full rounded border p-2 text-sm disabled:bg-gray-100"
          value={proposta.valid_until ?? ""}
          disabled={!editavel}
          onChange={(e) => setProposta((p) => p && { ...p, valid_until: e.target.value || null })}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b">
              <th scope="col" className="p-3 text-left">{t("Descrição")}</th>
              <th scope="col" className="p-3 text-right">{t("Qtd")}</th>
              <th scope="col" className="p-3 text-right">{t("Preço unit.")}</th>
              <th scope="col" className="p-3 text-right">{t("Desconto")}</th>
              <th scope="col" className="p-3 text-right">{t("Subtotal")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {proposta.itens.map((it, idx) => {
              const subtotal = Math.round(it.quantidade * it.preco_unitario_cents) - it.desconto_cents;
              return (
                <tr key={it.id ?? idx}>
                  <td className="p-3">
                    <input
                      className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-100"
                      value={it.descricao}
                      disabled={!editavel}
                      onChange={(e) => atualizarItem(idx, { descricao: e.target.value })}
                      placeholder={t("Descrição")}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      className="w-full border rounded px-2 py-1 text-sm text-right disabled:bg-gray-100"
                      value={it.quantidade}
                      disabled={!editavel}
                      onChange={(e) => atualizarItem(idx, { quantidade: Number(e.target.value) || 0 })}
                      min="0"
                      step="1"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      className="w-full border rounded px-2 py-1 text-sm text-right disabled:bg-gray-100"
                      value={it.preco_unitario_cents / 100}
                      disabled={!editavel}
                      onChange={(e) =>
                        atualizarItem(idx, { preco_unitario_cents: Math.round(Number(e.target.value) * 100) || 0 })
                      }
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      className="w-full border rounded px-2 py-1 text-sm text-right disabled:bg-gray-100"
                      value={it.desconto_cents / 100}
                      disabled={!editavel}
                      onChange={(e) =>
                        atualizarItem(idx, { desconto_cents: Math.round(Number(e.target.value) * 100) || 0 })
                      }
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="p-3 text-right font-medium tabular-nums">
                    {formatCents(Math.max(0, subtotal), proposta.moeda)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editavel && (
        <AssistantPanel
          propostaId={id}
          revision={proposta.revision}
          onAplicado={(r) => {
            setProposta((p) => p && { ...p, revision: r.revision, total_cents: r.total_cents });
            // recarrega a proposta inteira para refletir os itens que o assistente mudou
            apiClient.get<ApiSuccess<Proposta>>(`/api/v1/proposals/${id}`).then((res) => setProposta(res.data));
          }}
        />
      )}

      {editavel && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={adicionarItemManual}>
            {t("+ Item à mão")}
          </Button>
          <div className="flex-1">
            <input
              type="text"
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder={t("Buscar produto no catálogo…")}
              value={buscaProdutos}
              onChange={(e) => {
                setBuscaProdutos(e.target.value);
                setMostraBuscaProdutos(true);
              }}
              onFocus={() => buscaProdutos && setMostraBuscaProdutos(true)}
            />
            {mostraBuscaProdutos && resultadosProdutos.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg">
                {resultadosProdutos.map((produto) => (
                  <button
                    key={produto.id}
                    className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-gray-100 last:border-b-0"
                    onClick={() => adicionarItemDoCatalogo(produto)}
                  >
                    <div className="font-medium">{produto.nome}</div>
                    <div className="text-xs text-gray-600">
                      {t("Código")}: {produto.codigo} • {formatCents(produto.preco_cents, produto.moeda)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-4">
        <div className="text-lg font-semibold">{t("Total")}</div>
        <div className="text-2xl font-bold tabular-nums">{formatCents(total, proposta.moeda)}</div>
      </div>

      {proposta.status === "rascunho" && (
        <Button onClick={enviar} disabled={salvando} className="w-full">
          {t("Enviar ao cliente")}
        </Button>
      )}
      {proposta.status === "enviada" && (
        <div className="flex gap-2">
          <Button onClick={() => decidir("aceita")}>
            {t("Marcar como aceita")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const motivo = prompt(t("Motivo da recusa (opcional):")) ?? undefined;
              void decidir("recusada", motivo);
            }}
          >
            {t("Marcar como recusada")}
          </Button>
        </div>
      )}
      {editavel && (
        <Button onClick={salvar} disabled={salvando} className="w-full">
          {salvando ? t("Salvando…") : t("Salvar")}
        </Button>
      )}
    </div>
  );
}
