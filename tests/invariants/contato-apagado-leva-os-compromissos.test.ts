import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * APAGAR UM CONTATO LEVA OS COMPROMISSOS DELE — E SÓ OS DELE.
 *
 * `calendar_appointments.contact_id` nasceu `on delete restrict` (migration
 * 0177) e era a TERCEIRA FK que impede apagar um contato. O handler de exclusão
 * contorna `conversations` e `messages` apagando as linhas à mão, e nunca soube
 * desta — então `DELETE /api/v1/contacts/:id` de quem já passou pela agenda
 * respondia 409 e o contato ficava impossível de excluir. Sem saída pela
 * interface: cancelar é `update status='cancelled'` e a linha fica, e nenhuma
 * rota do produto apaga um compromisso.
 *
 * As três metades importam:
 *
 * 1. a REGRA está no catálogo (`confdeltype = 'c'`), medida e não suposta — um
 *    teste que só apagasse um contato ficaria verde num banco onde alguém
 *    tivesse recriado a FK com outro nome e outra regra;
 * 2. o contato APAGA, e o compromisso dele vai junto;
 * 3. o compromisso do VIZINHO continua de pé. Sem esta, um `on delete cascade`
 *    escrito na coluna errada — ou um trigger varrendo a tabela — passaria nas
 *    duas primeiras.
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

const ORG = "0239c0de-0000-4000-8000-00000000000a";
const DONO = "0239c0de-1111-4000-8000-000000000001";
const ALVO = "0239c0de-2222-4000-8000-000000000001";
const VIZINHO = "0239c0de-2222-4000-8000-000000000002";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values ('${DONO}', 'cascata-agenda@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'cascata-agenda', 'Cascata Agenda', 'Cascata Agenda')
      on conflict (id) do nothing;
    insert into public.contacts (id, organization_id, name) values
      ('${ALVO}',    '${ORG}', 'Quem Sai'),
      ('${VIZINHO}', '${ORG}', 'Quem Fica')
      on conflict (id) do nothing;

    insert into public.calendar_appointments
      (organization_id, contact_id, owner_user_id, title, starts_at, ends_at, status, cancelled_at)
    values
      -- Encerrado: acompanha o contato.
      --
      -- ⚠️ `cancelled_at` VAI JUNTO, e nao e' enfeite da fixture:
      -- `calendar_appointments_cancelamento_coerente` exige que status
      -- 'cancelled' e `cancelled_at` andem juntos nos dois sentidos. Sem ele o
      -- INSERT e' recusado, os tres casos deste arquivo ficam SKIPPED e o
      -- arquivo reprova sem nenhuma assercao ter rodado — que e' pior que um
      -- vermelho, porque le como "1 arquivo falhou, 0 casos".
      ('${ORG}', '${ALVO}', '${DONO}', 'Consulta cancelada',
       now() - interval '30 days', now() - interval '30 days' + interval '1 hour',
       'cancelled', now() - interval '30 days'),
      ('${ORG}', '${ALVO}', '${DONO}', 'Consulta concluida',
       now() - interval '10 days', now() - interval '10 days' + interval '1 hour',
       'completed', null),
      -- do vizinho: não pode ser tocado
      ('${ORG}', '${VIZINHO}', '${DONO}', 'Consulta do vizinho',
       now() + interval '3 days', now() + interval '3 days' + interval '1 hour',
       'confirmed', null);
  `);
});

describe("contato apagado leva os compromissos (migration 0247)", () => {
  it("a FK de contact_id está declarada como cascade no catálogo", () => {
    const regra = sql(`
      select con.confdeltype
        from pg_constraint con
        join pg_attribute att
          on att.attrelid = con.conrelid
         and att.attnum   = con.conkey[1]
       where con.conrelid  = 'public.calendar_appointments'::regclass
         and con.confrelid = 'public.contacts'::regclass
         and con.contype   = 'f'
         and att.attname   = 'contact_id';
    `);
    // c = cascade · r = restrict · a = no action · n = set null
    expect(regra).toBe("c");
  });

  it("apagar o contato não é recusado, e os compromissos dele somem junto", () => {
    sql(`delete from public.contacts where id = '${ALVO}';`);

    expect(sql(`select count(*) from public.contacts where id = '${ALVO}';`)).toBe("0");
    expect(
      sql(`select count(*) from public.calendar_appointments where contact_id = '${ALVO}';`),
    ).toBe("0");
  });

  it("⛔ o compromisso do vizinho continua de pé", () => {
    expect(
      sql(`select count(*) from public.calendar_appointments where contact_id = '${VIZINHO}';`),
    ).toBe("1");
    expect(sql(`select count(*) from public.contacts where id = '${VIZINHO}';`)).toBe("1");
  });
});
