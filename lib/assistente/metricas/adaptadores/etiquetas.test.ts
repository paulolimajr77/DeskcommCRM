// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { metricaEtiquetas, sobreporHandlerDeEtiquetas } from "@/lib/assistente/metricas";
import { consultarMetrica } from "@/lib/assistente/metricas/registro";
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";
import type { ContextoDeConsulta, ResultadoDeMetrica } from "@/lib/assistente/metricas/tipos";
import { resolverPeriodo } from "../periodo";

function dadosDe<T>(r: ResultadoDeMetrica): T {
  if (!r.ok || r.dados === null || r.dados === undefined) throw new Error("esperava dados");
  return r.dados as T;
}

const CTX_VIEWER: ContextoDeConsulta = {
  orgId: "org-1",
  papel: "viewer",
  idioma: "pt-BR",
  fuso: "America/Sao_Paulo",
  agoraIso: "2026-10-14T09:00:00-03:00",
  bancoDosModulos: {} as ContextoDeConsulta["bancoDosModulos"],
};

function handlerDe(status: number, corpo: unknown, captura?: { url?: string }): HandlerDeRota {
  return async (req) => {
    if (captura) captura.url = req.url;
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  };
}

const payloadValido = () => ({
  janela: { de: "2026-10-07", ate: "2026-10-14", tz: "America/Sao_Paulo" },
  linhas: [{ etiqueta: "Site", conversas: 2, abertas: 1, resolvidas: 1, espera_media_segundos: 5, fatia: 100 }],
  total_etiquetagens: 2,
  sem_dados: false,
  motivo: null,
  truncado: false,
});

describe("etiquetas — adapter", () => {
  it("URL capturada: de/ate comparados com resolverPeriodo, tz = America/Sao_Paulo", async () => {
    const captura: { url?: string } = {};
    sobreporHandlerDeEtiquetas(handlerDe(200, { data: payloadValido() }, captura));
    await metricaEtiquetas.executar(CTX_VIEWER, {});
    const u = new URL(captura.url ?? "");
    const esperado = resolverPeriodo({ tipo: "semana_passada" }, CTX_VIEWER.agoraIso, CTX_VIEWER.fuso, CTX_VIEWER.idioma);
    expect(u.searchParams.get("de")).toBe(esperado.de);
    expect(u.searchParams.get("ate")).toBe(esperado.ateInclusivo);
    expect(u.searchParams.get("tz")).toBe("America/Sao_Paulo");
  });

  it("motivo e sem_dados não saem em JSON.stringify(dados) mesmo com motivo preenchido", async () => {
    const payload = { ...payloadValido(), motivo: "teste_motivo" };
    sobreporHandlerDeEtiquetas(handlerDe(200, { data: payload }));
    const r = await metricaEtiquetas.executar(CTX_VIEWER, {});
    expect(r.ok).toBe(true);
    if (r.ok && r.dados) {
      const s = JSON.stringify(r.dados);
      expect(s).not.toContain("motivo");
      expect(s).not.toContain("sem_dados");
    }
  });

  it("amostra zero (sem_dados=true, motivo=nenhuma_etiqueta_em_uso) → dados null + aviso exato", async () => {
    sobreporHandlerDeEtiquetas(
      handlerDe(200, {
        data: { ...payloadValido(), linhas: [], total_etiquetagens: 0, sem_dados: true, motivo: "nenhuma_etiqueta_em_uso" },
      }),
    );
    const r = await metricaEtiquetas.executar(CTX_VIEWER, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados).toBeNull();
      expect(r.avisos).toContain("Nenhuma etiqueta em uso nesta organização.");
    }
  });

  it("amostra zero (sem_dados=true, motivo=nenhuma_conversa_com_etiqueta_no_periodo) → dados null + aviso exato", async () => {
    sobreporHandlerDeEtiquetas(
      handlerDe(200, {
        data: { ...payloadValido(), linhas: [], total_etiquetagens: 0, sem_dados: true, motivo: "nenhuma_conversa_com_etiqueta_no_periodo" },
      }),
    );
    const r = await metricaEtiquetas.executar(CTX_VIEWER, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados).toBeNull();
      expect(r.avisos).toContain("Sem conversas com etiqueta no período.");
    }
  });

  it("amostra zero (sem_dados=true, outro motivo) → dados null + aviso 'Sem dados no período.'", async () => {
    sobreporHandlerDeEtiquetas(
      handlerDe(200, {
        data: { ...payloadValido(), linhas: [], total_etiquetagens: 0, sem_dados: true, motivo: "outro" },
      }),
    );
    const r = await metricaEtiquetas.executar(CTX_VIEWER, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados).toBeNull();
      expect(r.avisos).toContain("Sem dados no período.");
    }
  });

  it("truncado: true → aviso exato", async () => {
    sobreporHandlerDeEtiquetas(handlerDe(200, { data: { ...payloadValido(), truncado: true } }));
    const r = await metricaEtiquetas.executar(CTX_VIEWER, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.avisos).toContain("Havia mais conversas do que a leitura alcança (limite de 10 mil); os números são do trecho mais recente.");
    }
  });

  it("etiqueta de 80 caracteres sai com 60", async () => {
    const longa = "a".repeat(80);
    sobreporHandlerDeEtiquetas(
      handlerDe(200, {
        data: { ...payloadValido(), linhas: [{ etiqueta: longa, conversas: 1, abertas: 0, resolvidas: 1, espera_media_segundos: null, fatia: 100 }] },
      }),
    );
    const r = await metricaEtiquetas.executar(CTX_VIEWER, {});
    expect(r.ok).toBe(true);
    const d = dadosDe<{ linhas: { etiqueta: string }[] }>(r);
    expect(d.linhas[0]?.etiqueta).toBe("a".repeat(60));
  });

  it("formato inesperado → indisponivel", async () => {
    sobreporHandlerDeEtiquetas(handlerDe(200, { data: { janela: "invalido" } }));
    const r = await metricaEtiquetas.executar(CTX_VIEWER, {});
    expect(r).toMatchObject({ ok: false, motivo: "indisponivel" });
  });

  it("recusa >90 dias SEM chamar rota (consultarMetrica)", async () => {
    const h = vi.fn(handlerDe(200, { data: payloadValido() }));
    sobreporHandlerDeEtiquetas(h);
    const r = await consultarMetrica(CTX_VIEWER, "etiquetas", {
      periodo: { tipo: "intervalo", de: "2020-01-01", ate: "2021-02-01" },
    });
    expect(r).toMatchObject({ ok: false, motivo: "parametro_invalido" });
    expect(h).not.toHaveBeenCalled();
  });

  it("403 → sem_permissao", async () => {
    sobreporHandlerDeEtiquetas(handlerDe(403, {}));
    const r = await metricaEtiquetas.executar(CTX_VIEWER, {});
    expect(r).toMatchObject({ ok: false, motivo: "sem_permissao" });
  });
});
