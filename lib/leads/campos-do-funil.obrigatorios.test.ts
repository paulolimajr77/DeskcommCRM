import { describe, expect, it } from "vitest";

import { obrigatoriosEmBranco } from "./campos-do-funil";
import type { CustomFieldDef } from "@/lib/schemas/settings";

/**
 * O QUE FALTA PREENCHER, ANTES DE PASSAR PARA GENTE.
 *
 * A passagem ao humano declara o que ficou em branco — e só a CHAVE, porque o
 * texto vai para o `metadata` de uma atividade renderizada na tela, que viaja
 * em captura, exportação e ticket de suporte (§9).
 *
 * ⛔ A regra NUNCA trava a passagem. Ela informa. Quem recebe decide se pergunta
 * ou se toca o atendimento assim mesmo.
 */

function campo(key: string, required?: boolean, type: CustomFieldDef["type"] = "text"): CustomFieldDef {
  return { key, label: key, type, ...(required === undefined ? {} : { required }) };
}

describe("obrigatoriosEmBranco", () => {
  it("lista só os obrigatórios que estão em branco", () => {
    const campos = [campo("segmento", true), campo("convenio", true), campo("obs")];
    expect(obrigatoriosEmBranco(campos, { segmento: "clinica" })).toEqual(["convenio"]);
  });

  it("campo opcional em branco NÃO entra — obrigatório é decisão do dono", () => {
    // Sem isto, a passagem chegaria com uma lista de tudo o que ninguém
    // preencheu, e quem recebe aprenderia a ignorar a lista inteira.
    expect(obrigatoriosEmBranco([campo("obs")], {})).toEqual([]);
    expect(obrigatoriosEmBranco([campo("obs", false)], {})).toEqual([]);
  });

  it("com tudo preenchido a lista é VAZIA, não nula", () => {
    // Vazia e nula se leem diferente em quem consome: `[]` é "conferi e não
    // falta nada"; ausência é "não conferi". A primeira é a que vale aqui.
    const r = obrigatoriosEmBranco([campo("segmento", true)], { segmento: "clinica" });
    expect(r).toEqual([]);
  });

  it("ausente, null, vazio e só espaços contam como em branco", () => {
    const campos = [campo("a", true), campo("b", true), campo("c", true), campo("d", true)];
    expect(obrigatoriosEmBranco(campos, { b: null, c: "", d: "   " })).toEqual(["a", "b", "c", "d"]);
  });

  it("lista vazia conta como em branco; lista com item, não", () => {
    const campos = [campo("tags", true, "multiselect")];
    expect(obrigatoriosEmBranco(campos, { tags: [] })).toEqual(["tags"]);
    expect(obrigatoriosEmBranco(campos, { tags: ["a"] })).toEqual([]);
  });

  it("⛔ `false` e `0` NÃO são branco — são resposta", () => {
    // O caso que mais erra na mão: "tem convênio? não" e "quantos
    // funcionários? 0" são decisões de alguém. Tratá-las como ausência faria o
    // atendente perguntar de novo o que o cliente já respondeu — e o cliente
    // lê isso como "ninguém prestou atenção".
    const campos = [campo("tem_convenio", true, "boolean"), campo("funcionarios", true, "number")];
    expect(obrigatoriosEmBranco(campos, { tem_convenio: false, funcionarios: 0 })).toEqual([]);
  });

  it("objeto vazio conta como branco; objeto com chave, não", () => {
    // Um `select` múltiplo que ninguém marcou chega como `{}`. É ausência com
    // outra roupa — achado revisando o diff, não previsto na primeira versão.
    const campos = [campo("preferencias", true, "select")];
    expect(obrigatoriosEmBranco(campos, { preferencias: {} })).toEqual(["preferencias"]);
    expect(obrigatoriosEmBranco(campos, { preferencias: { a: 1 } })).toEqual([]);
  });

  it("sem campos declarados, ou sem valores, não explode", () => {
    expect(obrigatoriosEmBranco([], { a: 1 })).toEqual([]);
    expect(obrigatoriosEmBranco([campo("a", true)], null)).toEqual(["a"]);
    expect(obrigatoriosEmBranco([campo("a", true)], undefined)).toEqual(["a"]);
  });

  it("devolve CHAVES, nunca valores", () => {
    // A cerca do §9 no nível da função pura: se algum dia alguém quiser tornar
    // a lista "mais útil" devolvendo o que está gravado, é aqui que descobre.
    const campos = [campo("diagnostico", true), campo("segmento", true)];
    const r = obrigatoriosEmBranco(campos, { segmento: "hipertensao arterial" });
    expect(JSON.stringify(r)).not.toContain("hipertensao");
    expect(r).toEqual(["diagnostico"]);
  });
});
