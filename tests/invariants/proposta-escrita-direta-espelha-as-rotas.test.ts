import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_CONTACT_1,
  GOV_MANAGER,
  GOV_ORG,
  lastLine,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";
import { motivoDoErro } from "./psql-transporte";

/**
 * A ESCRITA DIRETA NA PROPOSTA ESPELHA AS ROTAS (migration 0478).
 *
 * Achado da triagem do PR #1832: `crm_proposals_write` era `for all` com papel
 * `agent`. O PostgREST é alcançável do navegador com a própria sessão, e por ele
 * um atendente apagava uma proposta já ENVIADA, trocava o valor dela ou a
 * devolvia a rascunho — nenhuma rota dá isso: cancelar exige `manager` e só
 * alcança rascunho, e numa enviada o atendente só registra a decisão do cliente.
 *
 * Cada recusa tem o seu controle positivo ao lado: o que as rotas fazem com a
 * sessão do usuário (criar e editar rascunho, decidir a enviada, o gestor
 * cancelar) continua passando. Sem o controle, "recusado" poderia ser a tabela
 * inteira fechada.
 */

const TITULO = "invariante 0478";

type Desfecho = number | "recusado";

/** Linhas afetadas, ou "recusado" quando a guarda da 0478 barrou a escrita. */
function tenta(usuario: string, dml: string): Desfecho {
  try {
    return writeCountAs(usuario, dml);
  } catch (err) {
    if (motivoDoErro(err).includes("proposta_escrita_direta_recusada")) return "recusado";
    throw err;
  }
}

/** Cria a proposta como o SERVIDOR (postgres, sem RLS) e devolve o id. */
function criaComoServidor(status: "rascunho" | "enviada", numero?: number): string {
  const numeroAno = status === "enviada" ? `${numero}, 2026` : "null, null";
  return lastLine(
    sql(`
      with p as (
        insert into public.crm_proposals
            (organization_id, contact_id, titulo, status, total_cents, numero, ano)
          values ('${GOV_ORG}', '${GOV_CONTACT_1}', '${TITULO}', '${status}', 10000, ${numeroAno})
          returning id
      )
      select id from p;
    `),
  );
}

function linha(id: string): string {
  return sql(
    `select coalesce(status, '<sem linha>') || '|' || total_cents from public.crm_proposals where id = '${id}';`,
  );
}

beforeAll(() => {
  seedGov();
  sql(`delete from public.crm_proposals where titulo = '${TITULO}';`);
});

describe("atendente: o que as rotas dão passa", () => {
  it("cria rascunho", () => {
    expect(
      tenta(
        GOV_AGENT_A,
        `insert into public.crm_proposals (organization_id, contact_id, titulo)
           values ('${GOV_ORG}', '${GOV_CONTACT_1}', '${TITULO}')`,
      ),
    ).toBe(1);
  });

  it("edita rascunho", () => {
    const id = criaComoServidor("rascunho");
    expect(tenta(GOV_AGENT_A, `update public.crm_proposals set total_cents = 20000 where id = '${id}'`)).toBe(1);
  });

  it("registra a decisão do cliente numa enviada (POST .../decide)", () => {
    const id = criaComoServidor("enviada", 47801);
    expect(
      tenta(
        GOV_AGENT_A,
        `update public.crm_proposals
            set status = 'aceita', decided_at = now(), decided_by_user_id = '${GOV_AGENT_A}', decision_reason = 'ok'
          where id = '${id}'`,
      ),
    ).toBe(1);
  });

  it("põe item em rascunho", () => {
    const id = criaComoServidor("rascunho");
    expect(
      tenta(
        GOV_AGENT_A,
        `insert into public.crm_proposal_items (organization_id, proposal_id, descricao, quantidade, preco_unitario_cents, position)
           values ('${GOV_ORG}', '${id}', 'item', 1, 100, 1)`,
      ),
    ).toBe(1);
  });
});

describe("atendente: o que nenhuma rota dá é recusado", () => {
  it("não apaga proposta enviada", () => {
    const id = criaComoServidor("enviada", 47802);
    expect(tenta(GOV_AGENT_A, `delete from public.crm_proposals where id = '${id}'`)).toBe(0);
    expect(linha(id)).toBe("enviada|10000");
  });

  it("não troca o valor de uma enviada", () => {
    const id = criaComoServidor("enviada", 47803);
    expect(tenta(GOV_AGENT_A, `update public.crm_proposals set total_cents = 1 where id = '${id}'`)).toBe("recusado");
    expect(linha(id)).toBe("enviada|10000");
  });

  it("não devolve uma enviada a rascunho", () => {
    const id = criaComoServidor("enviada", 47804);
    expect(tenta(GOV_AGENT_A, `update public.crm_proposals set status = 'rascunho' where id = '${id}'`)).toBe("recusado");
  });

  it("não decide E muda o valor na mesma escrita", () => {
    const id = criaComoServidor("enviada", 47805);
    expect(
      tenta(GOV_AGENT_A, `update public.crm_proposals set status = 'aceita', total_cents = 1 where id = '${id}'`),
    ).toBe("recusado");
  });

  it("não se atribui número num rascunho (a numeração é do envio)", () => {
    const id = criaComoServidor("rascunho");
    expect(
      tenta(GOV_AGENT_A, `update public.crm_proposals set numero = 1, ano = 2026 where id = '${id}'`),
    ).toBe("recusado");
  });

  it("não cancela rascunho (só gestor)", () => {
    const id = criaComoServidor("rascunho");
    expect(tenta(GOV_AGENT_A, `update public.crm_proposals set status = 'cancelada' where id = '${id}'`)).toBe("recusado");
  });

  it("não põe item em proposta enviada", () => {
    const id = criaComoServidor("enviada", 47806);
    expect(
      tenta(
        GOV_AGENT_A,
        `insert into public.crm_proposal_items (organization_id, proposal_id, descricao, quantidade, preco_unitario_cents, position)
           values ('${GOV_ORG}', '${id}', 'item', 1, 100, 1)`,
      ),
    ).toBe(0);
  });
});

describe("gestor e servidor", () => {
  it("gestor cancela rascunho (DELETE /api/v1/proposals/[id])", () => {
    const id = criaComoServidor("rascunho");
    expect(tenta(GOV_MANAGER, `update public.crm_proposals set status = 'cancelada' where id = '${id}'`)).toBe(1);
  });

  it("gestor também não troca o valor de uma enviada pela API do banco", () => {
    const id = criaComoServidor("enviada", 47807);
    expect(tenta(GOV_MANAGER, `update public.crm_proposals set total_cents = 1 where id = '${id}'`)).toBe("recusado");
  });

  it("o servidor (chave de serviço) segue escrevendo: a guarda só age sobre a sessão do navegador", () => {
    const id = criaComoServidor("enviada", 47808);
    sql(`update public.crm_proposals set status = 'vencida' where id = '${id}';`);
    expect(linha(id)).toBe("vencida|10000");
  });
});
