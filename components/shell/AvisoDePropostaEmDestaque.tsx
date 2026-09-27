"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useAgentInbox, type AgentInboxItem } from "@/hooks/ai/useAgentInbox";
import { useT } from "@/hooks/i18n/useT";
import { destinosDaInterface } from "@/lib/navigation/interface";

const KIND_PROPOSTA_PRONTA = "proposta_pronta_para_revisao";

/**
 * C6 — aviso de proposta que se vê. Quando nasce um
 * `proposta_pronta_para_revisao` com o CRM aberto, um cartão fixo aparece no
 * canto inferior direito, com som curto e notificação do sistema (se
 * permitida). A primeira carga só REGISTRA os ids — sem ela, todo aviso
 * antigo gritaria a cada F5. Mesmo gate de permissão do `AlertsBell`.
 */
export function AvisoDePropostaEmDestaque() {
  const { user, activeOrg } = useAuth();
  if (
    !destinosDaInterface(
      activeOrg?.interface_settings,
      user.is_platform_admin && !user.support,
      activeOrg?.role ?? null,
    ).some((d) => d.href === "/app/ai/inbox")
  )
    return null;
  return <AvisoVisivel />;
}

function tocarSinalCurto(): void {
  try {
    const Ctor =
      typeof window === "undefined"
        ? null
        : (window as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
          }).AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
          null;
    if (!Ctor) return;
    const ctx = new Ctor();
    const oscilador = ctx.createOscillator();
    const ganho = ctx.createGain();
    oscilador.connect(ganho);
    ganho.connect(ctx.destination);
    oscilador.start();
    oscilador.stop(ctx.currentTime + 0.2);
    window.setTimeout(() => {
      try {
        void ctx.close().catch(() => undefined);
      } catch {
        /* sem áudio, sem quebra */
      }
    }, 300);
  } catch {
    /* sem áudio, sem quebra */
  }
}

function notificarSistema(titulo: string, corpo: string): void {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification(titulo, { body: corpo });
  } catch {
    /* sem notificação, sem quebra */
  }
}

function AvisoVisivel() {
  const t = useT();
  const { data } = useAgentInbox("open");
  const vistos = useRef<Set<string> | null>(null);
  const [dispensados, setDispensados] = useState<ReadonlySet<string>>(new Set());
  const [atual, setAtual] = useState<AgentInboxItem | null>(null);
  const corpo = t("A IA preparou uma proposta. Confira antes de enviar.");

  useEffect(() => {
    const itens = data?.items ?? [];
    if (vistos.current === null) {
      vistos.current = new Set(itens.map((i) => i.id));
      return;
    }
    const registrados = vistos.current;
    const novo = itens.find((i) => i.kind === KIND_PROPOSTA_PRONTA && !registrados.has(i.id));
    for (const i of itens) registrados.add(i.id);
    if (!novo || dispensados.has(novo.id)) return;
    setAtual((anterior) => (anterior?.id === novo.id ? anterior : novo));
    tocarSinalCurto();
    notificarSistema(novo.title, corpo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dispensados]);

  // O aviso saiu da lista de abertos (resolveram ou reabriram em outra aba):
  // o cartão não pode ficar pendurado num aviso que já não está aberto.
  useEffect(() => {
    if (!atual || !data) return;
    if (!data.items.some((i) => i.id === atual.id)) setAtual(null);
  }, [atual, data]);

  if (!atual) return null;
  const destino = atual.destination.estado === "disponivel" ? atual.destination.href : "/app/ai/inbox";

  function dispensar(): void {
    setDispensados((antes) => new Set(antes).add(atual.id));
    setAtual(null);
  }

  return (
    <div
      role="alert"
      data-testid="aviso-proposta-destaque"
      className="fixed right-4 bottom-4 z-50 w-80 rounded-lg border border-border bg-card p-4 shadow-lg"
    >
      {/* O TÍTULO sai como veio — é linha de `agent_inbox_items`, com dado de
          gente (nome da proposta, do cliente). Mesma regra do AgentInboxList:
          nunca por t(). */}
      <p className="text-sm font-medium">{atual.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{corpo}</p>
      <div className="mt-3 flex gap-2">
        <Button asChild size="sm">
          <Link href={destino}>{t("Abrir proposta")}</Link>
        </Button>
        <Button size="sm" variant="outline" onClick={dispensar} data-testid="aviso-proposta-dispensar">
          {t("Dispensar")}
        </Button>
      </div>
    </div>
  );
}
