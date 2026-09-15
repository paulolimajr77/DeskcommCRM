import { describe, expect, it } from "vitest";

import {
  avaliarPropostaDeCampo,
  tituloDaProposta,
  corpoDaProposta,
  TETO_DE_CAMPOS_POR_FUNIL,
} from "./proposta-de-campo-novo";
import type { CustomFieldDef } from "@/lib/schemas/settings";

function campo(key: string): CustomFieldDef {
  return { key, label: key, type: "text" };
}

describe("avaliarPropostaDeCampo", () => {
  it("chave válida e rótulo preenchido: propõe, normalizados", () => {
    const r = avaliarPropostaDeCampo({ key: "  Origem_Do_Lead ", label: "  Origem  " }, []);
    expect(r).toEqual({ propor: true, key: "origem_do_lead", label: "Origem" });
  });

  it("⛔ campo que JÁ existe não vira proposta — nem em outra grafia", () => {
    // O modelo vai propor `Segmento`, `segmento ` e `SEGMENTO` em conversas
    // diferentes, e as três são o mesmo campo. Sem normalizar, a Central enche
    // de propostas do que já existe — e quem administra aprende a ignorar a
    // fila inteira, que é o pior desfecho possível.
    const existentes = [campo("segmento")];
    for (const k of ["segmento", "Segmento", " SEGMENTO "]) {
      expect(avaliarPropostaDeCampo({ key: k, label: "Segmento" }, existentes)).toEqual({
        propor: false,
        motivo: "ja_existe",
      });
    }
  });

  it("chave que não é identificador é recusada", () => {
    for (const k of ["", "  ", "1campo", "campo-com-hifen", "campo com espaço", "Ç"]) {
      const r = avaliarPropostaDeCampo({ key: k, label: "X" }, []);
      expect(r.propor, `aceitou a chave ${JSON.stringify(k)}`).toBe(false);
      expect(r.propor === false && r.motivo).toBe("chave_invalida");
    }
  });

  it("rótulo vazio é recusado — o aviso precisa dizer algo a quem lê", () => {
    expect(avaliarPropostaDeCampo({ key: "origem", label: "   " }, [])).toEqual({
      propor: false,
      motivo: "rotulo_vazio",
    });
  });

  it("valor que não é string vira recusa, não estouro", () => {
    // Vem de uma ferramenta chamada pelo MODELO: o argumento pode ser qualquer
    // coisa. `.trim()` num número mataria o turno inteiro.
    expect(avaliarPropostaDeCampo({ key: 123, label: {} }, []).propor).toBe(false);
    expect(() => avaliarPropostaDeCampo({ key: null, label: undefined }, [])).not.toThrow();
  });

  it("funil no teto recusa — e o teto é sobre o CUSTO de cada turno", () => {
    // Cada campo entra no prefixo de TODO turno daquele agente. Sem teto, um
    // agente insistente vira um formulário de cinquenta perguntas e o custo de
    // cada conversa cresce junto, na chave de quem hospeda.
    const cheio = Array.from({ length: TETO_DE_CAMPOS_POR_FUNIL }, (_, i) => campo(`c${i}`));
    expect(avaliarPropostaDeCampo({ key: "novo", label: "Novo" }, cheio)).toEqual({
      propor: false,
      motivo: "funil_no_teto",
    });
    // E um a menos ainda aceita — sem isto o teste passaria com o teto errado.
    expect(avaliarPropostaDeCampo({ key: "novo", label: "Novo" }, cheio.slice(1)).propor).toBe(true);
  });

  it("⛔ num funil CHEIO, propor o que já existe diz `ja_existe`, não `funil_no_teto`", () => {
    // A ordem das recusas importa: dizer "funil cheio" aqui mandaria quem
    // administra apagar um campo para criar o que ele JÁ TEM.
    const cheio = Array.from({ length: TETO_DE_CAMPOS_POR_FUNIL }, (_, i) => campo(`c${i}`));
    expect(avaliarPropostaDeCampo({ key: "c0", label: "C0" }, cheio)).toEqual({
      propor: false,
      motivo: "ja_existe",
    });
  });
});

describe("tituloDaProposta — ele É a chave da idempotência", () => {
  it("nomeia o campo", () => {
    expect(tituloDaProposta("Origem")).toContain("Origem");
  });

  it("⛔ NÃO carrega o trecho do cliente — e essa é a razão de ele existir", () => {
    // O título é o que impede o aviso de nascer de novo a cada turno. O trecho
    // vem do MODELO: muda uma vírgula, muda o título, nasce aviso novo, e a
    // Central enche de cópias do mesmo pedido. A primeira versão desta função
    // punha o trecho aqui; o defeito apareceu revisando o diff.
    const a = tituloDaProposta("Origem");
    const b = tituloDaProposta("Origem");
    expect(a).toBe(b);
  });

  it("rótulo com espaços ou quebra de linha não muda o título", () => {
    // Mesma razão: o rótulo também vem do modelo.
    expect(tituloDaProposta("  Origem  ")).toBe(tituloDaProposta("Origem"));
    expect(tituloDaProposta("Origem\ndo lead")).toBe(tituloDaProposta("Origem do lead"));
  });

  it("rótulo gigante é recortado — isto é um TÍTULO", () => {
    expect(tituloDaProposta("x".repeat(300)).length).toBeLessThan(140);
  });
});

describe("corpoDaProposta — onde a evidência mora", () => {
  const base = { key: "origem", label: "Origem", funil: "Clientes" };

  it("cita o que o cliente disse, e diz o que fazer", () => {
    const c = corpoDaProposta({ ...base, trecho: "vocês anotam de onde eu vim?" });
    expect(c).toContain("vocês anotam de onde eu vim?");
    expect(c).toContain("Configurações › Funis");
    // E deixa claro que nada aconteceu ainda.
    expect(c).toMatch(/nada foi criado/i);
  });

  it("sem trecho, não inventa aspas vazias", () => {
    for (const vazio of [null, undefined, "   "]) {
      const c = corpoDaProposta({ ...base, trecho: vazio });
      expect(c).not.toContain('disse: ""');
      expect(c).toContain("Origem");
    }
  });

  it("quebra de linha no trecho vira espaço", () => {
    // O corpo é renderizado na Central; linha solta quebra a leitura do aviso.
    const c = corpoDaProposta({ ...base, trecho: "primeira\nsegunda" });
    expect(c).not.toContain("\n");
    expect(c).toContain("primeira segunda");
  });

  it("funil ausente não deixa buraco na frase", () => {
    const c = corpoDaProposta({ ...base, funil: null, trecho: null });
    expect(c).not.toContain('no funil ""');
  });
});
