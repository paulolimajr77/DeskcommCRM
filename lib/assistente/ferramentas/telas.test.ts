/**
 * `listar_telas` e `abrir_tela`: a navegação do assistente sai do MESMO
 * catálogo da busca ⌘K (filtrado pelo papel e pelos módulos), e o `href` do
 * botão é sempre o do objeto do catálogo — nunca o texto que o modelo mandou.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ROLE_RANK } from "@/lib/auth/types";
import { NAV_DESTINATIONS, searchable } from "@/lib/navigation/registry";

import { chamar, montarParaTeste, ORG } from "./auxiliar-de-teste";
import { MAXIMO_DE_ACOES_POR_TURNO, MAXIMO_DE_TELAS_LISTADAS } from "./telas";

interface Tela {
  destino: string;
  titulo: string;
  grupo: string;
}

interface SaidaDeListar {
  ok: true;
  total_encontrado: number;
  truncado: boolean;
  telas: Tela[];
}

type Papel = Parameters<typeof montarParaTeste>[0];

async function listarTelas(papel: Papel, busca?: string, idioma?: "pt-BR" | "es"): Promise<SaidaDeListar> {
  const { ferramentas } = montarParaTeste(papel, {}, { idioma });
  return chamar<SaidaDeListar>(ferramentas, "listar_telas", busca === undefined ? {} : { busca });
}

function destinosDe(saida: SaidaDeListar): string[] {
  return saida.telas.map((tela) => tela.destino);
}

const DE_GERENTE = NAV_DESTINATIONS.find((d) => d.minRole === "manager" && !d.modulo && !d.capacidade);
const DE_BANCO_EXTERNO = NAV_DESTINATIONS.find((d) => d.modulo === "banco_externo");

describe("listar_telas", () => {
  it("viewer não vê a tela de gerente nem a de administrador; o gerente vê a sua, mas não a de administrador", async () => {
    if (!DE_GERENTE) throw new Error("o catálogo ficou sem tela só de gerente");

    expect(destinosDe(await listarTelas("viewer", DE_GERENTE.label))).not.toContain(DE_GERENTE.href);
    expect(destinosDe(await listarTelas("manager", DE_GERENTE.label))).toContain(DE_GERENTE.href);
    expect(destinosDe(await listarTelas("viewer", "Prospecção"))).not.toContain("/app/prospecting");
    expect(destinosDe(await listarTelas("manager", "Prospecção"))).not.toContain("/app/prospecting");
    expect(destinosDe(await listarTelas("admin", "Prospecção"))).toContain("/app/prospecting");
  });

  it("tudo que o viewer recebe é tela de viewer no catálogo", async () => {
    const saida = await listarTelas("viewer");
    const acimaDoPapel = saida.telas.filter((tela) => {
      const doCatalogo = NAV_DESTINATIONS.find((d) => d.href === tela.destino);
      return !doCatalogo || ROLE_RANK[doCatalogo.minRole ?? "viewer"] > ROLE_RANK.viewer;
    });

    expect(saida.telas.length).toBeGreaterThan(0);
    expect(acimaDoPapel).toEqual([]);
    expect(destinosDe(saida)).toContain("/app/inbox");
  });

  it("devolve no máximo 40 itens e diz o total e que truncou", async () => {
    const dePapelAdmin = searchable(false, "admin", undefined, [], []).length;
    const saida = await listarTelas("admin");

    expect(dePapelAdmin).toBeGreaterThan(MAXIMO_DE_TELAS_LISTADAS);
    expect(saida.telas.length).toBe(40);
    expect(saida.total_encontrado).toBe(dePapelAdmin);
    expect(saida.truncado).toBe(true);
  });

  it("busca curta não trunca: o total é o número de itens devolvidos", async () => {
    const saida = await listarTelas("admin", "inbox");

    expect(saida.truncado).toBe(false);
    expect(saida.total_encontrado).toBe(saida.telas.length);
    expect(destinosDe(saida)).toContain("/app/inbox");
  });

  it("a busca com acento e maiúscula acha o título escrito sem acento, e vice-versa", async () => {
    expect(destinosDe(await listarTelas("admin", "prospeccao"))).toContain("/app/prospecting");
    expect(destinosDe(await listarTelas("admin", "PROSPECÇÃO"))).toContain("/app/prospecting");
    expect(destinosDe(await listarTelas("admin", "Prospecçao"))).toContain("/app/prospecting");
  });

  it("busca sem resultado devolve lista vazia, total zero e sem truncar", async () => {
    const saida = await listarTelas("admin", "zzz-nenhuma-tela-se-chama-assim");

    expect(saida).toEqual({ ok: true, total_encontrado: 0, truncado: false, telas: [] });
  });

  it("título e grupo saem no idioma da sessão", async () => {
    const pt = (await listarTelas("admin", "prospeccao")).telas.find((t) => t.destino === "/app/prospecting");
    const es = (await listarTelas("admin", "prospeccion", "es")).telas.find((t) => t.destino === "/app/prospecting");
    const inboxEs = (await listarTelas("admin", "inbox", "es")).telas.find((t) => t.destino === "/app/inbox");

    expect(pt).toEqual({ destino: "/app/prospecting", titulo: "Prospecção", grupo: "CRM" });
    expect(es).toEqual({ destino: "/app/prospecting", titulo: "Prospección", grupo: "CRM" });
    expect(inboxEs?.grupo).toBe("Atención");
  });

  it("tela de módulo opcional só aparece com o módulo ligado na instalação", async () => {
    if (!DE_BANCO_EXTERNO) throw new Error("o catálogo ficou sem a tela do banco externo");
    const desligado = montarParaTeste("admin", {});
    const ligado = montarParaTeste("admin", { platform_config: [{ chave: "MODULO_BANCO_EXTERNO", valor: "ligado" }] });

    const semModulo = await chamar<SaidaDeListar>(desligado.ferramentas, "listar_telas", { busca: DE_BANCO_EXTERNO.label });
    const comModulo = await chamar<SaidaDeListar>(ligado.ferramentas, "listar_telas", { busca: DE_BANCO_EXTERNO.label });

    expect(destinosDe(semModulo)).not.toContain(DE_BANCO_EXTERNO.href);
    expect(destinosDe(comModulo)).toContain(DE_BANCO_EXTERNO.href);
  });

  it("o interruptor de módulo é lido pelo banco da INSTALAÇÃO: a sessão sem acesso a platform_config não esconde a tela", async () => {
    if (!DE_BANCO_EXTERNO) throw new Error("o catálogo ficou sem a tela do banco externo");
    const flag = [{ chave: "MODULO_BANCO_EXTERNO", valor: "ligado" }];
    // Produção: a sessão NÃO consegue ler platform_config (erro), a instalação consegue.
    const sessaoNegada = montarParaTeste("admin", { platform_config: flag }, { erroEm: "platform_config", instalacao: { platform_config: flag } });
    const r = await chamar<SaidaDeListar>(sessaoNegada.ferramentas, "listar_telas", { busca: DE_BANCO_EXTERNO.label });
    expect(destinosDe(r)).toContain(DE_BANCO_EXTERNO.href);
  });

  it("com banco da instalação no contexto, vale a instalação e não a sessão (flag só na sessão não liga o módulo)", async () => {
    if (!DE_BANCO_EXTERNO) throw new Error("o catálogo ficou sem a tela do banco externo");
    const flag = [{ chave: "MODULO_BANCO_EXTERNO", valor: "ligado" }];
    const soNaSessao = montarParaTeste("admin", { platform_config: flag }, { instalacao: { platform_config: [] } });
    const r = await chamar<SaidaDeListar>(soNaSessao.ferramentas, "listar_telas", { busca: DE_BANCO_EXTERNO.label });
    expect(destinosDe(r)).not.toContain(DE_BANCO_EXTERNO.href);
  });
});

describe("abrir_tela", () => {
  it("destino do catálogo visível anota o botão, com o href do catálogo e o título traduzido", async () => {
    const { ferramentas, coletor } = montarParaTeste("admin");
    const doCatalogo = NAV_DESTINATIONS.find((d) => d.label === "Prospecção");

    const saida = await chamar(ferramentas, "abrir_tela", { destino: "/app/prospecting" });

    expect(saida).toEqual({ ok: true, mensagem: "O botão será mostrado; a pessoa decide se clica." });
    expect(coletor.acoes).toEqual([{ tipo: "abrir_tela", rotulo: "Abrir Prospecção", href: "/app/prospecting" }]);
    expect(coletor.acoes[0]?.href).toBe(doCatalogo?.href);
  });

  it("em espanhol o rótulo do botão sai em espanhol", async () => {
    const { ferramentas, coletor } = montarParaTeste("admin", {}, { idioma: "es" });

    await chamar(ferramentas, "abrir_tela", { destino: "/app/prospecting" });

    expect(coletor.acoes).toEqual([{ tipo: "abrir_tela", rotulo: "Abrir Prospección", href: "/app/prospecting" }]);
  });

  it.each([
    ["rota que não existe", "/app/nao-existe"],
    ["URL externa", "https://exemplo.com/app/inbox"],
    ["esquema javascript", "javascript:alert(1)"],
    ["destino com query string", "/app/inbox?x=1"],
    ["destino com subcaminho", "/app/inbox/qualquer-coisa"],
    ["caminho com ponto-ponto", "/app/inbox/../settings"],
    ["caixa diferente", "/APP/INBOX"],
    ["espaço antes", " /app/inbox"],
    ["texto livre", "abrir o inbox"],
    ["vazio", ""],
  ])("%s é recusado com tela_inexistente e nenhum botão", async (_nome, destino) => {
    const { ferramentas, coletor } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "abrir_tela", { destino });

    expect(saida).toEqual({ ok: false, motivo: "tela_inexistente" });
    expect(coletor.acoes).toEqual([]);
  });

  it("tela que o papel não vê é recusada como inexistente", async () => {
    const { ferramentas, coletor } = montarParaTeste("viewer");

    const saida = await chamar(ferramentas, "abrir_tela", { destino: "/app/prospecting" });

    expect(saida).toEqual({ ok: false, motivo: "tela_inexistente" });
    expect(coletor.acoes).toEqual([]);
  });

  it("tela de módulo desligado é recusada mesmo para o administrador", async () => {
    if (!DE_BANCO_EXTERNO) throw new Error("o catálogo ficou sem a tela do banco externo");
    const { ferramentas, coletor } = montarParaTeste("admin");

    const saida = await chamar(ferramentas, "abrir_tela", { destino: DE_BANCO_EXTERNO.href });

    expect(saida).toEqual({ ok: false, motivo: "tela_inexistente" });
    expect(coletor.acoes).toEqual([]);
  });

  it("a quarta ação do turno é recusada com muitas_acoes e os três botões anteriores ficam", async () => {
    const { ferramentas, coletor } = montarParaTeste("admin");
    const destinos = ["/app/inbox", "/app/agenda", "/app/prospecting", "/app/radar"];

    const resultados: Array<Record<string, unknown>> = [];
    for (const destino of destinos) {
      resultados.push(await chamar(ferramentas, "abrir_tela", { destino }));
    }

    expect(MAXIMO_DE_ACOES_POR_TURNO).toBe(3);
    expect(resultados.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(resultados[3]).toEqual({ ok: false, motivo: "muitas_acoes" });
    expect(coletor.acoes.map((acao) => acao.href)).toEqual(["/app/inbox", "/app/agenda", "/app/prospecting"]);
  });

  it("pedir o mesmo destino duas vezes não duplica o botão", async () => {
    const { ferramentas, coletor } = montarParaTeste("admin");

    const primeira = await chamar(ferramentas, "abrir_tela", { destino: "/app/inbox" });
    const segunda = await chamar(ferramentas, "abrir_tela", { destino: "/app/inbox" });

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(true);
    expect(coletor.acoes.map((acao) => acao.href)).toEqual(["/app/inbox"]);
  });

  it("a organização da sessão é a única lida para decidir o que é visível", async () => {
    const { ferramentas, sessao } = montarParaTeste("admin");

    await chamar(ferramentas, "abrir_tela", { destino: "/app/inbox" });

    const daOrganizacao = sessao.consultas.filter((c) => c.tabela === "organizations");
    expect(daOrganizacao.map((c) => c.filtros)).toEqual([[["id", ORG]]]);
  });
});
