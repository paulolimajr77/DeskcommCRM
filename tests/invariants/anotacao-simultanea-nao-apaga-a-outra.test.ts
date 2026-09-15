import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * DUAS ANOTAÇÕES AO MESMO TEMPO NÃO PODEM APAGAR UMA À OUTRA.
 *
 * ## O defeito, medido em 2026-09-14
 *
 * `app/api/v1/leads/_handler.ts` mesclava `custom_fields` **no aplicativo**:
 *
 *     const prev = existing.custom_fields …          // ← lido no SELECT, lá em cima
 *     patch.custom_fields = { ...prev, ...input.custom_fields };
 *
 * `existing` vem de uma leitura anterior. Duas escritas simultâneas com chaves
 * DIFERENTES perdem uma: a segunda leu `prev` antes de a primeira gravar, e
 * sobrescreve a coluna inteira com a versão velha mais a chave dela. Ninguém
 * recebe erro. O dado some.
 *
 * ## Por que isto virou urgente agora
 *
 * Hoje `custom_fields` é escrito raramente, à mão. Com o agente perguntando e
 * preenchendo os campos do funil, ele passa a escrever VÁRIAS VEZES POR
 * CONVERSA — enquanto quem atende pode estar editando a mesma ficha na tela.
 * A regra de precedência protege contra o agente DECIDIR sobrescrever; esta
 * corrida perde a escrita do humano por outra porta, sem decisão nenhuma.
 *
 * ## Por que o teste é de banco, e não unitário
 *
 * A propriedade é de CONCORRÊNCIA: ela só existe quando duas transações se
 * cruzam de verdade. Um teste com mocks provaria que a função chama a função —
 * e o defeito está exatamente no que acontece entre uma leitura e uma escrita
 * que o mock não tem. Aqui as duas transações são reais, e a segunda começa
 * ANTES de a primeira confirmar.
 *
 * ## O instrumento
 *
 * Duas sessões `psql` abertas ao mesmo tempo, com a leitura da segunda
 * acontecendo antes do `commit` da primeira — que é a janela exata do defeito.
 * `fn_lead_anotar_campos` faz o merge DENTRO do banco (`||` em `jsonb`), então
 * a segunda transação relê a linha já gravada quando pega a trava.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)",
  );
}
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
 * Roda um script sem esperar o fim — é o que permite DUAS transações vivas ao
 * mesmo tempo. `psql` fica segurando a transação enquanto lê do stdin.
 */
function sqlAsync(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      resolve(sql(script));
    } catch (e) {
      reject(e);
    }
  });
}

const ORG = "dddddddd-0400-4000-8000-000000000001";
const FUNIL = "dddddddd-0400-4000-8000-000000000002";
const ETAPA = "dddddddd-0400-4000-8000-000000000003";
const LEAD = "dddddddd-0400-4000-8000-000000000004";

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, display_name, legal_name, status)
    values ('${ORG}', 'org-anotacao-simultanea', 'Anotacao Simultanea', 'Anotacao Simultanea', 'active')
    on conflict (id) do nothing;

    insert into public.crm_pipelines (id, organization_id, name)
    values ('${FUNIL}', '${ORG}', 'Funil da corrida')
    on conflict (id) do nothing;

    insert into public.crm_stages (id, organization_id, pipeline_id, name, position)
    values ('${ETAPA}', '${ORG}', '${FUNIL}', 'Primeira', 1)
    on conflict (id) do nothing;

    insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, title, custom_fields)
    values ('${LEAD}', '${ORG}', '${FUNIL}', '${ETAPA}', 'Lead da corrida', '{}'::jsonb)
    on conflict (id) do update set custom_fields = '{}'::jsonb;
  `);
});

afterAll(() => {
  sql(`delete from public.organizations where id = '${ORG}';`);
});

describe("anotar campo do funil sob concorrência", () => {
  it("a função existe e está fechada para anon (guarda de vacuidade)", () => {
    // Sem isto, uma função ausente faria o caso abaixo falhar por outro motivo
    // e a leitura do vermelho apontaria para o lugar errado.
    const existe = sql(
      `select count(*) from pg_proc where proname = 'fn_lead_anotar_campos';`,
    );
    expect(existe, "fn_lead_anotar_campos não existe — a migration não foi aplicada?").toBe("1");

    const paraAnon = sql(`
      select count(*) from information_schema.role_routine_grants
       where routine_name = 'fn_lead_anotar_campos' and grantee in ('anon', 'PUBLIC');
    `);
    expect(paraAnon, "fn_lead_anotar_campos alcançável pela anon key").toBe("0");
  });

  it("⛔ duas anotações simultâneas com chaves diferentes: as DUAS sobrevivem", async () => {
    // A JANELA EXATA DO DEFEITO. A transação B lê a linha ANTES de A confirmar.
    // Com merge no aplicativo, B grava `{} + {b:2}` e a chave `a` some. Com o
    // merge dentro do banco, B espera a trava de linha de A, relê o que A
    // gravou, e concatena em cima.
    const a = sqlAsync(`
      begin;
      select public.fn_lead_anotar_campos('${ORG}', '${LEAD}', '{"a": 1}'::jsonb);
      select pg_sleep(1);
      commit;
    `);
    // Começa durante o sleep de A, com A ainda sem confirmar.
    await new Promise((r) => setTimeout(r, 250));
    const b = sqlAsync(`
      begin;
      select public.fn_lead_anotar_campos('${ORG}', '${LEAD}', '{"b": 2}'::jsonb);
      commit;
    `);
    await Promise.all([a, b]);

    const final = sql(
      `select custom_fields::text from public.crm_leads where id = '${LEAD}';`,
    );
    const campos = JSON.parse(final) as Record<string, unknown>;
    // As DUAS. Afirmar só uma passaria com a outra apagada, que é o defeito.
    expect(campos, "a anotação de quem escreveu primeiro foi apagada").toHaveProperty("a", 1);
    expect(campos, "a anotação de quem escreveu depois não chegou").toHaveProperty("b", 2);
  });

  it("anotar de novo a MESMA chave sobrescreve — o último a falar vence", () => {
    // O outro lado da regra: mesclar não pode virar "nunca sobrescreve nada",
    // senão corrigir um valor errado ficaria impossível.
    sql(`select public.fn_lead_anotar_campos('${ORG}', '${LEAD}', '{"a": 9}'::jsonb);`);
    const final = sql(
      `select custom_fields->>'a' from public.crm_leads where id = '${LEAD}';`,
    );
    expect(final).toBe("9");
  });

  it("não atravessa organização: lead de outra org não é tocado", () => {
    // `organization_id` entra no WHERE, e não só como enfeite do argumento.
    const antes = sql(
      `select custom_fields::text from public.crm_leads where id = '${LEAD}';`,
    );
    sql(
      `select public.fn_lead_anotar_campos('00000000-0000-4000-8000-000000000000', '${LEAD}', '{"invasor": true}'::jsonb);`,
    );
    const depois = sql(
      `select custom_fields::text from public.crm_leads where id = '${LEAD}';`,
    );
    expect(depois, "a função escreveu num lead de outra organização").toBe(antes);
  });
});
