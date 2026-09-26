// app/app/proposals/[id]/_components/DocumentoCanvas.tsx
"use client";

import { useEffect, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";
import { ROTULO_DO_MODELO } from "@/lib/propostas/modelos/rotulos";

interface SecaoDocumento {
  id: string;
  title: string;
  body: string;
  faltantes: string[];
}

interface Documento {
  modeloSlug: string | null;
  modeloSlugSugerido: string | null;
  secoes: SecaoDocumento[];
  variaveisFaltando: string[];
  prontidao: { status: string; checklist: Record<string, boolean> } | null;
  resumoComercial: string | null;
}

export function DocumentoCanvas({ propostaId }: { propostaId: string }) {
  const t = useT();
  const [doc, setDoc] = useState<Documento | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = () => {
    const controller = new AbortController();
    apiClient
      .get<ApiSuccess<Documento>>(`/api/v1/proposals/${propostaId}/documento`, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setDoc(res.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showApiError(error);
      });
    return controller;
  };

  useEffect(() => {
    const controller = carregar();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propostaId]);

  const confirmarModelo = async (slug: string) => {
    setConfirmando(true);
    try {
      await apiClient.patch(`/api/v1/proposals/${propostaId}/modelo`, { template_slug: slug });
      carregar();
    } catch (error) {
      showApiError(error);
    } finally {
      setConfirmando(false);
    }
  };

  if (!doc) return null;

  if (!doc.modeloSlug) {
    const rotuloSugerido = doc.modeloSlugSugerido ? ROTULO_DO_MODELO[doc.modeloSlugSugerido] : null;
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-gray-600 space-y-3">
        {doc.modeloSlugSugerido ? (
          <p>
            {t("A IA sugeriu o modelo")} <strong>{rotuloSugerido ?? doc.modeloSlugSugerido}</strong>.
          </p>
        ) : (
          <p>{t("Nenhum modelo escolhido para esta proposta ainda.")}</p>
        )}
        <div className="flex items-center gap-2">
          {doc.modeloSlugSugerido && (
            <button
              type="button"
              disabled={confirmando}
              onClick={() => confirmarModelo(doc.modeloSlugSugerido!)}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {t("Usar este modelo")}
            </button>
          )}
          <select
            disabled={confirmando}
            defaultValue=""
            onChange={(e) => e.target.value && confirmarModelo(e.target.value)}
            className="rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              {t("Ou escolha outro modelo")}
            </option>
            {Object.entries(ROTULO_DO_MODELO).map(([slug, rotulo]) => (
              <option key={slug} value={slug}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      {doc.variaveisFaltando.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t("Não é possível enviar")} — {doc.variaveisFaltando.length} {t("pendência(s)")}
        </div>
      )}
      <div className="space-y-3">
        {doc.secoes.map((s) => (
          <div key={s.id}>
            <div className="text-sm font-semibold">{s.title}</div>
            <div className="text-sm whitespace-pre-wrap">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
