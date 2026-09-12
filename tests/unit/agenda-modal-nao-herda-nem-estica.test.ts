import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Dois defeitos da tela de agendamento, medidos numa instalação real em
 * 2026-09-12 — e as duas cercas que impedem cada um de voltar.
 *
 * ## O que estas cercas são, e o que NÃO são
 *
 * São cercas de FORMA: leem o código-fonte e exigem a presença do que conserta.
 * Não provam comportamento — não abrem o modal, não medem pixel. A prova de
 * verdade é pela tela, e ela é do `tests/e2e/` e de quem opera.
 *
 * Existem assim mesmo porque os dois defeitos são exatamente do tipo que passa
 * por typecheck, lint e pela suíte inteira sem um arranhão: um é um `setState`
 * que **não** está lá, o outro é uma classe de CSS ausente. Nenhum gate deste
 * repositório olhava para qualquer um dos dois, e os dois chegaram à instalação
 * de um cliente.
 */

const RAIZ = process.cwd();

describe("o modal de agendamento não herda o cliente da abertura anterior", () => {
  const FONTE = fs.readFileSync(path.join(RAIZ, "app", "app", "agenda", "_client.tsx"), "utf8");

  /**
   * O bloco que roda ao FECHAR sem confirmar. É ele que devolve o modal ao
   * estado neutro; o que ficar de fora vaza para a próxima marcação.
   */
  const limpeza = (() => {
    const i = FONTE.indexOf("if (!aberto) {");
    if (i < 0) return "";
    return FONTE.slice(i, FONTE.indexOf("\n          }", i));
  })();

  it("CONTROLE: o bloco de limpeza foi encontrado — senão o resto não prova nada", () => {
    // Sem este caso, renomear a variável `aberto` faria o recorte devolver ""
    // e TODOS os casos abaixo ficariam verdes com o defeito de volta.
    expect(limpeza.length).toBeGreaterThan(40);
  });

  it("⛔ limpa o CLIENTE — o defeito que marcaria compromisso no nome de outra pessoa", () => {
    // Medido: "Novo agendamento" abriu com um contato já selecionado, herdado de
    // uma abertura anterior feita a partir da conversa daquele contato. O campo
    // parece preenchido de propósito — não há o que estranhar na tela.
    expect(limpeza).toMatch(/setContactId\(""\)/);
  });

  it("⛔ limpa a CONVERSA vinculada, pelo mesmo motivo", () => {
    expect(limpeza).toMatch(/setConversationId\(""\)/);
  });

  it("continua limpando os três que já limpava", () => {
    // Controle de não-regressão: o conserto acrescenta, nunca troca. Um conserto
    // que limpasse o cliente e parasse de limpar o convidado devolveria o defeito
    // irmão — convite de e-mail para a pessoa errada.
    expect(limpeza).toMatch(/setRemarcandoId\(null\)/);
    expect(limpeza).toMatch(/setHorarioEscolhido\(null\)/);
    expect(limpeza).toMatch(/setEmailConvidado\(""\)/);
  });
});

describe("a lista de horários rola em vez de esticar a janela", () => {
  const FONTE = fs.readFileSync(
    path.join(RAIZ, "components", "agenda", "PainelDeMarcacao.tsx"),
    "utf8",
  );

  /** A linha de classes da lista, achada pelo `data-testid` que a nomeia. */
  const classes = (() => {
    const i = FONTE.indexOf('data-testid="lista-de-horarios"');
    if (i < 0) return "";
    const trecho = FONTE.slice(i, i + 400);
    return /className=\{?"([^"]+)"/.exec(trecho)?.[1] ?? "";
  })();

  it("CONTROLE: as classes da lista foram encontradas", () => {
    expect(classes.length).toBeGreaterThan(10);
  });

  it("⛔ a lista tem TETO — sem ele o `overflow-y-auto` é enfeite", () => {
    // O par é indivisível: `overflow-y-auto` só rola quando existe altura que
    // limite o filho. Durante meses o teto veio do pai, e no dia em que o pai
    // perdeu a altura (para a janela parar de CORTAR os botões em tela baixa) a
    // lista passou a crescer sem fim — treze horários numa janela que não cabia
    // na tela. `max-height` não depende de cadeia nenhuma.
    expect(classes).toMatch(/max-h-/);
    expect(classes).toMatch(/overflow-y-auto/);
  });

  it("o teto vale só da coluna para cima — no celular quem rola é o diálogo", () => {
    // Dois roladores aninhados no telefone prendem o dedo no de dentro: a pessoa
    // tenta rolar a página e move a lista. Abaixo de `lg` o painel é empilhado e
    // o diálogo inteiro rola, que é o certo.
    expect(classes).toMatch(/lg:max-h-/);
  });

  it("o teto tem parte relativa à JANELA — senão volta a cortar em tela baixa", () => {
    // Um teto só em pixel, escolhido num monitor grande, corta em 1366×768 —
    // que é exatamente onde o defeito original apareceu.
    expect(classes).toMatch(/\d+vh/);
  });

  it("⛔ e tem parte em PIXEL — senão em tela alta o teto não é teto", () => {
    // Medido na prova de tela: `60vh` sozinho fez a barra de rolagem aparecer
    // (o mecanismo estava certo) e ainda assim rendeu ~570px de lista numa
    // janela de ~950px. O relato foi "scroll de horas ainda gigante". Rolar não
    // era o objetivo; caber era. O erro não estava no mecanismo, estava no
    // NÚMERO — e nenhum gate mede número: só a tela mostra.
    expect(classes).toMatch(/\d+px/);
  });
});
