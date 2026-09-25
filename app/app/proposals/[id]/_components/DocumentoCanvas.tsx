// app/app/proposals/[id]/_components/DocumentoCanvas.tsx
"use client";

import { useEffect, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";

interface SecaoDocumento {
  id: string;
  title: string;
  body: string;
  faltantes: string[];
}

interface Documento {
  modeloSlug: string | null;
  secoes: SecaoDocumento[];
  variaveisFaltando: string[];
  prontidao: { status: string; checklist: Record<string, boolean> } | null;
  resumoComercial: string | null;
}

export function DocumentoCanvas({ propostaId }: { propostaId: string }) {
  const t = useT();
  const [doc, setDoc] = useState<Documento | null>(null);

  useEffect(() => {
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
    return () => controller.abort();
  }, [propostaId]);

  if (!doc) return null;

  if (!doc.modeloSlug) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-gray-600">
        {t("Nenhum modelo escolhido para esta proposta ainda.")}
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
