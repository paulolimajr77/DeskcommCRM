"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Mic, Square } from "lucide-react";

import { useT } from "@/hooks/i18n/useT";
import {
  SEGUNDOS_MAXIMOS_DA_GRAVACAO,
  TAMANHO_MAXIMO_DO_AUDIO,
} from "@/lib/assistente/transcricao/limites";

/** O tempo que a transcrição pode levar antes de a tela desistir. */
const TEMPO_DA_TRANSCRICAO_MS = 60_000;

const FORMATOS_DE_GRAVACAO = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function formatoSuportado(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return FORMATOS_DE_GRAVACAO.find((f) => MediaRecorder.isTypeSupported(f)) ?? "";
}

function extensaoDe(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function relogio(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

/**
 * O botão de microfone do campo do chat, como no WhatsApp: um clique começa a
 * gravar, outro clique para (ou o tempo máximo para sozinho). O áudio vai à rota
 * de transcrição e o TEXTO volta ao campo, para a pessoa conferir. Este botão
 * NUNCA envia a pergunta: quem envia é a pessoa.
 */
export function BotaoDeAudio({
  desabilitado,
  aoTranscrever,
  aoErro,
}: {
  desabilitado: boolean;
  /** O texto transcrito, para o campo. */
  aoTranscrever: (texto: string) => void;
  /** Uma frase pronta para a pessoa ler, já traduzida. */
  aoErro: (mensagem: string) => void;
}) {
  const t = useT();
  const [estado, setEstado] = useState<"parado" | "gravando" | "transcrevendo">("parado");
  const [segundos, setSegundos] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const relogioId = useRef<ReturnType<typeof setInterval> | null>(null);
  const descartar = useRef(false);

  const soltarMicrofone = useCallback(() => {
    if (relogioId.current !== null) clearInterval(relogioId.current);
    relogioId.current = null;
    fluxo.current?.getTracks().forEach((faixa) => faixa.stop());
    fluxo.current = null;
  }, []);

  // Sair da tela no meio da gravação larga o microfone e descarta o áudio.
  useEffect(
    () => () => {
      descartar.current = true;
      if (gravador.current !== null && gravador.current.state !== "inactive") gravador.current.stop();
      soltarMicrofone();
    },
    [soltarMicrofone],
  );

  async function transcrever(blob: Blob, mime: string) {
    setEstado("transcrevendo");
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), TEMPO_DA_TRANSCRICAO_MS);
    try {
      const corpo = new FormData();
      corpo.append("audio", new File([blob], `audio.${extensaoDe(mime)}`, { type: mime }));
      const r = await fetch("/api/v1/ai/assistente/transcrever", {
        method: "POST",
        body: corpo,
        signal: controle.signal,
      });
      if (!r.ok) {
        aoErro((await mensagemDoErro(r)) ?? t("Não consegui transcrever agora. Tente de novo."));
        return;
      }
      const { data } = (await r.json()) as { data?: { texto?: unknown } };
      if (typeof data?.texto !== "string" || data.texto.trim() === "") {
        aoErro(t("Não ouvi fala nesse áudio. Tente gravar de novo."));
        return;
      }
      aoTranscrever(data.texto.trim());
    } catch (e) {
      aoErro(
        e instanceof DOMException && e.name === "AbortError"
          ? t("A transcrição demorou demais. Tente de novo.")
          : t("Não consegui transcrever agora. Tente de novo."),
      );
    } finally {
      clearTimeout(prazo);
      setEstado("parado");
    }
  }

  async function comecar() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      aoErro(t("Este navegador não grava áudio."));
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      aoErro(t("Libere o microfone no navegador para gravar."));
      return;
    }
    fluxo.current = stream;
    const formato = formatoSuportado();
    const rec = formato === "" ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType: formato });
    gravador.current = rec;
    pedacos.current = [];
    descartar.current = false;
    rec.ondataavailable = (ev: BlobEvent) => {
      if (ev.data.size > 0) pedacos.current.push(ev.data);
    };
    rec.onstop = () => {
      soltarMicrofone();
      if (descartar.current) return;
      const mime = (rec.mimeType || formato || "audio/webm").split(";")[0]!.trim();
      const blob = new Blob(pedacos.current, { type: mime });
      pedacos.current = [];
      if (blob.size === 0) {
        setEstado("parado");
        aoErro(t("O áudio veio vazio. Tente gravar de novo."));
        return;
      }
      if (blob.size > TAMANHO_MAXIMO_DO_AUDIO) {
        setEstado("parado");
        aoErro(t("O áudio é grande demais."));
        return;
      }
      void transcrever(blob, mime);
    };
    setSegundos(0);
    setEstado("gravando");
    rec.start();
    relogioId.current = setInterval(() => {
      setSegundos((s) => {
        const proximo = s + 1;
        if (proximo >= SEGUNDOS_MAXIMOS_DA_GRAVACAO) parar();
        return proximo;
      });
    }, 1000);
  }

  function parar() {
    const rec = gravador.current;
    if (rec !== null && rec.state !== "inactive") rec.stop();
    if (relogioId.current !== null) clearInterval(relogioId.current);
    relogioId.current = null;
  }

  const gravando = estado === "gravando";
  const transcrevendo = estado === "transcrevendo";

  return (
    <div className="flex items-center gap-2">
      {gravando ? (
        <span
          role="timer"
          data-testid="assistente-audio-contador"
          className="text-sm tabular-nums text-destructive"
        >
          {relogio(segundos)} / {relogio(SEGUNDOS_MAXIMOS_DA_GRAVACAO)}
        </span>
      ) : null}
      {transcrevendo ? (
        <span role="status" className="text-sm text-text-muted">
          {t("Transcrevendo…")}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => (gravando ? parar() : void comecar())}
        disabled={desabilitado || transcrevendo}
        aria-pressed={gravando}
        aria-label={gravando ? t("Parar a gravação") : t("Gravar áudio")}
        title={gravando ? t("Parar a gravação") : t("Gravar áudio")}
        data-testid="assistente-audio"
        className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
      >
        {gravando ? <Square className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
