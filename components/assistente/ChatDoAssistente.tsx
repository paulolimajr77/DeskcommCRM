"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { randomId } from "@/lib/random-id";

interface Thread {
  id: string;
  last_message_at: string | null;
  created_at: string;
}

/** Um botão "Abrir {tela}" que o assistente sugeriu; só navega no clique. */
interface AcaoDaTela {
  rotulo: string;
  href: string;
}

interface MensagemNaTela {
  id: string;
  author_kind: "human" | "ai";
  body: string;
  /** Só na resposta recém-chegada: por que a IA não respondeu (piso). */
  aviso?: string | null;
  /** Só na resposta recém-chegada. */
  acoes?: AcaoDaTela[];
}

interface RespostaDoChat {
  thread_id: string;
  resposta?: string;
  aviso?: string | null;
  acoes?: Array<{ rotulo?: unknown; href?: unknown }>;
}

const PERGUNTA_RAPIDA = "resumo: quantas conversas abertas?";

/** A conversa da aba: só conveniência. Sem `sessionStorage` a tela funciona do mesmo jeito. */
const CHAVE_DA_CONVERSA = "deskcomm:assistente:thread";

function lerConversaGuardada(): string | null {
  try {
    return window.sessionStorage.getItem(CHAVE_DA_CONVERSA);
  } catch {
    return null;
  }
}

function guardarConversa(id: string | null): void {
  try {
    if (id === null) window.sessionStorage.removeItem(CHAVE_DA_CONVERSA);
    else window.sessionStorage.setItem(CHAVE_DA_CONVERSA, id);
  } catch {
    // Armazenamento bloqueado: a conversa continua na tela, só não sobrevive ao recarregar.
  }
}

/**
 * Só navega para dentro do produto. O `href` já sai do catálogo de navegação no
 * servidor; esta é a defesa de quem recebe: o que não começa por `/app/` não
 * vira botão (nem `//outro-site`, nem `https://…`, nem `javascript:`).
 */
function ehDestinoInterno(href: string): boolean {
  return href.startsWith("/app/");
}

function acoesValidas(acoes: RespostaDoChat["acoes"]): AcaoDaTela[] {
  if (!Array.isArray(acoes)) return [];
  const validas: AcaoDaTela[] = [];
  for (const acao of acoes) {
    if (typeof acao.rotulo !== "string" || typeof acao.href !== "string") continue;
    if (!ehDestinoInterno(acao.href)) continue;
    validas.push({ rotulo: acao.rotulo, href: acao.href });
  }
  return validas;
}

/** A frase do envelope `{ error: { message } }`, quando a rota mandou uma. */
async function mensagemDoErro(r: Response): Promise<string | null> {
  try {
    const corpo = (await r.json()) as { error?: { message?: unknown } };
    const mensagem = corpo.error?.message;
    return typeof mensagem === "string" && mensagem.trim() !== "" ? mensagem : null;
  } catch {
    return null;
  }
}

/** O texto da resposta sem o aviso que a rota já gravou na frente dele no piso. */
function corpoSemAviso(resposta: string, aviso: string | null | undefined): string {
  if (typeof aviso === "string" && aviso !== "" && resposta.startsWith(aviso)) {
    return resposta.slice(aviso.length).trim();
  }
  return resposta;
}

export function ChatDoAssistente({
  aberto,
  aoAbrirTela,
}: {
  /** O painel está visível? A primeira abertura carrega o histórico; toda abertura leva o foco ao campo. */
  aberto: boolean;
  /** Depois de um clique em "Abrir {tela}" (no celular o painel cobre a tela e precisa sair da frente). */
  aoAbrirTela: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemNaTela[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const jaIniciou = useRef(false);
  /** Cada ação da pessoa (enviar, nova conversa, abrir outra) invalida leituras que ainda voam. */
  const versao = useRef(0);
  const lista = useRef<HTMLDivElement | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);

  const carregarThreads = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/ai/assistente/threads?limite=20");
      if (!r.ok) return;
      const corpo = (await r.json()) as { data: { threads: Thread[] } };
      setThreads(corpo.data.threads);
    } catch {
      // Sem histórico: o chat funciona do mesmo jeito.
    }
  }, []);

  const abrirThread = useCallback(async (id: string) => {
    versao.current += 1;
    const minha = versao.current;
    try {
      const r = await fetch(`/api/v1/ai/assistente/threads/${id}/messages`);
      if (minha !== versao.current) return;
      if (r.status === 404) {
        // A conversa guardada não é desta organização (ou foi apagada): esquece.
        guardarConversa(null);
        setThreadId(null);
        return;
      }
      if (!r.ok) return;
      const corpo = (await r.json()) as {
        data: { mensagens: Array<{ id: string; author_kind: "human" | "ai"; body: string | null }> };
      };
      if (minha !== versao.current) return;
      setThreadId(id);
      guardarConversa(id);
      setMensagens(
        corpo.data.mensagens.flatMap((m) =>
          m.body === null ? [] : [{ id: m.id, author_kind: m.author_kind, body: m.body }],
        ),
      );
    } catch {
      // Sem rede: fica o que já estava na tela.
    }
  }, []);

  // Primeira vez que o painel abre: histórico e, se a aba guardou, a conversa em curso.
  useEffect(() => {
    if (!aberto || jaIniciou.current) return;
    jaIniciou.current = true;
    void carregarThreads();
    const guardada = lerConversaGuardada();
    if (guardada !== null) void abrirThread(guardada);
  }, [aberto, carregarThreads, abrirThread]);

  // Foco no campo de pergunta a cada abertura. Aberto pela paleta ⌘K, o foco
  // ainda pode estar preso na paleta que está fechando: uma segunda tentativa,
  // só se ninguém tiver o foco (`body`), cobre isso sem roubá-lo de quem já
  // clicou em outro lugar.
  useEffect(() => {
    if (!aberto) return;
    campo.current?.focus();
    const retentativa = window.setTimeout(() => {
      if (document.activeElement === document.body) campo.current?.focus();
    }, 350);
    return () => window.clearTimeout(retentativa);
  }, [aberto]);

  // Mensagem nova (ou "pensando…"): rola até o fim.
  useEffect(() => {
    const el = lista.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [mensagens, enviando]);

  async function perguntar(texto: string) {
    const p = texto.trim();
    if (p.length < 3 || enviando) return;
    const turnId = randomId();
    const idLocal = `local-${turnId}`;
    versao.current += 1;
    setEnviando(true);
    setErro(null);
    setMensagens((atuais) => [...atuais, { id: idLocal, author_kind: "human", body: p }]);
    setPergunta("");
    const falhou = async (r: Response | null) => {
      setMensagens((atuais) => atuais.filter((m) => m.id !== idLocal));
      setPergunta((atual) => (atual === "" ? p : atual));
      setErro((r === null ? null : await mensagemDoErro(r)) ?? t("Não foi possível perguntar agora."));
    };
    try {
      const r = await fetch("/api/v1/ai/assistente/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(threadId === null ? {} : { thread_id: threadId }),
          turn_id: turnId,
          pergunta: p,
          // Só o caminho: quem extrai o objeto aberto e confere a organização é o servidor.
          ...(pathname === null ? {} : { contexto: { caminho: pathname.slice(0, 200) } }),
        }),
      });
      if (!r.ok) {
        await falhou(r);
        return;
      }
      const { data } = (await r.json()) as { data: RespostaDoChat };
      setThreadId(data.thread_id);
      guardarConversa(data.thread_id);
      if (typeof data.resposta === "string") {
        const resposta = data.resposta;
        setMensagens((atuais) => [
          ...atuais,
          {
            id: `${turnId}-ai`,
            author_kind: "ai",
            body: corpoSemAviso(resposta, data.aviso),
            aviso: data.aviso ?? null,
            acoes: acoesValidas(data.acoes),
          },
        ]);
      } else {
        // Replay: a rota devolveu o turno gravado, sem o texto avulso.
        await abrirThread(data.thread_id);
      }
      void carregarThreads();
    } catch {
      await falhou(null);
    } finally {
      setEnviando(false);
    }
  }

  function abrirTela(href: string) {
    // A navegação só acontece aqui, no clique, e só para dentro do produto.
    if (!ehDestinoInterno(href)) return;
    router.push(href);
    aoAbrirTela();
  }

  function novaConversa() {
    versao.current += 1;
    guardarConversa(null);
    setThreadId(null);
    setMensagens([]);
    setErro(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={novaConversa}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t("Nova conversa")}
        </button>
        {threads.length > 0 ? (
          <select
            aria-label={t("Conversas")}
            value={threadId ?? ""}
            onChange={(e) => {
              if (e.target.value !== "") void abrirThread(e.target.value);
            }}
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">{t("Conversas anteriores")}</option>
            {threads.map((th) => (
              <option key={th.id} value={th.id}>
                {new Date(th.last_message_at ?? th.created_at).toLocaleString()}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div
        ref={lista}
        role="log"
        aria-live="polite"
        data-testid="assistente-mensagens"
        className="flex min-h-48 flex-1 flex-col gap-2 overflow-y-auto rounded-md border p-3"
      >
        {mensagens.map((m) => (
          <div
            key={m.id}
            className={m.author_kind === "human" ? "flex flex-col items-end gap-1" : "flex flex-col items-start gap-1"}
          >
            {m.aviso !== undefined && m.aviso !== null && m.aviso !== "" ? (
              <p role="note" className="max-w-full rounded-md border border-dashed px-3 py-2 text-xs text-text-muted">
                {m.aviso}
              </p>
            ) : null}
            {m.body !== "" ? (
              <p className="max-w-full rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{m.body}</p>
            ) : null}
            {m.acoes !== undefined && m.acoes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {m.acoes.map((acao) => (
                  <button
                    key={acao.href}
                    type="button"
                    onClick={() => abrirTela(acao.href)}
                    data-testid="assistente-acao"
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    {acao.rotulo}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {enviando ? (
          <p role="status" data-testid="assistente-pensando" className="self-start text-sm text-text-muted">
            {t("Pensando…")}
          </p>
        ) : null}
        {mensagens.length === 0 && !enviando ? (
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
          data-testid="assistente-resumo"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
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
          ref={campo}
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          maxLength={1000}
          placeholder={t("Escreva sua pergunta...")}
          aria-label={t("Pergunta")}
          data-testid="assistente-pergunta"
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={enviando || pergunta.trim().length < 3}
          data-testid="assistente-perguntar"
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          {t("Perguntar")}
        </button>
      </form>
    </div>
  );
}
