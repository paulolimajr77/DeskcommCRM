/**
 * Transcrever o áudio do chat — o que a biblioteca decide, com a escada e a
 * chave dublês: usa a escada que já existe (não outra), grava o custo com a
 * origem do degrau, resolve a chave da organização DA SESSÃO, e sem quem
 * transcreva devolve `sem_chave` sem chamar nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveOrgLlmConfig: vi.fn(),
  decidirTranscricao: vi.fn(),
  registrarChamadaDeIa: vi.fn(async () => undefined),
  motivoDaRecusaDeDestino: vi.fn(async () => null as string | null),
  env: { TRANSCRIPTION_BASE_URL: "" },
}));

vi.mock("@/lib/agent-engine/edge/llm/credentials", () => ({
  resolveOrgLlmConfig: mocks.resolveOrgLlmConfig,
}));
vi.mock("@/lib/messaging/media/escada-de-transcricao", () => ({
  decidirTranscricao: mocks.decidirTranscricao,
}));
vi.mock("@/lib/ai/usage/registrar-chamada", () => ({
  registrarChamadaDeIa: mocks.registrarChamadaDeIa,
}));
vi.mock("@/lib/automation/destinos-internos-autorizados", () => ({
  motivoDaRecusaDeDestino: mocks.motivoDaRecusaDeDestino,
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

const { transcreverAudioDoChat } = await import("@/lib/assistente/transcricao/transcrever");

const ORG = "11111111-2222-4333-8444-555555555551";
const entrada = () =>
  ({
    pool: {} as never,
    llmCfg: {} as never,
    admin: {} as never,
    orgId: ORG,
    audio: Buffer.from([1, 2, 3]),
    mime: "audio/webm",
  }) satisfies Parameters<typeof transcreverAudioDoChat>[0];

function decisao(transcribe: (a: Buffer, m: string) => Promise<string>) {
  return {
    origem: "padrao_openai_compativel",
    transcriber: { transcribe },
    motivo: "x",
    anuncio: { provider: "openai", modelId: "whisper-1" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.TRANSCRIPTION_BASE_URL = "";
  mocks.resolveOrgLlmConfig.mockResolvedValue({
    provider: "openai",
    apiKey: "sk-teste",
    defaultModel: "gpt-5",
  });
});

describe("transcreverAudioDoChat", () => {
  it("transcreve pela escada existente e grava o custo com a origem e a organização da sessão", async () => {
    mocks.decidirTranscricao.mockResolvedValue(decisao(async () => "  oi, tudo bem  "));

    const r = await transcreverAudioDoChat(entrada());

    expect(r).toEqual({ ok: true, texto: "oi, tudo bem" });
    expect(mocks.resolveOrgLlmConfig).toHaveBeenCalledWith(expect.anything(), expect.anything(), ORG);
    expect(mocks.registrarChamadaDeIa).toHaveBeenCalledTimes(1);
    const linha = (mocks.registrarChamadaDeIa.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(linha).toMatchObject({
      organization_id: ORG,
      purpose: "transcricao_de_audio",
      origem_da_escolha: "padrao_openai_compativel",
      cost_cents: null,
    });
    expect(JSON.stringify(linha)).not.toContain("oi, tudo bem");
  });

  it("sem quem transcreva devolve sem_chave e não chama nada", async () => {
    mocks.decidirTranscricao.mockResolvedValue({
      origem: "nada",
      transcriber: null,
      motivo: "nenhum",
      anuncio: { provider: "", modelId: null },
    });

    const r = await transcreverAudioDoChat(entrada());

    expect(r).toEqual({ ok: false, motivo: "sem_chave" });
    expect(mocks.registrarChamadaDeIa).not.toHaveBeenCalled();
  });

  it("organização sem credencial nenhuma ainda consulta a escada (que decide pela chave da instalação)", async () => {
    mocks.resolveOrgLlmConfig.mockRejectedValue(new Error("sem credencial"));
    mocks.decidirTranscricao.mockResolvedValue(decisao(async () => "texto"));

    const r = await transcreverAudioDoChat(entrada());

    expect(r.ok).toBe(true);
    expect(mocks.decidirTranscricao).toHaveBeenCalledTimes(1);
  });

  it("transcrição sem fala vira audio_vazio", async () => {
    mocks.decidirTranscricao.mockResolvedValue(decisao(async () => "   "));
    expect(await transcreverAudioDoChat(entrada())).toEqual({ ok: false, motivo: "audio_vazio" });
  });

  it("falha do provedor vira 'falhou' e deixa a linha de erro", async () => {
    mocks.decidirTranscricao.mockResolvedValue(
      decisao(async () => {
        throw new Error("401");
      }),
    );

    expect(await transcreverAudioDoChat(entrada())).toEqual({ ok: false, motivo: "falhou" });
    const linha = (mocks.registrarChamadaDeIa.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(linha.erro).toEqual({ message: "401" });
  });

  it("o serviço da instalação com endereço recusado não recebe o áudio", async () => {
    const transcribe = vi.fn(async () => "x");
    mocks.env.TRANSCRIPTION_BASE_URL = "http://10.0.0.5";
    mocks.motivoDaRecusaDeDestino.mockResolvedValue("rede interna");
    mocks.decidirTranscricao.mockResolvedValue({
      ...decisao(transcribe),
      origem: "servico_da_instalacao",
    });

    expect(await transcreverAudioDoChat(entrada())).toEqual({ ok: false, motivo: "destino_recusado" });
    expect(transcribe).not.toHaveBeenCalled();
  });
});
