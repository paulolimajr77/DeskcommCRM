// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { metricaCanais, sobreporHandlerDeCanais } from "@/lib/assistente/metricas/adaptadores/canais";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta } from "@/lib/assistente/metricas/tipos";

const CTX_VIEWER: ContextoDeConsulta = {
  orgId: "org-1",
  papel: "viewer",
  idioma: "pt-BR",
  fuso: "America/Sao_Paulo",
  agoraIso: "2026-10-14T09:00:00-03:00",
  bancoDosModulos: {} as ContextoDeConsulta["bancoDosModulos"],
};
const CTX_AGENT: ContextoDeConsulta = { ...CTX_VIEWER, papel: "agent" };

function handlerDe(status: number, corpo: unknown, captura?: { url?: string }) {
  const handler: HandlerDeRota = async (req) => {
    if (captura) captura.url = req.url;
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  };
  return handler;
}

const payloadSujo = () => ({
  window: { from: "x", to: "y" },
  owner_user_id: null,
  channels: [
    {
      channel_session_id: "11111111-1111-1111-1111-111111111111",
      channel_name: "+5511999999999", // ← número de telefone, dado de contato
      channel: "whatsapp",
      is_archived: false,
      conversations_handled: 12,
      avg_first_response_seconds: 42,
      sem_resposta: 3,
    },
  ],
});

afterEach(() => sobreporHandlerDeCanais(null));

describe("canais — fim exclusivo e piso agent", () => {
  it("manda from=deInstante e to=ateInstanteExclusivo", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDeCanais(handlerDe(200, { data: { window: {}, owner_user_id: null, channels: [] } }, captura));
    await metricaCanais.executar(CTX_AGENT, {});
    const url = new URL(captura.url ?? "");
    expect(url.searchParams.get("from")).toBe("2026-10-05T03:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-10-12T03:00:00.000Z");
  });

  it("viewer fica sem_permissao SEM chamar a rota", async () => {
    const handler = vi.fn(handlerDe(200, { data: payloadSujo() }));
    sobreporHandlerDeCanais(handler);
    const resultado = await consultarMetrica(CTX_VIEWER, "canais", {});
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao", papel_minimo: "agent" });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("canais — o nome do canal (número no WhatsApp) NÃO sai", () => {
  it("payload sujo: channel_name e owner_user_id são removidos", async () => {
    sobreporHandlerDeCanais(handlerDe(200, { data: payloadSujo() }));
    const resultado = await metricaCanais.executar(CTX_AGENT, {});
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const texto = JSON.stringify(resultado.dados);
      expect(texto).not.toContain("+5511999999999");
      expect(texto).not.toContain("channel_name");
      expect(texto).not.toContain("owner_user_id");
      const dados = resultado.dados as { channels: { channel: string; conversations_handled: number }[] };
      expect(dados.channels[0]).toMatchObject({ channel: "whatsapp", conversations_handled: 12, sem_resposta: 3 });
    }
  });
});
