import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A atualização confere as regras de isolamento antes de dizer "deu certo".
 *
 * ## O incidente — instalação real, 2026-09-12
 *
 * O baseline aplica cada regra como APAGAR e depois CRIAR: é o único jeito
 * portável, porque o Postgres não tem `create or replace policy`. E o
 * `update.sh` roda SEM parar em erro, de propósito, para um clone bagunçado
 * conseguir se curar.
 *
 * As duas coisas juntas têm um desfecho ruim: se o "criar" falha, o "apagar" já
 * valeu. `crm_leads_select` e `crm_leads_update` sumiram, a atualização
 * reportou **success**, e o funil passou a aparecer VAZIO — para todo mundo.
 *
 * O que torna isso pior que um erro: com a regra de leitura ausente e a
 * segurança por linha ligada, o Postgres nega sem reclamar. A tela mostra uma
 * lista vazia, **indistinguível de "não há nada aqui"**. O dono da instalação
 * descobriu horas depois, pelo funil, e não pela atualização que tinha acabado
 * de dizer "concluída com sucesso".
 *
 * `push_subscriptions_own` tinha sumido junto, e ninguém havia notado: as
 * notificações do navegador simplesmente não funcionavam.
 *
 * ## Por que estes casos rodam o AWK de verdade
 *
 * A régua vive no `update.sh`, em awk. Reimplementá-la em TypeScript para poder
 * testá-la criaria duas réguas — e duas réguas divergem, sempre. Estes casos
 * extraem o programa awk do próprio script e o executam. Se alguém mexer na
 * régua, é a régua mexida que é medida.
 */

const RAIZ = process.cwd();
const UPDATE = fs.readFileSync(path.join(RAIZ, "hostgator-setup-kit", "update.sh"), "utf8");

describe("o update.sh guarda a evidência e confere o resultado", () => {
  it("⛔ guarda o log do banco — era ele que estava sendo jogado fora", () => {
    // O que o agente registra em `system_update_runs.log_tail` é a CAUDA da
    // atualização (Docker e reinício). O banco acontece antes, e sua saída
    // morria numa variável de shell. Quando as regras sumiram, não havia o que
    // ler: a única evidência que importava tinha sido descartada.
    expect(UPDATE).toMatch(/\.deskcomm-banco\.log/);
  });

  it("⛔ confere as regras de isolamento depois de aplicar o banco", () => {
    expect(UPDATE).toMatch(/pg_policy/);
    expect(UPDATE).toMatch(/faltando=/);
  });

  it("⛔ e GRITA quando falta — silêncio aqui é uma tela vazia lá", () => {
    // A mensagem precisa dizer o que acontece, não só que algo faltou: "regra
    // ausente" não significa nada para quem opera uma VPS. "As telas aparecem
    // vazias" significa.
    const bloco = UPDATE.slice(UPDATE.indexOf("REGRAS DE ISOLAMENTO AUSENTES"));
    expect(bloco.slice(0, 600)).toMatch(/VAZIA/i);
    expect(UPDATE).toMatch(/c_red "⛔ REGRAS DE ISOLAMENTO AUSENTES/);
  });

  it("tenta de novo UMA vez antes de gritar — a falha medida era circunstancial", () => {
    // Reaplicado depois, sem o banco sob carga, o mesmo arquivo passou sem um
    // erro. Uma segunda passada é mais barata e mais segura do que reconstruir
    // cada regra à mão dentro do script.
    expect(UPDATE).toMatch(/Tentando aplicar o banco mais uma vez/);
  });
});

/** Extrai o programa awk do `update.sh` — a régua de verdade, não uma cópia. */
function programaAwk(): string {
  const i = UPDATE.indexOf("esperadas=\"$(awk '");
  const j = UPDATE.indexOf("' supabase/baseline.sql", i);
  return UPDATE.slice(i + "esperadas=\"$(awk '".length, j);
}

const temAwk = (() => {
  try {
    execFileSync("awk", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    try {
      execFileSync("awk", ["-W", "version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
})();

describe.skipIf(!temAwk)("a régua: vale a ÚLTIMA operação de cada regra", () => {
  function esperadas(sql: string): string[] {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "regua-"));
    const arq = path.join(dir, "b.sql");
    fs.writeFileSync(arq, sql, "utf8");
    try {
      const out = execFileSync("awk", [programaAwk(), arq], { encoding: "utf8" });
      return out.split("\n").map((l) => l.trim()).filter(Boolean).sort();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("regra criada e não apagada depois: É esperada", () => {
    expect(esperadas(`create policy "x_select" on public.x for select using (true);`)).toEqual([
      "x_select|x",
    ]);
  });

  it("⛔ regra criada e APAGADA depois: NÃO é esperada", () => {
    // O caso que derruba a régua ingênua. O baseline faz isso de propósito —
    // `conversations_agent_write` vira três regras separadas mais adiante no
    // arquivo. Contar toda criação acusaria uma decisão deliberada, e falso
    // positivo derruba a confiança no aviso inteiro: quem vê o alarme tocar sem
    // motivo aprende a ignorá-lo, e aí ele não serve para o dia em que é real.
    expect(
      esperadas(
        `create policy "velha" on public.x for all using (true);\n` +
          `drop policy if exists "velha" on public.x;\n` +
          `create policy "nova" on public.x for select using (true);`,
      ),
    ).toEqual(["nova|x"]);
  });

  it("regra apagada e recriada depois: É esperada — é o padrão do baseline", () => {
    expect(
      esperadas(
        `drop policy if exists "x_select" on public.x;\n` +
          `create policy "x_select" on public.x for select using (true);`,
      ),
    ).toEqual(["x_select|x"]);
  });

  it("aceita com e sem aspas — o baseline usa as duas formas", () => {
    // `crm_leads_select` vem com aspas; `push_subscriptions_own`, sem. Uma
    // régua que só entendesse uma delas ignoraria metade das regras em silêncio
    // — e teria aprovado exatamente a instalação quebrada que originou tudo.
    expect(
      esperadas(
        `create policy "com_aspas" on public.a for select using (true);\n` +
          `create policy sem_aspas on public.b for all using (true);`,
      ),
    ).toEqual(["com_aspas|a", "sem_aspas|b"]);
  });

  it("CONTROLE: sem regra nenhuma, devolve vazio", () => {
    expect(esperadas(`select 1;`)).toEqual([]);
  });
});
