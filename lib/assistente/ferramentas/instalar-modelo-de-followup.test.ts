/**
 * `instalar_modelo_de_followup`: instala um modelo do catálogo como RASCUNHO,
 * por dentro da rota `from-model`. Modelo que pede etapa sem `etapa_id` nem
 * chama a rota; o corpo nunca leva `organization_id`.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { chamar, montarParaTeste } from "./auxiliar-de-teste";
import { sobreporHandlerDeInstalacao } from "./instalar-modelo-de-followup";

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface CorpoCapturado {
  metodo: string;
  corpo: Record<string, unknown> | null;
}

const ETAPA = "33333333-3333-4333-8333-333333333333";
const PONTEIRO = {
  id: "ptr-1",
  name: "Exame · marcar o exame que foi pedido",
  status: "draft",
  handoff_policy: "pause",
  trigger_config: { kind: "stage_change" },
};

function ligar(opcoes: {
  status?: number;
  corpo?: unknown;
  captura?: CorpoCapturado;
}): void {
  const handler: HandlerDeRota = async (req) => {
    if (opcoes.captura) {
      opcoes.captura.metodo = req.method;
      try {
        opcoes.captura.corpo = (await req.json()) as Record<string, unknown>;
      } catch {
        opcoes.captura.corpo = null;
      }
    }
    return respostaJson(opcoes.status ?? 201, { data: opcoes.corpo ?? PONTEIRO });
  };
  sobreporHandlerDeInstalacao(handler);
}

describe("instalar_modelo_de_followup", () => {
  afterEach(() => {
    sobreporHandlerDeInstalacao(null);
  });

  it("modelo que pede etapa sem etapa_id: falta_etapa, e o POST NÃO é chamado", async () => {
    const captura: CorpoCapturado = { metodo: "", corpo: null };
    ligar({ captura });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar<{ ok: boolean; motivo: string; detalhe: string }>(
      ferramentas,
      "instalar_modelo_de_followup",
      { model_id: "clinica-exame-marcar" },
    );

    expect(saida.ok).toBe(false);
    expect(saida.motivo).toBe("falta_etapa");
    expect(saida.detalhe).toContain("PRECISO CONFIRMAR");
    expect(captura.metodo).toBe("");
    expect(captura.corpo).toBeNull();
  });

  it("com etapa: POST recebe {model_id, stage_id, name} e a saída é o rascunho", async () => {
    const captura: CorpoCapturado = { metodo: "", corpo: null };
    ligar({ captura });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "instalar_modelo_de_followup", {
      model_id: "clinica-exame-marcar",
      etapa_id: ETAPA,
      nome: "Exame da clínica",
    });

    expect(captura.metodo).toBe("POST");
    expect(captura.corpo).toEqual({
      model_id: "clinica-exame-marcar",
      stage_id: ETAPA,
      name: "Exame da clínica",
    });
    expect(JSON.stringify(captura.corpo)).not.toContain("organization_id");
    expect(saida).toMatchObject({
      ok: true,
      followup: { id: "ptr-1", nome: PONTEIRO.name, estado: "rascunho" },
      aviso: expect.stringContaining("PUBLICADO"),
    });
  });

  it("modelo que não pede etapa: sem etapa_id, o corpo sai só com model_id", async () => {
    const captura: CorpoCapturado = { metodo: "", corpo: null };
    ligar({ captura });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "instalar_modelo_de_followup", {
      model_id: "clinica-consulta-retomada",
    });

    expect(captura.corpo).toEqual({ model_id: "clinica-consulta-retomada" });
    expect(saida).toMatchObject({ ok: true, followup: { estado: "rascunho" } });
  });

  it("201 com status diferente de draft: indisponivel (não expõe a linha)", async () => {
    ligar({ corpo: { id: "ptr-1", name: "X", status: "active" } });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "instalar_modelo_de_followup", {
      model_id: "clinica-consulta-retomada",
    });

    expect(saida).toEqual({ ok: false, motivo: "indisponivel" });
  });

  it("409 vira ja_existe; 422 vira pedido_invalido", async () => {
    const { ferramentas } = montarParaTeste("admin");

    ligar({ status: 409, corpo: { error: { code: "conflict" } } });
    expect(
      await chamar(ferramentas, "instalar_modelo_de_followup", {
        model_id: "clinica-consulta-retomada",
      }),
    ).toEqual({ ok: false, motivo: "ja_existe" });

    ligar({ status: 422, corpo: { error: { code: "validation_failed" } } });
    expect(
      await chamar(ferramentas, "instalar_modelo_de_followup", {
        model_id: "clinica-consulta-retomada",
      }),
    ).toEqual({ ok: false, motivo: "pedido_invalido" });
  });

  it("500 vira indisponivel, sem vazar o corpo", async () => {
    ligar({ status: 500, corpo: { error: { code: "x", message: "SEGREDO-CORPO" } } });
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "instalar_modelo_de_followup", {
      model_id: "clinica-consulta-retomada",
    });

    expect(saida).toEqual({ ok: false, motivo: "indisponivel" });
    expect(JSON.stringify(saida)).not.toContain("SEGREDO-CORPO");
  });

  it("model_id fora do catálogo é recusado pelo esquema, sem chamar a rota", async () => {
    let chamou = false;
    const handler: HandlerDeRota = async () => {
      chamou = true;
      return respostaJson(201, { data: PONTEIRO });
    };
    sobreporHandlerDeInstalacao(handler);
    const { ferramentas } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "instalar_modelo_de_followup", {
      model_id: "modelo-inventado",
    });

    expect(saida).toEqual({ ok: false, motivo: "parametro_invalido" });
    expect(chamou).toBe(false);
  });
});
