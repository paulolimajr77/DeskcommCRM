/**
 * O ESTADO DOS MÓDULOS NO CONTEXTO DO ASSISTENTE.
 *
 * Os interruptores de módulo moram em `platform_config` e `modulos_instalados`,
 * que NÃO têm policy para `authenticated`. Lidos pelo cliente da sessão, a
 * leitura é negada e `modulosLigados` falha fechada — toda instalação parece não
 * ter módulo nenhum, e uma métrica de módulo responde "esta instalação não usa
 * isso" mesmo com o módulo ligado. O banco falso deixa ler tudo, então só um
 * teste que NEGA a leitura da sessão pega isso: é o que este arquivo faz.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { criarBancoFalso } from "./consultas/banco-falso";
import { estadoDoModulo, moduloLigado } from "./modulos";
import type { ContextoDeConsulta } from "./tipos";

const ORG = "11111111-2222-4333-8444-555555555555";
const FLAG_PROPOSTAS_LIGADA = [{ chave: "MODULO_PROPOSTAS", valor: "ligado" }];

function ctxDe(
  sessao: ContextoDeConsulta["bancoDosModulos"],
  instalacao?: ContextoDeConsulta["bancoDosModulos"],
): ContextoDeConsulta {
  return {
    orgId: ORG,
    papel: "manager",
    idioma: "pt-BR",
    fuso: "America/Sao_Paulo",
    agoraIso: "2026-10-14T09:00:00-03:00",
    bancoDosModulos: sessao,
    ...(instalacao ? { bancoDaInstalacao: instalacao } : {}),
  };
}

describe("estadoDoModulo — de onde vem o interruptor", () => {
  it("sem banco da instalação, lê pela sessão (o comportamento de antes)", async () => {
    const sessao = criarBancoFalso({ platform_config: FLAG_PROPOSTAS_LIGADA });
    expect(await estadoDoModulo(ctxDe(sessao.client), "propostas")).toEqual({ ok: true, ligado: true });
    expect(sessao.consultas.some((c) => c.tabela === "platform_config")).toBe(true);
  });

  it("PRODUÇÃO: a sessão não consegue ler platform_config, a instalação consegue — o módulo aparece ligado", async () => {
    const sessaoNegada = criarBancoFalso({ platform_config: FLAG_PROPOSTAS_LIGADA }, "platform_config");
    const instalacao = criarBancoFalso({ platform_config: FLAG_PROPOSTAS_LIGADA });
    expect(await estadoDoModulo(ctxDe(sessaoNegada.client, instalacao.client), "propostas")).toEqual({
      ok: true,
      ligado: true,
    });
    expect(await moduloLigado(ctxDe(sessaoNegada.client, instalacao.client), "propostas")).toBe(true);
  });

  it("controle: sem o banco da instalação, a MESMA sessão negada deixa o módulo desligado (o defeito que isto conserta)", async () => {
    const sessaoNegada = criarBancoFalso({ platform_config: FLAG_PROPOSTAS_LIGADA }, "platform_config");
    expect(await estadoDoModulo(ctxDe(sessaoNegada.client), "propostas")).toEqual({ ok: true, ligado: false });
  });

  it("com banco da instalação, vale a instalação: flag só na sessão não liga o módulo", async () => {
    const sessao = criarBancoFalso({ platform_config: FLAG_PROPOSTAS_LIGADA });
    const instalacao = criarBancoFalso({ platform_config: [] });
    expect(await estadoDoModulo(ctxDe(sessao.client, instalacao.client), "propostas")).toEqual({
      ok: true,
      ligado: false,
    });
    expect(sessao.consultas).toEqual([]);
  });

  it("módulo desligado na instalação continua desligado", async () => {
    const instalacao = criarBancoFalso({ platform_config: [{ chave: "MODULO_PROPOSTAS", valor: "desligado" }] });
    const sessao = criarBancoFalso({});
    expect(await moduloLigado(ctxDe(sessao.client, instalacao.client), "propostas")).toBe(false);
  });

  it("pelo banco da instalação só passam as duas tabelas de interruptor, nenhuma tabela de cliente", async () => {
    const instalacao = criarBancoFalso({ platform_config: FLAG_PROPOSTAS_LIGADA });
    await estadoDoModulo(ctxDe(criarBancoFalso({}).client, instalacao.client), "propostas");
    const tabelas = new Set(instalacao.consultas.map((c) => c.tabela));
    expect(tabelas).toEqual(new Set(["platform_config", "modulos_instalados"]));
  });
});
