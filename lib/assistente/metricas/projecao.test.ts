import { describe, expect, it } from "vitest";
import { z } from "zod";

import { chavesProibidasEm, projetar } from "@/lib/assistente/metricas/projecao";

const esquema = z.object({
  a: z.number(),
  dentro: z.object({ b: z.string() }),
  itens: z.array(z.object({ nome: z.string() })),
});

describe("projetar — lista positiva de campos", () => {
  it("remove chave desconhecida em QUALQUER nível", () => {
    const resultado = projetar(esquema, {
      a: 1,
      extra_no_topo: "x",
      dentro: { b: "s", email: "cliente@empresa.com" },
      itens: [{ nome: "Pix", cpf: "123" }],
    });
    expect(resultado).toEqual({
      ok: true,
      dados: { a: 1, dentro: { b: "s" }, itens: [{ nome: "Pix" }] },
    });
  });

  it("formato que mudou não lança: parse falhando vira { ok: false }", () => {
    expect(projetar(esquema, { a: "virou-texto", dentro: {}, itens: [] })).toEqual({ ok: false });
    expect(projetar(esquema, null)).toEqual({ ok: false });
    expect(projetar(esquema, undefined)).toEqual({ ok: false });
  });
});

describe("chavesProibidasEm — o cinto por cima do suspensório", () => {
  it("acha chave proibida escondida em lista dentro de objeto dentro de lista", () => {
    const valor = [{ lote: [{ itens: [{ ok: 1, contact_id: "c1" }] }] }];
    expect(chavesProibidasEm(valor)).toEqual(["contact_id"]);
  });

  it("devolve todas as proibidas, ordenadas e sem repetição", () => {
    const valor = {
      email: "a@b.c",
      lista: [{ user_id: "u1" }, { user_id: "u2", last_message_preview: "texto" }],
      body: "mensagem",
    };
    expect(chavesProibidasEm(valor)).toEqual(["body", "email", "last_message_preview", "user_id"]);
  });

  it("não marca chave parecida, só a exata", () => {
    expect(chavesProibidasEm({ email_count: 1, phonebook: "x", user_id_field: 1 })).toEqual([]);
  });

  it("aguenta ciclo de objetos sem travar", () => {
    const a: Record<string, unknown> = { nome: "a" };
    const b: Record<string, unknown> = { volta: a, contact_name: "Cliente" };
    a.volta = b;
    expect(chavesProibidasEm(a)).toEqual(["contact_name"]);
  });

  it("cada chave da T3a-REPARO é detectada", () => {
    const chaves = ["owner_user_id", "stage_id", "userId", "agentId", "channel_name", "lost_reason", "motivo"];
    for (const c of chaves) {
      expect(chavesProibidasEm({ [c]: "x" })).toEqual([c]);
    }
  });

  it("por_servico[].nome NÃO é detectado (dinheiro legítimo)", () => {
    const valor = { por_servico: [{ nome: "Pix", total_cents: 100 }] };
    expect(chavesProibidasEm(valor)).toEqual([]);
  });
});
