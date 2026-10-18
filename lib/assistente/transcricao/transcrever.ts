/**
 * Transcrever o áudio que a pessoa gravou no campo do chat do assistente.
 *
 * NÃO é um caminho novo de transcrição: usa a MESMA escada do WhatsApp
 * (`decidirTranscricao`, em `lib/messaging/media/escada-de-transcricao.ts`) e a
 * MESMA resolução de chave (`resolveOrgLlmConfig`, a credencial da organização
 * antes da chave da instalação). O ponto de IA é `transcricao_de_audio`.
 *
 * O áudio passa só pela memória: nada é gravado em disco, em storage ou no log.
 * O custo vira uma linha em `llm_calls` (sem o áudio), como as demais mídias.
 */
import type pg from "pg";

import {
  resolveOrgLlmConfig,
  type LlmEdgeConfig,
} from "@/lib/agent-engine/edge/llm/credentials";
import { costCents } from "@/lib/agent-engine/edge/llm/pricing";
import { PONTO_TRANSCRICAO_DE_AUDIO } from "@/lib/ai/pontos/registro";
import { registrarChamadaDeIa } from "@/lib/ai/usage/registrar-chamada";
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  decidirTranscricao,
  type ConversaDaOrganizacao,
} from "@/lib/messaging/media/escada-de-transcricao";
import type { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoDaTranscricao =
  | { ok: true; texto: string }
  | { ok: false; motivo: "sem_chave" | "audio_vazio" | "destino_recusado" | "falhou" };

export async function transcreverAudioDoChat(entrada: {
  pool: pg.Pool;
  llmCfg: LlmEdgeConfig;
  admin: ReturnType<typeof createAdminClient>;
  /** Da SESSÃO — nunca do corpo. */
  orgId: string;
  audio: Buffer;
  mime: string;
}): Promise<ResultadoDaTranscricao> {
  const { pool, llmCfg, admin, orgId, audio, mime } = entrada;

  // O modelo de CONVERSA da organização: é o degrau 3 da escada. Pode não
  // existir credencial nenhuma; aí o degrau simplesmente não vale.
  let conversa: ConversaDaOrganizacao | null = null;
  try {
    const llm = await resolveOrgLlmConfig(pool, llmCfg, orgId);
    conversa = { provider: llm.provider, apiKey: llm.apiKey, modelId: llm.defaultModel };
  } catch {
    conversa = null;
  }

  const chaveOpenai = async (): Promise<string | null> => {
    if (conversa?.provider === "openai") return conversa.apiKey;
    try {
      return (await resolveOrgLlmConfig(pool, llmCfg, orgId, { provider: "openai" })).apiKey;
    } catch {
      return null;
    }
  };

  const decisao = await decidirTranscricao({ conversa, chaveOpenai });
  if (decisao.transcriber === null) return { ok: false, motivo: "sem_chave" };

  // O endereço do serviço da instalação vem do `.env`, e a chamada leva a chave
  // no cabeçalho: a mesma recusa de destino do worker, antes de a chave sair.
  if (decisao.origem === "servico_da_instalacao" && env.TRANSCRIPTION_BASE_URL) {
    const recusa = await motivoDaRecusaDeDestino(env.TRANSCRIPTION_BASE_URL, "instalacao");
    if (recusa) return { ok: false, motivo: "destino_recusado" };
  }

  const provider = decisao.anuncio.provider;
  const model = decisao.anuncio.modelId ?? "";
  const inicio = Date.now();
  try {
    let texto: string;
    let uso: Awaited<ReturnType<NonNullable<typeof decisao.transcriber.transcribeMedindo>>>["uso"] | null =
      null;
    if (decisao.transcriber.transcribeMedindo) {
      ({ texto, uso } = await decisao.transcriber.transcribeMedindo(audio, mime));
    } else {
      texto = await decisao.transcriber.transcribe(audio, mime);
    }
    await registrarChamadaDeIa(admin, {
      organization_id: orgId,
      purpose: PONTO_TRANSCRICAO_DE_AUDIO,
      provider,
      model,
      origem_da_escolha: decisao.origem,
      input_tokens: uso?.inputTokens ?? 0,
      output_tokens: uso?.outputTokens ?? 0,
      // Serviço de transcrição tem preço próprio, que o sistema não conhece: nulo, nunca 0.
      cost_cents: uso ? costCents(model, uso) : null,
      latency_ms: Date.now() - inicio,
    });
    const limpo = texto.trim();
    return limpo === "" ? { ok: false, motivo: "audio_vazio" } : { ok: true, texto: limpo };
  } catch (erro) {
    await registrarChamadaDeIa(admin, {
      organization_id: orgId,
      purpose: PONTO_TRANSCRICAO_DE_AUDIO,
      provider,
      model,
      origem_da_escolha: decisao.origem,
      input_tokens: 0,
      output_tokens: 0,
      cost_cents: null,
      latency_ms: Date.now() - inicio,
      erro: { message: erro instanceof Error ? erro.message : String(erro) },
    });
    logger.warn("assistente.transcrever.falhou", {
      organization_id: orgId,
      origem: decisao.origem,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return { ok: false, motivo: "falhou" };
  }
}
