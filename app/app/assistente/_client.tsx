"use client";

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/hooks/i18n/useT";

interface Thread {
  id: string;
  last_message_at: string | null;
  created_at: string;
}

interface Mensagem {
  id: string;
  author_kind: "human" | "ai";
  body: string;
}

const PERGUNTA_RAPIDA = "resumo: quantas conversas abertas?";

export function AssistenteClient() {
  const t = useT();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarThreads = useCallback(async () => {
    const r = await fetch("/api/v1/ai/assistente/threads?limite=20");
    if (!r.ok) return;
    const corpo = (await r.json()) as { data: { threads: Thread[] } };
    setThreads(corpo.data.threads);
  }, []);

  const abrirThread = useCallback(async (id: string) => {
    setThreadId(id);
    const r = await fetch(`/api/v1/ai/assistente/threads/${id}/messages`);
    if (!r.ok) return;
    const corpo = (await r.json()) as { data: { mensagens: Mensagem[] } };
    setMensagens(corpo.data.mensagens);
  }, []);

  useEffect(() => {
    void carregarThreads();
  }, [carregarThreads]);

  async function perguntar(texto: string) {
    const p = texto.trim();
    if (p.length < 3 || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/v1/ai/assistente/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(threadId === null ? {} : { thread_id: threadId }),
          turn_id: crypto.randomUUID(),
          pergunta: p,
        }),
      });
      if (!r.ok) {
        setErro(t("Não foi possível perguntar agora."));
        return;
      }
      const corpo = (await r.json()) as {
        data: { thread_id: string; mensagens?: Mensagem[]; resposta?: string };
      };
      setThreadId(corpo.data.thread_id);
      if (corpo.data.mensagens !== undefined) {
        setMensagens(corpo.data.mensagens);
      } else {
        await abrirThread(corpo.data.thread_id);
      }
      setPergunta("");
      void carregarThreads();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid flex-1 gap-4 md:grid-cols-[240px_1fr]">
      <aside aria-label={t("Conversas")} className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            setThreadId(null);
            setMensagens([]);
          }}
          className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
        >
          {t("Nova conversa")}
        </button>
        {threads.map((th) => (
          <button
            key={th.id}
            type="button"
            onClick={() => void abrirThread(th.id)}
            className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
          >
            {new Date(th.last_message_at ?? th.created_at).toLocaleString()}
          </button>
        ))}
      </aside>
      <section className="flex flex-col gap-3">
        <div className="flex min-h-48 flex-1 flex-col gap-2 overflow-y-auto rounded-md border p-3">
          {mensagens.map((m) => (
            <p key={m.id} className={m.author_kind === "human" ? "self-end text-right" : "self-start"}>
              <span className="inline-block max-w-full rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                {m.body}
              </span>
            </p>
          ))}
          {mensagens.length === 0 ? (
            <p className="text-sm text-text-muted">{t("Pergunte sobre a operação ou os guias.")}</p>
          ) : null}
        </div>
        {erro !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={enviando}
            onClick={() => void perguntar(PERGUNTA_RAPIDA)}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {t("Resumo da operação")}
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perguntar(pergunta);
          }}
          className="flex gap-2"
        >
          <input
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            placeholder={t("Escreva sua pergunta...")}
            aria-label={t("Pergunta")}
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={enviando || pergunta.trim().length < 3}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {t("Perguntar")}
          </button>
        </form>
      </section>
    </div>
  );
}
