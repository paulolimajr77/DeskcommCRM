import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * A PROPOSTA GANHOU DESTINO, E O ÍNDICE DE IDEMPOTÊNCIA NÃO PODE FURAR.
 *
 * ## O que mudou
 *
 * `contact_field_proposals` nasceu só para dado do CONTATO — `email`, `name`,
 * `phone_number`, vocabulário fechado por CHECK. Com o agente preenchendo os
 * campos que a empresa declara em Configurações › Funis, a mesma tabela passa a
 * carregar proposta com outro DESTINO: um campo dentro de `crm_leads.custom_fields`.
 * Quem diz o destino é `lead_id` — nulo para contato, preenchido para funil.
 *
 * ## ⛔ A ARMADILHA, e ela é silenciosa
 *
 * A idempotência é um índice único parcial:
 *
 *     unique (organization_id, contact_id, campo) where status = 'pending'
 *
 * Ele é o que impede a IA de encher a tela com a mesma proposta a cada turno.
 * Acrescentar `lead_id` NULÁVEL à lista de colunas o DESARMA para o caso antigo:
 * em índice único do Postgres, `NULL` é distinto de `NULL`, então duas linhas
 * `(org, contato, 'email', NULL)` passam a conviver — e a proposta de contato
 * volta a duplicar, sem erro, sem aviso, e sem ninguém procurando ali.
 *
 * Por isso o índice indexa `coalesce(lead_id, <zero>)` e não `lead_id`: com um
 * valor no lugar do nulo, duas propostas de contato voltam a colidir como antes,
 * e proposta de funil colide por lead.
 *
 * ## Por que teste de banco
 *
 * A propriedade é do ÍNDICE, e índice só existe no banco. Um teste que lesse o
 * SQL do arquivo provaria que a string está escrita — não que o Postgres recusa
 * a segunda linha. É a recusa que interessa.
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

/** A mensagem do Postgres distingue "o índice barrou" de qualquer outro erro. */
function motivoDoErro(err: unknown): string {
  const e = err as { stderr?: Buffer | string; message?: string };
  return String(e.stderr ?? e.message ?? err);
}

const ORG = "dddddddd-0410-4000-8000-000000000001";
const CONTATO = "dddddddd-0410-4000-8000-000000000002";
const FUNIL = "dddddddd-0410-4000-8000-000000000003";
const ETAPA = "dddddddd-0410-4000-8000-000000000004";
const LEAD_A = "dddddddd-0410-4000-8000-000000000005";
const LEAD_B = "dddddddd-0410-4000-8000-000000000006";

function proposta(campo: string, lead: string | null, valor: string): string {
  return `
    insert into public.contact_field_proposals
      (organization_id, contact_id, lead_id, campo, valor_proposto, expires_at)
    values ('${ORG}', '${CONTATO}', ${lead ? `'${lead}'` : "null"},
            '${campo}', '${valor}', now() + interval '7 days');
  `;
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, display_name, legal_name, status)
    values ('${ORG}', 'org-proposta-destino', 'Proposta com Destino', 'Proposta com Destino', 'active')
    on conflict (id) do nothing;

    insert into public.contacts (id, organization_id, name)
    values ('${CONTATO}', '${ORG}', 'Quem fala')
    on conflict (id) do nothing;

    insert into public.crm_pipelines (id, organization_id, name, slug)
    values ('${FUNIL}', '${ORG}', 'Funil do destino', 'funil-do-destino')
    on conflict (id) do nothing;

    insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position)
    values ('${ETAPA}', '${ORG}', '${FUNIL}', 'Primeira', 'primeira-destino', 1)
    on conflict (id) do nothing;

    insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, contact_id, title)
    values ('${LEAD_A}', '${ORG}', '${FUNIL}', '${ETAPA}', '${CONTATO}', 'Negocio A'),
           ('${LEAD_B}', '${ORG}', '${FUNIL}', '${ETAPA}', '${CONTATO}', 'Negocio B')
    on conflict (id) do nothing;
  `);
});

afterAll(() => {
  sql(`delete from public.organizations where id = '${ORG}';`);
});

describe("proposta com destino × idempotência", () => {
  it("a coluna e o índice existem (guarda de vacuidade)", () => {
    // Sem isto, um schema antigo faria todos os casos abaixo falharem por
    // ausência, e a leitura do vermelho apontaria para o lugar errado.
    const coluna = sql(`
      select count(*) from information_schema.columns
       where table_name = 'contact_field_proposals' and column_name = 'lead_id';
    `);
    expect(coluna, "contact_field_proposals.lead_id não existe — migration 0270 não aplicada?").toBe("1");

    // E o índice indexa a EXPRESSÃO, não a coluna crua. É essa a diferença
    // entre idempotência viva e idempotência furada.
    const expressao = sql(`
      select count(*) from pg_indexes
       where indexname = 'uq_contact_field_proposals_uma_viva'
         and indexdef ilike '%coalesce%';
    `);
    expect(
      expressao,
      "o índice não usa coalesce(lead_id, …) — NULL distinto de NULL desarma a idempotência",
    ).toBe("1");
  });

  it("⛔ duas propostas de CONTATO para o mesmo campo continuam colidindo", () => {
    // O caso que a coluna nova poderia ter quebrado em silêncio.
    sql(proposta("email", null, "a@exemplo.com"));
    let barrou = "";
    try {
      sql(proposta("email", null, "b@exemplo.com"));
    } catch (e) {
      barrou = motivoDoErro(e);
    }
    expect(
      barrou,
      "a segunda proposta de contato entrou — a idempotência furou com lead_id nulo",
    ).toContain("uq_contact_field_proposals_uma_viva");
  });

  it("duas propostas para o MESMO campo do MESMO lead colidem", () => {
    sql(proposta("segmento", LEAD_A, "clinica"));
    let barrou = "";
    try {
      sql(proposta("segmento", LEAD_A, "estetica"));
    } catch (e) {
      barrou = motivoDoErro(e);
    }
    expect(barrou, "a IA pode encher a tela com a mesma proposta").toContain(
      "uq_contact_field_proposals_uma_viva",
    );
  });

  it("o MESMO campo em leads DIFERENTES convive — são decisões diferentes", () => {
    // O outro lado: um contato pode ter dois negócios abertos, e "segmento" de
    // um não é "segmento" do outro. Barrar aqui esconderia a segunda proposta.
    sql(proposta("segmento", LEAD_B, "odontologia"));
    const vivas = sql(`
      select count(*) from public.contact_field_proposals
       where organization_id = '${ORG}' and campo = 'segmento' and status = 'pending';
    `);
    expect(vivas, "proposta do segundo negócio foi engolida pela do primeiro").toBe("2");
  });

  it("campo de FUNIL só é aceito com destino; campo de CONTATO só sem ele", () => {
    // O CHECK deixou de ser uma lista fechada e virou uma regra sobre o PAR.
    // Vocabulário de campo de funil é ABERTO (cada empresa inventa o seu), então
    // ele não pode morar num CHECK — mas o DESTINO pode, e é o que impede uma
    // proposta de funil de virar escrita em `contacts`.
    let barrouSemDestino = "";
    try {
      sql(proposta("inventado_pelo_dono", null, "x"));
    } catch (e) {
      barrouSemDestino = motivoDoErro(e);
    }
    expect(
      barrouSemDestino,
      "campo fora do vocabulário do contato entrou sem destino de lead",
    ).toContain("contact_field_proposals_campo_check");

    // ⚠️ E O INVERSO NÃO É BARRADO, DE PROPÓSITO — esta afirmação eu tinha
    // escrito errada e o CI derrubou.
    //
    // Eu esperava que `campo = 'email'` COM destino de lead fosse recusado. Não
    // é, e não deve ser: com destino, a chave é do vocabulário da EMPRESA, e
    // uma empresa pode perfeitamente declarar um campo de funil chamado
    // "email" em Configurações › Funis — o e-mail do responsável pela compra,
    // por exemplo, que não é o e-mail do contato. Recusar seria o CHECK
    // decidindo o vocabulário alheio, que é exatamente o que a doutrina proíbe.
    //
    // Quem impede a escrita no lugar errado não é o nome: é o DESTINO. Com
    // `lead_id` preenchido, a confirmação escreve em `custom_fields` daquele
    // negócio, nunca na coluna `email` de `contacts`.
    let aceitouComDestino = "";
    try {
      sql(proposta("email", LEAD_A, "c@exemplo.com"));
    } catch (e) {
      aceitouComDestino = motivoDoErro(e);
    }
    expect(
      aceitouComDestino,
      "campo de funil com nome 'email' foi recusado — o CHECK está decidindo vocabulário alheio",
    ).toBe("");
  });
});
