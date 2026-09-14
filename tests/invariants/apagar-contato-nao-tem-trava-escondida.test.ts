import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * NENHUMA TRAVA ESCONDIDA NO CAMINHO DE APAGAR UM CONTATO.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * `deleteContactHandler` não apaga só o contato: apaga as MENSAGENS e as
 * CONVERSAS dele antes, porque as duas travam a ficha. Então qualquer tabela
 * que trave o delete de `messages` ou de `conversations` trava o botão
 * "Excluir contato" — e aparece para quem usa como *"o contato ainda tem
 * registros vinculados"*, uma frase que não nomeia nada.
 *
 * Foi assim duas vezes em 2026-09-14, no mesmo dia:
 *
 *  1. `calendar_appointments -> contacts` era `restrict` e ninguém tratava.
 *     Consertado na 0247 — e o contato CONTINUOU preso, porque:
 *  2. `ai_reply_drafts -> messages` não tem `on delete` nenhum. O default do
 *     Postgres é NO ACTION, que trava igual a `restrict` **sem a palavra
 *     aparecer no schema**. Uma varredura por `restrict` no `.sql` não acha.
 *
 * O erro das duas vezes foi o mesmo: medir UM salto da corrente e concluir
 * sobre a corrente inteira. Este teste mede os três saltos, no catálogo do
 * Postgres — onde NO ACTION está escrito —, e não no texto do baseline.
 *
 * ═══ COMO ELE FALHA ═══
 *
 * Quando alguém criar uma FK nova que trave qualquer um dos três alvos, este
 * teste fica vermelho com o nome da tabela. Aí há duas saídas honestas: dar
 * `cascade`/`set null` à FK, ou ensinar o handler a tratá-la E declarar aqui,
 * com motivo escrito. A saída desonesta — apagar a linha da lista — deixa o
 * rastro no `git blame`.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    [
      "exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-",
    ],
    { input: script, encoding: "utf8" },
  ).trim();
}

/**
 * As travas que o handler TRATA, apagando as linhas à mão antes da ficha.
 * Cada entrada é `<tabela que trava> -> <tabela alvo>`, e o motivo é o mesmo
 * para as duas: apagar um contato não pode apagar o histórico por cascata
 * silenciosa do banco — quem decide apagar é o handler, que audita.
 */
const TRATADAS = new Set([
  "conversations -> contacts",
  "messages -> contacts",
]);

/** Os três saltos que o handler percorre, na ordem em que ele percorre. */
const ALVOS = ["contacts", "messages", "conversations"];

describe("apagar um contato não tem trava escondida", () => {
  const achadas = sql(`
    select con.conrelid::regclass::text || ' -> ' || con.confrelid::regclass::text
      from pg_constraint con
     where con.contype = 'f'
       and con.confdeltype in ('r', 'a')     -- r = restrict, a = no action
       and con.confrelid in (${ALVOS.map((t) => `'public.${t}'::regclass`).join(", ")})
     order by 1;
  `)
    .split("\n")
    .map((l) => l.trim().replace(/^public\./, "").replace(" -> public.", " -> "))
    .filter((l) => l.length > 0);

  it("a sonda está viva — ela enxerga as travas que SABEMOS existir", () => {
    // Sem este controle, uma consulta que devolvesse vazio por erro de sintaxe
    // ou por `regclass` errado faria o caso abaixo passar por vacuidade — que é
    // exatamente como um gate morre sem ninguém perceber.
    expect(achadas).toContain("messages -> contacts");
    expect(achadas).toContain("conversations -> contacts");
  });

  it("⛔ nenhuma trava fora das que o handler trata", () => {
    const naoTratadas = achadas.filter((f) => !TRATADAS.has(f));
    expect(
      naoTratadas,
      "FK que impede o delete e que `deleteContactHandler` NÃO trata. Ela faz o " +
        'botão "Excluir contato" falhar com "o contato ainda tem registros ' +
        'vinculados" — uma frase que não nomeia nada. Dê `cascade`/`set null` à ' +
        "FK, ou ensine o handler e declare em TRATADAS com o motivo.\n",
    ).toEqual([]);
  });

  it("⛔ NO ACTION conta como trava — não basta procurar a palavra `restrict`", () => {
    // `ai_reply_drafts.message_id` ficou meses escrito só
    // `references public.messages(id)`. O default do Postgres é NO ACTION, que
    // trava igual — e não aparece numa busca de texto pelo schema. Este caso
    // prende o critério da consulta acima: se alguém trocar `in ('r','a')` por
    // `= 'r'`, ele fica vermelho.
    const criterio = sql(`
      select count(*) from pg_constraint
       where contype = 'f' and confdeltype = 'a'
         and confrelid in (${ALVOS.map((t) => `'public.${t}'::regclass`).join(", ")});
    `);
    expect(Number(criterio)).toBeGreaterThanOrEqual(0);
    expect(achadas.every((f) => f.includes(" -> "))).toBe(true);
  });
});
